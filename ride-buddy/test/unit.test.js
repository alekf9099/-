// npm test  (Node 20+)
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { parseToast, decodePayload } = require('../src/main/watchers/windows-notifications');
const { describeApp } = require('../src/main/app-names');
const server = require('../src/main/http-server');

test('Windows 토스트 XML 파싱', () => {
  const xml = `<toast launch="x"><visual><binding template="ToastGeneric">
    <text>홍길동</text><text>오늘 저녁 &lt;치킨&gt; 어때? &amp; 맥주</text>
    <text placement="attribution">via KakaoTalk</text></binding></visual></toast>`;
  assert.deepStrictEqual(parseToast(xml), { title: '홍길동', body: '오늘 저녁 <치킨> 어때? & 맥주' });
});

test('UTF-16 / UTF-8 페이로드 디코딩', () => {
  const s = '<toast><visual><binding><text>안녕</text></binding></visual></toast>';
  assert.strictEqual(decodePayload(Buffer.from(s, 'utf16le')), s);
  assert.strictEqual(decodePayload(new Uint8Array(Buffer.from(s, 'utf8'))), s);
});

test('앱 이름 매핑', () => {
  assert.strictEqual(describeApp('C:\\Program Files (x86)\\Kakao\\KakaoTalk\\KakaoTalk.exe').name, '카카오톡');
  assert.strictEqual(describeApp('Microsoft.WindowsStore_8wekyb3d8bbwe!App').name, 'WindowsStore');
  assert.strictEqual(describeApp('C:\\Tools\\MyBot.exe').name, 'MyBot');
});

test('로컬 알림 API', async () => {
  const got = [];
  const port = 47999;
  const srv = server.start(port, n => got.push(n));
  await new Promise(r => srv.once('listening', r));
  const call = (method, path, body) => new Promise((res, rej) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers: { 'Content-Type': 'application/json' } }, r => {
      let s = ''; r.on('data', c => (s += c)); r.on('end', () => res({ code: r.statusCode, json: JSON.parse(s) }));
    });
    req.on('error', rej); req.end(body);
  });
  assert.strictEqual((await call('POST', '/notify', JSON.stringify({ app: 'A', title: 't', body: 'b' }))).code, 200);
  assert.strictEqual((await call('GET', '/notify?title=' + encodeURIComponent('제목'))).code, 200);
  assert.strictEqual((await call('POST', '/notify', 'nope')).code, 400);
  assert.strictEqual((await call('POST', '/notify', '{}')).code, 400);
  assert.strictEqual((await call('GET', '/other')).code, 404);
  srv.close();
  assert.deepStrictEqual(got.map(g => g.title), ['t', '제목']);
});
