/*
 * Windows 알림 센터 연동 (Windows 10/11)
 * ------------------------------------------------------------
 * Windows 는 모든 앱의 토스트 알림(카카오톡, 메일, 슬랙, 크롬 웹푸시 …)을
 *   %LOCALAPPDATA%\Microsoft\Windows\Notifications\wpndatabase.db  (SQLite)
 * 에 기록합니다. 이 파일을 "읽기 전용"으로 주기적으로 확인해서 새 알림을 캐릭터에게 전달합니다.
 *
 * - 관리자 권한/별도 설치 불필요 (본인 계정의 파일만 읽음)
 * - Electron 37+ 내장 node:sqlite 사용 (네이티브 모듈 빌드 불필요)
 * - 파일이 잠겨 있으면 임시 폴더로 복사(+WAL)해서 읽습니다.
 * - 앱이 알림 미리보기를 숨기도록 설정된 경우(예: 카톡 "메시지 미리보기 끔") 제목만 옵니다.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const POLL_MS = 2000;

function dbPath() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(local, 'Microsoft', 'Windows', 'Notifications', 'wpndatabase.db');
}

function decodePayload(p) {
  if (p == null) return '';
  if (typeof p === 'string') return p;
  const buf = Buffer.from(p);
  // UTF-16LE 로 저장된 경우 (짝수 바이트가 0 이 많음)
  let zeros = 0;
  for (let i = 1; i < Math.min(buf.length, 200); i += 2) if (buf[i] === 0) zeros++;
  return zeros > 40 ? buf.toString('utf16le') : buf.toString('utf8');
}

const unxml = s => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&')
  .trim();

/** 토스트 XML → { title, body } */
function parseToast(xml) {
  const texts = [];
  const re = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
  let m;
  while ((m = re.exec(xml))) {
    if (/placement\s*=\s*["']attribution/i.test(m[1])) continue;
    const t = unxml(m[2]);
    if (t) texts.push(t);
  }
  return { title: texts[0] || '', body: texts.slice(1).join('\n') };
}

class WindowsNotificationWatcher {
  constructor(onNotify, log = console.log) {
    this.onNotify = onNotify;
    this.log = log;
    this.timer = null;
    this.lastId = null;
    this.status = 'stopped';
    this.sqlite = null;
    this.tmpDir = path.join(os.tmpdir(), 'ride-buddy-wpn');
  }

  start() {
    if (process.platform !== 'win32') { this.status = 'unsupported-os'; return false; }
    try {
      this.sqlite = require('node:sqlite');
    } catch {
      this.status = 'no-sqlite';
      this.log('[wpn] node:sqlite 를 사용할 수 없습니다 (Electron 37 이상 필요)');
      return false;
    }
    if (!fs.existsSync(dbPath())) { this.status = 'no-db'; this.log('[wpn] 알림 DB 없음:', dbPath()); return false; }
    this.status = 'running';
    this.poll(true);
    this.timer = setInterval(() => this.poll(false), POLL_MS);
    return true;
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.status === 'running') this.status = 'stopped';
  }

  open() {
    const { DatabaseSync } = this.sqlite;
    try {
      return new DatabaseSync(dbPath(), { readOnly: true });
    } catch (e) {
      // 잠김 등 → 임시 복사본으로 읽기
      fs.mkdirSync(this.tmpDir, { recursive: true });
      const dst = path.join(this.tmpDir, 'wpn.db');
      for (const ext of ['', '-wal']) {
        const src = dbPath() + ext;
        try { fs.rmSync(dst + ext, { force: true }); } catch {}
        if (fs.existsSync(src)) fs.copyFileSync(src, dst + ext);
      }
      try { fs.rmSync(dst + '-shm', { force: true }); } catch {}
      return new DatabaseSync(dst);
    }
  }

  poll(initial) {
    let db;
    try {
      db = this.open();
      if (initial || this.lastId == null) {
        // 시작 시점 이전 알림은 무시
        const row = db.prepare('SELECT MAX(Id) AS id FROM Notification').get();
        this.lastId = Number(row?.id || 0);
        this.log('[wpn] watching from Id', this.lastId);
        return;
      }
      const rows = db.prepare(`
        SELECT n.Id AS id, n.Payload AS payload, n.ArrivalTime AS arrival, h.PrimaryId AS app
        FROM Notification n LEFT JOIN NotificationHandler h ON h.RecordId = n.HandlerId
        WHERE n.Type = 'toast' AND n.Id > ?
        ORDER BY n.Id ASC LIMIT 20`).all(this.lastId);
      for (const r of rows) {
        this.lastId = Math.max(this.lastId, Number(r.id));
        const { title, body } = parseToast(decodePayload(r.payload));
        if (!title && !body) continue;
        this.onNotify({ app: r.app || '', title, body, source: 'windows' });
      }
    } catch (e) {
      if (this.status !== 'error') this.log('[wpn] 읽기 실패:', e.message);
      this.status = 'error';
      return;
    } finally {
      try { db && db.close(); } catch {}
    }
    this.status = 'running';
  }
}

module.exports = { WindowsNotificationWatcher, parseToast, decodePayload };
