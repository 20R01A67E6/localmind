import sys
import os

# When running as a PyInstaller one-file exe, _MEIPASS is the temp dir where
# everything is extracted. We insert it at the front of sys.path so that
# `import app` resolves to the bundled `app/` package, and chdir there so
# that any relative path lookups inside uvicorn's internals still work.
if getattr(sys, 'frozen', False):
    sys.path.insert(0, sys._MEIPASS)
    os.chdir(sys._MEIPASS)

import multiprocessing
import uvicorn

if __name__ == '__main__':
    multiprocessing.freeze_support()
    from app.main import app
    uvicorn.run(app, host='127.0.0.1', port=8000)
