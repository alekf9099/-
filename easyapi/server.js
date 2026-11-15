#!/usr/bin/env node
/**
 * EasyAPI 서버 (외부 패키지 0개)
 *  - 정적 웹앱 제공
 *  - /api/send : 브라우저 CORS 제약 없이 대신 요청 (HTTP/HTTPS 프록시 지원)
 *  - /api/room : PC ↔ 모바일 실시간 화면 미러링 (Server-Sent Events)
 */
'use strict';

const http = require('http');
const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const VERSION = '1.1.0';
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const ACCESS_KEY = process.env.ACCESS_KEY || '';
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_REQ_BODY = 30 * 1024 * 1024;   // 앱 → 서버 (파일 업로드 포함)
const MAX_RESP_BODY = 15 * 1024 * 1024;  // 대상 서버 응답 최대 저장 크기
const MAX_REDIRECTS = 10;

/* ====================================================================== *
 * 공통 유틸
 * ====================================================================== */
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('요청 크기가 너무 큽니다.'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function lanUrls() {
  const out = [];
  const ifs = os.networkInterfaces();
  Object.keys(ifs).forEach((name) => {
    (ifs[name] || []).forEach((i) => {
      if (i.family === 'IPv4' && !i.internal) out.push('http://' + i.address + ':' + PORT);
    });
  });
  return out;
}

function checkAccess(req, url) {
  if (!ACCESS_KEY) return true;
  const key = req.headers['x-access-key'] || url.searchParams.get('key') || '';
  const a = Buffer.from(String(key));
  const b = Buffer.from(ACCESS_KEY);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ====================================================================== *
 * 프록시
 * ====================================================================== */
function isBypassed(hostname, bypass) {
  if (!bypass) return false;
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return String(bypass).split(/[,\s]+/).filter(Boolean).some((rule) => {
    const r = rule.toLowerCase().trim();
    if (r === '*') return true;
    if (r.startsWith('*.')) return host.endsWith(r.slice(1));
    if (r.startsWith('.')) return host.endsWith(r) || host === r.slice(1);
    return host === r;
  });
}

function parseProxy(p) {
  if (!p || !p.enabled || !p.url) return null;
  let raw = String(p.url).trim();
  if (!/^[a-z]+:\/\//i.test(raw)) raw = 'http://' + raw;
  const u = new URL(raw);
  if (/^socks/i.test(u.protocol)) {
    throw Object.assign(new Error('SOCKS 프록시는 아직 지원하지 않습니다. HTTP/HTTPS 프록시 주소를 입력해 주세요.'), { code: 'PROXY_UNSUPPORTED' });
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw Object.assign(new Error('프록시 주소는 http:// 또는 https:// 로 시작해야 합니다.'), { code: 'PROXY_INVALID' });
  }
  const username = p.username || decodeURIComponent(u.username || '');
  const password = p.password || decodeURIComponent(u.password || '');
  return {
    protocol: u.protocol,
    hostname: u.hostname,
    port: Number(u.port) || (u.protocol === 'https:' ? 443 : 80),
    auth: username ? 'Basic ' + Buffer.from(username + ':' + password).toString('base64') : null,
    bypass: p.bypass || ''
  };
}

/** HTTPS 대상: 프록시에 CONNECT 터널을 연 뒤 TLS 연결 */
function openTunnel(proxy, target, timeoutMs) {
  return new Promise((resolve, reject) => {
    const mod = proxy.protocol === 'https:' ? https : http;
    const port = target.port || 443;
    const headers = { Host: target.hostname + ':' + port };
    if (proxy.auth) headers['Proxy-Authorization'] = proxy.auth;
    const req = mod.request({
      host: proxy.hostname,
      port: proxy.port,
      method: 'CONNECT',
      path: target.hostname + ':' + port,
      headers: headers,
      timeout: timeoutMs
    });
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        const code = res.statusCode === 407 ? 'PROXY_AUTH' : 'PROXY_CONNECT';
        reject(Object.assign(new Error('프록시가 연결을 거부했습니다 (' + res.statusCode + ' ' + (res.statusMessage || '') + ')'), { code: code }));
        return;
      }
      resolve(socket);
    });
    req.on('timeout', () => { req.destroy(Object.assign(new Error('프록시 연결 시간 초과'), { code: 'PROXY_TIMEOUT' })); });
    req.on('error', (e) => { if (!e.code || !/^PROXY/.test(e.code)) e.proxyStage = true; reject(e); });
    req.end();
  });
}

/* ====================================================================== *
 * 바디 구성
 * ====================================================================== */
function buildBody(body) {
  if (!body) return null;
  if (body.mode === 'text') return { buffer: Buffer.from(String(body.text || ''), 'utf8') };
  if (body.mode === 'base64') return { buffer: Buffer.from(String(body.data || ''), 'base64') };
  if (body.mode === 'multipart') {
    const boundary = '----EasyAPIFormBoundary' + crypto.randomBytes(12).toString('hex');
    const chunks = [];
    (body.parts || []).forEach((p) => {
      const name = String(p.name || '').replace(/"/g, '%22').replace(/\r?\n/g, ' ');
      chunks.push(Buffer.from('--' + boundary + '\r\n'));
      if (p.filename !== undefined && p.filename !== null) {
        const fname = String(p.filename).replace(/"/g, '%22').replace(/\r?\n/g, ' ');
        chunks.push(Buffer.from('Content-Disposition: form-data; name="' + name + '"; filename="' + fname + '"\r\n' +
          'Content-Type: ' + (p.contentType || 'application/octet-stream') + '\r\n\r\n'));
        chunks.push(Buffer.from(String(p.data || ''), 'base64'));
      } else {
        chunks.push(Buffer.from('Content-Disposition: form-data; name="' + name + '"\r\n\r\n'));
        chunks.push(Buffer.from(String(p.value || ''), 'utf8'));
      }
      chunks.push(Buffer.from('\r\n'));
    });
    chunks.push(Buffer.from('--' + boundary + '--\r\n'));
    return { buffer: Buffer.concat(chunks), contentType: 'multipart/form-data; boundary=' + boundary };
  }
  return null;
}

/* ====================================================================== *
 * 응답 처리
 * ====================================================================== */
function decompress(buf, encoding) {
  const enc = String(encoding || '').toLowerCase().trim();
  try {
    if (enc === 'gzip' || enc === 'x-gzip') return zlib.gunzipSync(buf, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
    if (enc === 'br') return zlib.brotliDecompressSync(buf);
    if (enc === 'deflate') {
      try { return zlib.inflateSync(buf); } catch (e) { return zlib.inflateRawSync(buf); }
    }
    if (enc === 'zstd' && typeof zlib.zstdDecompressSync === 'function') return zlib.zstdDecompressSync(buf);
  } catch (e) { /* 해제 실패 시 원본 */ }
  return buf;
}

function isTextual(contentType, buf) {
  const ct = String(contentType || '').toLowerCase();
  if (/^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded|graphql|problem\+json|ld\+json|x-ndjson|yaml|x-yaml|soap\+xml))|\+json|\+xml/.test(ct)) return true;
  if (/^(image|audio|video|font)\/|application\/(octet-stream|pdf|zip|gzip|x-protobuf|protobuf|grpc)/.test(ct)) return false;
  const sample = buf.subarray(0, Math.min(buf.length, 2048));
  for (let i = 0; i < sample.length; i++) if (sample[i] === 0) return false;
  return true;
}

/* ====================================================================== *
 * 실제 요청 수행
 * ====================================================================== */
function requestOnce(spec, proxy, bodyInfo, started) {
  return new Promise(async (resolve, reject) => {
    let target;
    try { target = new URL(spec.url); } catch (e) {
      return reject(Object.assign(new Error('URL 형식이 올바르지 않습니다: ' + spec.url), { code: 'INVALID_URL' }));
    }
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return reject(Object.assign(new Error('http:// 또는 https:// 주소만 지원합니다.'), { code: 'INVALID_URL' }));
    }
    const isHttps = target.protocol === 'https:';
    const useProxy = proxy && !isBypassed(target.hostname, proxy.bypass);
    const timeoutMs = Math.max(1000, Math.min(Number(spec.timeoutMs) || 30000, 300000));

    // 헤더
    const headers = {};
    const lowerSet = new Set();
    (spec.headers || []).forEach((pair) => {
      if (!pair || !pair[0]) return;
      const k = String(pair[0]).trim();
      const v = String(pair[1] === undefined ? '' : pair[1]);
      if (/[^\t\x20-\x7e\x80-\xff]/.test(v) || /[^!#$%&'*+\-.^_`|~0-9A-Za-z]/.test(k)) return; // 잘못된 헤더 무시
      const lk = k.toLowerCase();
      if (lk === 'content-length' || lk === 'host' || lk === 'connection' || lk === 'transfer-encoding') return;
      if (headers[k] !== undefined) headers[k] = [].concat(headers[k], v);
      else headers[k] = v;
      lowerSet.add(lk);
    });
    if (bodyInfo && bodyInfo.contentType) {
      Object.keys(headers).forEach((k) => { if (k.toLowerCase() === 'content-type') delete headers[k]; });
      headers['Content-Type'] = bodyInfo.contentType;
    }
    if (!lowerSet.has('user-agent')) headers['User-Agent'] = 'EasyAPI/' + VERSION;
    if (!lowerSet.has('accept')) headers['Accept'] = '*/*';
    if (!lowerSet.has('accept-encoding')) headers['Accept-Encoding'] = 'gzip, deflate, br';
    if (bodyInfo) headers['Content-Length'] = bodyInfo.buffer.length;
    headers['Host'] = target.host;

    const opts = {
      method: spec.method,
      headers: headers,
      timeout: timeoutMs,
      rejectUnauthorized: !spec.insecure,
      servername: target.hostname.replace(/^\[|\]$/g, ''),
      agent: false
    };

    try {
      if (useProxy && !isHttps) {
        // HTTP 대상 + 프록시: 절대 URL로 프록시에 요청
        opts.host = proxy.hostname;
        opts.port = proxy.port;
        opts.path = target.href;
        if (proxy.auth) headers['Proxy-Authorization'] = proxy.auth;
        if (proxy.protocol === 'https:') opts.rejectUnauthorized = !spec.insecure;
      } else {
        opts.host = target.hostname.replace(/^\[|\]$/g, '');
        opts.port = target.port || (isHttps ? 443 : 80);
        opts.path = target.pathname + target.search;
        if (useProxy && isHttps) {
          const socket = await openTunnel(proxy, target, timeoutMs);
          opts.createConnection = () => require('tls').connect({
            socket: socket,
            servername: opts.servername,
            rejectUnauthorized: !spec.insecure,
            ALPNProtocols: ['http/1.1']
          });
        }
      }
    } catch (e) {
      return reject(e);
    }

    const mod = (useProxy && !isHttps) ? (proxy.protocol === 'https:' ? https : http) : (isHttps ? https : http);
    let ttfb = 0;
    const req = mod.request(opts, (res) => {
      ttfb = Date.now() - started;
      const chunks = [];
      let size = 0;
      let truncated = false;
      res.on('data', (c) => {
        size += c.length;
        if (size <= MAX_RESP_BODY) chunks.push(c);
        else truncated = true;
      });
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        resolve({ res: res, raw: raw, wireSize: size, truncated: truncated, ttfb: ttfb });
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error(timeoutMs / 1000 + '초 동안 응답이 없어 중단했습니다.'), { code: 'TIMEOUT' })));
    req.on('error', (e) => { if (useProxy && (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND') && !isHttps) e.proxyStage = true; reject(e); });
    if (bodyInfo) req.write(bodyInfo.buffer);
    req.end();
  });
}

async function performRequest(spec) {
  const started = Date.now();
  const method = String(spec.method || 'GET').toUpperCase();
  if (!/^[A-Z]+$/.test(method)) throw Object.assign(new Error('잘못된 메서드입니다.'), { code: 'INVALID_METHOD' });
  const proxy = parseProxy(spec.proxy);
  let bodyInfo = method === 'GET' || method === 'HEAD' ? (spec.body ? buildBody(spec.body) : null) : buildBody(spec.body);
  let current = Object.assign({}, spec, { method: method });
  const redirects = [];

  for (;;) {
    const out = await requestOnce(current, proxy, bodyInfo, started);
    const status = out.res.statusCode;
    const location = out.res.headers.location;
    if (spec.followRedirects && location && [301, 302, 303, 307, 308].includes(status) && redirects.length < MAX_REDIRECTS) {
      const next = new URL(location, current.url).href;
      redirects.push({ status: status, url: next });
      const nextSpec = Object.assign({}, current, { url: next });
      if (status === 303 || ((status === 301 || status === 302) && current.method === 'POST')) {
        nextSpec.method = 'GET';
        bodyInfo = null;
        nextSpec.headers = (current.headers || []).filter((h) => !/^content-type$/i.test(h[0]));
      }
      if (new URL(next).host !== new URL(current.url).host) {
        nextSpec.headers = (nextSpec.headers || []).filter((h) => !/^(authorization|cookie)$/i.test(h[0]));
      }
      current = nextSpec;
      continue;
    }

    const timeMs = Date.now() - started;
    const decoded = decompress(out.raw, out.res.headers['content-encoding']);
    const contentType = out.res.headers['content-type'] || '';
    const textual = isTextual(contentType, decoded);
    const headerPairs = [];
    for (let i = 0; i < out.res.rawHeaders.length; i += 2) headerPairs.push([out.res.rawHeaders[i], out.res.rawHeaders[i + 1]]);
    return {
      ok: true,
      status: status,
      statusText: out.res.statusMessage || '',
      httpVersion: out.res.httpVersion,
      headers: headerPairs,
      contentType: contentType,
      body: textual ? decoded.toString('utf8') : decoded.toString('base64'),
      bodyEncoding: textual ? 'utf8' : 'base64',
      size: decoded.length,
      wireSize: out.wireSize,
      truncated: out.truncated,
      timeMs: timeMs,
      ttfbMs: out.ttfb,
      url: current.url,
      redirects: redirects,
      viaProxy: !!(proxy && !isBypassed(new URL(current.url).hostname, proxy.bypass))
    };
  }
}

function errorInfo(e) {
  const code = e.code || 'UNKNOWN';
  const map = {
    ECONNREFUSED: '서버가 연결을 거부했습니다. 주소/포트가 맞는지, 서버가 켜져 있는지 확인하세요.',
    ENOTFOUND: '도메인을 찾을 수 없습니다. 주소에 오타가 없는지 확인하세요.',
    EAI_AGAIN: 'DNS 조회에 실패했습니다. 네트워크 연결을 확인하세요.',
    ECONNRESET: '상대 서버가 연결을 끊었습니다.',
    ETIMEDOUT: '연결 시간이 초과되었습니다.',
    EHOSTUNREACH: '서버에 도달할 수 없습니다. 네트워크/방화벽을 확인하세요.',
    ENETUNREACH: '네트워크에 연결할 수 없습니다.',
    DEPTH_ZERO_SELF_SIGNED_CERT: '자체 서명 인증서입니다. 설정에서 "SSL 인증서 검증 끄기"를 켜면 보낼 수 있습니다.',
    SELF_SIGNED_CERT_IN_CHAIN: '신뢰할 수 없는 인증서 체인입니다. 사내 프록시라면 "SSL 인증서 검증 끄기"를 켜 보세요.',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: '인증서를 검증할 수 없습니다. "SSL 인증서 검증 끄기"를 켜 보세요.',
    CERT_HAS_EXPIRED: '서버 인증서가 만료되었습니다.',
    ERR_TLS_CERT_ALTNAME_INVALID: '인증서의 도메인이 주소와 일치하지 않습니다.',
    HPE_INVALID_CONSTANT: '응답이 HTTP 형식이 아닙니다. https/http 를 바꿔 보세요.'
  };
  let message = map[code] || e.message || '알 수 없는 오류';
  if (e.proxyStage) message = '프록시 서버에 연결하지 못했습니다. 설정의 프록시 주소를 확인하세요. (' + (e.message || code) + ')';
  return { code: code, message: message, detail: e.message };
}

/* ====================================================================== *
 * 기기 미러링 방 (SSE)
 * ====================================================================== */
const rooms = new Map();
const ROOM_RE = /^[A-Z0-9]{4,12}$/;

function getRoom(id) {
  let r = rooms.get(id);
  if (!r) { r = { clients: new Map(), state: {}, touched: Date.now() }; rooms.set(id, r); }
  r.touched = Date.now();
  return r;
}
function sse(res, event, data) {
  res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
}
function broadcast(room, event, data, exceptClient) {
  room.clients.forEach((clientId, res) => { if (clientId !== exceptClient) sse(res, event, data); });
}
function presence(room) {
  const ids = Array.from(new Set(room.clients.values()));
  broadcast(room, 'presence', { peers: ids.length });
}
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, id) => {
    room.clients.forEach((_, res) => res.write(': ping\n\n'));
    if (room.clients.size === 0 && now - room.touched > 6 * 3600 * 1000) rooms.delete(id);
  });
}, 25000).unref();

/* ====================================================================== *
 * 정적 파일
 * ====================================================================== */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (err, st) => {
    const target = (!err && st.isFile()) ? file : path.join(PUBLIC_DIR, 'index.html');
    const ext = path.extname(target);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' || target.endsWith('sw.js') ? 'no-cache' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(target).pipe(res);
  });
}

/* ====================================================================== *
 * 내장 QA 연습 API (/qa/*) — 외부 서버 없이 바로 테스트·자동화 연습
 * ====================================================================== */
const QA_USERS = { qa: { password: '1234', name: 'QA 테스터', role: 'tester' }, admin: { password: 'admin', name: '관리자', role: 'admin' } };
const qaToken = (u) => 'qa.' + Buffer.from(u).toString('base64url') + '.' + crypto.createHash('sha256').update('easyapi-qa:' + u).digest('hex').slice(0, 16);
const qaItems = new Map([[1, { id: 1, name: '아메리카노', price: 4500, stock: 30 }], [2, { id: 2, name: '카페라떼', price: 5000, stock: 12 }]]);
let qaNextId = 3;

async function handleQa(req, res, url) {
  const p = url.pathname;
  const send = (status, obj, headers) => {
    const body = JSON.stringify(obj);
    res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Access-Control-Allow-Origin': '*' }, headers || {}));
    res.end(body);
  };
  let raw = '';
  try { raw = (await readBody(req, 2 * 1024 * 1024)).toString('utf8'); } catch (e) { return send(413, { error: 'too large' }); }
  let json = null;
  try { json = raw ? JSON.parse(raw) : null; } catch (e) { json = null; }
  const authUser = () => {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    if (!m) return null;
    return Object.keys(QA_USERS).find((u) => qaToken(u) === m[1].trim()) || null;
  };

  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }); return res.end(); }
  if (p === '/qa' || p === '/qa/') {
    return send(200, { name: 'EasyAPI QA 연습 API', endpoints: ['ANY /qa/echo', 'GET /qa/status/:code', 'GET /qa/delay/:ms', 'POST /qa/login', 'GET /qa/me', 'GET/POST /qa/items', 'GET/PUT/DELETE /qa/items/:id', 'GET /qa/cookies/set?k=v', 'GET /qa/cookies'] });
  }
  if (p === '/qa/echo' || p.startsWith('/qa/echo/')) {
    return send(200, { method: req.method, path: p, query: Object.fromEntries(url.searchParams), headers: req.headers, body: raw, json: json });
  }
  let m = /^\/qa\/status\/(\d{3})$/.exec(p);
  if (m) return send(Number(m[1]), { status: Number(m[1]) });
  m = /^\/qa\/delay\/(\d+)$/.exec(p);
  if (m) { const ms = Math.min(Number(m[1]), 10000); return setTimeout(() => send(200, { delayed: ms }), ms); }
  if (p === '/qa/login' && req.method === 'POST') {
    const u = json && QA_USERS[json.username];
    if (!json || !json.username || !json.password) return send(400, { error: 'username 과 password 가 필요해요' });
    if (!u || u.password !== json.password) return send(401, { error: '아이디 또는 비밀번호가 틀렸어요' });
    return send(200, { token: qaToken(json.username), user: { username: json.username, name: u.name, role: u.role }, expiresIn: 3600 });
  }
  if (p === '/qa/me') {
    const u = authUser();
    if (!u) return send(401, { error: '로그인이 필요해요 (Authorization: Bearer 토큰)' });
    return send(200, { username: u, name: QA_USERS[u].name, role: QA_USERS[u].role });
  }
  if (p === '/qa/cookies/set') {
    const cookies = Array.from(url.searchParams).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v) + '; Path=/qa');
    res.setHeader('Set-Cookie', cookies);
    return send(200, { set: Object.fromEntries(url.searchParams) });
  }
  if (p === '/qa/cookies') {
    const c = {};
    String(req.headers.cookie || '').split(';').forEach((s) => { const i = s.indexOf('='); if (i > 0) c[s.slice(0, i).trim()] = decodeURIComponent(s.slice(i + 1).trim()); });
    return send(200, { cookies: c });
  }
  if (p === '/qa/items') {
    if (req.method === 'GET') return send(200, { items: Array.from(qaItems.values()), total: qaItems.size });
    if (req.method === 'POST') {
      if (!authUser()) return send(401, { error: '로그인이 필요해요' });
      if (!json || !json.name || typeof json.price !== 'number') return send(422, { error: 'name(문자열), price(숫자)가 필요해요' });
      const item = { id: qaNextId++, name: String(json.name), price: json.price, stock: Number(json.stock) || 0 };
      qaItems.set(item.id, item);
      return send(201, item, { Location: '/qa/items/' + item.id });
    }
  }
  m = /^\/qa\/items\/(\d+)$/.exec(p);
  if (m) {
    const id = Number(m[1]);
    const item = qaItems.get(id);
    if (req.method !== 'GET' && !authUser()) return send(401, { error: '로그인이 필요해요' });
    if (!item) return send(404, { error: id + '번 상품이 없어요' });
    if (req.method === 'GET') return send(200, item);
    if (req.method === 'PUT' || req.method === 'PATCH') { Object.assign(item, json || {}, { id }); return send(200, item); }
    if (req.method === 'DELETE') { qaItems.delete(id); res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }); return res.end(); }
  }
  return send(404, { error: '없는 연습 API예요. GET /qa 로 목록을 확인하세요.' });
}

/* ====================================================================== *
 * 라우터
 * ====================================================================== */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  if (p.startsWith('/qa/')) return handleQa(req, res, url);
  if (!p.startsWith('/api/')) return serveStatic(req, res, p);

  if (p === '/api/info') {
    return sendJson(res, 200, { name: 'EasyAPI', version: VERSION, lanUrls: lanUrls(), accessKeyRequired: !!ACCESS_KEY });
  }
  if (!checkAccess(req, url)) return sendJson(res, 401, { ok: false, error: { code: 'ACCESS_KEY', message: '접속 키가 필요합니다. 설정 → 접속 키를 입력하세요.' } });

  try {
    if (p === '/api/send' && req.method === 'POST') {
      const spec = JSON.parse((await readBody(req, MAX_REQ_BODY)).toString('utf8') || '{}');
      const started = Date.now();
      try {
        const result = await performRequest(spec);
        return sendJson(res, 200, result);
      } catch (e) {
        return sendJson(res, 200, { ok: false, error: errorInfo(e), timeMs: Date.now() - started });
      }
    }

    const m = /^\/api\/room\/([A-Za-z0-9]+)(\/events)?$/.exec(p);
    if (m) {
      const id = m[1].toUpperCase();
      if (!ROOM_RE.test(id)) return sendJson(res, 400, { ok: false, error: { message: '방 코드는 영문/숫자 4~12자입니다.' } });
      const room = getRoom(id);
      if (m[2] && req.method === 'GET') {
        const clientId = String(url.searchParams.get('client') || crypto.randomUUID()).slice(0, 64);
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no'
        });
        res.write('retry: 3000\n\n');
        room.clients.set(res, clientId);
        sse(res, 'init', { room: id, state: room.state });
        presence(room);
        req.on('close', () => { room.clients.delete(res); room.touched = Date.now(); presence(room); });
        return;
      }
      if (!m[2] && req.method === 'POST') {
        const msg = JSON.parse((await readBody(req, 8 * 1024 * 1024)).toString('utf8') || '{}');
        if (!msg.type) return sendJson(res, 400, { ok: false });
        if (msg.type !== 'ping') room.state[msg.type] = msg.payload;
        broadcast(room, 'update', { client: msg.client, type: msg.type, payload: msg.payload }, msg.client);
        return sendJson(res, 200, { ok: true, peers: new Set(room.clients.values()).size });
      }
    }
    return sendJson(res, 404, { ok: false, error: { message: '없는 API입니다.' } });
  } catch (e) {
    return sendJson(res, e.status || 400, { ok: false, error: { code: 'BAD_REQUEST', message: e.message } });
  }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    const line = '─'.repeat(52);
    console.log('\n' + line);
    console.log('  EasyAPI v' + VERSION + ' 실행 중');
    console.log(line);
    console.log('  PC에서 접속      : http://localhost:' + PORT);
    lanUrls().forEach((u) => console.log('  휴대폰(같은 Wi-Fi): ' + u));
    if (ACCESS_KEY) console.log('  접속 키 보호      : 사용 중');
    else console.log('  ⚠ 외부 공개 서버라면 ACCESS_KEY 환경변수를 꼭 설정하세요.');
    console.log(line + '\n');
  });
}

module.exports = { server, performRequest, isBypassed, parseProxy, buildBody };
