import asyncio
import json
from typing import Dict, Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.ollama import is_running, list_models, OLLAMA_BASE

router = APIRouter(prefix="/ollama", tags=["ollama"])

# In-memory pull progress and task tracking
pull_progress: Dict[str, Dict[str, Any]] = {}
pull_tasks: Dict[str, asyncio.Task] = {}


class PullRequest(BaseModel):
    model: str


class DeleteRequest(BaseModel):
    model: str


def _get_system_ram_gb() -> int:
    try:
        import psutil
        return round(psutil.virtual_memory().total / (1024 ** 3))
    except Exception:
        return 0


@router.get("/status")
async def get_ollama_status():
    running = await is_running()
    ram_gb = _get_system_ram_gb()
    if not running:
        return {"running": False, "models": [], "system_ram_gb": ram_gb}
    try:
        models = await list_models()
        return {"running": True, "models": models, "system_ram_gb": ram_gb}
    except Exception as e:
        return {"running": True, "models": [], "system_ram_gb": ram_gb, "error": str(e)}


@router.get("/models")
async def get_models_detail():
    """Return full model list with size and metadata from Ollama /api/tags."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(f"{OLLAMA_BASE}/api/tags")
            res.raise_for_status()
            return res.json().get("models", [])
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/pull")
async def pull_model(req: PullRequest):
    model = req.model
    # Don't start if already in-flight
    if model in pull_tasks and not pull_tasks[model].done():
        return {"status": "already_downloading"}
    pull_progress[model] = {"status": "starting", "percent": 0, "speed": ""}
    task = asyncio.create_task(_do_pull(model))
    pull_tasks[model] = task
    return {"status": "started"}


@router.get("/pull-status/{model_name:path}")
async def get_pull_status(model_name: str):
    if model_name not in pull_progress:
        return {"status": "not_started", "percent": 0, "speed": ""}
    return pull_progress[model_name]


@router.post("/pull-cancel/{model_name:path}")
async def cancel_pull(model_name: str):
    if model_name in pull_tasks and not pull_tasks[model_name].done():
        pull_tasks[model_name].cancel()
    pull_progress[model_name] = {"status": "cancelled", "percent": 0, "speed": ""}
    return {"ok": True}


@router.delete("/delete")
async def delete_model(req: DeleteRequest):
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.request(
                "DELETE",
                f"{OLLAMA_BASE}/api/delete",
                json={"name": req.model},
            )
            if res.status_code not in (200, 204):
                raise HTTPException(status_code=res.status_code, detail="Delete failed")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


async def _do_pull(model: str) -> None:
    """Stream pull progress from Ollama and update pull_progress in-place."""
    layer_totals: Dict[str, int] = {}
    layer_completed: Dict[str, int] = {}

    try:
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                f"{OLLAMA_BASE}/api/pull",
                json={"name": model, "stream": True},
            ) as res:
                async for line in res.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        data = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    status = data.get("status", "")
                    digest = data.get("digest", "")
                    total = data.get("total", 0)
                    completed = data.get("completed", 0)

                    if digest and total:
                        layer_totals[digest] = total
                        if completed:
                            layer_completed[digest] = completed
                        overall_total = sum(layer_totals.values())
                        overall_done = sum(layer_completed.get(d, 0) for d in layer_totals)
                        percent = (overall_done / overall_total * 100) if overall_total else 0
                        pull_progress[model] = {
                            "status": "downloading",
                            "percent": round(percent, 1),
                            "speed": "",
                        }
                    elif status == "success":
                        pull_progress[model] = {"status": "complete", "percent": 100, "speed": ""}
                        return
                    elif status:
                        # Status-only lines: "pulling manifest", "verifying sha256 digest", etc.
                        pull_progress[model] = {
                            "status": status,
                            "percent": pull_progress.get(model, {}).get("percent", 0),
                            "speed": "",
                        }
    except asyncio.CancelledError:
        pull_progress[model] = {"status": "cancelled", "percent": 0, "speed": ""}
    except Exception as e:
        pull_progress[model] = {"status": "error", "percent": 0, "speed": "", "error": str(e)}
