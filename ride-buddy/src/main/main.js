/*
 * Ride Buddy — 바탕화면을 바이크로 돌아다니며 알림을 읽어주는 캐릭터
 * 메인 프로세스: 투명 오버레이 창, 트레이 메뉴, 알림 수집(로컬 API / Windows 알림센터)
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, shell } = require('electron');
const path = require('path');
const config = require('./config');
const httpServer = require('./http-server');
const { describeApp } = require('./app-names');
const { WindowsNotificationWatcher } = require('./watchers/windows-notifications');

const ASSETS = path.join(__dirname, '..', '..', 'assets');
const SIZE_PX = { s: 110, m: 150, l: 200 };   // 캐릭터 가로 폭(DIP)
const BUBBLE_SPACE = 210;                       // 말풍선이 들어갈 위쪽 여백

if (process.platform === 'linux') app.commandLine.appendSwitch('enable-transparent-visuals');
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let tray = null;
let wpn = null;
let server = null;
let seq = 0;
const recent = new Map(); // 중복 알림 방지

function charHeight(w) { return Math.round(w * 630 / 440); }

function overlayBounds() {
  const cfg = config.load();
  const { workArea } = screen.getPrimaryDisplay();
  const h = Math.min(workArea.height, Math.round(charHeight(SIZE_PX[cfg.size] || 150) * 1.15) + BUBBLE_SPACE);
  return { x: workArea.x, y: workArea.y + workArea.height - h, width: workArea.width, height: h };
}

function createWindow() {
  win = new BrowserWindow({
    ...overlayBounds(),
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.showInactive());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
}

function relayout() {
  if (!win) return;
  win.setBounds(overlayBounds());
  win.webContents.send('config', config.load());
}

// ---------------------------------------------------------------- 알림 처리
function notify(raw) {
  const cfg = config.load();
  const title = String(raw.title || '').slice(0, 200);
  const body = String(raw.body || '').slice(0, 500);
  const appInfo = describeApp(raw.app || (raw.source === 'http' ? '알림' : ''));

  if (cfg.mutedApps.some(m => m && (appInfo.name.includes(m) || String(raw.app || '').includes(m)))) return;

  const key = `${appInfo.name}|${title}|${body}`;
  const now = Date.now();
  if (recent.has(key) && now - recent.get(key) < 3000) return;
  recent.set(key, now);
  for (const [k, t] of recent) if (now - t > 60000) recent.delete(k);

  const payload = { id: ++seq, app: appInfo.name, icon: appInfo.icon, color: appInfo.color, ink: appInfo.ink, title, body, time: now, source: raw.source };
  win?.webContents.send('notify', payload);
}

const SAMPLES = [
  { app: 'KakaoTalk', title: '엄마', body: '밥은 먹었니? 오늘 일찍 들어와~' },
  { app: 'Outlook', title: '회의 일정 변경', body: '내일 오전 10시 → 오후 2시로 변경되었습니다.' },
  { app: 'Slack', title: '#dev-배포', body: 'v1.4.0 프로덕션 배포 완료 🎉' },
  { app: 'Calendar', title: '10분 후 일정', body: '팀 스탠드업 미팅 (회의실 B)' },
  { app: 'Discord', title: '라이더 클럽', body: '이번 주말 남한산성 투어 가실 분?' },
];
function sendTest() {
  notify({ ...SAMPLES[Math.floor(Math.random() * SAMPLES.length)], source: 'test' });
}

// ---------------------------------------------------------------- Windows 알림 연동
function applyWatcher() {
  const cfg = config.load();
  if (cfg.windowsWatcher && process.platform === 'win32') {
    if (!wpn) {
      wpn = new WindowsNotificationWatcher(n => notify(n));
      wpn.start();
    }
  } else if (wpn) {
    wpn.stop();
    wpn = null;
  }
}

// ---------------------------------------------------------------- 트레이
function trayIcon() {
  const img = nativeImage.createFromPath(path.join(ASSETS, process.platform === 'win32' ? 'tray@2x.png' : 'tray.png'));
  return img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16, quality: 'best' });
}

function buildMenu() {
  const cfg = config.load();
  const set = patch => { config.save(patch); relayout(); buildMenu(); };
  const watcherLabel = () => {
    if (process.platform !== 'win32') return 'Windows 알림 센터 연동 (Windows 전용)';
    const st = wpn?.status;
    const tail = st === 'running' ? ' ✅' : st && st !== 'stopped' ? ` ⚠️(${st})` : '';
    return 'Windows 알림 센터 연동' + tail;
  };

  const menu = Menu.buildFromTemplate([
    { label: '🏍️  Ride Buddy', enabled: false },
    { type: 'separator' },
    { label: '테스트 알림 보내기', click: sendTest },
    { label: '마지막 알림 다시 듣기', click: () => win?.webContents.send('command', 'replay') },
    { type: 'separator' },
    { label: '이동 멈춤', type: 'checkbox', checked: cfg.paused, click: i => set({ paused: i.checked }) },
    { label: '방해 금지 (졸기 모드)', type: 'checkbox', checked: cfg.dnd, click: i => set({ dnd: i.checked }) },
    { label: '알림음 (빵빵!)', type: 'checkbox', checked: cfg.sound, click: i => set({ sound: i.checked }) },
    { label: '메시지 내용 표시', type: 'checkbox', checked: cfg.showBody, click: i => set({ showBody: i.checked }) },
    {
      label: '크기', submenu: [
        { label: '작게', type: 'radio', checked: cfg.size === 's', click: () => set({ size: 's' }) },
        { label: '보통', type: 'radio', checked: cfg.size === 'm', click: () => set({ size: 'm' }) },
        { label: '크게', type: 'radio', checked: cfg.size === 'l', click: () => set({ size: 'l' }) },
      ],
    },
    {
      label: '이동 속도', submenu: [
        { label: '느긋하게', type: 'radio', checked: cfg.speed === 0.5, click: () => set({ speed: 0.5 }) },
        { label: '보통', type: 'radio', checked: cfg.speed === 1, click: () => set({ speed: 1 }) },
        { label: '씽씽', type: 'radio', checked: cfg.speed === 1.8, click: () => set({ speed: 1.8 }) },
      ],
    },
    { type: 'separator' },
    {
      label: watcherLabel(), type: 'checkbox', checked: cfg.windowsWatcher, enabled: process.platform === 'win32',
      click: i => { config.save({ windowsWatcher: i.checked }); applyWatcher(); buildMenu(); },
    },
    { label: `로컬 알림 API: 127.0.0.1:${cfg.httpPort}`, enabled: false },
    {
      label: '로그인 시 자동 실행', type: 'checkbox', enabled: process.platform !== 'linux',
      checked: process.platform !== 'linux' && app.getLoginItemSettings().openAtLogin,
      click: i => app.setLoginItemSettings({ openAtLogin: i.checked }),
    },
    { label: '설정 폴더 열기', click: () => shell.openPath(app.getPath('userData')) },
    { type: 'separator' },
    { label: '종료', role: 'quit' },
  ]);
  tray?.setContextMenu(menu);
  return menu;
}

// ---------------------------------------------------------------- IPC
ipcMain.on('set-interactive', (_e, on) => {
  if (!win) return;
  if (on) win.setIgnoreMouseEvents(false);
  else win.setIgnoreMouseEvents(true, { forward: true });
});
ipcMain.on('context-menu', () => buildMenu().popup({ window: win }));
ipcMain.handle('get-config', () => config.load());

// ---------------------------------------------------------------- 시작
app.on('second-instance', () => sendTest());
app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.hide();
  createWindow();
  tray = new Tray(trayIcon());
  tray.setToolTip('Ride Buddy — 알림 읽어주는 라이더');
  tray.on('click', () => sendTest());
  buildMenu();

  const cfg = config.load();
  server = httpServer.start(cfg.httpPort, n => notify(n));
  applyWatcher();
  setTimeout(buildMenu, 3000); // 연동 상태 반영

  screen.on('display-metrics-changed', relayout);
  screen.on('display-added', relayout);
  screen.on('display-removed', relayout);

  win.webContents.once('did-finish-load', () => {
    win.webContents.send('config', config.load());
    setTimeout(() => notify({ app: 'Ride Buddy', title: '부릉부릉~ 출발!', body: '알림이 오면 제가 바로 알려드릴게요.', source: 'welcome' }), 1500);
    // 개발용: RIDE_BUDDY_CAPTURE=out.png 이면 몇 초 뒤 화면을 캡처하고 종료
    if (process.env.RIDE_BUDDY_CAPTURE) {
      setTimeout(async () => {
        const img = await win.webContents.capturePage();
        require('fs').writeFileSync(process.env.RIDE_BUDDY_CAPTURE, img.toPNG());
        app.quit();
      }, +(process.env.RIDE_BUDDY_CAPTURE_MS || 5000));
    }
  });
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { wpn?.stop(); server?.close(); });
