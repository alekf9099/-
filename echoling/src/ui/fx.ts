// 햅틱 + 합성 효과음 (오디오 파일 0개 → APK 용량 절약)
import type { Settings } from '../core/types';
import { playSample, setMusicEnabled, type SfxName } from './audio';

let settings: Settings = { speed: 1, haptics: true, sound: true, reduceMotion: false };
export function bindSettings(s: Settings): void {
  settings = s;
  setMusicEnabled(s.music !== false);
}

export function haptic(pattern: number | number[] = 12): void {
  if (!settings.haptics) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* 미지원 기기 */
  }
}

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  if (!settings.sound) return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.08, slide = 0, delay = 0): void {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export type Sfx = SfxName;

/** 샘플 우선 재생, 로드 전/실패 시 아래 합성음으로 폴백. 햅틱은 항상 */
const HAPTIC: Partial<Record<Sfx, number | number[]>> = { hit: 18, crit: [20, 30, 40], super: [25, 20, 25], weak: 8, faint: 60, level: [10, 40, 10], capture: [30, 50, 30, 50, 80], shake: 15, evolve: [20, 60, 20, 60, 120], roar: [40, 40, 80] };

export function sfx(name: Sfx): void {
  if (!settings.sound) return;
  if (playSample(name)) {
    const hp = HAPTIC[name];
    if (hp) haptic(hp);
    return;
  }
  synth(name);
}

function synth(name: Sfx): void {
  switch (name) {
    case 'tap': tone(660, 0.05, 'triangle', 0.04); break;
    case 'hit': tone(180, 0.12, 'square', 0.06, -90); haptic(18); break;
    case 'crit': tone(240, 0.08, 'sawtooth', 0.07, -120); tone(120, 0.18, 'square', 0.06, -60, 0.05); haptic([20, 30, 40]); break;
    case 'super': tone(300, 0.1, 'sawtooth', 0.07, -150); tone(150, 0.2, 'square', 0.06, -80, 0.06); haptic([25, 20, 25]); break;
    case 'weak': tone(160, 0.1, 'triangle', 0.05, -40); haptic(8); break;
    case 'heal': tone(520, 0.12, 'sine', 0.06, 260); tone(780, 0.15, 'sine', 0.05, 200, 0.08); break;
    case 'faint': tone(400, 0.5, 'triangle', 0.07, -340); haptic(60); break;
    case 'level': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, 'triangle', 0.06, 0, i * 0.07)); haptic([10, 40, 10]); break;
    case 'capture': [784, 988, 1318].forEach((f, i) => tone(f, 0.16, 'triangle', 0.07, 0, i * 0.1)); haptic([30, 50, 30, 50, 80]); break;
    case 'shake': tone(220, 0.08, 'square', 0.04); haptic(15); break;
    case 'win': [523, 659, 784, 659, 1046].forEach((f, i) => tone(f, 0.14, 'triangle', 0.07, 0, i * 0.09)); break;
    case 'lose': [392, 330, 262].forEach((f, i) => tone(f, 0.25, 'triangle', 0.07, 0, i * 0.18)); break;
    case 'coin': tone(988, 0.06, 'square', 0.04); tone(1318, 0.12, 'square', 0.04, 0, 0.06); break;
    case 'evolve': [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.18, 'sine', 0.06, 0, i * 0.12)); haptic([20, 60, 20, 60, 120]); break;
    case 'buff': tone(440, 0.15, 'sine', 0.05, 440); break;
    case 'debuff': tone(440, 0.15, 'sine', 0.05, -220); break;
    case 'confirm': tone(880, 0.08, 'triangle', 0.05); tone(1320, 0.1, 'triangle', 0.04, 0, 0.05); break;
    case 'close': tone(520, 0.06, 'triangle', 0.04, -120); break;
    case 'error': tone(200, 0.15, 'square', 0.05); break;
    case 'roar': tone(110, 0.5, 'sawtooth', 0.08, -50); haptic([40, 40, 80]); break;
  }
}

export function speedMult(): number {
  return settings.reduceMotion ? 0.6 : 1 / settings.speed;
}

// 발사음: 대역 통과 필터를 지나는 노이즈 스윕 (속성마다 음색 중심 주파수가 다름)
let noiseBuf: AudioBuffer | null = null;
const WHOOSH_HZ: Record<string, number> = { neutral: 1200, blaze: 900, tide: 650, bloom: 1500, volt: 3200, terra: 320, gale: 2100, umbra: 420, lumen: 2600 };
export function whoosh(element: string, dur = 0.28): void {
  const a = ac();
  if (!a) return;
  try {
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, a.sampleRate * 0.6, a.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = a.currentTime;
    const src = a.createBufferSource();
    src.buffer = noiseBuf;
    const f = a.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = element === 'volt' ? 6 : 1.6;
    const hz = WHOOSH_HZ[element] ?? 1200;
    f.frequency.setValueAtTime(hz * 0.5, t0);
    f.frequency.exponentialRampToValueAtTime(hz * 1.4, t0 + dur * 0.6);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(element === 'terra' ? 0.16 : 0.1, t0 + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(a.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
    if (element === 'volt') [0, 0.05, 0.11].forEach((dl) => tone(2400 + Math.random() * 1200, 0.04, 'square', 0.025, -800, dl));
  } catch {
    /* 오디오 미지원 */
  }
}
