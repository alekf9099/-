'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../public/js/engine.js');

const res = (body, extra) => Object.assign({ ok: true, status: 200, statusText: 'OK', timeMs: 10, size: 10, bodyEncoding: 'utf8', headers: [], body: typeof body === 'string' ? body : JSON.stringify(body) }, extra || {});

test('JSON 스키마: 타입·필수·형식·enum·$ref·nullable·oneOf·additionalProperties', () => {
  const root = {
    type: 'object', required: ['id', 'email', 'tags'], additionalProperties: false,
    properties: {
      id: { type: 'integer', minimum: 1 }, email: { type: 'string', format: 'email' },
      role: { enum: ['admin', 'user'] }, tags: { type: 'array', items: { $ref: '#/defs/tag' }, minItems: 1 },
      memo: { type: 'string', nullable: true }, price: { oneOf: [{ type: 'integer' }, { type: 'string', pattern: '^\\d+원$' }] }
    },
    defs: { tag: { type: 'string', maxLength: 5 } }
  };
  assert.deepEqual(E.validateSchema({ id: 1, email: 'a@b.co', tags: ['x'], memo: null, price: '100원' }, root), []);
  const errs = E.validateSchema({ id: 0, email: 'nope', role: 'guest', tags: ['toolong'], extra: 1, price: 1.5 }, root);
  const paths = errs.map((e) => e.path);
  assert.ok(paths.includes('$.id') && paths.includes('$.email') && paths.includes('$.role') && paths.includes('$.tags[0]') && paths.includes('$.extra') && paths.includes('$.price'), JSON.stringify(errs));
  assert.match(E.validateSchema({ id: 'x', email: 'a@b.co', tags: [] }, root)[0].message, /integer/);
});

test('스키마 검증: pm.response.to.have.jsonSchema · tv4 · 노코드', async () => {
  const schema = { type: 'object', required: ['name'], properties: { name: { type: 'string' } } };
  const out = await E.executeScript(`
    pm.test("ok", () => pm.response.to.have.jsonSchema(${JSON.stringify(schema)}));
    pm.test("bad", () => pm.expect({ name: 1 }).to.have.jsonSchema(${JSON.stringify(schema)}));
    pm.test("tv4", () => pm.expect(tv4.validate(pm.response.json(), ${JSON.stringify(schema)})).to.be.true);
  `, { event: 'test', vars: {}, response: res({ name: 'kim' }) });
  assert.deepEqual(out.tests.map((t) => t.passed), [true, false, true]);
  assert.match(out.tests[1].error, /\$\.name/);
  const a = { target: 'schema', op: 'schema', value: JSON.stringify(schema), path: '$.data' };
  assert.equal(E.evalAssertion(a, res({ data: { name: 'x' } }), {}).passed, true);
  const f = E.evalAssertion(a, res({ data: {} }), {});
  assert.equal(f.passed, false);
  assert.match(f.error, /필수 속성/);
  assert.equal(E.assertionName(a), 'JSON 스키마 일치 ($.data)');
});

test('기준 응답 비교: 제외 경로(와일드카드) 지원', () => {
  const base = { status: 200, body: JSON.stringify({ id: 1, updatedAt: 'A', items: [{ id: 1, v: 'x' }, { id: 2, v: 'y' }] }) };
  const cur = res({ id: 1, updatedAt: 'B', items: [{ id: 9, v: 'x' }, { id: 8, v: 'z' }] });
  const a = (value) => ({ target: 'baseline', op: 'eq', value });
  const r1 = E.evalAssertion(a(''), cur, {}, { baseline: base });
  assert.equal(r1.passed, false);
  assert.equal(r1.details.length, 4);
  const r2 = E.evalAssertion(a('$.updatedAt, items[*].id'), cur, {}, { baseline: base });
  assert.equal(r2.passed, false);
  assert.deepEqual(r2.details.map((d) => d.path), ['$.items[1].v']);
  assert.equal(E.evalAssertion(a('updatedAt, $.items'), cur, {}, { baseline: base }).passed, true);
  assert.equal(E.evalAssertion(a(''), cur, {}, {}).passed, false);
  assert.equal(E.compareResponses({ status: 200, body: 'a\nb' }, res('a\nc'))[0].path, '본문 2번째 줄부터 다름');
});

test('OAuth 2.0: 토큰 자동 발급·캐시·만료 후 재발급', async () => {
  const calls = [];
  let n = 0;
  const transport = async (r) => {
    calls.push(r.method + ' ' + r.url + ' ' + (r.bodyText || '') + ' ' + ((r.headers.find(([k]) => k === 'Authorization') || [])[1] || ''));
    if (r.url.endsWith('/token')) return res({ access_token: 'T' + (++n), token_type: 'Bearer', expires_in: n === 1 ? 5 : 3600 });
    return res({ ok: true });
  };
  const auth = { type: 'oauth2', oauthGrant: 'client_credentials', tokenUrl: '{{h}}/token', clientId: 'cid', clientSecret: 'sec', scope: 'read', clientAuth: 'header' };
  const items = [{ req: E.normalizeRequest({ name: 'a', url: '{{h}}/a', auth: { type: 'inherit' } }), parent: { auth } }];
  const ctx = { vars: { environment: { h: 'http://x' } }, oauthCache: {} };
  await E.runItem(items[0], ctx, { transport });
  await E.runItem(items[0], ctx, { transport });
  // 첫 토큰은 expires_in 5초 → (5s - 10s 여유) 이미 만료 처리되어 두 번째 요청에서 재발급
  assert.equal(calls.filter((c) => c.includes('/token')).length, 2);
  assert.ok(calls[0].includes('grant_type=client_credentials') && calls[0].includes('Basic Y2lkOnNlYw=='));
  assert.ok(calls[3].endsWith('Bearer T2'));
  await E.runItem(items[0], ctx, { transport });
  assert.equal(calls.filter((c) => c.includes('/token')).length, 2, '유효한 토큰은 재사용');
  const bad = await E.runItem({ req: items[0].req, parent: { auth: Object.assign({}, auth, { tokenUrl: '' }) } }, { vars: {}, oauthCache: {} }, { transport });
  assert.equal(bad.error.code, 'OAUTH');
});

test('OpenAPI 3 → 컬렉션 (태그 분리·경로/쿼리 변수·바디 예시·인증·스키마 검증)', () => {
  const spec = {
    openapi: '3.0.3', info: { title: 'Shop', version: '1' },
    servers: [{ url: 'https://{env}.shop.com/v1', variables: { env: { default: 'api' } } }],
    security: [{ bearer: [] }],
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
      schemas: { Item: { type: 'object', required: ['id', 'name'], properties: { id: { type: 'integer', readOnly: true }, name: { type: 'string', example: '커피' }, price: { type: 'number' } } } }
    },
    paths: {
      '/items/{id}': {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer', example: 7 } }],
        get: { tags: ['items'], summary: '상품 조회', parameters: [{ name: 'fields', in: 'query', schema: { type: 'string' } }, { name: 'lang', in: 'query', required: true, schema: { default: 'ko' } }],
          responses: { 200: { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/Item' } } } } } }
      },
      '/items': { post: { tags: ['items'], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Item' } } } }, responses: { 201: { description: 'c' }, 200: { description: 'o' } } } },
      '/health': { get: { tags: ['ops'], security: [], responses: { 204: { description: 'n' } } } }
    }
  };
  const cols = E.fromOpenAPI(spec);
  assert.equal(cols.meta.endpoints, 3);
  assert.deepEqual(cols.map((c) => c.name), ['Shop / items', 'Shop / ops']);
  assert.equal(cols[0].variables.find((v) => v.key === 'baseUrl').value, 'https://api.shop.com/v1');
  assert.equal(cols[0].auth.type, 'bearer');
  const get = cols[0].requests[0];
  assert.equal(get.url, '{{baseUrl}}/items/:id?lang=ko');
  assert.deepEqual(get.pathVars, [{ key: 'id', value: '7', enabled: true }]);
  assert.equal(get.params.find((p) => p.key === 'fields').enabled, false);
  assert.equal(get.auth.type, 'inherit');
  const schemaA = get.assertions.find((a) => a.target === 'schema');
  assert.equal(E.evalAssertion(schemaA, res({ id: 1, name: 'x' }), {}).passed, true);
  assert.equal(E.evalAssertion(schemaA, res({ id: 1 }), {}).passed, false);
  const post = cols[0].requests[1];
  assert.deepEqual(JSON.parse(post.body.raw), { name: '커피', price: 0 });
  assert.equal(post.assertions[0].op, 'in');
  assert.equal(cols[1].requests[0].auth.type, 'none');
  // 내보내기 시 스키마 검증이 Postman 스크립트로 변환되어 동작
  const pm = E.toPostman(cols[0]);
  assert.match(pm.item[0].event[0].script.exec.join('\n'), /jsonSchema/);
});

test('Swagger 2.0 → 컬렉션 (body/formData/oauth2)', () => {
  const cols = E.fromOpenAPI({
    swagger: '2.0', info: { title: 'Old' }, host: 'old.api.com', basePath: '/v2', schemes: ['http'],
    securityDefinitions: { o: { type: 'oauth2', flow: 'password', tokenUrl: 'http://old.api.com/oauth/token', scopes: { read: '', write: '' } } },
    security: [{ o: ['read'] }],
    paths: { '/upload': { post: { consumes: ['multipart/form-data'], parameters: [{ name: 'file', in: 'formData', type: 'file' }, { name: 'title', in: 'formData', type: 'string', 'x-example': 'hi' }], responses: { 200: { description: 'ok', schema: { type: 'object' } } } } } }
  });
  assert.equal(cols[0].variables[0].value, 'http://old.api.com/v2');
  assert.equal(cols[0].auth.type, 'oauth2');
  assert.equal(cols[0].auth.oauthGrant, 'password');
  assert.equal(cols[0].auth.scope, 'read write');
  const r = cols[0].requests[0];
  assert.equal(r.body.mode, 'multipart');
  assert.deepEqual(r.body.multipart.map((x) => x.type + ':' + x.value), ['file:', 'text:hi']);
});

test('성능 테스트: VU 동시 실행·백분위·요청별 통계·검증 실패율', async () => {
  let inflight = 0;
  let peak = 0;
  const transport = async (r) => {
    inflight++; peak = Math.max(peak, inflight);
    await new Promise((ok) => setTimeout(ok, 5));
    inflight--;
    return r.url.endsWith('/bad') ? { ok: false, error: { code: 'X', message: 'down' }, timeMs: 5 } : res({ v: 1 }, { timeMs: r.url.endsWith('/slow') ? 50 : 5 });
  };
  const items = [
    { req: E.normalizeRequest({ id: 'f', name: 'fast', url: 'http://h/fast', assertions: [{ target: 'json', op: 'eq', path: '$.v', value: '2' }] }) },
    { req: E.normalizeRequest({ id: 's', name: 'slow', url: 'http://h/slow' }) },
    { req: E.normalizeRequest({ id: 'b', name: 'bad', url: 'http://h/bad' }) }
  ];
  const ticks = [];
  const sum = await E.runLoad(items, { vus: 4, duration: 1.2, iterations: 3, vars: {} }, { transport }, { onTick: (s) => ticks.push(s) });
  assert.equal(sum.total.count, 4 * 3 * 3);
  assert.ok(peak >= 3, 'peak concurrency ' + peak);
  const by = Object.fromEntries(sum.byRequest.map((r) => [r.name, r]));
  assert.equal(by.slow.p95, 50);
  assert.equal(by.bad.errors, 12);
  assert.equal(by.fast.failedChecks, 12);
  assert.equal(sum.statuses.ERR, 12);
  assert.ok(sum.rps > 0 && sum.timeline.length >= 1);
  assert.equal(E.percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
  assert.match(E.loadToMarkdown(sum, 'T'), /p95/);
});
