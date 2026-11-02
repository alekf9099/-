// 로컬 알림 API — 어떤 프로그램/스크립트든 캐릭터에게 알림을 보낼 수 있습니다.
//   POST http://127.0.0.1:47321/notify   {"app":"빌드봇","title":"배포 완료","body":"v1.2.0"}
//   GET  http://127.0.0.1:47321/notify?app=..&title=..&body=..
//   GET  http://127.0.0.1:47321/health
// 보안: 127.0.0.1 에만 바인딩 (외부 네트워크에서 접근 불가)
const http = require('http');

const MAX_BODY = 16 * 1024;

function start(port, onNotify) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const reply = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(obj));
    };

    if (url.pathname === '/health') return reply(200, { ok: true, name: 'ride-buddy' });
    if (url.pathname !== '/notify') return reply(404, { ok: false, error: 'not found' });

    if (req.method === 'GET') {
      const q = Object.fromEntries(url.searchParams);
      if (!q.title && !q.body) return reply(400, { ok: false, error: 'title 또는 body 가 필요합니다' });
      onNotify({ app: q.app, title: q.title, body: q.body, source: 'http' });
      return reply(200, { ok: true });
    }

    if (req.method === 'POST') {
      let data = '';
      let tooBig = false;
      req.setEncoding('utf8');
      req.on('data', chunk => {
        data += chunk;
        if (data.length > MAX_BODY) { tooBig = true; req.destroy(); }
      });
      req.on('end', () => {
        if (tooBig) return;
        let msg;
        try { msg = JSON.parse(data || '{}'); } catch { return reply(400, { ok: false, error: 'JSON 형식이 아닙니다' }); }
        if (!msg.title && !msg.body) return reply(400, { ok: false, error: 'title 또는 body 가 필요합니다' });
        onNotify({ app: msg.app, title: msg.title, body: msg.body, source: 'http' });
        reply(200, { ok: true });
      });
      return;
    }
    reply(405, { ok: false, error: 'method not allowed' });
  });

  server.on('error', err => console.error(`[http] ${port} 포트를 열 수 없습니다:`, err.message));
  server.listen(port, '127.0.0.1', () => console.log(`[http] listening on 127.0.0.1:${port}`));
  return server;
}

module.exports = { start };
