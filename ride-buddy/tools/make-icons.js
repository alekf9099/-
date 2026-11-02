#!/usr/bin/env node
// 캐릭터 얼굴로 앱/트레이 아이콘 생성: assets/icon.png(512), tray.png(32), tray@2x.png(64), icon.ico
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const path = require('path');
const C = require('../src/renderer/character.js');
const A = path.join(__dirname, '..', 'assets');

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 512, height: 512 } });
  // 얼굴만 보이도록 viewBox 를 머리 영역으로 자름 (FX 숨김)
  const svg = C.svg().replace('viewBox="0 0 440 630"', 'viewBox="64 4 310 252"');
  await p.setContent(`<html><body style="margin:0;background:transparent">
    <div id="i" style="width:512px;height:512px;display:grid;place-items:center">
      <div style="width:500px;height:462px">${svg}</div></div>
    <style>svg{width:100%;height:100%;overflow:hidden}#rb-fx,#rb-bike-front,#rb-bike,#rb-torso,#rb-arm-l,#rb-arm-r,#rb-leg,#rb-shadow,#rb-speedlines{display:none}</style></body></html>`);
  for (const [name, size] of [['icon.png', 512], ['tray@2x.png', 64], ['tray.png', 32]]) {
    await p.setViewportSize({ width: 512, height: 512 });
    const buf = await p.locator('#i').screenshot({ omitBackground: true });
    const out = path.join(A, name);
    require('fs').writeFileSync(out, buf);
    if (size !== 512) execFileSync('convert', [out, '-resize', `${size}x${size}`, out]);
  }
  execFileSync('convert', [path.join(A, 'icon.png'), '-define', 'icon:auto-resize=256,128,64,48,32,16', path.join(A, 'icon.ico')]);
  await b.close();
  console.log('icons → assets/');
})();
