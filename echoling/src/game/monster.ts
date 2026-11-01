import type { BaseStats, ComputedStats, Monster, Species } from '../core/types';
import type { Rng } from '../core/rng';
import { SPECIES, getSpecies } from '../data/species';
import { MOVES } from '../data/moves';

// ─────────── 성장 공식 ───────────
//  HP   = ⌊(base*2 + iv) * L / 100⌋ + L + 10
//  기타 = ⌊(base*2 + iv) * L / 100⌋ + 5
//  보스는 power(스탯 배율) / hpMult(체력 배율) 로 보정

export interface EnemyBoost {
  power?: number;
  hpMult?: number;
}

export type BattleMonster = Monster & EnemyBoost;

export function computeStats(m: BattleMonster): ComputedStats {
  const s = getSpecies(m.speciesId);
  const L = m.level;
  const p = m.power ?? 1;
  const calc = (b: number, iv: number) => Math.floor(((b * 2 + iv) * L) / 100) + 5;
  return {
    maxHp: Math.floor((Math.floor(((s.base.hp * 2 + m.iv.hp) * L) / 100) + L + 10) * (m.hpMult ?? 1)),
    atk: Math.floor(calc(s.base.atk, m.iv.atk) * p),
    def: Math.floor(calc(s.base.def, m.iv.def) * p),
    spd: Math.floor(calc(s.base.spd, m.iv.spd) * p),
  };
}

export function maxHp(m: BattleMonster): number {
  return computeStats(m).maxHp;
}

/** 다음 레벨까지 필요 경험치 */
export function expToNext(level: number): number {
  return Math.round(level * level * 0.9 + 20);
}

/** 진화 이전 단계 맵 (learnset 상속용) */
const PREVO: Record<string, string> = {};
for (const s of Object.values(SPECIES)) if (s.evolveTo) PREVO[s.evolveTo] = s.id;

export function lineage(speciesId: string): Species[] {
  const chain: Species[] = [];
  let cur: string | undefined = speciesId;
  while (cur) {
    chain.unshift(getSpecies(cur));
    cur = PREVO[cur];
  }
  return chain;
}

/** 해당 레벨까지 배울 수 있는 기술 (진화 계보 포함, 습득 순서대로) */
export function learnableUpTo(speciesId: string, level: number): string[] {
  const out: string[] = [];
  for (const sp of lineage(speciesId)) {
    for (const [lv, mv] of sp.learnset) {
      if (lv <= level && !out.includes(mv)) out.push(mv);
    }
  }
  return out;
}

/** 정확히 해당 레벨에서 새로 배우는 기술 */
export function movesLearnedAt(speciesId: string, level: number): string[] {
  const out: string[] = [];
  for (const sp of lineage(speciesId)) {
    for (const [lv, mv] of sp.learnset) if (lv === level && !out.includes(mv)) out.push(mv);
  }
  return out;
}

/** 레벨에 맞는 진화 단계 결정 (야생/상점 생성용) — 계보의 1단계부터 레벨 조건대로 올라감 */
export function evolvedFormFor(speciesId: string, level: number): string {
  let s = lineage(speciesId)[0];
  while (s.evolveTo && s.evolveLevel && level >= s.evolveLevel) s = getSpecies(s.evolveTo);
  return s.id;
}

export function randomIv(rng: Rng): BaseStats {
  return { hp: rng.int(0, 15), atk: rng.int(0, 15), def: rng.int(0, 15), spd: rng.int(0, 15) };
}

export function createMonster(
  speciesId: string,
  level: number,
  rng: Rng,
  uid: string,
  opts: { evolve?: boolean; shinyChance?: number } = {},
): Monster {
  const sid = opts.evolve ? evolvedFormFor(speciesId, level) : speciesId;
  const learn = learnableUpTo(sid, level);
  const m: Monster = {
    uid,
    speciesId: sid,
    level,
    exp: 0,
    hp: 1,
    moves: ensureBasic(learn.slice(-4), learn),
    iv: randomIv(rng),
    shiny: rng.chance(opts.shinyChance ?? 1 / 128),
  };
  m.hp = maxHp(m);
  return m;
}

/** 0EN 공격기가 최소 1개 있도록 보장 (EN 고갈 시 행동불능 방지) */
export function ensureBasic(moves: string[], pool: string[]): string[] {
  const isBasic = (id: string) => {
    const mv = MOVES[id];
    return !!mv && mv.cost === 0 && mv.power > 0;
  };
  if (moves.some(isBasic)) return moves;
  const basic = [...pool].reverse().find(isBasic) ?? 'tackle';
  const out = [...moves];
  if (out.length < 4) out.unshift(basic);
  else out[0] = basic;
  return out;
}

export interface LevelUpResult {
  levels: number[];
  /** 슬롯이 꽉 차서 선택이 필요한 기술 */
  pendingMoves: string[];
  /** 자동 습득된 기술 */
  learned: string[];
  canEvolve: boolean;
}

/** 경험치 지급. 레벨업 시 HP 증가분만큼 현재 HP 증가. 기절 상태면 HP 유지(0). */
export function gainExp(m: Monster, amount: number, maxLevel = 60): LevelUpResult {
  const res: LevelUpResult = { levels: [], pendingMoves: [], learned: [], canEvolve: false };
  m.exp += Math.max(0, Math.floor(amount));
  while (m.level < maxLevel && m.exp >= expToNext(m.level)) {
    m.exp -= expToNext(m.level);
    levelUp(m, res);
  }
  if (m.level >= maxLevel) m.exp = 0;
  res.canEvolve = canEvolve(m);
  return res;
}

export function levelUp(m: Monster, res?: LevelUpResult): void {
  const before = maxHp(m);
  m.level += 1;
  const after = maxHp(m);
  if (m.hp > 0) m.hp = Math.min(after, m.hp + (after - before));
  res?.levels.push(m.level);
  for (const mv of movesLearnedAt(m.speciesId, m.level)) {
    if (m.moves.includes(mv)) continue;
    if (m.moves.length < 4) {
      m.moves.push(mv);
      res?.learned.push(mv);
    } else res?.pendingMoves.push(mv);
  }
}

export function canEvolve(m: Monster): boolean {
  const s = getSpecies(m.speciesId);
  return !!(s.evolveTo && s.evolveLevel && m.level >= s.evolveLevel);
}

/** 진화 실행 → 새로 배울 수 있는 기술 목록 반환 (슬롯 여유시 자동 습득) */
export function evolve(m: Monster): { from: string; to: string; pendingMoves: string[] } {
  const from = m.speciesId;
  const s = getSpecies(from);
  if (!s.evolveTo) return { from, to: from, pendingMoves: [] };
  const ratio = m.hp / maxHp(m);
  m.speciesId = s.evolveTo;
  m.hp = m.hp > 0 ? Math.max(1, Math.round(maxHp(m) * ratio)) : 0;
  const pending: string[] = [];
  // 진화형 고유 기술 중 현재 레벨 이하 미습득분
  for (const [lv, mv] of getSpecies(m.speciesId).learnset) {
    if (lv <= m.level && !m.moves.includes(mv)) {
      if (m.moves.length < 4) m.moves.push(mv);
      else pending.push(mv);
    }
  }
  return { from, to: m.speciesId, pendingMoves: pending };
}

export function healPct(m: Monster, pct: number, revive = false): number {
  const mx = maxHp(m);
  if (m.hp <= 0 && !revive) return 0;
  const before = m.hp;
  m.hp = Math.min(mx, Math.max(m.hp, 0) + Math.ceil(mx * pct));
  return m.hp - before;
}

export function displayName(m: Monster): string {
  return m.nickname || getSpecies(m.speciesId).name;
}

export function isAlive(m: Monster): boolean {
  return m.hp > 0;
}
