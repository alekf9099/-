// 캐릭터 정지 이미지 렌더 (디버그/에셋용): node tools/snap.js out.png [width]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const out = process.argv[2] || 'snap.png';
  const w = +(process.argv[3] || 440);
  const C = require(path.join(__dirname, '../src/renderer/character.js'));
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: w, height: Math.round(w * C.view.h / C.view.w) }, deviceScaleFactor: 1 });
  await p.setContent(`<html><body style="margin:0;background:transparent">${C.svg()}<style>svg{width:100%;height:auto;display:block;overflow:visible}</style></body></html>`);
  await p.locator('svg').screenshot({ path: out, omitBackground: true });
  await b.close();
})();
