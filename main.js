const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');

let mainWindow;
let splashWindow;
let backendProcess;
let backendLogStream;

const isDev = !app.isPackaged;
const BACKEND_URL = 'http://localhost:8000';
const FRONTEND_URL = 'http://localhost:5173';
const OLLAMA_URL = 'http://localhost:11434';

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
  const maxRetries = 20; // 20 × 500ms = 10 seconds
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
      if (retries >= maxRetries) reject(new Error('Backend failed to start after 10 seconds'));
      else setTimeout(check, retryDelay);
    };
    check();
  });
}

function freePort8000() {
  try {
    execSync(
      'for /f "tokens=5" %a in (\'netstat -ano ^| findstr :8000 ^| findstr LISTENING\') do taskkill /PID %a /F',
      { shell: 'cmd.exe', stdio: 'ignore' }
    );
    writeLog('[info] killed stale process on port 8000');
  } catch {
    // nothing was listening — that's fine
  }
}

async function startBackend() {
  openLogStream();
  freePort8000();
  await new Promise((r) => setTimeout(r, 500));

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

async function ensureOllama() {
  while (true) {
    const running = await pingURL(OLLAMA_URL);
    if (running) return;

    const { response } = await dialog.showMessageBox({
      type: 'warning',
      title: 'Ollama Not Detected',
      message: 'LocalMind needs Ollama to run local AI models.',
      detail: 'Please install Ollama and make sure it is running, then click retry.',
      buttons: ['Download Ollama', 'I have it, retry', 'Skip for now'],
      defaultId: 1,
      cancelId: 2,
    });

    if (response === 0) {
      await shell.openExternal('https://ollama.com/download');
    } else if (response === 2) {
      return;
    }
    // response === 1: loop and retry
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'default',
    title: 'LocalMind',
    backgroundColor: '#0f0f0f',
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    closeSplash();
    mainWindow.show();
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

    mainWindow.loadFile(indexPath);
  }
}

app.whenReady().then(async () => {
  createSplashWindow();
  await startBackend();

  try {
    await waitForBackend();
    console.log('[Electron] Backend ready');
  } catch (e) {
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

  await ensureOllama();
  await createWindow();
});

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  closeLogStream();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (backendProcess) backendProcess.kill();
  closeLogStream();
});
