from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class ConversationCreate(BaseModel):
    title: str = "New conversation"
    model_used: str = "llama3.1"


class ConversationOut(BaseModel):
    id: int
    title: str
    created_at: str
    updated_at: str
    model_used: str


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    role: str
    content: str
    files_attached: Optional[str] = None
    created_at: str


class FileAttachment(BaseModel):
    name: str
    type: str
    extracted_text: Optional[str] = None
    base64: Optional[str] = None


class ChatRequest(BaseModel):
    conversation_id: int
    message: str
    model: str = "llama3.1"
    system_prompt: str = "You are a helpful local AI assistant."
    files: List[FileAttachment] = []
    num_ctx: int = 8192


class ConversationRename(BaseModel):
    title: str
