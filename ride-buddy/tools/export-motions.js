#!/usr/bin/env node
/*
 * 모션 추출기: 캐릭터의 각 모션을 프레임 단위로 렌더링해서
 *   motions/<name>/frame_XXX.png   개별 프레임 (투명 배경)
 *   motions/<name>.gif             투명 GIF (루프)
 *   motions/<name>_sheet.png       스프라이트 시트 (가로 N열 그리드)
 *   motions/motions.json           프레임 메타데이터 (게임엔진/Lottie 대체용)
 * 를 생성합니다.
 *
 * 필요: playwright(+chromium), ffmpeg, ImageMagick(montage)  (선택: python3 + Pillow → 시트 압축)
 * 사용: node tools/export-motions.js [--width 240] [--fps 15] [--only ride,talk]
 */
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'motions');
const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const WIDTH = +argVal('--width', 240);
const ONLY = argVal('--only', '').split(',').filter(Boolean);
const FPS = +argVal('--fps', 15);

// 이름, 설명, 클래스, 길이(초) — 길이는 CSS 루프 주기의 배수
const MOTIONS = [
  { name: 'ride', label: '주행', cls: 'rb--ride', dur: 4.8 },
  { name: 'ride_left', label: '주행(왼쪽)', cls: 'rb--ride rb--left', dur: 2.4 },
  { name: 'idle', label: '정차', cls: 'rb--stop', dur: 4.8 },
  { name: 'notify', label: '알림 도착', cls: 'rb--notify', dur: 2.4 },
  { name: 'talk', label: '알림 읽어주기', cls: 'rb--talk', dur: 2.4 },
  { name: 'happy', label: '기쁨(클릭)', cls: 'rb--happy', dur: 2.4 },
  { name: 'sleep', label: '방해 금지(졸기)', cls: 'rb--sleep', dur: 4.8 },
  { name: 'turn', label: '방향 전환', cls: 'rb--turn', dur: 0.6 },
];

function page() {
  const css = fs.readFileSync(path.join(ROOT, 'src/renderer/character.css'), 'utf8');
  const C = require(path.join(ROOT, 'src/renderer/character.js'));
  // 이펙트(느낌표, Zzz, 연기)가 잘리지 않도록 여백 확보
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;background:transparent}
    #stage{width:${WIDTH}px;padding:${Math.round(WIDTH * 0.14)}px ${Math.round(WIDTH * 0.08)}px 4px ${Math.round(WIDTH * 0.22)}px;box-sizing:content-box}
    ${css}
  </style></head><body><div id="stage"><div class="rb" id="rb"><div class="rb-flip">${C.svg()}</div></div></div></body></html>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: WIDTH * 2, height: WIDTH * 2 } });
  const p = await ctx.newPage();
  await p.setContent(page());
  const meta = { fps: FPS, generatedBy: 'tools/export-motions.js', motions: [] };

  for (const m of MOTIONS) {
    if (ONLY.length && !ONLY.includes(m.name)) continue;
    const dir = path.join(OUT, m.name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });

    await p.evaluate(cls => {
      const el = document.getElementById('rb');
      el.className = 'rb';
      void el.offsetWidth; // 애니메이션 재시작
      el.className = 'rb ' + cls;
    }, m.cls);
    await p.waitForTimeout(50);

    const frames = Math.round(m.dur * FPS);
    const stage = p.locator('#stage');
    for (let i = 0; i < frames; i++) {
      const t = (i / FPS) * 1000;
      await p.evaluate(ms => {
        for (const a of document.getAnimations()) { a.pause(); a.currentTime = ms; }
        // 반전 트랜지션은 즉시 완료
        const flip = document.querySelector('.rb-flip');
        flip.style.transition = 'none';
      }, t);
      await stage.screenshot({ path: path.join(dir, `frame_${String(i).padStart(3, '0')}.png`), omitBackground: true });
    }

    const box = await stage.boundingBox();
    const fw = Math.round(box.width), fh = Math.round(box.height);

    // 투명 GIF
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'frame_%03d.png'),
      '-filter_complex', '[0:v]split[a][b];[a]palettegen=reserve_transparent=1:stats_mode=diff:max_colors=128[p];[b][p]paletteuse=dither=none:alpha_threshold=128:diff_mode=rectangle',
      '-loop', '0', path.join(OUT, `${m.name}.gif`)]);

    // 스프라이트 시트 (최대 10열)
    const cols = Math.min(10, frames);
    execFileSync('montage', [path.join(dir, 'frame_*.png'), '-background', 'none', '-geometry', '+0+0', '-tile', `${cols}x`, path.join(OUT, `${m.name}_sheet.png`)]);

    // (선택) Pillow 가 있으면 시트를 256색 팔레트 PNG(반투명 유지)로 압축
    try {
      execFileSync('python3', ['-I', '-c', 'import sys;from PIL import Image;p=sys.argv[1];Image.open(p).convert("RGBA").quantize(256,method=Image.Quantize.FASTOCTREE).save(p,optimize=True)', path.join(OUT, `${m.name}_sheet.png`)]);
    } catch { /* 압축 생략 */ }

    meta.motions.push({
      name: m.name, label: m.label, cssClass: m.cls, frames, durationSec: m.dur, loop: m.name !== 'turn',
      frameSize: { w: fw, h: fh }, sheet: { file: `${m.name}_sheet.png`, columns: cols, rows: Math.ceil(frames / cols) },
      gif: `${m.name}.gif`, framesDir: `${m.name}/`,
    });
    console.log(`✔ ${m.name.padEnd(10)} ${frames} frames  ${fw}x${fh}`);
  }

  const metaPath = path.join(OUT, 'motions.json');
  if (ONLY.length && fs.existsSync(metaPath)) {
    const prev = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    for (const m of meta.motions) {
      const i = prev.motions.findIndex(x => x.name === m.name);
      if (i >= 0) prev.motions[i] = m; else prev.motions.push(m);
    }
    fs.writeFileSync(metaPath, JSON.stringify(prev, null, 2));
  } else {
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
