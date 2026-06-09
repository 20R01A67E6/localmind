const { app, BrowserWindow, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');

const FATAL_LOG = path.join(os.homedir(), 'localmind-fatal.log');

process.on('uncaughtException', (e) => {
  fs.appendFileSync(FATAL_LOG, `[${new Date().toISOString()}] uncaughtException:\n${e.stack}\n\n`);
});

let mainWindow;
let splashWindow;
let backendProcess;
let backendLogStream;

const isDev = !app.isPackaged;
const BACKEND_URL = 'http://127.0.0.1:8000';
const FRONTEND_URL = 'http://localhost:5173';
const OLLAMA_URL = 'http://127.0.0.1:11434';

function getLogPath() {
  return path.join(app.getPath('userData'), 'backend.log');
}

function openLogStream() {
  const logPath = getLogPath();
  backendLogStream = fs.createWriteStream(logPath, { flags: 'w' });
  backendLogStream.write(`=== LocalMind Backend Log — ${new Date().toISOString()} ===\n`);
}

function writeLog(line) {
  if (backendLogStream && !backendLogStream.closed) backendLogStream.write(line + '\n');
}

function closeLogStream() {
  if (backendLogStream && !backendLogStream.closed) backendLogStream.end();
}

function readLastLogLines(n = 40) {
  try {
    // Flush any pending writes before reading
    if (backendLogStream && !backendLogStream.closed) backendLogStream.write('');
    const content = fs.readFileSync(getLogPath(), 'utf8');
    const lines = content.split('\n').filter(Boolean);
    return lines.slice(-n).join('\n') || '(log is empty)';
  } catch {
    return '(log not available)';
  }
}

function pingURL(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode < 500);
    }).on('error', () => resolve(false));
  });
}

function waitForBackend() {
  const maxRetries = 40; // 40 × 500ms = 20 seconds
  const retryDelay = 500;
  return new Promise((resolve, reject) => {
    let retries = 0;
    const check = () => {
      http.get(`${BACKEND_URL}/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else retry();
      }).on('error', retry);
    };
    const retry = () => {
      retries++;
      if (retries >= maxRetries) reject(new Error('Backend failed to start after 20 seconds'));
      else setTimeout(check, retryDelay);
    };
    check();
  });
}

async function freePort8000() {
  try {
    execSync(
      'for /f "tokens=5" %a in (\'netstat -ano ^| findstr ":8000 " ^| findstr LISTENING\') do taskkill /PID %a /F',
      { shell: 'cmd.exe', stdio: 'ignore' }
    );
    writeLog('[info] killed stale process on port 8000');
  } catch {
    // nothing was listening
  }

  // Poll until the port is actually free (up to 3 s)
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      execSync('netstat -ano | findstr ":8000 " | findstr LISTENING',
        { shell: 'cmd.exe', stdio: 'ignore' });
      writeLog('[info] port 8000 still busy, waiting...');
    } catch {
      writeLog('[info] port 8000 is free');
      return;
    }
  }
  writeLog('[warn] port 8000 may still be in use after 3s');
}

async function startBackend() {
  await freePort8000();

  if (isDev) {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const backendDir = path.join(__dirname, '..', 'backend');
    backendProcess = spawn(
      pythonCmd,
      ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8000'],
      { cwd: backendDir, stdio: ['ignore', 'pipe', 'pipe'], shell: true }
    );
  } else {
    const backendPath = path.join(process.resourcesPath, 'localmind-backend.exe');
    const dbPath = path.join(app.getPath('userData'), 'localmind.db');
    writeLog(`[info] exe path: ${backendPath}`);
    writeLog(`[info] db path:  ${dbPath}`);
    backendProcess = spawn(backendPath, [], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, LOCALMIND_DB: dbPath },
    });
  }

  backendProcess.stdout.on('data', (d) => {
    const line = d.toString().trimEnd();
    console.log('[Backend]', line);
    writeLog(`[stdout] ${line}`);
  });

  backendProcess.stderr.on('data', (d) => {
    const line = d.toString().trimEnd();
    console.error('[Backend ERR]', line);
    writeLog(`[stderr] ${line}`);
  });

  backendProcess.on('close', (code) => {
    console.log('[Backend] exited with code', code);
    writeLog(`[exit] code=${code}`);
    closeLogStream();
  });
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 280,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    backgroundColor: '#0f0f0f',
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

async function installOllama() {
  const tempPath = path.join(app.getPath('temp'), 'OllamaSetup.exe');

  const progressWin = new BrowserWindow({
    width: 400,
    height: 200,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    backgroundColor: '#0f0f0f',
  });

  const html = `<!DOCTYPE html><html>
    <body style="background:#0f0f0f;color:#e8e8e8;font-family:sans-serif;
                 display:flex;align-items:center;justify-content:center;
                 height:100vh;margin:0;user-select:none">
      <div style="text-align:center">
        <div style="font-size:18px;font-weight:bold;color:#d4a843;margin-bottom:8px">LocalMind</div>
        <div id="status" style="font-size:14px;margin-bottom:16px">Downloading Ollama...</div>
        <div style="background:#2a2a2a;border-radius:8px;height:8px;width:300px">
          <div id="bar" style="background:#d4a843;height:8px;border-radius:8px;width:0%;transition:width 0.3s"></div>
        </div>
        <div id="pct" style="font-size:12px;color:#606060;margin-top:8px">0%</div>
      </div>
    </body></html>`;
  await progressWin.loadURL(`data:text/html,${encodeURIComponent(html)}`);

  writeLog('[info] downloading OllamaSetup.exe');
  await new Promise((resolve, reject) => {
    function download(url) {
      https.get(url, { headers: { 'User-Agent': 'LocalMind' } }, (res) => {
        // Follow redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          download(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        const total = parseInt(res.headers['content-length'], 10) || 0;
        let downloaded = 0;
        const file = fs.createWriteStream(tempPath);
        res.on('data', (chunk) => {
          downloaded += chunk.length;
          const pct = total ? Math.round((downloaded / total) * 100) : 0;
          progressWin.webContents.executeJavaScript(
            `document.getElementById('bar').style.width='${pct}%';` +
            `document.getElementById('pct').textContent='${pct}%';`
          ).catch(() => {});
        });
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', reject);
      }).on('error', reject);
    }
    download('https://ollama.com/download/OllamaSetup.exe');
  });

  writeLog('[info] download complete, running installer');
  progressWin.webContents.executeJavaScript(
    `document.getElementById('status').textContent='Installing Ollama...';` +
    `document.getElementById('bar').style.width='100%';`
  ).catch(() => {});

  await new Promise((resolve, reject) => {
    const installer = spawn(tempPath, ['/SILENT'], { detached: true, stdio: 'ignore' });
    installer.unref();
    installer.on('close', resolve);
    installer.on('error', reject);
  });

  writeLog('[info] installer finished, starting ollama serve');
  progressWin.webContents.executeJavaScript(
    `document.getElementById('status').textContent='Starting Ollama...';`
  ).catch(() => {});

  await new Promise((r) => setTimeout(r, 3000));
  // Suppress Ollama's startup tray icon entry that the installer adds
  try {
    execSync('reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "Ollama" /f /d ""',
      { shell: 'cmd.exe', stdio: 'ignore' });
  } catch {}
  spawn('ollama', ['serve'], { detached: true, shell: true, stdio: 'ignore', windowsHide: true });
  await new Promise((r) => setTimeout(r, 2000));

  progressWin.close();
  writeLog('[info] Ollama install flow complete');
}

async function ensureOllama() {
  const running = await pingURL(OLLAMA_URL);
  if (running) return;

  // Ollama is installed but not running — start it silently
  let ollamaInstalled = false;
  try {
    execSync('where ollama', { shell: 'cmd.exe', stdio: 'ignore' });
    ollamaInstalled = true;
  } catch { /* not installed */ }

  if (ollamaInstalled) {
    writeLog('[info] Ollama installed but not running — auto-starting');
    spawn('cmd', [
      '/c', 'start', '/min', 'ollama', 'serve'
    ], { detached: true, shell: false, stdio: 'ignore' });
    // Wait up to 5 seconds for it to come up
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await pingURL(OLLAMA_URL)) {
        writeLog('[info] Ollama started successfully');
        return;
      }
    }
    writeLog('[warn] Ollama did not respond after auto-start');
    return;
  }

  const { response } = await dialog.showMessageBox({
    type: 'info',
    title: 'Ollama Required',
    message: 'LocalMind needs Ollama to run AI models.',
    detail: 'Ollama is a free tool that runs AI models locally on your machine.\n\nWould you like LocalMind to install it automatically? (~100MB)',
    buttons: ['Install Automatically', 'Install Manually', 'Skip'],
    defaultId: 0,
  });

  if (response === 0) {
    try {
      await installOllama();
      await new Promise((r) => setTimeout(r, 2000));
      const working = await pingURL(OLLAMA_URL);
      if (!working) {
        dialog.showErrorBox('Installation Issue',
          'Ollama was installed but may need a restart. Please restart LocalMind.');
        app.quit();
      }
    } catch (e) {
      writeLog('[error] Ollama auto-install failed: ' + e.message);
      dialog.showErrorBox('Install Failed',
        'Automatic installation failed.\n\nPlease install Ollama manually from ollama.com/download');
      shell.openExternal('https://ollama.com/download');
    }
  } else if (response === 1) {
    await shell.openExternal('https://ollama.com/download');
    app.quit();
  }
  // response === 2: Skip — continue without Ollama
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: false,
    titleBarStyle: 'hidden',
    title: 'LocalMind',
    backgroundColor: '#0f0f0f',
    show: false,
  });

  mainWindow.once('ready-to-show', async () => {
    // Fade out splash over ~300ms (10 steps × 30ms)
    if (splashWindow && !splashWindow.isDestroyed()) {
      for (let i = 10; i >= 0; i--) {
        splashWindow.setOpacity(i / 10);
        await new Promise((r) => setTimeout(r, 30));
      }
      splashWindow.close();
      splashWindow = null;
    }
    // Fade in main window over ~200ms (10 steps × 20ms)
    mainWindow.setOpacity(0);
    mainWindow.show();
    for (let i = 0; i <= 10; i++) {
      mainWindow.setOpacity(i / 10);
      await new Promise((r) => setTimeout(r, 20));
    }
    mainWindow.setOpacity(1); // guarantee full opacity
  });

  if (isDev) {
    mainWindow.loadURL(FRONTEND_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      writeLog(`[error] Failed to load frontend: ${errorCode} ${errorDescription}`);
      writeLog(`[error] Tried path: ${indexPath}`);
      dialog.showErrorBox('Load Error', `Failed to load UI: ${errorDescription}\nPath: ${indexPath}`);
    });

    mainWindow.loadFile(indexPath).catch(() => {
      const fallback = 'file://' + indexPath.replace(/\\/g, '/');
      writeLog(`[info] loadFile failed, trying: ${fallback}`);
      mainWindow.loadURL(fallback);
    });
  }
}

app.whenReady().then(async () => {
  try {
    openLogStream();
    writeLog('[info] app ready');

    createSplashWindow();
    writeLog('[info] splash created');

    await startBackend();
    writeLog('[info] backend spawned');

    try {
      await waitForBackend();
      writeLog('[info] backend ready');
    } catch (e) {
      writeLog('[error] backend wait failed: ' + e.message);
      closeSplash();
      const logSnippet = readLastLogLines(40);
      const logPath = getLogPath();
      await dialog.showMessageBox({
        type: 'error',
        title: 'Backend Failed to Start',
        message: 'LocalMind backend failed to start.',
        detail: [
          e.message,
          '',
          `Log file: ${logPath}`,
          '─'.repeat(40),
          logSnippet,
        ].join('\n'),
        buttons: ['Quit'],
      });
      app.quit();
      return;
    }

    writeLog('[info] calling createWindow');
    await createWindow();
    writeLog('[info] window created');

    writeLog('[info] calling ensureOllama');
    await ensureOllama();
    writeLog('[info] ollama checked — startup complete');

  } catch (e) {
    const msg = e.message + '\n' + e.stack;
    writeLog('[fatal] ' + msg);
    fs.appendFileSync(FATAL_LOG, `[${new Date().toISOString()}] fatal in whenReady:\n${msg}\n\n`);
    dialog.showErrorBox('Fatal Error', e.message + '\n\n' + e.stack);
  }
}).catch((e) => {
  fs.appendFileSync(FATAL_LOG, `[${new Date().toISOString()}] whenReady rejected:\n${e.stack}\n\n`);
});

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());

function killOllama() {
  try { execSync('taskkill /IM llama-server.exe /F', { shell: 'cmd.exe', stdio: 'ignore' }); } catch {}
  try { execSync('taskkill /IM ollama.exe /F', { shell: 'cmd.exe', stdio: 'ignore' }); } catch {}
  try { execSync('taskkill /IM "ollama app.exe" /F', { shell: 'cmd.exe', stdio: 'ignore' }); } catch {}
  writeLog('[info] ollama killed on quit');
}

app.on('window-all-closed', () => {
  killOllama();
  if (backendProcess) backendProcess.kill();
  closeLogStream();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  killOllama();
  if (backendProcess) backendProcess.kill();
  closeLogStream();
});
