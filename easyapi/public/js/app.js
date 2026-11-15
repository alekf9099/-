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

  function toast(msg, type, ms, action) {
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    const txt = document.createElement('span');
    txt.textContent = msg;
    el.appendChild(txt);
    if (action) {
      const b = document.createElement('button');
      b.className = 'toast-act';
      b.textContent = action.label;
      b.addEventListener('click', () => { el.remove(); action.run(); });
      el.appendChild(b);
    }
    const box = $('#toasts');
    while (box.children.length >= 3) box.firstChild.remove();
    box.appendChild(el);
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
  const newRequest = () => EasyEngine.newRequest(uid());
  const normalizeRequest = (r) => EasyEngine.normalizeRequest(r);
  const normalizeCollection = (c) => EasyEngine.normalizeCollection(c);
  const defaultSettings = () => ({
    transport: 'server',
    proxy: { enabled: false, url: '', username: '', password: '', bypass: 'localhost, 127.0.0.1' },
    insecure: false,
    followRedirects: true,
    timeoutSec: 30,
    theme: 'auto',
    beginner: true,
    accessKey: '',
    cookieAuto: true,
    mirror: { enabled: false, baseUrl: '' }
  });

  function stripFiles(req) {
    const r = clone(req);
    (r.body.multipart || []).forEach((row) => { if (row.file) { row.fileName = row.file.name; row.file = null; } });
    if (r.body.binary) r.body.binary = { name: r.body.binary.name, type: r.body.binary.type, size: r.body.binary.size, data: null };
    return r;
  }

  /** 열린 요청 탭 하나 */
  function newTab(req, ref) {
    const r = normalizeRequest(req || newRequest());
    return { id: uid(), req: r, current: ref || null, savedSnapshot: ref ? JSON.stringify(stripFiles(r)) : null, response: null, mirrorResponse: null, responseReq: null, run: null };
  }

  const S = {
    tabs: [],
    activeTab: null,
    collections: [],
    history: [],
    envs: [],
    activeEnv: null,
    globals: [],
    cookies: [],
    console: [],
    settings: defaultSettings(),
    ui: { lib: 'collections', methodFilter: 'ALL', search: '', reqTab: 'params', respTab: 'body', viewMode: 'pretty', scriptKind: 'test', onboarded: false },
    serverOk: null,
    serverInfo: null,
    sending: null
  };
  function activeTabObj() { return S.tabs.find((t) => t.id === S.activeTab) || S.tabs[0]; }
  // S.req, S.response … 는 현재 활성 탭의 값을 가리킴
  ['req', 'current', 'savedSnapshot', 'response', 'mirrorResponse', 'responseReq', 'run'].forEach((k) => {
    Object.defineProperty(S, k, { get() { return activeTabObj()[k]; }, set(v) { activeTabObj()[k] = v; } });
  });

  function load() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { data = null; }
    if (!data) {
      S.collections = [qaCollection(), sampleCollection()];
      S.envs = [{ id: uid(), name: '예제 환경', vars: [{ key: 'baseUrl', value: 'https://jsonplaceholder.typicode.com', enabled: true }, { key: 'token', value: 'my-test-token', enabled: true }] }];
      S.tabs = [newTab()];
      S.activeTab = S.tabs[0].id;
      S.ui.qaSample = true;
      return;
    }
    if (Array.isArray(data.tabs) && data.tabs.length) {
      S.tabs = data.tabs.map((t) => Object.assign(newTab(), t, { req: normalizeRequest(t.req), response: null, mirrorResponse: null, responseReq: null, run: null }));
    } else {
      const t = newTab(data.req, data.current);
      t.savedSnapshot = data.savedSnapshot || t.savedSnapshot;
      S.tabs = [t];
    }
    S.activeTab = S.tabs.some((t) => t.id === data.activeTab) ? data.activeTab : S.tabs[0].id;
    S.collections = (Array.isArray(data.collections) ? data.collections : []).map(normalizeCollection);
    S.history = Array.isArray(data.history) ? data.history : [];
    S.envs = Array.isArray(data.envs) ? data.envs : [];
    S.activeEnv = data.activeEnv || null;
    S.globals = Array.isArray(data.globals) ? data.globals : [];
    S.cookies = Array.isArray(data.cookies) ? data.cookies : [];
    S.settings = Object.assign(defaultSettings(), data.settings || {});
    S.settings.proxy = Object.assign(defaultSettings().proxy, (data.settings || {}).proxy || {});
    S.settings.mirror = Object.assign(defaultSettings().mirror, (data.settings || {}).mirror || {});
    S.ui = Object.assign(S.ui, data.ui || {});
    S.collections.forEach((c) => { if (c.name === '📘 예제 모음') c.name = '예제 모음'; });
    if (!S.ui.qaSample) { S.collections.unshift(qaCollection()); S.ui.qaSample = true; }
  }

  function persistNow() {
    if (typeof renderStatusbar === 'function') renderStatusbar();
    const data = {
      tabs: S.tabs.map((t) => ({ id: t.id, req: stripFiles(t.req), current: t.current, savedSnapshot: t.savedSnapshot })), activeTab: S.activeTab,
      collections: S.collections, history: S.history, envs: S.envs, activeEnv: S.activeEnv, globals: S.globals, cookies: S.cookies,
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

  function qaCollection() {
    const host = /^https?:$/.test(location.protocol) ? location.origin : 'http://localhost:8080';
    const mk = (o) => normalizeRequest(Object.assign({ id: uid() }, o));
    const A = (target, op, value, path) => ({ target, op, value: value || '', path: path || '', enabled: true });
    return normalizeCollection({
      id: uid(), name: 'QA 연습 (내장 API)', open: true,
      description: 'EasyAPI 서버에 내장된 연습용 API예요. 실행기로 한 번에 돌려 보세요. (아이디 qa / 비밀번호 1234)',
      auth: { type: 'bearer', bearer: '{{token}}' },
      variables: [{ key: 'host', value: host, enabled: true }, { key: 'token', value: '', enabled: true }, { key: 'itemId', value: '', enabled: true }],
      requests: [
        mk({ name: '1. 로그인 → 토큰 저장', method: 'POST', url: '{{host}}/qa/login', auth: { type: 'none' },
          body: { mode: 'json', raw: '{\n  "username": "qa",\n  "password": "1234"\n}' },
          assertions: [A('status', 'eq', '200'), A('json', 'exists', '', '$.token')],
          extracts: [{ varName: 'token', from: 'json', path: '$.token', scope: 'collection', enabled: true }] }),
        mk({ name: '2. 내 정보 (토큰 인증)', method: 'GET', url: '{{host}}/qa/me',
          testScript: 'pm.test("로그인한 사용자 확인", function () {\n  pm.response.to.have.status(200);\n  pm.expect(pm.response.json().name).to.eql("QA 테스터");\n});' }),
        mk({ name: '3. 상품 등록', method: 'POST', url: '{{host}}/qa/items',
          body: { mode: 'json', raw: '{\n  "name": "테스트 상품 {{$randomInt}}",\n  "price": 3000,\n  "stock": 5\n}' },
          assertions: [A('status', 'eq', '201'), A('json', 'type', 'number', '$.id')],
          extracts: [{ varName: 'itemId', from: 'json', path: '$.id', scope: 'collection', enabled: true }] }),
        mk({ name: '4. 등록한 상품 조회', method: 'GET', url: '{{host}}/qa/items/:id', pathVars: [{ key: 'id', value: '{{itemId}}', enabled: true }],
          assertions: [A('status', 'eq', '200'), A('json', 'eq', '3000', '$.price')] }),
        mk({ name: '5. 상품 목록', method: 'GET', url: '{{host}}/qa/items', assertions: [A('json', 'gte', '1', '$.total'), A('time', 'lt', '1000')] }),
        mk({ name: '6. 없는 상품 → 404 확인', method: 'GET', url: '{{host}}/qa/items/99999', assertions: [A('status', 'eq', '404')] }),
        mk({ name: '7. 등록한 상품 삭제', method: 'DELETE', url: '{{host}}/qa/items/{{itemId}}', assertions: [A('status', 'eq', '204')] })
      ]
    });
  }

  function sampleCollection() {
    const mk = (name, method, url, extra) => normalizeRequest(Object.assign({ id: uid(), name, method, url }, extra || {}));
    const json = (raw) => ({ body: { mode: 'json', raw: raw } });
    return normalizeCollection({
      id: uid(), name: '예제 모음', open: false,
      requests: [
        mk('게시글 1개 조회', 'GET', '{{baseUrl}}/posts/1'),
        mk('댓글 목록 (쿼리)', 'GET', '{{baseUrl}}/comments?postId=1', { params: [{ key: 'postId', value: '1', enabled: true }] }),
        mk('게시글 만들기', 'POST', '{{baseUrl}}/posts', json('{\n  "title": "안녕하세요",\n  "body": "EasyAPI로 보낸 첫 글",\n  "userId": 1\n}')),
        mk('게시글 전체 수정', 'PUT', '{{baseUrl}}/posts/1', json('{\n  "id": 1,\n  "title": "수정된 제목",\n  "body": "내용",\n  "userId": 1\n}')),
        mk('게시글 일부 수정', 'PATCH', '{{baseUrl}}/posts/1', json('{\n  "title": "제목만 변경"\n}')),
        mk('게시글 삭제', 'DELETE', '{{baseUrl}}/posts/1'),
        mk('인증 헤더 확인 (Bearer)', 'GET', 'https://httpbin.org/bearer', { auth: { type: 'bearer', bearer: '{{token}}' } })
      ]
    });
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
    renderOpenTabs();
    persist();
    if (!opts.noBroadcast) Room.publishRequestDebounced();
  }

  function updateCounts() {
    const r = S.req;
    const n = (arr) => arr.filter((x) => x.enabled !== false && x.key).length;
    $('#cntParams').textContent = n(r.params) || '';
    $('#cntHeaders').textContent = n(r.headers) || '';
    $('#cntBody').textContent = r.body.mode === 'none' ? '' : ({ json: 'JSON', form: '폼', multipart: '파일', raw: '텍스트', graphql: 'GQL', binary: '파일' }[r.body.mode]);
    $('#cntAuth').textContent = ({ none: '', inherit: '', bearer: 'Bearer', basic: 'Basic', apikey: 'Key', oauth2: 'OAuth' }[r.auth.type]) || '';
    const na = r.assertions.filter((a) => a.enabled !== false).length;
    const nx = r.extracts.filter((x) => x.enabled !== false && x.varName).length;
    $('#cntAssert').textContent = na || nx ? (na + (nx ? '+' + nx : '')) : '';
    $('#cntScripts').textContent = [r.preScript, r.testScript].filter((x) => x && x.trim()).length || '';
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
    renderPathVars();
    kvHeaders.render();
    renderBody();
    renderAuth();
    renderAssertTab();
    renderScripts();
    renderMirrorTab();
    renderResolvedUrl();
    renderOpenTabs();
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
    $('#gqlQuery').value = (b.graphql && b.graphql.query) || '';
    $('#gqlVars').value = (b.graphql && b.graphql.variables) || '';
    $('#binaryName').textContent = b.binary ? b.binary.name + (b.binary.data ? ' (' + formatBytes(b.binary.size) + ')' : ' — 파일을 다시 선택하세요') : '파일을 선택하면 내용 그대로 전송해요';
    $('#binaryPick').classList.toggle('need', !!(b.binary && !b.binary.data));
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
    $('#oaGrant').value = a.oauthGrant || 'client_credentials';
    $('#oaClientAuth').value = a.clientAuth || 'body';
    $('#oaTokenUrl').value = a.tokenUrl || '';
    $('#oaClientId').value = a.clientId || '';
    $('#oaClientSecret').value = a.clientSecret || '';
    $('#oaUser').value = a.oauthUser || '';
    $('#oaPass').value = a.oauthPass || '';
    $('#oaScope').value = a.scope || '';
    $('#oaUserRow').hidden = a.oauthGrant !== 'password';
    renderOAuthStatus();
    const col = currentCollection();
    const pa = col ? col.auth : null;
    $('#inheritInfo').innerHTML = !col ? '보관함에 저장하면 폴더의 인증을 이어받아요. 지금은 인증 없이 보내요.'
      : (pa && pa.type !== 'none' ? '<b>' + esc(col.name) + '</b> 폴더의 인증(' + ({ bearer: 'Bearer 토큰', basic: 'Basic', apikey: 'API Key', oauth2: 'OAuth 2.0' }[pa.type]) + ')을 사용해요. '
        : '<b>' + esc(col.name) + '</b> 폴더에 인증이 없어 인증 없이 보내요. ') + '<a href="#" id="lnkColSettings">폴더 설정 열기</a>';
    const lnk = $('#lnkColSettings');
    if (lnk) lnk.addEventListener('click', (e) => { e.preventDefault(); openCollectionSettings(col.id); });
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
      syncPathVars();
      renderPathVars();
      renderResolvedUrl();
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
    [['#oaTokenUrl', 'tokenUrl'], ['#oaClientId', 'clientId'], ['#oaClientSecret', 'clientSecret'], ['#oaUser', 'oauthUser'], ['#oaPass', 'oauthPass'], ['#oaScope', 'scope']].forEach(([sel, key]) => {
      $(sel).addEventListener('input', (e) => { S.req.auth[key] = e.target.value; reqChanged(); renderOAuthStatus(); });
    });
    $('#oaGrant').addEventListener('change', (e) => { S.req.auth.oauthGrant = e.target.value; $('#oaUserRow').hidden = e.target.value !== 'password'; reqChanged(); });
    $('#oaClientAuth').addEventListener('change', (e) => { S.req.auth.clientAuth = e.target.value; reqChanged(); });
    $('#btnOaFetch').addEventListener('click', fetchTokenNow);

    // 미러
    $('#mirrorEnabled').addEventListener('change', (e) => {
      S.settings.mirror.enabled = e.target.checked;
      if (e.target.checked && !S.settings.mirror.baseUrl) { $('#mirrorBase').focus(); toast('비교할 서버 주소를 입력하세요'); }
      updateCounts(); persist();
    });
    $('#mirrorBase').addEventListener('input', (e) => { S.settings.mirror.baseUrl = e.target.value.trim(); renderMirrorTab(); persist(); });

    // GraphQL / 바이너리
    $('#gqlQuery').addEventListener('input', (e) => { S.req.body.graphql.query = e.target.value; reqChanged(); });
    $('#gqlVars').addEventListener('input', (e) => { S.req.body.graphql.variables = e.target.value; reqChanged(); });
    $('#binaryInput').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 25 * 1024 * 1024) { toast('25MB 이하 파일만 보낼 수 있어요', 'err'); return; }
      const reader = new FileReader();
      reader.onload = () => {
        S.req.body.binary = { name: f.name, type: f.type || 'application/octet-stream', size: f.size, data: String(reader.result).split(',')[1] || '' };
        renderBody(); reqChanged();
      };
      reader.readAsDataURL(f);
    });

    // 검증 · 변수 추출
    $('#btnAddAssert').addEventListener('click', () => { S.req.assertions.push({ target: 'status', op: 'eq', value: '200', path: '', enabled: true }); renderAssertTab(); reqChanged(); });
    $('#btnAddExtract').addEventListener('click', () => { S.req.extracts.push({ varName: '', from: 'json', path: '$.', scope: 'environment', enabled: true }); renderAssertTab(); reqChanged(); const v = $$('#extractList .x-var').pop(); if (v) v.focus(); });
    $$('[data-assert]').forEach((b) => b.addEventListener('click', () => {
      const [target, op, value, path] = b.dataset.assert.split('|');
      S.req.assertions.push({ target, op, value: value || '', path: path || '', enabled: true });
      renderAssertTab(); reqChanged();
    }));

    // 스크립트
    $$('#scriptKind button').forEach((b) => b.addEventListener('click', () => { S.ui.scriptKind = b.dataset.k; renderScripts(); persist(); }));
    const sc = $('#scriptCode');
    sc.addEventListener('input', () => { if (S.ui.scriptKind === 'pre') S.req.preScript = sc.value; else S.req.testScript = sc.value; reqChanged(); });
    sc.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { e.preventDefault(); const s0 = sc.selectionStart; sc.value = sc.value.slice(0, s0) + '  ' + sc.value.slice(sc.selectionEnd); sc.selectionStart = sc.selectionEnd = s0 + 2; sc.dispatchEvent(new Event('input')); }
    });
    $('#snippets').addEventListener('click', (e) => {
      const b = e.target.closest('[data-snip]');
      if (!b) return;
      insertSnippet(EasyEngine.SNIPPETS[S.ui.scriptKind === 'pre' ? 'pre' : 'test'][Number(b.dataset.snip)][1]);
    });
  }

  /* ------------------------------------------------------------------ *
   * 6. 요청 해석 (환경변수, 인증, 바디)
   * ------------------------------------------------------------------ */
  function currentCollection() {
    return S.current ? S.collections.find((c) => c.id === S.current.colId) || null : null;
  }
  function currentVars() {
    const env = S.envs.find((e) => e.id === S.activeEnv);
    const col = currentCollection();
    return {
      globals: EasyEngine.rowsToMap(S.globals), collection: EasyEngine.rowsToMap(col ? col.variables : []),
      environment: EasyEngine.rowsToMap(env ? env.vars : []), data: {}, local: {}
    };
  }
  function resolveRequest(req, lenient) {
    const col = currentCollection();
    const r = EasyEngine.resolveRequest(req, currentVars(), { lenient: lenient, parentAuth: col ? col.auth : null, cookieJar: S.settings.cookieAuto ? S.cookies : null });
    r.insecure = S.settings.insecure;
    return r;
  }
  function writeBackVars(vars, col) {
    const env = S.envs.find((e) => e.id === S.activeEnv);
    if (env) EasyEngine.mergeMapIntoRows(env.vars, vars.environment);
    S.globals = EasyEngine.mergeMapIntoRows(S.globals, vars.globals);
    if (col) EasyEngine.mergeMapIntoRows(col.variables, vars.collection);
    return !!env;
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
        body: EasyEngine.bodySpec(resolved),
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
      } else if (r.binary) {
        const bin = atob(r.binary.data || '');
        init.body = new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))], { type: r.binary.type });
      } else if (r.bodyText !== null && r.bodyText !== undefined && !['GET', 'HEAD'].includes(r.method)) init.body = r.bodyText;
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
    let pre;
    try { pre = resolveRequest(S.req); } catch (e) { toast(e.message, 'err', 3500); switchReqTab('body'); return; }
    try { new URL(pre.url); } catch (e) { toast('주소 형식이 올바르지 않아요', 'err'); return; }

    const tabObj = activeTabObj();
    const col = currentCollection();
    const ctrl = new AbortController();
    S.sending = ctrl;
    setLoading(true);
    const env = S.envs.find((e) => e.id === S.activeEnv);
    const ctx = { vars: currentVars(), cookieJar: S.cookies, cookieAuto: S.settings.cookieAuto, oauthCache: S.oauthCache, info: { iteration: 0, iterationCount: 1, environmentName: env ? env.name : '' } };
    const deps = { transport: (r) => transport(r, ctrl.signal), sandbox: (code, sctx) => Sandbox.run(code, sctx) };
    const mUrl = S.settings.mirror.enabled ? mirrorUrl(pre.url) : '';
    try {
      const results = await Promise.all([
        EasyEngine.runItem({ req: tabObj.req, parent: col }, ctx, deps),
        mUrl ? transport(Object.assign({}, pre, { url: mUrl }), ctrl.signal) : Promise.resolve(null)
      ]);
      const rec = results[0];
      const hadEnv = writeBackVars(ctx.vars, col);
      if (!hadEnv && Object.keys(ctx.vars.environment).length) rec.logs.push({ level: 'warn', text: '환경이 선택되지 않아 환경 변수 변경은 저장되지 않았어요 (상단에서 환경 선택)', event: 'info' });
      if (rec.missing === undefined && rec.resolved && rec.resolved.missing.length) toast('정의되지 않은 변수: ' + rec.resolved.missing.map((m) => '{{' + m + '}}').join(', '), 'err', 4000);
      tabObj.response = rec.skipped ? { ok: false, error: { code: 'SKIPPED', message: 'Pre-request 스크립트가 요청을 건너뛰었어요 (pm.execution.skipRequest)' }, timeMs: 0 }
        : (rec.response || { ok: false, error: rec.error || { code: 'UNKNOWN', message: '응답 없음' }, timeMs: 0 });
      tabObj.run = rec;
      tabObj.mirrorResponse = results[1];
      tabObj.responseReq = { method: rec.method, url: rec.url, mirrorUrl: mUrl };
      pushConsole(rec);
      addHistory(tabObj.response, rec);
      const counted = rec.tests.filter((t) => !t.skipped);
      const failed = counted.filter((t) => !t.passed).length;
      if (failed) S.ui.respTab = 'tests';
      else if (mUrl) S.ui.respTab = 'compare';
      else if (['compare', 'console', 'cookies'].indexOf(S.ui.respTab) >= 0) S.ui.respTab = 'body';
      if (tabObj.id === S.activeTab) { renderResponse(); renderAssertTab(); renderResolvedUrl(); renderOAuthStatus(); }
      if (counted.length) toast('테스트 ' + (counted.length - failed) + '/' + counted.length + ' 통과', failed ? 'err' : 'ok', 2200);
      haptic(failed || !tabObj.response.ok ? 'err' : 'ok');
      persist();
      Room.publish('response', { response: trimForSync(tabObj.response), mirror: trimForSync(tabObj.mirrorResponse), meta: tabObj.responseReq, run: { tests: rec.tests, logs: rec.logs, extracted: rec.extracted } });
      if (isMobile()) setView('response');
    } catch (e) {
      if (e.name === 'AbortError') toast('요청을 취소했어요');
      else {
        tabObj.response = { ok: false, error: { code: 'APP', message: '전송 실패: ' + e.message + ' (EasyAPI 서버가 실행 중인지 확인하세요)' }, timeMs: 0 };
        tabObj.run = null;
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
    $('#fabSend').classList.toggle('loading', on);
    $('#fabSend').disabled = on;
    startSkeletonTimer(on);
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

  function addHistory(res, rec) {
    const tests = rec ? rec.tests.filter((t) => !t.skipped) : [];
    S.history.unshift({
      id: uid(), ts: Date.now(), req: stripFiles(S.req),
      status: res && res.ok ? res.status : null, timeMs: res ? res.timeMs : null, ok: !!(res && res.ok),
      tests: tests.length ? { passed: tests.filter((t) => t.passed).length, total: tests.length } : null
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
    if (!r) { $('#respEmpty').hidden = false; $('#resp').hidden = true; $('#cntTests').textContent = ''; return; }
    $('#respEmpty').hidden = true;
    $('#resp').hidden = false;
    if (isMobile() && !document.body.classList.contains('view-response')) $('#respDot').hidden = false;

    const chip = $('#statusChip');
    const explain = $('#statusExplain');
    if (!r.ok) {
      chip.className = 'status-chip err';
      chip.innerHTML = '<i class="dot"></i>ERROR';
      chip.classList.remove('pop'); void chip.offsetWidth; chip.classList.add('pop');
      $('#timingPop').hidden = true;
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
      chip.classList.remove('pop'); void chip.offsetWidth; chip.classList.add('pop');
      renderTiming();
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
    renderTests();
    renderCookies();
    renderConsole();
    const hasMirror = !!S.mirrorResponse || !!(S.req.baseline && r.ok);
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
    if (mode === 'tree' && kind === 'json' && body.length < 2000000) {
      try {
        box.innerHTML = '<div class="tree" role="tree">' + treeHtml(JSON.parse(body), '$', null, 0) + '</div><p class="tree-hint beginner">값이나 키를 누르면 검증 추가 · 변수 저장 · 경로 복사를 할 수 있어요.</p>';
        return;
      } catch (e) { /* 아래 일반 보기로 */ }
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

  function bindResponse() {
    $$('#respTabs button').forEach((b) => b.addEventListener('click', () => switchRespTab(b.dataset.rtab)));
    $$('#viewMode button').forEach((b) => b.addEventListener('click', () => { S.ui.viewMode = b.dataset.view; renderRespBody(); persist(); }));
    $('#respFilter').addEventListener('input', debounce(renderRespBody, 200));
    $('#btnBaseline').addEventListener('click', saveBaseline);
    $('#respBody').addEventListener('click', (e) => {
      const el = e.target.closest('.tree [data-path]');
      if (!el) return;
      if (el.classList.contains('t-sum') && e.target.closest('summary') && !e.altKey) { /* 요약 클릭은 펼치기 유지, 길게 쓰려면 키 클릭 */ }
      if (el.closest('summary') && el.classList.contains('t-sum')) return;
      e.preventDefault();
      treeMenu(el.dataset.path);
    });
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
        const st = (h.tests ? '<span class="meta ' + (h.tests.passed === h.tests.total ? 'st-2' : 'st-5') + '">' + h.tests.passed + '/' + h.tests.total + '</span> ' : '') +
          (h.ok ? '<span class="meta st-' + String(h.status)[0] + '">' + h.status + '</span>' : '<span class="meta st-err">오류</span>');
        html += '<div class="item" role="button" tabindex="0" data-hist="' + h.id + '"><span class="mbadge m-' + h.req.method + '">' + h.req.method + '</span>' +
          '<span class="name">' + esc(shortUrl(h.req.url)) + '<span class="sub">' + esc(h.req.name) + ' · ' + timeAgo(h.ts) + '</span></span>' + st +
          '<button class="icon-btn more" data-histmore="' + h.id + '" aria-label="메뉴">' + icon('more') + '</button></div>';
      });
      html += '<div style="text-align:center;padding:10px"><button class="btn btn-ghost btn-sm" id="btnClearHist">기록 모두 지우기</button></div>';
      box.innerHTML = html;
      $('#btnClearHist').addEventListener('click', () => {
        const saved = S.history.slice();
        undoableRemove('기록 ' + saved.length + '개를', () => { S.history = []; }, () => { S.history = saved; });
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

  function loadRequest(req, ref, opts) {
    opts = opts || {};
    if (ref) {
      const ex = S.tabs.find((t) => t.current && t.current.reqId === ref.reqId);
      if (ex) { S.activeTab = ex.id; renderRequest(); renderResponse(); persist(); if (isMobile()) setView('request'); return; }
    }
    const cur = activeTabObj();
    const pristine = !cur.current && !cur.req.url && !cur.response && (cur.req.name || '새 요청') === '새 요청' && !tabDirty(cur);
    if (opts.replace || pristine) {
      const t = newTab(clone(req), ref);
      Object.assign(cur, t, { id: cur.id });
      renderRequest();
      renderResponse();
      persist();
    } else {
      openNewTab(req, ref);
    }
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
      { label: 'OpenAPI / Swagger 명세 가져오기', icon: 'import', run: openOpenAPI },
      { label: 'cURL 붙여넣기', icon: 'code', run: () => openImport() }
    ]));
  }

  function colMenu(colId) {
    const c = S.collections.find((x) => x.id === colId);
    if (!c) return;
    actionSheet(c.name, [
      { label: '실행기로 전체 실행', icon: 'play', run: () => openRunner(c.id) },
      { label: '폴더 설정 (인증 · 변수 · 스크립트)', icon: 'gear', run: () => openCollectionSettings(c.id) },
      { label: '이 폴더에 새 요청', icon: 'plus', run: () => { const r = newRequest(); c.requests.push(r); c.open = true; persist(); renderLibrary(); loadRequest(r, { colId: c.id, reqId: r.id }); } },
      { label: '이름 바꾸기', icon: 'edit', run: async () => { const n = await promptModal('폴더 이름 바꾸기', '이름', c.name); if (n) { c.name = n; persist(); renderLibrary(); } } },
      { label: 'EasyAPI 형식으로 내보내기', icon: 'download', run: () => downloadJson({ easyapi: 1, collections: [c] }, c.name + '.easyapi.json') },
      { label: 'Postman 형식으로 내보내기 (Newman 호환)', icon: 'download', run: () => downloadJson(EasyEngine.toPostman(c), c.name + '.postman_collection.json') },
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
      { label: '삭제', icon: 'trash', danger: true, run: () => {
        const idx = f.col.requests.indexOf(f.req);
        const wasCurrent = S.current && S.current.reqId === reqId;
        undoableRemove('"' + f.req.name + '"', () => {
          f.col.requests.splice(idx, 1);
          if (wasCurrent) { S.current = null; updateDirty(); }
        }, () => {
          f.col.requests.splice(idx, 0, f.req);
          if (wasCurrent) { S.current = { colId: colId, reqId: reqId }; updateDirty(); }
        });
      } }
    ]);
  }

  function histMenu(id) {
    const h = S.history.find((x) => x.id === id);
    if (!h) return;
    actionSheet(h.req.method + ' ' + shortUrl(h.req.url), [
      { label: '열기', icon: 'edit', run: () => loadRequest(h.req, null) },
      { label: '보관함에 저장', icon: 'save', run: () => { loadRequest(h.req, null); openSave(); } },
      { label: '기록에서 삭제', icon: 'trash', danger: true, run: () => { const i = S.history.indexOf(h); undoableRemove('기록을', () => { S.history.splice(i, 1); }, () => { S.history.splice(i, 0, h); }); } }
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
        if (S.req.auth.type === 'none' && col.auth && col.auth.type !== 'none' && !S.req.headers.some((h) => /^authorization$/i.test(h.key))) S.req.auth.type = 'inherit';
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
        '<div class="field"><span>포인트 색상</span><div class="swatches" id="sAccent">' + Object.keys(ACCENTS).map((k) => '<button class="swatch' + ((st.accent || 'lime') === k ? ' on' : '') + '" data-a="' + k + '" style="--sw:' + ACCENTS[k] + '" aria-label="' + ACCENT_KO[k] + '" title="' + ACCENT_KO[k] + '"></button>').join('') + '</div></div>' +
        '<div class="switch-row"><div><b>진동 피드백 (Android)</b><p class="muted">요청 성공·실패 시 짧게 진동해요</p></div><label class="switch"><input type="checkbox" id="sHaptics"' + (st.haptics !== false ? ' checked' : '') + '><i></i></label></div>' +
        '<div class="switch-row"><div><b>입문자 도움말 표시</b><p class="muted">각 탭의 설명과 상태 코드 해설을 보여줘요.</p></div><label class="switch"><input type="checkbox" id="sBeginner"' + (st.beginner ? ' checked' : '') + '><i></i></label></div></section>' +

        '<section class="set-section"><h3>쿠키</h3><div class="switch-row"><div><b>쿠키 자동 관리</b><p class="muted">로그인 세션 쿠키를 저장해 다음 요청에 자동 첨부해요. (저장된 쿠키 ' + S.cookies.length + '개)</p></div><label class="switch"><input type="checkbox" id="sCookieAuto"' + (st.cookieAuto ? ' checked' : '') + '><i></i></label></div>' +
        '<button class="btn btn-outline btn-sm" id="sCookies">쿠키 관리</button></section>' +
        '<section class="set-section" id="set-security"><h3>' + icon('shield') + '접속 키</h3>' +
        '<label class="field"><span>서버 접속 키 (ACCESS_KEY)</span><input type="password" id="sAccessKey" value="' + esc(st.accessKey) + '" autocomplete="off"><small>서버를 ACCESS_KEY 환경변수로 실행했다면 같은 값을 입력하세요.</small></label></section>' +

        '<section class="set-section"><h3>' + icon('folder') + '데이터</h3>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-outline btn-sm" id="sExport">전체 백업 내보내기</button><button class="btn btn-outline btn-sm" id="sImport">백업/Postman 가져오기</button><button class="btn btn-ghost btn-sm" id="sReset" style="color:var(--danger)">모두 초기화</button></div>' +
        '<p class="muted" style="font-size:12px;margin:10px 0 0">모든 데이터는 이 기기 브라우저에만 저장돼요. EasyAPI v1.3</p></section>',
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
        bindSwitch('#sCookieAuto', (v) => { st.cookieAuto = v; });
        $('#sCookies', b).addEventListener('click', () => { closeModal(); setTimeout(openCookies, 50); });
        const themeBtns = $$('#sTheme button', b);
        const markTheme = () => themeBtns.forEach((x) => x.classList.toggle('on', x.dataset.t === st.theme));
        themeBtns.forEach((x) => x.addEventListener('click', () => { st.theme = x.dataset.t; applyTheme(); markTheme(); persist(); }));
        $$('#sAccent .swatch', b).forEach((x) => x.addEventListener('click', () => { st.accent = x.dataset.a; applyAccent(); $$('#sAccent .swatch', b).forEach((y) => y.classList.toggle('on', y === x)); persist(); }));
        bindSwitch('#sHaptics', (v) => { st.haptics = v; });
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
    downloadJson({ easyapi: 1, exportedAt: new Date().toISOString(), collections: S.collections, envs: S.envs, globals: S.globals }, 'easyapi-backup-' + new Date().toISOString().slice(0, 10) + '.json');
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
        if (data.openapi || data.swagger) {
          const cols = EasyEngine.fromOpenAPI(data);
          cols.forEach((c) => { S.collections.push(c); added += c.requests.length; });
        } else if (data.info && /postman/i.test(String(data.info.schema || data.info._postman_id || '')) || (data.info && data.item)) {
          const cols = EasyEngine.fromPostman(data);
          cols.forEach((c) => { S.collections.push(c); added += c.requests.length; });
        } else if (data.values && data.name && Array.isArray(data.values)) {
          S.envs.push({ id: uid(), name: data.name, vars: data.values.map((v) => ({ key: v.key, value: String(v.value === undefined ? '' : v.value), enabled: v.enabled !== false })) });
          toast('환경 "' + data.name + '"을 가져왔어요', 'ok'); persist(); renderEnvSelect(); return;
        } else if (data.easyapi) {
          (data.collections || []).forEach((c0) => { const c = normalizeCollection(Object.assign({}, c0, { id: uid() })); c.requests.forEach((r) => { r.id = uid(); }); S.collections.push(c); added += c.requests.length; });
          if (Array.isArray(data.globals)) S.globals = EasyEngine.mergeMapIntoRows(S.globals, Object.assign(EasyEngine.rowsToMap(S.globals), EasyEngine.rowsToMap(data.globals)));
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
      body: '<p class="tip beginner">자주 쓰는 값(서버 주소, 토큰 등)을 저장해 두고 <code>{{변수명}}</code>으로 어디서나 사용해요. 예) <code>{{baseUrl}}/users</code><br>개발/운영 환경을 나눠 두고 상단 선택 상자로 전환하세요. 동적 변수: ' +
        Object.keys(EasyEngine.DYNAMIC).slice(0, 8).map((k) => '<code title="' + esc(EasyEngine.DYNAMIC[k].desc) + '">{{' + k + '}}</code>').join(' ') + ' …</p>' +
        '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap"><select id="envPick" style="flex:1;min-width:160px"></select>' +
        '<button class="btn btn-soft btn-sm" id="envAdd">' + icon('plus') + '새 환경</button></div>' +
        '<div id="envEditor"></div>',
      buttons: [{ label: '닫기', cls: 'btn-primary' }],
      onClose: () => { renderEnvSelect(); renderMirrorTab(); },
      onOpen: (b) => {
        const pick = $('#envPick', b);
        const editor = $('#envEditor', b);
        const draw = () => {
          pick.innerHTML = '<option value="__globals">전역 변수 (모든 환경 공통)</option>' + S.envs.map((e) => '<option value="' + e.id + '">' + esc(e.name) + (e.id === S.activeEnv ? ' (사용 중)' : '') + '</option>').join('');
          if (curId === '__globals') {
            pick.hidden = false;
            pick.value = '__globals';
            editor.innerHTML = '<p class="tip">어떤 환경을 선택하든 항상 쓸 수 있는 변수예요. 환경 변수에 같은 이름이 있으면 환경 값이 우선해요.</p><div class="kv" id="envKv"></div>';
            kvEditor($('#envKv', editor), () => S.globals, { keyPh: '변수명', valPh: '값', keyLabel: '변수명', valLabel: '값', onChange: () => persist() }).render();
            return;
          }
          const env = S.envs.find((e) => e.id === curId);
          if (!env) { editor.innerHTML = '<div class="empty-mini">환경이 없어요. "새 환경"을 눌러 만들어 보세요.</div>'; pick.value = '__globals'; return; }
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
      S.run = p.run ? Object.assign({ tests: [], logs: [], extracted: [] }, p.run) : null;
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
      renderStatusbar();
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
   * 16-A. 요청 탭 (여러 요청 동시 편집)
   * ------------------------------------------------------------------ */
  function tabDirty(t) { return !!(t.current && t.savedSnapshot && t.savedSnapshot !== JSON.stringify(stripFiles(t.req))); }
  function renderOpenTabs() {
    const box = $('#openTabs');
    if (!box) return;
    box.innerHTML = S.tabs.map((t) => '<div class="otab ' + (t.id === S.activeTab ? 'on' : '') + '" role="tab" tabindex="0" data-tab-id="' + t.id + '" title="' + esc(t.req.url || t.req.name) + '">' +
      '<span class="mbadge m-' + t.req.method + '">' + t.req.method + '</span><span class="otab-name">' + esc(t.req.name || '새 요청') + '</span>' +
      (tabDirty(t) ? '<i class="dirty"></i>' : '') +
      '<button class="otab-x" data-close-tab="' + t.id + '" aria-label="탭 닫기">' + icon('x') + '</button></div>').join('') +
      '<button class="otab-add" id="btnAddTab" aria-label="새 탭" title="새 탭">' + icon('plus') + '</button>';
    const on = $('.otab.on', box);
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function switchTab(id) {
    if (!S.tabs.some((t) => t.id === id) || id === S.activeTab) return;
    S.activeTab = id;
    renderRequest();
    renderResponse();
    persist();
    Room.publishRequestDebounced();
  }
  function openNewTab(req, ref) {
    if (S.tabs.length >= 15) {
      const victim = S.tabs.find((t) => t.id !== S.activeTab && !tabDirty(t));
      if (victim) S.tabs.splice(S.tabs.indexOf(victim), 1);
    }
    const t = newTab(req ? clone(req) : null, ref || null);
    S.tabs.push(t);
    S.activeTab = t.id;
    renderRequest();
    renderResponse();
    persist();
    return t;
  }
  async function closeTab(id) {
    const t = S.tabs.find((x) => x.id === id);
    if (!t) return;
    if (tabDirty(t) && !(await confirmModal('탭 닫기', '"' + (t.req.name || '새 요청') + '"에 저장하지 않은 변경사항이 있어요. 닫을까요?', '닫기'))) return;
    const i = S.tabs.indexOf(t);
    S.tabs.splice(i, 1);
    if (!S.tabs.length) S.tabs.push(newTab());
    if (S.activeTab === id) S.activeTab = (S.tabs[i] || S.tabs[i - 1] || S.tabs[0]).id;
    renderRequest();
    renderResponse();
    persist();
  }

  /* ------------------------------------------------------------------ *
   * 16-B. 경로 변수 · 해석된 주소 미리보기
   * ------------------------------------------------------------------ */
  function syncPathVars() {
    const names = EasyEngine.pathVarNames(S.req.url);
    const old = S.req.pathVars || [];
    S.req.pathVars = names.map((n) => old.find((p) => p.key === n) || { key: n, value: '', enabled: true });
  }
  function renderPathVars() {
    const pv = S.req.pathVars || [];
    $('#pathVarsWrap').hidden = !pv.length;
    const box = $('#kvPathVars');
    box.innerHTML = pv.map((p, i) => '<div class="kv-row pv"><span class="pv-key">:' + esc(p.key) + '</span><input type="text" class="v" data-pv="' + i + '" value="' + esc(p.value) + '" placeholder="값 또는 {{변수}}" autocapitalize="off" spellcheck="false"></div>').join('');
    $$('input[data-pv]', box).forEach((inp) => inp.addEventListener('input', () => {
      S.req.pathVars[Number(inp.dataset.pv)].value = inp.value;
      renderResolvedUrl();
      reqChanged();
    }));
  }
  function renderResolvedUrl() {
    const el = $('#resolvedUrl');
    const u = S.req.url || '';
    if (!/\{\{|\/:[A-Za-z_]/.test(u)) { el.hidden = true; return; }
    try {
      const r = resolveRequest(S.req, true);
      el.hidden = false;
      el.innerHTML = '<span class="arrow">→</span>' + esc(r.url) + (r.missing.length ? ' <em>정의 안 됨: ' + esc(r.missing.map((m) => '{{' + m + '}}').join(' ')) + '</em>' : '');
    } catch (e) { el.hidden = true; }
  }

  /* ------------------------------------------------------------------ *
   * 16-C. 노코드 검증 · 변수 추출 편집기
   * ------------------------------------------------------------------ */
  const optList = (map, cur) => Object.keys(map).map((k) => '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + esc(map[k]) + '</option>').join('');
  const EXTRACT_FROM = { json: 'JSON 경로', header: '헤더', regex: '정규식(본문)', status: '상태 코드' };
  const SCOPE_KO = { environment: '환경', collection: '컬렉션', globals: '전역' };

  function lastResultFor(name, source) {
    if (!S.run) return null;
    return S.run.tests.find((t) => t.name === name && t.source === source) || null;
  }

  function renderAssertTab() {
    const list = $('#assertList');
    list.innerHTML = '';
    if (!S.req.assertions.length) list.innerHTML = '<div class="empty-mini">아직 검증 조건이 없어요. 아래 <b>빠른 추가</b>나 "조건 추가"를 눌러 보세요.</div>';
    S.req.assertions.forEach((a) => list.appendChild(assertRow(a)));
    const ex = $('#extractList');
    ex.innerHTML = '';
    if (!S.req.extracts.length) ex.innerHTML = '<div class="empty-mini">저장할 변수가 없어요.</div>';
    S.req.extracts.forEach((x) => ex.appendChild(extractRow(x)));
  }

  function assertRow(a) {
    const d = document.createElement('div');
    const draw = () => {
      if (a.target === 'schema' && a.op !== 'schema') a.op = 'schema';
      if (a.target === 'baseline') a.op = 'eq';
      if (a.target !== 'schema' && a.op === 'schema') a.op = 'eq';
      const special = a.target === 'schema' || a.target === 'baseline';
      const needsPath = a.target === 'header' || a.target === 'json' || a.target === 'schema';
      const noVal = EasyEngine.NO_VALUE_OPS.indexOf(a.op) >= 0;
      const ops = {};
      Object.keys(EasyEngine.OPS).forEach((k) => { if (k !== 'schema') ops[k] = EasyEngine.OPS[k]; });
      const res = lastResultFor(EasyEngine.assertionName(a), 'assert');
      d.className = 'arow' + (a.enabled === false ? ' off' : '') + (res ? (res.passed ? ' pass' : ' fail') : '');
      d.innerHTML = '<input type="checkbox" class="chk" title="사용"' + (a.enabled !== false ? ' checked' : '') + '>' +
        '<select class="a-target" aria-label="검사 대상">' + optList(EasyEngine.TARGETS, a.target) + '</select>' +
        '<input type="text" class="a-path" aria-label="경로" placeholder="' + ({ json: '$.data.id', schema: '$ (전체) 또는 $.data' }[a.target] || 'Content-Type') + '" value="' + esc(a.path || '') + '"' + (needsPath ? '' : ' hidden') + ' autocapitalize="off" spellcheck="false">' +
        '<select class="a-op" aria-label="조건"' + (special ? ' hidden' : '') + '>' + optList(ops, a.op) + '</select>' +
        (a.target === 'schema' ? '<button class="btn btn-ghost btn-sm a-schema" title="스키마 편집">' + icon('edit') + esc(schemaSummary(a.value)) + '</button>'
          : '<input type="text" class="a-val" aria-label="기대값" placeholder="' + (a.target === 'baseline' ? '제외할 경로: $.updatedAt, $.items[*].id' : '기대값') + '" value="' + esc(a.value || '') + '"' + (noVal ? ' hidden' : '') + ' autocapitalize="off" spellcheck="false">') +
        '<span class="a-res" title="' + esc(res && res.error ? res.error : '') + '">' + (res ? (res.passed ? 'PASS' : 'FAIL') : '') + '</span>' +
        '<button class="icon-btn del" aria-label="조건 삭제">' + icon('trash') + '</button>';
      $('.chk', d).addEventListener('change', (e) => { a.enabled = e.target.checked; d.classList.toggle('off', !a.enabled); reqChanged(); });
      $('.a-target', d).addEventListener('change', (e) => { a.target = e.target.value; draw(); reqChanged(); });
      $('.a-op', d).addEventListener('change', (e) => { a.op = e.target.value; draw(); reqChanged(); });
      $('.a-path', d).addEventListener('input', (e) => { a.path = e.target.value; reqChanged(); });
      const av = $('.a-val', d);
      if (av) av.addEventListener('input', (e) => { a.value = e.target.value; reqChanged(); if (a.target === 'baseline' && S.response) renderCompare(); });
      const sb = $('.a-schema', d);
      if (sb) sb.addEventListener('click', () => openSchemaEditor(a));
      $('.del', d).addEventListener('click', () => { S.req.assertions.splice(S.req.assertions.indexOf(a), 1); renderAssertTab(); reqChanged(); });
    };
    draw();
    return d;
  }

  function extractRow(x) {
    const d = document.createElement('div');
    const rec = S.run && S.run.extracted ? S.run.extracted.find((e) => e.varName === x.varName) : null;
    d.className = 'arow xrow' + (x.enabled === false ? ' off' : '') + (rec ? (rec.ok ? ' pass' : ' fail') : '');
    d.innerHTML = '<input type="checkbox" class="chk" title="사용"' + (x.enabled !== false ? ' checked' : '') + '>' +
      '<input type="text" class="x-var" aria-label="변수명" placeholder="변수명 예) token" value="' + esc(x.varName || '') + '" autocapitalize="off" spellcheck="false">' +
      '<select class="x-from" aria-label="가져올 곳">' + optList(EXTRACT_FROM, x.from || 'json') + '</select>' +
      '<input type="text" class="x-path" aria-label="경로" placeholder="' + ({ json: '$.token', header: 'X-Request-Id', regex: 'id=(\\d+)', status: '' }[x.from || 'json']) + '" value="' + esc(x.path || '') + '"' + (x.from === 'status' ? ' hidden' : '') + ' autocapitalize="off" spellcheck="false">' +
      '<select class="x-scope" aria-label="저장 위치">' + optList(SCOPE_KO, x.scope || 'environment') + '</select>' +
      '<span class="a-res" title="' + esc(rec ? (rec.ok ? rec.value : rec.error) : '') + '">' + (rec ? (rec.ok ? 'SET' : 'FAIL') : '') + '</span>' +
      '<button class="icon-btn del" aria-label="삭제">' + icon('trash') + '</button>';
    $('.chk', d).addEventListener('change', (e) => { x.enabled = e.target.checked; d.classList.toggle('off', !x.enabled); reqChanged(); });
    $('.x-var', d).addEventListener('input', (e) => { x.varName = e.target.value.replace(/[{}\s]/g, ''); reqChanged(); });
    $('.x-from', d).addEventListener('change', (e) => { x.from = e.target.value; d.replaceWith(extractRow(x)); reqChanged(); });
    $('.x-path', d).addEventListener('input', (e) => { x.path = e.target.value; reqChanged(); });
    $('.x-scope', d).addEventListener('change', (e) => { x.scope = e.target.value; reqChanged(); });
    $('.del', d).addEventListener('click', () => { S.req.extracts.splice(S.req.extracts.indexOf(x), 1); renderAssertTab(); reqChanged(); });
    return d;
  }

  function generateAssertions() {
    const r = S.response;
    if (!r || !r.ok) { toast('성공한 응답이 있어야 만들 수 있어요', 'err'); return; }
    const add = [{ target: 'status', op: 'eq', value: String(r.status), path: '', enabled: true },
      { target: 'time', op: 'lt', value: String(Math.max(500, Math.ceil((r.timeMs * 3) / 100) * 100)), path: '', enabled: true }];
    try {
      const j = JSON.parse(r.body);
      if (Array.isArray(j)) {
        add.push({ target: 'json', op: 'type', path: '$', value: 'array', enabled: true });
        if (j.length) add.push({ target: 'json', op: 'gte', path: '$.length', value: '1', enabled: true });
      } else if (j && typeof j === 'object') {
        Object.keys(j).slice(0, 6).forEach((k) => {
          const v = j[k];
          const p = /^[A-Za-z_$][\w$]*$/.test(k) ? '$.' + k : "$['" + k + "']";
          if (v === null || typeof v === 'object' || (typeof v === 'string' && v.length > 40)) add.push({ target: 'json', op: 'type', path: p, value: EasyEngine.typeOf(v), enabled: true });
          else add.push({ target: 'json', op: 'eq', path: p, value: String(v), enabled: true });
        });
      }
      if (j && typeof j === 'object') add.push({ target: 'schema', op: 'schema', value: JSON.stringify(inferSchema(j)), path: '', enabled: true });
    } catch (e) { /* JSON 아님 */ }
    const have = new Set(S.req.assertions.map((a) => a.target + '|' + a.path + '|' + a.op));
    const fresh = add.filter((a) => !have.has(a.target + '|' + a.path + '|' + a.op));
    fresh.forEach((a) => S.req.assertions.push(a));
    renderAssertTab();
    reqChanged();
    switchReqTab('assert');
    if (isMobile()) setView('request');
    toast('검증 조건 ' + fresh.length + '개를 만들었어요. 매번 바뀌는 값(ID·시간)은 지우거나 "타입"으로 바꾸세요', 'ok', 4000);
  }

  /* ------------------------------------------------------------------ *
   * 16-D. 스크립트 편집기
   * ------------------------------------------------------------------ */
  function renderScripts() {
    const k = S.ui.scriptKind === 'pre' ? 'pre' : 'test';
    $$('#scriptKind button').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
    const code = $('#scriptCode');
    code.value = k === 'pre' ? S.req.preScript : S.req.testScript;
    code.placeholder = k === 'pre'
      ? '// 요청을 보내기 직전에 실행돼요\npm.environment.set("now", Date.now());'
      : '// 응답을 받은 뒤 실행돼요\npm.test("상태 코드 200", function () {\n  pm.response.to.have.status(200);\n});';
    $('#scriptTip').innerHTML = k === 'pre'
      ? '<b>Pre-request</b>: 요청 직전에 실행돼요. 변수 준비, 다른 요청으로 토큰 받기(<code>pm.sendRequest</code>)에 써요.'
      : '<b>Tests</b>: 응답을 받은 뒤 실행돼요. <code>pm.test</code>로 검증하고 <code>pm.environment.set</code>으로 값을 저장해요.';
    $('#snippets').innerHTML = EasyEngine.SNIPPETS[k].map((s, i) => '<button class="snip" data-snip="' + i + '">' + esc(s[0]) + '</button>').join('');
  }
  function insertSnippet(text) {
    const ta = $('#scriptCode');
    const pos = ta.selectionStart || ta.value.length;
    const before = ta.value.slice(0, pos);
    const sep = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
    ta.value = before + sep + text + '\n' + ta.value.slice(pos);
    ta.dispatchEvent(new Event('input'));
    ta.focus();
  }

  /* ------------------------------------------------------------------ *
   * 16-E. 스크립트 샌드박스 (Web Worker)
   * ------------------------------------------------------------------ */
  const Sandbox = {
    worker: null, seq: 0, waiting: new Map(),
    ensure() {
      if (this.worker) return this.worker;
      try { this.worker = new Worker('js/sandbox-worker.js'); } catch (e) { this.worker = null; return null; }
      this.worker.onmessage = (e) => {
        const m = e.data || {};
        if (m.type === 'done') {
          const w = this.waiting.get(m.id);
          if (w) { clearTimeout(w.timer); this.waiting.delete(m.id); w.resolve(m.result); }
        } else if (m.type === 'send') {
          const reply = (res) => { if (this.worker) this.worker.postMessage({ type: 'sendResult', id: m.id, res: res }); };
          transport(m.spec).then(reply, (err) => reply({ ok: false, error: { code: 'ERROR', message: err.message } }));
        }
      };
      this.worker.onerror = (e) => { e.preventDefault(); this.reset('스크립트 실행기 오류: ' + (e.message || '')); };
      return this.worker;
    },
    reset(msg) {
      const w = this.worker;
      this.worker = null;
      if (w) w.terminate();
      this.waiting.forEach((x) => { clearTimeout(x.timer); x.resolve({ tests: [], logs: [], vars: x.vars, error: msg }); });
      this.waiting.clear();
    },
    run(code, ctx) {
      const w = this.ensure();
      if (!w) return EasyEngine.executeScript(code, ctx, { sendRequest: (r) => transport(r) });
      return new Promise((resolve) => {
        const id = ++this.seq;
        const timer = setTimeout(() => this.reset('스크립트가 30초 안에 끝나지 않아 중단했어요 (무한 루프인지 확인하세요)'), 30000);
        this.waiting.set(id, { resolve: resolve, timer: timer, vars: ctx.vars });
        w.postMessage({ type: 'run', id: id, code: code, ctx: JSON.parse(JSON.stringify(ctx)) });
      });
    }
  };

  /* ------------------------------------------------------------------ *
   * 16-F. 테스트 결과 · 쿠키 · 콘솔 · 이슈 리포트
   * ------------------------------------------------------------------ */
  function renderTests() {
    const run = S.run;
    const box = $('#testsView');
    const tests = run ? run.tests : [];
    const counted = tests.filter((t) => !t.skipped);
    const passed = counted.filter((t) => t.passed).length;
    const cnt = $('#cntTests');
    cnt.textContent = counted.length ? passed + '/' + counted.length : '';
    cnt.className = counted.length ? (passed === counted.length ? 'ok' : 'bad') : '';
    if (!run) { box.innerHTML = ''; return; }
    let html = '';
    if (!counted.length) {
      html += '<div class="empty-mini">이 요청에는 테스트가 없어요. <b>검증</b> 탭에서 코드 없이 추가하거나 아래 버튼으로 자동 생성해 보세요.</div>';
    } else {
      const allOk = passed === counted.length;
      html += '<div class="test-summary ' + (allOk ? 'ok' : 'bad') + '">' + icon(allOk ? 'check' : 'x') + '<b>' + passed + '/' + counted.length + ' 통과</b>' + (allOk ? '' : '<span>' + (counted.length - passed) + '개 실패</span>') + '</div>';
      html += '<ul class="test-list">' + tests.map((t) => '<li class="' + (t.skipped ? 'skip' : (t.passed ? 'pass' : 'fail')) + '"><span class="tag-s">' + (t.skipped ? 'SKIP' : (t.passed ? 'PASS' : 'FAIL')) + '</span><div><div>' + esc(t.name) +
        ' <em>' + ({ assert: '검증', script: '스크립트', pre: 'Pre-request' }[t.source] || '') + '</em></div>' + (t.error && !t.passed ? '<div class="terr">' + esc(t.error) + '</div>' : '') + '</div></li>').join('') + '</ul>';
    }
    if (run.extracted && run.extracted.length) {
      html += '<div class="section-title">저장된 변수</div><ul class="test-list">' + run.extracted.map((x) => '<li class="' + (x.ok ? 'pass' : 'fail') + '"><span class="tag-s">' + (x.ok ? 'SET' : 'FAIL') + '</span><div><code>{{' + esc(x.varName) + '}}</code> ' +
        (x.ok ? '= ' + esc(String(x.value).slice(0, 160)) : '<span class="terr">' + esc(x.error) + '</span>') + ' <em>' + (SCOPE_KO[x.scope] || '') + '</em></div></li>').join('') + '</ul>';
    }
    html += '<div class="test-actions"><button class="btn btn-outline btn-sm" id="btnGenAsserts">' + icon('check') + '현재 응답으로 검증 자동 생성</button></div>';
    box.innerHTML = html;
    $('#btnGenAsserts').addEventListener('click', generateAssertions);
  }

  function renderCookies() {
    const r = S.response;
    const box = $('#cookiesView');
    const set = r && r.ok ? (r.headers || []).filter(([k]) => /^set-cookie$/i.test(k)) : [];
    $('#cntCookies').textContent = set.length || '';
    let host = '';
    try { host = new URL((S.responseReq && S.responseReq.url) || '').hostname; } catch (e) { host = ''; }
    const jar = S.cookies.filter((c) => host && (c.hostOnly ? host === c.domain : (host === c.domain || host.endsWith('.' + c.domain))));
    box.innerHTML = '<div class="section-title" style="margin-top:0">이 응답이 보낸 쿠키 (Set-Cookie)</div>' +
      (set.length ? '<table class="htable">' + set.map(([, v]) => { const c = v.split(';')[0]; const i = c.indexOf('='); return '<tr><td>' + esc(c.slice(0, i)) + '</td><td>' + esc(c.slice(i + 1)) + '<div class="muted" style="font-size:11px">' + esc(v.split(';').slice(1).join(';')) + '</div></td></tr>'; }).join('') + '</table>' : '<p class="muted" style="margin:0 0 12px">없음</p>') +
      '<div class="section-title">' + esc(host || '-') + ' 에 저장된 쿠키 · 자동 첨부 ' + (S.settings.cookieAuto ? 'ON' : 'OFF') + '</div>' +
      (jar.length ? '<table class="htable">' + jar.map((c) => '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.value) + '</td></tr>').join('') + '</table>' : '<p class="muted" style="margin:0 0 12px">없음</p>') +
      '<button class="btn btn-outline btn-sm" id="btnCookieMgr">쿠키 관리</button>';
    $('#btnCookieMgr').addEventListener('click', openCookies);
  }

  function pushConsole(rec) {
    S.console.unshift({
      ts: Date.now(), method: rec.method, url: rec.url, status: rec.response && rec.response.ok ? rec.response.status : null,
      timeMs: rec.response ? rec.response.timeMs : null, error: rec.error ? rec.error.message : null,
      failed: rec.tests.some((t) => !t.passed && !t.skipped), logs: rec.logs || [],
      headers: rec.resolved ? rec.resolved.headers : [], body: rec.resolved && rec.resolved.bodyText ? String(rec.resolved.bodyText).slice(0, 4000) : ''
    });
    S.console = S.console.slice(0, 200);
  }
  function renderConsole() {
    const box = $('#consoleView');
    $('#cntConsole').textContent = S.console.length || '';
    if (!S.console.length) { box.innerHTML = '<div class="empty-mini">요청을 보내면 실제로 전송된 헤더·바디와 스크립트의 console.log 가 여기에 기록돼요.</div>'; return; }
    box.innerHTML = '<div class="console-tools"><span class="muted">최근 ' + S.console.length + '건 (이 세션)</span><button class="btn btn-ghost btn-sm" id="btnClearConsole">지우기</button></div><div class="console">' +
      S.console.map((c, i) => '<details class="centry' + (c.error || c.failed ? ' bad' : '') + '"' + (i === 0 ? ' open' : '') + '><summary><span class="ct">' + new Date(c.ts).toLocaleTimeString() + '</span><span class="mbadge m-' + c.method + '">' + c.method + '</span><span class="cu">' + esc(c.url) + '</span><span class="cs">' + (c.status || 'ERR') + '</span><span class="ct">' + (c.timeMs !== null && c.timeMs !== undefined ? c.timeMs + 'ms' : '') + '</span></summary><div class="cbody">' +
        (c.error ? '<div class="clog error"><span>error</span>' + esc(c.error) + '</div>' : '') +
        c.logs.map((l) => '<div class="clog ' + esc(l.level) + '"><span>' + esc(l.event || l.level) + '</span>' + esc(l.text) + '</div>').join('') +
        '<div class="chead">요청 헤더</div><pre>' + esc((c.headers || []).map((h) => h[0] + ': ' + h[1]).join('\n') || '(없음)') + '</pre>' +
        (c.body ? '<div class="chead">요청 바디</div><pre>' + esc(c.body) + '</pre>' : '') + '</div></details>').join('') + '</div>';
    $('#btnClearConsole').addEventListener('click', () => { S.console = []; renderConsole(); });
  }

  function maskSecret(v) { v = String(v); return v.length <= 10 ? '***' : v.slice(0, 10) + '…(가림)'; }
  function bugReport() {
    const r = S.response;
    const meta = S.responseReq;
    if (!r || !meta) { toast('먼저 요청을 보내세요', 'err'); return; }
    let curl = '';
    try {
      const rr = resolveRequest(S.req, true);
      rr.headers = rr.headers.map(([k, v]) => [k, /^(authorization|cookie|x-api-key|api-key|x-auth-token)$/i.test(k) ? maskSecret(v) : v]);
      curl = CurlParser.toCurl(Object.assign(rr, { followRedirects: false }), 'bash');
    } catch (e) { curl = meta.method + ' ' + meta.url; }
    const env = S.envs.find((e) => e.id === S.activeEnv);
    const fails = (S.run ? S.run.tests : []).filter((t) => !t.passed && !t.skipped);
    let body = r.ok && r.bodyEncoding !== 'base64' ? String(r.body || '') : '';
    try { body = JSON.stringify(JSON.parse(body), null, 2); } catch (e) { /* 텍스트 */ }
    if (body.length > 3000) body = body.slice(0, 3000) + '\n… (이하 생략)';
    const L = [];
    L.push('## [API] ' + S.req.method + ' ' + (S.req.name || '') + ' — ' + (r.ok ? r.status + ' ' + (r.statusText || '') : '요청 실패'));
    L.push('');
    L.push('- **환경**: ' + (env ? env.name : '없음') + ' · **일시**: ' + new Date().toLocaleString() + ' · **응답 시간**: ' + (r.timeMs !== undefined ? r.timeMs + 'ms' : '-'));
    L.push('- **주소**: `' + meta.method + ' ' + meta.url + '`');
    L.push('', '### 재현 방법 (cURL, 민감 헤더 가림)', '```bash', curl, '```');
    if (fails.length) { L.push('', '### 실패한 검증 (' + fails.length + ')'); fails.forEach((t) => L.push('- ❌ ' + t.name + (t.error ? ' — ' + t.error : ''))); }
    L.push('', '### 실제 결과');
    if (!r.ok) L.push('오류: ' + (r.error ? r.error.code + ' ' + r.error.message : ''));
    else L.push('상태: `' + r.status + ' ' + (r.statusText || '') + '`', '', '```json', body || '(본문 없음)', '```');
    L.push('', '### 기대 결과', '- (기대한 동작을 적어 주세요)');
    copyText(L.join('\n'));
    toast('Jira·슬랙에 붙여넣기 좋은 형식으로 복사했어요', 'ok', 2500);
  }

  /* ------------------------------------------------------------------ *
   * 16-G. 쿠키 관리
   * ------------------------------------------------------------------ */
  function openCookies() {
    const draw = (b) => {
      const byDomain = {};
      S.cookies.forEach((c) => { (byDomain[c.domain] = byDomain[c.domain] || []).push(c); });
      const domains = Object.keys(byDomain).sort();
      b.innerHTML = '<div class="switch-row"><div><b>쿠키 자동 관리</b><p class="muted">응답의 Set-Cookie를 저장하고 같은 도메인 요청에 자동으로 붙여요. (로그인 세션 유지)</p></div><label class="switch"><input type="checkbox" id="ckAuto"' + (S.settings.cookieAuto ? ' checked' : '') + '><i></i></label></div>' +
        (domains.length ? domains.map((d) => '<div class="ck-domain"><div class="sub-head"><b>' + esc(d) + '</b><button class="btn btn-ghost btn-sm" data-ck-del-domain="' + esc(d) + '">도메인 쿠키 삭제</button></div><table class="htable">' +
          byDomain[d].map((c) => '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.value) + '<div class="muted" style="font-size:11px">' + esc(c.path) + (c.expires ? ' · 만료 ' + new Date(c.expires).toLocaleString() : ' · 세션') + (c.httpOnly ? ' · HttpOnly' : '') + (c.secure ? ' · Secure' : '') +
            '</div></td><td style="width:40px"><button class="icon-btn sm" data-ck-del="' + S.cookies.indexOf(c) + '" aria-label="삭제">' + icon('trash') + '</button></td></tr>').join('') + '</table></div>').join('')
          : '<div class="empty-mini">저장된 쿠키가 없어요. Set-Cookie 응답을 받으면 여기에 쌓여요.</div>') +
        '<div class="sub-head" style="margin-top:16px"><b>쿠키 직접 추가</b></div><div class="grid-3"><input type="text" id="ckDomain" placeholder="도메인 예) api.example.com"><input type="text" id="ckName" placeholder="이름"><input type="text" id="ckValue" placeholder="값"></div>' +
        '<div style="display:flex;gap:8px;margin-top:8px"><button class="btn btn-outline btn-sm" id="ckAdd">추가</button><span class="spacer"></span><button class="btn btn-ghost btn-sm" id="ckClear" style="color:var(--danger)">모두 삭제</button></div>';
      $('#ckAuto', b).addEventListener('change', (e) => { S.settings.cookieAuto = e.target.checked; persist(); });
      $$('[data-ck-del]', b).forEach((x) => x.addEventListener('click', () => { S.cookies.splice(Number(x.dataset.ckDel), 1); persist(); draw(b); }));
      $$('[data-ck-del-domain]', b).forEach((x) => x.addEventListener('click', () => { S.cookies = S.cookies.filter((c) => c.domain !== x.dataset.ckDelDomain); persist(); draw(b); }));
      $('#ckAdd', b).addEventListener('click', () => {
        const d = $('#ckDomain', b).value.trim().toLowerCase();
        const n = $('#ckName', b).value.trim();
        if (!d || !n) { toast('도메인과 이름을 입력하세요', 'err'); return; }
        S.cookies = S.cookies.filter((c) => !(c.domain === d && c.name === n));
        S.cookies.push({ name: n, value: $('#ckValue', b).value, domain: d, hostOnly: false, path: '/', expires: null, secure: false, httpOnly: false });
        persist(); draw(b);
      });
      $('#ckClear', b).addEventListener('click', () => { S.cookies.length = 0; persist(); draw(b); });
    };
    openModal({ title: '쿠키 관리', size: 'wide', body: '', buttons: [{ label: '닫기', cls: 'btn-primary' }], onOpen: draw, onClose: () => { if (S.response) renderCookies(); } });
  }

  /* ------------------------------------------------------------------ *
   * 16-H. 폴더(컬렉션) 설정: 인증 · 변수 · 스크립트 · 설명
   * ------------------------------------------------------------------ */
  function openCollectionSettings(colId) {
    const c = S.collections.find((x) => x.id === colId);
    if (!c) return;
    let tab = 'auth';
    const draw = (b) => {
      b.innerHTML = '<label class="field"><span>이름</span><input type="text" id="csName" value="' + esc(c.name) + '"></label>' +
        '<div class="seg seg-scroll" id="csTabs" style="margin-bottom:14px"><button data-t="auth">인증</button><button data-t="vars">변수</button><button data-t="pre">Pre-request</button><button data-t="test">Tests</button><button data-t="desc">설명</button></div><div id="csBody"></div>';
      $('#csName', b).addEventListener('input', (e) => { c.name = e.target.value || '이름 없음'; persist(); renderLibrary(); });
      const body = $('#csBody', b);
      const drawTab = () => {
        $$('#csTabs button', b).forEach((x) => x.classList.toggle('on', x.dataset.t === tab));
        if (tab === 'auth') {
          const a = c.auth;
          body.innerHTML = '<p class="tip">이 폴더의 요청 중 인증이 <b>"상위 폴더 인증 사용"</b>인 요청에 자동 적용돼요. (새 요청의 기본값)</p>' +
            '<label class="field"><span>인증 방식</span><select id="csAuth"><option value="none">없음</option><option value="bearer">Bearer 토큰</option><option value="basic">아이디 / 비밀번호 (Basic)</option><option value="apikey">API Key</option><option value="oauth2">OAuth 2.0</option></select></label>' +
            (a.type === 'oauth2' ? '<div class="grid-2"><label class="field"><span>방식</span><select data-k="oauthGrant"><option value="client_credentials"' + (a.oauthGrant !== 'password' ? ' selected' : '') + '>Client Credentials</option><option value="password"' + (a.oauthGrant === 'password' ? ' selected' : '') + '>Password</option></select></label>' +
              '<label class="field"><span>클라이언트 인증</span><select data-k="clientAuth"><option value="body">본문</option><option value="header"' + (a.clientAuth === 'header' ? ' selected' : '') + '>Basic 헤더</option></select></label></div>' +
              '<label class="field"><span>Token URL</span><input type="text" data-k="tokenUrl" value="' + esc(a.tokenUrl) + '"></label><div class="grid-2"><label class="field"><span>Client ID</span><input type="text" data-k="clientId" value="' + esc(a.clientId) + '"></label><label class="field"><span>Client Secret</span><input type="password" data-k="clientSecret" value="' + esc(a.clientSecret) + '"></label></div>' +
              '<div class="grid-2"><label class="field"><span>아이디 (Password 방식)</span><input type="text" data-k="oauthUser" value="' + esc(a.oauthUser) + '"></label><label class="field"><span>비밀번호</span><input type="password" data-k="oauthPass" value="' + esc(a.oauthPass) + '"></label></div>' +
              '<label class="field"><span>Scope</span><input type="text" data-k="scope" value="' + esc(a.scope) + '"></label>' : '') +
            (a.type === 'bearer' ? '<label class="field"><span>토큰</span><input type="text" data-k="bearer" value="' + esc(a.bearer) + '" placeholder="{{token}}"></label>' : '') +
            (a.type === 'basic' ? '<label class="field"><span>아이디</span><input type="text" data-k="username" value="' + esc(a.username) + '"></label><label class="field"><span>비밀번호</span><input type="password" data-k="password" value="' + esc(a.password) + '"></label>' : '') +
            (a.type === 'apikey' ? '<label class="field"><span>키 이름</span><input type="text" data-k="apiKeyName" value="' + esc(a.apiKeyName) + '"></label><label class="field"><span>키 값</span><input type="text" data-k="apiKeyValue" value="' + esc(a.apiKeyValue) + '"></label>' : '');
          $('#csAuth', body).value = a.type;
          $('#csAuth', body).addEventListener('change', (e) => { a.type = e.target.value; persist(); drawTab(); });
          $$('[data-k]', body).forEach((inp) => { const h = () => { a[inp.dataset.k] = inp.value; persist(); }; inp.addEventListener('input', h); inp.addEventListener('change', h); });
        } else if (tab === 'vars') {
          body.innerHTML = '<p class="tip">이 폴더 안에서만 쓰는 변수예요. 우선순위: 로컬 &gt; 데이터 &gt; <b>환경</b> &gt; <b>컬렉션</b> &gt; 전역</p><div class="kv" id="csVars"></div>';
          kvEditor($('#csVars', body), () => c.variables, { keyPh: '변수명', valPh: '값', keyLabel: '변수명', valLabel: '값', onChange: () => persist() }).render();
        } else if (tab === 'pre' || tab === 'test') {
          const key = tab === 'pre' ? 'preScript' : 'testScript';
          body.innerHTML = '<p class="tip">' + (tab === 'pre' ? '폴더 안 <b>모든 요청 전에</b> 먼저 실행돼요.' : '폴더 안 <b>모든 요청의 응답 후</b> 먼저 실행돼요. 공통 검증(예: 응답 시간)에 좋아요.') + '</p><textarea class="code-area" id="csScript" spellcheck="false"></textarea>';
          const ta = $('#csScript', body);
          ta.value = c[key] || '';
          ta.placeholder = tab === 'pre' ? 'pm.request.headers.upsert({ key: "X-Client", value: "easyapi" });' : 'pm.test("응답 2초 이내", () => pm.expect(pm.response.responseTime).to.be.below(2000));';
          ta.addEventListener('input', () => { c[key] = ta.value; persist(); });
        } else {
          body.innerHTML = '<textarea class="code-area small" id="csDesc" placeholder="이 폴더에 대한 설명, 테스트 계정 정보 등을 적어 두세요"></textarea>';
          const ta = $('#csDesc', body);
          ta.value = c.description || '';
          ta.style.fontFamily = 'var(--font)';
          ta.addEventListener('input', () => { c.description = ta.value; persist(); });
        }
      };
      $$('#csTabs button', b).forEach((x) => x.addEventListener('click', () => { tab = x.dataset.t; drawTab(); }));
      drawTab();
    };
    openModal({ title: '폴더 설정', size: 'wide', body: '', buttons: [{ label: '닫기', cls: 'btn-primary' }], onOpen: draw, onClose: () => { renderAuth(); renderResolvedUrl(); } });
  }

  /* ------------------------------------------------------------------ *
   * 16-I. 컬렉션 실행기 (Runner)
   * ------------------------------------------------------------------ */
  let RUN = null;
  function openRunner(colId, initialMode) {
    let mode = initialMode === 'perf' ? 'perf' : 'func';
    const cols = S.collections.filter((c) => c.requests.length);
    if (!cols.length) { toast('실행할 요청이 담긴 폴더가 없어요', 'err'); return; }
    let col = cols.find((c) => c.id === colId) || (S.current && cols.find((c) => c.id === S.current.colId)) || cols[0];
    let data = [];
    let dataName = '';
    let sel = new Set(col.requests.map((r) => r.id));
    let envId = S.activeEnv || '';
    let lastSummary = null;
    let bodyEl;

    const drawSetup = () => {
      const b = bodyEl;
      b.innerHTML =
        '<div class="seg seg-full" id="rMode" style="margin-bottom:12px"><button data-m="func">' + icon('play') + ' 기능 테스트</button><button data-m="perf">' + icon('gauge') + ' 성능 테스트</button></div>' +
        '<p class="tip beginner" data-mode="func">폴더의 요청을 위에서부터 차례로 보내고 검증·스크립트 결과를 모아 리포트를 만들어요. 앞 요청에서 저장한 변수(토큰 등)는 다음 요청에서 바로 쓰여요.</p>' +
        '<p class="tip" data-mode="perf">여러 가상 사용자가 동시에 요청을 반복해 <b>초당 처리량(RPS)·응답 시간 p95·오류율</b>을 측정해요. 서버에서 실행되며, 보안을 위해 <b>스크립트는 제외하고 노코드 검증만</b> 실행해요. (토큰은 미리 변수에 넣어 두거나 OAuth 2.0 사용)</p>' +
        '<div class="grid-2"><label class="field"><span>폴더</span><select id="rCol">' + cols.map((c) => '<option value="' + c.id + '"' + (c.id === col.id ? ' selected' : '') + '>' + esc(c.name) + ' (' + c.requests.length + ')</option>').join('') + '</select></label>' +
        '<label class="field"><span>환경</span><select id="rEnv"><option value="">환경 없음</option>' + S.envs.map((e) => '<option value="' + e.id + '"' + (e.id === envId ? ' selected' : '') + '>' + esc(e.name) + '</option>').join('') + '</select></label></div>' +
        '<div data-mode="func"><div class="grid-3"><label class="field"><span>반복 횟수</span><input type="number" id="rIter" min="1" max="1000" value="1"></label>' +
        '<label class="field"><span>요청 간 대기 (ms)</span><input type="number" id="rDelay" min="0" max="60000" value="0"></label>' +
        '<label class="field"><span>데이터 파일 (CSV/JSON)</span><label class="file-drop sm">' + icon('file') + '<span id="rDataName">' + (dataName ? esc(dataName) + ' · ' + data.length + '행' : '선택 안 함') + '</span><input type="file" id="rData" accept=".csv,.json,text/csv,application/json"></label></label></div>' +
        '<div class="grid-2"><div class="switch-row"><div><b>실패하면 중단</b><p class="muted">첫 실패에서 멈춰요</p></div><label class="switch"><input type="checkbox" id="rBail"><i></i></label></div>' +
        '<div class="switch-row"><div><b>바뀐 변수 저장</b><p class="muted">실행 중 저장된 토큰 등을 유지</p></div><label class="switch"><input type="checkbox" id="rPersist" checked><i></i></label></div></div></div>' +
        '<div data-mode="perf"><div class="grid-3"><label class="field"><span>가상 사용자 (VU)</span><input type="number" id="pVus" min="1" max="100" value="10"></label>' +
        '<label class="field"><span>실행 시간 (초)</span><input type="number" id="pDur" min="1" max="600" value="20"></label>' +
        '<label class="field"><span>램프업 (초)</span><input type="number" id="pRamp" min="0" max="300" value="0"><small>사용자를 서서히 늘리는 시간</small></label></div>' +
        '<p class="muted" style="font-size:12px;margin:-4px 0 12px">⚠ 운영 서버에 부하를 줄 수 있어요. 허가받은 대상에만 실행하세요.</p></div>' +
        '<div class="sub-head"><b>실행할 요청 <span class="muted" id="rCount"></span></b><span><button class="btn btn-ghost btn-sm" id="rAll">모두</button><button class="btn btn-ghost btn-sm" id="rNone">해제</button></span></div>' +
        '<div class="run-pick" id="rList"></div>';
      const list = $('#rList', b);
      const drawList = () => {
        list.innerHTML = col.requests.map((r, i) => {
          const n = (r.assertions || []).filter((a) => a.enabled !== false).length + (r.testScript && r.testScript.trim() ? 1 : 0);
          return '<label class="rpick"><input type="checkbox" data-rid="' + r.id + '"' + (sel.has(r.id) ? ' checked' : '') + '><span class="rnum">' + (i + 1) + '</span><span class="mbadge m-' + r.method + '">' + r.method + '</span><span class="rn">' + esc(r.name) + '</span>' +
            (n ? '<span class="rbadge">검증 ' + n + '</span>' : '<span class="rbadge none">검증 없음</span>') + '</label>';
        }).join('');
        $('#rCount', b).textContent = sel.size + '/' + col.requests.length;
        $$('input[data-rid]', list).forEach((x) => x.addEventListener('change', () => { if (x.checked) sel.add(x.dataset.rid); else sel.delete(x.dataset.rid); $('#rCount', b).textContent = sel.size + '/' + col.requests.length; }));
      };
      drawList();
      $('#rCol', b).addEventListener('change', (e) => { col = cols.find((c) => c.id === e.target.value); sel = new Set(col.requests.map((r) => r.id)); drawList(); });
      $('#rEnv', b).addEventListener('change', (e) => { envId = e.target.value; });
      $('#rAll', b).addEventListener('click', () => { sel = new Set(col.requests.map((r) => r.id)); drawList(); });
      $('#rNone', b).addEventListener('click', () => { sel = new Set(); drawList(); });
      $('#rData', b).addEventListener('change', (e) => {
        const f = e.target.files[0];
        if (!f) return;
        f.text().then((t) => {
          try {
            data = EasyEngine.parseDataFile(t, f.name);
            dataName = f.name;
            $('#rDataName', b).textContent = f.name + ' · ' + data.length + '행';
            if (data.length) $('#rIter', b).value = data.length;
            toast('데이터 ' + data.length + '행 · 열: ' + Object.keys(data[0] || {}).join(', ') + ' → {{열이름}}으로 사용', 'ok', 4000);
          } catch (err) { toast('데이터 파일을 읽을 수 없어요: ' + err.message, 'err'); }
        });
      });
      const applyMode = () => {
        $$('#rMode button', b).forEach((x) => x.classList.toggle('on', x.dataset.m === mode));
        $$('[data-mode]', b).forEach((el) => { el.hidden = el.dataset.mode !== mode; });
      };
      $$('#rMode button', b).forEach((x) => x.addEventListener('click', () => { mode = x.dataset.m; applyMode(); }));
      applyMode();
      setFoot([{ label: '닫기' }, { label: '실행 시작', cls: 'btn-primary', icon: 'play', onClick: () => {
        if (mode === 'perf') {
          startLoad({ vus: Math.max(1, Math.min(100, Number($('#pVus', b).value) || 1)), duration: Math.max(1, Math.min(600, Number($('#pDur', b).value) || 10)), rampUp: Math.max(0, Number($('#pRamp', b).value) || 0) });
          return false;
        }
        start({ iterations: Number($('#rIter', b).value) || 1, delay: Number($('#rDelay', b).value) || 0, bail: $('#rBail', b).checked, persistVars: $('#rPersist', b).checked });
        return false;
      } }]);
    };

    const setFoot = (btns) => {
      const foot = $('#modalFoot');
      foot.innerHTML = '';
      btns.forEach((x) => {
        const el = document.createElement('button');
        el.className = 'btn ' + (x.cls || 'btn-outline');
        el.innerHTML = (x.icon ? icon(x.icon) : '') + esc(x.label);
        if (x.id) el.id = x.id;
        el.addEventListener('click', () => { const r = x.onClick ? x.onClick() : undefined; if (r !== false) closeModal(); });
        foot.appendChild(el);
      });
    };

    async function start(o) {
      const items = col.requests.filter((r) => sel.has(r.id)).map((req) => ({ req: req, parent: col }));
      if (!items.length) { toast('실행할 요청을 선택하세요', 'err'); return; }
      const env = S.envs.find((e) => e.id === envId);
      const vars = { globals: EasyEngine.rowsToMap(S.globals), collection: EasyEngine.rowsToMap(col.variables), environment: EasyEngine.rowsToMap(env ? env.vars : []), data: {}, local: {} };
      const iterations = Math.max(1, o.iterations);
      const totalSteps = items.length * iterations;
      RUN = { stop: false };
      const b = bodyEl;
      b.innerHTML = '<div class="run-head"><div class="run-title"><b>' + esc(col.name) + '</b><span class="muted">' + (env ? esc(env.name) + ' · ' : '') + items.length + '개 요청 × ' + iterations + '회' + (dataName ? ' · ' + esc(dataName) : '') + '</span></div>' +
        '<div class="run-stats"><div><b id="rsDone">0</b><span>/ ' + totalSteps + ' 요청</span></div><div><b id="rsPass" class="ok">0</b><span>통과</span></div><div><b id="rsFail">0</b><span>실패</span></div><div><b id="rsAvg">-</b><span>평균 응답</span></div></div>' +
        '<div class="run-progress"><i id="rsBar"></i></div></div>' +
        '<div class="run-filter"><div class="seg seg-sm" id="rsFilter"><button data-f="all" class="on">전체</button><button data-f="fail">실패만</button></div></div>' +
        '<div class="run-results" id="rsList"></div>';
      setFoot([{ label: '중단', icon: 'stop', id: 'rsStop', onClick: () => { RUN.stop = true; toast('현재 요청이 끝나면 중단해요'); return false; } }]);
      const list = $('#rsList', b);
      let done = 0, pass = 0, fail = 0, time = 0;
      const recs = [];
      $$('#rsFilter button', b).forEach((x) => x.addEventListener('click', () => {
        $$('#rsFilter button', b).forEach((y) => y.classList.toggle('on', y === x));
        list.classList.toggle('only-fail', x.dataset.f === 'fail');
      }));
      const summary = await EasyEngine.runCollection(items, {
        iterations: iterations, data: data, delay: o.delay, bail: o.bail, vars: vars,
        cookieJar: S.cookies, cookieAuto: S.settings.cookieAuto, oauthCache: S.oauthCache, environmentName: env ? env.name : ''
      }, { transport: (r) => transport(r), sandbox: (code, ctx) => Sandbox.run(code, ctx) }, {
        shouldStop: () => RUN.stop,
        onResult: (rec) => {
          recs.push(rec);
          pushConsole(rec);
          done++;
          rec.tests.forEach((t) => { if (t.skipped) return; if (t.passed) pass++; else fail++; });
          if (rec.response && rec.response.timeMs) time += rec.response.timeMs;
          $('#rsDone', b).textContent = done;
          $('#rsPass', b).textContent = pass;
          $('#rsFail', b).textContent = fail;
          $('#rsFail', b).className = fail ? 'bad' : '';
          $('#rsAvg', b).textContent = Math.round(time / done) + 'ms';
          $('#rsBar', b).style.width = Math.min(100, (done / totalSteps) * 100) + '%';
          list.insertAdjacentHTML('beforeend', resultRow(rec, recs.length - 1, iterations));
        }
      });
      lastSummary = summary;
      if (o.persistVars) {
        if (env) EasyEngine.mergeMapIntoRows(env.vars, summary.vars.environment);
        EasyEngine.mergeMapIntoRows(col.variables, summary.vars.collection);
        S.globals = EasyEngine.mergeMapIntoRows(S.globals, summary.vars.globals);
      }
      persist();
      RUN = null;
      const st = summary.stats;
      $('#rsBar', b).style.width = '100%';
      $('#rsBar', b).className = st.failed || st.requestErrors ? 'bad' : 'ok';
      b.querySelector('.run-head').insertAdjacentHTML('afterbegin', '<div class="run-verdict ' + (st.failed || st.requestErrors ? 'bad' : 'ok') + '">' + icon(st.failed || st.requestErrors ? 'x' : 'check') +
        (summary.stopped ? '중단됨 · ' : '') + (st.failed || st.requestErrors ? '실패 ' + (st.failedRequests) + '건이 있어요' : '모든 검증을 통과했어요') + '<span class="muted">' + ((summary.finishedAt - summary.startedAt) / 1000).toFixed(1) + '초</span></div>');
      list.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-open-rec]');
        if (!btn) return;
        e.preventDefault();
        const rec = recs[Number(btn.dataset.openRec)];
        const req = col.requests.find((r) => r.id === rec.id);
        if (!req) return;
        closeModal();
        loadRequest(req, { colId: col.id, reqId: req.id });
        const t = activeTabObj();
        t.response = rec.response || { ok: false, error: rec.error, timeMs: 0 };
        t.run = rec;
        t.responseReq = { method: rec.method, url: rec.url };
        S.ui.respTab = rec.tests.some((x) => !x.passed) ? 'tests' : 'body';
        renderResponse();
        renderAssertTab();
        if (isMobile()) setView('response');
      });
      const title = 'EasyAPI · ' + col.name;
      const fname = col.name.replace(/[\\/:*?"<>|\s]+/g, '_') + '-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '');
      setFoot([
        { label: 'HTML 리포트', icon: 'download', onClick: () => { downloadText(EasyEngine.toHtmlReport(lastSummary, title), fname + '.html', 'text/html'); return false; } },
        { label: 'JUnit XML', icon: 'download', onClick: () => { downloadText(EasyEngine.toJUnit(lastSummary, title), fname + '.xml', 'application/xml'); return false; } },
        { label: '결과 요약 복사', icon: 'copy', onClick: () => { copyText(EasyEngine.toMarkdown(lastSummary, title, false)); return false; } },
        { label: '다시 설정', onClick: () => { drawSetup(); return false; } },
        { label: '다시 실행', cls: 'btn-primary', icon: 'play', onClick: () => { start(o); return false; } }
      ]);
      renderLibrary();
      if (S.response) renderResponse();
    }

    /* ---- 성능 테스트 ---- */
    let loadES = null;
    async function startLoad(o) {
      if (S.serverOk === false) { toast('성능 테스트는 EasyAPI 서버 실행 시에만 사용할 수 있어요', 'err'); return; }
      const reqs = col.requests.filter((r) => sel.has(r.id));
      if (!reqs.length) { toast('실행할 요청을 선택하세요', 'err'); return; }
      const env = S.envs.find((e) => e.id === envId);
      const vars = { globals: EasyEngine.rowsToMap(S.globals), collection: EasyEngine.rowsToMap(col.variables), environment: EasyEngine.rowsToMap(env ? env.vars : []), data: {}, local: {} };
      const headers = { 'Content-Type': 'application/json' };
      if (S.settings.accessKey) headers['X-Access-Key'] = S.settings.accessKey;
      let start;
      try {
        start = await (await fetch('api/load/start', { method: 'POST', headers: headers, body: JSON.stringify({
          items: reqs.map((r) => ({ req: stripFiles(r), parent: { name: col.name, auth: col.auth } })), vars: vars, oauthCache: S.oauthCache,
          opts: { vus: o.vus, duration: o.duration, rampUp: o.rampUp },
          settings: { proxy: S.settings.proxy, insecure: S.settings.insecure, followRedirects: S.settings.followRedirects, timeoutMs: (Number(S.settings.timeoutSec) || 30) * 1000 }
        }) })).json();
      } catch (e) { toast('성능 테스트를 시작하지 못했어요: ' + e.message, 'err'); return; }
      if (!start.ok) { toast(start.error ? start.error.message : '시작 실패', 'err'); return; }
      const b = bodyEl;
      b.innerHTML = '<div class="run-head"><div class="run-title"><b>성능 테스트 · ' + esc(col.name) + '</b><span class="muted">가상 사용자 ' + o.vus + '명 · ' + o.duration + '초' + (o.rampUp ? ' · 램프업 ' + o.rampUp + '초' : '') + ' · 요청 ' + reqs.length + '개 반복</span></div>' +
        '<div class="run-stats"><div><b id="lsCount">0</b><span>요청</span></div><div><b id="lsRps">0</b><span>req/s</span></div><div><b id="lsP95">-</b><span>p95 응답</span></div><div><b id="lsErr">0%</b><span>오류율</span></div></div>' +
        '<div class="run-progress"><i id="lsBar"></i></div></div><div id="lsChart" class="perf-chart"></div><div id="lsTable"></div>';
      setFoot([{ label: '중단', icon: 'stop', onClick: () => { fetch('api/load/' + start.id + '/stop', { method: 'POST', headers: headers }); return false; } }]);
      let last = null;
      const render = (s) => {
        last = s;
        const t = s.total;
        $('#lsCount', b).textContent = t.count;
        $('#lsRps', b).textContent = s.rps;
        $('#lsP95', b).textContent = t.p95 + 'ms';
        const er = ((t.errors + t.failedChecks) / Math.max(1, t.count)) * 100;
        $('#lsErr', b).textContent = er.toFixed(1) + '%';
        $('#lsErr', b).className = er > 0 ? 'bad' : 'ok';
        $('#lsBar', b).style.width = Math.min(100, (s.elapsed / s.duration) * 100) + '%';
        $('#lsChart', b).innerHTML = perfChart(s.timeline);
        $('#lsTable', b).innerHTML = '<table class="perf-table"><thead><tr><th>요청</th><th>건수</th><th>평균</th><th>p50</th><th>p95</th><th>p99</th><th>최대</th><th>오류</th><th>검증 실패</th></tr></thead><tbody>' +
          s.byRequest.map((r) => '<tr><td><span class="mbadge m-' + r.method + '">' + r.method + '</span>' + esc(r.name) + '</td><td>' + r.count + '</td><td>' + r.avg + '</td><td>' + r.p50 + '</td><td><b>' + r.p95 + '</b></td><td>' + r.p99 + '</td><td>' + r.max + '</td><td class="' + (r.errors ? 'bad' : '') + '">' + r.errors + '</td><td class="' + (r.failedChecks ? 'bad' : '') + '">' + r.failedChecks + '</td></tr>').join('') +
          '</tbody></table><p class="muted" style="font-size:12px">단위: ms · 상태 코드 ' + Object.keys(s.statuses).map((k) => esc(k) + '×' + s.statuses[k]).join(', ') + '</p>';
      };
      const key = S.settings.accessKey ? '?key=' + encodeURIComponent(S.settings.accessKey) : '';
      loadES = new EventSource('api/load/' + start.id + '/events' + key);
      loadES.addEventListener('tick', (e) => render(JSON.parse(e.data)));
      loadES.addEventListener('fail', (e) => { toast('성능 테스트 실패: ' + JSON.parse(e.data).message, 'err'); loadES.close(); });
      loadES.addEventListener('done', (e) => {
        render(JSON.parse(e.data));
        loadES.close();
        loadES = null;
        $('#lsBar', b).style.width = '100%';
        $('#lsBar', b).className = last.total.errors || last.total.failedChecks ? 'bad' : 'ok';
        b.querySelector('.run-head').insertAdjacentHTML('afterbegin', '<div class="run-verdict ' + (last.total.errors ? 'bad' : 'ok') + '">' + icon(last.total.errors ? 'x' : 'check') + (last.stopped ? '중단됨 · ' : '완료 · ') + last.rps + ' req/s · p95 ' + last.total.p95 + 'ms<span class="muted">' + last.elapsed.toFixed(1) + '초</span></div>');
        const title = '성능 테스트 · ' + col.name;
        setFoot([
          { label: '결과 요약 복사', icon: 'copy', onClick: () => { copyText(EasyEngine.loadToMarkdown(last, title)); return false; } },
          { label: 'JSON 저장', icon: 'download', onClick: () => { downloadText(JSON.stringify(last, null, 2), 'load-' + col.name.replace(/[\\/:*?"<>|\s]+/g, '_') + '.json', 'application/json'); return false; } },
          { label: '다시 설정', onClick: () => { drawSetup(); return false; } },
          { label: '다시 실행', cls: 'btn-primary', icon: 'play', onClick: () => { startLoad(o); return false; } }
        ]);
      });
    }
    function perfChart(tl) {
      if (!tl || !tl.length) return '<div class="perf-empty">데이터 수집 중…</div>';
      const W = 640, H = 150, P = 26;
      const maxC = Math.max(1, ...tl.map((x) => x.count));
      const maxMs = Math.max(1, ...tl.map((x) => x.avg));
      const bw = (W - P * 2) / tl.length;
      const bars = tl.map((x, i) => {
        const h = (x.count / maxC) * (H - P * 2);
        const eh = x.count ? (x.errors / x.count) * h : 0;
        return '<rect x="' + (P + i * bw + 1).toFixed(1) + '" y="' + (H - P - h).toFixed(1) + '" width="' + Math.max(1, bw - 2).toFixed(1) + '" height="' + h.toFixed(1) + '" class="pc-bar"><title>' + x.sec + '초: ' + x.count + '건, 평균 ' + x.avg + 'ms, 실패 ' + x.errors + '</title></rect>' +
          (eh ? '<rect x="' + (P + i * bw + 1).toFixed(1) + '" y="' + (H - P - eh).toFixed(1) + '" width="' + Math.max(1, bw - 2).toFixed(1) + '" height="' + eh.toFixed(1) + '" class="pc-err"/>' : '');
      }).join('');
      const pts = tl.map((x, i) => (P + i * bw + bw / 2).toFixed(1) + ',' + (H - P - (x.avg / maxMs) * (H - P * 2)).toFixed(1)).join(' ');
      return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="pc" role="img" aria-label="초당 요청 수와 평균 응답 시간">' +
        '<line x1="' + P + '" y1="' + (H - P) + '" x2="' + (W - P) + '" y2="' + (H - P) + '" class="pc-axis"/>' + bars +
        '<polyline points="' + pts + '" class="pc-line"/>' +
        '<text x="' + P + '" y="14" class="pc-t">초당 요청 (최대 ' + maxC + ')</text><text x="' + (W - P) + '" y="14" class="pc-t pc-r">평균 응답 (최대 ' + maxMs + 'ms)</text>' +
        '<text x="' + P + '" y="' + (H - 8) + '" class="pc-t">0초</text><text x="' + (W - P) + '" y="' + (H - 8) + '" class="pc-t pc-r">' + tl.length + '초</text></svg>' +
        '<div class="pc-legend"><span><i class="lg-bar"></i>초당 요청 수</span><span><i class="lg-err"></i>실패</span><span><i class="lg-line"></i>평균 응답 시간</span></div>';
    }

    function resultRow(rec, idx, iterations) {
      const tests = rec.tests.filter((t) => !t.skipped);
      const passed = tests.filter((t) => t.passed).length;
      const failed = !!rec.error || passed < tests.length;
      const r = rec.response;
      const status = rec.skipped ? 'SKIP' : (r && r.ok ? r.status : 'ERR');
      return '<details class="rrow ' + (failed ? 'fail' : 'pass') + '"' + (failed ? ' open' : '') + '><summary><b class="dot"></b>' +
        (iterations > 1 ? '<span class="it">#' + (rec.iteration + 1) + '</span>' : '') +
        '<span class="mbadge m-' + rec.method + '">' + rec.method + '</span><span class="rn">' + esc(rec.name) + '</span><span class="ru">' + esc(rec.url) + '</span>' +
        '<span class="rs ' + (r && r.ok ? 'st-' + Math.floor(r.status / 100) : 'st-err') + '">' + status + '</span><span class="rt">' + (r && r.timeMs !== undefined ? r.timeMs + 'ms' : '') + '</span>' +
        '<span class="rc ' + (failed ? 'bad' : 'ok') + '">' + (tests.length ? passed + '/' + tests.length : '-') + '</span></summary><div class="rdetail">' +
        (rec.error ? '<div class="terr">' + esc(rec.error.message) + '</div>' : '') +
        (tests.length ? '<ul class="test-list">' + tests.map((t) => '<li class="' + (t.passed ? 'pass' : 'fail') + '"><span class="tag-s">' + (t.passed ? 'PASS' : 'FAIL') + '</span><div>' + esc(t.name) + (t.error && !t.passed ? '<div class="terr">' + esc(t.error) + '</div>' : '') + '</div></li>').join('') + '</ul>' : '<p class="muted" style="margin:4px 0">검증 없음</p>') +
        (rec.extracted.length ? '<p class="muted" style="margin:6px 0 0;font-size:12px">' + rec.extracted.map((x) => '{{' + esc(x.varName) + '}} ' + (x.ok ? '= ' + esc(String(x.value).slice(0, 40)) : '실패')).join(' · ') + '</p>' : '') +
        '<button class="btn btn-ghost btn-sm" data-open-rec="' + idx + '">요청·응답 열어서 확인 →</button></div></details>';
    }

    openModal({ title: '컬렉션 실행기', size: 'wide', body: '', buttons: [], onOpen: (b) => { bodyEl = b; drawSetup(); }, onClose: () => { if (RUN) RUN.stop = true; if (loadES) loadES.close(); } });
  }

  function downloadText(text, name, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: (type || 'text/plain') + ';charset=utf-8' }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(name + ' 저장', 'ok', 1500);
  }

  /* ------------------------------------------------------------------ *
   * 16-J. 비교 (요청 미러링 · 기준 응답 회귀)
   * ------------------------------------------------------------------ */
  function compareSection(A, B, labelA, labelB, urlA, urlB, ignore) {
    let diffs = [];
    if (!A.ok || !B.ok) {
      if (A.ok !== B.ok || (A.error && B.error && A.error.code !== B.error.code)) diffs.push({ path: '연결 결과', a: A.ok ? A.status : A.error.message, b: B.ok ? B.status : B.error.message });
    } else diffs = EasyEngine.compareResponses(A, B, ignore);
    const headerDiffs = [];
    if (A.ok && B.ok && A.headers && B.headers) {
      const ha = {}, hb = {};
      A.headers.forEach(([k, v]) => { ha[k.toLowerCase()] = v; });
      B.headers.forEach(([k, v]) => { hb[k.toLowerCase()] = v; });
      new Set(Object.keys(ha).concat(Object.keys(hb))).forEach((k) => { if (!IGNORE_HEADERS.has(k) && ha[k] !== hb[k]) headerDiffs.push({ path: k, a: ha[k], b: hb[k] }); });
    }
    const col = (label, r, url) => '<div class="cmp-col"><h4>' + label + '</h4>' +
      (r.ok ? '<span class="status-chip s' + Math.floor(r.status / 100) + '"><i class="dot"></i>' + r.status + '</span> <span class="stat"><b>' + formatMs(r.timeMs) + '</b></span> <span class="stat"><b>' + formatBytes(r.size) + '</b></span>'
        : '<span class="status-chip err"><i class="dot"></i>ERROR</span> <span class="muted">' + esc(r.error.message) + '</span>') +
      '<div class="u">' + esc(url || '') + '</div></div>';
    const list = (arr) => '<div class="diff-list">' + arr.map((d) => '<div class="diff-item"><div class="p">' + esc(d.path) + '</div><div class="a">A: ' + esc(show(d.a)) + '</div><div class="b">B: ' + esc(show(d.b)) + '</div></div>').join('') + '</div>';
    return {
      count: diffs.length,
      html: '<div class="cmp-verdict ' + (diffs.length ? 'diff' : 'same') + '">' + icon(diffs.length ? 'help' : 'check') + (diffs.length ? diffs.length + '군데 차이가 있어요' + (diffs.length >= 300 ? ' (300개까지 표시)' : '') : '응답이 같아요') + '</div>' +
        '<div class="cmp-grid">' + col(labelA, A, urlA) + col(labelB, B, urlB) + '</div>' +
        (diffs.length ? '<div class="section-title">본문 / 상태 차이</div>' + list(diffs) : '') +
        (headerDiffs.length ? '<div class="section-title">헤더 차이 (날짜·요청ID 등 매번 바뀌는 값 제외)</div>' + list(headerDiffs) : '')
    };
  }
  function renderCompare() {
    const meta = S.responseReq || {};
    const parts = [];
    let total = 0;
    if (S.mirrorResponse && S.response) {
      const r = compareSection(S.response, S.mirrorResponse, 'A · 기본 서버', 'B · 비교 서버', meta.url, meta.mirrorUrl, '');
      parts.push('<div class="cmp-block"><div class="sub-head"><b>요청 미러링</b></div>' + r.html + '</div>');
      total += r.count;
    }
    const bl = S.req.baseline;
    if (bl && S.response && S.response.ok) {
      const ba = S.req.assertions.find((a) => a.target === 'baseline');
      const ign = ba ? ba.value : '';
      const base = { ok: true, status: bl.status, body: bl.body, timeMs: bl.timeMs, size: bl.size, headers: null };
      const r = compareSection(base, S.response, '기준 · ' + new Date(bl.savedAt).toLocaleString(), '현재 응답', '', meta.url, ign);
      parts.push('<div class="cmp-block"><div class="sub-head"><b>기준 응답 회귀 비교</b><span class="muted">' + (ign ? '제외: ' + esc(ign) : '제외할 경로는 검증 탭의 "기준 응답" 조건에서 설정') + '</span></div>' + r.html +
        '<div class="test-actions"><button class="btn btn-outline btn-sm" id="btnRebase">' + icon('pin') + '현재 응답을 새 기준으로</button> <button class="btn btn-ghost btn-sm" id="btnDropBase">기준 삭제</button></div></div>');
      total += r.count;
    }
    $('#cntDiff').textContent = total || '✓';
    $('#compareView').innerHTML = parts.join('');
    const rb = $('#btnRebase');
    if (rb) rb.addEventListener('click', saveBaseline);
    const db = $('#btnDropBase');
    if (db) db.addEventListener('click', () => {
      S.req.baseline = null;
      S.req.assertions = S.req.assertions.filter((a) => a.target !== 'baseline');
      reqChanged(); renderAssertTab(); renderResponse();
      toast('기준 응답을 삭제했어요');
    });
  }
  function saveBaseline() {
    const r = S.response;
    if (!r || !r.ok) { toast('성공한 응답이 있어야 기준으로 저장할 수 있어요', 'err'); return; }
    if (r.bodyEncoding === 'base64') { toast('바이너리 응답은 기준으로 저장할 수 없어요', 'err'); return; }
    if ((r.body || '').length > 300000) { toast('300KB 이하 응답만 기준으로 저장할 수 있어요', 'err'); return; }
    S.req.baseline = { status: r.status, statusText: r.statusText, body: r.body, timeMs: r.timeMs, size: r.size, savedAt: Date.now() };
    const added = !S.req.assertions.some((a) => a.target === 'baseline');
    if (added) S.req.assertions.push({ target: 'baseline', op: 'eq', value: '', path: '', enabled: true });
    reqChanged(); renderAssertTab(); renderResponse();
    toast(added ? '기준 응답을 저장하고 회귀 검증을 추가했어요. 매번 바뀌는 필드는 검증 탭에서 제외하세요' : '기준 응답을 갱신했어요', 'ok', 4000);
  }

  /* ------------------------------------------------------------------ *
   * 16-K. JSON 트리 뷰 (값을 눌러 검증·변수 추가)
   * ------------------------------------------------------------------ */
  const jsKeyPath = (path, k) => path + (/^[A-Za-z_$][\w$]*$/.test(k) ? '.' + k : "['" + String(k).replace(/'/g, "\\'") + "']");
  function treeHtml(v, path, key, depth) {
    const k = key !== null ? '<span class="t-key" data-path="' + esc(path) + '">' + esc(key) + '</span><span class="t-colon">: </span>' : '';
    const t = EasyEngine.typeOf(v);
    if (t === 'object' || t === 'array') {
      const entries = t === 'array' ? v.map((x, i) => [i, x]) : Object.keys(v).map((x) => [x, v[x]]);
      if (!entries.length) return '<div class="t-row">' + k + '<span class="t-val t-empty" data-path="' + esc(path) + '">' + (t === 'array' ? '[]' : '{}') + '</span></div>';
      const kids = entries.slice(0, 300).map(([ck, cv]) => treeHtml(cv, t === 'array' ? path + '[' + ck + ']' : jsKeyPath(path, ck), t === 'array' ? String(ck) : ck, depth + 1)).join('');
      return '<details class="t-node"' + (depth < 2 ? ' open' : '') + '><summary>' + k + '<span class="t-sum" data-path="' + esc(path) + '">' + (t === 'array' ? 'Array(' + entries.length + ')' : '{ ' + entries.length + ' }') + '</span></summary><div class="t-children">' +
        kids + (entries.length > 300 ? '<div class="t-more">… ' + (entries.length - 300) + '개 더 (원본 보기에서 확인)</div>' : '') + '</div></details>';
    }
    return '<div class="t-row">' + k + '<span class="t-val t-' + t + '" data-path="' + esc(path) + '">' + esc(t === 'string' ? JSON.stringify(v) : String(v)) + '</span></div>';
  }
  function treeMenu(path) {
    let value;
    try { value = EasyEngine.jsonPath(JSON.parse(S.response.body), path).value; } catch (e) { return; }
    const t = EasyEngine.typeOf(value);
    const prim = t !== 'object' && t !== 'array';
    const addA = (a, msg) => { S.req.assertions.push(Object.assign({ enabled: true, path: path, value: '' }, a)); renderAssertTab(); reqChanged(); toast(msg || '검증 조건을 추가했어요 (검증 탭)', 'ok', 2200); };
    const lastKey = (path.match(/[A-Za-z_$][\w$]*(?=[^.]*$)/) || ['value'])[0];
    const acts = [
      { label: 'JSON 경로 복사  ' + path, icon: 'copy', run: () => copyText(path) },
      { label: '값 복사', icon: 'copy', run: () => copyText(prim ? String(value) : JSON.stringify(value, null, 2)) }
    ];
    if (prim) acts.push({ label: '검증 추가: ' + path + ' = ' + (t === 'string' ? JSON.stringify(value) : String(value)).slice(0, 40), icon: 'check', run: () => addA({ target: 'json', op: 'eq', value: value === null ? 'null' : String(value) }) });
    acts.push({ label: '검증 추가: 값이 존재함', icon: 'check', run: () => addA({ target: 'json', op: 'exists' }) });
    acts.push({ label: '검증 추가: 타입이 ' + t, icon: 'check', run: () => addA({ target: 'json', op: 'type', value: t }) });
    if (t === 'array') acts.push({ label: '검증 추가: 항목이 1개 이상', icon: 'check', run: () => addA({ target: 'json', op: 'gte', value: '1', path: path + '.length' }) });
    if (t === 'object' || t === 'array') acts.push({ label: '검증 추가: 이 구조의 JSON 스키마', icon: 'check', run: () => addA({ target: 'schema', op: 'schema', value: JSON.stringify(inferSchema(value)), path: path === '$' ? '' : path }, '현재 구조로 스키마 검증을 추가했어요') });
    acts.push({ label: '변수로 저장  {{' + lastKey + '}}', icon: 'braces', run: async () => {
      const name = await promptModal('응답값을 변수로 저장', '변수 이름 (보낼 때마다 이 경로의 값이 저장돼요)', lastKey);
      if (!name) return;
      S.req.extracts.push({ varName: name.replace(/[{}\s]/g, ''), from: 'json', path: path, scope: 'environment', enabled: true });
      renderAssertTab(); reqChanged();
      toast('{{' + name + '}} 변수 저장을 추가했어요. 다음에 보낼 때부터 저장돼요', 'ok', 3000);
    } });
    actionSheet(path, acts);
  }
  function inferSchema(v, depth) {
    depth = depth || 0;
    if (depth > 10) return {};
    const t = EasyEngine.typeOf(v);
    if (t === 'null') return { nullable: true };
    if (t === 'array') return { type: 'array', items: v.length ? inferSchema(v[0], depth + 1) : {} };
    if (t === 'object') {
      const props = {};
      Object.keys(v).forEach((k) => { props[k] = inferSchema(v[k], depth + 1); });
      return { type: 'object', required: Object.keys(v).filter((k) => v[k] !== null), properties: props };
    }
    if (t === 'number') return { type: Number.isInteger(v) ? 'integer' : 'number' };
    return { type: t };
  }
  function openSchemaEditor(a) {
    openModal({
      title: 'JSON 스키마 편집', size: 'wide',
      body: '<p class="tip">응답(또는 <code>' + esc(a.path || '$') + '</code> 위치의 값)이 이 스키마와 맞는지 검사해요. <code>type · required · properties · items · enum · format · minimum</code> 등 JSON Schema 문법을 지원해요.</p>' +
        '<textarea id="schemaText" class="code-area" spellcheck="false" style="min-height:340px"></textarea><p id="schemaMsg" class="json-status" style="margin-top:8px"></p>',
      buttons: [
        { label: '현재 응답에서 생성', cls: 'btn-ghost', onClick: () => {
          try {
            const j = JSON.parse(S.response.body);
            const sub = a.path ? EasyEngine.jsonPath(j, a.path).value : j;
            $('#schemaText').value = JSON.stringify(inferSchema(sub), null, 2);
            $('#schemaText').dispatchEvent(new Event('input'));
          } catch (e) { toast('JSON 응답이 있어야 해요', 'err'); }
          return false;
        } },
        { label: '취소' },
        { label: '저장', cls: 'btn-primary', onClick: () => {
          try { a.value = JSON.stringify(JSON.parse($('#schemaText').value)); } catch (e) { toast('JSON 형식 오류: ' + e.message, 'err'); return false; }
          renderAssertTab(); reqChanged();
          return true;
        } }
      ],
      onOpen: (b) => {
        const ta = $('#schemaText', b);
        try { ta.value = JSON.stringify(JSON.parse(a.value || '{}'), null, 2); } catch (e) { ta.value = a.value || ''; }
        const check = () => { const m = $('#schemaMsg', b); try { JSON.parse(ta.value); m.textContent = '올바른 JSON'; m.className = 'json-status ok'; } catch (e) { m.textContent = 'JSON 형식 오류'; m.className = 'json-status bad'; } };
        ta.addEventListener('input', check);
        check();
      }
    });
  }
  function schemaSummary(v) {
    try { const s = JSON.parse(v || '{}'); const n = s.properties ? Object.keys(s.properties).length : 0; return (s.type || '스키마') + (n ? ' · 속성 ' + n + '개' : '') + (s.required ? ' · 필수 ' + s.required.length : ''); } catch (e) { return '형식 오류'; }
  }

  /* ------------------------------------------------------------------ *
   * 16-L. OAuth 2.0
   * ------------------------------------------------------------------ */
  S.oauthCache = {};
  function effectiveAuth() {
    const a = S.req.auth;
    if (a.type !== 'inherit') return a;
    const col = currentCollection();
    return col ? col.auth : { type: 'none' };
  }
  function renderOAuthStatus() {
    const el = $('#oaStatus');
    if (!el) return;
    const a = effectiveAuth();
    if (a.type !== 'oauth2') return;
    const tk = S.oauthCache[EasyEngine.oauthKey(a, currentVars())];
    if (EasyEngine.tokenValid(tk)) {
      el.className = 'ok';
      el.textContent = '토큰 발급됨 · ' + tk.accessToken.slice(0, 12) + '… · ' + (tk.expiresAt ? new Date(tk.expiresAt).toLocaleTimeString() + ' 만료' : '만료 없음');
    } else { el.className = 'muted'; el.textContent = '토큰은 보낼 때 자동으로 발급·갱신돼요.'; }
  }
  async function fetchTokenNow() {
    const a = effectiveAuth();
    if (a.type !== 'oauth2') return;
    const el = $('#oaStatus');
    el.className = 'muted';
    el.textContent = '토큰 발급 중…';
    try {
      const vars = currentVars();
      S.oauthCache[EasyEngine.oauthKey(a, vars)] = await EasyEngine.fetchOAuthToken(a, vars, (r) => transport(r));
      renderOAuthStatus();
      toast('OAuth 토큰을 받았어요', 'ok');
    } catch (e) { el.className = 'bad'; el.textContent = e.message; }
  }

  /* ------------------------------------------------------------------ *
   * 16-M. OpenAPI / Swagger 가져오기
   * ------------------------------------------------------------------ */
  let yamlLoading = null;
  function loadYaml() {
    if (window.jsyaml) return Promise.resolve(window.jsyaml);
    if (!yamlLoading) {
      yamlLoading = new Promise((ok, no) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/js-yaml/4.1.0/js-yaml.min.js';
        s.onload = () => ok(window.jsyaml);
        s.onerror = () => { yamlLoading = null; no(new Error('YAML 해석기를 불러오지 못했어요 (인터넷 연결 필요). JSON 형식 명세를 사용해 주세요.')); };
        document.head.appendChild(s);
      });
    }
    return yamlLoading;
  }
  async function parseSpecText(t) {
    t = String(t || '').trim();
    if (!t) throw new Error('내용이 비어 있어요');
    if (/^[{[]/.test(t)) return JSON.parse(t);
    const y = await loadYaml();
    return y.load(t);
  }
  function openOpenAPI() {
    let spec = null;
    let specUrl = '';
    const practice = (/^https?:$/.test(location.protocol) ? location.origin : 'http://localhost:8080') + '/qa/openapi.json';
    openModal({
      title: 'OpenAPI / Swagger 가져오기', size: 'wide',
      body: '<p class="tip beginner">백엔드의 API 명세(OpenAPI 3.x, Swagger 2.0 · JSON/YAML)로 요청을 한 번에 만들어요. 경로·쿼리 변수, 예시 바디, 인증, <b>응답 스키마 검증</b>까지 자동으로 채워요.</p>' +
        '<div class="seg" id="oaSrc" style="margin-bottom:12px"><button data-s="url" class="on">URL</button><button data-s="file">파일</button><button data-s="paste">붙여넣기</button></div>' +
        '<div data-src="url"><div style="display:flex;gap:8px"><input type="text" id="specUrl" placeholder="https://api.example.com/v3/api-docs" autocapitalize="off" spellcheck="false"><button class="btn btn-outline" id="specFetch">불러오기</button></div>' +
        '<p class="muted" style="font-size:12px;margin:6px 0 0">연습용: <a href="#" id="specPractice">' + esc(practice) + '</a></p></div>' +
        '<div data-src="file" hidden><label class="file-drop">' + icon('file') + '<span id="specFileName">openapi.json / swagger.yaml 파일 선택</span><input type="file" id="specFile" accept=".json,.yaml,.yml,application/json,text/yaml"></label></div>' +
        '<div data-src="paste" hidden><textarea id="specText" class="code-area" spellcheck="false" style="min-height:180px" placeholder="openapi: 3.0.0&#10;info: ..."></textarea></div>' +
        '<div class="switch-row" style="margin-top:14px"><div><b>응답 스키마 검증 자동 추가</b><p class="muted">명세의 응답 스키마로 계약 테스트를 만들어요</p></div><label class="switch"><input type="checkbox" id="specSchema" checked><i></i></label></div>' +
        '<div id="specPreview" class="preview-box" hidden></div>',
      buttons: [{ label: '취소' }, { label: '가져오기', cls: 'btn-primary', id: 'btnSpecImport', onClick: () => {
        if (!spec) { toast('먼저 명세를 불러오세요', 'err'); return false; }
        try {
          const cols = EasyEngine.fromOpenAPI(spec, { specUrl: specUrl, schemaAssertions: $('#specSchema').checked });
          cols.forEach((c) => S.collections.push(c));
          S.ui.lib = 'collections';
          persist(); renderLibrary();
          toast(cols.meta.title + ': 폴더 ' + cols.length + '개 · 요청 ' + cols.meta.endpoints + '개를 만들었어요', 'ok', 3500);
          if (isMobile()) setView('library');
          return true;
        } catch (e) { toast(e.message, 'err', 4000); return false; }
      } }],
      onOpen: (b) => {
        const prev = $('#specPreview', b);
        const btn = $('#btnSpecImport');
        btn.disabled = true;
        const preview = (obj, url) => {
          try {
            const cols = EasyEngine.fromOpenAPI(obj, { specUrl: url });
            spec = obj; specUrl = url || '';
            const m = cols.meta;
            const a = cols[0] ? cols[0].auth : { type: 'none' };
            prev.className = 'preview-box';
            prev.innerHTML = '<div class="preview-line"><b>' + esc(m.title) + '</b> <span class="muted">' + esc(m.version || '') + (m.isV2 ? ' · Swagger 2.0' : ' · OpenAPI 3') + '</span></div>' +
              '<div class="preview-tags"><span class="tag ok">요청 ' + m.endpoints + '개</span><span class="tag">폴더 ' + cols.length + '개 (' + esc(m.tags.join(', ')) + ')</span><span class="tag">인증 ' + esc(a.type) + '</span><span class="tag">' + esc(m.baseUrl || '서버 주소 없음') + '</span></div>';
            btn.disabled = false;
          } catch (e) { spec = null; prev.className = 'preview-box bad'; prev.textContent = e.message; btn.disabled = true; }
          prev.hidden = false;
        };
        const fromText = (t, url) => parseSpecText(t).then((o) => preview(o, url), (e) => { spec = null; prev.className = 'preview-box bad'; prev.textContent = '명세를 해석하지 못했어요: ' + e.message; prev.hidden = false; btn.disabled = true; });
        $$('#oaSrc button', b).forEach((x) => x.addEventListener('click', () => {
          $$('#oaSrc button', b).forEach((y) => y.classList.toggle('on', y === x));
          $$('[data-src]', b).forEach((el) => { el.hidden = el.dataset.src !== x.dataset.s; });
        }));
        const fetchUrl = async () => {
          const u = $('#specUrl', b).value.trim();
          if (!u) return;
          prev.hidden = false; prev.className = 'preview-box'; prev.textContent = '불러오는 중…';
          const r = await transport({ method: 'GET', url: u, headers: [['Accept', 'application/json, application/yaml, */*']], bodyText: null, multipart: null, binary: null });
          if (!r.ok || r.status >= 400) { prev.className = 'preview-box bad'; prev.textContent = '불러오기 실패: ' + (r.ok ? r.status : r.error.message); btn.disabled = true; return; }
          fromText(r.body, u);
        };
        $('#specFetch', b).addEventListener('click', fetchUrl);
        $('#specUrl', b).addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchUrl(); });
        $('#specPractice', b).addEventListener('click', (e) => { e.preventDefault(); $('#specUrl', b).value = practice; fetchUrl(); });
        $('#specFile', b).addEventListener('change', (e) => { const f = e.target.files[0]; if (!f) return; $('#specFileName', b).textContent = f.name; f.text().then((t) => fromText(t, '')); });
        $('#specText', b).addEventListener('input', debounce(() => fromText($('#specText', b).value, ''), 400));
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * 16-N. 명령 팔레트 (Ctrl/⌘ + K)
   * ------------------------------------------------------------------ */
  function paletteItems() {
    const out = [];
    const act = (label, hint, run, ic) => out.push({ kind: 'action', label: label, hint: hint, run: run, icon: ic || 'chevron' });
    act('새 요청 탭', 'Alt+T', () => { openNewTab(); $('#url').focus(); }, 'plus');
    act('cURL 가져오기', '', () => openImport(), 'import');
    act('OpenAPI / Swagger 가져오기', '', openOpenAPI, 'import');
    act('실행기 (기능 테스트)', 'Ctrl+Shift+R', () => openRunner(), 'play');
    act('성능 테스트', '', () => openRunner(null, 'perf'), 'gauge');
    act('현재 요청 보내기', 'Ctrl+Enter', send, 'send');
    act('현재 요청 저장', 'Ctrl+S', saveRequest, 'save');
    act('코드로 내보내기', '', openCode, 'code');
    act('이슈 리포트 복사', '', bugReport, 'bug');
    act('기준 응답으로 저장', '', saveBaseline, 'pin');
    act('환경 변수 관리', '', () => openEnv(), 'braces');
    act('쿠키 관리', '', openCookies, 'shield');
    act('기기 미러링 (PC ↔ 휴대폰)', '', openRoom, 'devices');
    act('설정', '', () => openSettings(), 'gear');
    act('사용 가이드 다시 보기', '', openOnboarding, 'help');
    act('포인트 색상 바꾸기', ACCENT_KO[S.settings.accent || 'lime'], cycleAccent, 'palette');
    act('사이드바 접기/펼치기', 'Ctrl+\\', toggleSidebar, 'sidebar');
    act('테마 전환 (라이트/다크)', '', () => { const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (S.settings.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches); S.settings.theme = dark ? 'light' : 'dark'; applyTheme(); persist(); }, 'edit');
    S.envs.forEach((e) => act('환경 전환: ' + e.name, e.id === S.activeEnv ? '사용 중' : '', () => { S.activeEnv = e.id; renderEnvSelect(); renderResolvedUrl(); persist(); toast('환경: ' + e.name, '', 1500); }, 'braces'));
    S.collections.forEach((c) => c.requests.forEach((r) => out.push({ kind: 'request', label: r.name, hint: c.name, method: r.method, sub: r.url, run: () => loadRequest(r, { colId: c.id, reqId: r.id }) })));
    S.history.slice(0, 20).forEach((h) => out.push({ kind: 'history', label: shortUrl(h.req.url), hint: '최근 · ' + timeAgo(h.ts), method: h.req.method, run: () => loadRequest(h.req, null) }));
    return out;
  }
  function openPalette() {
    const all = paletteItems();
    let idx = 0;
    let shown = [];
    const score = (it, q) => {
      if (!q) return it.kind === 'history' ? 0 : 1;
      const hay = (it.label + ' ' + (it.hint || '') + ' ' + (it.sub || '') + ' ' + (it.method || '')).toLowerCase();
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      if (!words.every((w) => hay.indexOf(w) >= 0)) return -1;
      return (it.label.toLowerCase().indexOf(words[0]) === 0 ? 3 : 1) + (it.kind === 'action' ? 0.5 : 0);
    };
    openModal({
      title: '', size: 'palette',
      body: '<div class="pal-input">' + icon('search') + '<input type="text" id="palQ" placeholder="요청 이름, 주소, 기능 검색…" autocomplete="off" autocapitalize="off" spellcheck="false"><kbd class="kbd">ESC</kbd></div><div class="pal-list" id="palList" role="listbox"></div>',
      onOpen: (b) => {
        const q = $('#palQ', b);
        const list = $('#palList', b);
        const draw = () => {
          const query = q.value.trim();
          shown = all.map((it) => ({ it: it, s: score(it, query) })).filter((x) => x.s >= 0).sort((a, c) => c.s - a.s).slice(0, 60).map((x) => x.it);
          idx = Math.min(idx, Math.max(0, shown.length - 1));
          let lastKind = '';
          list.innerHTML = shown.length ? shown.map((it, i) => {
            const head = it.kind !== lastKind ? '<div class="pal-group">' + ({ action: '기능', request: '보관함', history: '최근 기록' }[it.kind]) + '</div>' : '';
            lastKind = it.kind;
            return head + '<div class="pal-item' + (i === idx ? ' on' : '') + '" role="option" data-i="' + i + '">' +
              (it.method ? '<span class="mbadge m-' + it.method + '">' + it.method + '</span>' : icon(it.icon)) +
              '<span class="pal-label">' + esc(it.label) + (it.sub ? '<span class="pal-sub">' + esc(it.sub) + '</span>' : '') + '</span><span class="pal-hint">' + esc(it.hint || '') + '</span></div>';
          }).join('') : '<div class="pal-empty">"' + esc(query) + '" 결과가 없어요</div>';
          const on = $('.pal-item.on', list);
          if (on) on.scrollIntoView({ block: 'nearest' });
        };
        const run = (i) => { const it = shown[i]; if (!it) return; closeModal(); setTimeout(it.run, 20); };
        q.addEventListener('input', () => { idx = 0; draw(); });
        q.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(shown.length - 1, idx + 1); draw(); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); draw(); }
          else if (e.key === 'Enter') { e.preventDefault(); run(idx); }
        });
        list.addEventListener('click', (e) => { const el = e.target.closest('.pal-item'); if (el) run(Number(el.dataset.i)); });
        list.addEventListener('mousemove', (e) => { const el = e.target.closest('.pal-item'); if (el && Number(el.dataset.i) !== idx) { idx = Number(el.dataset.i); $$('.pal-item', list).forEach((x) => x.classList.toggle('on', Number(x.dataset.i) === idx)); } });
        draw();
        setTimeout(() => q.focus(), 30);
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * 16-O. v1.3 UI: 포인트 색상 · 레이아웃 · 상태 바 · 햅틱 · 타이밍
   * ------------------------------------------------------------------ */
  const ACCENTS = { lime: '#c6f432', sky: '#7dd3fc', violet: '#c4b5fd', orange: '#fdba74', pink: '#f9a8d4' };
  const ACCENT_KO = { lime: '라임', sky: '하늘', violet: '보라', orange: '주황', pink: '핑크' };
  function applyAccent() {
    const a = ACCENTS[S.settings.accent] ? S.settings.accent : 'lime';
    if (a === 'lime') document.documentElement.removeAttribute('data-accent');
    else document.documentElement.setAttribute('data-accent', a);
  }

  /** Android 진동 피드백 (지원 기기에서만) */
  function haptic(kind) {
    if (!isMobile() || !navigator.vibrate || S.settings.haptics === false) return;
    try { navigator.vibrate(kind === 'err' ? [24, 60, 24] : (kind === 'tap' ? 6 : 14)); } catch (e) { /* noop */ }
  }

  /* ---- 패널 크기 조절 · 사이드바 접기 ---- */
  function applyLayout() {
    const L = S.ui.layout || {};
    const app = $('.app');
    app.style.setProperty('--side-w', (L.side || 264) + 'px');
    if (L.req) app.style.setProperty('--req-w', L.req + 'px'); else app.style.removeProperty('--req-w');
    if (L.reqH) app.style.setProperty('--req-h', L.reqH + 'px'); else app.style.removeProperty('--req-h');
    document.body.classList.toggle('side-collapsed', !!S.ui.sideCollapsed);
  }
  function toggleSidebar() {
    S.ui.sideCollapsed = !S.ui.sideCollapsed;
    applyLayout();
    persist();
  }
  function bindSplitters() {
    $$('.splitter').forEach((sp) => {
      const kind = sp.dataset.split;
      const start = (e) => {
        if (isMobile()) return;
        e.preventDefault();
        const wide = window.innerWidth >= 1280;
        const pane = kind === 'side' ? $('#libraryPane') : $('#requestPane');
        const rect = pane.getBoundingClientRect();
        document.body.classList.add('resizing', kind === 'main' && !wide ? 'resizing-y' : 'resizing-x');
        sp.setPointerCapture && e.pointerId !== undefined && sp.setPointerCapture(e.pointerId);
        const move = (ev) => {
          S.ui.layout = S.ui.layout || {};
          if (kind === 'side') S.ui.layout.side = Math.round(Math.max(200, Math.min(460, ev.clientX - rect.left)));
          else if (wide) S.ui.layout.req = Math.round(Math.max(360, Math.min(window.innerWidth - S.ui.layout.side - 380 || 900, ev.clientX - rect.left)));
          else S.ui.layout.reqH = Math.round(Math.max(220, Math.min(window.innerHeight - 260, ev.clientY - rect.top)));
          applyLayout();
        };
        const end = () => {
          document.body.classList.remove('resizing', 'resizing-x', 'resizing-y');
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', end);
          persist();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end);
      };
      sp.addEventListener('pointerdown', start);
      sp.addEventListener('dblclick', () => {
        S.ui.layout = S.ui.layout || {};
        if (kind === 'side') delete S.ui.layout.side; else { delete S.ui.layout.req; delete S.ui.layout.reqH; }
        applyLayout(); persist();
        toast('기본 크기로 되돌렸어요', '', 1200);
      });
      sp.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 40 : 12;
        const L = (S.ui.layout = S.ui.layout || {});
        if (kind === 'side' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { L.side = Math.max(200, Math.min(460, (L.side || 264) + (e.key === 'ArrowRight' ? step : -step))); }
        else if (kind === 'main' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { L.req = Math.max(360, ($('#requestPane').getBoundingClientRect().width) + (e.key === 'ArrowRight' ? step : -step)); }
        else if (kind === 'main' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { L.reqH = Math.max(220, ($('#requestPane').getBoundingClientRect().height) + (e.key === 'ArrowDown' ? step : -step)); }
        else return;
        e.preventDefault(); applyLayout(); persist();
      });
    });
  }

  /* ---- 하단 상태 바 ---- */
  function renderStatusbar() {
    const bar = $('#statusbar');
    if (!bar) return;
    const env = S.envs.find((e) => e.id === S.activeEnv);
    const server = S.serverOk === null ? ['wait', '서버 확인 중'] : (S.serverOk ? (S.settings.transport === 'server' ? ['ok', '서버 연결됨'] : ['warn', '브라우저 직접 전송']) : ['warn', '서버 없음 · 직접 전송']);
    const px = S.settings.proxy;
    const item = (id, cls, html, title) => '<button class="sb-item ' + (cls || '') + '" data-sb="' + id + '" title="' + esc(title || '') + '">' + html + '</button>';
    bar.innerHTML =
      item('server', 'sb-' + server[0], '<i class="sb-dot"></i>' + esc(server[1]), '전송 방식 설정') +
      item('env', env ? 'sb-on' : '', icon('braces') + esc(env ? env.name : '환경 없음'), '환경 변수') +
      item('proxy', px.enabled ? 'sb-on' : '', '프록시 ' + (px.enabled ? 'ON' : 'OFF'), px.enabled ? px.url : '프록시 설정') +
      item('cookies', '', '쿠키 ' + S.cookies.length, '쿠키 관리') +
      item('room', Room.code ? 'sb-on' : '', icon('devices') + (Room.code ? '동기화 ' + Room.code + ' · ' + Room.peers + '대' : '동기화 꺼짐'), '기기 미러링') +
      (S.settings.insecure ? item('ssl', 'sb-warn', 'SSL 검증 꺼짐', '설정') : '') +
      '<span class="spacer"></span>' +
      item('palette', '', '<kbd class="kbd">' + (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K') + '</kbd> 명령 팔레트', '') +
      item('accent', '', '<i class="sb-swatch"></i>' + esc(ACCENT_KO[S.settings.accent] || '라임'), '포인트 색상 바꾸기') +
      '<span class="sb-ver">EasyAPI v1.3</span>';
  }
  function cycleAccent() {
    const keys = Object.keys(ACCENTS);
    S.settings.accent = keys[(keys.indexOf(S.settings.accent || 'lime') + 1) % keys.length];
    applyAccent(); persist(); renderStatusbar();
    toast('포인트 색상: ' + ACCENT_KO[S.settings.accent], 'ok', 1200);
  }

  /* ---- 응답 시간 분석 ---- */
  function renderTiming() {
    const r = S.response;
    const pop = $('#timingPop');
    if (!r || !r.ok) { pop.hidden = true; return; }
    const total = r.timeMs || 0;
    const ttfb = typeof r.ttfbMs === 'number' ? Math.min(r.ttfbMs, total) : null;
    const dl = ttfb !== null ? Math.max(0, total - ttfb) : null;
    const pct = (v) => (total ? Math.max(2, (v / total) * 100) : 0).toFixed(1) + '%';
    pop.innerHTML = '<div class="tp-head"><b>' + formatMs(total) + '</b><span class="muted">전체 응답 시간</span></div>' +
      (ttfb !== null
        ? '<div class="tp-bar"><i class="tp-wait" style="width:' + pct(ttfb) + '"></i><i class="tp-dl" style="width:' + pct(dl) + '"></i></div>' +
          '<div class="tp-row"><span><i class="tp-key tp-wait"></i>대기 (TTFB)</span><b>' + formatMs(ttfb) + '</b></div>' +
          '<p class="tp-note">연결·서버 처리 후 첫 바이트가 오기까지. 길면 서버 처리나 네트워크가 느린 거예요.</p>' +
          '<div class="tp-row"><span><i class="tp-key tp-dl"></i>다운로드</span><b>' + formatMs(dl) + '</b></div>'
        : '<p class="tp-note">브라우저 직접 전송 모드에서는 세부 시간을 알 수 없어요.</p>') +
      '<div class="tp-sep"></div>' +
      '<div class="tp-row"><span>전송 크기</span><b>' + formatBytes(r.wireSize !== undefined ? r.wireSize : r.size) + '</b></div>' +
      '<div class="tp-row"><span>압축 해제 후</span><b>' + formatBytes(r.size) + '</b></div>' +
      (r.redirects && r.redirects.length ? '<div class="tp-row"><span>리다이렉트</span><b>' + r.redirects.length + '회</b></div>' : '') +
      '<div class="tp-row"><span>경로</span><b>' + (r.viaProxy ? '프록시 경유' : (r.direct ? '브라우저 직접' : 'EasyAPI 서버')) + '</b></div>';
  }

  /* ---- 로딩 경과 시간 ---- */
  let skTimer = null;
  function startSkeletonTimer(on) {
    clearInterval(skTimer);
    if (!on) return;
    const t0 = performance.now();
    const el = $('#skTimer');
    el.textContent = '0.0s';
    skTimer = setInterval(() => { el.textContent = ((performance.now() - t0) / 1000).toFixed(1) + 's'; }, 100);
  }

  /* ---- 실행 취소 가능한 삭제 ---- */
  function undoableRemove(label, removeFn, restoreFn) {
    removeFn();
    persist(); renderLibrary();
    toast(label + ' 삭제했어요', '', 5000, { label: '실행 취소', run: () => { restoreFn(); persist(); renderLibrary(); toast('되돌렸어요', 'ok', 1200); } });
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
    $('#btnPalette').addEventListener('click', openPalette);
    $('#btnSide').addEventListener('click', toggleSidebar);
    $('#fabSend').addEventListener('click', () => { haptic('tap'); send(); });
    const panels = $('#requestPane .tab-panels');
    let lastY = 0;
    panels.addEventListener('scroll', () => {
      const y = panels.scrollTop;
      $('#fabSend').classList.toggle('shrink', y > lastY && y > 40);
      lastY = y;
    }, { passive: true });
    $('#btnTiming').addEventListener('click', (e) => { e.stopPropagation(); const p = $('#timingPop'); if (S.response && S.response.ok) { renderTiming(); p.hidden = !p.hidden; } });
    document.addEventListener('click', (e) => { if (!e.target.closest('#timingPop')) $('#timingPop').hidden = true; });
    $('#bento').addEventListener('click', (e) => {
      const t = e.target.closest('[data-quick]');
      if (!t) return;
      const q = t.dataset.quick;
      if (q === 'runner') { const qa = S.collections.find((c) => /QA 연습 \(내장/.test(c.name)); openRunner(qa ? qa.id : undefined); }
      else if (q === 'curl') openImport(SAMPLE_CURL);
      else if (q === 'openapi') openOpenAPI();
      else openPalette();
    });
    $('#statusbar').addEventListener('click', (e) => {
      const t = e.target.closest('[data-sb]');
      if (!t) return;
      const k = t.dataset.sb;
      if (k === 'server' || k === 'ssl') openSettings();
      else if (k === 'env') openEnv();
      else if (k === 'proxy') openSettings('proxy');
      else if (k === 'cookies') openCookies();
      else if (k === 'room') openRoom();
      else if (k === 'palette') openPalette();
      else if (k === 'accent') cycleAccent();
    });
    bindSplitters();
    $('#btnEnv').addEventListener('click', () => openEnv());
    $('#btnHelp').addEventListener('click', openOnboarding);
    $('#btnMirrorRoom').addEventListener('click', openRoom);
    $('#btnMirrorRoom2').addEventListener('click', openRoom);
    $('#btnSave').addEventListener('click', saveRequest);
    $('#btnCode').addEventListener('click', openCode);
    $('#btnNew').addEventListener('click', () => { openNewTab(); switchReqTab('params'); $('#url').focus(); });
    $('#btnRunner').addEventListener('click', () => openRunner());
    $('#btnBugReport').addEventListener('click', bugReport);
    $('#openTabs').addEventListener('click', (e) => {
      const x = e.target.closest('[data-close-tab]');
      if (x) { e.stopPropagation(); closeTab(x.dataset.closeTab); return; }
      if (e.target.closest('#btnAddTab')) { openNewTab(); $('#url').focus(); return; }
      const t = e.target.closest('[data-tab-id]');
      if (t) switchTab(t.dataset.tabId);
    });
    $('#openTabs').addEventListener('auxclick', (e) => { const t = e.target.closest('[data-tab-id]'); if (t && e.button === 1) { e.preventDefault(); closeTab(t.dataset.tabId); } });
    $('#openTabs').addEventListener('keydown', (e) => { const t = e.target.closest('[data-tab-id]'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); switchTab(t.dataset.tabId); } });
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
      if (mod && e.key === '\\') { e.preventDefault(); toggleSidebar(); return; }
      if (mod && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); if ($('#modal').hidden) openPalette(); else closeModal(); return; }
      if (mod && e.key === 'Enter') { e.preventDefault(); send(); }
      if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); saveRequest(); }
      if (e.altKey && (e.key === 't' || e.key === 'T')) { e.preventDefault(); openNewTab(); $('#url').focus(); }
      if (e.altKey && (e.key === 'w' || e.key === 'W')) { e.preventDefault(); closeTab(S.activeTab); }
      if (mod && e.shiftKey && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); openRunner(); }
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  }

  async function checkServer() {
    try {
      const res = await fetch('api/info', { cache: 'no-store' });
      if (!res.ok) throw new Error('no server');
      S.serverInfo = await res.json();
      S.serverOk = true;
      renderStatusbar();
    } catch (e) {
      S.serverOk = false;
      renderStatusbar();
      if (S.settings.transport === 'server') {
        setTimeout(() => toast('EasyAPI 서버 없이 실행 중 → 브라우저 직접 전송 모드 (CORS 허용 API만 가능)', '', 4500), 800);
      }
    }
  }

  async function init() {
    load();
    if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) $$('#kbdSend, #kbdSend2').forEach((k) => { k.textContent = 'Ctrl ↵'; }); if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) { $('#kbdPalette').textContent = 'Ctrl K'; $('#kbdPalette2').textContent = 'Ctrl K'; }
    // URL 해시로 전달된 접속 키 (QR 공유용)
    const hashKey = /[#&]key=([^&]+)/.exec(location.hash);
    if (hashKey) { S.settings.accessKey = decodeURIComponent(hashKey[1]); history.replaceState(null, '', location.pathname + location.search); }
    applyTheme();
    applyAccent();
    applyLayout();
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
