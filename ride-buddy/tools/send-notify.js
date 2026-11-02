#!/usr/bin/env node
// 실행 중인 Ride Buddy 에 알림 보내기
//   node tools/send-notify.js "제목" "내용" [앱이름]
const http = require('http');
const [title = '테스트 알림', body = '부릉부릉~ 잘 도착했나요?', app = 'CLI'] = process.argv.slice(2);
const data = JSON.stringify({ app, title, body });
const req = http.request({ host: '127.0.0.1', port: +(process.env.RIDE_BUDDY_PORT || 47321), path: '/notify', method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, res => {
  let s = ''; res.on('data', c => (s += c)); res.on('end', () => console.log(res.statusCode, s));
});
req.on('error', e => { console.error('Ride Buddy 가 실행 중인지 확인하세요:', e.message); process.exit(1); });
req.end(data);
