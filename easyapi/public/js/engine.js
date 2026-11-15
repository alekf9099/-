/*!
 * EasyAPI 실행 엔진 (브라우저 · Web Worker · Node CLI 공용)
 *  - 변수 스코프 / 동적 변수 / 요청 해석
 *  - pm.* 스크립트 실행기 (Postman 호환)
 *  - 노코드 검증 · 변수 추출
 *  - 컬렉션 러너 · 리포트(JUnit / HTML / Markdown)
 *  - Postman v2.1 가져오기 / 내보내기, CSV 파서, 쿠키 저장소
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EasyEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ================================================================== *
   * 공통 유틸
   * ================================================================== */
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  function typeOf(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }
  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b);
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => hasOwn(b, k) && deepEqual(a[k], b[k]));
  }
  function fmt(v) {
    if (v === undefined) return 'undefined';
    if (typeof v === 'string') return JSON.stringify(v.length > 160 ? v.slice(0, 157) + '…' : v);
    try {
      const s = JSON.stringify(v);
      if (s === undefined) return String(v);
      return s.length > 160 ? s.slice(0, 157) + '…' : s;
    } catch (e) { return String(v); }
  }
  function b64encode(str) {
    if (typeof btoa === 'function') {
      const bytes = new TextEncoder().encode(str);
      let bin = '';
      bytes.forEach((b) => { bin += String.fromCharCode(b); });
      return btoa(bin);
    }
    return Buffer.from(str, 'utf8').toString('base64');
  }
  const rand = (n) => Math.floor(Math.random() * n);
  function uuid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = rand(16); return (c === 'x' ? r : ((r & 3) | 8)).toString(16); });
  }
  const pad = (n, l) => String(n).padStart(l, '0');

  /* ================================================================== *
   * 동적 변수 {{$guid}} 등
   * ================================================================== */
  const FIRST = ['민준', '서연', '도윤', '지우', '하준', '서윤', '시우', '하은', 'James', 'Olivia', 'Liam', 'Emma'];
  const LAST = ['김', '이', '박', '최', '정', '강', '조', '윤'];
  const WORDS = ['apple', 'river', 'cloud', 'stone', 'pixel', 'orbit', 'maple', 'delta', 'coffee', 'tiger'];
  const DYNAMIC = {
    $guid: { fn: uuid, desc: 'UUID v4' },
    $randomUUID: { fn: uuid, desc: 'UUID v4' },
    $timestamp: { fn: () => String(Math.floor(Date.now() / 1000)), desc: '현재 유닉스 시간(초)' },
    $timestampMs: { fn: () => String(Date.now()), desc: '현재 유닉스 시간(ms)' },
    $isoTimestamp: { fn: () => new Date().toISOString(), desc: 'ISO 8601 시간' },
    $randomInt: { fn: () => String(rand(1001)), desc: '0~1000 정수' },
    $randomBoolean: { fn: () => String(Math.random() < 0.5), desc: 'true / false' },
    $randomAlphaNumeric: { fn: () => 'abcdefghijklmnopqrstuvwxyz0123456789'[rand(36)], desc: '영문/숫자 1자' },
    $randomFirstName: { fn: () => FIRST[rand(FIRST.length)], desc: '이름' },
    $randomLastName: { fn: () => LAST[rand(LAST.length)], desc: '성' },
    $randomFullName: { fn: () => LAST[rand(LAST.length)] + FIRST[rand(8)], desc: '한글 성명' },
    $randomUserName: { fn: () => 'user_' + Math.random().toString(36).slice(2, 8), desc: '아이디' },
    $randomEmail: { fn: () => 'qa_' + Date.now().toString(36) + rand(1000) + '@example.com', desc: '이메일 (항상 다름)' },
    $randomPhoneNumber: { fn: () => '010-' + pad(rand(10000), 4) + '-' + pad(rand(10000), 4), desc: '휴대폰 번호' },
    $randomPassword: { fn: () => Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8).toUpperCase() + '!', desc: '비밀번호' },
    $randomWord: { fn: () => WORDS[rand(WORDS.length)], desc: '영단어' },
    $randomPrice: { fn: () => (rand(1000000) / 100).toFixed(2), desc: '가격 (소수 2자리)' },
    $randomIP: { fn: () => [rand(256), rand(256), rand(256), rand(256)].join('.'), desc: 'IPv4 주소' },
    $randomDate: { fn: () => new Date(Date.now() - rand(365 * 86400000)).toISOString().slice(0, 10), desc: '최근 1년 날짜' }
  };

  /* ================================================================== *
   * 변수 스코프: local > data > environment > collection > globals
   * ================================================================== */
  const SCOPES = ['local', 'data', 'environment', 'collection', 'globals'];
  function rowsToMap(rows) {
    const m = {};
    (rows || []).forEach((v) => { if (v && v.enabled !== false && v.key) m[v.key] = v.value === undefined || v.value === null ? '' : String(v.value); });
    return m;
  }
  /** 맵의 변경을 원래 행(row) 배열에 반영 (순서·비활성 행 유지) */
  function mergeMapIntoRows(rows, map) {
    rows = rows || [];
    const seen = new Set();
    rows.forEach((r) => {
      if (!r.key || r.enabled === false) return;
      if (hasOwn(map, r.key)) { r.value = map[r.key]; seen.add(r.key); }
    });
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (r.key && r.enabled !== false && !hasOwn(map, r.key)) rows.splice(i, 1);
    }
    Object.keys(map).forEach((k) => { if (!seen.has(k)) rows.push({ key: k, value: map[k], enabled: true }); });
    return rows;
  }
  function lookup(vars, key) {
    for (const s of SCOPES) {
      if (vars[s] && hasOwn(vars[s], key)) return { found: true, value: vars[s][key], scope: s };
    }
    if (DYNAMIC[key]) return { found: true, value: DYNAMIC[key].fn(), scope: 'dynamic' };
    return { found: false };
  }
  function substitute(str, vars, missing, depth) {
    depth = depth || 0;
    return String(str === undefined || str === null ? '' : str).replace(/\{\{\s*([^{}\s][^{}]*?)\s*\}\}/g, (m, k) => {
      const r = lookup(vars, k);
      if (!r.found) { if (missing) missing.add(k); return m; }
      let v = String(r.value);
      if (depth < 5 && v.indexOf('{{') >= 0) v = substitute(v, vars, missing, depth + 1);
      return v;
    });
  }

  /* ================================================================== *
   * 경로 변수 /users/:id
   * ================================================================== */
  const PATH_VAR_RE = /\/:([A-Za-z_][\w-]*)(?=\/|\?|#|$)/g;
  function pathVarNames(url) {
    const s = String(url || '').replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
    const names = [];
    let m;
    PATH_VAR_RE.lastIndex = 0;
    while ((m = PATH_VAR_RE.exec(s))) if (names.indexOf(m[1]) < 0) names.push(m[1]);
    return names;
  }

  /* ================================================================== *
   * 쿠키 저장소
   * ================================================================== */
  function parseSetCookie(str, url) {
    const u = new URL(url);
    const parts = String(str).split(';');
    const first = parts.shift();
    const eq = first.indexOf('=');
    if (eq < 1) return null;
    const c = {
      name: first.slice(0, eq).trim(), value: first.slice(eq + 1).trim(),
      domain: u.hostname.toLowerCase(), hostOnly: true, path: '/', expires: null, secure: false, httpOnly: false
    };
    const dir = u.pathname.replace(/\/[^/]*$/, '') || '/';
    c.path = dir;
    parts.forEach((p) => {
      const i = p.indexOf('=');
      const k = (i < 0 ? p : p.slice(0, i)).trim().toLowerCase();
      const v = i < 0 ? '' : p.slice(i + 1).trim();
      if (k === 'domain' && v) { c.domain = v.replace(/^\./, '').toLowerCase(); c.hostOnly = false; }
      else if (k === 'path' && v) c.path = v;
      else if (k === 'expires') { const t = Date.parse(v); if (!isNaN(t)) c.expires = t; }
      else if (k === 'max-age') { const n = Number(v); if (!isNaN(n)) c.expires = Date.now() + n * 1000; }
      else if (k === 'secure') c.secure = true;
      else if (k === 'httponly') c.httpOnly = true;
    });
    return c;
  }
  function domainMatch(host, c) {
    host = host.toLowerCase();
    return c.hostOnly ? host === c.domain : (host === c.domain || host.endsWith('.' + c.domain));
  }
  function storeCookies(jar, headers, url) {
    (headers || []).forEach(([k, v]) => {
      if (String(k).toLowerCase() !== 'set-cookie') return;
      let c;
      try { c = parseSetCookie(v, url); } catch (e) { c = null; }
      if (!c) return;
      for (let i = jar.length - 1; i >= 0; i--) {
        const o = jar[i];
        if (o.name === c.name && o.domain === c.domain && o.path === c.path) jar.splice(i, 1);
      }
      if (c.expires === null || c.expires > Date.now()) jar.push(c);
    });
    return jar;
  }
  function cookieHeaderFor(jar, url) {
    let u;
    try { u = new URL(url); } catch (e) { return ''; }
    const now = Date.now();
    return (jar || []).filter((c) => (c.expires === null || c.expires > now) && domainMatch(u.hostname, c) &&
      (u.pathname === c.path || u.pathname.startsWith(c.path.endsWith('/') ? c.path : c.path + '/') || c.path === '/') &&
      (!c.secure || u.protocol === 'https:'))
      .sort((a, b) => b.path.length - a.path.length)
      .map((c) => c.name + '=' + c.value).join('; ');
  }

  /* ================================================================== *
   * 요청 해석 (변수 치환, 인증, 바디)
   * ================================================================== */
  function resolveRequest(req, vars, opts) {
    opts = opts || {};
    const missing = new Set();
    const sub = (s) => substitute(s, vars, missing);
    let url = String(req.url || '').trim();
    // 경로 변수
    const pv = {};
    (req.pathVars || []).forEach((p) => { if (p.key) pv[p.key] = p.value; });
    url = url.replace(/(^[a-z][a-z0-9+.-]*:\/\/[^/]*)?(.*)$/i, (m, origin, rest) =>
      (origin || '') + rest.replace(PATH_VAR_RE, (mm, k) => (hasOwn(pv, k) && pv[k] !== '' ? '/' + encodeURIComponent(sub(pv[k])) : mm)));
    url = sub(url);
    if (url && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
      url = (/^(localhost|127\.|10\.|192\.168\.|172\.)/.test(url) ? 'http://' : 'https://') + url;
    }
    const headers = (req.headers || []).filter((h) => h.enabled !== false && h.key && String(h.key).trim())
      .map((h) => [sub(String(h.key).trim()), sub(h.value)]);
    const has = (n) => headers.some((h) => h[0].toLowerCase() === n.toLowerCase());

    let a = req.auth || { type: 'none' };
    if (a.type === 'inherit') a = opts.parentAuth && opts.parentAuth.type !== 'inherit' ? opts.parentAuth : { type: 'none' };
    if (a.type === 'bearer' && a.bearer && !has('authorization')) headers.push(['Authorization', 'Bearer ' + sub(a.bearer).trim()]);
    if (a.type === 'basic' && (a.username || a.password) && !has('authorization')) headers.push(['Authorization', 'Basic ' + b64encode(sub(a.username) + ':' + sub(a.password))]);
    if (a.type === 'apikey' && a.apiKeyName && a.apiKeyValue) {
      if (a.apiKeyIn === 'query') url += (url.indexOf('?') >= 0 ? '&' : '?') + encodeURIComponent(sub(a.apiKeyName)) + '=' + encodeURIComponent(sub(a.apiKeyValue));
      else if (!has(a.apiKeyName)) headers.push([sub(a.apiKeyName), sub(a.apiKeyValue)]);
    }

    let bodyText = null;
    let multipart = null;
    let binary = null;
    const b = req.body || { mode: 'none' };
    if (b.mode === 'json') {
      bodyText = sub(b.raw);
      if (!has('content-type')) headers.push(['Content-Type', 'application/json']);
    } else if (b.mode === 'form') {
      bodyText = (b.form || []).filter((r) => r.enabled !== false && r.key).map((r) => encodeURIComponent(sub(r.key)) + '=' + encodeURIComponent(sub(r.value))).join('&');
      if (!has('content-type')) headers.push(['Content-Type', 'application/x-www-form-urlencoded']);
    } else if (b.mode === 'raw') {
      bodyText = sub(b.raw);
      if (!has('content-type') && b.rawType) headers.push(['Content-Type', b.rawType]);
    } else if (b.mode === 'graphql') {
      const g = b.graphql || {};
      let variables = {};
      const vt = sub(g.variables || '').trim();
      if (vt) {
        try { variables = JSON.parse(vt); } catch (e) { if (!opts.lenient) throw new Error('GraphQL 변수(JSON) 형식이 올바르지 않아요: ' + e.message); }
      }
      bodyText = JSON.stringify({ query: sub(g.query || ''), variables: variables });
      if (!has('content-type')) headers.push(['Content-Type', 'application/json']);
    } else if (b.mode === 'binary') {
      if (b.binary && b.binary.data) {
        binary = { data: b.binary.data, type: b.binary.type || 'application/octet-stream', name: b.binary.name };
        if (!has('content-type')) headers.push(['Content-Type', binary.type]);
      } else if (!opts.lenient) throw new Error('보낼 파일을 선택해 주세요. (바디 → 파일)');
    } else if (b.mode === 'multipart') {
      multipart = (b.multipart || []).filter((r) => r.enabled !== false && r.key).map((r) => {
        if ((r.type || 'text') === 'file') {
          if (!r.file && !opts.lenient) throw new Error('"' + r.key + '" 필드의 파일을 선택해 주세요.');
          return { name: sub(r.key), filename: r.file ? r.file.name : (r.fileName || 'file'), contentType: r.file ? r.file.type : 'application/octet-stream', data: r.file ? r.file.data : '' };
        }
        return { name: sub(r.key), value: sub(r.value) };
      });
    }
    if (opts.cookieJar && !has('cookie')) {
      const ch = cookieHeaderFor(opts.cookieJar, url);
      if (ch) headers.push(['Cookie', ch]);
    }
    return { method: String(req.method || 'GET').toUpperCase(), url: url, headers: headers, bodyText: bodyText, body: bodyText, multipart: multipart, binary: binary, missing: Array.from(missing) };
  }

  /** 서버 /api/send 로 보낼 body 스펙 */
  function bodySpec(resolved) {
    if (resolved.multipart) return { mode: 'multipart', parts: resolved.multipart };
    if (resolved.binary) return { mode: 'base64', data: resolved.binary.data };
    if (resolved.bodyText !== null && resolved.bodyText !== undefined) return { mode: 'text', text: resolved.bodyText };
    return null;
  }

  /* ================================================================== *
   * JSON 경로  ($.data.items[0].id / data.items[-1] / items.length)
   * ================================================================== */
  function jsonPath(obj, path) {
    let p = String(path === undefined || path === null ? '' : path).trim();
    if (p === '' || p === '$') return { found: true, value: obj };
    p = p.replace(/^\$\.?/, '');
    const tokens = [];
    const re = /\[(-?\d+)\]|\[\s*['"]([^'"]+)['"]\s*\]|([^.[\]]+)/g;
    let m;
    while ((m = re.exec(p))) tokens.push(m[1] !== undefined ? Number(m[1]) : (m[2] !== undefined ? m[2] : m[3]));
    let cur = obj;
    for (const t of tokens) {
      if (cur === null || cur === undefined) return { found: false };
      if (typeof t === 'number' && Array.isArray(cur)) {
        const i = t < 0 ? cur.length + t : t;
        if (i < 0 || i >= cur.length) return { found: false };
        cur = cur[i];
      } else if (t === 'length' && (Array.isArray(cur) || typeof cur === 'string')) {
        cur = cur.length;
      } else if (typeof cur === 'object' && hasOwn(cur, String(t))) {
        cur = cur[t];
      } else return { found: false };
    }
    return { found: true, value: cur };
  }

  /* ================================================================== *
   * chai 스타일 expect (pm.expect)
   * ================================================================== */
  class AssertionError extends Error {
    constructor(msg) { super(msg); this.name = 'AssertionError'; }
  }
  const CHAIN = ['to', 'be', 'been', 'is', 'that', 'which', 'and', 'has', 'have', 'with', 'at', 'of', 'same', 'but', 'does', 'still', 'also'];

  function Assertion(subject, msg, isResponse) {
    this._s = subject;
    this._neg = false;
    this._deep = false;
    this._msg = msg;
    this._res = !!isResponse;
  }
  CHAIN.forEach((w) => Object.defineProperty(Assertion.prototype, w, { get() { return this; } }));
  Object.defineProperty(Assertion.prototype, 'not', { get() { this._neg = !this._neg; return this; } });
  Object.defineProperty(Assertion.prototype, 'deep', { get() { this._deep = true; return this; } });
  Assertion.prototype._ok = function (cond, msg, negMsg) {
    const pass = this._neg ? !cond : !!cond;
    if (!pass) throw new AssertionError((this._msg ? this._msg + ': ' : '') + (this._neg ? negMsg : msg));
    return this;
  };
  const addMethod = (names, fn) => names.forEach((n) => { Assertion.prototype[n] = fn; });
  const addGetter = (names, fn) => names.forEach((n) => Object.defineProperty(Assertion.prototype, n, { get: fn }));

  addMethod(['equal', 'equals', 'eq'], function (x) {
    const s = this._s;
    const cond = this._deep ? deepEqual(s, x) : s === x;
    return this._ok(cond, '기대값 ' + fmt(x) + ', 실제값 ' + fmt(s), fmt(s) + '와(과) 같지 않아야 해요');
  });
  addMethod(['eql', 'eqls'], function (x) {
    return this._ok(deepEqual(this._s, x), '기대값 ' + fmt(x) + ', 실제값 ' + fmt(this._s), fmt(this._s) + '와(과) 달라야 해요');
  });
  addMethod(['above', 'gt', 'greaterThan'], function (n) { return this._ok(this._s > n, fmt(this._s) + ' 은(는) ' + n + '보다 커야 해요', fmt(this._s) + ' 은(는) ' + n + '보다 크면 안 돼요'); });
  addMethod(['least', 'gte'], function (n) { return this._ok(this._s >= n, fmt(this._s) + ' 은(는) ' + n + ' 이상이어야 해요', fmt(this._s) + ' 은(는) ' + n + ' 미만이어야 해요'); });
  addMethod(['below', 'lt', 'lessThan'], function (n) { return this._ok(this._s < n, fmt(this._s) + ' 은(는) ' + n + '보다 작아야 해요', fmt(this._s) + ' 은(는) ' + n + '보다 작으면 안 돼요'); });
  addMethod(['most', 'lte'], function (n) { return this._ok(this._s <= n, fmt(this._s) + ' 은(는) ' + n + ' 이하여야 해요', fmt(this._s) + ' 은(는) ' + n + ' 초과여야 해요'); });
  addMethod(['within'], function (a, b) { return this._ok(this._s >= a && this._s <= b, fmt(this._s) + ' 은(는) ' + a + '~' + b + ' 사이여야 해요', fmt(this._s) + ' 은(는) ' + a + '~' + b + ' 밖이어야 해요'); });
  addMethod(['a', 'an'], function (type) {
    const t = typeOf(this._s);
    const want = String(type).toLowerCase();
    return this._ok(t === want, '타입이 ' + want + ' 이어야 하는데 ' + t + ' 이에요', '타입이 ' + want + ' 이면 안 돼요');
  });
  addMethod(['include', 'includes', 'contain', 'contains'], function (x) {
    const s = this._s;
    let cond = false;
    if (typeof s === 'string') cond = s.indexOf(String(x)) >= 0;
    else if (Array.isArray(s)) cond = s.some((v) => deepEqual(v, x));
    else if (s && typeof s === 'object' && x && typeof x === 'object') cond = Object.keys(x).every((k) => deepEqual(s[k], x[k]));
    return this._ok(cond, fmt(s) + ' 에 ' + fmt(x) + ' 이(가) 포함되어야 해요', fmt(s) + ' 에 ' + fmt(x) + ' 이(가) 없어야 해요');
  });
  addMethod(['property'], function (name, val) {
    const s = this._s;
    const r = (s !== null && s !== undefined) ? jsonPath(s, name) : { found: false };
    if (arguments.length > 1) {
      this._ok(r.found && deepEqual(r.value, val), '속성 ' + name + ' = ' + fmt(val) + ' 이어야 하는데 ' + (r.found ? fmt(r.value) : '없어요'), '속성 ' + name + ' 이(가) ' + fmt(val) + ' 이면 안 돼요');
    } else {
      this._ok(r.found, '속성 "' + name + '" 이(가) 있어야 해요', '속성 "' + name + '" 이(가) 없어야 해요');
    }
    if (r.found && !this._neg) this._s = r.value;
    return this;
  });
  addMethod(['lengthOf', 'length'], function (n) {
    const len = this._s === null || this._s === undefined ? undefined : this._s.length;
    return this._ok(len === n, '길이가 ' + n + ' 이어야 하는데 ' + len + ' 이에요', '길이가 ' + n + ' 이면 안 돼요');
  });
  addMethod(['match', 'matches'], function (re) { return this._ok(re.test(String(this._s)), fmt(this._s) + ' 이(가) ' + re + ' 와 일치해야 해요', fmt(this._s) + ' 이(가) ' + re + ' 와 일치하면 안 돼요'); });
  addMethod(['oneOf'], function (arr) { return this._ok(arr.some((v) => deepEqual(v, this._s)), fmt(this._s) + ' 은(는) ' + fmt(arr) + ' 중 하나여야 해요', fmt(this._s) + ' 은(는) ' + fmt(arr) + ' 에 없어야 해요'); });
  addMethod(['keys', 'key'], function () {
    const want = Array.prototype.concat.apply([], arguments);
    const s = this._s || {};
    return this._ok(want.every((k) => hasOwn(s, k)), '키 ' + fmt(want) + ' 이(가) 모두 있어야 해요', '키 ' + fmt(want) + ' 이(가) 없어야 해요');
  });
  addMethod(['members'], function (arr) {
    const s = this._s || [];
    return this._ok(arr.length === s.length && arr.every((v) => s.some((x) => deepEqual(x, v))), fmt(s) + ' 의 구성이 ' + fmt(arr) + ' 와 같아야 해요', '구성이 달라야 해요');
  });
  addMethod(['satisfy', 'satisfies'], function (fn) { return this._ok(!!fn(this._s), fmt(this._s) + ' 이(가) 조건을 만족해야 해요', '조건을 만족하면 안 돼요'); });
  addMethod(['instanceOf', 'instanceof'], function (C) { return this._ok(this._s instanceof C, '인스턴스 타입이 달라요', '인스턴스 타입이 같으면 안 돼요'); });
  addMethod(['throw', 'throws'], function () {
    let threw = false;
    try { this._s(); } catch (e) { threw = true; }
    return this._ok(threw, '예외가 발생해야 해요', '예외가 발생하면 안 돼요');
  });
  addGetter(['true'], function () { return this._ok(this._s === true, fmt(this._s) + ' 은(는) true 여야 해요', 'true 이면 안 돼요'); });
  addGetter(['false'], function () { return this._ok(this._s === false, fmt(this._s) + ' 은(는) false 여야 해요', 'false 이면 안 돼요'); });
  addGetter(['null'], function () { return this._ok(this._s === null, fmt(this._s) + ' 은(는) null 이어야 해요', 'null 이면 안 돼요'); });
  addGetter(['undefined'], function () { return this._ok(this._s === undefined, fmt(this._s) + ' 은(는) undefined 여야 해요', '값이 있어야 해요'); });
  addGetter(['NaN'], function () { return this._ok(Number.isNaN(this._s), 'NaN 이어야 해요', 'NaN 이면 안 돼요'); });
  addGetter(['exist', 'exists'], function () { return this._ok(this._s !== null && this._s !== undefined, '값이 있어야 하는데 ' + fmt(this._s) + ' 이에요', '값이 없어야 하는데 ' + fmt(this._s) + ' 이에요'); });
  addGetter(['empty'], function () {
    const s = this._s;
    const e = s === '' || (Array.isArray(s) && !s.length) || (s && typeof s === 'object' && !Array.isArray(s) && !Object.keys(s).length);
    return this._ok(e, fmt(s) + ' 은(는) 비어 있어야 해요', '비어 있으면 안 돼요');
  });
  // 응답 전용 (pm.response.to.*)
  const code = (a) => (a._s && a._s.code);
  addGetter(['ok'], function () {
    if (this._res) return this._ok(code(this) >= 200 && code(this) < 300, '상태 코드가 2xx 여야 하는데 ' + code(this) + ' 이에요', '2xx 이면 안 돼요');
    return this._ok(!!this._s, fmt(this._s) + ' 은(는) 참이어야 해요', fmt(this._s) + ' 은(는) 거짓이어야 해요');
  });
  addGetter(['success'], function () { return this._ok(code(this) >= 200 && code(this) < 300, '2xx 여야 하는데 ' + code(this) + ' 이에요', '2xx 이면 안 돼요'); });
  addGetter(['redirection'], function () { return this._ok(code(this) >= 300 && code(this) < 400, '3xx 여야 하는데 ' + code(this) + ' 이에요', '3xx 이면 안 돼요'); });
  addGetter(['clientError'], function () { return this._ok(code(this) >= 400 && code(this) < 500, '4xx 여야 하는데 ' + code(this) + ' 이에요', '4xx 이면 안 돼요'); });
  addGetter(['serverError'], function () { return this._ok(code(this) >= 500, '5xx 여야 하는데 ' + code(this) + ' 이에요', '5xx 이면 안 돼요'); });
  addGetter(['error'], function () { return this._ok(code(this) >= 400, '4xx/5xx 여야 하는데 ' + code(this) + ' 이에요', '오류 응답이면 안 돼요'); });
  [['notFound', 404], ['unauthorized', 401], ['forbidden', 403], ['badRequest', 400], ['accepted', 202], ['created', 201], ['rateLimited', 429]].forEach(([n, c]) => {
    addGetter([n], function () { return this._ok(code(this) === c, c + ' 이어야 하는데 ' + code(this) + ' 이에요', c + ' 이면 안 돼요'); });
  });
  addGetter(['json'], function () {
    let ok = true;
    try { JSON.parse(this._s.text()); } catch (e) { ok = false; }
    return this._ok(ok, '본문이 JSON 이어야 해요', '본문이 JSON 이면 안 돼요');
  });
  addMethod(['status'], function (c) {
    if (typeof c === 'string') return this._ok(this._s.status === c, '상태 문구가 ' + fmt(c) + ' 이어야 하는데 ' + fmt(this._s.status) + ' 이에요', '상태 문구가 달라야 해요');
    return this._ok(code(this) === c, '상태 코드 ' + c + ' 이어야 하는데 ' + code(this) + ' 이에요', '상태 코드가 ' + c + ' 이면 안 돼요');
  });
  addMethod(['header'], function (name, val) {
    const v = this._s.headers.get(name);
    if (arguments.length > 1) return this._ok(v === val, '헤더 ' + name + ' = ' + fmt(val) + ' 이어야 하는데 ' + fmt(v) + ' 이에요', '헤더 ' + name + ' 이(가) ' + fmt(val) + ' 이면 안 돼요');
    return this._ok(v !== undefined, '헤더 "' + name + '" 이(가) 있어야 해요', '헤더 "' + name + '" 이(가) 없어야 해요');
  });
  addMethod(['body'], function (s) {
    const t = this._s.text();
    if (arguments.length === 0) return this._ok(t.length > 0, '본문이 있어야 해요', '본문이 없어야 해요');
    if (s instanceof RegExp) return this._ok(s.test(t), '본문이 ' + s + ' 와 일치해야 해요', '본문이 ' + s + ' 와 일치하면 안 돼요');
    return this._ok(t === s, '본문이 ' + fmt(s) + ' 이어야 해요', '본문이 달라야 해요');
  });
  addMethod(['jsonBody'], function (path, val) {
    let j;
    try { j = JSON.parse(this._s.text()); } catch (e) { return this._ok(false, '본문이 JSON 이 아니에요', ''); }
    if (arguments.length === 0) return this._ok(true, '', '본문이 JSON 이면 안 돼요');
    const r = jsonPath(j, path);
    if (arguments.length > 1) return this._ok(r.found && deepEqual(r.value, val), path + ' = ' + fmt(val) + ' 이어야 하는데 ' + (r.found ? fmt(r.value) : '없어요'), path + ' 이(가) ' + fmt(val) + ' 이면 안 돼요');
    return this._ok(r.found, path + ' 이(가) 있어야 해요', path + ' 이(가) 없어야 해요');
  });
  addMethod(['responseTime'], function () { return this; });

  function expect(v, msg) { return new Assertion(v, msg); }
  expect.fail = function (msg) { throw new AssertionError(msg || '실패 처리됨'); };

  /* ================================================================== *
   * 응답 뷰 (pm.response)
   * ================================================================== */
  function headerList(pairs) {
    pairs = pairs || [];
    const find = (n) => { const p = pairs.find((h) => String(h[0]).toLowerCase() === String(n).toLowerCase()); return p ? p[1] : undefined; };
    return {
      get: find,
      has: function (n, v) { return arguments.length > 1 ? find(n) === v : find(n) !== undefined; },
      all: () => pairs.map(([key, value]) => ({ key, value })),
      toObject: () => { const o = {}; pairs.forEach(([k, v]) => { o[String(k).toLowerCase()] = v; }); return o; },
      each: (fn) => pairs.forEach(([key, value]) => fn({ key, value })),
      count: () => pairs.length
    };
  }
  function responseView(res) {
    if (!res || !res.ok) return null;
    const text = () => (res.bodyEncoding === 'base64' ? '' : (res.body || ''));
    const view = {
      code: res.status, status: res.statusText || '', responseTime: res.timeMs, responseSize: res.size,
      headers: headerList(res.headers),
      text: text,
      json: function () {
        try { return JSON.parse(text()); } catch (e) { throw new Error('응답 본문이 JSON 이 아니에요: ' + e.message); }
      },
      cookies: { get: (n) => { const c = (res.headers || []).filter(([k]) => /^set-cookie$/i.test(k)).map(([, v]) => v.split(';')[0]).find((s) => s.split('=')[0].trim() === n); return c ? c.slice(c.indexOf('=') + 1) : undefined; } }
    };
    Object.defineProperty(view, 'to', { get() { return new Assertion(view, undefined, true); } });
    return view;
  }

  /* ================================================================== *
   * 스크립트 실행기 (pm API)
   *   ctx = { event, vars:{globals,collection,environment,data,local}, request, response, info }
   *   opts.sendRequest(resolvedSpec) => Promise<res>
   * ================================================================== */
  async function executeScript(code, ctx, opts) {
    opts = opts || {};
    const vars = {};
    SCOPES.forEach((s) => { vars[s] = Object.assign({}, (ctx.vars && ctx.vars[s]) || {}); });
    const tests = [];
    const logs = [];
    const waits = [];
    const request = clone(ctx.request || { url: '', method: 'GET', headers: [] });
    request.headers = request.headers || [];
    const response = ctx.response ? responseView(ctx.response) : null;
    let skip = false;
    let nextRequest;

    const scopeApi = (name) => ({
      get: (k) => vars[name][k],
      set: (k, v) => { vars[name][k] = v === undefined || v === null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)); },
      unset: (k) => { delete vars[name][k]; },
      has: (k) => hasOwn(vars[name], k),
      clear: () => { vars[name] = {}; },
      toObject: () => Object.assign({}, vars[name]),
      replaceIn: (s) => substitute(s, vars)
    });
    const log = (level) => function () {
      const parts = Array.prototype.map.call(arguments, (a) => (typeof a === 'string' ? a : fmt(a)));
      logs.push({ level: level, text: parts.join(' '), event: ctx.event });
    };
    const consoleApi = { log: log('log'), info: log('info'), warn: log('warn'), error: log('error'), debug: log('log') };

    const headerApi = {
      add: (h) => { request.headers.push({ key: h.key, value: String(h.value), enabled: true }); },
      upsert: (h) => {
        const ex = request.headers.find((x) => String(x.key).toLowerCase() === String(h.key).toLowerCase());
        if (ex) { ex.value = String(h.value); ex.enabled = true; } else headerApi.add(h);
      },
      remove: (k) => { request.headers = request.headers.filter((x) => String(x.key).toLowerCase() !== String(k).toLowerCase()); },
      get: (k) => { const ex = request.headers.find((x) => x.enabled !== false && String(x.key).toLowerCase() === String(k).toLowerCase()); return ex ? ex.value : undefined; },
      has: (k) => headerApi.get(k) !== undefined,
      toObject: () => { const o = {}; request.headers.forEach((x) => { if (x.enabled !== false) o[x.key] = x.value; }); return o; }
    };
    const pmRequest = {
      get url() { return { toString: () => request.url, getHost: () => { try { return new URL(substitute(request.url, vars)).hostname; } catch (e) { return ''; } } }; },
      set url(v) { request.url = String(v); },
      get method() { return request.method; },
      set method(v) { request.method = String(v).toUpperCase(); },
      headers: headerApi,
      addHeader: headerApi.add,
      removeHeader: headerApi.remove,
      body: {
        get raw() { return request.bodyRaw; },
        set raw(v) { request.bodyRaw = String(v); request.bodyChanged = true; },
        update: (v) => { request.bodyRaw = typeof v === 'string' ? v : (v && v.raw !== undefined ? v.raw : JSON.stringify(v)); request.bodyChanged = true; }
      }
    };

    function runTest(name, fn) {
      const rec = { name: String(name), passed: true, error: null };
      tests.push(rec);
      try {
        const r = fn && fn();
        if (r && typeof r.then === 'function') {
          waits.push(r.then(() => {}, (e) => { rec.passed = false; rec.error = e && e.message ? e.message : String(e); }));
        }
      } catch (e) {
        rec.passed = false;
        rec.error = e && e.message ? e.message : String(e);
      }
    }
    runTest.skip = (name) => { tests.push({ name: String(name), passed: true, skipped: true, error: null }); };

    function sendRequest(spec, cb) {
      if (!opts.sendRequest) { const e = new Error('이 환경에서는 pm.sendRequest 를 지원하지 않아요'); if (cb) cb(e); return Promise.reject(e); }
      let r;
      if (typeof spec === 'string') r = { method: 'GET', url: substitute(spec, vars), headers: [], bodyText: null };
      else {
        const hs = [];
        const h = spec.header || spec.headers;
        if (Array.isArray(h)) h.forEach((x) => { if (typeof x === 'string') { const i = x.indexOf(':'); hs.push([x.slice(0, i).trim(), x.slice(i + 1).trim()]); } else hs.push([x.key, x.value]); });
        else if (h && typeof h === 'object') Object.keys(h).forEach((k) => hs.push([k, h[k]]));
        let bodyText = null;
        if (spec.body) {
          if (spec.body.mode === 'urlencoded') bodyText = (spec.body.urlencoded || []).map((x) => encodeURIComponent(x.key) + '=' + encodeURIComponent(x.value)).join('&');
          else if (spec.body.raw !== undefined) bodyText = typeof spec.body.raw === 'string' ? spec.body.raw : JSON.stringify(spec.body.raw);
        }
        r = { method: String(spec.method || 'GET').toUpperCase(), url: substitute(spec.url, vars), headers: hs.map(([k, v]) => [k, substitute(v, vars)]), bodyText: bodyText !== null ? substitute(bodyText, vars) : null };
      }
      const p = Promise.resolve(opts.sendRequest(r)).then((res) => {
        logs.push({ level: 'info', text: '[sendRequest] ' + r.method + ' ' + r.url + ' → ' + (res && res.ok ? res.status : '오류'), event: ctx.event });
        if (!res || !res.ok) {
          const err = new Error(res && res.error ? res.error.message : '요청 실패');
          if (cb) { try { cb(err, null); } catch (e) { logs.push({ level: 'error', text: e.message, event: ctx.event }); } }
          throw err;
        }
        const view = responseView(res);
        if (cb) { try { cb(null, view); } catch (e) { logs.push({ level: 'error', text: '콜백 오류: ' + e.message, event: ctx.event }); } }
        return view;
      });
      const guarded = p.catch(() => {});
      waits.push(guarded);
      return cb ? undefined : p;
    }

    const variablesApi = {
      get: (k) => { const r = lookup(vars, k); return r.found ? r.value : undefined; },
      set: (k, v) => { vars.local[k] = v === undefined || v === null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)); },
      has: (k) => lookup(vars, k).found,
      unset: (k) => { delete vars.local[k]; },
      replaceIn: (s) => substitute(s, vars),
      toObject: () => { const o = {}; SCOPES.slice().reverse().forEach((s) => Object.assign(o, vars[s])); return o; }
    };
    const pm = {
      test: runTest,
      expect: expect,
      environment: Object.assign(scopeApi('environment'), { name: (ctx.info && ctx.info.environmentName) || '' }),
      globals: scopeApi('globals'),
      collectionVariables: scopeApi('collection'),
      variables: variablesApi,
      iterationData: { get: (k) => vars.data[k], has: (k) => hasOwn(vars.data, k), toObject: () => Object.assign({}, vars.data), unset: () => {} },
      request: pmRequest,
      response: response,
      info: Object.assign({ eventName: ctx.event, iteration: 0, iterationCount: 1, requestName: '', requestId: '' }, ctx.info || {}),
      sendRequest: sendRequest,
      execution: { skipRequest: () => { skip = true; }, setNextRequest: (n) => { nextRequest = n; } },
      cookies: response ? response.cookies : { get: () => undefined },
      require: (m) => { throw new Error('모듈 "' + m + '" 은(는) 지원하지 않아요. (EasyAPI는 기본 pm API만 제공)'); }
    };
    // Postman 구버전 문법
    const legacyTests = {};
    const postman = {
      setEnvironmentVariable: pm.environment.set, getEnvironmentVariable: pm.environment.get, clearEnvironmentVariable: pm.environment.unset,
      setGlobalVariable: pm.globals.set, getGlobalVariable: pm.globals.get, clearGlobalVariable: pm.globals.unset,
      setNextRequest: (n) => { nextRequest = n; }
    };
    const responseBody = response ? response.text() : undefined;
    const responseCode = response ? { code: response.code, name: response.status, detail: response.status } : undefined;
    const responseTime = response ? response.responseTime : undefined;
    const responseHeaders = response ? response.headers.toObject() : undefined;

    let error = null;
    try {
      const fn = new Function('pm', 'console', 'tests', 'postman', 'responseBody', 'responseCode', 'responseTime', 'responseHeaders',
        'environment', 'globals', 'data', 'iteration', 'require', 'expect', '"use strict";\n' + code);
      const r = fn(pm, consoleApi, legacyTests, postman, responseBody, responseCode, responseTime, responseHeaders,
        pm.environment.toObject(), pm.globals.toObject(), pm.iterationData.toObject(), pm.info.iteration, pm.require, expect);
      if (r && typeof r.then === 'function') await r;
    } catch (e) {
      error = (e && e.name === 'SyntaxError' ? '문법 오류: ' : '') + (e && e.message ? e.message : String(e));
    }
    if (waits.length) await Promise.all(waits);
    Object.keys(legacyTests).forEach((k) => tests.push({ name: k, passed: !!legacyTests[k], error: legacyTests[k] ? null : '조건이 false 예요' }));
    return { tests: tests, logs: logs, vars: vars, request: request, error: error, skip: skip, nextRequest: nextRequest };
  }

  /* ================================================================== *
   * 노코드 검증 · 변수 추출
   * ================================================================== */
  const TARGETS = { status: '상태 코드', time: '응답 시간(ms)', size: '응답 크기(B)', header: '헤더', json: 'JSON 값', body: '본문' };
  const OPS = { eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', contains: '포함', notContains: '미포함', exists: '존재함', notExists: '없음', type: '타입은', regex: '정규식', in: '다음 중 하나' };
  const NO_VALUE_OPS = ['exists', 'notExists'];

  function assertionName(a) {
    const t = TARGETS[a.target] || a.target;
    const p = (a.target === 'header' || a.target === 'json') && a.path ? ' ' + a.path : '';
    return t + p + ' ' + (OPS[a.op] || a.op) + (NO_VALUE_OPS.indexOf(a.op) >= 0 ? '' : ' ' + (a.value === undefined ? '' : a.value));
  }

  function evalAssertion(a, res, vars) {
    const name = assertionName(a);
    if (!res || !res.ok) return { name, passed: false, error: '응답을 받지 못했어요', source: 'assert' };
    let actual;
    let found = true;
    if (a.target === 'status') actual = res.status;
    else if (a.target === 'time') actual = res.timeMs;
    else if (a.target === 'size') actual = res.size;
    else if (a.target === 'body') actual = res.bodyEncoding === 'base64' ? '' : (res.body || '');
    else if (a.target === 'header') {
      const h = (res.headers || []).find(([k]) => String(k).toLowerCase() === String(a.path || '').toLowerCase());
      found = !!h; actual = h ? h[1] : undefined;
    } else if (a.target === 'json') {
      let j;
      try { j = JSON.parse(res.body); } catch (e) { return { name, passed: false, error: '응답이 JSON 이 아니에요', source: 'assert' }; }
      const r = jsonPath(j, a.path);
      found = r.found; actual = r.value;
    }
    const exp = substitute(a.value === undefined ? '' : a.value, vars || {});
    const num = (v) => (typeof v === 'number' ? v : Number(v));
    const asText = (v) => (v === undefined ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)));
    let passed = false;
    switch (a.op) {
      case 'eq': case 'neq': {
        let eq;
        if (actual !== null && typeof actual === 'object') { try { eq = deepEqual(actual, JSON.parse(exp)); } catch (e) { eq = false; } }
        else eq = found && asText(actual) === exp;
        passed = a.op === 'eq' ? eq : !eq;
        break;
      }
      case 'gt': passed = found && num(actual) > num(exp); break;
      case 'gte': passed = found && num(actual) >= num(exp); break;
      case 'lt': passed = found && num(actual) < num(exp); break;
      case 'lte': passed = found && num(actual) <= num(exp); break;
      case 'contains': case 'notContains': {
        let c;
        if (Array.isArray(actual)) c = actual.some((v) => asText(v) === exp);
        else c = asText(actual).indexOf(exp) >= 0;
        passed = a.op === 'contains' ? found && c : !c;
        break;
      }
      case 'exists': passed = found && actual !== undefined && actual !== null; break;
      case 'notExists': passed = !found || actual === undefined || actual === null; break;
      case 'type': passed = found && typeOf(actual) === exp.trim().toLowerCase(); break;
      case 'regex': try { passed = found && new RegExp(exp).test(asText(actual)); } catch (e) { return { name, passed: false, error: '정규식 오류: ' + e.message, source: 'assert' }; } break;
      case 'in': passed = found && exp.split(',').map((s) => s.trim()).indexOf(asText(actual)) >= 0; break;
      default: passed = false;
    }
    return { name, passed, error: passed ? null : '실제값: ' + (found ? fmt(actual) : '(없음)'), source: 'assert' };
  }

  function evalExtraction(x, res) {
    if (!res || !res.ok) return { ok: false, error: '응답 없음' };
    let value;
    if (x.from === 'status') value = res.status;
    else if (x.from === 'header') {
      const h = (res.headers || []).find(([k]) => String(k).toLowerCase() === String(x.path || '').toLowerCase());
      if (!h) return { ok: false, error: '헤더 "' + x.path + '" 이(가) 없어요' };
      value = h[1];
    } else if (x.from === 'regex') {
      let m;
      try { m = new RegExp(x.path).exec(res.body || ''); } catch (e) { return { ok: false, error: '정규식 오류' }; }
      if (!m) return { ok: false, error: '일치하는 값이 없어요' };
      value = m[1] !== undefined ? m[1] : m[0];
    } else {
      let j;
      try { j = JSON.parse(res.body); } catch (e) { return { ok: false, error: '응답이 JSON 이 아니에요' }; }
      const r = jsonPath(j, x.path);
      if (!r.found) return { ok: false, error: x.path + ' 경로에 값이 없어요' };
      value = r.value;
    }
    return { ok: true, value: value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value) };
  }

  /* ================================================================== *
   * 요청 1건 실행 파이프라인
   *   item = { req, parent: { name, auth, preScript, testScript } }
   *   ctx  = { vars, cookieJar, info, cookieAuto }
   *   deps = { transport(resolved) => res, sandbox(code, sctx) => result }
   * ================================================================== */
  async function runItem(item, ctx, deps) {
    const req = clone(item.req);
    const parent = item.parent || {};
    const rec = {
      id: req.id, name: req.name || '요청', folder: parent.name || '', method: req.method, url: req.url,
      tests: [], logs: [], extracted: [], error: null, response: null, resolved: null, skipped: false, nextRequest: undefined
    };
    ctx.vars.local = ctx.vars.local || {};
    const applyVars = (out) => { SCOPES.forEach((s) => { if (s !== 'data') ctx.vars[s] = out.vars[s]; }); };
    const scriptCtx = (event) => ({
      event: event, vars: ctx.vars,
      request: { url: req.url, method: req.method, headers: req.headers || [], bodyRaw: req.body ? req.body.raw : '' },
      response: event === 'test' ? rec.response : null,
      info: Object.assign({ requestName: rec.name, requestId: req.id }, ctx.info || {})
    });

    // 1) Pre-request 스크립트 (상위 폴더 → 요청)
    const pre = [[parent.preScript, '폴더 Pre-request'], [req.preScript, 'Pre-request']].filter((x) => x[0] && x[0].trim());
    for (const [code, label] of pre) {
      const out = await deps.sandbox(code, scriptCtx('prerequest'));
      applyVars(out);
      rec.logs.push.apply(rec.logs, out.logs || []);
      (out.tests || []).forEach((t) => rec.tests.push(Object.assign({ source: 'pre' }, t)));
      if (out.error) rec.tests.push({ name: label + ' 스크립트 오류', passed: false, error: out.error, source: 'pre' });
      if (out.request) {
        req.url = out.request.url; req.method = out.request.method; req.headers = out.request.headers;
        if (out.request.bodyChanged && req.body) req.body.raw = out.request.bodyRaw;
      }
      if (out.skip) { rec.skipped = true; return rec; }
      if (out.nextRequest !== undefined) rec.nextRequest = out.nextRequest;
    }

    // 2) 요청 해석 & 전송
    let resolved;
    try {
      resolved = resolveRequest(req, ctx.vars, { parentAuth: parent.auth, cookieJar: ctx.cookieAuto ? ctx.cookieJar : null });
    } catch (e) {
      rec.error = { code: 'RESOLVE', message: e.message };
      return rec;
    }
    rec.resolved = resolved;
    rec.url = resolved.url;
    rec.method = resolved.method;
    if (resolved.missing.length) rec.logs.push({ level: 'warn', text: '정의되지 않은 변수: ' + resolved.missing.map((m) => '{{' + m + '}}').join(', '), event: 'request' });
    const res = await deps.transport(resolved);
    rec.response = res;
    if (!res || !res.ok) {
      rec.error = res && res.error ? res.error : { code: 'UNKNOWN', message: '응답 없음' };
    } else if (ctx.cookieJar && ctx.cookieAuto) {
      storeCookies(ctx.cookieJar, res.headers, res.url || resolved.url);
    }

    // 3) Tests 스크립트 (상위 폴더 → 요청)
    if (res && res.ok) {
      const post = [[parent.testScript, '폴더 Tests'], [req.testScript, 'Tests']].filter((x) => x[0] && x[0].trim());
      for (const [code, label] of post) {
        const out = await deps.sandbox(code, scriptCtx('test'));
        applyVars(out);
        rec.logs.push.apply(rec.logs, out.logs || []);
        (out.tests || []).forEach((t) => rec.tests.push(Object.assign({ source: 'script' }, t)));
        if (out.error) rec.tests.push({ name: label + ' 스크립트 오류', passed: false, error: out.error, source: 'script' });
        if (out.nextRequest !== undefined) rec.nextRequest = out.nextRequest;
      }
    }

    // 4) 노코드 검증
    (req.assertions || []).filter((a) => a.enabled !== false && a.target && a.op).forEach((a) => rec.tests.push(evalAssertion(a, res, ctx.vars)));

    // 5) 변수 추출
    (req.extracts || []).filter((x) => x.enabled !== false && x.varName).forEach((x) => {
      const r = evalExtraction(x, res);
      const scope = ({ environment: 'environment', collection: 'collection', globals: 'globals', global: 'globals' })[x.scope] || 'environment';
      if (r.ok) ctx.vars[scope][x.varName] = r.value;
      rec.extracted.push({ varName: x.varName, scope: scope, ok: r.ok, value: r.value, error: r.error });
      if (!r.ok) rec.logs.push({ level: 'warn', text: '변수 추출 실패 {{' + x.varName + '}}: ' + r.error, event: 'extract' });
    });
    return rec;
  }

  /* ================================================================== *
   * 컬렉션 러너
   *   items = [{ req, parent }], opts = { iterations, data:[{}], delay, bail, vars, cookieJar, cookieAuto }
   *   hooks = { onStart(i, item), onResult(rec, i), shouldStop() }
   * ================================================================== */
  async function runCollection(items, opts, deps, hooks) {
    hooks = hooks || {};
    const data = opts.data && opts.data.length ? opts.data : [];
    const iterations = Math.max(1, Number(opts.iterations) || (data.length || 1));
    const ctx = { vars: opts.vars, cookieJar: opts.cookieJar || [], cookieAuto: opts.cookieAuto !== false };
    SCOPES.forEach((s) => { ctx.vars[s] = ctx.vars[s] || {}; });
    const summary = {
      startedAt: Date.now(), finishedAt: null, iterations: iterations, results: [], stopped: false,
      stats: { requests: 0, requestErrors: 0, tests: 0, passed: 0, failed: 0, totalTime: 0, failedRequests: 0 }
    };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    outer:
    for (let i = 0; i < iterations; i++) {
      ctx.vars.data = data.length ? Object.assign({}, data[i % data.length]) : {};
      let idx = 0;
      let guard = 0;
      while (idx < items.length) {
        if (hooks.shouldStop && hooks.shouldStop()) { summary.stopped = true; break outer; }
        if (++guard > items.length * 20) break;
        const item = items[idx];
        if (hooks.onStart) hooks.onStart(i, item);
        ctx.vars.local = {};
        ctx.info = { iteration: i, iterationCount: iterations, environmentName: opts.environmentName || '' };
        const rec = await runItem(item, ctx, deps);
        rec.iteration = i;
        summary.results.push(rec);
        const st = summary.stats;
        st.requests++;
        if (rec.error) st.requestErrors++;
        if (rec.response && rec.response.timeMs) st.totalTime += rec.response.timeMs;
        let reqFailed = !!rec.error;
        rec.tests.forEach((t) => { if (t.skipped) return; st.tests++; if (t.passed) st.passed++; else { st.failed++; reqFailed = true; } });
        if (reqFailed) st.failedRequests++;
        if (hooks.onResult) hooks.onResult(rec, i);
        if (opts.bail && reqFailed) { summary.stopped = true; break outer; }
        // setNextRequest 지원
        if (rec.nextRequest === null) break;
        if (typeof rec.nextRequest === 'string') {
          const j = items.findIndex((it) => it.req.name === rec.nextRequest || it.req.id === rec.nextRequest);
          idx = j >= 0 ? j : idx + 1;
        } else idx++;
        if (opts.delay > 0) await sleep(opts.delay);
      }
    }
    summary.finishedAt = Date.now();
    summary.vars = ctx.vars;
    summary.cookieJar = ctx.cookieJar;
    return summary;
  }

  /* ================================================================== *
   * 리포트
   * ================================================================== */
  const xmlEsc = (s) => String(s === undefined || s === null ? '' : s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c])).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  const htmlEsc = (s) => String(s === undefined || s === null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

  function toJUnit(summary, name) {
    const suites = summary.results.map((r) => {
      const cases = r.tests.filter((t) => !t.skipped);
      const time = ((r.response && r.response.timeMs) || 0) / 1000;
      const failures = cases.filter((t) => !t.passed).length;
      let body = '';
      if (r.error) body += '    <testcase name="요청 전송" classname="' + xmlEsc(r.folder + '.' + r.name) + '" time="' + time + '"><error message="' + xmlEsc(r.error.message) + '" type="' + xmlEsc(r.error.code) + '"/></testcase>\n';
      cases.forEach((t) => {
        body += '    <testcase name="' + xmlEsc(t.name) + '" classname="' + xmlEsc(r.folder + '.' + r.name) + '" time="' + time + '">' +
          (t.passed ? '' : '<failure message="' + xmlEsc(t.error || 'failed') + '" type="AssertionFailure">' + xmlEsc(t.error || '') + '</failure>') + '</testcase>\n';
      });
      if (!cases.length && !r.error) body += '    <testcase name="요청 전송 (' + (r.response ? r.response.status : '-') + ')" classname="' + xmlEsc(r.folder + '.' + r.name) + '" time="' + time + '"/>\n';
      return '  <testsuite name="' + xmlEsc((summary.iterations > 1 ? '#' + (r.iteration + 1) + ' ' : '') + r.method + ' ' + r.name) + '" tests="' + Math.max(1, cases.length + (r.error ? 1 : 0)) +
        '" failures="' + failures + '" errors="' + (r.error ? 1 : 0) + '" time="' + time + '" timestamp="' + new Date(summary.startedAt).toISOString() + '">\n' + body + '  </testsuite>';
    });
    const s = summary.stats;
    return '<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="' + xmlEsc(name || 'EasyAPI') + '" tests="' + s.tests + '" failures="' + s.failed + '" errors="' + s.requestErrors +
      '" time="' + ((summary.finishedAt - summary.startedAt) / 1000) + '">\n' + suites.join('\n') + '\n</testsuites>\n';
  }

  function toMarkdown(summary, name, onlyFailed) {
    const s = summary.stats;
    let md = '## ' + (name || 'EasyAPI 실행 결과') + '\n\n';
    md += '- 실행: ' + new Date(summary.startedAt).toLocaleString() + ' · 반복 ' + summary.iterations + '회\n';
    md += '- 요청 ' + s.requests + '건 (실패 ' + s.failedRequests + ') · 테스트 ' + s.passed + '/' + s.tests + ' 통과 · 평균 ' + (s.requests ? Math.round(s.totalTime / s.requests) : 0) + 'ms\n\n';
    const rows = summary.results.filter((r) => !onlyFailed || r.error || r.tests.some((t) => !t.passed && !t.skipped));
    if (!rows.length) return md + (onlyFailed ? '실패 항목이 없어요. ✅\n' : '');
    md += '| # | 요청 | 상태 | 시간 | 실패 내용 |\n|---|---|---|---|---|\n';
    rows.forEach((r) => {
      const fails = r.error ? [r.error.message] : r.tests.filter((t) => !t.passed && !t.skipped).map((t) => t.name + ' → ' + (t.error || ''));
      md += '| ' + (r.iteration + 1) + ' | `' + r.method + '` ' + r.name + ' | ' + (r.response && r.response.ok ? r.response.status : '오류') + ' | ' + (r.response ? r.response.timeMs + 'ms' : '-') + ' | ' + (fails.join('<br>').replace(/\|/g, '\\|') || '-') + ' |\n';
    });
    return md;
  }

  function toHtmlReport(summary, name) {
    const s = summary.stats;
    const dur = ((summary.finishedAt - summary.startedAt) / 1000).toFixed(2);
    const rows = summary.results.map((r, i) => {
      const fail = r.error || r.tests.some((t) => !t.passed && !t.skipped);
      const tests = r.tests.map((t) => '<li class="' + (t.skipped ? 'skip' : (t.passed ? 'pass' : 'fail')) + '"><span>' + (t.skipped ? 'SKIP' : (t.passed ? 'PASS' : 'FAIL')) + '</span>' + htmlEsc(t.name) +
        (t.error && !t.passed ? '<div class="err">' + htmlEsc(t.error) + '</div>' : '') + '</li>').join('');
      const body = r.response && r.response.ok ? htmlEsc(String(r.response.body || '').slice(0, 4000)) : '';
      return '<details' + (fail ? ' open' : '') + ' class="' + (fail ? 'f' : 'p') + '"><summary><b class="dot"></b><code class="m">' + htmlEsc(r.method) + '</code>' +
        '<span class="n">' + htmlEsc(r.name) + '</span><span class="u">' + htmlEsc(r.url) + '</span>' +
        (summary.iterations > 1 ? '<span class="it">#' + (r.iteration + 1) + '</span>' : '') +
        '<span class="st">' + (r.response && r.response.ok ? r.response.status : 'ERR') + '</span><span class="t">' + (r.response ? r.response.timeMs + 'ms' : '-') + '</span></summary>' +
        (r.error ? '<p class="err">' + htmlEsc(r.error.message) + '</p>' : '') +
        (tests ? '<ul class="tests">' + tests + '</ul>' : '<p class="muted">테스트 없음</p>') +
        (body ? '<pre>' + body + '</pre>' : '') + '</details>';
    }).join('\n');
    return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + htmlEsc(name || 'EasyAPI 리포트') + '</title><style>' +
      ':root{--bg:#fafaf9;--s:#fff;--b:#e7e5e4;--t:#0c0a09;--m:#78716c;--ok:#15803d;--bad:#dc2626}@media(prefers-color-scheme:dark){:root{--bg:#0a0a0a;--s:#111;--b:#262626;--t:#fafafa;--m:#8f8f8f;--ok:#4ade80;--bad:#f87171}}' +
      'body{margin:0;background:var(--bg);color:var(--t);font:14px/1.5 -apple-system,"Pretendard","Malgun Gothic",system-ui,sans-serif}main{max-width:980px;margin:0 auto;padding:32px 16px}' +
      'h1{font-size:22px;letter-spacing:-.02em;margin:0 0 4px}.meta{color:var(--m);font-size:13px;margin-bottom:20px}.grid{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--b);border-radius:10px;overflow:hidden;margin-bottom:20px;background:var(--s)}' +
      '.grid div{padding:14px 16px;border-left:1px solid var(--b)}.grid div:first-child{border-left:0}.grid b{display:block;font-size:22px;font-family:ui-monospace,monospace}.grid span{font-size:12px;color:var(--m)}.ok{color:var(--ok)}.bad{color:var(--bad)}' +
      'details{background:var(--s);border:1px solid var(--b);border-radius:10px;margin-bottom:8px;overflow:hidden}summary{display:flex;gap:10px;align-items:center;padding:10px 14px;cursor:pointer;list-style:none}summary::-webkit-details-marker{display:none}' +
      '.dot{width:8px;height:8px;border-radius:50%;background:var(--ok);flex:none}.f .dot{background:var(--bad)}.m{font-size:11px;font-weight:600;width:52px}.n{font-weight:500}.u{color:var(--m);font:12px ui-monospace,monospace;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.st,.t,.it{font:12px ui-monospace,monospace;color:var(--m)}.tests{list-style:none;margin:0;padding:0 14px 10px}.tests li{padding:5px 0;border-top:1px solid var(--b);font-size:13px}.tests li span{display:inline-block;width:44px;font:600 11px ui-monospace,monospace}' +
      '.pass span{color:var(--ok)}.fail span{color:var(--bad)}.skip span{color:var(--m)}.err{color:var(--bad);font:12px ui-monospace,monospace;padding:2px 0 0 44px}p.err{padding:0 14px}pre{margin:0;padding:12px 14px;border-top:1px solid var(--b);font:12px/1.6 ui-monospace,monospace;white-space:pre-wrap;word-break:break-all;max-height:300px;overflow:auto;color:var(--m)}.muted{color:var(--m);padding:0 14px;font-size:13px}' +
      '@media(max-width:600px){.grid{grid-template-columns:1fr 1fr}.grid div:nth-child(3){border-left:0}.grid div:nth-child(n+3){border-top:1px solid var(--b)}.u{display:none}}</style></head><body><main>' +
      '<h1>' + htmlEsc(name || 'EasyAPI 실행 리포트') + '</h1><div class="meta">' + new Date(summary.startedAt).toLocaleString() + ' · ' + dur + '초 · 반복 ' + summary.iterations + '회' + (summary.stopped ? ' · 중단됨' : '') + '</div>' +
      '<div class="grid"><div><b>' + s.requests + '</b><span>요청</span></div><div><b class="' + (s.failedRequests ? 'bad' : 'ok') + '">' + s.failedRequests + '</b><span>실패한 요청</span></div>' +
      '<div><b class="' + (s.failed ? 'bad' : 'ok') + '">' + s.passed + '/' + s.tests + '</b><span>테스트 통과</span></div><div><b>' + (s.requests ? Math.round(s.totalTime / s.requests) : 0) + 'ms</b><span>평균 응답</span></div></div>' +
      rows + '<p class="meta" style="margin-top:24px">Generated by EasyAPI</p></main></body></html>';
  }

  /* ================================================================== *
   * CSV / JSON 데이터 파일
   * ================================================================== */
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let q = false;
    const s = String(text).replace(/^﻿/, '');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) {
        if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some((x) => x !== '')) rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some((x) => x !== '')) rows.push(row);
    if (!rows.length) return [];
    const head = rows.shift().map((h) => h.trim());
    return rows.map((r) => { const o = {}; head.forEach((h, i) => { o[h] = r[i] === undefined ? '' : r[i]; }); return o; });
  }
  function parseDataFile(text, name) {
    const t = String(text).trim();
    if (/\.json$/i.test(name || '') || /^[\[{]/.test(t)) {
      const j = JSON.parse(t);
      const arr = Array.isArray(j) ? j : [j];
      return arr.map((o) => { const r = {}; Object.keys(o || {}).forEach((k) => { r[k] = typeof o[k] === 'object' && o[k] !== null ? JSON.stringify(o[k]) : String(o[k]); }); return r; });
    }
    return parseCsv(t);
  }

  /* ================================================================== *
   * 모델 정규화 & Postman 변환
   * ================================================================== */
  function newRequest(id) {
    return {
      id: id || uuid(), name: '새 요청', method: 'GET', url: '', description: '',
      params: [], pathVars: [], headers: [],
      body: { mode: 'none', raw: '', rawType: 'text/plain', form: [], multipart: [], graphql: { query: '', variables: '' }, binary: null },
      auth: { type: 'inherit', bearer: '', username: '', password: '', apiKeyName: 'X-API-Key', apiKeyValue: '', apiKeyIn: 'header' },
      preScript: '', testScript: '', assertions: [], extracts: []
    };
  }
  function normalizeRequest(r) {
    r = r || {};
    const base = newRequest(r.id);
    const out = Object.assign(base, r);
    out.body = Object.assign(newRequest().body, r.body || {});
    out.body.graphql = Object.assign({ query: '', variables: '' }, (r.body && r.body.graphql) || {});
    out.auth = Object.assign(newRequest().auth, r.auth || {});
    ['params', 'pathVars', 'headers', 'assertions', 'extracts'].forEach((k) => { out[k] = Array.isArray(r[k]) ? r[k] : []; });
    ['preScript', 'testScript', 'description'].forEach((k) => { out[k] = typeof r[k] === 'string' ? r[k] : ''; });
    const M = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    out.method = M.indexOf(String(out.method).toUpperCase()) >= 0 ? String(out.method).toUpperCase() : 'GET';
    return out;
  }
  function normalizeCollection(c) {
    c = c || {};
    return Object.assign({ id: uuid(), name: '컬렉션', open: true, requests: [], description: '', preScript: '', testScript: '', variables: [] }, c, {
      auth: Object.assign({ type: 'none', bearer: '', username: '', password: '', apiKeyName: 'X-API-Key', apiKeyValue: '', apiKeyIn: 'header' }, c.auth || {}),
      requests: (c.requests || []).map(normalizeRequest),
      variables: Array.isArray(c.variables) ? c.variables : []
    });
  }

  const scriptOf = (events, listen) => {
    const e = (events || []).find((x) => x.listen === listen);
    if (!e || !e.script) return '';
    return Array.isArray(e.script.exec) ? e.script.exec.join('\n') : String(e.script.exec || '');
  };
  const pmAuthIn = (a) => {
    const val = (arr, k) => { const f = (arr || []).find((x) => x.key === k); return f ? String(f.value) : ''; };
    const out = { type: 'none' };
    if (!a) return { type: 'inherit' };
    if (a.type === 'noauth') return out;
    if (a.type === 'bearer') return { type: 'bearer', bearer: val(a.bearer, 'token') };
    if (a.type === 'basic') return { type: 'basic', username: val(a.basic, 'username'), password: val(a.basic, 'password') };
    if (a.type === 'apikey') return { type: 'apikey', apiKeyName: val(a.apikey, 'key'), apiKeyValue: val(a.apikey, 'value'), apiKeyIn: val(a.apikey, 'in') === 'query' ? 'query' : 'header' };
    return out;
  };

  function fromPostman(pm) {
    const cols = [];
    const rootName = (pm.info && pm.info.name) || 'Postman 컬렉션';
    const conv = (item) => {
      const rq = item.request || {};
      const r = newRequest();
      r.name = item.name || '요청';
      r.method = String(rq.method || 'GET').toUpperCase();
      r.url = typeof rq.url === 'string' ? rq.url : ((rq.url && rq.url.raw) || '');
      r.description = typeof rq.description === 'string' ? rq.description : ((rq.description && rq.description.content) || '');
      const q = r.url.indexOf('?');
      r.params = q >= 0 ? r.url.slice(q + 1).split('#')[0].split('&').filter(Boolean).map((p) => { const i = p.indexOf('='); return { key: decodeURIComponent(i < 0 ? p : p.slice(0, i)), value: i < 0 ? '' : decodeURIComponent(p.slice(i + 1).replace(/\+/g, ' ')), enabled: true }; }) : [];
      if (rq.url && Array.isArray(rq.url.variable)) r.pathVars = rq.url.variable.map((v) => ({ key: v.key, value: v.value === undefined ? '' : String(v.value), enabled: true }));
      r.headers = (rq.header || []).map((h) => ({ key: h.key, value: h.value, enabled: !h.disabled }));
      const b = rq.body || {};
      if (b.mode === 'raw') {
        const lang = b.options && b.options.raw && b.options.raw.language;
        r.body.mode = lang === 'json' || /^[\[{]/.test((b.raw || '').trim()) ? 'json' : 'raw';
        r.body.raw = b.raw || '';
        if (lang === 'xml') r.body.rawType = 'application/xml';
      } else if (b.mode === 'urlencoded') {
        r.body.mode = 'form';
        r.body.form = (b.urlencoded || []).map((x) => ({ key: x.key, value: x.value || '', enabled: !x.disabled }));
      } else if (b.mode === 'formdata') {
        r.body.mode = 'multipart';
        r.body.multipart = (b.formdata || []).map((x) => ({ key: x.key, value: x.value || '', type: x.type === 'file' ? 'file' : 'text', fileName: Array.isArray(x.src) ? x.src[0] : (x.src || ''), enabled: !x.disabled }));
      } else if (b.mode === 'graphql') {
        r.body.mode = 'graphql';
        r.body.graphql = { query: (b.graphql && b.graphql.query) || '', variables: (b.graphql && b.graphql.variables) || '' };
      }
      r.auth = Object.assign(r.auth, pmAuthIn(rq.auth));
      r.preScript = scriptOf(item.event, 'prerequest');
      r.testScript = scriptOf(item.event, 'test');
      return r;
    };
    const walk = (items, name, parent) => {
      const col = normalizeCollection({
        name: name, requests: [],
        auth: parent.auth ? pmAuthIn(parent.auth) : { type: 'none' },
        preScript: scriptOf(parent.event, 'prerequest'),
        testScript: scriptOf(parent.event, 'test'),
        variables: (parent.variable || []).map((v) => ({ key: v.key, value: v.value === undefined ? '' : String(v.value), enabled: !v.disabled })),
        description: typeof parent.description === 'string' ? parent.description : ''
      });
      if (col.auth.type === 'inherit') col.auth.type = 'none';
      const sub = [];
      (items || []).forEach((it) => {
        if (it.item) sub.push(it);
        else if (it.request) col.requests.push(conv(it));
      });
      if (col.requests.length || !sub.length) cols.push(col);
      sub.forEach((it) => {
        // 하위 폴더: 상위 인증/스크립트를 이어받음
        const merged = Object.assign({}, it, {
          auth: it.auth || parent.auth,
          event: [{ listen: 'prerequest', script: { exec: [scriptOf(parent.event, 'prerequest'), scriptOf(it.event, 'prerequest')].filter(Boolean) } },
            { listen: 'test', script: { exec: [scriptOf(parent.event, 'test'), scriptOf(it.event, 'test')].filter(Boolean) } }],
          variable: (parent.variable || []).concat(it.variable || [])
        });
        walk(it.item, name + ' / ' + it.name, merged);
      });
    };
    walk(pm.item, rootName, pm);
    return cols;
  }

  function toPostman(col) {
    const authOut = (a) => {
      if (!a || a.type === 'inherit') return undefined;
      if (a.type === 'none') return { type: 'noauth' };
      if (a.type === 'bearer') return { type: 'bearer', bearer: [{ key: 'token', value: a.bearer, type: 'string' }] };
      if (a.type === 'basic') return { type: 'basic', basic: [{ key: 'username', value: a.username, type: 'string' }, { key: 'password', value: a.password, type: 'string' }] };
      if (a.type === 'apikey') return { type: 'apikey', apikey: [{ key: 'key', value: a.apiKeyName }, { key: 'value', value: a.apiKeyValue }, { key: 'in', value: a.apiKeyIn }] };
      return undefined;
    };
    const ev = (pre, test) => {
      const e = [];
      if (pre && pre.trim()) e.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: pre.split('\n') } });
      if (test && test.trim()) e.push({ listen: 'test', script: { type: 'text/javascript', exec: test.split('\n') } });
      return e.length ? e : undefined;
    };
    const assertionsToScript = (r) => {
      // 노코드 검증/추출을 Postman 스크립트로 변환 (Newman 에서도 동작)
      const lines = [];
      (r.assertions || []).filter((a) => a.enabled !== false).forEach((a) => {
        const exp = JSON.stringify(String(a.value === undefined ? '' : a.value));
        let actual = { status: 'pm.response.code', time: 'pm.response.responseTime', size: 'pm.response.responseSize', body: 'pm.response.text()' }[a.target];
        if (a.target === 'header') actual = 'pm.response.headers.get(' + JSON.stringify(a.path || '') + ')';
        if (a.target === 'json') actual = '(function(){ var j = pm.response.json(); var p = ' + JSON.stringify(String(a.path || '').replace(/^\$\.?/, '')) + '; return p ? p.replace(/\\[(\\d+)\\]/g, ".$1").split(".").reduce(function(o,k){ return o == null ? undefined : o[k]; }, j) : j; })()';
        const body = {
          eq: 'pm.expect(String(v)).to.eql(' + exp + ');', neq: 'pm.expect(String(v)).to.not.eql(' + exp + ');',
          gt: 'pm.expect(Number(v)).to.be.above(Number(' + exp + '));', gte: 'pm.expect(Number(v)).to.be.at.least(Number(' + exp + '));',
          lt: 'pm.expect(Number(v)).to.be.below(Number(' + exp + '));', lte: 'pm.expect(Number(v)).to.be.at.most(Number(' + exp + '));',
          contains: 'pm.expect(typeof v === "string" ? v : JSON.stringify(v)).to.include(' + exp + ');', notContains: 'pm.expect(typeof v === "string" ? v : JSON.stringify(v)).to.not.include(' + exp + ');',
          exists: 'pm.expect(v).to.exist;', notExists: 'pm.expect(v).to.not.exist;', type: 'pm.expect(v).to.be.a(' + exp + ');',
          regex: 'pm.expect(String(v)).to.match(new RegExp(' + exp + '));', in: 'pm.expect(' + exp + '.split(",").map(function(s){return s.trim();})).to.include(String(v));'
        }[a.op];
        if (body) lines.push('pm.test(' + JSON.stringify(assertionName(a)) + ', function () { var v = ' + actual + '; ' + body + ' });');
      });
      (r.extracts || []).filter((x) => x.enabled !== false && x.varName).forEach((x) => {
        const set = ({ collection: 'pm.collectionVariables', globals: 'pm.globals' })[x.scope] || 'pm.environment';
        let src = 'pm.response.code';
        if (x.from === 'header') src = 'pm.response.headers.get(' + JSON.stringify(x.path || '') + ')';
        else if (x.from === 'regex') src = '(function(){ var m = new RegExp(' + JSON.stringify(x.path || '') + ').exec(pm.response.text()); return m ? (m[1] !== undefined ? m[1] : m[0]) : undefined; })()';
        else if (x.from !== 'status') src = JSON.stringify(String(x.path || '').replace(/^\$\.?/, '')) + '.replace(/\\[(\\d+)\\]/g, ".$1").split(".").reduce(function(o,k){ return o == null ? undefined : o[k]; }, pm.response.json())';
        lines.push('(function(){ var v = ' + src + '; if (v !== undefined) ' + set + '.set(' + JSON.stringify(x.varName) + ', typeof v === "object" ? JSON.stringify(v) : v); })();');
      });
      return lines.length ? '// ↓ EasyAPI 노코드 검증/추출에서 자동 변환\n' + lines.join('\n') : '';
    };
    const item = (r) => {
      const urlRaw = r.url || '';
      const body = (() => {
        const b = r.body || {};
        if (b.mode === 'json') return { mode: 'raw', raw: b.raw, options: { raw: { language: 'json' } } };
        if (b.mode === 'raw') return { mode: 'raw', raw: b.raw, options: { raw: { language: /xml/.test(b.rawType) ? 'xml' : 'text' } } };
        if (b.mode === 'form') return { mode: 'urlencoded', urlencoded: (b.form || []).map((x) => ({ key: x.key, value: x.value, disabled: x.enabled === false || undefined })) };
        if (b.mode === 'multipart') return { mode: 'formdata', formdata: (b.multipart || []).map((x) => (x.type === 'file' ? { key: x.key, type: 'file', src: x.fileName || (x.file && x.file.name) || '' } : { key: x.key, value: x.value, type: 'text' })) };
        if (b.mode === 'graphql') return { mode: 'graphql', graphql: { query: b.graphql.query, variables: b.graphql.variables } };
        return undefined;
      })();
      const test = [r.testScript, assertionsToScript(r)].filter((x) => x && x.trim()).join('\n\n');
      const out = {
        name: r.name,
        request: {
          method: r.method,
          header: (r.headers || []).filter((h) => h.key).map((h) => ({ key: h.key, value: h.value, disabled: h.enabled === false || undefined })),
          url: { raw: urlRaw, variable: (r.pathVars || []).length ? r.pathVars.map((p) => ({ key: p.key, value: p.value })) : undefined },
          description: r.description || undefined
        }
      };
      if (body) out.request.body = body;
      const au = authOut(r.auth);
      if (au) out.request.auth = au;
      const e = ev(r.preScript, test);
      if (e) out.event = e;
      return out;
    };
    const out = {
      info: { name: col.name, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json', description: col.description || undefined },
      item: col.requests.map(item),
      variable: (col.variables || []).filter((v) => v.key).map((v) => ({ key: v.key, value: v.value, disabled: v.enabled === false || undefined }))
    };
    const au = authOut(col.auth);
    if (au && col.auth.type !== 'none') out.auth = au;
    const e = ev(col.preScript, col.testScript);
    if (e) out.event = e;
    return out;
  }

  /* ================================================================== *
   * 스크립트 스니펫 (Postman 과 동일한 사용법)
   * ================================================================== */
  const SNIPPETS = {
    test: [
      ['상태 코드가 200', 'pm.test("상태 코드가 200", function () {\n  pm.response.to.have.status(200);\n});'],
      ['응답 시간 500ms 미만', 'pm.test("응답 시간 500ms 미만", function () {\n  pm.expect(pm.response.responseTime).to.be.below(500);\n});'],
      ['JSON 값 확인', 'pm.test("JSON 값 확인", function () {\n  const json = pm.response.json();\n  pm.expect(json.id).to.eql(1);\n});'],
      ['본문에 문자열 포함', 'pm.test("본문에 문자열 포함", function () {\n  pm.expect(pm.response.text()).to.include("success");\n});'],
      ['헤더 존재 확인', 'pm.test("Content-Type 헤더 존재", function () {\n  pm.response.to.have.header("Content-Type");\n});'],
      ['배열 길이 확인', 'pm.test("목록이 비어있지 않음", function () {\n  const json = pm.response.json();\n  pm.expect(json).to.be.an("array").that.is.not.empty;\n});'],
      ['응답값 → 환경 변수 저장', 'const json = pm.response.json();\npm.environment.set("token", json.token);'],
      ['응답값 → 전역 변수 저장', 'pm.globals.set("userId", pm.response.json().id);'],
      ['JSON 스키마 필드 확인', 'pm.test("필수 필드 존재", function () {\n  const json = pm.response.json();\n  pm.expect(json).to.have.keys(["id", "name"]);\n});'],
      ['콘솔에 출력', 'console.log(pm.response.json());']
    ],
    pre: [
      ['환경 변수 설정', 'pm.environment.set("key", "value");'],
      ['타임스탬프 변수', 'pm.variables.set("now", Date.now());'],
      ['랜덤 이메일 생성', 'pm.variables.set("email", "qa_" + Date.now() + "@example.com");'],
      ['헤더 추가', 'pm.request.headers.upsert({ key: "X-Request-Id", value: pm.variables.replaceIn("{{$guid}}") });'],
      ['다른 요청 먼저 보내기 (토큰 발급)', 'pm.sendRequest({\n  url: pm.variables.replaceIn("{{baseUrl}}/login"),\n  method: "POST",\n  header: { "Content-Type": "application/json" },\n  body: { mode: "raw", raw: JSON.stringify({ username: "qa", password: "1234" }) }\n}, function (err, res) {\n  if (!err) pm.environment.set("token", res.json().token);\n});'],
      ['조건부로 요청 건너뛰기', 'if (!pm.environment.get("token")) {\n  pm.execution.skipRequest();\n}']
    ]
  };

  return {
    DYNAMIC, SCOPES, TARGETS, OPS, NO_VALUE_OPS, SNIPPETS,
    rowsToMap, mergeMapIntoRows, lookup, substitute, pathVarNames,
    resolveRequest, bodySpec, jsonPath, expect, AssertionError, executeScript, responseView,
    assertionName, evalAssertion, evalExtraction, runItem, runCollection,
    toJUnit, toMarkdown, toHtmlReport, parseCsv, parseDataFile,
    parseSetCookie, storeCookies, cookieHeaderFor,
    newRequest, normalizeRequest, normalizeCollection, fromPostman, toPostman,
    deepEqual, typeOf, b64encode, uuid, clone
  };
});
