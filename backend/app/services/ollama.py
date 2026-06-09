import httpx
import json
from typing import AsyncGenerator, List, Optional

OLLAMA_BASE = "http://localhost:11434"


async def list_models() -> List[str]:
    async with httpx.AsyncClient(timeout=5.0) as client:
        res = await client.get(f"{OLLAMA_BASE}/api/tags")
        res.raise_for_status()
        data = res.json()
        return [m["name"] for m in data.get("models", [])]


async def is_running() -> bool:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            res = await client.get(f"{OLLAMA_BASE}/api/tags")
            return res.status_code == 200
    except Exception:
        return False


async def stream_chat(
    model: str,
    messages: List[dict],
    system: Optional[str] = None,
    num_ctx: int = 8192,
) -> AsyncGenerator[str, None]:
    payload: dict = {
        "model": model,
        "messages": messages,
        "stream": True,
        "options": {"num_ctx": num_ctx},
    }
    if system:
        payload["system"] = system

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream("POST", f"{OLLAMA_BASE}/api/chat", json=payload) as res:
            res.raise_for_status()
            async for line in res.aiter_lines():
                if not line.strip():
                    continue
                try:
                    data = json.loads(line)
                    token = data.get("message", {}).get("content", "")
                    if token:
                        yield token
                    if data.get("done"):
                        break
                except json.JSONDecodeError:
                    continue
