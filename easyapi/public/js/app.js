/* =====================================================================
 * EasyAPI - 입문자를 위한 API 테스트 도구
 * ===================================================================== */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 0. 기본 유틸
   * ------------------------------------------------------------------ */
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const escText = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  const isMobile = () => window.matchMedia('(max-width: 899px)').matches;
  function debounce(fn, ms) {
    let t;
    return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); };
  }
  function formatBytes(n) {
    if (n === undefined || n === null) return '-';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }
  function formatMs(ms) {
    if (ms === undefined || ms === null) return '-';
    return ms < 1000 ? ms + ' ms' : (ms / 1000).toFixed(2) + ' s';
  }
  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return '방금';
    if (s < 3600) return Math.floor(s / 60) + '분 전';
    if (s < 86400) return Math.floor(s / 3600) + '시간 전';
    return Math.floor(s / 86400) + '일 전';
  }
  function icon(name, cls) { return '<svg class="ic ' + (cls || '') + '"><use href="#i-' + name + '"/></svg>'; }

  function toast(msg, type, ms) {
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, ms || 2600);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e2) { /* noop */ }
      ta.remove();
    }
    toast('복사했어요', 'ok', 1500);
  }

  /* ------------------------------------------------------------------ *
   * 1. 상태 & 저장
   * ------------------------------------------------------------------ */
  const STORE_KEY = 'easyapi.v1';

  function newRequest() {
    return {
      id: uid(), name: '새 요청', method: 'GET', url: '',
      params: [], headers: [],
      body: { mode: 'none', raw: '', rawType: 'text/plain', form: [], multipart: [] },
      auth: { type: 'none', bearer: '', username: '', password: '', apiKeyName: 'X-API-Key', apiKeyValue: '', apiKeyIn: 'header' }
    };
  }
  function normalizeRequest(r) {
    const base = newRequest();
    r = r || {};
    const out = Object.assign(base, r);
    out.body = Object.assign(newRequest().body, r.body || {});
    out.auth = Object.assign(newRequest().auth, r.auth || {});
    out.params = Array.isArray(r.params) ? r.params : [];
    out.headers = Array.isArray(r.headers) ? r.headers : [];
    out.method = METHODS.includes(String(out.method).toUpperCase()) ? String(out.method).toUpperCase() : 'GET';
    return out;
  }
  const defaultSettings = () => ({
    transport: 'server',
    proxy: { enabled: false, url: '', username: '', password: '', bypass: 'localhost, 127.0.0.1' },
    insecure: false,
    followRedirects: true,
    timeoutSec: 30,
    theme: 'auto',
    beginner: true,
    accessKey: '',
    mirror: { enabled: false, baseUrl: '' }
  });

  const S = {
    req: newRequest(),
    current: null,          // { colId, reqId } 보관함에서 불러온 경우
    savedSnapshot: null,
    collections: [],
    history: [],
    envs: [],
    activeEnv: null,
    settings: defaultSettings(),
    ui: { lib: 'collections', methodFilter: 'ALL', search: '', reqTab: 'params', respTab: 'body', viewMode: 'pretty', onboarded: false },
    response: null,
    mirrorResponse: null,
    responseReq: null,
    serverOk: null,
    serverInfo: null,
    sending: null
  };

  function stripFiles(req) {
    const r = clone(req);
    (r.body.multipart || []).forEach((row) => { if (row.file) { row.fileName = row.file.name; row.file = null; } });
    return r;
  }

  function load() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { data = null; }
    if (!data) {
      S.collections = [sampleCollection()];
      S.envs = [{ id: uid(), name: '예제 환경', vars: [{ key: 'baseUrl', value: 'https://jsonplaceholder.typicode.com', enabled: true }, { key: 'token', value: 'my-test-token', enabled: true }] }];
      return;
    }
    S.req = normalizeRequest(data.req);
    S.current = data.current || null;
    S.savedSnapshot = data.savedSnapshot || null;
    S.collections = Array.isArray(data.collections) ? data.collections : [];
    S.history = Array.isArray(data.history) ? data.history : [];
    S.envs = Array.isArray(data.envs) ? data.envs : [];
    S.activeEnv = data.activeEnv || null;
    S.settings = Object.assign(defaultSettings(), data.settings || {});
    S.settings.proxy = Object.assign(defaultSettings().proxy, (data.settings || {}).proxy || {});
    S.settings.mirror = Object.assign(defaultSettings().mirror, (data.settings || {}).mirror || {});
    S.ui = Object.assign(S.ui, data.ui || {});
    S.collections.forEach((c) => { if (c.name === '📘 예제 모음') c.name = '예제 모음'; });
  }

  function persistNow() {
    const data = {
      req: stripFiles(S.req), current: S.current, savedSnapshot: S.savedSnapshot,
      collections: S.collections, history: S.history, envs: S.envs, activeEnv: S.activeEnv,
      settings: S.settings, ui: S.ui
    };
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data));
    } catch (e) {
      // 용량 초과 → 기록 줄이고 재시도
      S.history = S.history.slice(0, 20);
      data.history = S.history;
      try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e2) { /* 저장 불가 환경 */ }
    }
  }
  const persist = debounce(persistNow, 300);

  function sampleCollection() {
    const mk = (name, method, url, extra) => Object.assign(normalizeRequest({ name, method, url }), extra || {});
    const post = mk('게시글 만들기', 'POST', '{{baseUrl}}/posts');
    post.body = { mode: 'json', raw: '{\n  "title": "안녕하세요",\n  "body": "EasyAPI로 보낸 첫 글",\n  "userId": 1\n}', rawType: 'text/plain', form: [], multipart: [] };
    const list = mk('댓글 목록 (쿼리)', 'GET', '{{baseUrl}}/comments?postId=1');
    list.params = [{ key: 'postId', value: '1', enabled: true }];
    const put = mk('게시글 전체 수정', 'PUT', '{{baseUrl}}/posts/1');
    put.body = { mode: 'json', raw: '{\n  "id": 1,\n  "title": "수정된 제목",\n  "body": "내용",\n  "userId": 1\n}', rawType: 'text/plain', form: [], multipart: [] };
    const patch = mk('게시글 일부 수정', 'PATCH', '{{baseUrl}}/posts/1');
    patch.body = { mode: 'json', raw: '{\n  "title": "제목만 변경"\n}', rawType: 'text/plain', form: [], multipart: [] };
    const bearer = mk('인증 헤더 확인 (Bearer)', 'GET', 'https://httpbin.org/bearer');
    bearer.auth.type = 'bearer'; bearer.auth.bearer = '{{token}}';
    return {
      id: uid(), name: '예제 모음', open: true,
      requests: [mk('게시글 1개 조회', 'GET', '{{baseUrl}}/posts/1'), list, post, put, patch, mk('게시글 삭제', 'DELETE', '{{baseUrl}}/posts/1'), bearer]
    };
  }

  /* ------------------------------------------------------------------ *
   * 2. 설명 텍스트
   * ------------------------------------------------------------------ */
  const METHOD_HINT = {
    GET: '데이터를 <b>조회</b>해요. 보통 바디 없이 주소와 파라미터만 사용합니다.',
    POST: '새 데이터를 <b>생성</b>해요. 보낼 내용은 <b>바디</b> 탭에 넣으세요.',
    PUT: '기존 데이터를 <b>통째로 교체</b>해요. 바디에 전체 내용을 넣습니다.',
    PATCH: '기존 데이터의 <b>일부만 수정</b>해요. 바꿀 항목만 바디에 넣습니다.',
    DELETE: '데이터를 <b>삭제</b>해요. 실제 서버라면 신중하게!',
    HEAD: '본문 없이 <b>헤더만</b> 받아요. 파일 크기·존재 여부 확인용.',
    OPTIONS: '서버가 <b>허용하는 방식</b>(CORS 등)을 물어봐요.'
  };
  const STATUS_KO = {
    200: ['성공', '요청이 정상 처리됐어요.'],
    201: ['생성됨', '새 데이터가 만들어졌어요.'],
    202: ['접수됨', '요청을 받았고 나중에 처리돼요.'],
    204: ['성공 (본문 없음)', '처리됐지만 돌려줄 내용은 없어요.'],
    301: ['영구 이동', '주소가 바뀌었어요. Location 헤더를 확인하세요.'],
    302: ['임시 이동', '다른 주소로 이동하라는 응답이에요.'],
    304: ['변경 없음', '캐시된 내용을 그대로 쓰면 돼요.'],
    307: ['임시 이동', '같은 메서드로 다른 주소에 다시 요청하세요.'],
    308: ['영구 이동', '같은 메서드로 새 주소를 사용하세요.'],
    400: ['잘못된 요청', '파라미터나 바디 형식이 서버가 기대한 것과 달라요. JSON 오타, 필수 값 누락을 확인하세요.'],
    401: ['인증 필요', '로그인 정보가 없거나 틀렸어요. 인증 탭의 토큰/아이디를 확인하세요.'],
    403: ['권한 없음', '인증은 됐지만 이 작업을 할 권한이 없어요.'],
    404: ['찾을 수 없음', '주소(경로)가 틀렸거나 데이터가 없어요. 오타를 확인하세요.'],
    405: ['허용되지 않은 메서드', '이 주소는 해당 메서드를 지원하지 않아요. GET/POST 등을 바꿔 보세요.'],
    406: ['형식 불가', 'Accept 헤더가 요구한 형식으로 응답할 수 없어요.'],
    408: ['요청 시간 초과', '서버가 요청을 기다리다 끊었어요.'],
    409: ['충돌', '이미 존재하는 데이터와 충돌해요.'],
    410: ['삭제됨', '더 이상 제공되지 않는 주소예요.'],
    413: ['너무 큼', '보낸 데이터가 너무 커요.'],
    415: ['지원하지 않는 형식', 'Content-Type이 맞지 않아요. 바디 형식(JSON/폼)을 확인하세요.'],
    422: ['검증 실패', '형식은 맞지만 값이 올바르지 않아요. 응답 본문의 오류 메시지를 확인하세요.'],
    429: ['요청이 너무 많음', '잠시 후 다시 시도하세요. (호출 제한)'],
    500: ['서버 내부 오류', '서버 쪽 문제예요. 서버 로그를 확인하거나 개발자에게 알려주세요.'],
    501: ['구현 안 됨', '서버가 이 기능을 지원하지 않아요.'],
    502: ['게이트웨이 오류', '중간 서버(프록시/로드밸런서)가 뒤쪽 서버에서 잘못된 응답을 받았어요.'],
    503: ['서비스 불가', '서버가 점검 중이거나 과부하 상태예요.'],
    504: ['게이트웨이 시간 초과', '뒤쪽 서버가 제때 응답하지 않았어요.']
  };
  function statusInfo(code) {
    if (STATUS_KO[code]) return STATUS_KO[code];
    const c = Math.floor(code / 100);
    return [['', '정보'], ['', '정보'], ['성공', '요청이 성공했어요.'], ['이동', '다른 주소로 이동하라는 응답이에요.'], ['요청 오류', '요청 내용을 확인하세요.'], ['서버 오류', '서버 쪽 문제예요.']][c] || ['', ''];
  }
  const BODY_TIP = {
    none: '',
    json: '<b>JSON</b>은 가장 많이 쓰는 형식이에요. <code>Content-Type: application/json</code>이 자동으로 붙어요.',
    form: '<b>폼</b>은 HTML 로그인 폼처럼 <code>key=value</code>로 보내요. (x-www-form-urlencoded)',
    multipart: '<b>파일 첨부</b>(multipart/form-data): 이미지·문서 업로드에 사용해요. 휴대폰에서도 파일을 고를 수 있어요.',
    raw: '<b>텍스트</b>: XML, HTML 등 원하는 형식을 직접 입력해요.'
  };

  /* ------------------------------------------------------------------ *
   * 3. URL ↔ 파라미터 동기화
   * ------------------------------------------------------------------ */
  function encQ(s) {
    return encodeURIComponent(s).replace(/%7B%7B/gi, '{{').replace(/%7D%7D/gi, '}}')
      .replace(/%2C/gi, ',').replace(/%3A/gi, ':').replace(/%2F/gi, '/').replace(/%40/gi, '@').replace(/%24/gi, '$');
  }
  function syncParamsFromUrl() {
    const parts = CurlParser.splitUrl(S.req.url);
    const enabled = CurlParser.parseQueryPairs(parts.query);
    const disabled = S.req.params.filter((p) => p.enabled === false);
    S.req.params = enabled.concat(disabled);
  }
  function syncUrlFromParams() {
    const parts = CurlParser.splitUrl(S.req.url);
    const hashIdx = S.req.url.indexOf('#');
    const hash = hashIdx >= 0 ? S.req.url.slice(hashIdx) : '';
    const qs = S.req.params.filter((p) => p.enabled !== false && p.key !== '').map((p) => encQ(p.key) + '=' + encQ(p.value || '')).join('&');
    S.req.url = parts.base + (qs ? '?' + qs : '') + hash;
    $('#url').value = S.req.url;
  }

  /* ------------------------------------------------------------------ *
   * 4. Key-Value 편집기
   * ------------------------------------------------------------------ */
  function kvEditor(el, getRows, opts) {
    opts = opts || {};
    function makeRow(row, isPh) {
      const d = document.createElement('div');
      d.className = 'kv-row' + (opts.file ? ' kv-file' : '') + (isPh ? ' placeholder' : '') + (row.enabled === false ? ' off' : '');
      const chk = document.createElement('input');
      chk.type = 'checkbox'; chk.className = 'chk'; chk.checked = row.enabled !== false; chk.title = '사용/미사용';
      const k = document.createElement('input');
      k.type = 'text'; k.className = 'k'; k.value = row.key || ''; k.placeholder = opts.keyPh || '이름 (key)';
      k.autocapitalize = 'off'; k.spellcheck = false;
      if (opts.keyList) k.setAttribute('list', opts.keyList);
      const del = document.createElement('button');
      del.className = 'icon-btn del'; del.innerHTML = icon('trash'); del.setAttribute('aria-label', '행 삭제');

      function promote() {
        if (!isPh) return;
        isPh = false;
        d.classList.remove('placeholder');
        getRows().push(row);
        el.appendChild(makeRow(blank(), true));
      }
      chk.addEventListener('change', () => { row.enabled = chk.checked; d.classList.toggle('off', !chk.checked); promote(); changed(); });
      k.addEventListener('input', () => { row.key = k.value; promote(); changed(); });
      del.addEventListener('click', () => {
        const rows = getRows();
        const i = rows.indexOf(row);
        if (i >= 0) rows.splice(i, 1);
        d.remove();
        changed();
      });

      d.appendChild(chk);
      d.appendChild(k);

      if (opts.file) {
        const sel = document.createElement('select');
        sel.className = 'type-sel';
        sel.innerHTML = '<option value="text">텍스트</option><option value="file">파일</option>';
        sel.value = row.type || 'text';
        d.appendChild(sel);
        const holder = document.createElement('div');
        holder.className = 'v';
        holder.style.minWidth = '0';
        d.appendChild(holder);
        const renderVal = () => {
          holder.innerHTML = '';
          if ((row.type || 'text') === 'file') {
            const lab = document.createElement('label');
            const name = row.file ? row.file.name + ' (' + formatBytes(row.file.size) + ')' : (row.fileName ? row.fileName + ' — 다시 선택 필요' : '파일 선택…');
            lab.className = 'file-pick' + (!row.file && row.fileName ? ' need' : '');
            lab.innerHTML = icon('file') + '<span>' + esc(name) + '</span><input type="file">';
            lab.querySelector('input').addEventListener('change', (e) => {
              const f = e.target.files[0];
              if (!f) return;
              if (f.size > 25 * 1024 * 1024) { toast('25MB 이하 파일만 첨부할 수 있어요', 'err'); return; }
              const reader = new FileReader();
              reader.onload = () => {
                row.file = { name: f.name, type: f.type || 'application/octet-stream', size: f.size, data: String(reader.result).split(',')[1] || '' };
                row.fileName = f.name;
                promote(); renderVal(); changed();
              };
              reader.readAsDataURL(f);
            });
            holder.appendChild(lab);
          } else {
            const v = document.createElement('input');
            v.type = 'text'; v.value = row.value || ''; v.placeholder = opts.valPh || '값 (value)';
            v.style.width = '100%';
            v.addEventListener('input', () => { row.value = v.value; promote(); changed(); });
            holder.appendChild(v);
          }
        };
        sel.addEventListener('change', () => { row.type = sel.value; promote(); renderVal(); changed(); });
        renderVal();
      } else {
        const v = document.createElement('input');
        v.type = 'text'; v.className = 'v'; v.value = row.value || ''; v.placeholder = opts.valPh || '값 (value)';
        v.autocapitalize = 'off'; v.spellcheck = false;
        if (opts.valList) v.setAttribute('list', opts.valList);
        v.addEventListener('input', () => { row.value = v.value; promote(); changed(); });
        d.appendChild(v);
      }
      d.appendChild(del);
      return d;
    }
    function blank() { return opts.file ? { key: '', value: '', type: 'text', enabled: true } : { key: '', value: '', enabled: true }; }
    function changed() { if (opts.onChange) opts.onChange(); }
    function render() {
      el.innerHTML = '';
      const head = document.createElement('div');
      head.className = 'kv-head';
      head.innerHTML = '<span></span><span>' + esc(opts.keyLabel || '이름') + '</span><span>' + esc(opts.valLabel || '값') + '</span><span></span>';
      if (!opts.file) el.appendChild(head);
      getRows().forEach((row) => el.appendChild(makeRow(row, false)));
      el.appendChild(makeRow(blank(), true));
    }
    return { render: render };
  }

  /* ------------------------------------------------------------------ *
   * 5. 요청 편집기 렌더/바인딩
   * ------------------------------------------------------------------ */
  let kvParams, kvHeaders, kvForm, kvMultipart;

  function reqChanged(opts) {
    opts = opts || {};
    updateCounts();
    updateDirty();
    persist();
    if (!opts.noBroadcast) Room.publishRequestDebounced();
  }

  function updateCounts() {
    const r = S.req;
    const n = (arr) => arr.filter((x) => x.enabled !== false && x.key).length;
    $('#cntParams').textContent = n(r.params) || '';
    $('#cntHeaders').textContent = n(r.headers) || '';
    $('#cntBody').textContent = r.body.mode === 'none' ? '' : ({ json: 'JSON', form: '폼', multipart: '파일', raw: '텍스트' }[r.body.mode]);
    $('#cntAuth').textContent = r.auth.type === 'none' ? '' : ({ bearer: 'Bearer', basic: 'Basic', apikey: 'Key' }[r.auth.type]);
    $('#cntMirror').textContent = S.settings.mirror.enabled ? 'ON' : '';
  }

  function updateDirty() {
    const dirty = S.current && S.savedSnapshot && S.savedSnapshot !== JSON.stringify(stripFiles(S.req));
    $('#dirtyDot').hidden = !dirty;
  }

  function setMethodClass() {
    const sel = $('#method');
    METHODS.forEach((m) => sel.classList.remove('m-' + m));
    sel.classList.add('m-' + S.req.method);
    const hint = $('#methodHint');
    hint.className = 'method-hint beginner m-' + S.req.method;
    hint.innerHTML = '<b>' + S.req.method + '</b> · ' + METHOD_HINT[S.req.method];
  }

  function renderRequest() {
    const r = S.req;
    $('#reqName').value = r.name || '새 요청';
    $('#method').value = r.method;
    setMethodClass();
    $('#url').value = r.url;
    kvParams.render();
    kvHeaders.render();
    renderBody();
    renderAuth();
    renderMirrorTab();
    switchReqTab(S.ui.reqTab, true);
    updateCounts();
    updateDirty();
    renderLibrary();
  }

  function renderBody() {
    const b = S.req.body;
    $$('#bodyMode button').forEach((btn) => btn.classList.toggle('on', btn.dataset.mode === b.mode));
    $$('[data-body]').forEach((el) => el.classList.toggle('body-hidden', el.dataset.body.split(' ').indexOf(b.mode) < 0));
    $('#bodyTip').innerHTML = BODY_TIP[b.mode];
    $('#bodyTip').hidden = !BODY_TIP[b.mode];
    $('#rawType').hidden = b.mode !== 'raw';
    $('#btnBeautify').hidden = b.mode !== 'json';
    $('#bodyRaw').value = b.raw || '';
    $('#bodyRaw').placeholder = b.mode === 'json' ? '{\n  "name": "홍길동",\n  "age": 20\n}' : '보낼 내용을 입력하세요';
    $('#rawType').value = b.rawType || 'text/plain';
    if (!Array.from($('#rawType').options).some((o) => o.value === b.rawType) && b.rawType) {
      const o = document.createElement('option'); o.value = b.rawType; o.textContent = b.rawType; $('#rawType').appendChild(o); $('#rawType').value = b.rawType;
    }
    kvForm.render();
    kvMultipart.render();
    validateJson();
  }

  function validateJson() {
    const st = $('#jsonStatus');
    if (S.req.body.mode !== 'json') { st.textContent = ''; return; }
    const txt = S.req.body.raw.trim();
    if (!txt) { st.textContent = ''; st.className = 'json-status'; return; }
    const replaced = txt.replace(/\{\{\s*[\w.\-]+\s*\}\}/g, '0');
    try {
      JSON.parse(replaced);
      st.textContent = '✓ 올바른 JSON'; st.className = 'json-status ok';
    } catch (e) {
      let msg = '✗ JSON 형식 오류';
      const m = /position (\d+)/.exec(e.message);
      if (m) {
        const pos = Number(m[1]);
        const line = replaced.slice(0, pos).split('\n').length;
        msg += ' (' + line + '번째 줄 근처)';
      }
      st.textContent = msg; st.className = 'json-status bad';
    }
  }

  function renderAuth() {
    const a = S.req.auth;
    $('#authType').value = a.type;
    $$('[data-auth]').forEach((el) => el.classList.toggle('on', el.dataset.auth === a.type));
    $('#authBearer').value = a.bearer || '';
    $('#authUser').value = a.username || '';
    $('#authPass').value = a.password || '';
    $('#authKeyName').value = a.apiKeyName || '';
    $('#authKeyValue').value = a.apiKeyValue || '';
    $('#authKeyIn').value = a.apiKeyIn || 'header';
  }

  function renderMirrorTab() {
    $('#mirrorEnabled').checked = !!S.settings.mirror.enabled;
    $('#mirrorBase').value = S.settings.mirror.baseUrl || '';
    const prev = $('#mirrorPreview');
    try {
      const resolved = resolveRequest(S.req, true);
      const mu = mirrorUrl(resolved.url);
      prev.textContent = mu ? 'A: ' + resolved.url + '\nB: ' + mu : '';
      prev.style.whiteSpace = 'pre-wrap';
    } catch (e) { prev.textContent = ''; }
  }

  function switchReqTab(tab, silent) {
    S.ui.reqTab = tab;
    $$('#reqTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $$('.tab-panel').forEach((p) => p.classList.toggle('on', p.dataset.panel === tab));
    if (!silent) persist();
  }

  function bindRequestEditor() {
    kvParams = kvEditor($('#kvParams'), () => S.req.params, {
      keyPh: '예) page', valPh: '예) 1', onChange: () => { syncUrlFromParams(); reqChanged(); }
    });
    kvHeaders = kvEditor($('#kvHeaders'), () => S.req.headers, {
      keyPh: '예) Content-Type', valPh: '예) application/json', keyList: 'dlHeaderKeys', valList: 'dlHeaderValues', onChange: () => reqChanged()
    });
    kvForm = kvEditor($('#kvForm'), () => S.req.body.form, { keyPh: '예) username', valPh: '예) hong', onChange: () => reqChanged() });
    kvMultipart = kvEditor($('#kvMultipart'), () => S.req.body.multipart, { file: true, keyPh: '필드 이름', valPh: '값', onChange: () => reqChanged() });

    $('#reqName').addEventListener('input', (e) => { S.req.name = e.target.value; reqChanged(); });
    $('#reqName').addEventListener('blur', (e) => { if (!e.target.value.trim()) { S.req.name = '새 요청'; e.target.value = S.req.name; reqChanged(); } renderLibrary(); });
    $('#method').addEventListener('change', (e) => {
      S.req.method = e.target.value;
      setMethodClass();
      if (['POST', 'PUT', 'PATCH'].includes(S.req.method) && S.req.body.mode === 'none' && S.settings.beginner) {
        toast(S.req.method + ' 요청은 보통 바디 탭에 내용을 넣어요', '', 3000);
      }
      reqChanged();
    });
    const url = $('#url');
    url.addEventListener('input', () => {
      S.req.url = url.value;
      syncParamsFromUrl();
      kvParams.render();
      renderMirrorTab();
      reqChanged();
    });
    url.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (/^\s*(\$\s+)?curl(\.exe)?\s/i.test(text)) {
        e.preventDefault();
        importCurl(text);
      }
    });
    url.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });

    $$('#reqTabs button').forEach((b) => b.addEventListener('click', () => switchReqTab(b.dataset.tab)));

    // 헤더 프리셋
    $$('[data-preset-header]').forEach((b) => b.addEventListener('click', () => {
      const [k, v] = b.dataset.presetHeader.split('|');
      const ex = S.req.headers.find((h) => h.key.toLowerCase() === k.toLowerCase());
      if (ex) { ex.value = v; ex.enabled = true; } else S.req.headers.push({ key: k, value: v, enabled: true });
      kvHeaders.render(); reqChanged();
      toast(k + ' 헤더를 추가했어요', 'ok', 1500);
    }));

    // 바디
    $$('#bodyMode button').forEach((b) => b.addEventListener('click', () => {
      const prev = S.req.body.mode;
      S.req.body.mode = b.dataset.mode;
      if (b.dataset.mode === 'json' && prev !== 'json' && !S.req.body.raw.trim()) S.req.body.raw = '{\n  \n}';
      renderBody(); reqChanged();
    }));
    const ta = $('#bodyRaw');
    ta.addEventListener('input', () => { S.req.body.raw = ta.value; validateJson(); reqChanged(); });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = ta.selectionStart, en = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(en);
        ta.selectionStart = ta.selectionEnd = s + 2;
        S.req.body.raw = ta.value; reqChanged();
      }
    });
    $('#rawType').addEventListener('change', (e) => { S.req.body.rawType = e.target.value; reqChanged(); });
    $('#btnBeautify').addEventListener('click', () => {
      try {
        S.req.body.raw = JSON.stringify(JSON.parse(S.req.body.raw), null, 2);
        ta.value = S.req.body.raw; validateJson(); reqChanged();
        toast('정렬했어요', 'ok', 1200);
      } catch (e) { toast('JSON 형식 오류가 있어 정렬할 수 없어요', 'err'); }
    });

    // 인증
    $('#authType').addEventListener('change', (e) => { S.req.auth.type = e.target.value; renderAuth(); reqChanged(); });
    [['#authBearer', 'bearer'], ['#authUser', 'username'], ['#authPass', 'password'], ['#authKeyName', 'apiKeyName'], ['#authKeyValue', 'apiKeyValue']].forEach(([sel, key]) => {
      $(sel).addEventListener('input', (e) => { S.req.auth[key] = e.target.value; reqChanged(); });
    });
    $('#authKeyIn').addEventListener('change', (e) => { S.req.auth.apiKeyIn = e.target.value; reqChanged(); });

    // 미러
    $('#mirrorEnabled').addEventListener('change', (e) => {
      S.settings.mirror.enabled = e.target.checked;
      if (e.target.checked && !S.settings.mirror.baseUrl) { $('#mirrorBase').focus(); toast('비교할 서버 주소를 입력하세요'); }
      updateCounts(); persist();
    });
    $('#mirrorBase').addEventListener('input', (e) => { S.settings.mirror.baseUrl = e.target.value.trim(); renderMirrorTab(); persist(); });
  }

  /* ------------------------------------------------------------------ *
   * 6. 요청 해석 (환경변수, 인증, 바디)
   * ------------------------------------------------------------------ */
  function activeVars() {
    const env = S.envs.find((e) => e.id === S.activeEnv);
    const vars = {};
    if (env) env.vars.forEach((v) => { if (v.enabled !== false && v.key) vars[v.key] = v.value; });
    return vars;
  }

  function resolveRequest(req, lenient) {
    const vars = activeVars();
    const missing = new Set();
    const sub = (s) => String(s === undefined || s === null ? '' : s).replace(/\{\{\s*([\w.\-]+)\s*\}\}/g, (m, k) => {
      if (Object.prototype.hasOwnProperty.call(vars, k)) return vars[k];
      missing.add(k); return m;
    });
    let url = sub((req.url || '').trim());
    if (url && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = (/^(localhost|127\.|10\.|192\.168\.|172\.)/.test(url) ? 'http://' : 'https://') + url;
    const headers = req.headers.filter((h) => h.enabled !== false && h.key && h.key.trim()).map((h) => [sub(h.key.trim()), sub(h.value)]);
    const has = (n) => headers.some((h) => h[0].toLowerCase() === n);
    const a = req.auth;
    if (a.type === 'bearer' && a.bearer && !has('authorization')) headers.push(['Authorization', 'Bearer ' + sub(a.bearer).trim()]);
    if (a.type === 'basic' && (a.username || a.password) && !has('authorization')) headers.push(['Authorization', 'Basic ' + CurlParser.b64encode(sub(a.username) + ':' + sub(a.password))]);
    if (a.type === 'apikey' && a.apiKeyName && a.apiKeyValue) {
      if (a.apiKeyIn === 'query') url += (url.indexOf('?') >= 0 ? '&' : '?') + encodeURIComponent(sub(a.apiKeyName)) + '=' + encodeURIComponent(sub(a.apiKeyValue));
      else if (!has(a.apiKeyName.toLowerCase())) headers.push([sub(a.apiKeyName), sub(a.apiKeyValue)]);
    }
    let bodyText = null;
    let multipart = null;
    const b = req.body;
    if (b.mode === 'json') {
      bodyText = sub(b.raw);
      if (!has('content-type')) headers.push(['Content-Type', 'application/json']);
    } else if (b.mode === 'form') {
      bodyText = b.form.filter((r) => r.enabled !== false && r.key).map((r) => encodeURIComponent(sub(r.key)) + '=' + encodeURIComponent(sub(r.value))).join('&');
      if (!has('content-type')) headers.push(['Content-Type', 'application/x-www-form-urlencoded']);
    } else if (b.mode === 'raw') {
      bodyText = sub(b.raw);
      if (!has('content-type') && b.rawType) headers.push(['Content-Type', b.rawType]);
    } else if (b.mode === 'multipart') {
      multipart = b.multipart.filter((r) => r.enabled !== false && r.key).map((r) => {
        if ((r.type || 'text') === 'file') {
          if (!r.file && !lenient) throw new Error('"' + r.key + '" 필드의 파일을 선택해 주세요.');
          return { name: sub(r.key), filename: r.file ? r.file.name : (r.fileName || 'file'), contentType: r.file ? r.file.type : 'application/octet-stream', data: r.file ? r.file.data : '' };
        }
        return { name: sub(r.key), value: sub(r.value) };
      });
    }
    return {
      method: req.method, url: url, headers: headers, bodyText: bodyText, multipart: multipart,
      body: bodyText, // toCurl 호환
      missing: Array.from(missing), insecure: S.settings.insecure
    };
  }

  function mirrorUrl(url) {
    const base = (S.settings.mirror.baseUrl || '').trim();
    if (!base || !url) return '';
    try {
      const u = new URL(url);
      const m = new URL(/^[a-z]+:\/\//i.test(base) ? base : 'https://' + base);
      const prefix = m.pathname.replace(/\/$/, '');
      return m.origin + prefix + u.pathname + u.search + u.hash;
    } catch (e) { return ''; }
  }

  /* ------------------------------------------------------------------ *
   * 7. 전송
   * ------------------------------------------------------------------ */
  function useServer() {
    return S.settings.transport === 'server' && S.serverOk !== false;
  }

  async function transport(resolved, signal) {
    if (useServer()) {
      const spec = {
        method: resolved.method, url: resolved.url, headers: resolved.headers,
        body: resolved.multipart ? { mode: 'multipart', parts: resolved.multipart } : (resolved.bodyText !== null ? { mode: 'text', text: resolved.bodyText } : null),
        proxy: S.settings.proxy, insecure: S.settings.insecure, followRedirects: S.settings.followRedirects,
        timeoutMs: (Number(S.settings.timeoutSec) || 30) * 1000
      };
      const headers = { 'Content-Type': 'application/json' };
      if (S.settings.accessKey) headers['X-Access-Key'] = S.settings.accessKey;
      const res = await fetch('api/send', { method: 'POST', headers: headers, body: JSON.stringify(spec), signal: signal });
      const data = await res.json().catch(() => ({ ok: false, error: { code: 'SERVER', message: 'EasyAPI 서버 응답을 해석하지 못했어요.' } }));
      if (res.status === 401 && data.error && data.error.code === 'ACCESS_KEY') {
        setTimeout(() => openSettings('security'), 300);
      }
      return data;
    }
    return directFetch(resolved, signal);
  }

  async function directFetch(r, signal) {
    const started = performance.now();
    try {
      const init = { method: r.method, headers: {}, signal: signal, redirect: S.settings.followRedirects ? 'follow' : 'manual' };
      r.headers.forEach(([k, v]) => { try { init.headers[k] = v; } catch (e) { /* noop */ } });
      if (r.multipart) {
        const fd = new FormData();
        r.multipart.forEach((p) => {
          if (p.filename !== undefined) {
            const bin = atob(p.data || '');
            const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
            fd.append(p.name, new Blob([bytes], { type: p.contentType }), p.filename);
          } else fd.append(p.name, p.value);
        });
        Object.keys(init.headers).forEach((k) => { if (k.toLowerCase() === 'content-type') delete init.headers[k]; });
        init.body = fd;
      } else if (r.bodyText !== null && !['GET', 'HEAD'].includes(r.method)) init.body = r.bodyText;
      const res = await fetch(r.url, init);
      const buf = new Uint8Array(await res.arrayBuffer());
      const ct = res.headers.get('content-type') || '';
      const textual = /json|text|xml|javascript|html|urlencoded/i.test(ct) || !buf.slice(0, 1024).includes(0);
      let body;
      if (textual) body = new TextDecoder().decode(buf);
      else { let bin = ''; buf.forEach((x) => { bin += String.fromCharCode(x); }); body = btoa(bin); }
      const headers = [];
      res.headers.forEach((v, k) => headers.push([k, v]));
      return {
        ok: true, status: res.status, statusText: res.statusText, headers: headers, contentType: ct,
        body: body, bodyEncoding: textual ? 'utf8' : 'base64', size: buf.length, timeMs: Math.round(performance.now() - started), url: res.url || r.url, redirects: [], direct: true
      };
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      return {
        ok: false, timeMs: Math.round(performance.now() - started),
        error: { code: 'CORS_OR_NETWORK', message: '브라우저가 요청을 막았어요 (CORS 또는 네트워크 문제). 대부분의 외부 API는 브라우저 직접 전송을 허용하지 않아요. EasyAPI 서버를 실행하고 설정 → 전송 방식을 "서버 경유"로 바꾸세요.' }
      };
    }
  }

  async function send() {
    if (S.sending) return;
    if (!S.req.url.trim()) { toast('주소(URL)를 먼저 입력하세요', 'err'); $('#url').focus(); return; }
    let resolved;
    try { resolved = resolveRequest(S.req); } catch (e) { toast(e.message, 'err', 3500); switchReqTab('body'); return; }
    if (resolved.missing.length) {
      toast('정의되지 않은 변수: ' + resolved.missing.map((m) => '{{' + m + '}}').join(', ') + ' → 환경 변수를 확인하세요', 'err', 4000);
    }
    try { new URL(resolved.url); } catch (e) { toast('주소 형식이 올바르지 않아요', 'err'); return; }

    const ctrl = new AbortController();
    S.sending = ctrl;
    setLoading(true);
    const jobs = [transport(resolved, ctrl.signal)];
    const doMirror = S.settings.mirror.enabled && mirrorUrl(resolved.url);
    if (doMirror) jobs.push(transport(Object.assign({}, resolved, { url: mirrorUrl(resolved.url) }), ctrl.signal));
    try {
      const results = await Promise.all(jobs);
      S.response = results[0];
      S.mirrorResponse = doMirror ? results[1] : null;
      S.responseReq = { method: resolved.method, url: resolved.url, mirrorUrl: doMirror ? mirrorUrl(resolved.url) : '' };
      addHistory(S.response);
      S.ui.respTab = doMirror ? 'compare' : (S.ui.respTab === 'compare' ? 'body' : S.ui.respTab);
      renderResponse();
      Room.publish('response', { response: trimForSync(S.response), mirror: trimForSync(S.mirrorResponse), meta: S.responseReq });
      if (isMobile()) setView('response');
    } catch (e) {
      if (e.name === 'AbortError') toast('요청을 취소했어요');
      else {
        S.response = { ok: false, error: { code: 'APP', message: '전송 실패: ' + e.message + ' (EasyAPI 서버가 실행 중인지 확인하세요)' }, timeMs: 0 };
        renderResponse();
        if (isMobile()) setView('response');
      }
    } finally {
      S.sending = null;
      setLoading(false);
    }
  }

  function setLoading(on) {
    $('#btnSend').classList.toggle('loading', on);
    $('#btnSend').disabled = on;
    $('#respLoading').hidden = !on;
    if (on) { $('#respEmpty').hidden = true; $('#resp').hidden = true; }
    else if (!S.response) $('#respEmpty').hidden = false;
  }

  function trimForSync(r) {
    if (!r) return null;
    const c = Object.assign({}, r);
    if (c.body && c.body.length > 1500000) { c.body = c.body.slice(0, 1500000); c.truncated = true; }
    return c;
  }

  function addHistory(res) {
    S.history.unshift({
      id: uid(), ts: Date.now(), req: stripFiles(S.req),
      status: res && res.ok ? res.status : null, timeMs: res ? res.timeMs : null, ok: !!(res && res.ok)
    });
    S.history = S.history.slice(0, 100);
    persist();
    renderLibrary();
  }

  /* ------------------------------------------------------------------ *
   * 8. 응답 렌더링
   * ------------------------------------------------------------------ */
  function highlightJson(str) {
    return escText(str).replace(/("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/g, (m) => {
      let cls = 'j-n';
      if (m[0] === '"') cls = /:$/.test(m) ? 'j-k' : 'j-s';
      else if (m === 'true' || m === 'false') cls = 'j-b';
      else if (m === 'null') cls = 'j-null';
      return '<span class="' + cls + '">' + m + '</span>';
    });
  }

  function respKind(r) {
    const ct = (r.contentType || '').toLowerCase();
    if (r.bodyEncoding === 'base64') return /^image\//.test(ct) ? 'image' : 'binary';
    if (/json/.test(ct)) return 'json';
    const t = (r.body || '').trim();
    if (/^[\[{]/.test(t)) { try { JSON.parse(t); return 'json'; } catch (e) { /* noop */ } }
    if (/html/.test(ct) || /^<!doctype html|^<html/i.test(t)) return 'html';
    if (/xml/.test(ct)) return 'xml';
    return 'text';
  }

  function renderResponse() {
    const r = S.response;
    $('#respLoading').hidden = true;
    if (!r) { $('#respEmpty').hidden = false; $('#resp').hidden = true; return; }
    $('#respEmpty').hidden = true;
    $('#resp').hidden = false;
    if (isMobile() && !document.body.classList.contains('view-response')) $('#respDot').hidden = false;

    const chip = $('#statusChip');
    const explain = $('#statusExplain');
    if (!r.ok) {
      chip.className = 'status-chip err';
      chip.innerHTML = '<i class="dot"></i>ERROR';
      explain.className = 'status-explain err';
      explain.innerHTML = '<b>' + esc(r.error ? r.error.code : '') + '</b> · ' + esc(r.error ? r.error.message : '알 수 없는 오류');
      $('#respTime').textContent = formatMs(r.timeMs);
      $('#respSize').textContent = '-';
      $('#proxyBadge').hidden = true;
      $('#cntRespHeaders').textContent = '';
      $('#respHeaders').innerHTML = '';
      $('#respBody').innerHTML = '<pre>' + esc(r.error && r.error.detail ? r.error.detail : '') + '</pre>';
    } else {
      const info = statusInfo(r.status);
      chip.className = 'status-chip s' + Math.floor(r.status / 100);
      chip.innerHTML = '<i class="dot"></i>' + r.status + ' ' + esc(r.statusText || info[0]);
      explain.className = 'status-explain beginner';
      let extra = '';
      if (r.redirects && r.redirects.length) extra = ' · 리다이렉트 ' + r.redirects.length + '회 따라감';
      if (r.truncated) extra += ' · 응답이 너무 커서 일부만 표시';
      explain.innerHTML = '<b>' + esc(info[0] || r.statusText) + '</b> — ' + esc(info[1]) + esc(extra);
      $('#respTime').textContent = formatMs(r.timeMs);
      $('#respSize').textContent = formatBytes(r.size);
      $('#proxyBadge').hidden = !r.viaProxy;
      $('#cntRespHeaders').textContent = (r.headers || []).length || '';
      $('#respHeaders').innerHTML = (r.headers || []).map((h) => '<tr><td>' + esc(h[0]) + '</td><td>' + esc(h[1]) + '</td></tr>').join('') ||
        '<tr><td colspan="2" class="muted">헤더 없음</td></tr>';
      renderRespBody();
    }
    const hasMirror = !!S.mirrorResponse;
    $('#tabCompare').hidden = !hasMirror;
    if (!hasMirror && S.ui.respTab === 'compare') S.ui.respTab = 'body';
    if (hasMirror) renderCompare();
    switchRespTab(S.ui.respTab);
  }

  function renderRespBody() {
    const r = S.response;
    const box = $('#respBody');
    if (!r || !r.ok) return;
    const kind = respKind(r);
    const mode = S.ui.viewMode;
    $$('#viewMode button').forEach((b) => b.classList.toggle('on', b.dataset.view === mode));
    const body = r.body || '';
    if (!body) { box.innerHTML = '<pre class="muted">(본문 없음)</pre>'; return; }

    if (mode === 'preview') {
      if (kind === 'html') {
        box.innerHTML = '';
        const f = document.createElement('iframe');
        f.setAttribute('sandbox', '');
        f.srcdoc = body;
        box.appendChild(f);
        return;
      }
      if (kind === 'image') {
        box.innerHTML = '<img alt="응답 이미지" src="data:' + esc(r.contentType.split(';')[0]) + ';base64,' + body + '">';
        return;
      }
    }
    if (kind === 'binary' || kind === 'image') {
      box.innerHTML = '<pre class="muted">바이너리 데이터 (' + formatBytes(r.size) + ', ' + esc(r.contentType || '형식 미상') + ')\n오른쪽 위 저장 버튼으로 파일을 받을 수 있어요.' + (kind === 'image' ? '\n"미리보기"를 누르면 이미지를 볼 수 있어요.' : '') + '</pre>';
      return;
    }
    let html;
    if (mode !== 'raw' && kind === 'json' && body.length < 3000000) {
      let pretty = body;
      try { pretty = JSON.stringify(JSON.parse(body), null, 2); } catch (e) { /* noop */ }
      html = body.length < 1500000 ? highlightJson(pretty) : escText(pretty);
    } else {
      html = escText(body);
    }
    box.innerHTML = '<pre>' + html + '</pre>';
    applyFilter();
  }

  function applyFilter() {
    const term = $('#respFilter').value.trim();
    const pre = $('#respBody pre');
    if (!pre || !term) return;
    const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const lower = term.toLowerCase();
    let first = null;
    let count = 0;
    nodes.forEach((n) => {
      const t = n.nodeValue;
      const tl = t.toLowerCase();
      if (tl.indexOf(lower) < 0) return;
      const frag = document.createDocumentFragment();
      let i = 0;
      let j;
      while ((j = tl.indexOf(lower, i)) >= 0) {
        if (j > i) frag.appendChild(document.createTextNode(t.slice(i, j)));
        const mk = document.createElement('mark');
        mk.textContent = t.slice(j, j + term.length);
        frag.appendChild(mk);
        if (!first) first = mk;
        count++;
        i = j + term.length;
      }
      if (i < t.length) frag.appendChild(document.createTextNode(t.slice(i)));
      n.parentNode.replaceChild(frag, n);
    });
    if (first) first.scrollIntoView({ block: 'center' });
    $('#respFilter').title = count + '개 일치';
  }

  function switchRespTab(tab) {
    S.ui.respTab = tab;
    $$('#respTabs button').forEach((b) => b.classList.toggle('on', b.dataset.rtab === tab));
    $$('.rtab-panel').forEach((p) => p.classList.toggle('on', p.dataset.rpanel === tab));
  }

  /* ---- 미러 비교 ---- */
  const IGNORE_HEADERS = new Set(['date', 'age', 'expires', 'last-modified', 'etag', 'x-request-id', 'x-amzn-requestid', 'x-amz-cf-id', 'x-amz-cf-pop', 'cf-ray', 'server-timing', 'report-to', 'nel', 'x-runtime', 'x-response-time', 'set-cookie', 'x-cache', 'via', 'x-served-by', 'x-timer', 'alt-svc', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'content-length']);

  function deepDiff(a, b, path, out) {
    if (out.length >= 300) return;
    const ta = Array.isArray(a) ? 'array' : (a === null ? 'null' : typeof a);
    const tb = Array.isArray(b) ? 'array' : (b === null ? 'null' : typeof b);
    if (ta !== tb) { out.push({ path, a, b }); return; }
    if (ta === 'array') {
      const n = Math.max(a.length, b.length);
      for (let i = 0; i < n; i++) {
        if (i >= a.length) out.push({ path: path + '[' + i + ']', a: undefined, b: b[i] });
        else if (i >= b.length) out.push({ path: path + '[' + i + ']', a: a[i], b: undefined });
        else deepDiff(a[i], b[i], path + '[' + i + ']', out);
      }
      return;
    }
    if (ta === 'object') {
      const keys = new Set(Object.keys(a).concat(Object.keys(b)));
      keys.forEach((k) => {
        const p = path + (/^[A-Za-z_$][\w$]*$/.test(k) ? '.' + k : '[' + JSON.stringify(k) + ']');
        if (!(k in a)) out.push({ path: p, a: undefined, b: b[k] });
        else if (!(k in b)) out.push({ path: p, a: a[k], b: undefined });
        else deepDiff(a[k], b[k], p, out);
      });
      return;
    }
    if (a !== b) out.push({ path, a, b });
  }
  const show = (v) => v === undefined ? '(없음)' : (typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v));

  function renderCompare() {
    const A = S.response;
    const B = S.mirrorResponse;
    const meta = S.responseReq || {};
    const diffs = [];
    if (!A.ok || !B.ok) {
      if (A.ok !== B.ok || (A.error && B.error && A.error.code !== B.error.code)) diffs.push({ path: '연결 결과', a: A.ok ? A.status : A.error.message, b: B.ok ? B.status : B.error.message });
    } else {
      if (A.status !== B.status) diffs.push({ path: '상태 코드', a: A.status, b: B.status });
      let bodyDiffs = [];
      let ja, jb, bothJson = false;
      try { ja = JSON.parse(A.body); jb = JSON.parse(B.body); bothJson = true; } catch (e) { /* noop */ }
      if (bothJson) deepDiff(ja, jb, '$', bodyDiffs);
      else if (A.body !== B.body) {
        const la = (A.body || '').split('\n');
        const lb = (B.body || '').split('\n');
        let i = 0;
        while (i < la.length && i < lb.length && la[i] === lb[i]) i++;
        bodyDiffs.push({ path: '본문 ' + (i + 1) + '번째 줄부터 다름', a: (la[i] || '').slice(0, 200), b: (lb[i] || '').slice(0, 200) });
      }
      bodyDiffs.forEach((d) => diffs.push(d));
    }
    const headerDiffs = [];
    if (A.ok && B.ok) {
      const ha = {}, hb = {};
      A.headers.forEach(([k, v]) => { ha[k.toLowerCase()] = v; });
      B.headers.forEach(([k, v]) => { hb[k.toLowerCase()] = v; });
      new Set(Object.keys(ha).concat(Object.keys(hb))).forEach((k) => {
        if (IGNORE_HEADERS.has(k)) return;
        if (ha[k] !== hb[k]) headerDiffs.push({ path: k, a: ha[k], b: hb[k] });
      });
    }
    $('#cntDiff').textContent = diffs.length ? diffs.length : '✓';
    const col = (label, r, url) => '<div class="cmp-col"><h4>' + label + '</h4>' +
      (r.ok ? '<span class="status-chip s' + Math.floor(r.status / 100) + '"><i class="dot"></i>' + r.status + '</span> <span class="stat"><b>' + formatMs(r.timeMs) + '</b></span> <span class="stat"><b>' + formatBytes(r.size) + '</b></span>'
        : '<span class="status-chip err"><i class="dot"></i>ERROR</span> <span class="muted">' + esc(r.error.message) + '</span>') +
      '<div class="u">' + esc(url || '') + '</div></div>';
    const list = (arr) => '<div class="diff-list">' + arr.map((d) => '<div class="diff-item"><div class="p">' + esc(d.path) + '</div><div class="a">A: ' + esc(show(d.a)) + '</div><div class="b">B: ' + esc(show(d.b)) + '</div></div>').join('') + '</div>';
    $('#compareView').innerHTML =
      '<div class="cmp-verdict ' + (diffs.length ? 'diff' : 'same') + '">' + icon(diffs.length ? 'help' : 'check') +
      (diffs.length ? diffs.length + '군데 차이가 있어요' + (diffs.length >= 300 ? ' (300개까지 표시)' : '') : '두 서버의 응답이 같아요') + '</div>' +
      '<div class="cmp-grid">' + col('A · 기본 서버', A, meta.url) + col('B · 비교 서버', B, meta.mirrorUrl) + '</div>' +
      (diffs.length ? '<div class="section-title">본문 / 상태 차이</div>' + list(diffs) : '') +
      (headerDiffs.length ? '<div class="section-title">헤더 차이 (날짜·요청ID 등 매번 바뀌는 값 제외)</div>' + list(headerDiffs) : '');
  }

  function bindResponse() {
    $$('#respTabs button').forEach((b) => b.addEventListener('click', () => switchRespTab(b.dataset.rtab)));
    $$('#viewMode button').forEach((b) => b.addEventListener('click', () => { S.ui.viewMode = b.dataset.view; renderRespBody(); persist(); }));
    $('#respFilter').addEventListener('input', debounce(renderRespBody, 200));
    $('#btnCopyResp').addEventListener('click', () => {
      const r = S.response;
      if (!r || !r.ok) return;
      let t = r.body;
      if (respKind(r) === 'json' && S.ui.viewMode !== 'raw') { try { t = JSON.stringify(JSON.parse(r.body), null, 2); } catch (e) { /* noop */ } }
      copyText(t);
    });
    $('#btnDownloadResp').addEventListener('click', () => {
      const r = S.response;
      if (!r || !r.ok) return;
      let blob;
      if (r.bodyEncoding === 'base64') {
        const bin = atob(r.body);
        blob = new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))], { type: r.contentType });
      } else blob = new Blob([r.body], { type: r.contentType || 'text/plain' });
      const kind = respKind(r);
      const ext = { json: 'json', html: 'html', xml: 'xml', text: 'txt' }[kind] || ((r.contentType || '').split('/')[1] || 'bin').split(';')[0];
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'response.' + ext;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $('#btnCancel').addEventListener('click', () => { if (S.sending) S.sending.abort(); });
  }

  function renderSamples() {
    const samples = [
      { t: 'GET · 게시글 1개 조회', d: '가장 기본적인 조회 요청', m: 'GET', url: 'https://jsonplaceholder.typicode.com/posts/1' },
      { t: 'GET · 쿼리 파라미터', d: '주소 뒤 ?postId=1 사용', m: 'GET', url: 'https://jsonplaceholder.typicode.com/comments?postId=1' },
      { t: 'POST · JSON 바디 보내기', d: '새 데이터 생성', m: 'POST', url: 'https://jsonplaceholder.typicode.com/posts', body: '{\n  "title": "안녕하세요",\n  "body": "첫 요청",\n  "userId": 1\n}' }
    ];
    const box = $('#samples');
    box.innerHTML = samples.map((s, i) => '<button class="sample" data-i="' + i + '"><span class="mbadge m-' + s.m + '">' + s.m + '</span><span><span class="t">' + esc(s.t.split('· ')[1]) + '</span><br><span class="d">' + esc(s.url.replace('https://jsonplaceholder.typicode.com', '')) + '</span></span>' + icon('chevron') + '</button>').join('') +
      '<button class="sample curl" data-curl="1"><span class="mbadge">cURL</span><span><span class="t">cURL 붙여넣기 체험</span><br><span class="d">개발자도구 → Copy as cURL</span></span>' + icon('chevron') + '</button>';
    $$('.sample[data-i]', box).forEach((b) => b.addEventListener('click', () => {
      const s = samples[Number(b.dataset.i)];
      const r = newRequest();
      r.name = s.t.split('· ')[1]; r.method = s.m; r.url = s.url;
      if (s.body) { r.body.mode = 'json'; r.body.raw = s.body; }
      loadRequest(r, null);
      if (s.body) switchReqTab('body');
      setTimeout(send, 50);
    }));
    $('.sample[data-curl]', box).addEventListener('click', () => openImport(SAMPLE_CURL));
  }
  const SAMPLE_CURL = "curl 'https://httpbin.org/post?source=easyapi' \\\n  -H 'accept: application/json' \\\n  -H 'content-type: application/json' \\\n  -H 'authorization: Bearer test-token-123' \\\n  --data-raw '{\"name\":\"홍길동\",\"items\":[1,2,3]}'";

  /* ------------------------------------------------------------------ *
   * 9. 보관함 / 기록
   * ------------------------------------------------------------------ */
  function renderMethodFilter() {
    const box = $('#methodFilter');
    box.innerHTML = ['ALL'].concat(METHODS.slice(0, 5)).map((m) => '<button class="chip ' + (S.ui.methodFilter === m ? 'on' : '') + '" data-m="' + m + '">' + (m === 'ALL' ? '전체' : m) + '</button>').join('');
    $$('button', box).forEach((b) => b.addEventListener('click', () => { S.ui.methodFilter = b.dataset.m; renderMethodFilter(); renderLibrary(); persist(); }));
  }

  function libMatch(r) {
    const q = S.ui.search.trim().toLowerCase();
    return (S.ui.methodFilter === 'ALL' || r.method === S.ui.methodFilter) &&
      (!q || (r.name || '').toLowerCase().indexOf(q) >= 0 || (r.url || '').toLowerCase().indexOf(q) >= 0);
  }

  function shortUrl(u) {
    return String(u || '').replace(/^https?:\/\//, '').replace(/^\{\{baseUrl\}\}/, '…') || '(주소 없음)';
  }

  function renderLibrary() {
    $$('[data-lib]').forEach((b) => b.classList.toggle('on', b.dataset.lib === S.ui.lib));
    const box = $('#libList');
    const filtering = S.ui.search.trim() || S.ui.methodFilter !== 'ALL';
    if (S.ui.lib === 'collections') {
      if (!S.collections.length) {
        box.innerHTML = '<div class="lib-empty">' + icon('folder') + '아직 저장한 요청이 없어요.<br>요청을 만든 뒤 <b>저장</b>을 눌러 보세요.</div>';
        return;
      }
      let html = '';
      S.collections.forEach((c) => {
        const items = c.requests.filter(libMatch);
        if (filtering && !items.length) return;
        const open = c.open || filtering;
        html += '<div class="folder ' + (open ? 'open' : '') + '" data-col="' + c.id + '">' +
          '<div style="display:flex;align-items:center"><button class="folder-head" data-toggle="' + c.id + '">' + icon('chevron', 'chev') + icon('folder') + '<span>' + esc(c.name) + '</span><span class="count">' + c.requests.length + '</span></button>' +
          '<button class="icon-btn sm" data-colmore="' + c.id + '" aria-label="폴더 메뉴">' + icon('more') + '</button></div>' +
          '<div class="folder-items">' + (items.length ? items.map((r) => itemHtml(r, c.id)).join('') : '<div class="muted" style="padding:6px 10px;font-size:12.5px">비어 있음</div>') + '</div></div>';
      });
      box.innerHTML = html || '<div class="lib-empty">' + icon('search') + '조건에 맞는 요청이 없어요.</div>';
    } else {
      const items = S.history.filter((h) => libMatch(h.req));
      if (!items.length) {
        box.innerHTML = '<div class="lib-empty">' + icon('clock') + (S.history.length ? '조건에 맞는 기록이 없어요.' : '보낸 요청이 여기에 자동으로 기록돼요.') + '</div>';
        return;
      }
      let html = '';
      let lastDay = '';
      items.forEach((h) => {
        const d = new Date(h.ts);
        const today = new Date();
        const yest = new Date(Date.now() - 86400000);
        const day = d.toDateString() === today.toDateString() ? '오늘' : (d.toDateString() === yest.toDateString() ? '어제' : (d.getMonth() + 1) + '월 ' + d.getDate() + '일');
        if (day !== lastDay) { html += '<div class="hist-day">' + day + '</div>'; lastDay = day; }
        const st = h.ok ? '<span class="meta st-' + String(h.status)[0] + '">' + h.status + '</span>' : '<span class="meta st-err">오류</span>';
        html += '<div class="item" role="button" tabindex="0" data-hist="' + h.id + '"><span class="mbadge m-' + h.req.method + '">' + h.req.method + '</span>' +
          '<span class="name">' + esc(shortUrl(h.req.url)) + '<span class="sub">' + esc(h.req.name) + ' · ' + timeAgo(h.ts) + '</span></span>' + st +
          '<button class="icon-btn more" data-histmore="' + h.id + '" aria-label="메뉴">' + icon('more') + '</button></div>';
      });
      html += '<div style="text-align:center;padding:10px"><button class="btn btn-ghost btn-sm" id="btnClearHist">기록 모두 지우기</button></div>';
      box.innerHTML = html;
      $('#btnClearHist').addEventListener('click', async () => {
        if (await confirmModal('기록 지우기', '최근 기록 ' + S.history.length + '개를 모두 지울까요?', '모두 지우기')) {
          S.history = []; persist(); renderLibrary();
        }
      });
    }
  }

  function itemHtml(r, colId) {
    const active = S.current && S.current.reqId === r.id;
    return '<div class="item ' + (active ? 'active' : '') + '" role="button" tabindex="0" data-open="' + colId + '|' + r.id + '"><span class="mbadge m-' + r.method + '">' + r.method + '</span>' +
      '<span class="name">' + esc(r.name) + '<span class="sub">' + esc(shortUrl(r.url)) + '</span></span>' +
      '<button class="icon-btn more" data-reqmore="' + colId + '|' + r.id + '" aria-label="메뉴">' + icon('more') + '</button></div>';
  }

  function findReq(colId, reqId) {
    const c = S.collections.find((x) => x.id === colId);
    return c ? { col: c, req: c.requests.find((x) => x.id === reqId) } : {};
  }

  function loadRequest(req, ref) {
    S.req = normalizeRequest(clone(req));
    S.current = ref;
    S.savedSnapshot = ref ? JSON.stringify(stripFiles(S.req)) : null;
    renderRequest();
    persist();
    Room.publishRequestDebounced();
    if (isMobile()) setView('request');
  }

  function bindLibrary() {
    $$('[data-lib]').forEach((b) => b.addEventListener('click', () => { S.ui.lib = b.dataset.lib; renderLibrary(); persist(); }));
    $('#libSearch').addEventListener('input', (e) => { S.ui.search = e.target.value; renderLibrary(); });
    $('#libList').addEventListener('click', (e) => {
      const t = e.target.closest('[data-toggle],[data-colmore],[data-reqmore],[data-histmore],[data-open],[data-hist]');
      if (!t) return;
      if (t.dataset.toggle) {
        const c = S.collections.find((x) => x.id === t.dataset.toggle);
        c.open = !c.open; renderLibrary(); persist();
      } else if (t.dataset.colmore) {
        e.stopPropagation(); colMenu(t.dataset.colmore);
      } else if (t.dataset.reqmore) {
        e.stopPropagation(); const [c, r] = t.dataset.reqmore.split('|'); reqMenu(c, r);
      } else if (t.dataset.histmore) {
        e.stopPropagation(); histMenu(t.dataset.histmore);
      } else if (t.dataset.open) {
        const [c, r] = t.dataset.open.split('|');
        const f = findReq(c, r);
        if (f.req) loadRequest(f.req, { colId: c, reqId: r });
      } else if (t.dataset.hist) {
        const h = S.history.find((x) => x.id === t.dataset.hist);
        if (h) loadRequest(h.req, null);
      }
    });
    $('#libList').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.item')) e.target.click(); });
    $('#btnNewCollection').addEventListener('click', async () => {
      const name = await promptModal('새 폴더', '폴더 이름', '새 폴더');
      if (!name) return;
      S.collections.push({ id: uid(), name: name, open: true, requests: [] });
      S.ui.lib = 'collections'; persist(); renderLibrary();
    });
    $('#btnLibMore').addEventListener('click', () => actionSheet('가져오기 / 내보내기', [
      { label: '전체 내보내기 (JSON 백업)', icon: 'download', run: exportWorkspace },
      { label: '파일 가져오기 (EasyAPI 백업 / Postman 컬렉션)', icon: 'import', run: importFile },
      { label: 'cURL 붙여넣기', icon: 'code', run: () => openImport() }
    ]));
  }

  function colMenu(colId) {
    const c = S.collections.find((x) => x.id === colId);
    if (!c) return;
    actionSheet(c.name, [
      { label: '이름 바꾸기', icon: 'edit', run: async () => { const n = await promptModal('폴더 이름 바꾸기', '이름', c.name); if (n) { c.name = n; persist(); renderLibrary(); } } },
      { label: '이 폴더 내보내기', icon: 'download', run: () => downloadJson({ easyapi: 1, collections: [c] }, c.name + '.easyapi.json') },
      { label: '폴더 삭제', icon: 'trash', danger: true, run: async () => {
        if (await confirmModal('폴더 삭제', '"' + c.name + '" 폴더와 요청 ' + c.requests.length + '개를 삭제할까요?', '삭제')) {
          S.collections = S.collections.filter((x) => x.id !== colId);
          if (S.current && S.current.colId === colId) S.current = null;
          persist(); renderLibrary(); updateDirty();
        }
      } }
    ]);
  }

  function reqMenu(colId, reqId) {
    const f = findReq(colId, reqId);
    if (!f.req) return;
    actionSheet(f.req.name, [
      { label: '열기', icon: 'edit', run: () => loadRequest(f.req, { colId, reqId }) },
      { label: '이름 바꾸기', icon: 'edit', run: async () => {
        const n = await promptModal('이름 바꾸기', '요청 이름', f.req.name);
        if (n) { f.req.name = n; if (S.current && S.current.reqId === reqId) { S.req.name = n; $('#reqName').value = n; S.savedSnapshot = JSON.stringify(stripFiles(S.req)); } persist(); renderLibrary(); }
      } },
      { label: '복제', icon: 'copy', run: () => {
        const cp = clone(f.req); cp.id = uid(); cp.name = f.req.name + ' (복사본)';
        f.col.requests.splice(f.col.requests.indexOf(f.req) + 1, 0, cp); persist(); renderLibrary();
      } },
      { label: 'cURL로 복사', icon: 'code', run: () => { try { copyText(CurlParser.toCurl(resolveRequest(normalizeRequest(f.req), true), 'bash')); } catch (e) { toast(e.message, 'err'); } } },
      { label: '삭제', icon: 'trash', danger: true, run: async () => {
        if (await confirmModal('요청 삭제', '"' + f.req.name + '"을(를) 삭제할까요?', '삭제')) {
          f.col.requests = f.col.requests.filter((x) => x.id !== reqId);
          if (S.current && S.current.reqId === reqId) S.current = null;
          persist(); renderLibrary(); updateDirty();
        }
      } }
    ]);
  }

  function histMenu(id) {
    const h = S.history.find((x) => x.id === id);
    if (!h) return;
    actionSheet(h.req.method + ' ' + shortUrl(h.req.url), [
      { label: '열기', icon: 'edit', run: () => loadRequest(h.req, null) },
      { label: '보관함에 저장', icon: 'save', run: () => { loadRequest(h.req, null); openSave(); } },
      { label: '기록에서 삭제', icon: 'trash', danger: true, run: () => { S.history = S.history.filter((x) => x.id !== id); persist(); renderLibrary(); } }
    ]);
  }

  /* ------------------------------------------------------------------ *
   * 10. 모달 시스템
   * ------------------------------------------------------------------ */
  let modalOnClose = null;
  function openModal(o) {
    const m = $('#modal');
    $('#modalTitle').textContent = o.title || '';
    const card = $('.modal-card', m);
    card.className = 'modal-card ' + (o.size || '');
    const body = $('#modalBody');
    body.innerHTML = '';
    if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
    const foot = $('#modalFoot');
    foot.innerHTML = '';
    (o.buttons || []).forEach((b) => {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (b.cls || 'btn-outline');
      btn.textContent = b.label;
      if (b.id) btn.id = b.id;
      btn.addEventListener('click', () => { const r = b.onClick ? b.onClick() : undefined; if (r !== false) closeModal(); });
      foot.appendChild(btn);
    });
    modalOnClose = o.onClose || null;
    m.hidden = false;
    if (o.onOpen) o.onOpen(body);
    const f = body.querySelector('[autofocus]');
    if (f && !isMobile()) setTimeout(() => f.focus(), 30);
  }
  function closeModal() {
    const m = $('#modal');
    if (m.hidden) return;
    m.hidden = true;
    $('#modalBody').innerHTML = '';
    const cb = modalOnClose;
    modalOnClose = null;
    if (cb) cb();
  }
  function promptModal(title, label, value) {
    return new Promise((resolve) => {
      let result = null;
      openModal({
        title, size: 'narrow',
        body: '<label class="field"><span>' + esc(label) + '</span><input type="text" id="promptInput" autofocus value="' + esc(value || '') + '"></label>',
        buttons: [{ label: '취소' }, { label: '확인', cls: 'btn-primary', onClick: () => { result = $('#promptInput').value.trim() || null; } }],
        onOpen: (b) => {
          const i = $('#promptInput', b);
          i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { result = i.value.trim() || null; closeModal(); } });
          if (isMobile()) setTimeout(() => { i.focus(); i.select(); }, 250); else setTimeout(() => i.select(), 40);
        },
        onClose: () => resolve(result)
      });
    });
  }
  function confirmModal(title, msg, okLabel) {
    return new Promise((resolve) => {
      let ok = false;
      openModal({
        title, size: 'narrow', body: '<p style="margin:4px 0 8px">' + esc(msg) + '</p>',
        buttons: [{ label: '취소' }, { label: okLabel || '확인', cls: 'btn-danger', onClick: () => { ok = true; } }],
        onClose: () => resolve(ok)
      });
    });
  }
  function actionSheet(title, actions) {
    const wrap = document.createElement('div');
    wrap.className = 'actions';
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.className = a.danger ? 'danger' : '';
      b.innerHTML = icon(a.icon || 'chevron') + esc(a.label);
      b.addEventListener('click', () => { closeModal(); setTimeout(a.run, 10); });
      wrap.appendChild(b);
    });
    openModal({ title, size: 'narrow', body: wrap });
  }

  /* ------------------------------------------------------------------ *
   * 11. cURL 가져오기
   * ------------------------------------------------------------------ */
  function autoName(method, url) {
    try {
      const u = new URL(url.replace(/\{\{[^}]+\}\}/g, 'x'));
      const segs = u.pathname.split('/').filter(Boolean);
      return method + ' /' + segs.slice(-2).join('/');
    } catch (e) { return method + ' 요청'; }
  }

  function applyParsed(parsed) {
    const p = parsed.request;
    const r = newRequest();
    r.method = METHODS.includes(p.method) ? p.method : 'GET';
    r.url = p.url;
    r.params = p.params;
    r.headers = p.headers;
    r.body = Object.assign(r.body, p.body);
    r.auth = Object.assign(r.auth, p.auth);
    r.name = autoName(r.method, r.url);
    const notes = [];
    if (p.options.insecure && !S.settings.insecure) { S.settings.insecure = true; notes.push('SSL 인증서 검증 끄기(-k)를 설정에 적용했어요'); }
    if (p.proxy) {
      S.settings.proxy = Object.assign(S.settings.proxy, { enabled: true, url: p.proxy.url, username: p.proxy.username || S.settings.proxy.username, password: p.proxy.password || S.settings.proxy.password });
      notes.push('프록시(' + p.proxy.url + ') 설정을 적용했어요');
    }
    loadRequest(r, null);
    switchReqTab(r.body.mode !== 'none' ? 'body' : (r.params.length ? 'params' : 'headers'));
    return notes;
  }

  function importCurl(text) {
    try {
      const parsed = CurlParser.parseCurl(text);
      const notes = applyParsed(parsed);
      const r = parsed.request;
      toast('cURL 가져옴: ' + r.method + ' · 헤더 ' + r.headers.length + '개' + (r.body.mode !== 'none' ? ' · 바디 ' + r.body.mode.toUpperCase() : ''), 'ok', 3000);
      notes.concat(parsed.warnings).forEach((n, i) => setTimeout(() => toast(n, '', 4000), 600 * (i + 1)));
    } catch (e) {
      toast(e.message, 'err', 4000);
    }
  }

  function summarizeParsed(parsed) {
    const r = parsed.request;
    const tags = [];
    tags.push('<span class="tag ok">' + (parsed.shell === 'cmd' ? '윈도우 cmd 형식' : 'bash 형식') + '</span>');
    if (r.params.length) tags.push('<span class="tag">파라미터 ' + r.params.length + '</span>');
    tags.push('<span class="tag">헤더 ' + r.headers.length + '</span>');
    if (r.body.mode !== 'none') tags.push('<span class="tag">바디 ' + ({ json: 'JSON', form: '폼', multipart: '파일 첨부', raw: '텍스트' }[r.body.mode]) + '</span>');
    if (r.auth.type !== 'none') tags.push('<span class="tag">인증 ' + ({ bearer: 'Bearer', basic: 'Basic' }[r.auth.type] || '') + '</span>');
    if (r.options.insecure) tags.push('<span class="tag">SSL 검증 끄기</span>');
    if (r.proxy) tags.push('<span class="tag">프록시</span>');
    return '<div class="preview-line"><span class="mbadge m-' + r.method + '">' + r.method + '</span>' + esc(r.url) + '</div><div class="preview-tags">' + tags.join('') + '</div>' +
      (parsed.warnings.length ? '<ul class="warn-list">' + parsed.warnings.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul>' : '');
  }

  function openImport(prefill) {
    let parsed = null;
    openModal({
      title: 'cURL 가져오기',
      size: 'wide',
      body:
        '<div class="how-to">' +
        '<div><b>1단계</b>크롬에서 <code>F12</code> → <b>Network</b> 탭 열기</div>' +
        '<div><b>2단계</b>요청 우클릭 → Copy → <b>Copy as cURL</b><br>(bash · cmd 모두 OK)</div>' +
        '<div><b>3단계</b>아래에 붙여넣기 → 자동으로 파라미터·헤더·바디 입력</div>' +
        '</div>' +
        '<textarea id="importText" class="code-area import-area" spellcheck="false" autocapitalize="off" placeholder="curl \'https://api.example.com/users\' -H \'Authorization: Bearer ...\'" autofocus></textarea>' +
        '<div id="importPreview" class="preview-box" hidden></div>' +
        '<p class="muted" style="font-size:12px;margin:10px 0 0">💡 주소 입력창에 cURL을 바로 붙여넣어도 자동으로 가져와져요.</p>',
      buttons: [
        { label: '클립보드에서 붙여넣기', cls: 'btn-ghost', id: 'btnPasteClip', onClick: () => { pasteFromClipboard(); return false; } },
        { label: '취소' },
        { label: '가져오기', cls: 'btn-primary', id: 'btnDoImport', onClick: () => {
          if (!parsed) { toast('먼저 cURL을 붙여넣어 주세요', 'err'); return false; }
          const notes = applyParsed(parsed);
          toast('가져왔어요. 보내기를 눌러 테스트하세요', 'ok');
          notes.forEach((n, i) => setTimeout(() => toast(n, '', 3500), 700 * (i + 1)));
          return true;
        } }
      ],
      onOpen: (body) => {
        const ta = $('#importText', body);
        const prev = $('#importPreview', body);
        const update = () => {
          const v = ta.value.trim();
          if (!v) { prev.hidden = true; parsed = null; return; }
          try {
            parsed = CurlParser.parseCurl(v);
            prev.className = 'preview-box';
            prev.innerHTML = summarizeParsed(parsed);
          } catch (e) {
            parsed = null;
            prev.className = 'preview-box bad';
            prev.textContent = '⚠ ' + e.message;
          }
          prev.hidden = false;
          $('#btnDoImport').disabled = !parsed;
        };
        ta.addEventListener('input', debounce(update, 120));
        if (prefill) { ta.value = prefill; update(); }
        $('#btnDoImport').disabled = !parsed;
        if (!navigator.clipboard || !navigator.clipboard.readText) $('#btnPasteClip').hidden = true;
      }
    });
    async function pasteFromClipboard() {
      try {
        const t = await navigator.clipboard.readText();
        const ta = $('#importText');
        ta.value = t;
        ta.dispatchEvent(new Event('input'));
      } catch (e) { toast('클립보드 접근이 막혀 있어요. 직접 붙여넣어 주세요 (길게 눌러 붙여넣기)', 'err', 3500); }
    }
  }

  /* ------------------------------------------------------------------ *
   * 12. 코드 내보내기
   * ------------------------------------------------------------------ */
  function codeSnippet(r, lang) {
    if (lang === 'bash' || lang === 'cmd') return CurlParser.toCurl(Object.assign({}, r, { followRedirects: S.settings.followRedirects }), lang);
    const hdrs = {};
    r.headers.forEach(([k, v]) => { if (!(r.multipart && /^content-type$/i.test(k))) hdrs[k] = v; });
    if (lang === 'fetch') {
      let s = '';
      if (r.multipart) {
        s += 'const form = new FormData();\n';
        r.multipart.forEach((p) => { s += p.filename !== undefined ? '// form.append(' + JSON.stringify(p.name) + ', fileInput.files[0]); // ' + p.filename + '\n' : 'form.append(' + JSON.stringify(p.name) + ', ' + JSON.stringify(p.value) + ');\n'; });
        s += '\n';
      }
      s += 'const res = await fetch(' + JSON.stringify(r.url) + ', {\n  method: ' + JSON.stringify(r.method) + ',\n  headers: ' + JSON.stringify(hdrs, null, 2).replace(/\n/g, '\n  ');
      if (r.multipart) s += ',\n  body: form';
      else if (r.bodyText !== null) s += ',\n  body: ' + JSON.stringify(r.bodyText);
      s += '\n});\nconst data = await res.text();\nconsole.log(res.status, data);';
      return s;
    }
    if (lang === 'python') {
      let s = 'import requests\n\nurl = ' + JSON.stringify(r.url) + '\nheaders = ' + JSON.stringify(hdrs, null, 4) + '\n';
      if (r.multipart) {
        const data = {}; const files = [];
        r.multipart.forEach((p) => { if (p.filename !== undefined) files.push(p); else data[p.name] = p.value; });
        s += 'data = ' + JSON.stringify(data, null, 4) + '\n';
        s += 'files = {' + files.map((f) => JSON.stringify(f.name) + ': open(' + JSON.stringify(f.filename) + ', "rb")').join(', ') + '}\n\n';
        s += 'resp = requests.request(' + JSON.stringify(r.method) + ', url, headers=headers, data=data, files=files' + (S.settings.insecure ? ', verify=False' : '') + ')\n';
      } else {
        if (r.bodyText !== null) s += 'payload = ' + JSON.stringify(r.bodyText) + '\n\n';
        s += 'resp = requests.request(' + JSON.stringify(r.method) + ', url, headers=headers' + (r.bodyText !== null ? ', data=payload.encode("utf-8")' : '') + (S.settings.insecure ? ', verify=False' : '') + ')\n';
      }
      s += 'print(resp.status_code)\nprint(resp.text)';
      return s.replace(/: true/g, ': True').replace(/: false/g, ': False').replace(/: null/g, ': None');
    }
    return '';
  }

  function openCode() {
    let r;
    try { r = resolveRequest(S.req, true); } catch (e) { toast(e.message, 'err'); return; }
    if (!r.url) { toast('주소를 먼저 입력하세요', 'err'); return; }
    let lang = 'bash';
    openModal({
      title: '코드로 내보내기', size: 'wide',
      body: '<div class="seg seg-scroll" id="codeLang"><button data-l="bash" class="on">cURL (맥/리눅스)</button><button data-l="cmd">cURL (윈도우 cmd)</button><button data-l="fetch">JavaScript</button><button data-l="python">Python</button></div>' +
        '<pre class="code-out" id="codeOut"></pre>' +
        (r.missing.length ? '<p class="muted" style="font-size:12px">⚠ 정의되지 않은 변수: ' + esc(r.missing.join(', ')) + '</p>' : '<p class="muted" style="font-size:12px">환경 변수는 실제 값으로 바뀌어 들어가요.</p>'),
      buttons: [{ label: '닫기' }, { label: '복사', cls: 'btn-primary', onClick: () => { copyText(codeSnippet(r, lang)); return false; } }],
      onOpen: (b) => {
        const out = $('#codeOut', b);
        const render = () => { out.textContent = codeSnippet(r, lang); $$('#codeLang button', b).forEach((x) => x.classList.toggle('on', x.dataset.l === lang)); };
        $$('#codeLang button', b).forEach((x) => x.addEventListener('click', () => { lang = x.dataset.l; render(); }));
        render();
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * 13. 저장
   * ------------------------------------------------------------------ */
  function saveRequest() {
    if (S.current) {
      const f = findReq(S.current.colId, S.current.reqId);
      if (f.req) {
        const copy = stripFiles(S.req);
        copy.id = f.req.id;
        f.col.requests[f.col.requests.indexOf(f.req)] = copy;
        S.savedSnapshot = JSON.stringify(stripFiles(S.req));
        persist(); renderLibrary(); updateDirty();
        toast('저장했어요', 'ok', 1500);
        return;
      }
      S.current = null;
    }
    openSave();
  }

  function openSave() {
    const opts = S.collections.map((c) => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('') + '<option value="__new">+ 새 폴더 만들기</option>';
    openModal({
      title: '보관함에 저장', size: 'narrow',
      body: '<label class="field"><span>요청 이름</span><input type="text" id="saveName" value="' + esc(S.req.name) + '" autofocus></label>' +
        '<label class="field"><span>폴더</span><select id="saveCol">' + opts + '</select></label>' +
        '<label class="field" id="saveNewWrap" hidden><span>새 폴더 이름</span><input type="text" id="saveNewCol" placeholder="예) 회원 API"></label>',
      buttons: [{ label: '취소' }, { label: '저장', cls: 'btn-primary', onClick: () => {
        const name = $('#saveName').value.trim() || '새 요청';
        let colId = $('#saveCol').value;
        if (colId === '__new') {
          const cn = $('#saveNewCol').value.trim();
          if (!cn) { toast('새 폴더 이름을 입력하세요', 'err'); return false; }
          const c = { id: uid(), name: cn, open: true, requests: [] };
          S.collections.push(c);
          colId = c.id;
        }
        const col = S.collections.find((c) => c.id === colId);
        S.req.name = name;
        S.req.id = uid();
        const copy = stripFiles(S.req);
        col.requests.push(copy);
        col.open = true;
        S.current = { colId: col.id, reqId: copy.id };
        S.savedSnapshot = JSON.stringify(stripFiles(S.req));
        $('#reqName').value = name;
        S.ui.lib = 'collections';
        persist(); renderLibrary(); updateDirty();
        toast('"' + col.name + '"에 저장했어요', 'ok');
      } }],
      onOpen: (b) => {
        const sel = $('#saveCol', b);
        if (!S.collections.length) sel.value = '__new';
        const upd = () => { $('#saveNewWrap', b).hidden = sel.value !== '__new'; };
        sel.addEventListener('change', upd); upd();
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * 14. 설정
   * ------------------------------------------------------------------ */
  function openSettings(focus) {
    const st = S.settings;
    const serverNote = S.serverOk === false
      ? '<p class="tip" style="background:var(--warn-soft)">⚠ EasyAPI 서버에 연결되지 않아 <b>브라우저 직접 전송</b>으로 동작 중이에요. 프록시·CORS 우회를 쓰려면 <code>node server.js</code>로 실행하세요.</p>' : '';
    openModal({
      title: '설정', size: 'wide',
      body:
        serverNote +
        '<section class="set-section" id="set-proxy"><h3>' + icon('shield') + '프록시</h3>' +
        '<div class="switch-row"><div><b>프록시 사용</b><p class="muted">회사망·보안망 등에서 프록시 서버를 거쳐 요청을 보내요. (HTTP/HTTPS 프록시)</p></div><label class="switch"><input type="checkbox" id="sProxyOn"' + (st.proxy.enabled ? ' checked' : '') + '><i></i></label></div>' +
        '<label class="field"><span>프록시 주소</span><input type="text" id="sProxyUrl" placeholder="예) http://proxy.company.com:8080" value="' + esc(st.proxy.url) + '" autocapitalize="off" spellcheck="false"></label>' +
        '<div class="grid-2"><label class="field"><span>아이디 (선택)</span><input type="text" id="sProxyUser" value="' + esc(st.proxy.username) + '" autocomplete="off"></label>' +
        '<label class="field"><span>비밀번호 (선택)</span><input type="password" id="sProxyPass" value="' + esc(st.proxy.password) + '" autocomplete="off"></label></div>' +
        '<label class="field"><span>프록시 제외 주소</span><input type="text" id="sProxyBypass" value="' + esc(st.proxy.bypass) + '" placeholder="localhost, 127.0.0.1, *.internal.com"><small>쉼표로 구분. 여기 적힌 주소는 프록시 없이 바로 연결해요.</small></label>' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input type="text" id="sProxyTestUrl" class="input-sm" style="flex:1;min-width:180px" value="https://example.com"><button class="btn btn-soft btn-sm" id="sProxyTest">프록시 연결 테스트</button></div>' +
        '<p id="sProxyResult" class="muted" style="font-size:12.5px;margin:8px 0 0"></p></section>' +

        '<section class="set-section"><h3>' + icon('send') + '요청 옵션</h3>' +
        '<div class="switch-row"><div><b>SSL 인증서 검증 끄기</b><p class="muted">자체 서명 인증서·사내 테스트 서버용. 운영 환경에서는 꺼두세요.</p></div><label class="switch"><input type="checkbox" id="sInsecure"' + (st.insecure ? ' checked' : '') + '><i></i></label></div>' +
        '<div class="switch-row"><div><b>리다이렉트 자동 따라가기</b><p class="muted">301/302 응답이면 새 주소로 자동 이동해요.</p></div><label class="switch"><input type="checkbox" id="sRedirect"' + (st.followRedirects ? ' checked' : '') + '><i></i></label></div>' +
        '<label class="field"><span>응답 대기 시간 (초)</span><input type="number" id="sTimeout" min="1" max="300" value="' + esc(st.timeoutSec) + '"></label>' +
        '<label class="field"><span>전송 방식</span><select id="sTransport"><option value="server">EasyAPI 서버 경유 (권장 · CORS 없음 · 프록시 지원)</option><option value="direct">브라우저에서 직접 (CORS 허용된 API만)</option></select></label></section>' +

        '<section class="set-section" id="set-mobile"><h3>' + icon('devices') + '휴대폰에서 접속</h3>' +
        '<p class="muted" style="margin:0 0 8px;font-size:13px">PC와 휴대폰이 <b>같은 Wi-Fi</b>에 있으면 아래 주소로 접속할 수 있어요. 접속 후 브라우저 메뉴 → <b>홈 화면에 추가</b>하면 앱처럼 쓸 수 있어요.</p>' +
        '<div id="sLan"><span class="muted">불러오는 중…</span></div></section>' +

        '<section class="set-section"><h3>' + icon('edit') + '화면</h3>' +
        '<label class="field"><span>테마</span><div class="seg" id="sTheme"><button data-t="auto">자동</button><button data-t="light">라이트</button><button data-t="dark">다크</button></div></label>' +
        '<div class="switch-row"><div><b>입문자 도움말 표시</b><p class="muted">각 탭의 설명과 상태 코드 해설을 보여줘요.</p></div><label class="switch"><input type="checkbox" id="sBeginner"' + (st.beginner ? ' checked' : '') + '><i></i></label></div></section>' +

        '<section class="set-section" id="set-security"><h3>' + icon('shield') + '접속 키</h3>' +
        '<label class="field"><span>서버 접속 키 (ACCESS_KEY)</span><input type="password" id="sAccessKey" value="' + esc(st.accessKey) + '" autocomplete="off"><small>서버를 ACCESS_KEY 환경변수로 실행했다면 같은 값을 입력하세요.</small></label></section>' +

        '<section class="set-section"><h3>' + icon('folder') + '데이터</h3>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-outline btn-sm" id="sExport">전체 백업 내보내기</button><button class="btn btn-outline btn-sm" id="sImport">백업/Postman 가져오기</button><button class="btn btn-ghost btn-sm" id="sReset" style="color:var(--danger)">모두 초기화</button></div>' +
        '<p class="muted" style="font-size:12px;margin:10px 0 0">모든 데이터는 이 기기 브라우저에만 저장돼요. EasyAPI v1.0</p></section>',
      buttons: [{ label: '닫기', cls: 'btn-primary' }],
      onOpen: (b) => {
        const bindSwitch = (id, fn) => $(id, b).addEventListener('change', (e) => { fn(e.target.checked); persist(); });
        const bindInput = (id, fn) => $(id, b).addEventListener('input', (e) => { fn(e.target.value); persist(); });
        bindSwitch('#sProxyOn', (v) => { st.proxy.enabled = v; if (v && S.serverOk === false) toast('프록시는 EasyAPI 서버 실행 시에만 동작해요', 'err', 3500); });
        bindInput('#sProxyUrl', (v) => { st.proxy.url = v.trim(); });
        bindInput('#sProxyUser', (v) => { st.proxy.username = v; });
        bindInput('#sProxyPass', (v) => { st.proxy.password = v; });
        bindInput('#sProxyBypass', (v) => { st.proxy.bypass = v; });
        bindSwitch('#sInsecure', (v) => { st.insecure = v; });
        bindSwitch('#sRedirect', (v) => { st.followRedirects = v; });
        bindInput('#sTimeout', (v) => { st.timeoutSec = Math.max(1, Math.min(300, Number(v) || 30)); });
        $('#sTransport', b).value = st.transport;
        $('#sTransport', b).addEventListener('change', (e) => { st.transport = e.target.value; persist(); });
        bindSwitch('#sBeginner', (v) => { st.beginner = v; applyBeginner(); });
        bindInput('#sAccessKey', (v) => { st.accessKey = v; });
        const themeBtns = $$('#sTheme button', b);
        const markTheme = () => themeBtns.forEach((x) => x.classList.toggle('on', x.dataset.t === st.theme));
        themeBtns.forEach((x) => x.addEventListener('click', () => { st.theme = x.dataset.t; applyTheme(); markTheme(); persist(); }));
        markTheme();
        $('#sProxyTest', b).addEventListener('click', async () => {
          const out = $('#sProxyResult', b);
          if (!st.proxy.enabled) { out.textContent = '먼저 "프록시 사용"을 켜세요.'; return; }
          if (S.serverOk === false) { out.textContent = '프록시 테스트는 EasyAPI 서버가 실행 중일 때만 가능해요.'; return; }
          out.textContent = '테스트 중…';
          const url = $('#sProxyTestUrl', b).value.trim() || 'https://example.com';
          try {
            const res = await transport({ method: 'GET', url: url, headers: [], bodyText: null, multipart: null });
            if (res.ok) {
              out.innerHTML = '<span style="color:var(--success);font-weight:700">✓ 성공</span> · ' + res.status + ' · ' + formatMs(res.timeMs) + (res.viaProxy ? ' · 프록시 경유' : ' · ⚠ 제외 목록에 있어 프록시 미사용');
            } else out.innerHTML = '<span style="color:var(--danger);font-weight:700">✗ 실패</span> · ' + esc(res.error.message);
          } catch (e) { out.textContent = '실패: ' + e.message; }
        });
        $('#sExport', b).addEventListener('click', exportWorkspace);
        $('#sImport', b).addEventListener('click', importFile);
        $('#sReset', b).addEventListener('click', async () => {
          closeModal();
          if (await confirmModal('모두 초기화', '보관함, 기록, 환경 변수, 설정이 모두 지워져요. 계속할까요?', '초기화')) {
            try { localStorage.removeItem(STORE_KEY); } catch (e) { /* noop */ }
            location.reload();
          }
        });
        renderLanInfo($('#sLan', b));
        if (focus) { const el = $('#set-' + focus, b); if (el) setTimeout(() => el.scrollIntoView({ block: 'start' }), 60); }
      }
    });
  }

  function appBaseUrl() {
    const info = S.serverInfo;
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    if (local && info && info.lanUrls && info.lanUrls.length) return info.lanUrls[0] + location.pathname;
    return location.origin + location.pathname;
  }

  function renderLanInfo(el) {
    const info = S.serverInfo;
    if (!info) { el.innerHTML = '<p class="muted" style="font-size:13px">서버 정보를 가져올 수 없어요. (정적 호스팅 모드)<br>현재 주소: <code>' + esc(location.href.split('#')[0]) + '</code></p>'; return; }
    const urls = info.lanUrls || [];
    if (!urls.length) { el.innerHTML = '<p class="muted">네트워크 주소를 찾지 못했어요. Wi-Fi 연결을 확인하세요.</p>'; return; }
    el.innerHTML = urls.map((u) => '<div class="lan-url"><span>' + esc(u) + '</span><button class="icon-btn sm" data-copy="' + esc(u) + '" aria-label="복사">' + icon('copy') + '</button></div>').join('') +
      '<div class="qr" id="lanQr" hidden></div><p class="muted" style="text-align:center;font-size:12px;margin:0">휴대폰 카메라로 QR을 찍으면 바로 열려요</p>';
    $$('[data-copy]', el).forEach((b) => b.addEventListener('click', () => copyText(b.dataset.copy)));
    makeQr(appBaseUrl(), $('#lanQr', el));
  }

  let qrLoading = null;
  function makeQr(text, el) {
    if (!el) return;
    if (!qrLoading) {
      qrLoading = new Promise((resolve, reject) => {
        if (window.qrcode) return resolve();
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    qrLoading.then(() => {
      const qr = window.qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      el.innerHTML = '<img alt="QR 코드" src="' + qr.createDataURL(6, 2) + '">';
      el.hidden = false;
    }).catch(() => { qrLoading = null; });
  }

  function exportWorkspace() {
    downloadJson({ easyapi: 1, exportedAt: new Date().toISOString(), collections: S.collections, envs: S.envs }, 'easyapi-backup-' + new Date().toISOString().slice(0, 10) + '.json');
  }
  function downloadJson(obj, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
    a.download = name.replace(/[\\/:*?"<>|]/g, '_');
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('파일로 내보냈어요', 'ok');
  }

  function importFile() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.addEventListener('change', () => {
      const f = inp.files[0];
      if (!f) return;
      f.text().then((t) => {
        let data;
        try { data = JSON.parse(t); } catch (e) { toast('JSON 파일이 아니에요', 'err'); return; }
        let added = 0;
        if (data.info && /postman/i.test(String(data.info.schema || data.info._postman_id || '')) || (data.info && data.item)) {
          const cols = fromPostman(data);
          cols.forEach((c) => { S.collections.push(c); added += c.requests.length; });
          (data.variable || []).length && S.envs.push({ id: uid(), name: (data.info.name || 'Postman') + ' 변수', vars: data.variable.map((v) => ({ key: v.key, value: String(v.value === undefined ? '' : v.value), enabled: !v.disabled })) });
        } else if (data.values && data.name && Array.isArray(data.values)) {
          S.envs.push({ id: uid(), name: data.name, vars: data.values.map((v) => ({ key: v.key, value: String(v.value === undefined ? '' : v.value), enabled: v.enabled !== false })) });
          toast('환경 "' + data.name + '"을 가져왔어요', 'ok'); persist(); renderEnvSelect(); return;
        } else if (data.easyapi) {
          (data.collections || []).forEach((c) => { c.id = uid(); c.requests = (c.requests || []).map((r) => Object.assign(normalizeRequest(r), { id: uid() })); S.collections.push(c); added += c.requests.length; });
          (data.envs || []).forEach((e) => { e.id = uid(); S.envs.push(e); });
        } else { toast('알 수 없는 파일 형식이에요', 'err'); return; }
        S.ui.lib = 'collections';
        persist(); renderLibrary(); renderEnvSelect();
        toast('요청 ' + added + '개를 가져왔어요', 'ok');
        if (isMobile()) setView('library');
      });
    });
    inp.click();
  }

  function fromPostman(pm) {
    const cols = [];
    const rootName = (pm.info && pm.info.name) || 'Postman 컬렉션';
    const conv = (item) => {
      const rq = item.request || {};
      const r = newRequest();
      r.name = item.name || '요청';
      r.method = String(rq.method || 'GET').toUpperCase();
      r.url = typeof rq.url === 'string' ? rq.url : ((rq.url && rq.url.raw) || '');
      r.params = CurlParser.parseQueryPairs(CurlParser.splitUrl(r.url).query);
      r.headers = (rq.header || []).map((h) => ({ key: h.key, value: h.value, enabled: !h.disabled }));
      const b = rq.body || {};
      if (b.mode === 'raw') {
        const lang = b.options && b.options.raw && b.options.raw.language;
        r.body.mode = lang === 'json' || /^[\[{]/.test((b.raw || '').trim()) ? 'json' : 'raw';
        r.body.raw = b.raw || '';
      } else if (b.mode === 'urlencoded') {
        r.body.mode = 'form';
        r.body.form = (b.urlencoded || []).map((x) => ({ key: x.key, value: x.value || '', enabled: !x.disabled }));
      } else if (b.mode === 'formdata') {
        r.body.mode = 'multipart';
        r.body.multipart = (b.formdata || []).map((x) => ({ key: x.key, value: x.value || '', type: x.type === 'file' ? 'file' : 'text', fileName: x.src || '', enabled: !x.disabled }));
      }
      const a = rq.auth;
      const val = (arr, k) => ((arr || []).find((x) => x.key === k) || {}).value || '';
      if (a && a.type === 'bearer') { r.auth.type = 'bearer'; r.auth.bearer = val(a.bearer, 'token'); }
      if (a && a.type === 'basic') { r.auth.type = 'basic'; r.auth.username = val(a.basic, 'username'); r.auth.password = val(a.basic, 'password'); }
      if (a && a.type === 'apikey') { r.auth.type = 'apikey'; r.auth.apiKeyName = val(a.apikey, 'key'); r.auth.apiKeyValue = val(a.apikey, 'value'); r.auth.apiKeyIn = val(a.apikey, 'in') === 'query' ? 'query' : 'header'; }
      return r;
    };
    const walk = (items, name) => {
      const col = { id: uid(), name: name, open: true, requests: [] };
      (items || []).forEach((it) => {
        if (it.item) walk(it.item, name + ' / ' + it.name);
        else if (it.request) col.requests.push(conv(it));
      });
      if (col.requests.length) cols.unshift(col);
    };
    walk(pm.item, rootName);
    return cols.reverse();
  }

  /* ------------------------------------------------------------------ *
   * 15. 환경 변수
   * ------------------------------------------------------------------ */
  function renderEnvSelect() {
    const sel = $('#envSelect');
    sel.innerHTML = '<option value="">환경 없음</option>' + S.envs.map((e) => '<option value="' + e.id + '">' + esc(e.name) + '</option>').join('') + '<option value="__manage">환경 관리…</option>';
    sel.value = S.envs.some((e) => e.id === S.activeEnv) ? S.activeEnv : '';
    $('#envWrap').classList.toggle('active', !!sel.value);
  }

  function openEnv(selectId) {
    let curId = selectId || S.activeEnv || (S.envs[0] && S.envs[0].id);
    openModal({
      title: '환경 변수', size: 'wide',
      body: '<p class="tip beginner">자주 쓰는 값(서버 주소, 토큰 등)을 저장해 두고 <code>{{변수명}}</code>으로 어디서나 사용해요. 예) <code>{{baseUrl}}/users</code><br>개발/운영 환경을 나눠 두고 상단 선택 상자로 전환하세요.</p>' +
        '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap"><select id="envPick" style="flex:1;min-width:160px"></select>' +
        '<button class="btn btn-soft btn-sm" id="envAdd">' + icon('plus') + '새 환경</button></div>' +
        '<div id="envEditor"></div>',
      buttons: [{ label: '닫기', cls: 'btn-primary' }],
      onClose: () => { renderEnvSelect(); renderMirrorTab(); },
      onOpen: (b) => {
        const pick = $('#envPick', b);
        const editor = $('#envEditor', b);
        const draw = () => {
          pick.innerHTML = S.envs.map((e) => '<option value="' + e.id + '">' + esc(e.name) + (e.id === S.activeEnv ? ' (사용 중)' : '') + '</option>').join('');
          const env = S.envs.find((e) => e.id === curId);
          if (!env) { editor.innerHTML = '<div class="empty-mini">환경이 없어요. "새 환경"을 눌러 만들어 보세요.</div>'; pick.hidden = true; return; }
          pick.hidden = false;
          pick.value = env.id;
          editor.innerHTML = '<label class="field"><span>환경 이름</span><input type="text" id="envName" value="' + esc(env.name) + '"></label><div class="kv" id="envKv"></div>' +
            '<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn btn-outline btn-sm" id="envUse">' + (env.id === S.activeEnv ? '✓ 사용 중' : '이 환경 사용하기') + '</button>' +
            '<button class="btn btn-ghost btn-sm" id="envDel" style="color:var(--danger)">환경 삭제</button></div>';
          kvEditor($('#envKv', editor), () => env.vars, { keyPh: '변수명 예) baseUrl', valPh: '값 예) https://api.example.com', keyLabel: '변수명', valLabel: '값', onChange: () => persist() }).render();
          $('#envName', editor).addEventListener('input', (e) => { env.name = e.target.value; persist(); });
          $('#envName', editor).addEventListener('change', draw);
          $('#envUse', editor).addEventListener('click', () => { S.activeEnv = env.id; persist(); draw(); renderEnvSelect(); toast('"' + env.name + '" 환경을 사용해요', 'ok'); });
          $('#envDel', editor).addEventListener('click', () => {
            S.envs = S.envs.filter((e) => e.id !== env.id);
            if (S.activeEnv === env.id) S.activeEnv = null;
            curId = S.envs[0] && S.envs[0].id;
            persist(); draw();
          });
        };
        pick.addEventListener('change', () => { curId = pick.value; draw(); });
        $('#envAdd', b).addEventListener('click', () => {
          const env = { id: uid(), name: '새 환경 ' + (S.envs.length + 1), vars: [] };
          S.envs.push(env); curId = env.id;
          if (!S.activeEnv) S.activeEnv = env.id;
          persist(); draw();
        });
        draw();
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * 16. 기기 미러링 (PC ↔ 휴대폰 실시간 동기화)
   * ------------------------------------------------------------------ */
  const Room = {
    code: null, es: null, peers: 0, applying: false,
    clientId: (function () { try { let id = sessionStorage.getItem('easyapi.client'); if (!id) { id = uid(); sessionStorage.setItem('easyapi.client', id); } return id; } catch (e) { return uid(); } })(),
    keyQs() { return S.settings.accessKey ? '&key=' + encodeURIComponent(S.settings.accessKey) : ''; },
    join(code, isHost) {
      this.leave(true);
      if (S.serverOk === false) { toast('기기 미러링은 EasyAPI 서버 실행 시에만 사용할 수 있어요', 'err'); return; }
      this.code = code.toUpperCase();
      try { localStorage.setItem('easyapi.room', this.code); } catch (e) { /* noop */ }
      const es = new EventSource('api/room/' + this.code + '/events?client=' + this.clientId + this.keyQs());
      this.es = es;
      es.addEventListener('init', (e) => {
        const d = JSON.parse(e.data);
        if (!isHost && d.state && d.state.request) this.applyRequest(d.state.request);
        else this.publish('request', stripFiles(S.req));
        if (!isHost && d.state && d.state.response) this.applyResponse(d.state.response, true);
        this.updateUi();
      });
      es.addEventListener('presence', (e) => { this.peers = JSON.parse(e.data).peers; this.updateUi(); });
      es.addEventListener('update', (e) => {
        const d = JSON.parse(e.data);
        if (d.client === this.clientId) return;
        if (d.type === 'request') this.applyRequest(d.payload);
        if (d.type === 'response') this.applyResponse(d.payload);
      });
      es.onerror = () => { this.updateUi('재연결 중…'); };
      this.updateUi();
    },
    leave(silent) {
      if (this.es) this.es.close();
      this.es = null;
      if (this.code && !silent) toast('기기 미러링을 종료했어요');
      this.code = null; this.peers = 0;
      try { localStorage.removeItem('easyapi.room'); } catch (e) { /* noop */ }
      this.updateUi();
    },
    publish(type, payload) {
      if (!this.code || this.applying) return;
      const headers = { 'Content-Type': 'application/json' };
      if (S.settings.accessKey) headers['X-Access-Key'] = S.settings.accessKey;
      fetch('api/room/' + this.code, { method: 'POST', headers: headers, body: JSON.stringify({ client: this.clientId, type: type, payload: payload }) }).catch(() => { /* noop */ });
    },
    applyRequest(req) {
      this.applying = true;
      const files = S.req.body.multipart;
      S.req = normalizeRequest(req);
      // 내 기기에서 고른 파일은 유지
      S.req.body.multipart.forEach((row) => { const m = (files || []).find((x) => x.key === row.key && x.file); if (m && !row.file) row.file = m.file; });
      const active = document.activeElement;
      const activeId = active && active.id;
      renderRequest();
      if (activeId && $('#' + activeId)) { const el = $('#' + activeId); el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* noop */ } }
      persist();
      this.applying = false;
    },
    applyResponse(p, quiet) {
      if (!p || !p.response) return;
      S.response = p.response;
      S.mirrorResponse = p.mirror || null;
      S.responseReq = p.meta || null;
      renderResponse();
      if (!quiet) {
        toast('다른 기기에서 보낸 요청 결과가 도착했어요', 'ok');
        if (isMobile()) setView('response');
      }
    },
    updateUi(state) {
      const on = !!this.code;
      $('#roomDot').hidden = !on;
      $('#roomDot').style.background = this.peers > 1 ? 'var(--success)' : 'var(--warn)';
      $('#btnMirrorRoom2').textContent = on ? '연결됨 · ' + this.code : '연결하기';
      const st = $('#roomStatus');
      if (st) st.innerHTML = on ? (state || (this.peers > 1 ? '<span style="color:var(--success)">● ' + this.peers + '대 기기 연결됨</span>' : '<span style="color:var(--warn)">● 다른 기기를 기다리는 중…</span>')) : '';
    }
  };
  Room.publishRequestDebounced = debounce(() => Room.publish('request', stripFiles(S.req)), 350);

  function openRoom() {
    const draw = (b) => {
      if (Room.code) {
        const link = appBaseUrl() + '?room=' + Room.code + (S.settings.accessKey ? '#key=' + encodeURIComponent(S.settings.accessKey) : '');
        b.innerHTML = '<p class="muted" style="text-align:center;margin:0">다른 기기에서 아래 코드를 입력하거나 QR을 찍으세요</p>' +
          '<div class="room-code">' + Room.code + '</div><p id="roomStatus" style="text-align:center;font-weight:700;font-size:13px;margin:0 0 6px"></p>' +
          '<div class="qr" id="roomQr" hidden></div>' +
          '<div class="lan-url"><span>' + esc(link) + '</span><button class="icon-btn sm" id="roomCopy" aria-label="링크 복사">' + icon('copy') + '</button></div>' +
          '<ul class="steps-list"><li>요청을 편집하면 상대 기기에 실시간으로 반영돼요.</li><li>어느 기기에서든 <b>보내기</b>를 누르면 결과가 양쪽에 표시돼요.</li><li>휴대폰으로 PC의 <code>localhost</code> API도 테스트할 수 있어요 (요청은 서버 PC에서 실행).</li></ul>';
        makeQr(link, $('#roomQr', b));
        $('#roomCopy', b).addEventListener('click', () => copyText(link));
        Room.updateUi();
      } else {
        b.innerHTML = '<div class="onb-step" style="padding-bottom:6px"><div class="big">' + icon('devices') + 'DEVICE SYNC</div><h3>PC ↔ 휴대폰 화면 미러링</h3>' +
          '<p>PC에서 만든 요청을 휴대폰에서 그대로 보고, 휴대폰에서 바로 보내 결과를 확인할 수 있어요.</p></div>' +
          '<button class="btn btn-primary btn-block" id="roomCreate" style="height:42px;margin:18px 0 10px">새 연결 만들기 (이 기기가 기준)</button>' +
          '<div style="display:flex;gap:8px"><input type="text" id="roomInput" placeholder="받은 코드 입력 (예: AB12CD)" maxlength="12" style="text-transform:uppercase;font-family:var(--mono);letter-spacing:.1em">' +
          '<button class="btn btn-outline" id="roomJoin">참여</button></div>';
        $('#roomCreate', b).addEventListener('click', () => {
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
          let code = '';
          const rnd = new Uint32Array(6);
          crypto.getRandomValues(rnd);
          rnd.forEach((n) => { code += chars[n % chars.length]; });
          Room.join(code, true); draw(b); updateFoot();
        });
        const join = () => {
          const v = $('#roomInput', b).value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (v.length < 4) { toast('코드를 확인하세요', 'err'); return; }
          Room.join(v, false); draw(b); updateFoot();
        };
        $('#roomJoin', b).addEventListener('click', join);
        $('#roomInput', b).addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
      }
    };
    let bodyEl;
    const updateFoot = () => {
      const foot = $('#modalFoot');
      foot.innerHTML = '';
      if (Room.code) {
        const leave = document.createElement('button');
        leave.className = 'btn btn-ghost'; leave.textContent = '연결 끊기'; leave.style.color = 'var(--danger)';
        leave.addEventListener('click', () => { Room.leave(); draw(bodyEl); updateFoot(); });
        foot.appendChild(leave);
      }
      const close = document.createElement('button');
      close.className = 'btn btn-primary'; close.textContent = '닫기';
      close.addEventListener('click', closeModal);
      foot.appendChild(close);
    };
    openModal({ title: '기기 미러링', size: 'narrow', body: '', onOpen: (b) => { bodyEl = b; draw(b); updateFoot(); } });
  }

  /* ------------------------------------------------------------------ *
   * 17. 온보딩 / 도움말
   * ------------------------------------------------------------------ */
  function openOnboarding() {
    const steps = [
      { icon: 'send', title: 'EasyAPI에 오신 걸 환영해요', text: 'API를 처음 다뤄도 괜찮아요. 주소를 넣고 <b>보내기</b>만 누르면 서버의 응답을 바로 볼 수 있어요.',
        list: ['<b>메서드</b>(GET·POST…)를 고르고', '<b>주소</b>를 입력한 다음', '<b>보내기</b>를 누르면 끝!'] },
      { icon: 'import', title: 'cURL 붙여넣기 한 번이면 완성', text: '웹사이트가 보내는 요청을 그대로 복사해 올 수 있어요.',
        list: ['크롬에서 <code>F12</code> → Network 탭', '요청 우클릭 → Copy → <b>Copy as cURL</b>', '주소창에 <b>붙여넣기</b> → 파라미터·헤더·바디 자동 입력'] },
      { icon: 'devices', title: '휴대폰에서도 그대로', text: '같은 Wi-Fi라면 휴대폰으로 접속해 API를 검증할 수 있어요.',
        list: ['설정 → <b>휴대폰에서 접속</b>의 QR 찍기', '브라우저 메뉴 → <b>홈 화면에 추가</b>', '상단 <b>기기 미러링</b> 버튼으로 PC와 실시간 동기화'] }
    ];
    let i = 0;
    const draw = (b) => {
      const s = steps[i];
      b.innerHTML = '<div class="onb-step"><div class="big">' + icon(s.icon) + 'STEP 0' + (i + 1) + ' / 0' + steps.length + '</div><h3>' + s.title + '</h3><p>' + s.text + '</p>' +
        '<ol class="steps-list">' + s.list.map((x) => '<li>' + x + '</li>').join('') + '</ol>' +
        '<div class="onb-dots">' + steps.map((_, j) => '<i class="' + (j === i ? 'on' : '') + '"></i>').join('') + '</div></div>';
      const foot = $('#modalFoot');
      foot.innerHTML = '';
      const skip = document.createElement('button');
      skip.className = 'btn btn-ghost'; skip.textContent = i === 0 ? '건너뛰기' : '이전';
      skip.addEventListener('click', () => { if (i === 0) closeModal(); else { i--; draw(b); } });
      const next = document.createElement('button');
      next.className = 'btn btn-primary'; next.textContent = i === steps.length - 1 ? '시작하기' : '다음';
      next.addEventListener('click', () => { if (i === steps.length - 1) closeModal(); else { i++; draw(b); } });
      foot.appendChild(skip); foot.appendChild(next);
    };
    openModal({ title: '사용 가이드', size: 'narrow', body: '', onOpen: draw, onClose: () => { S.ui.onboarded = true; persist(); } });
  }

  /* ------------------------------------------------------------------ *
   * 18. 화면 전환 / 테마
   * ------------------------------------------------------------------ */
  function setView(v) {
    if (v === 'settings') { openSettings(); return; }
    document.body.classList.remove('view-request', 'view-response', 'view-library');
    document.body.classList.add('view-' + v);
    $$('[data-view-btn]').forEach((b) => b.classList.toggle('on', b.dataset.viewBtn === v));
    if (v === 'response') $('#respDot').hidden = true;
  }
  function applyTheme() {
    const t = S.settings.theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    const dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    $('meta[name="theme-color"]').setAttribute('content', dark ? '#0f0f0f' : '#ffffff');
  }
  function applyBeginner() { document.body.classList.toggle('no-beginner', !S.settings.beginner); }

  /* ------------------------------------------------------------------ *
   * 19. 초기화
   * ------------------------------------------------------------------ */
  function bindGlobal() {
    $('#btnSend').addEventListener('click', send);
    $('#btnImport').addEventListener('click', () => openImport());
    $('#btnSettings').addEventListener('click', () => openSettings());
    $('#btnEnv').addEventListener('click', () => openEnv());
    $('#btnHelp').addEventListener('click', openOnboarding);
    $('#btnMirrorRoom').addEventListener('click', openRoom);
    $('#btnMirrorRoom2').addEventListener('click', openRoom);
    $('#btnSave').addEventListener('click', saveRequest);
    $('#btnCode').addEventListener('click', openCode);
    $('#btnNew').addEventListener('click', () => { loadRequest(newRequest(), null); switchReqTab('params'); $('#url').focus(); });
    $('#envSelect').addEventListener('change', (e) => {
      if (e.target.value === '__manage') { renderEnvSelect(); openEnv(); return; }
      S.activeEnv = e.target.value || null;
      $('#envWrap').classList.toggle('active', !!S.activeEnv);
      persist(); renderMirrorTab();
      toast(S.activeEnv ? '환경: ' + S.envs.find((x) => x.id === S.activeEnv).name : '환경 변수 사용 안 함', '', 1500);
    });
    $$('[data-view-btn]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.viewBtn)));
    $$('[data-close]').forEach((el) => el.addEventListener('click', closeModal));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'Enter') { e.preventDefault(); send(); }
      if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); saveRequest(); }
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  }

  async function checkServer() {
    try {
      const res = await fetch('api/info', { cache: 'no-store' });
      if (!res.ok) throw new Error('no server');
      S.serverInfo = await res.json();
      S.serverOk = true;
    } catch (e) {
      S.serverOk = false;
      if (S.settings.transport === 'server') {
        setTimeout(() => toast('EasyAPI 서버 없이 실행 중 → 브라우저 직접 전송 모드 (CORS 허용 API만 가능)', '', 4500), 800);
      }
    }
  }

  async function init() {
    load();
    if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) $$('#kbdSend, #kbdSend2').forEach((k) => { k.textContent = 'Ctrl ↵'; });
    // URL 해시로 전달된 접속 키 (QR 공유용)
    const hashKey = /[#&]key=([^&]+)/.exec(location.hash);
    if (hashKey) { S.settings.accessKey = decodeURIComponent(hashKey[1]); history.replaceState(null, '', location.pathname + location.search); }
    applyTheme();
    applyBeginner();
    bindRequestEditor();
    bindResponse();
    bindLibrary();
    bindGlobal();
    renderMethodFilter();
    renderEnvSelect();
    renderSamples();
    $('#libSearch').value = S.ui.search;
    renderRequest();
    renderResponse();
    await checkServer();

    const params = new URLSearchParams(location.search);
    const roomParam = params.get('room');
    const curlParam = params.get('curl');
    if (roomParam && S.serverOk) {
      Room.join(roomParam, false);
      history.replaceState(null, '', location.pathname);
      toast('기기 미러링에 연결했어요 · ' + roomParam.toUpperCase(), 'ok');
      S.ui.onboarded = true;
    } else {
      let saved = null;
      try { saved = localStorage.getItem('easyapi.room'); } catch (e) { /* noop */ }
      if (saved && S.serverOk) Room.join(saved, false);
    }
    if (curlParam) { openImport(curlParam); history.replaceState(null, '', location.pathname); }
    else if (!S.ui.onboarded) setTimeout(openOnboarding, 400);

    if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* noop */ });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
