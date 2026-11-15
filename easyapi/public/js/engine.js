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
    if (a.type === 'oauth2' && !has('authorization')) {
      const tk = opts.oauthCache ? opts.oauthCache[oauthKey(a, vars)] : null;
      if (tk && tk.accessToken) headers.push(['Authorization', (/^bearer$/i.test(tk.tokenType || 'Bearer') ? 'Bearer' : tk.tokenType) + ' ' + tk.accessToken]);
    }
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
  addMethod(['jsonSchema'], function (schema) {
    let v = this._s;
    if (this._res) { try { v = JSON.parse(this._s.text()); } catch (e) { return this._ok(false, '본문이 JSON 이 아니에요', ''); } }
    const errs = validateSchema(v, schema);
    return this._ok(!errs.length, '스키마 불일치: ' + errs.slice(0, 3).map((e) => e.path + ' ' + e.message).join(' · '), '스키마와 일치하면 안 돼요');
  });

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
    const tv4 = {
      error: null,
      validate: function (d, sc) { const e = validateSchema(d, sc); tv4.error = e.length ? { message: e[0].path + ' ' + e[0].message, dataPath: e[0].path } : null; return !e.length; },
      validateResult: function (d, sc) { const e = validateSchema(d, sc); return { valid: !e.length, error: e[0] || null, errors: e }; }
    };
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
        'environment', 'globals', 'data', 'iteration', 'require', 'expect', 'tv4', '"use strict";\n' + code);
      const r = fn(pm, consoleApi, legacyTests, postman, responseBody, responseCode, responseTime, responseHeaders,
        pm.environment.toObject(), pm.globals.toObject(), pm.iterationData.toObject(), pm.info.iteration, pm.require, expect, tv4);
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
  const TARGETS = { status: '상태 코드', time: '응답 시간(ms)', size: '응답 크기(B)', header: '헤더', json: 'JSON 값', body: '본문', schema: 'JSON 스키마', baseline: '기준 응답' };
  const OPS = { eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', contains: '포함', notContains: '미포함', exists: '존재함', notExists: '없음', type: '타입은', regex: '정규식', in: '다음 중 하나', schema: '일치' };
  const NO_VALUE_OPS = ['exists', 'notExists'];

  function assertionName(a) {
    if (a.target === 'schema') return 'JSON 스키마 일치' + (a.path && a.path !== '$' ? ' (' + a.path + ')' : '');
    if (a.target === 'baseline') return '기준 응답과 동일' + (a.value ? ' (제외: ' + a.value + ')' : '');
    const t = TARGETS[a.target] || a.target;
    const p = (a.target === 'header' || a.target === 'json') && a.path ? ' ' + a.path : '';
    return t + p + ' ' + (OPS[a.op] || a.op) + (NO_VALUE_OPS.indexOf(a.op) >= 0 ? '' : ' ' + (a.value === undefined ? '' : a.value));
  }

  function evalAssertion(a, res, vars, extra) {
    const name = assertionName(a);
    if (!res || !res.ok) return { name, passed: false, error: '응답을 받지 못했어요', source: 'assert' };
    if (a.target === 'schema') {
      let schema, j;
      try { schema = JSON.parse(a.value || '{}'); } catch (e) { return { name, passed: false, error: '스키마 JSON 형식 오류: ' + e.message, source: 'assert' }; }
      try { j = JSON.parse(res.body); } catch (e) { return { name, passed: false, error: '응답이 JSON 이 아니에요', source: 'assert' }; }
      const sub = a.path ? jsonPath(j, a.path) : { found: true, value: j };
      if (!sub.found) return { name, passed: false, error: a.path + ' 경로에 값이 없어요', source: 'assert' };
      const errs = validateSchema(sub.value, schema);
      return { name, passed: !errs.length, error: errs.length ? errs.slice(0, 3).map((e) => e.path + ' ' + e.message).join(' · ') + (errs.length > 3 ? ' 외 ' + (errs.length - 3) + '건' : '') : null, source: 'assert', details: errs };
    }
    if (a.target === 'baseline') {
      const base = extra && extra.baseline;
      if (!base) return { name, passed: false, error: '저장된 기준 응답이 없어요 (응답 → "기준 응답으로 저장")', source: 'assert' };
      const diffs = compareResponses(base, res, a.value);
      return { name, passed: !diffs.length, error: diffs.length ? diffs.length + '군데 다름: ' + diffs.slice(0, 3).map((d) => d.path + ' ' + fmt(d.a) + ' → ' + fmt(d.b)).join(' · ') : null, source: 'assert', details: diffs };
    }
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
    for (const [code, label] of (deps.sandbox ? pre : [])) {
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
    // OAuth 2.0 토큰 자동 발급/갱신
    const effAuth = req.auth && req.auth.type === 'inherit' ? (parent.auth || { type: 'none' }) : (req.auth || { type: 'none' });
    if (effAuth.type === 'oauth2') {
      ctx.oauthCache = ctx.oauthCache || {};
      const key = oauthKey(effAuth, ctx.vars);
      if (!tokenValid(ctx.oauthCache[key])) {
        try {
          ctx.oauthCache[key] = await fetchOAuthToken(effAuth, ctx.vars, deps.transport);
          rec.oauthRefreshed = true;
          rec.logs.push({ level: 'info', text: 'OAuth 2.0 토큰을 발급받았어요 (' + (effAuth.oauthGrant || 'client_credentials') + ')', event: 'auth' });
        } catch (e) {
          rec.error = { code: 'OAUTH', message: e.message };
          return rec;
        }
      }
    }
    let resolved;
    try {
      resolved = resolveRequest(req, ctx.vars, { parentAuth: parent.auth, cookieJar: ctx.cookieAuto ? ctx.cookieJar : null, oauthCache: ctx.oauthCache });
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
      for (const [code, label] of (deps.sandbox ? post : [])) {
        const out = await deps.sandbox(code, scriptCtx('test'));
        applyVars(out);
        rec.logs.push.apply(rec.logs, out.logs || []);
        (out.tests || []).forEach((t) => rec.tests.push(Object.assign({ source: 'script' }, t)));
        if (out.error) rec.tests.push({ name: label + ' 스크립트 오류', passed: false, error: out.error, source: 'script' });
        if (out.nextRequest !== undefined) rec.nextRequest = out.nextRequest;
      }
    }

    // 4) 노코드 검증
    (req.assertions || []).filter((a) => a.enabled !== false && a.target && a.op).forEach((a) => rec.tests.push(evalAssertion(a, res, ctx.vars, { baseline: req.baseline })));

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
    const ctx = { vars: opts.vars, cookieJar: opts.cookieJar || [], cookieAuto: opts.cookieAuto !== false, oauthCache: opts.oauthCache || {} };
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
      auth: { type: 'inherit', bearer: '', username: '', password: '', apiKeyName: 'X-API-Key', apiKeyValue: '', apiKeyIn: 'header', oauthGrant: 'client_credentials', tokenUrl: '', clientId: '', clientSecret: '', scope: '', oauthUser: '', oauthPass: '', clientAuth: 'body' },
      preScript: '', testScript: '', assertions: [], extracts: [], baseline: null
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
      auth: Object.assign({ type: 'none', bearer: '', username: '', password: '', apiKeyName: 'X-API-Key', apiKeyValue: '', apiKeyIn: 'header', oauthGrant: 'client_credentials', tokenUrl: '', clientId: '', clientSecret: '', scope: '', oauthUser: '', oauthPass: '', clientAuth: 'body' }, c.auth || {}),
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
    if (a.type === 'oauth2') return { type: 'oauth2', oauthGrant: /password/.test(val(a.oauth2, 'grant_type')) ? 'password' : 'client_credentials', tokenUrl: val(a.oauth2, 'accessTokenUrl'), clientId: val(a.oauth2, 'clientId'), clientSecret: val(a.oauth2, 'clientSecret'), scope: val(a.oauth2, 'scope'), oauthUser: val(a.oauth2, 'username'), oauthPass: val(a.oauth2, 'password'), clientAuth: val(a.oauth2, 'client_authentication') === 'header' ? 'header' : 'body' };
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
      if (a.type === 'oauth2') return { type: 'oauth2', oauth2: [{ key: 'grant_type', value: a.oauthGrant === 'password' ? 'password_credentials' : 'client_credentials' }, { key: 'accessTokenUrl', value: a.tokenUrl }, { key: 'clientId', value: a.clientId }, { key: 'clientSecret', value: a.clientSecret }, { key: 'scope', value: a.scope }, { key: 'username', value: a.oauthUser }, { key: 'password', value: a.oauthPass }, { key: 'client_authentication', value: a.clientAuth }] };
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
        if (a.target === 'schema') { lines.push('pm.test(' + JSON.stringify(assertionName(a)) + ', function () { pm.response.to.have.jsonSchema(' + (a.value || '{}') + '); });'); return; }
        if (a.target === 'baseline') { lines.push('// (EasyAPI 전용) 기준 응답 비교는 Postman 에서 지원되지 않아 제외됨'); return; }
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
   * JSON 스키마 검증 (Draft-07 주요 키워드 + OpenAPI nullable)
   * ================================================================== */
  const FORMATS = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'date-time': /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/i,
    date: /^\d{4}-\d{2}-\d{2}$/,
    time: /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/i,
    uri: /^[a-z][a-z0-9+.-]*:\S+$/i,
    ipv4: /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
  };
  function resolveRef(ref, root) {
    if (typeof ref !== 'string' || ref.charAt(0) !== '#') return undefined;
    return ref.slice(1).split('/').filter(Boolean).reduce((o, k) => (o === null || o === undefined ? undefined : o[decodeURIComponent(k).replace(/~1/g, '/').replace(/~0/g, '~')]), root);
  }
  const keyPath = (path, k) => path + (/^[A-Za-z_$][\w$]*$/.test(k) ? '.' + k : '[' + JSON.stringify(k) + ']');

  function validateSchema(data, schema, opts) {
    opts = opts || {};
    const root = opts.root || schema;
    const errors = [];
    const max = opts.maxErrors || 30;
    const typeMatch = (v, t) => {
      if (t === 'integer') return typeof v === 'number' && Number.isInteger(v);
      if (t === 'number') return typeof v === 'number' && isFinite(v);
      return typeOf(v) === t;
    };
    const push = (path, message) => { if (errors.length < max) errors.push({ path, message }); };
    const passes = (v, s) => validateSchema(v, s, { root: root, maxErrors: 1 }).length === 0;
    function walk(v, s, path, depth) {
      if (errors.length >= max || s === undefined || s === null || s === true) return;
      if (s === false) { push(path, '허용되지 않는 값이에요'); return; }
      if (depth > 80) return;
      if (s.$ref) {
        const r = resolveRef(s.$ref, root);
        if (r === undefined) { push(path, '$ref 를 찾을 수 없어요: ' + s.$ref); return; }
        walk(v, r, path, depth + 1);
        return;
      }
      if (v === null && s.nullable === true) return;
      if (s.type !== undefined) {
        const types = [].concat(s.type);
        if (!types.some((t) => typeMatch(v, t))) { push(path, '타입이 ' + types.join(' | ') + ' 이어야 하는데 ' + typeOf(v) + ' 이에요'); return; }
      }
      if (Array.isArray(s.enum) && !s.enum.some((e) => deepEqual(e, v))) push(path, fmt(v) + ' 은(는) 허용 값 ' + fmt(s.enum) + ' 에 없어요');
      if (hasOwn(s, 'const') && !deepEqual(s.const, v)) push(path, fmt(s.const) + ' 이어야 해요');
      if (typeof v === 'number') {
        if (typeof s.minimum === 'number' && (s.exclusiveMinimum === true ? v <= s.minimum : v < s.minimum)) push(path, v + ' 은(는) ' + s.minimum + (s.exclusiveMinimum === true ? ' 보다 커야' : ' 이상이어야') + ' 해요');
        if (typeof s.maximum === 'number' && (s.exclusiveMaximum === true ? v >= s.maximum : v > s.maximum)) push(path, v + ' 은(는) ' + s.maximum + (s.exclusiveMaximum === true ? ' 보다 작아야' : ' 이하여야') + ' 해요');
        if (typeof s.exclusiveMinimum === 'number' && v <= s.exclusiveMinimum) push(path, v + ' 은(는) ' + s.exclusiveMinimum + ' 보다 커야 해요');
        if (typeof s.exclusiveMaximum === 'number' && v >= s.exclusiveMaximum) push(path, v + ' 은(는) ' + s.exclusiveMaximum + ' 보다 작아야 해요');
        if (typeof s.multipleOf === 'number' && s.multipleOf > 0 && Math.abs(v / s.multipleOf - Math.round(v / s.multipleOf)) > 1e-9) push(path, v + ' 은(는) ' + s.multipleOf + ' 의 배수여야 해요');
      }
      if (typeof v === 'string') {
        const len = Array.from(v).length;
        if (typeof s.minLength === 'number' && len < s.minLength) push(path, '길이가 ' + s.minLength + ' 이상이어야 해요 (현재 ' + len + ')');
        if (typeof s.maxLength === 'number' && len > s.maxLength) push(path, '길이가 ' + s.maxLength + ' 이하여야 해요 (현재 ' + len + ')');
        if (s.pattern) { try { if (!new RegExp(s.pattern, 'u').test(v)) push(path, fmt(v) + ' 이(가) 패턴 ' + s.pattern + ' 과 맞지 않아요'); } catch (e) { /* 잘못된 패턴 무시 */ } }
        if (s.format && FORMATS[s.format] && !FORMATS[s.format].test(v)) push(path, fmt(v) + ' 은(는) ' + s.format + ' 형식이 아니에요');
      }
      if (Array.isArray(v)) {
        if (typeof s.minItems === 'number' && v.length < s.minItems) push(path, '항목이 ' + s.minItems + '개 이상이어야 해요 (현재 ' + v.length + ')');
        if (typeof s.maxItems === 'number' && v.length > s.maxItems) push(path, '항목이 ' + s.maxItems + '개 이하여야 해요 (현재 ' + v.length + ')');
        if (s.uniqueItems && v.some((x, i) => v.findIndex((y) => deepEqual(x, y)) !== i)) push(path, '중복 항목이 있어요');
        if (Array.isArray(s.items)) s.items.forEach((is, i) => { if (i < v.length) walk(v[i], is, path + '[' + i + ']', depth + 1); });
        else if (s.items) v.forEach((x, i) => walk(x, s.items, path + '[' + i + ']', depth + 1));
        if (s.contains && !v.some((x) => passes(x, s.contains))) push(path, 'contains 조건을 만족하는 항목이 없어요');
      }
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        (s.required || []).forEach((k) => { if (!hasOwn(v, k)) push(keyPath(path, k), '필수 속성이 없어요'); });
        const props = s.properties || {};
        Object.keys(v).forEach((k) => {
          const p = keyPath(path, k);
          if (hasOwn(props, k)) walk(v[k], props[k], p, depth + 1);
          else if (s.additionalProperties === false) push(p, '스키마에 정의되지 않은 속성이에요');
          else if (s.additionalProperties && typeof s.additionalProperties === 'object') walk(v[k], s.additionalProperties, p, depth + 1);
        });
        if (typeof s.minProperties === 'number' && Object.keys(v).length < s.minProperties) push(path, '속성이 ' + s.minProperties + '개 이상이어야 해요');
      }
      if (Array.isArray(s.allOf)) s.allOf.forEach((x) => walk(v, x, path, depth + 1));
      if (Array.isArray(s.anyOf) && !s.anyOf.some((x) => passes(v, x))) push(path, 'anyOf 의 어느 스키마에도 맞지 않아요');
      if (Array.isArray(s.oneOf)) {
        const c = s.oneOf.filter((x) => passes(v, x)).length;
        if (c !== 1) push(path, 'oneOf 중 정확히 1개와 맞아야 하는데 ' + c + '개와 맞아요');
      }
      if (s.not && passes(v, s.not)) push(path, 'not 조건에 해당해요');
    }
    walk(data, schema, '$', 0);
    return errors;
  }

  /** $ref 를 펼쳐 독립 스키마로 (순환 참조는 빈 스키마로 끊음) */
  function derefSchema(s, root, refDepth, nest) {
    refDepth = refDepth || 0;
    nest = nest || 0;
    if (!s || typeof s !== 'object') return s;
    if (nest > 60) return {};
    if (s.$ref) {
      if (refDepth > 8) return {};
      const r = resolveRef(s.$ref, root);
      return r === undefined ? {} : derefSchema(r, root, refDepth + 1, nest + 1);
    }
    if (Array.isArray(s)) return s.map((x) => derefSchema(x, root, refDepth, nest + 1));
    const out = {};
    Object.keys(s).forEach((k) => {
      if (k === 'example' || k === 'examples' || k === 'xml' || k === 'externalDocs') return;
      out[k] = s[k] && typeof s[k] === 'object' ? derefSchema(s[k], root, refDepth, nest + 1) : s[k];
    });
    return out;
  }

  /* ================================================================== *
   * JSON 비교 (기준 응답 회귀 · 미러 비교 공용)
   * ================================================================== */
  function ignoreMatcher(list) {
    const pats = (Array.isArray(list) ? list : String(list || '').split(','))
      .map((s) => s.trim()).filter(Boolean)
      .map((p) => {
        const norm = p.indexOf('$') === 0 ? p : '$.' + p.replace(/^\./, '');
        const re = norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\[\\\*\\\]/g, '\\[\\d+\\]').replace(/\\\.\\\*/g, '\\.[^.\\[]+');
        return new RegExp('^' + re + '(?=$|[.\\[])');
      });
    return (path) => pats.some((r) => r.test(path));
  }
  function diffJson(a, b, opts) {
    opts = opts || {};
    const out = [];
    const limit = opts.limit || 300;
    const ignored = opts.ignore ? ignoreMatcher(opts.ignore) : () => false;
    (function walk(x, y, path) {
      if (out.length >= limit || ignored(path)) return;
      const tx = typeOf(x);
      const ty = typeOf(y);
      if (tx !== ty) { out.push({ path, a: x, b: y }); return; }
      if (tx === 'array') {
        const n = Math.max(x.length, y.length);
        for (let i = 0; i < n; i++) {
          const p = path + '[' + i + ']';
          if (i >= x.length) { if (!ignored(p)) out.push({ path: p, a: undefined, b: y[i] }); }
          else if (i >= y.length) { if (!ignored(p)) out.push({ path: p, a: x[i], b: undefined }); }
          else walk(x[i], y[i], p);
        }
        return;
      }
      if (tx === 'object') {
        new Set(Object.keys(x).concat(Object.keys(y))).forEach((k) => {
          const p = keyPath(path, k);
          if (!hasOwn(x, k)) { if (!ignored(p)) out.push({ path: p, a: undefined, b: y[k] }); }
          else if (!hasOwn(y, k)) { if (!ignored(p)) out.push({ path: p, a: x[k], b: undefined }); }
          else walk(x[k], y[k], p);
        });
        return;
      }
      if (x !== y) out.push({ path, a: x, b: y });
    })(a, b, '$');
    return out;
  }
  /** 응답 두 개 비교: 상태 + 본문(JSON 이면 구조 비교, 아니면 텍스트 비교) */
  function compareResponses(base, cur, ignore) {
    const diffs = [];
    if (base.status !== cur.status) diffs.push({ path: '상태 코드', a: base.status, b: cur.status });
    let ja, jb, ok = false;
    try { ja = JSON.parse(base.body); jb = JSON.parse(cur.body); ok = true; } catch (e) { ok = false; }
    if (ok) diffJson(ja, jb, { ignore: ignore }).forEach((d) => diffs.push(d));
    else if ((base.body || '') !== (cur.body || '')) {
      const la = String(base.body || '').split('\n');
      const lb = String(cur.body || '').split('\n');
      let i = 0;
      while (i < la.length && i < lb.length && la[i] === lb[i]) i++;
      diffs.push({ path: '본문 ' + (i + 1) + '번째 줄부터 다름', a: (la[i] || '').slice(0, 200), b: (lb[i] || '').slice(0, 200) });
    }
    return diffs;
  }

  /* ================================================================== *
   * OAuth 2.0 (Client Credentials · Password)
   * ================================================================== */
  function oauthKey(a, vars) {
    const sub = (s) => substitute(s || '', vars);
    return [a.oauthGrant || 'client_credentials', sub(a.tokenUrl), sub(a.clientId), sub(a.scope), a.oauthGrant === 'password' ? sub(a.oauthUser) : ''].join('|');
  }
  async function fetchOAuthToken(a, vars, transport) {
    const sub = (s) => substitute(s || '', vars);
    if (!a.tokenUrl) throw new Error('토큰 발급 주소(Token URL)를 입력하세요');
    const form = [['grant_type', a.oauthGrant === 'password' ? 'password' : 'client_credentials']];
    if (a.oauthGrant === 'password') form.push(['username', sub(a.oauthUser)], ['password', sub(a.oauthPass)]);
    if (a.scope) form.push(['scope', sub(a.scope)]);
    const headers = [['Content-Type', 'application/x-www-form-urlencoded'], ['Accept', 'application/json']];
    if (a.clientAuth === 'header') headers.push(['Authorization', 'Basic ' + b64encode(sub(a.clientId) + ':' + sub(a.clientSecret))]);
    else { form.push(['client_id', sub(a.clientId)]); if (a.clientSecret) form.push(['client_secret', sub(a.clientSecret)]); }
    const res = await transport({
      method: 'POST', url: sub(a.tokenUrl), headers: headers, multipart: null, binary: null,
      bodyText: form.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&')
    });
    if (!res || !res.ok) throw new Error('토큰 서버에 연결하지 못했어요: ' + (res && res.error ? res.error.message : ''));
    let j;
    try { j = JSON.parse(res.body); } catch (e) { throw new Error('토큰 응답이 JSON 이 아니에요 (' + res.status + ')'); }
    if (res.status >= 400 || !j.access_token) throw new Error('토큰 발급 실패 (' + res.status + '): ' + (j.error_description || j.error || JSON.stringify(j).slice(0, 120)));
    return { accessToken: j.access_token, tokenType: j.token_type || 'Bearer', scope: j.scope || '', expiresAt: j.expires_in ? Date.now() + Number(j.expires_in) * 1000 - 10000 : null, obtainedAt: Date.now() };
  }
  const tokenValid = (t) => !!(t && t.accessToken && (!t.expiresAt || t.expiresAt > Date.now()));

  /* ================================================================== *
   * OpenAPI 3.x / Swagger 2.0 → 컬렉션
   * ================================================================== */
  function sampleFromSchema(s, root, depth) {
    depth = depth || 0;
    if (!s || typeof s !== 'object' || depth > 8) return null;
    if (s.$ref) return sampleFromSchema(resolveRef(s.$ref, root), root, depth + 1);
    if (s.example !== undefined) return s.example;
    if (Array.isArray(s.examples) && s.examples.length) return s.examples[0];
    if (s.default !== undefined) return s.default;
    if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
    if (s.const !== undefined) return s.const;
    if (Array.isArray(s.allOf)) return Object.assign.apply(null, [{}].concat(s.allOf.map((x) => sampleFromSchema(x, root, depth + 1)).filter((x) => x && typeof x === 'object')));
    if (s.oneOf || s.anyOf) return sampleFromSchema((s.oneOf || s.anyOf)[0], root, depth + 1);
    const t = Array.isArray(s.type) ? s.type.find((x) => x !== 'null') : (s.type || (s.properties ? 'object' : (s.items ? 'array' : undefined)));
    if (t === 'object') {
      const o = {};
      Object.keys(s.properties || {}).forEach((k) => { const p = s.properties[k]; if (p && p.readOnly) return; o[k] = sampleFromSchema(p, root, depth + 1); });
      return o;
    }
    if (t === 'array') { const it = sampleFromSchema(s.items, root, depth + 1); return it === null || it === undefined ? [] : [it]; }
    if (t === 'integer' || t === 'number') return typeof s.minimum === 'number' ? s.minimum : 0;
    if (t === 'boolean') return true;
    if (t === 'string') return ({ email: 'user@example.com', 'date-time': '2024-01-01T00:00:00Z', date: '2024-01-01', uuid: '3fa85f64-5717-4562-b3fc-2c963f66afa6', uri: 'https://example.com', password: 'password', binary: '' })[s.format] || 'string';
    return null;
  }

  function fromOpenAPI(spec, opts) {
    opts = opts || {};
    if (typeof spec === 'string') spec = JSON.parse(spec);
    const isV2 = !!spec.swagger;
    if (!isV2 && !spec.openapi) throw new Error('OpenAPI(3.x) 또는 Swagger(2.0) 문서가 아니에요');
    const title = (spec.info && spec.info.title) || 'OpenAPI';
    const R = (x) => (x && x.$ref ? resolveRef(x.$ref, spec) || {} : x || {});
    let baseUrl = '';
    if (isV2) baseUrl = ((spec.schemes && spec.schemes[0]) || 'https') + '://' + (spec.host || 'localhost') + (spec.basePath || '');
    else if (spec.servers && spec.servers[0]) {
      const sv = spec.servers[0];
      baseUrl = String(sv.url || '').replace(/\{([^}]+)\}/g, (m, k) => (sv.variables && sv.variables[k] ? String(sv.variables[k].default) : m));
    }
    baseUrl = baseUrl.replace(/\/$/, '');
    if (opts.specUrl && (!baseUrl || baseUrl.charAt(0) === '/')) { try { baseUrl = new URL(baseUrl || '/', opts.specUrl).href.replace(/\/$/, ''); } catch (e) { /* noop */ } }
    const schemes = isV2 ? (spec.securityDefinitions || {}) : ((spec.components && spec.components.securitySchemes) || {});
    const vars = [{ key: 'baseUrl', value: baseUrl, enabled: true }];
    const addVar = (k, v) => { if (!vars.some((x) => x.key === k)) vars.push({ key: k, value: v || '', enabled: true }); };
    const authFor = (secReqs) => {
      const first = (secReqs || [])[0];
      if (!first) return null;
      const name = Object.keys(first)[0];
      const sc = R(schemes[name]);
      if (!name || !sc.type) return null;
      if ((sc.type === 'http' && /bearer/i.test(sc.scheme)) || sc.type === 'openIdConnect') { addVar('token'); return { type: 'bearer', bearer: '{{token}}' }; }
      if ((sc.type === 'http' && /basic/i.test(sc.scheme)) || sc.type === 'basic') { addVar('username'); addVar('password'); return { type: 'basic', username: '{{username}}', password: '{{password}}' }; }
      if (sc.type === 'apiKey') { addVar('apiKey'); return { type: 'apikey', apiKeyName: sc.name || 'X-API-Key', apiKeyValue: '{{apiKey}}', apiKeyIn: sc.in === 'query' ? 'query' : 'header' }; }
      if (sc.type === 'oauth2') {
        let grant = 'client_credentials';
        let tokenUrl = '';
        let scopes = {};
        if (isV2) { grant = sc.flow === 'password' ? 'password' : 'client_credentials'; tokenUrl = sc.tokenUrl || ''; scopes = sc.scopes || {}; }
        else {
          const f = sc.flows || {};
          const flow = f.clientCredentials || f.password || f.authorizationCode || {};
          grant = f.clientCredentials ? 'client_credentials' : (f.password ? 'password' : 'client_credentials');
          tokenUrl = flow.tokenUrl || '';
          scopes = flow.scopes || {};
        }
        addVar('clientId'); addVar('clientSecret');
        if (grant === 'password') { addVar('username'); addVar('password'); }
        return { type: 'oauth2', oauthGrant: grant, tokenUrl: tokenUrl, clientId: '{{clientId}}', clientSecret: '{{clientSecret}}', scope: Object.keys(scopes).join(' '), oauthUser: '{{username}}', oauthPass: '{{password}}', clientAuth: 'body' };
      }
      return null;
    };
    const globalAuth = authFor(spec.security) || { type: 'none' };
    const exampleOf = (p) => {
      const s = R(p.schema);
      const v = p.example !== undefined ? p.example : (p['x-example'] !== undefined ? p['x-example'] : (s.example !== undefined ? s.example : (s.default !== undefined ? s.default : (p.default !== undefined ? p.default : (Array.isArray(s.enum) ? s.enum[0] : (Array.isArray(p.enum) ? p.enum[0] : ''))))));
      return v === undefined || v === null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
    };
    const groups = {};
    const order = [];
    let count = 0;
    Object.keys(spec.paths || {}).forEach((path) => {
      const item = R(spec.paths[path]);
      ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].forEach((m) => {
        const op = item[m];
        if (!op) return;
        count++;
        const tag = (op.tags && op.tags[0]) || '기본';
        if (!groups[tag]) { groups[tag] = []; order.push(tag); }
        const r = newRequest();
        r.method = m.toUpperCase();
        r.name = op.summary || op.operationId || (r.method + ' ' + path);
        r.description = [op.description, op.operationId ? 'operationId: ' + op.operationId : ''].filter(Boolean).join('\n');
        const params = {};
        (item.parameters || []).concat(op.parameters || []).map(R).forEach((p) => { if (p.name) params[p.in + ':' + p.name] = p; });
        const plist = Object.keys(params).map((k) => params[k]);
        r.url = '{{baseUrl}}' + path.replace(/\{([^}]+)\}/g, ':$1');
        r.pathVars = plist.filter((p) => p.in === 'path').map((p) => ({ key: p.name, value: exampleOf(p), enabled: true }));
        r.params = plist.filter((p) => p.in === 'query').map((p) => { const v = exampleOf(p); return { key: p.name, value: v, enabled: !!p.required || v !== '' }; });
        const qs = r.params.filter((p) => p.enabled).map((p) => encodeURIComponent(p.key) + '=' + encodeURIComponent(p.value).replace(/%7B%7B/g, '{{').replace(/%7D%7D/g, '}}')).join('&');
        if (qs) r.url += '?' + qs;
        r.headers = plist.filter((p) => p.in === 'header' && !/^(authorization|content-type|accept)$/i.test(p.name)).map((p) => ({ key: p.name, value: exampleOf(p), enabled: !!p.required }));
        // 요청 바디
        if (isV2) {
          const bp = plist.find((p) => p.in === 'body');
          const fp = plist.filter((p) => p.in === 'formData');
          if (bp) { r.body.mode = 'json'; r.body.raw = JSON.stringify(sampleFromSchema(R(bp.schema), spec), null, 2); }
          else if (fp.length) {
            const hasFile = fp.some((p) => p.type === 'file');
            if (hasFile) { r.body.mode = 'multipart'; r.body.multipart = fp.map((p) => ({ key: p.name, value: p.type === 'file' ? '' : exampleOf(p), type: p.type === 'file' ? 'file' : 'text', enabled: true })); }
            else { r.body.mode = 'form'; r.body.form = fp.map((p) => ({ key: p.name, value: exampleOf(p), enabled: true })); }
          }
        } else if (op.requestBody) {
          const rb = R(op.requestBody);
          const content = rb.content || {};
          const types = Object.keys(content);
          const jt = types.find((t) => /json/i.test(t));
          const media = content[jt || types[0]] || {};
          const schema = R(media.schema);
          const ex = media.example !== undefined ? media.example : (media.examples ? R(media.examples[Object.keys(media.examples)[0]]).value : undefined);
          if (jt) { r.body.mode = 'json'; r.body.raw = JSON.stringify(ex !== undefined ? ex : sampleFromSchema(schema, spec), null, 2); }
          else if (types[0] === 'application/x-www-form-urlencoded') { r.body.mode = 'form'; const smp = sampleFromSchema(schema, spec) || {}; r.body.form = Object.keys(smp).map((k) => ({ key: k, value: typeof smp[k] === 'object' ? JSON.stringify(smp[k]) : String(smp[k]), enabled: true })); }
          else if (types[0] === 'multipart/form-data') {
            const props = schema.properties || {};
            r.body.mode = 'multipart';
            r.body.multipart = Object.keys(props).map((k) => { const ps = R(props[k]); const file = ps.format === 'binary' || ps.format === 'base64'; return { key: k, value: file ? '' : String(sampleFromSchema(ps, spec) === null ? '' : sampleFromSchema(ps, spec)), type: file ? 'file' : 'text', enabled: true }; });
          } else if (types[0]) { r.body.mode = 'raw'; r.body.rawType = types[0]; r.body.raw = ex !== undefined ? String(ex) : ''; }
        }
        // 인증
        if (op.security !== undefined) r.auth = Object.assign(r.auth, op.security.length ? (authFor(op.security) || { type: 'none' }) : { type: 'none' });
        else r.auth.type = 'inherit';
        // 응답 → 검증
        const codes = Object.keys(op.responses || {}).filter((c) => /^2\d\d$/.test(c));
        if (codes.length) {
          r.assertions.push(codes.length > 1 ? { target: 'status', op: 'in', value: codes.join(', '), path: '', enabled: true } : { target: 'status', op: 'eq', value: codes[0], path: '', enabled: true });
          if (opts.schemaAssertions !== false) {
            const resp = R(op.responses[codes[0]]);
            let rs = null;
            if (isV2) rs = resp.schema;
            else if (resp.content) { const k = Object.keys(resp.content).find((t) => /json/i.test(t)); if (k) rs = resp.content[k].schema; }
            if (rs) {
              const inlined = derefSchema(rs, spec);
              const txt = JSON.stringify(inlined);
              if (txt.length < 60000) r.assertions.push({ target: 'schema', op: 'schema', value: txt, path: '', enabled: true });
            }
          }
        }
        groups[tag].push(r);
      });
    });
    const cols = order.map((tag) => normalizeCollection({
      name: title + (order.length > 1 ? ' / ' + tag : ''), open: true,
      description: (spec.info && spec.info.description) || '', auth: clone(globalAuth), variables: clone(vars), requests: groups[tag]
    }));
    cols.meta = { title: title, version: spec.info && spec.info.version, endpoints: count, tags: order, baseUrl: baseUrl, isV2: isV2 };
    return cols;
  }

  /* ================================================================== *
   * 성능(부하) 테스트
   *   opts = { vus, duration(초), rampUp(초), iterations(VU당 최대), vars, oauthCache }
   *   deps.sandbox 가 없으면 스크립트는 건너뛰고 노코드 검증만 실행
   * ================================================================== */
  function percentile(sorted, p) {
    if (!sorted.length) return 0;
    const i = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.min(sorted.length - 1, Math.max(0, i))];
  }
  function statsOf(list) {
    const ms = list.map((s) => s.ms).sort((a, b) => a - b);
    const n = ms.length;
    const errors = list.filter((s) => s.error).length;
    const failedChecks = list.filter((s) => !s.error && s.failedChecks > 0).length;
    return {
      count: n, errors: errors, failedChecks: failedChecks, errorRate: n ? errors / n : 0, checkFailRate: n ? failedChecks / n : 0,
      avg: n ? Math.round(ms.reduce((a, b) => a + b, 0) / n) : 0, min: n ? ms[0] : 0, max: n ? ms[n - 1] : 0,
      p50: percentile(ms, 50), p90: percentile(ms, 90), p95: percentile(ms, 95), p99: percentile(ms, 99)
    };
  }
  function summarizeLoad(samples, startedAt, extra) {
    const elapsed = Math.max(0.001, (Date.now() - startedAt) / 1000);
    const by = {};
    const statuses = {};
    const timeline = [];
    samples.forEach((s) => {
      (by[s.id] = by[s.id] || { id: s.id, name: s.name, method: s.method, list: [] }).list.push(s);
      const key = s.error ? 'ERR' : String(s.status);
      statuses[key] = (statuses[key] || 0) + 1;
      const sec = Math.floor(s.t / 1000);
      while (timeline.length <= sec) timeline.push({ sec: timeline.length, count: 0, errors: 0, totalMs: 0 });
      const b = timeline[sec];
      b.count++; b.totalMs += s.ms; if (s.error || s.failedChecks) b.errors++;
    });
    timeline.forEach((b) => { b.avg = b.count ? Math.round(b.totalMs / b.count) : 0; delete b.totalMs; });
    const total = statsOf(samples);
    return Object.assign({
      startedAt: startedAt, elapsed: elapsed, total: total, rps: Math.round((total.count / elapsed) * 10) / 10, statuses: statuses, timeline: timeline,
      byRequest: Object.keys(by).map((k) => Object.assign({ id: k, name: by[k].name, method: by[k].method }, statsOf(by[k].list)))
    }, extra || {});
  }
  async function runLoad(items, opts, deps, hooks) {
    hooks = hooks || {};
    const vus = Math.max(1, Math.min(Number(opts.vus) || 1, 200));
    const durMs = Math.max(1, Math.min(Number(opts.duration) || 10, 3600)) * 1000;
    const ramp = Math.max(0, Number(opts.rampUp) || 0) * 1000;
    const startedAt = Date.now();
    const samples = [];
    let active = 0;
    const stop = () => (hooks.shouldStop && hooks.shouldStop()) || Date.now() - startedAt >= durMs;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    async function vu(n) {
      if (ramp) await sleep((ramp * n) / vus);
      if (stop()) return;
      active++;
      const ctx = { vars: clone(opts.vars || {}), cookieJar: [], cookieAuto: true, oauthCache: opts.oauthCache || {} };
      SCOPES.forEach((s) => { ctx.vars[s] = ctx.vars[s] || {}; });
      let iter = 0;
      while (!stop() && (!opts.iterations || iter < opts.iterations)) {
        for (const item of items) {
          if (stop()) break;
          ctx.vars.local = {};
          ctx.info = { iteration: iter, vu: n, iterationCount: 0 };
          const t0 = Date.now();
          const rec = await runItem(item, ctx, deps);
          const s = {
            t: t0 - startedAt, ms: rec.response && typeof rec.response.timeMs === 'number' ? rec.response.timeMs : Date.now() - t0,
            error: !!rec.error, status: rec.response && rec.response.ok ? rec.response.status : 0, id: rec.id || rec.name, name: rec.name, method: rec.method,
            failedChecks: rec.tests.filter((t) => !t.passed && !t.skipped).length, vu: n
          };
          samples.push(s);
          if (hooks.onSample) hooks.onSample(s, rec);
        }
        iter++;
      }
      active--;
    }
    const timer = hooks.onTick ? setInterval(() => hooks.onTick(summarizeLoad(samples, startedAt, { activeVus: active, vus: vus, duration: durMs / 1000, done: false })), 1000) : null;
    await Promise.all(Array.from({ length: vus }, (_, i) => vu(i)));
    if (timer) clearInterval(timer);
    return summarizeLoad(samples, startedAt, { activeVus: 0, vus: vus, duration: durMs / 1000, done: true, stopped: !!(hooks.shouldStop && hooks.shouldStop()) });
  }
  function loadToMarkdown(sum, title) {
    const t = sum.total;
    const pct = (x) => (x * 100).toFixed(2) + '%';
    let md = '## ' + (title || 'EasyAPI 성능 테스트') + '\n\n';
    md += '- 가상 사용자 ' + sum.vus + '명 · ' + sum.elapsed.toFixed(1) + '초 · 요청 ' + t.count + '건 · **' + sum.rps + ' req/s**\n';
    md += '- 응답 시간 평균 ' + t.avg + 'ms · p50 ' + t.p50 + 'ms · p95 **' + t.p95 + 'ms** · p99 ' + t.p99 + 'ms · 최대 ' + t.max + 'ms\n';
    md += '- 요청 오류율 ' + pct(t.errorRate) + ' · 검증 실패율 ' + pct(t.checkFailRate) + ' · 상태 코드 ' + Object.keys(sum.statuses).map((k) => k + '×' + sum.statuses[k]).join(', ') + '\n\n';
    md += '| 요청 | 건수 | 평균 | p50 | p95 | p99 | 최대 | 오류 | 검증 실패 |\n|---|---|---|---|---|---|---|---|---|\n';
    sum.byRequest.forEach((r) => { md += '| `' + r.method + '` ' + r.name + ' | ' + r.count + ' | ' + r.avg + 'ms | ' + r.p50 + 'ms | ' + r.p95 + 'ms | ' + r.p99 + 'ms | ' + r.max + 'ms | ' + r.errors + ' | ' + r.failedChecks + ' |\n'; });
    return md;
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
      ['JSON 스키마 검증', 'pm.test("응답이 스키마와 일치", function () {\n  pm.response.to.have.jsonSchema({\n    type: "object",\n    required: ["id", "name"],\n    properties: {\n      id: { type: "integer" },\n      name: { type: "string" }\n    }\n  });\n});'],
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
    validateSchema, derefSchema, resolveRef, diffJson, compareResponses, ignoreMatcher,
    oauthKey, fetchOAuthToken, tokenValid, sampleFromSchema, fromOpenAPI,
    runLoad, summarizeLoad, statsOf, percentile, loadToMarkdown,
    rowsToMap, mergeMapIntoRows, lookup, substitute, pathVarNames,
    resolveRequest, bodySpec, jsonPath, expect, AssertionError, executeScript, responseView,
    assertionName, evalAssertion, evalExtraction, runItem, runCollection,
    toJUnit, toMarkdown, toHtmlReport, parseCsv, parseDataFile,
    parseSetCookie, storeCookies, cookieHeaderFor,
    newRequest, normalizeRequest, normalizeCollection, fromPostman, toPostman,
    deepEqual, typeOf, b64encode, uuid, clone
  };
});
