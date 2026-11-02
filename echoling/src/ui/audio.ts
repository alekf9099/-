// 🔊 오디오 엔진 — CC0 샘플(OpenGameArt) 기반 효과음 + 배경음악
//  - 효과음: WebAudio 버퍼 (첫 터치 후 미리 로드, 로드 전엔 합성음 폴백)
//  - 배경음악: <audio> 루프 + 크로스페이드, 트랙은 필요할 때만 로드
const BASE = (import.meta.env?.BASE_URL ?? './').replace(/\/?$/, '/');

export type SfxName =
  | 'tap' | 'confirm' | 'close' | 'error' | 'hit' | 'crit' | 'super' | 'weak' | 'heal' | 'faint' | 'shake' | 'capture'
  | 'coin' | 'buff' | 'debuff' | 'roar' | 'level' | 'win' | 'evolve' | 'lose';

const SFX_FILES: SfxName[] = ['tap', 'confirm', 'close', 'error', 'hit', 'crit', 'super', 'weak', 'heal', 'faint', 'shake', 'capture', 'coin', 'buff', 'debuff', 'roar', 'level', 'win', 'evolve', 'lose'];
const SFX_GAIN: Partial<Record<SfxName, number>> = { tap: 0.45, shake: 0.6, coin: 0.7, heal: 0.7 };

export type Track = 'title' | 'map' | 'battle' | 'boss' | null;

let ctx: AudioContext | null = null;
const buffers = new Map<SfxName, AudioBuffer>();
let loading = false;
let unlocked = false;

export function audioCtx(): AudioContext | null {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

async function preload(): Promise<void> {
  if (loading) return;
  loading = true;
  const a = audioCtx();
  if (!a) return;
  await Promise.all(SFX_FILES.map(async (n) => {
    try {
      const res = await fetch(`${BASE}audio/sfx/${n}.ogg`);
      buffers.set(n, await a.decodeAudioData(await res.arrayBuffer()));
    } catch {
      /* 디코드 실패 시 합성음 폴백 */
    }
  }));
}

/** 샘플 재생. 성공하면 true (false면 호출 측에서 합성음 폴백) */
export function playSample(name: SfxName, vol = 1): boolean {
  const a = ctx;
  const buf = buffers.get(name);
  if (!a || !buf) return false;
  const src = a.createBufferSource();
  const g = a.createGain();
  g.gain.value = (SFX_GAIN[name] ?? 0.85) * vol;
  src.buffer = buf;
  src.playbackRate.value = 0.96 + Math.random() * 0.08; // 반복 피로 감소
  src.connect(g).connect(a.destination);
  src.start();
  return true;
}

// ─────────── 배경음악 ───────────
let musicOn = true;
let current: Track = null;
let el: HTMLAudioElement | null = null;
const MUSIC_VOL = 0.42;

function fade(audio: HTMLAudioElement, to: number, ms: number, done?: () => void): void {
  const from = audio.volume;
  const t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / ms);
    audio.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}

export function setMusicEnabled(on: boolean): void {
  musicOn = on;
  if (!on && el) {
    const old = el;
    fade(old, 0, 300, () => old.pause());
    el = null;
  } else if (on && current) {
    const t = current;
    current = null;
    playTrack(t);
  }
}

export function playTrack(t: Track): void {
  if (t === current && el) return;
  current = t;
  if (!musicOn || !unlocked) return;
  const old = el;
  if (old) fade(old, 0, 450, () => old.pause());
  el = null;
  if (!t) return;
  const a = new Audio(`${BASE}audio/bgm/${t}.ogg`);
  a.loop = true;
  a.volume = 0;
  a.preload = 'auto';
  el = a;
  void a.play().then(() => fade(a, MUSIC_VOL, 700)).catch(() => { /* 자동재생 차단 → 다음 터치에 재시도 */ });
}

/** 첫 사용자 입력 이후에만 오디오 허용 (모바일 자동재생 정책) */
export function initAudioUnlock(): void {
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    audioCtx();
    void preload();
    if (current) {
      const t = current;
      current = null;
      playTrack(t);
    }
  };
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  window.addEventListener('keydown', unlock, { once: true, capture: true });
  // 앱이 백그라운드로 가면 음악 일시정지
  document.addEventListener('visibilitychange', () => {
    if (!el) return;
    if (document.hidden) el.pause();
    else void el.play().catch(() => {});
  });
}
