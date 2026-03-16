const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');
const { fork } = require('child_process');

// Keep a global reference so the window isn't garbage collected
let mainWindow = null;
let bridgeProcess = null;

const isDev = !app.isPackaged;
const BRIDGE_SCRIPT = path.join(__dirname, '..', 'bridge', 'server.cjs');

// ── Bridge Process Management ──

function startBridge() {
  if (bridgeProcess) return { ok: true, message: 'Bridge already running' };

  try {
    bridgeProcess = fork(BRIDGE_SCRIPT, [], {
      env: { ...process.env, BRIDGE_PORT: '3001' },
      silent: true,
    });

    bridgeProcess.stdout?.on('data', (data) => {
      console.log(`[bridge] ${data.toString().trim()}`);
    });

    bridgeProcess.stderr?.on('data', (data) => {
      console.error(`[bridge] ${data.toString().trim()}`);
    });

    bridgeProcess.on('exit', (code) => {
      console.log(`[bridge] Process exited with code ${code}`);
      bridgeProcess = null;
      mainWindow?.webContents.send('bridge:status', { running: false });
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

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
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
        { type: 'separator' },
        {
          label: 'Toggle DevTools',
          accelerator: 'F12',
          click: () => mainWindow?.webContents.toggleDevTools(),
        },
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
