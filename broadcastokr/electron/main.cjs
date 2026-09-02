const { app, BrowserWindow, Menu, shell, ipcMain, safeStorage } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const { appendFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } = require('fs');
const { randomBytes } = require('crypto');

// Keep a global reference so the window isn't garbage collected
let mainWindow = null;
let bridgeProcess = null;

const isDev = !app.isPackaged;
// In a packaged build this path points inside app.asar; Electron's fork()
// children get asar support, and module resolution must start inside the
// archive to reach node_modules (verified: from app.asar.unpacked it cannot).
const BRIDGE_SCRIPT = path.join(__dirname, '..', 'bridge', 'server.cjs');

/**
 * Provide the bridge's credential-encryption key on desktop.
 *
 * The key otherwise comes from an environment variable, which a desktop user
 * has no way to set — so every desktop install stored WHATS'ON passwords in
 * cleartext forever. The app generates one on first run instead, and the bridge
 * encrypts stored credentials from that point on (re-wrapping any that were
 * already written in the clear).
 *
 * Where the key itself lives is the whole question. Where the OS offers a
 * keychain, `safeStorage` binds it to the user account, so copying the file off
 * the machine yields nothing. Without one, a 0600 file beside the database is
 * still better than the alternative — it raises "read the config" from
 * "open a JSON file" to "read two files as this user" — and we say so rather
 * than implying protection we do not have.
 */
function credentialKey() {
  const dataDir = path.join(app.getPath('userData'), 'bridge');
  const keyFile = path.join(dataDir, 'credential-key');
  mkdirSync(dataDir, { recursive: true });

  const sealed = safeStorage.isEncryptionAvailable?.();
  try {
    if (existsSync(keyFile)) {
      const raw = readFileSync(keyFile);
      return sealed ? safeStorage.decryptString(raw) : raw.toString('utf8').trim();
    }
  } catch (err) {
    // An unreadable key is not recoverable — a new one cannot decrypt what the
    // old one wrote. Say so plainly instead of silently minting a replacement.
    console.error(`[bridge] Stored credential key could not be read (${err.message}). `
      + 'Existing database passwords will need re-entering.');
  }

  const key = randomBytes(32).toString('hex');
  try {
    writeFileSync(keyFile, sealed ? safeStorage.encryptString(key) : key, { mode: 0o600 });
  } catch (err) {
    console.error(`[bridge] Could not persist the credential key: ${err.message}`);
  }
  return key;
}

// Packaged builds must write DB/config/history/logs to userData — the install
// directory (asar) is read-only.
function bridgeEnv() {
  if (isDev) return { ...process.env, BRIDGE_PORT: '3001' };
  const dataDir = path.join(app.getPath('userData'), 'bridge');
  return {
    ...process.env,
    BRIDGE_PORT: '3001',
    BRIDGE_DB_PATH: path.join(dataDir, 'broadcastokr.db'),
    BRIDGE_CONFIG_PATH: path.join(dataDir, 'config.json'),
    BRIDGE_HISTORY_PATH: path.join(dataDir, 'kpi-history.json'),
    BRIDGE_LOG_DIR: path.join(dataDir, 'logs'),
    BRIDGE_BACKUP_DIR: path.join(dataDir, 'backups'),
    // Only supply ours if the operator has not set one themselves.
    BRIDGE_ENCRYPTION_KEY: process.env.BRIDGE_ENCRYPTION_KEY || credentialKey(),
  };
}

/** Split captured output into lines regardless of the child's line endings. */
const LINE_SPLIT = /[\r\n]+/;

/** Where the bridge's own output is teed, so a startup crash is recoverable. */
function bridgeLogPath() {
  const dir = path.join(app.getPath('userData'), 'bridge', 'logs');
  mkdirSync(dir, { recursive: true });
  return path.join(dir, 'bridge-process.log');
}

/**
 * Turn the child's dying words into something a user can act on. The native
 * module mismatch is worth naming explicitly: its stack is long, its cause is
 * a build-order mistake, and its fix is a documented command.
 */
function summarizeBridgeFailure(output, code) {
  if (/NODE_MODULE_VERSION|ERR_DLOPEN_FAILED/.test(output)) {
    return 'The bridge could not load its database module — it was built for a different '
      + 'runtime. Reinstall the app, or run "npm run rebuild:electron" if running from source.';
  }
  if (/EADDRINUSE/.test(output)) {
    return 'Port 3001 is already in use — another bridge is probably still running.';
  }
  const lastLine = output.trim().split(LINE_SPLIT).filter(Boolean).pop();
  return lastLine ? `Bridge exited (${code}): ${lastLine.slice(0, 200)}` : `Bridge exited with code ${code}`;
}

// ── Bridge Process Management ──

function startBridge() {
  if (bridgeProcess) return { ok: true, message: 'Bridge already running' };

  try {
    if (!isDev) {
      require('fs').mkdirSync(path.join(app.getPath('userData'), 'bridge'), { recursive: true });
    }
    bridgeProcess = fork(BRIDGE_SCRIPT, [], {
      env: bridgeEnv(),
      silent: true,
    });

    // A packaged app has no console, so piping the child's output to one loses
    // exactly the message needed when it dies on startup (an ABI mismatch on
    // better-sqlite3 kills it before it can write anything of its own). Tee it
    // to a file next to the other bridge data, and keep the tail in memory so
    // the exit handler can tell the renderer *why* it stopped.
    let lastOutput = '';
    const record = (text) => {
      lastOutput = `${lastOutput}${text}`.slice(-4000);
      try {
        appendFileSync(bridgeLogPath(), text);
      } catch { /* logging must never take the app down */ }
    };

    bridgeProcess.stdout?.on('data', (data) => {
      const text = data.toString();
      console.log(`[bridge] ${text.trim()}`);
      record(text);
    });

    bridgeProcess.stderr?.on('data', (data) => {
      const text = data.toString();
      console.error(`[bridge] ${text.trim()}`);
      record(text);
    });

    bridgeProcess.on('exit', (code) => {
      console.log(`[bridge] Process exited with code ${code}`);
      bridgeProcess = null;
      // A non-zero exit within moments of starting is a crash, not a stop.
      const error = code === 0 ? undefined : summarizeBridgeFailure(lastOutput, code);
      mainWindow?.webContents.send('bridge:status', { running: false, error });
    });

    bridgeProcess.on('error', (err) => {
      console.error(`[bridge] Error: ${err.message}`);
      bridgeProcess = null;
      mainWindow?.webContents.send('bridge:status', { running: false, error: err.message });
    });

    // Give it a moment to start, then notify renderer
    setTimeout(() => {
      if (bridgeProcess) {
        mainWindow?.webContents.send('bridge:status', { running: true });
      }
    }, 1000);

    return { ok: true, message: 'Bridge starting...' };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

function stopBridge() {
  if (!bridgeProcess) return { ok: true, message: 'Bridge not running' };

  try {
    bridgeProcess.kill('SIGTERM');
    bridgeProcess = null;
    return { ok: true, message: 'Bridge stopped' };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

function getBridgeStatus() {
  return { running: bridgeProcess !== null };
}

// ── IPC Handlers ──

ipcMain.handle('bridge:start', () => startBridge());
ipcMain.handle('bridge:stop', () => stopBridge());
ipcMain.handle('bridge:status', () => getBridgeStatus());

// ── Window Creation ──

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'BroadcastOKR',
    icon: path.join(__dirname, '..', 'public', 'icon.ico'),
    backgroundColor: '#0B0F19',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
    titleBarStyle: 'default',
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Open external links in the default browser (only http/https)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Application menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.webContents.reload(),
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'Alt+F4',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        ...(isDev ? [
          { type: 'separator' },
          {
            label: 'Toggle DevTools',
            accelerator: 'F12',
            click: () => mainWindow?.webContents.toggleDevTools(),
          },
        ] : []),
      ],
    },
    {
      label: 'Bridge',
      submenu: [
        {
          label: 'Start Bridge Service',
          click: () => {
            const result = startBridge();
            if (!result.ok) {
              const { dialog } = require('electron');
              dialog.showErrorBox('Bridge Error', result.message);
            }
          },
        },
        {
          label: 'Stop Bridge Service',
          click: () => stopBridge(),
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About BroadcastOKR',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About BroadcastOKR',
              message: 'BroadcastOKR',
              detail: `Version ${app.getVersion()}\n\nBroadcast Operations OKR Management Platform\nfor Mediagenix AIR Platform`,
            });
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  createMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Kill bridge on quit
app.on('before-quit', () => {
  stopBridge();
});
