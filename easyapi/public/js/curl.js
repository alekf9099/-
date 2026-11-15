/*!
 * EasyAPI cURL 변환기
 * - bash(맥/리눅스/크롬 "Copy as cURL (bash)") / cmd(윈도우 "Copy as cURL (cmd)") 모두 해석
 * - 요청 객체 → cURL 명령어 내보내기
 * 브라우저(window.CurlParser)와 Node(require) 양쪽에서 사용
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CurlParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 셸 감지
   * ------------------------------------------------------------------ */
  function detectShell(input) {
    if (/\^\s*\r?\n/.test(input) || /\^"/.test(input)) return 'cmd';
    // 윈도우 사용자가 직접 작성한 형태: 큰따옴표 + \" 이스케이프, 작은따옴표 없음
    return 'bash';
  }

  /* ------------------------------------------------------------------ *
   * bash 토큰화 (작은따옴표, 큰따옴표, $'..', 역슬래시, 줄 이어쓰기)
   * ------------------------------------------------------------------ */
  function readAnsiC(s, i, out) {
    // s[i]는 $' 다음 문자
    let cur = '';
    while (i < s.length && s[i] !== "'") {
      if (s[i] === '\\' && i + 1 < s.length) {
        const n = s[i + 1];
        const map = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', e: '\x1b', E: '\x1b', f: '\f', v: '\v', '\\': '\\', "'": "'", '"': '"', '?': '?' };
        if (map[n] !== undefined) { cur += map[n]; i += 2; continue; }
        if (n === 'x') {
          const m = /^[0-9a-fA-F]{1,2}/.exec(s.slice(i + 2));
          if (m) { cur += String.fromCharCode(parseInt(m[0], 16)); i += 2 + m[0].length; continue; }
        }
        if (n === 'u' || n === 'U') {
          const len = n === 'u' ? 4 : 8;
          const m = new RegExp('^[0-9a-fA-F]{1,' + len + '}').exec(s.slice(i + 2));
          if (m) { cur += String.fromCodePoint(parseInt(m[0], 16)); i += 2 + m[0].length; continue; }
        }
        if (/[0-7]/.test(n)) {
          const m = /^[0-7]{1,3}/.exec(s.slice(i + 1));
          cur += String.fromCharCode(parseInt(m[0], 8)); i += 1 + m[0].length; continue;
        }
        cur += '\\' + n; i += 2; continue;
      }
      cur += s[i]; i++;
    }
    if (i >= s.length) throw new Error("닫히지 않은 $'...' 따옴표가 있습니다.");
    out.value = cur;
    return i + 1;
  }

  function isNewlineAt(s, i) {
    return s[i] === '\n' || (s[i] === '\r' && s[i + 1] === '\n');
  }

  function tokenizeBash(s) {
    const tokens = [];
    let cur = '';
    let has = false;
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      // 줄 이어쓰기: \ + 줄바꿈 (bash), ` + 줄바꿈 (PowerShell)
      if ((c === '\\' || c === '`') && isNewlineAt(s, i + 1)) {
        i += s[i + 1] === '\r' ? 3 : 2;
        continue;
      }
      if (/\s/.test(c)) {
        if (has) { tokens.push(cur); cur = ''; has = false; }
        i++;
        continue;
      }
      // 파이프 / 명령 구분자를 만나면 첫 명령만 사용
      if (c === '|' || c === ';' || (c === '&' && s[i + 1] === '&') || c === '>') break;
      if (c === "'") {
        const j = s.indexOf("'", i + 1);
        if (j < 0) throw new Error('닫히지 않은 작은따옴표(\')가 있습니다.');
        cur += s.slice(i + 1, j);
        has = true;
        i = j + 1;
        continue;
      }
      if (c === '$' && s[i + 1] === "'") {
        const out = {};
        i = readAnsiC(s, i + 2, out);
        cur += out.value;
        has = true;
        continue;
      }
      if (c === '"') {
        i++;
        while (i < s.length && s[i] !== '"') {
          if (s[i] === '\\' && i + 1 < s.length && '"\\$`\n'.indexOf(s[i + 1]) >= 0) {
            if (s[i + 1] !== '\n') cur += s[i + 1];
            i += 2;
          } else {
            cur += s[i];
            i++;
          }
        }
        if (i >= s.length) throw new Error('닫히지 않은 큰따옴표(")가 있습니다.');
        i++;
        has = true;
        continue;
      }
      if (c === '\\') {
        if (i + 1 < s.length) cur += s[i + 1];
        i += 2;
        has = true;
        continue;
      }
      cur += c;
      has = true;
      i++;
    }
    if (has) tokens.push(cur);
    return tokens;
  }

  /* ------------------------------------------------------------------ *
   * cmd 토큰화: 1) cmd의 ^ 이스케이프 제거  2) MSVCRT 인자 규칙
   * ------------------------------------------------------------------ */
  function tokenizeCmd(s) {
    let t = '';
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '^') {
        if (isNewlineAt(s, i + 1)) { i += s[i + 1] === '\r' ? 2 : 1; continue; }
        if (i + 1 < s.length) { t += s[i + 1]; i++; }
        continue;
      }
      t += s[i];
    }
    const tokens = [];
    let cur = '';
    let has = false;
    let inQ = false;
    let i = 0;
    while (i < t.length) {
      const c = t[i];
      if (c === '\\') {
        let n = 0;
        while (t[i + n] === '\\') n++;
        if (t[i + n] === '"') {
          cur += '\\'.repeat(n >> 1);
          if (n % 2) { cur += '"'; i += n + 1; } else { i += n; }
        } else {
          cur += '\\'.repeat(n);
          i += n;
        }
        has = true;
        continue;
      }
      if (c === '"') {
        if (inQ && t[i + 1] === '"') { cur += '"'; i += 2; has = true; continue; }
        inQ = !inQ;
        has = true;
        i++;
        continue;
      }
      if (!inQ && /\s/.test(c)) {
        if (has) { tokens.push(cur); cur = ''; has = false; }
        i++;
        continue;
      }
      if (!inQ && (c === '|' || c === '>' || (c === '&' && t[i + 1] === '&'))) break;
      cur += c;
      has = true;
      i++;
    }
    if (inQ) throw new Error('닫히지 않은 큰따옴표(")가 있습니다.');
    if (has) tokens.push(cur);
    return tokens;
  }

  /* ------------------------------------------------------------------ *
   * 옵션 정의
   * ------------------------------------------------------------------ */
  const ARG_OPTS = {
    '-X': 'request', '--request': 'request',
    '-H': 'header', '--header': 'header',
    '-d': 'data', '--data': 'data', '--data-ascii': 'data',
    '--data-raw': 'data-raw', '--data-binary': 'data-binary',
    '--data-urlencode': 'data-urlencode', '--json': 'json',
    '-F': 'form', '--form': 'form', '--form-string': 'form-string',
    '-u': 'user', '--user': 'user',
    '-b': 'cookie', '--cookie': 'cookie',
    '-A': 'user-agent', '--user-agent': 'user-agent',
    '-e': 'referer', '--referer': 'referer',
    '--url': 'url',
    '-x': 'proxy', '--proxy': 'proxy',
    '-U': 'proxy-user', '--proxy-user': 'proxy-user',
    '-m': 'max-time', '--max-time': 'max-time',
    '-T': 'upload-file', '--upload-file': 'upload-file',
    '--oauth2-bearer': 'bearer',
    '--url-query': 'url-query'
  };
  const FLAG_OPTS = {
    '-G': 'get', '--get': 'get',
    '-I': 'head', '--head': 'head',
    '-k': 'insecure', '--insecure': 'insecure',
    '-L': 'location', '--location': 'location'
  };
  // 값을 받지만 API 테스트에는 의미 없는 옵션(값까지 건너뜀)
  const SKIP_ARG = new Set(('-o --output --connect-timeout -w --write-out --retry --retry-delay --retry-max-time ' +
    '--cacert --capath --cert -E --key --key-type --cert-type --resolve --interface -c --cookie-jar -r --range ' +
    '-K --config --limit-rate --max-redirs -y --speed-time -Y --speed-limit --dns-servers --noproxy --proxy-header ' +
    '--unix-socket --abstract-unix-socket -D --dump-header --trace --trace-ascii --stderr --ciphers --tls-max -z ' +
    '--time-cond --expect100-timeout --happy-eyeballs-timeout-ms --keepalive-time --local-port -P --ftp-port -Q ' +
    '--quote --pass --pubkey --krb --service-name --socks4 --socks4a --socks5 --socks5-hostname --preproxy ' +
    '--connect-to --aws-sigv4 --variable --etag-save --etag-compare --output-dir --proto --proto-redir ' +
    '--mail-from --mail-rcpt --mail-auth --retry-all-errors-delay --parallel-max').split(/\s+/));
  // 한 글자 옵션 중 값을 받는 것
  const SHORT_WITH_ARG = 'XHdFubAexUmTowcrKyYDEPQz';

  /* ------------------------------------------------------------------ *
   * 유틸
   * ------------------------------------------------------------------ */
  function b64decode(str) {
    try {
      if (typeof atob === 'function') {
        const bin = atob(str);
        const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
        return new TextDecoder().decode(bytes);
      }
      return Buffer.from(str, 'base64').toString('utf8');
    } catch (e) { return null; }
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
  function safeDecode(s) {
    try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch (e) { return s; }
  }
  function looksLikeJson(s) {
    const t = (s || '').trim();
    if (!/^[\[{]/.test(t)) return false;
    try { JSON.parse(t); return true; } catch (e) { return false; }
  }
  function looksLikeUrlEncoded(s) {
    if (!s || /[\s{}\[\]"]/.test(s.trim())) return false;
    return s.split('&').every((p) => /^[^=&]+(=[^&]*)?$/.test(p));
  }
  function parseQueryPairs(qs) {
    if (!qs) return [];
    return qs.split('&').filter((p) => p !== '').map((p) => {
      const idx = p.indexOf('=');
      const k = idx < 0 ? p : p.slice(0, idx);
      const v = idx < 0 ? '' : p.slice(idx + 1);
      return { key: safeDecode(k), value: safeDecode(v), enabled: true };
    });
  }
  function splitUrl(url) {
    const hashIdx = url.indexOf('#');
    const noHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
    const qIdx = noHash.indexOf('?');
    return { base: qIdx >= 0 ? noHash.slice(0, qIdx) : noHash, query: qIdx >= 0 ? noHash.slice(qIdx + 1) : '' };
  }
  function prettyJson(s) {
    try { return JSON.stringify(JSON.parse(s), null, 2); } catch (e) { return s; }
  }

  /* ------------------------------------------------------------------ *
   * cURL → 요청 객체
   * ------------------------------------------------------------------ */
  function parseCurl(input) {
    let s = String(input || '').trim();
    s = s.replace(/^\s*(\$|>|PS [^>]*>)\s+/, ''); // 프롬프트 기호 제거
    if (!s) throw new Error('붙여넣은 내용이 비어 있습니다.');
    const shell = detectShell(s);
    const tokens = shell === 'cmd' ? tokenizeCmd(s) : tokenizeBash(s);
    if (!tokens.length) throw new Error('붙여넣은 내용이 비어 있습니다.');
    const first = tokens[0].replace(/^.*[\\/]/, '');
    if (!/^curl(\.exe)?$/i.test(first)) {
      throw new Error('"curl"로 시작하는 명령어를 붙여넣어 주세요. (브라우저 개발자도구 → Network → 요청 우클릭 → Copy as cURL)');
    }

    const warnings = [];
    let method = null;
    let url = null;
    const headers = [];
    const dataParts = [];
    const forms = [];
    const urlQueries = [];
    let user = null;
    let bearer = null;
    let isGet = false;
    let isHead = false;
    let insecure = false;
    let follow = false;
    let proxy = null;
    let proxyUser = null;
    let uploadFile = null;
    let jsonFlag = false;

    function handle(opt, val) {
      switch (opt) {
        case 'request': method = String(val).toUpperCase(); break;
        case 'header': {
          const idx = val.indexOf(':');
          if (idx < 0) {
            if (/;\s*$/.test(val)) headers.push({ key: val.replace(/;\s*$/, '').trim(), value: '', enabled: true });
            break;
          }
          const k = val.slice(0, idx).trim();
          const v = val.slice(idx + 1).trim();
          if (k && v !== '') headers.push({ key: k, value: v, enabled: true });
          break;
        }
        case 'data': case 'data-raw': case 'data-binary':
          if (opt !== 'data-raw' && val.charAt(0) === '@') {
            warnings.push('파일 데이터(' + val + ')는 가져올 수 없어 바디에 파일명만 넣었습니다. 바디 탭에서 내용을 직접 입력해 주세요.');
          }
          dataParts.push(val);
          break;
        case 'data-urlencode': {
          const eq = val.indexOf('=');
          const at = val.indexOf('@');
          if (eq > 0 && (at < 0 || eq < at)) dataParts.push(val.slice(0, eq) + '=' + encodeURIComponent(val.slice(eq + 1)));
          else if (eq === 0) dataParts.push(encodeURIComponent(val.slice(1)));
          else if (at >= 0) { warnings.push('파일 참조(' + val + ')는 가져올 수 없습니다.'); dataParts.push(val); }
          else dataParts.push(encodeURIComponent(val));
          break;
        }
        case 'json': jsonFlag = true; dataParts.push(val); break;
        case 'form': case 'form-string': {
          const eq = val.indexOf('=');
          if (eq < 0) { warnings.push('폼 필드 형식을 알 수 없어 건너뜀: ' + val); break; }
          const name = val.slice(0, eq);
          let value = val.slice(eq + 1);
          if (opt === 'form' && value.charAt(0) === '@') {
            const fname = value.slice(1).split(';')[0];
            forms.push({ key: name, value: '', type: 'file', fileName: fname, enabled: true });
            warnings.push('"' + name + '" 파일 필드(' + fname + ')는 바디 탭에서 파일을 다시 선택해 주세요.');
          } else {
            if (opt === 'form' && value.charAt(0) === '<') warnings.push('"' + name + '" 필드의 파일 내용(<)은 가져올 수 없습니다.');
            if (opt === 'form') value = value.replace(/;type=[^;]*$/, '');
            forms.push({ key: name, value: value, type: 'text', enabled: true });
          }
          break;
        }
        case 'user': user = val; break;
        case 'bearer': bearer = val; break;
        case 'cookie':
          if (val.indexOf('=') >= 0) headers.push({ key: 'Cookie', value: val, enabled: true });
          else warnings.push('쿠키 파일(' + val + ')은 가져올 수 없습니다.');
          break;
        case 'user-agent': headers.push({ key: 'User-Agent', value: val, enabled: true }); break;
        case 'referer': headers.push({ key: 'Referer', value: val, enabled: true }); break;
        case 'url': url = val; break;
        case 'url-query': urlQueries.push(val); break;
        case 'proxy': proxy = val; break;
        case 'proxy-user': proxyUser = val; break;
        case 'upload-file': uploadFile = val; warnings.push('업로드 파일(' + val + ')은 가져올 수 없습니다. 바디 탭에서 직접 입력해 주세요.'); break;
        case 'get': isGet = true; break;
        case 'head': isHead = true; break;
        case 'insecure': insecure = true; break;
        case 'location': follow = true; break;
        default: break;
      }
    }

    for (let i = 1; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok === '--') { if (tokens[i + 1] && !url) url = tokens[i + 1]; break; }
      if (tok.startsWith('--')) {
        let name = tok;
        let inlineVal = null;
        const eq = tok.indexOf('=');
        if (eq > 0 && ARG_OPTS[tok.slice(0, eq)]) { name = tok.slice(0, eq); inlineVal = tok.slice(eq + 1); }
        if (ARG_OPTS[name]) {
          const v = inlineVal !== null ? inlineVal : tokens[++i];
          if (v === undefined) { warnings.push(name + ' 옵션 값이 없습니다.'); break; }
          handle(ARG_OPTS[name], v);
        } else if (FLAG_OPTS[name]) {
          handle(FLAG_OPTS[name]);
        } else if (SKIP_ARG.has(name)) {
          i++;
        }
        continue;
      }
      if (tok.startsWith('-') && tok.length > 1) {
        // 묶음 옵션 (-sSL, -XPOST, -H'..')
        for (let j = 1; j < tok.length; j++) {
          const ch = tok[j];
          const flag = '-' + ch;
          if (SHORT_WITH_ARG.indexOf(ch) >= 0) {
            const rest = tok.slice(j + 1);
            const v = rest !== '' ? rest : tokens[++i];
            if (v === undefined) { warnings.push(flag + ' 옵션 값이 없습니다.'); break; }
            if (ARG_OPTS[flag]) handle(ARG_OPTS[flag], v);
            break;
          }
          if (FLAG_OPTS[flag]) handle(FLAG_OPTS[flag]);
        }
        continue;
      }
      if (!url) url = tok;
    }

    if (!url) throw new Error('요청 주소(URL)를 찾지 못했습니다.');
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = 'http://' + url;

    // --url-query
    if (urlQueries.length) {
      const add = urlQueries.map((q) => {
        const eq = q.indexOf('=');
        return eq > 0 ? q.slice(0, eq) + '=' + encodeURIComponent(q.slice(eq + 1)) : encodeURIComponent(q);
      }).join('&');
      url += (url.indexOf('?') >= 0 ? '&' : '?') + add;
    }

    let body = dataParts.length ? dataParts.join('&') : null;
    if (jsonFlag) {
      if (!headers.some((h) => /^content-type$/i.test(h.key))) headers.push({ key: 'Content-Type', value: 'application/json', enabled: true });
      if (!headers.some((h) => /^accept$/i.test(h.key))) headers.push({ key: 'Accept', value: 'application/json', enabled: true });
    }

    if (isGet && body !== null) {
      url += (url.indexOf('?') >= 0 ? '&' : '?') + body;
      body = null;
    }

    if (!method) {
      if (isHead) method = 'HEAD';
      else if (uploadFile) method = 'PUT';
      else if (body !== null || forms.length) method = 'POST';
      else method = 'GET';
    }

    // 인증
    const auth = { type: 'none', bearer: '', username: '', password: '', apiKeyName: 'X-API-Key', apiKeyValue: '', apiKeyIn: 'header' };
    if (user !== null) {
      const idx = user.indexOf(':');
      auth.type = 'basic';
      auth.username = idx < 0 ? user : user.slice(0, idx);
      auth.password = idx < 0 ? '' : user.slice(idx + 1);
    }
    if (bearer) { auth.type = 'bearer'; auth.bearer = bearer; }
    const authIdx = headers.findIndex((h) => /^authorization$/i.test(h.key));
    if (authIdx >= 0 && auth.type === 'none') {
      const v = headers[authIdx].value;
      let m = /^Bearer\s+(.+)$/i.exec(v);
      if (m) {
        auth.type = 'bearer'; auth.bearer = m[1].trim();
        headers.splice(authIdx, 1);
      } else if ((m = /^Basic\s+(.+)$/i.exec(v))) {
        const dec = b64decode(m[1].trim());
        if (dec !== null && dec.indexOf(':') >= 0) {
          const i2 = dec.indexOf(':');
          auth.type = 'basic'; auth.username = dec.slice(0, i2); auth.password = dec.slice(i2 + 1);
          headers.splice(authIdx, 1);
        }
      }
    }

    // 바디 분류
    const ctHeader = headers.find((h) => /^content-type$/i.test(h.key));
    const ct = ctHeader ? ctHeader.value.toLowerCase() : '';
    const bodyObj = { mode: 'none', raw: '', rawType: 'text/plain', form: [], multipart: [] };
    if (forms.length) {
      bodyObj.mode = 'multipart';
      bodyObj.multipart = forms;
      if (ctHeader && /multipart\/form-data/i.test(ctHeader.value)) headers.splice(headers.indexOf(ctHeader), 1);
    } else if (body !== null) {
      if (/json/.test(ct) || (!ct && looksLikeJson(body))) {
        bodyObj.mode = 'json';
        bodyObj.raw = prettyJson(body);
        if (!ct) warnings.push('Content-Type이 없어 JSON 바디로 인식했습니다. (원래 curl은 form 형식으로 전송)');
      } else if ((/x-www-form-urlencoded/.test(ct) || !ct) && looksLikeUrlEncoded(body)) {
        bodyObj.mode = 'form';
        bodyObj.form = parseQueryPairs(body);
      } else {
        bodyObj.mode = 'raw';
        bodyObj.raw = body;
        bodyObj.rawType = ctHeader ? ctHeader.value : 'text/plain';
      }
    }

    const parts = splitUrl(url);
    const result = {
      method: method,
      url: url,
      params: parseQueryPairs(parts.query),
      headers: headers,
      body: bodyObj,
      auth: auth,
      options: { insecure: insecure, followRedirects: follow }
    };
    if (proxy) {
      result.proxy = { url: proxy, username: '', password: '' };
      if (proxyUser) {
        const i3 = proxyUser.indexOf(':');
        result.proxy.username = i3 < 0 ? proxyUser : proxyUser.slice(0, i3);
        result.proxy.password = i3 < 0 ? '' : proxyUser.slice(i3 + 1);
      }
    }
    return { request: result, warnings: warnings, shell: shell };
  }

  /* ------------------------------------------------------------------ *
   * 요청 → cURL (resolved = {method, url, headers:[[k,v]], body:string|null, multipart:[], insecure})
   * ------------------------------------------------------------------ */
  function quoteBash(str) {
    if (str === '') return "''";
    if (/^[A-Za-z0-9_\-.,:\/@=+%]+$/.test(str)) return str;
    if (/[\x00-\x08\x0b-\x1f\x7f]/.test(str)) {
      return "$'" + str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
        .replace(/[\x00-\x1f\x7f]/g, (c) => '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0')) + "'";
    }
    return "'" + str.replace(/'/g, "'\\''") + "'";
  }
  function quoteCmd(str) {
    // MSVCRT 규칙: 따옴표 앞(및 끝)의 역슬래시만 두 배로
    return '^"' + str
      .replace(/(\\*)"/g, '$1$1\\"')
      .replace(/(\\+)$/, '$1$1')
      .replace(/[^a-zA-Z0-9\s_\-:=+~'\/.,?;()*`]/g, '^$&')
      .replace(/%(?=[a-zA-Z0-9_])/g, '%^')
      .replace(/\r?\n/g, '^\n\n') + '^"';
  }

  function toCurl(r, shell) {
    const q = shell === 'cmd' ? quoteCmd : quoteBash;
    const nl = shell === 'cmd' ? ' ^\n  ' : ' \\\n  ';
    const parts = ['curl ' + q(r.url)];
    const hasBody = (r.body !== null && r.body !== undefined) || (r.multipart && r.multipart.length);
    if (r.method !== 'GET' && !(r.method === 'POST' && hasBody)) parts.push('-X ' + r.method);
    (r.headers || []).forEach((h) => {
      if (r.multipart && r.multipart.length && /^content-type$/i.test(h[0])) return;
      parts.push('-H ' + q(h[0] + ': ' + h[1]));
    });
    if (r.multipart && r.multipart.length) {
      r.multipart.forEach((p) => {
        if (p.filename) parts.push('-F ' + q(p.name + '=@' + p.filename));
        else parts.push('--form-string ' + q(p.name + '=' + p.value));
      });
    } else if (r.body !== null && r.body !== undefined) {
      parts.push('--data-raw ' + q(r.body));
    }
    if (r.insecure) parts.push('--insecure');
    if (r.followRedirects) parts.push('--location');
    return parts.join(nl);
  }

  return {
    parseCurl: parseCurl,
    toCurl: toCurl,
    tokenizeBash: tokenizeBash,
    tokenizeCmd: tokenizeCmd,
    detectShell: detectShell,
    parseQueryPairs: parseQueryPairs,
    splitUrl: splitUrl,
    b64encode: b64encode
  };
});
