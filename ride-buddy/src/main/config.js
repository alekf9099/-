// 사용자 설정 저장소 (userData/config.json)
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  skin: '2d',           // 2d (원본 일러스트) | 3d (Blender 렌더)
  size: 'm',            // s | m | l  (캐릭터 크기)
  speed: 1,             // 0.5 | 1 | 1.8 (이동 속도 배율)
  sound: false,         // 효과음 (현재 보류 — 기본 꺼짐)
  dnd: false,           // 방해 금지 (알림은 쌓아두고 졸기 모션)
  paused: false,        // 이동 멈춤
  windowsWatcher: true, // Windows 알림 센터 연동
  httpPort: 47321,      // 로컬 알림 API 포트
  mutedApps: [],        // 무시할 앱 이름(부분 일치)
  catchphrase: true,    // 유행어 리액션: 알림 오면 "달달달달~ 감사하고~"
  showBody: true,       // 메시지 본문 표시 (끄면 "OO에서 알림이 왔어요"만)
};

let cache = null;
const file = () => path.join(app.getPath('userData'), 'config.json');

function load() {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

function save(patch) {
  cache = { ...load(), ...patch };
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error('[config] save failed', e);
  }
  return cache;
}

module.exports = { load, save, DEFAULTS };
