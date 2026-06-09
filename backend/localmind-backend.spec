# -*- mode: python ; coding: utf-8 -*-
# Run from the backend/ directory:
#   pyinstaller localmind-backend.spec --distpath dist --workpath build

import sys
import os

# Let PyInstaller's analyser resolve `from app.xxx import ...` during the build.
# os.path.abspath('.') equals the backend/ dir when the spec is run via
# `cd backend && pyinstaller localmind-backend.spec`.
_BACKEND_DIR = os.path.abspath('.')
sys.path.insert(0, _BACKEND_DIR)

a = Analysis(
    ['server.py'],
    pathex=[_BACKEND_DIR],
    binaries=[],
    # Bundle the entire app/ package as raw files so that the frozen sys.path
    # patch in server.py can import it at runtime without byte-code surprises.
    datas=[('app', 'app')],
    hiddenimports=[
        # uvicorn core
        'uvicorn.logging',
        'uvicorn._types',
        # event loops
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        'uvicorn.loops.uvloop',
        # HTTP protocols
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.http.httptools_impl',
        # WebSocket protocols
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.protocols.websockets.websockets_impl',
        'uvicorn.protocols.websockets.wsproto_impl',
        # lifespan
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'uvicorn.lifespan.off',
        # async
        'anyio',
        'anyio._backends._asyncio',
        'anyio._backends._trio',
        'sniffio',
        # FastAPI / Starlette
        'fastapi',
        'fastapi.middleware.cors',
        'starlette.routing',
        'starlette.middleware.cors',
        'starlette.staticfiles',
        'starlette.responses',
        # database
        'aiosqlite',
        'aiofiles',
        # HTTP client
        'httpx',
        'h11',
        'h2',
        # file parsing
        'PyPDF2',
        'docx',
        'PIL',
        'PIL.Image',
        # multipart / form handling
        'multipart',
        'python_multipart',
        # email (stdlib, missed by PyInstaller)
        'email.mime.text',
        'email.mime.multipart',
        'email.mime.application',
        # system
        'psutil',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='localmind-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
