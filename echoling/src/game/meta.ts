// 영구 진행 (메타) + 자동 저장
import type { MetaSave, RunState } from '../core/types';
import { DEFAULT_STARTERS } from '../data/species';

const META_KEY = 'echoling.meta.v1';
const RUN_KEY = 'echoling.run.v1';
export const RUN_VERSION = 1;

export function defaultMeta(): MetaSave {
  return {
    version: 1,
    shards: 0,
    unlockedStarters: [...DEFAULT_STARTERS],
    seen: [],
    caught: [],
    bestFloor: 0,
    totalRuns: 0,
    wins: 0,
    upgrades: {},
    dailyBest: {},
    settings: { speed: 2, haptics: true, sound: true, reduceMotion: false },
    tutorialDone: false,
    maxAscension: 0,
    tipsSeen: [],
  };
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, val: string | null): void {
  try {
    if (val === null) localStorage.removeItem(key);
    else localStorage.setItem(key, val);
  } catch {
    /* 저장소 사용 불가 (시크릿 모드 등) → 무시 */
  }
}

export function loadMeta(): MetaSave {
  const raw = safeGet(META_KEY);
  if (!raw) return defaultMeta();
  try {
    const parsed = JSON.parse(raw) as Partial<MetaSave>;
    const d = defaultMeta();
    return { ...d, ...parsed, settings: { ...d.settings, ...(parsed.settings ?? {}) } };
  } catch {
    return defaultMeta();
  }
}

export function saveMeta(meta: MetaSave): void {
  safeSet(META_KEY, JSON.stringify(meta));
}

export function loadRun(): RunState | null {
  const raw = safeGet(RUN_KEY);
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as RunState;
    if (r.version !== RUN_VERSION || !r.party?.length) return null;
    r.ascension ??= 0;
    r.snowball ??= 0;
    return r;
  } catch {
    return null;
  }
}

export function saveRun(run: RunState | null): void {
  safeSet(RUN_KEY, run ? JSON.stringify(run) : null);
}

export function markSeen(meta: MetaSave, speciesId: string): void {
  if (!meta.seen.includes(speciesId)) meta.seen.push(speciesId);
}

export function markCaught(meta: MetaSave, speciesId: string): void {
  markSeen(meta, speciesId);
  if (!meta.caught.includes(speciesId)) meta.caught.push(speciesId);
}

/** 런 종료 시 결정(Shard) 보상 */
export function shardsForRun(run: RunState, victory: boolean): number {
  let s = run.floorsCleared * 2 + run.battlesWon + run.caught * 2 + run.act * 25;
  if (victory) s += 80;
  if (run.mode === 'daily' && run.dailyModifier === 'ironman' && victory) s = Math.floor(s * 1.5);
  // 각성 보너스 +10%/단계
  s = Math.floor(s * (1 + 0.1 * (run.ascension ?? 0)));
  return s;
}
