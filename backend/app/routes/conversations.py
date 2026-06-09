from fastapi import APIRouter, HTTPException
from typing import List
from app.db import get_db
from app.models import ConversationCreate, ConversationOut, MessageOut, ConversationRename

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=List[ConversationOut])
async def list_conversations():
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM conversations ORDER BY updated_at DESC"
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


@router.post("", response_model=ConversationOut)
async def create_conversation(body: ConversationCreate):
    db = await get_db()
    try:
        cursor = await db.execute(
            "INSERT INTO conversations (title, model_used) VALUES (?, ?) RETURNING *",
            (body.title, body.model_used),
        )
        row = await cursor.fetchone()
        await db.commit()
        return dict(row)
    finally:
        await db.close()


@router.get("/{conv_id}/messages", response_model=List[MessageOut])
async def get_messages(conv_id: int):
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
            (conv_id,),
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        await db.close()


@router.patch("/{conv_id}", response_model=ConversationOut)
async def rename_conversation(conv_id: int, body: ConversationRename):
    db = await get_db()
    try:
        cursor = await db.execute(
            "UPDATE conversations SET title = ? WHERE id = ? RETURNING *",
            (body.title, conv_id),
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Conversation not found")
        await db.commit()
        return dict(row)
    finally:
        await db.close()


@router.delete("/{conv_id}/messages/from/{msg_id}")
async def delete_messages_from(conv_id: int, msg_id: int):
    db = await get_db()
    try:
        await db.execute(
            "DELETE FROM messages WHERE conversation_id = ? AND id >= ?",
            (conv_id, msg_id),
        )
        await db.commit()
        return {"ok": True}
    finally:
        await db.close()


@router.delete("/{conv_id}")
async def delete_conversation(conv_id: int):
    db = await get_db()
    try:
        await db.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
        await db.commit()
        return {"ok": True}
    finally:
        await db.close()


@router.delete("/all")
async def delete_all_conversations():
    db = await get_db()
    try:
        await db.execute("DELETE FROM conversations")
        await db.execute("DELETE FROM messages")
        await db.commit()
        return {"ok": True}
    finally:
        await db.close()
