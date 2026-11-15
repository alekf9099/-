'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../public/js/engine.js');

const okRes = (body, extra) => Object.assign({
  ok: true, status: 200, statusText: 'OK', timeMs: 42, size: 100, bodyEncoding: 'utf8',
  headers: [['Content-Type', 'application/json'], ['Set-Cookie', 'sid=abc; Path=/; HttpOnly'], ['X-Trace', 't1']],
  body: typeof body === 'string' ? body : JSON.stringify(body)
}, extra || {});

test('변수 스코프 우선순위와 동적 변수', () => {
  const vars = { globals: { a: 'g', b: 'g' }, collection: { b: 'c' }, environment: { c: 'e' }, data: {}, local: {} };
  assert.equal(E.substitute('{{a}}-{{b}}-{{c}}-{{x}}', vars), 'g-c-e-{{x}}');
  vars.local.a = 'L';
  assert.equal(E.substitute('{{a}}', vars), 'L');
  assert.match(E.substitute('{{$guid}}', vars), /^[0-9a-f-]{36}$/);
  assert.match(E.substitute('{{$timestamp}}', vars), /^\d{10}$/);
  const missing = new Set();
  E.substitute('{{nope}}', vars, missing);
  assert.deepEqual([...missing], ['nope']);
});

test('경로 변수, 상속 인증, GraphQL, 쿠키', () => {
  const req = E.normalizeRequest({
    method: 'POST', url: '{{host}}/users/:id/posts/:postId?x=1', pathVars: [{ key: 'id', value: '{{uid}}' }, { key: 'postId', value: '7' }],
    body: { mode: 'graphql', graphql: { query: 'query { me { id } }', variables: '{"n": {{n}}}' } }
  });
  assert.deepEqual(E.pathVarNames(req.url), ['id', 'postId']);
  const jar = [];
  E.storeCookies(jar, [['Set-Cookie', 'sid=abc; Path=/']], 'http://api.test/login');
  const r = E.resolveRequest(req, { environment: { host: 'http://api.test', uid: 'u 1', n: '3' } }, { parentAuth: { type: 'bearer', bearer: 'T' }, cookieJar: jar });
  assert.equal(r.url, 'http://api.test/users/u%201/posts/7?x=1');
  assert.deepEqual(JSON.parse(r.bodyText), { query: 'query { me { id } }', variables: { n: 3 } });
  assert.ok(r.headers.some(([k, v]) => k === 'Authorization' && v === 'Bearer T'));
  assert.ok(r.headers.some(([k, v]) => k === 'Cookie' && v === 'sid=abc'));
  // 포트 번호는 경로 변수로 오인하지 않음
  assert.deepEqual(E.pathVarNames('http://localhost:8080/a/:b'), ['b']);
});

test('JSON 경로', () => {
  const j = { data: { items: [{ id: 1 }, { id: 2, 'my key': 'v' }] } };
  assert.equal(E.jsonPath(j, '$.data.items[1].id').value, 2);
  assert.equal(E.jsonPath(j, 'data.items[-1].id').value, 2);
  assert.equal(E.jsonPath(j, 'data.items.length').value, 2);
  assert.equal(E.jsonPath(j, "data.items[1]['my key']").value, 'v');
  assert.equal(E.jsonPath(j, 'data.nope').found, false);
});

test('pm 스크립트: test/expect/변수/응답/구버전 문법', async () => {
  const code = `
    pm.test("상태 200", () => pm.response.to.have.status(200));
    pm.test("ok", () => pm.response.to.be.ok);
    pm.test("헤더", () => pm.response.to.have.header("x-trace", "t1"));
    pm.test("JSON", () => { const j = pm.response.json(); pm.expect(j.user).to.have.property("name", "QA"); pm.expect(j.list).to.be.an("array").with.lengthOf(3); });
    pm.test("실패해야 함", () => pm.expect(pm.response.json().user.age).to.be.above(30));
    pm.test("deep", () => pm.expect(pm.response.json().list).to.deep.equal([1,2,3]));
    pm.test("not include", () => pm.expect("abc").to.not.include("z"));
    pm.environment.set("token", pm.response.json().token);
    pm.globals.set("g", 1);
    pm.collectionVariables.set("c", {a: 1});
    tests["구버전"] = responseCode.code === 200;
    console.log("hello", {x: 1});
  `;
  const res = okRes({ token: 'TK', user: { name: 'QA', age: 20 }, list: [1, 2, 3] });
  const out = await E.executeScript(code, { event: 'test', vars: { environment: {}, globals: {}, collection: {} }, response: res });
  assert.equal(out.error, null);
  const byName = Object.fromEntries(out.tests.map((t) => [t.name, t]));
  ['상태 200', 'ok', '헤더', 'JSON', 'deep', 'not include', '구버전'].forEach((n) => assert.equal(byName[n].passed, true, n + ': ' + byName[n].error));
  assert.equal(byName['실패해야 함'].passed, false);
  assert.match(byName['실패해야 함'].error, /30보다 커야/);
  assert.equal(out.vars.environment.token, 'TK');
  assert.equal(out.vars.globals.g, '1');
  assert.equal(out.vars.collection.c, '{"a":1}');
  assert.equal(out.logs[0].text, 'hello {"x":1}');
});

test('pm 스크립트: pre-request 헤더 변경, 문법 오류, sendRequest', async () => {
  const pre = await E.executeScript('pm.request.headers.upsert({key:"X-A", value:"1"}); pm.variables.set("n", 5);', { event: 'prerequest', vars: {}, request: { url: 'http://x', method: 'GET', headers: [] } });
  assert.deepEqual(pre.request.headers, [{ key: 'X-A', value: '1', enabled: true }]);
  assert.equal(pre.vars.local.n, '5');
  const bad = await E.executeScript('pm.test("x", () => {', { event: 'test', vars: {} });
  assert.match(bad.error, /문법 오류/);
  const sent = [];
  const sr = await E.executeScript('pm.sendRequest("http://auth/{{p}}", (err, res) => { pm.environment.set("t", res.json().token); });',
    { event: 'prerequest', vars: { environment: { p: 'login' } } },
    { sendRequest: async (r) => { sent.push(r.url); return okRes({ token: 'Z' }); } });
  assert.deepEqual(sent, ['http://auth/login']);
  assert.equal(sr.vars.environment.t, 'Z');
});

test('노코드 검증 & 변수 추출', () => {
  const res = okRes({ data: { id: 7, tags: ['a', 'b'], ok: true } });
  const ev = (target, op, value, path) => E.evalAssertion({ target, op, value, path }, res, {}).passed;
  assert.equal(ev('status', 'eq', '200'), true);
  assert.equal(ev('status', 'in', '200, 201'), true);
  assert.equal(ev('time', 'lt', '100'), true);
  assert.equal(ev('json', 'eq', '7', '$.data.id'), true);
  assert.equal(ev('json', 'eq', 'true', 'data.ok'), true);
  assert.equal(ev('json', 'contains', 'b', 'data.tags'), true);
  assert.equal(ev('json', 'type', 'array', 'data.tags'), true);
  assert.equal(ev('json', 'exists', '', 'data.nope'), false);
  assert.equal(ev('json', 'notExists', '', 'data.nope'), true);
  assert.equal(ev('header', 'contains', 'json', 'content-type'), true);
  assert.equal(ev('body', 'regex', '"id":\\s*7'), true);
  const fail = E.evalAssertion({ target: 'status', op: 'eq', value: '201' }, res, {});
  assert.equal(fail.passed, false);
  assert.equal(fail.error, '실제값: 200');
  assert.equal(fail.name, '상태 코드 = 201');
  assert.equal(E.evalExtraction({ from: 'json', path: 'data.id' }, res).value, '7');
  assert.equal(E.evalExtraction({ from: 'json', path: 'data.tags' }, res).value, '["a","b"]');
  assert.equal(E.evalExtraction({ from: 'header', path: 'x-trace' }, res).value, 't1');
  assert.equal(E.evalExtraction({ from: 'json', path: 'nope' }, res).ok, false);
});

test('러너: 토큰 체이닝, 데이터 파일 반복, bail, setNextRequest, 리포트', async () => {
  const login = E.normalizeRequest({ name: '로그인', method: 'POST', url: '{{host}}/login', extracts: [{ varName: 'token', from: 'json', path: 'token', scope: 'environment' }],
    assertions: [{ target: 'status', op: 'eq', value: '200' }] });
  const me = E.normalizeRequest({ name: '내 정보', url: '{{host}}/me?u={{user}}', auth: { type: 'inherit' },
    testScript: 'pm.test("이름", () => pm.expect(pm.response.json().name).to.eql(pm.iterationData.get("user")));' });
  const seen = [];
  const transport = async (r) => {
    seen.push(r.method + ' ' + r.url + ' ' + ((r.headers.find(([k]) => k === 'Authorization') || [])[1] || '-'));
    if (r.url.endsWith('/login')) return okRes({ token: 'TOK' });
    const u = new URL(r.url).searchParams.get('u');
    return okRes({ name: u === 'bob' ? 'BOB' : u });
  };
  const sandbox = (code, ctx) => E.executeScript(code, ctx, {});
  const items = [login, me].map((req) => ({ req, parent: { name: 'API', auth: { type: 'bearer', bearer: '{{token}}' } } }));
  const sum = await E.runCollection(items, { data: E.parseCsv('user\nalice\n"bob"\n'), vars: { environment: { host: 'http://h' } } }, { transport, sandbox });
  assert.equal(sum.iterations, 2);
  assert.equal(sum.stats.requests, 4);
  assert.equal(sum.stats.failed, 1); // bob → BOB 불일치
  assert.equal(sum.vars.environment.token, 'TOK');
  assert.ok(seen[1].endsWith('Bearer TOK'));
  const junit = E.toJUnit(sum, 'Suite');
  assert.match(junit, /<testsuites name="Suite" tests="4" failures="1"/);
  assert.match(junit, /<failure message="기대값 &quot;bob&quot;, 실제값 &quot;BOB&quot;"/);
  assert.match(E.toHtmlReport(sum, 'R'), /<h1>R<\/h1>/);
  assert.match(E.toMarkdown(sum, 'M', true), /내 정보/);

  const bail = await E.runCollection(items, { data: [{ user: 'bob' }, { user: 'x' }], bail: true, vars: { environment: { host: 'http://h' } } }, { transport, sandbox });
  assert.equal(bail.stats.requests, 2);
  assert.equal(bail.stopped, true);

  const jump = E.normalizeRequest({ name: 'A', url: 'http://h/login', testScript: 'postman.setNextRequest(null);' });
  const s2 = await E.runCollection([jump, me].map((req) => ({ req })), { vars: {} }, { transport, sandbox });
  assert.equal(s2.stats.requests, 1);
});

test('CSV 파서 (따옴표, 줄바꿈, BOM)', () => {
  const rows = E.parseCsv('﻿name,memo\r\n"Kim, A","line1\nline2"\r\nLee,"say ""hi"""\r\n');
  assert.deepEqual(rows, [{ name: 'Kim, A', memo: 'line1\nline2' }, { name: 'Lee', memo: 'say "hi"' }]);
  assert.deepEqual(E.parseDataFile('[{"a":1,"b":{"c":2}}]', 'd.json'), [{ a: '1', b: '{"c":2}' }]);
});

test('Postman 변환 왕복 (스크립트·인증·폴더·노코드 검증)', async () => {
  const pm = {
    info: { name: 'Shop', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}' }] },
    variable: [{ key: 'host', value: 'http://h' }],
    item: [
      { name: 'Ping', request: { method: 'GET', url: { raw: '{{host}}/ping' } }, event: [{ listen: 'test', script: { exec: ['pm.test("ok", function(){ pm.response.to.have.status(200); });'] } }] },
      { name: 'Users', item: [{ name: 'Get user', request: { method: 'GET', url: { raw: '{{host}}/users/:id', variable: [{ key: 'id', value: '3' }] }, auth: { type: 'noauth' } } }] }
    ]
  };
  const cols = E.fromPostman(pm);
  assert.deepEqual(cols.map((c) => c.name), ['Shop', 'Shop / Users']);
  assert.equal(cols[0].auth.type, 'bearer');
  assert.equal(cols[0].requests[0].auth.type, 'inherit');
  assert.match(cols[0].requests[0].testScript, /have\.status\(200\)/);
  assert.equal(cols[1].requests[0].auth.type, 'none');
  assert.deepEqual(cols[1].requests[0].pathVars, [{ key: 'id', value: '3', enabled: true }]);
  assert.equal(cols[0].variables[0].key, 'host');

  // 노코드 검증이 스크립트로 변환되어도 같은 결과
  cols[0].requests[0].assertions = [{ target: 'json', op: 'eq', path: '$.items[0].id', value: '5' }, { target: 'status', op: 'lt', value: '300' }];
  cols[0].requests[0].extracts = [{ varName: 'firstId', from: 'json', path: 'items[0].id', scope: 'environment' }];
  const back = E.toPostman(cols[0]);
  const script = back.item[0].event.find((e) => e.listen === 'test').script.exec.join('\n');
  const out = await E.executeScript(script, { event: 'test', vars: { environment: {} }, response: okRes({ items: [{ id: 5 }] }) });
  assert.equal(out.error, null);
  assert.deepEqual(out.tests.map((t) => t.passed), [true, true, true]);
  assert.equal(out.vars.environment.firstId, '5');
  assert.equal(back.auth.type, 'bearer');
});

test('쿠키 저장소: 도메인/경로/만료', () => {
  const jar = [];
  E.storeCookies(jar, [['set-cookie', 'a=1; Domain=.ex.com; Path=/'], ['set-cookie', 'b=2; Path=/admin'], ['set-cookie', 'c=3; Max-Age=0']], 'https://api.ex.com/login');
  assert.equal(jar.length, 2);
  assert.equal(E.cookieHeaderFor(jar, 'https://www.ex.com/'), 'a=1');
  assert.equal(E.cookieHeaderFor(jar, 'https://api.ex.com/admin/x'), 'b=2; a=1');
  E.storeCookies(jar, [['set-cookie', 'a=; Domain=.ex.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT']], 'https://api.ex.com/');
  assert.equal(E.cookieHeaderFor(jar, 'https://www.ex.com/'), '');
});
