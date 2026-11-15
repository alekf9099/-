'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCurl, toCurl } = require('../public/js/curl.js');

const hv = (req, name) => (req.headers.find((h) => h.key.toLowerCase() === name.toLowerCase()) || {}).value;

test('단순 GET + 쿼리 파라미터 추출', () => {
  const { request } = parseCurl("curl 'https://api.example.com/users?page=2&size=10'");
  assert.equal(request.method, 'GET');
  assert.equal(request.url, 'https://api.example.com/users?page=2&size=10');
  assert.deepEqual(request.params.map((p) => [p.key, p.value]), [['page', '2'], ['size', '10']]);
});

test('크롬 Copy as cURL (bash) - JSON POST', () => {
  const input = `curl 'https://api.example.com/v1/orders' \\
  -H 'accept: application/json, text/plain, */*' \\
  -H 'authorization: Bearer abc.def.ghi' \\
  -H 'content-type: application/json' \\
  --data-raw '{"item":"커피","qty":2,"memo":"it'\\''s hot"}' \\
  --compressed`;
  const { request, shell } = parseCurl(input);
  assert.equal(shell, 'bash');
  assert.equal(request.method, 'POST');
  assert.equal(request.auth.type, 'bearer');
  assert.equal(request.auth.bearer, 'abc.def.ghi');
  assert.equal(hv(request, 'authorization'), undefined);
  assert.equal(request.body.mode, 'json');
  assert.deepEqual(JSON.parse(request.body.raw), { item: '커피', qty: 2, memo: "it's hot" });
});

test("크롬 bash - $'..' ANSI-C 바디", () => {
  const input = `curl 'https://x.io/a' -H 'content-type: text/plain' --data-raw $'line1\\nline2 \\u00e9 \\'q\\''`;
  const { request } = parseCurl(input);
  assert.equal(request.body.mode, 'raw');
  assert.equal(request.body.raw, "line1\nline2 é 'q'");
});

test('크롬 Copy as cURL (cmd) - 윈도우', () => {
  const input = `curl ^"https://api.example.com/v1/orders?x=1^&y=2^" ^
  -H ^"accept: application/json^" ^
  -H ^"content-type: application/json^" ^
  --data-raw ^"^{^\\^"item^\\^":^\\^"coffee^\\^",^\\^"qty^\\^":2^}^" ^
  --compressed`;
  const { request, shell } = parseCurl(input);
  assert.equal(shell, 'cmd');
  assert.equal(request.method, 'POST');
  assert.equal(request.url, 'https://api.example.com/v1/orders?x=1&y=2');
  assert.deepEqual(JSON.parse(request.body.raw), { item: 'coffee', qty: 2 });
});

test('윈도우 사용자가 직접 작성한 cmd 형식 (\\" 이스케이프)', () => {
  const input = 'curl -X PUT "http://localhost:3000/items/1" -H "Content-Type: application/json" -d "{\\"name\\":\\"a b\\"}"';
  const { request } = parseCurl(input);
  assert.equal(request.method, 'PUT');
  assert.deepEqual(JSON.parse(request.body.raw), { name: 'a b' });
});

test('form-urlencoded, 묶음 옵션(-sSLX), -u 기본 인증', () => {
  const { request } = parseCurl("curl -sSLXPATCH https://x.io/login -u admin:p@ss -d 'id=kim&pw=a%20b'");
  assert.equal(request.method, 'PATCH');
  assert.equal(request.options.followRedirects, true);
  assert.equal(request.auth.type, 'basic');
  assert.equal(request.auth.username, 'admin');
  assert.equal(request.auth.password, 'p@ss');
  assert.equal(request.body.mode, 'form');
  assert.deepEqual(request.body.form.map((p) => [p.key, p.value]), [['id', 'kim'], ['pw', 'a b']]);
});

test('멀티파트 -F + 파일 필드 경고', () => {
  const { request, warnings } = parseCurl("curl https://x.io/up -F 'title=hello' -F 'file=@/tmp/a.png;type=image/png'");
  assert.equal(request.method, 'POST');
  assert.equal(request.body.mode, 'multipart');
  assert.equal(request.body.multipart[0].value, 'hello');
  assert.equal(request.body.multipart[1].type, 'file');
  assert.equal(request.body.multipart[1].fileName, '/tmp/a.png');
  assert.ok(warnings.length >= 1);
});

test('-G 는 데이터를 쿼리로 이동', () => {
  const { request } = parseCurl("curl -G https://x.io/search --data-urlencode 'q=한글 검색' -d lang=ko");
  assert.equal(request.method, 'GET');
  assert.equal(request.body.mode, 'none');
  assert.deepEqual(request.params.map((p) => [p.key, p.value]), [['q', '한글 검색'], ['lang', 'ko']]);
});

test('스킴 없는 URL, -I(HEAD), 쿠키, 파이프 무시', () => {
  const { request } = parseCurl("curl -I example.com/a -b 'sid=1; t=2' | head");
  assert.equal(request.method, 'HEAD');
  assert.equal(request.url, 'http://example.com/a');
  assert.equal(hv(request, 'cookie'), 'sid=1; t=2');
});

test('--json, 프록시, --insecure', () => {
  const { request } = parseCurl(`curl --json '{"a":1}' -x http://10.0.0.1:3128 -U u:p -k https://x.io`);
  assert.equal(request.method, 'POST');
  assert.equal(hv(request, 'content-type'), 'application/json');
  assert.equal(request.proxy.url, 'http://10.0.0.1:3128');
  assert.equal(request.proxy.username, 'u');
  assert.equal(request.options.insecure, true);
});

test('curl 이 아니면 친절한 오류', () => {
  assert.throws(() => parseCurl('wget https://x.io'), /curl/);
  assert.throws(() => parseCurl("curl 'https://x.io"), /따옴표/);
});

test('내보내기 → 다시 가져오기 왕복 (bash, cmd)', () => {
  const resolved = {
    method: 'POST',
    url: 'https://x.io/a?q=1&r=%20',
    headers: [['Content-Type', 'application/json'], ['X-Note', 'it\'s "ok" & 100%']],
    body: '{"msg":"줄1\\n줄2","p":"a^b|c<d>"}',
    multipart: null
  };
  for (const shell of ['bash', 'cmd']) {
    const cmd = toCurl(resolved, shell);
    const { request } = parseCurl(cmd);
    assert.equal(request.method, 'POST', shell);
    assert.equal(request.url, resolved.url, shell);
    assert.equal(hv(request, 'x-note'), 'it\'s "ok" & 100%', shell);
    assert.deepEqual(JSON.parse(request.body.raw), JSON.parse(resolved.body), shell);
  }
});

test('여러 줄 바디 cmd 왕복', () => {
  const resolved = { method: 'PUT', url: 'http://h/x', headers: [['Content-Type', 'text/plain']], body: 'a\nb\n"c"', multipart: null };
  const { request } = parseCurl(toCurl(resolved, 'cmd'));
  assert.equal(request.method, 'PUT');
  assert.equal(request.body.raw, 'a\nb\n"c"');
});
