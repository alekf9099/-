// ✨ 전투 이펙트 엔진 — 캔버스 파티클 + Canva AI로 만든 이펙트 텍스처
//  속성마다 "발사체 → 착탄" 연출이 다르다. 연출은 로직과 독립(재생 실패해도 게임 진행엔 영향 없음)
import type { Element as El } from '../core/types';

const BASE = (import.meta.env?.BASE_URL ?? './').replace(/\/?$/, '/');
type Tex = 'fire' | 'drop' | 'leaf' | 'spark' | 'rock' | 'wind' | 'wisp' | 'star' | 'burst';
const TEX: Tex[] = ['fire', 'drop', 'leaf', 'spark', 'rock', 'wind', 'wisp', 'star', 'burst'];
const images = new Map<Tex, HTMLImageElement>();
function tex(t: Tex): HTMLImageElement | null {
  let im = images.get(t);
  if (!im) {
    im = new Image();
    im.decoding = 'async';
    im.src = `${BASE}fx/fx_${t}.webp`;
    images.set(t, im);
  }
  return im.complete && im.naturalWidth ? im : null;
}
export function preloadVfx(): void {
  TEX.forEach((t) => tex(t));
}

export interface Pt {
  x: number;
  y: number;
}

interface P {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; rot: number; vr: number;
  g: number; drag: number; grow: number;
  tex?: Tex; color?: string; ring?: number; glow?: boolean; alpha: number;
}

const COLOR: Record<El, string> = {
  neutral: '#ffffff', blaze: '#ff7a2e', tide: '#4cb8ff', bloom: '#6ee07f', volt: '#ffe14d',
  terra: '#c49a5a', gale: '#8ef0e6', umbra: '#9b6bff', lumen: '#fff1a8',
};
const PROJ: Record<El, Tex | null> = {
  neutral: null, blaze: 'fire', tide: 'drop', bloom: 'leaf', volt: null, terra: 'rock', gale: 'wind', umbra: 'wisp', lumen: 'star',
};
const SHARD: Record<El, Tex> = {
  neutral: 'star', blaze: 'fire', tide: 'drop', bloom: 'leaf', volt: 'spark', terra: 'rock', gale: 'wind', umbra: 'wisp', lumen: 'star',
};

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Vfx {
  private cv: HTMLCanvasElement;
  private cx: CanvasRenderingContext2D;
  private ps: P[] = [];
  private bolts: { a: Pt; b: Pt; until: number; color: string }[] = [];
  private flashA = 0;
  private flashC = '#fff';
  private raf = 0;
  private dpr = Math.min(2, window.devicePixelRatio || 1);
  private lite: boolean;
  private host: HTMLElement;

  constructor(host: HTMLElement, lite = false) {
    this.host = host;
    this.lite = lite;
    this.cv = document.createElement('canvas');
    this.cv.className = 'vfx-layer';
    host.appendChild(this.cv);
    this.cx = this.cv.getContext('2d')!;
    preloadVfx();
    this.resize();
  }

  resize(): void {
    const r = this.host.getBoundingClientRect();
    this.cv.width = Math.max(1, Math.round(r.width * this.dpr));
    this.cv.height = Math.max(1, Math.round(r.height * this.dpr));
    this.cv.style.width = r.width + 'px';
    this.cv.style.height = r.height + 'px';
  }

  /** 요소 중심 좌표 (호스트 기준) */
  centerOf(el: HTMLElement, yBias = 0.55): Pt {
    const h = this.host.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - h.left + r.width / 2, y: r.top - h.top + r.height * yBias };
  }

  private add(p: Partial<P> & { x: number; y: number }): void {
    if (this.lite && Math.random() < 0.5 && !p.ring) return;
    this.ps.push({ vx: 0, vy: 0, life: 0, max: 0.6, size: 16, rot: 0, vr: 0, g: 0, drag: 0.98, grow: 0, alpha: 1, ...p });
    this.start();
  }

  private start(): void {
    if (this.raf) return;
    const r = this.host.getBoundingClientRect();
    if (Math.round(r.width * this.dpr) !== this.cv.width || Math.round(r.height * this.dpr) !== this.cv.height) this.resize();
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      this.step(dt, t);
      if (this.ps.length || this.bolts.length || this.flashA > 0.01) this.raf = requestAnimationFrame(loop);
      else {
        this.raf = 0;
        this.cx.clearRect(0, 0, this.cv.width, this.cv.height);
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  private step(dt: number, now: number): void {
    const c = this.cx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.cv.width, this.cv.height);
    // 번개
    this.bolts = this.bolts.filter((b) => b.until > now);
    for (const b of this.bolts) this.drawBolt(b.a, b.b, b.color);
    // 파티클
    this.ps = this.ps.filter((p) => (p.life += dt) < p.max);
    for (const p of this.ps) {
      p.vy += p.g * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.size = Math.max(0, p.size + p.grow * dt);
      const k = p.life / p.max;
      const a = p.alpha * (k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.55) / 0.45));
      c.globalAlpha = Math.max(0, a);
      if (p.ring !== undefined) {
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = p.color ?? '#fff';
        c.lineWidth = Math.max(1, 6 * (1 - k));
        c.beginPath();
        c.arc(p.x, p.y, p.ring + p.size * k, 0, Math.PI * 2);
        c.stroke();
        continue;
      }
      c.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
      const im = p.tex ? tex(p.tex) : null;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      if (im) c.drawImage(im, -p.size / 2, -p.size / 2, p.size, p.size);
      else {
        const g = c.createRadialGradient(0, 0, 0, 0, 0, p.size / 2);
        g.addColorStop(0, '#fff');
        g.addColorStop(0.35, p.color ?? '#fff');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }
    // 화면 섬광
    if (this.flashA > 0.01) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = this.flashA;
      c.fillStyle = this.flashC;
      c.fillRect(0, 0, this.cv.width, this.cv.height);
      this.flashA *= Math.pow(0.02, dt);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  private drawBolt(a: Pt, b: Pt, color: string): void {
    const c = this.cx;
    const pts: Pt[] = [a];
    const n = 9;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      pts.push({ x: a.x + (b.x - a.x) * t + rnd(-16, 16), y: a.y + (b.y - a.y) * t + rnd(-16, 16) });
    }
    pts.push(b);
    c.globalCompositeOperation = 'lighter';
    for (const [w, col, al] of [[10, color, 0.35], [4, color, 0.9], [1.6, '#ffffff', 1]] as [number, string, number][]) {
      c.globalAlpha = al;
      c.strokeStyle = col;
      c.lineWidth = w;
      c.lineJoin = 'round';
      c.beginPath();
      pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  flash(color: string, a = 0.35): void {
    if (this.lite) return;
    this.flashC = color;
    this.flashA = Math.max(this.flashA, a);
    this.start();
  }

  /** 🚀 발사체 연출. 착탄 시점에 resolve */
  projectile(el: El, from: Pt, to: Pt, ms: number): Promise<void> {
    const color = COLOR[el];
    const t0 = performance.now();
    return new Promise((resolve) => {
      if (ms <= 20) return resolve();
      if (el === 'volt') {
        // 번개는 즉시 연결 + 양 끝 스파크
        this.bolts.push({ a: from, b: to, until: t0 + ms + 120, color });
        for (let i = 0; i < 6; i++) this.add({ x: from.x, y: from.y, vx: rnd(-160, 160), vy: rnd(-160, 160), size: rnd(10, 18), tex: 'spark', glow: true, max: 0.35 });
        this.flash('#fff6c0', 0.18);
        this.start();
        setTimeout(resolve, ms);
        return;
      }
      if (el === 'neutral') {
        // 무속성은 짧은 돌진 잔상만
        for (let i = 0; i < 6; i++) this.add({ x: from.x + (to.x - from.x) * (i / 6), y: from.y + (to.y - from.y) * (i / 6), size: 18, color: '#ffffff', glow: true, max: 0.25 + i * 0.03, alpha: 0.5 });
        setTimeout(resolve, ms * 0.6);
        return;
      }
      const pTex = PROJ[el]!;
      const count = el === 'bloom' ? 5 : el === 'terra' ? 3 : el === 'gale' ? 3 : el === 'umbra' ? 4 : 1;
      const arc = el === 'terra' ? -90 : 0;
      const tick = () => {
        const k = Math.min(1, (performance.now() - t0) / ms);
        for (let i = 0; i < count; i++) {
          const delay = i * 0.08;
          const kk = Math.max(0, Math.min(1, (k - delay) / (1 - delay * (count - 1) / count || 1)));
          const wob = el === 'bloom' || el === 'umbra' ? Math.sin(kk * Math.PI * 3 + i * 1.7) * 26 * (1 - kk) : 0;
          const x = from.x + (to.x - from.x) * kk + wob;
          const y = from.y + (to.y - from.y) * kk + arc * Math.sin(Math.PI * kk) + wob * 0.6;
          if (kk > 0 && kk < 1) {
            this.add({ x, y, size: el === 'blaze' ? 46 : el === 'lumen' ? 30 : 34, tex: pTex, glow: el !== 'terra' && el !== 'bloom', rot: el === 'gale' ? kk * 12 : el === 'terra' ? kk * 8 : Math.atan2(to.y - from.y, to.x - from.x), max: 0.06 });
            if (Math.random() < 0.9) this.add({ x: x + rnd(-6, 6), y: y + rnd(-6, 6), vx: rnd(-30, 30), vy: rnd(-30, 30), size: rnd(8, 16), tex: el === 'tide' || el === 'blaze' ? pTex : undefined, color, glow: true, max: 0.3, grow: -20, alpha: 0.8 });
          }
        }
        if (k < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  /** 💥 착탄 */
  impact(el: El, at: Pt, opts: { crit?: boolean; super?: boolean; small?: boolean } = {}): void {
    const color = COLOR[el];
    const s = (opts.crit ? 1.45 : 1) * (opts.small ? 0.5 : 1);
    const n = Math.round((opts.small ? 6 : 14) * (opts.crit ? 1.4 : 1));
    const shard = SHARD[el];
    // 중심 폭발
    this.add({ x: at.x, y: at.y, size: 70 * s, grow: 160 * s, tex: 'burst', glow: true, max: 0.32, alpha: 0.95 });
    this.add({ x: at.x, y: at.y, ring: 10, size: 90 * s, color, max: 0.45 });
    if (opts.super) this.add({ x: at.x, y: at.y, ring: 20, size: 130 * s, color: '#ffffff', max: 0.55 });
    for (let i = 0; i < n; i++) {
      const ang = rnd(0, Math.PI * 2);
      const sp = rnd(120, 300) * s;
      const heavy = el === 'tide' || el === 'terra';
      this.add({
        x: at.x, y: at.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - (heavy ? 120 : 0),
        g: heavy ? 700 : el === 'bloom' ? 60 : 0, drag: el === 'bloom' || el === 'gale' ? 0.95 : 0.985,
        size: rnd(12, 26) * (opts.small ? 0.7 : 1), tex: shard, glow: el !== 'terra' && el !== 'bloom',
        rot: rnd(0, 6), vr: rnd(-8, 8), max: rnd(0.4, 0.8),
      });
    }
    if (el === 'terra' && !opts.small) for (let i = 0; i < 8; i++) this.add({ x: at.x + rnd(-30, 30), y: at.y + 30, vx: rnd(-60, 60), vy: rnd(-40, -10), size: rnd(24, 44), grow: 40, color: 'rgba(170,140,100,0.55)', max: 0.7, alpha: 0.6 });
    if (el === 'umbra') this.add({ x: at.x, y: at.y, ring: 70 * s, size: -70 * s, color: '#7b3dff', max: 0.4 });
    if (opts.crit) this.flash('#ffffff', 0.28);
    else if (opts.super) this.flash(color, 0.16);
  }

  /** 🔆 변화기·강화 오라 (자기 주변에서 위로 피어오름) */
  aura(el: El, at: Pt, kind: 'buff' | 'debuff' | 'heal' = 'buff'): void {
    const color = kind === 'heal' ? '#7cffc4' : kind === 'debuff' ? '#ff6b8a' : COLOR[el];
    this.add({ x: at.x, y: at.y + 30, ring: 20, size: 60, color, max: 0.6 });
    for (let i = 0; i < 12; i++) {
      this.add({
        x: at.x + rnd(-50, 50), y: at.y + rnd(0, 50), vx: rnd(-10, 10), vy: kind === 'debuff' ? rnd(40, 90) : rnd(-120, -60),
        size: rnd(10, 20), tex: kind === 'heal' ? 'star' : SHARD[el], glow: true, color, max: rnd(0.6, 1), drag: 0.99,
      });
    }
  }

  /** 상태이상 지속 피해 (화상 불씨 / 중독 거품) */
  dot(status: string, at: Pt): void {
    const el: El = status === 'burn' ? 'blaze' : status === 'poison' ? 'umbra' : 'neutral';
    this.impact(el, at, { small: true });
  }

  /** 기 모으기 — 시전자 주변 입자가 중심으로 빨려 들어감 (변화기·대기술 예비동작) */
  charge(el: El, at: Pt, ms = 380): void {
    const color = COLOR[el];
    const n = this.lite ? 5 : 10;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rnd(-0.2, 0.2);
      const r = rnd(60, 85);
      const t = ms / 1000;
      this.add({ x: at.x + Math.cos(ang) * r, y: at.y + Math.sin(ang) * r, vx: (-Math.cos(ang) * r) / t, vy: (-Math.sin(ang) * r) / t, drag: 1, size: rnd(8, 14), color, glow: true, max: t, alpha: 0.9 });
    }
    this.add({ x: at.x, y: at.y, size: 20, grow: 90, color, glow: true, max: ms / 1000, alpha: 0.55 });
  }

  /** 기절 — 연기 퍼프 */
  poof(at: Pt): void {
    for (let i = 0; i < 12; i++) {
      const ang = rnd(Math.PI * 1.05, Math.PI * 1.95);
      this.add({ x: at.x + rnd(-24, 24), y: at.y + rnd(10, 30), vx: Math.cos(ang) * rnd(30, 90), vy: Math.sin(ang) * rnd(20, 70), drag: 0.96, size: rnd(26, 44), grow: 50, color: 'rgba(200,200,220,0.5)', max: rnd(0.7, 1.1), alpha: 0.55 });
    }
  }

  /** 등장 착지 — 링 + 먼지 + 반짝 */
  land(at: Pt, el: El): void {
    this.add({ x: at.x, y: at.y + 40, ring: 12, size: 70, color: COLOR[el], max: 0.5 });
    for (let i = 0; i < 6; i++) this.add({ x: at.x + rnd(-40, 40), y: at.y + 44, vx: rnd(-50, 50), vy: rnd(-30, -5), size: rnd(14, 24), grow: 30, color: 'rgba(220,210,190,0.45)', max: 0.6, alpha: 0.5 });
    for (let i = 0; i < 5; i++) this.add({ x: at.x + rnd(-40, 40), y: at.y + rnd(-40, 30), vy: rnd(-40, -10), size: rnd(10, 18), tex: 'star', glow: true, max: rnd(0.4, 0.7) });
  }

  /** 회피 — 빗나간 발사체가 지나간 자리의 잔상 */
  whiff(at: Pt): void {
    this.add({ x: at.x, y: at.y, ring: 6, size: 40, color: '#ffffff', max: 0.3 });
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.cv.remove();
  }
}
