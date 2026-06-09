import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.db import get_db
from app.models import ChatRequest
from app.services.ollama import stream_chat

router = APIRouter(prefix="/chat", tags=["chat"])


def _build_ollama_messages(history: list[dict], new_message: str, files: list) -> list[dict]:
    """Build the messages array for Ollama, injecting file context."""
    messages = []

    # Add conversation history
    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})

    # Build user content with file context
    content_parts = []

    # Inject extracted text from documents
    text_files = [f for f in files if f.extracted_text]
    if text_files:
        context_block = "\n\n".join(
            f"=== File: {f.name} ===\n{f.extracted_text}" for f in text_files
        )
        content_parts.append(f"[Attached files context]\n{context_block}\n\n---\n")

    content_parts.append(new_message)
    full_content = "".join(content_parts)

    user_msg: dict = {"role": "user", "content": full_content}

    # For vision models, add images
    image_files = [f for f in files if f.base64]
    if image_files:
        user_msg["images"] = [f.base64 for f in image_files]

    messages.append(user_msg)
    return messages


async def _auto_title(db, conv_id: int, first_message: str, model: str) -> str:
    """Generate a short title from the first user message."""
    # Simple heuristic: take first ~50 chars of message
    title = first_message.strip()[:60]
    if len(first_message) > 60:
        title = title.rsplit(" ", 1)[0] + "…"
    await db.execute(
        "UPDATE conversations SET title = ?, model_used = ? WHERE id = ?",
        (title, model, conv_id),
    )
    await db.commit()
    cursor = await db.execute("SELECT * FROM conversations WHERE id = ?", (conv_id,))
    row = await cursor.fetchone()
    return dict(row) if row else {}


@router.post("/stream")
async def chat_stream(req: ChatRequest):
    async def event_generator():
        db = await get_db()
        try:
            # Fetch conversation history
            cursor = await db.execute(
                "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
                (req.conversation_id,),
            )
            history = [dict(r) for r in await cursor.fetchall()]

            # Check if this is the first user message (for auto-title)
            is_first = len([m for m in history if m["role"] == "user"]) == 0

            # Persist user message
            files_json = json.dumps([f.name for f in req.files]) if req.files else None
            await db.execute(
                "INSERT INTO messages (conversation_id, role, content, files_attached) VALUES (?, 'user', ?, ?)",
                (req.conversation_id, req.message, files_json),
            )
            await db.execute(
                "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (req.conversation_id,),
            )
            await db.commit()

            # Build Ollama messages
            ollama_messages = _build_ollama_messages(history, req.message, req.files)

            # Stream from Ollama
            full_response = ""
            try:
                async for token in stream_chat(req.model, ollama_messages, req.system_prompt, req.num_ctx):
                    full_response += token
                    yield f"data: {json.dumps({'token': token})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                return

            # Persist assistant message
            await db.execute(
                "INSERT INTO messages (conversation_id, role, content) VALUES (?, 'assistant', ?)",
                (req.conversation_id, full_response),
            )
            await db.execute(
                "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (req.conversation_id,),
            )
            await db.commit()

            # Auto-generate title on first message
            if is_first:
                conv = await _auto_title(db, req.conversation_id, req.message, req.model)
                yield f"data: {json.dumps({'conversation': conv})}\n\n"

            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            await db.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
