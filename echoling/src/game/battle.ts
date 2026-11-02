// ─────────────────────────────────────────────────────────────
// 전투 엔진 (순수 로직 · DOM 의존성 없음)
//  - 1:1 턴제, 진영별 EN(에코 에너지) 공유
//  - 결과는 이벤트 배열로 반환 → UI가 순차 재생
// ─────────────────────────────────────────────────────────────
import type { Element, ItemId, Monster, Move, StatKey, StatusId } from '../core/types';
import type { Rng } from '../core/rng';
import { effectiveness } from '../data/elements';
import { getMove } from '../data/moves';
import { getSpecies } from '../data/species';
import { RESONANCES, RES_T1, RES_T2 } from '../data/world';
import { ITEMS } from '../data/charms';
import { type BattleMonster, computeStats, displayName, gainExp, healPct, maxHp, type LevelUpResult } from './monster';

export type Side = 'p' | 'e';
export type BattleKind = 'wild' | 'trainer' | 'elite' | 'boss';

export interface SideState {
  team: BattleMonster[];
  active: number;
  stages: Record<StatKey, number>;
  en: number;
  maxEn: number;
  lastStandUsed: boolean;
}

export interface BattleCtx {
  charms: string[];
  modifier?: string;
  /** 플레이어 파티 공명 단계 (속성 → 0|1|2) */
  resonance: Partial<Record<Element, number>>;
  /** 각성 단계 */
  ascension?: number;
  /** 보유 골드 (미다스의 손) */
  gold?: number;
  /** 눈덩이 누적 */
  snowball?: number;
  /** 현재 액트 (0~2) */
  act?: number;
}

export interface BattleState {
  kind: BattleKind;
  title: string;
  p: SideState;
  e: SideState;
  turn: number;
  over: null | 'win' | 'lose' | 'caught';
  /** 플레이어 출전 몬스터 기절 → 교체 필요 */
  needSwitch: boolean;
  ctx: BattleCtx;
  /** 경험치를 받을 참전자 uid */
  participants: string[];
  caughtMon?: Monster;
  /** 전투 후 처리 대기: 기술 습득 선택 */
  pendingLearn: { uid: string; moveId: string }[];
  /** ⚔️ 적 행동 예고: 이번 턴 적이 사용할 기술 인덱스 (턴 시작 시 확정) */
  eIntent: number | null;
  /** 보스 분노 각성 발동 여부 */
  phase2: boolean;
  /** 선수필승 사용 여부 */
  firstBloodUsed: boolean;
  /** 과충전: 현재 실행 중 기술이 EN 가득 찬 상태에서 시작됐는가 */
  overchargeNow: boolean;
}

export type BEvent =
  | { t: 'msg'; text: string }
  | { t: 'use'; side: Side; move: string; name: string }
  | { t: 'hit'; side: Side; dmg: number; hp: number; eff: number; crit: boolean; hitNo?: number; /** 기술 직격이 아닌 피해 (연출 구분용) */ src?: 'recoil' | 'thorns' | 'burn' | 'poison' }
  | { t: 'miss'; side: Side }
  | { t: 'heal'; side: Side; amount: number; hp: number }
  | { t: 'status'; side: Side; status: StatusId | null }
  | { t: 'stat'; side: Side; stat: StatKey; delta: number }
  | { t: 'faint'; side: Side }
  | { t: 'switch'; side: Side; idx: number }
  | { t: 'en'; side: Side; en: number }
  | { t: 'capture'; shakes: number; success: boolean }
  | { t: 'exp'; uid: string; amount: number; levels: number[]; learned: string[] }
  | { t: 'phase'; side: Side }
  | { t: 'revive' }
  | { t: 'end'; result: 'win' | 'lose' | 'caught' };

export type PlayerAction =
  | { type: 'move'; idx: number }
  | { type: 'switch'; idx: number }
  | { type: 'item'; item: ItemId; target?: number }
  | { type: 'capture'; item: 'capsule' | 'hyperCapsule' };

export const STATUS_NAME: Record<StatusId, string> = {
  burn: '화상',
  poison: '중독',
  shock: '감전',
  chill: '빙결',
  sleep: '수면',
};

const BASE_CRIT = 0.0625;
const STAB = 1.25;

// ─────────── 공명 계산 ───────────
export function computeResonance(party: Monster[], charms: string[]): Partial<Record<Element, number>> {
  const counts: Partial<Record<Element, number>> = {};
  for (const m of party) {
    for (const el of getSpecies(m.speciesId).elements) {
      if (el === 'neutral') continue;
      counts[el] = (counts[el] ?? 0) + 1;
    }
  }
  const bonus = charms.includes('resonator') ? 1 : 0;
  const out: Partial<Record<Element, number>> = {};
  for (const [el, c] of Object.entries(counts) as [Element, number][]) {
    const n = c + bonus;
    out[el] = n >= RES_T2 ? 2 : n >= RES_T1 ? 1 : 0;
  }
  return out;
}

function res(state: BattleState, side: Side, el: Element): number {
  return side === 'p' ? (state.ctx.resonance[el] ?? 0) : 0;
}

/** 공명 2단계 보유 여부 (아무 몬스터 무관, 파티 전체) */
function hasRes2(state: BattleState, side: Side, el: Exclude<Element, 'neutral'>): boolean {
  return res(state, side, el) >= 2 && !!RESONANCES[el];
}

function hasCharm(state: BattleState, side: Side, id: string): boolean {
  return side === 'p' && state.ctx.charms.includes(id);
}

// ─────────── 생성 ───────────
export function createBattle(
  kind: BattleKind,
  title: string,
  playerParty: Monster[],
  enemies: BattleMonster[],
  ctx: BattleCtx,
): BattleState {
  const firstAlive = Math.max(0, playerParty.findIndex((m) => m.hp > 0));
  const maxEn = 3 + (ctx.charms.includes('doubleCore') ? 1 : 0);
  const st: BattleState = {
    kind,
    title,
    p: { team: playerParty, active: firstAlive, stages: zeroStages(), en: 1, maxEn, lastStandUsed: false },
    e: { team: enemies, active: 0, stages: zeroStages(), en: kind === 'boss' ? 2 : 1, maxEn: 3, lastStandUsed: false },
    turn: 1,
    over: null,
    needSwitch: false,
    ctx,
    participants: [playerParty[firstAlive].uid],
    pendingLearn: [],
    eIntent: null,
    phase2: false,
    firstBloodUsed: false,
    overchargeNow: false,
  };
  if (ctx.charms.includes('firstStrike')) st.p.en = Math.min(maxEn, st.p.en + 1);
  planIntent(st, null);
  return st;
}

function hasAffix(state: BattleState, side: Side, id: string): boolean {
  return side === 'e' && !!activeOf(state, side).affixes?.includes(id);
}

/** ⚔️ 적의 이번 턴 행동을 확정 (플레이어가 보고 대응할 수 있게 공개) */
export function planIntent(state: BattleState, rng: Rng | null): void {
  if (state.over) {
    state.eIntent = null;
    return;
  }
  state.eIntent = chooseAiMove(state, 'e', rng);
}

export interface IntentInfo {
  move: Move;
  /** 현재 출전 중인 내 에코링에게 예상되는 피해 (변화기는 0) */
  expected: number;
  /** 예상 피해로 쓰러질 위험 */
  lethal: boolean;
  kind: 'attack' | 'buff' | 'debuff' | 'heal' | 'status';
}

export function intentInfo(state: BattleState): IntentInfo | null {
  if (state.eIntent === null || state.over) return null;
  const foe = activeOf(state, 'e');
  const id = foe.moves[state.eIntent];
  if (!id) return null;
  const move = getMove(id);
  const me = activeOf(state, 'p');
  const expected = move.power > 0 ? Math.round(expectedDamage(state, 'e', move) / (move.acc / 100)) : 0;
  const ef = move.effect ?? {};
  const kind: IntentInfo['kind'] = move.power > 0 ? 'attack' : ef.healPct ? 'heal' : ef.status ? 'status' : ef.selfStat ? 'buff' : 'debuff';
  return { move, expected, lethal: expected >= me.hp, kind };
}

function zeroStages(): Record<StatKey, number> {
  return { atk: 0, def: 0, spd: 0 };
}

export function activeOf(state: BattleState, side: Side): BattleMonster {
  const s = state[side];
  return s.team[s.active];
}

function other(side: Side): Side {
  return side === 'p' ? 'e' : 'p';
}

function stageMult(stage: number): number {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

// ─────────── 실효 스탯 ───────────
export function effStat(state: BattleState, side: Side, stat: StatKey): number {
  const m = activeOf(state, side);
  const base = computeStats(m)[stat];
  let v = base * stageMult(state[side].stages[stat]);
  const mod = state.ctx.modifier;
  if (stat === 'spd') {
    if (m.status === 'shock') v *= 0.5;
    if (m.status === 'chill') v *= 0.75;
    if (hasCharm(state, side, 'speedShoes')) v *= 1.15;
    if (hasRes2(state, side, 'gale')) v *= 1.25;
    if (side === 'e' && mod === 'speedDemon') v *= 1.25;
    if (hasAffix(state, side, 'swift')) v *= 1.3;
  }
  if (mod === 'glassCannon') {
    if (stat === 'atk') v *= 1.3;
    if (stat === 'def') v *= 0.7;
  }
  return Math.max(1, v);
}

// ─────────── 데미지 계산 ───────────
export interface DamageCalc {
  dmg: number;
  eff: number;
  crit: boolean;
}

/** UI 미리보기용: 상성 배율만 */
export function previewEff(state: BattleState, side: Side, move: Move): number {
  if (move.power <= 0) return 1;
  const def = activeOf(state, other(side));
  return effectiveness(move.element, getSpecies(def.speciesId).elements);
}

/** 기대 피해 (AI 및 UI 프리뷰). rng 없음 → 평균값 */
export function expectedDamage(state: BattleState, side: Side, move: Move): number {
  if (move.power <= 0) return 0;
  const c = calcDamage(state, side, move, null);
  const hits = move.effect?.hits ? (move.effect.hits[0] + move.effect.hits[1]) / 2 : 1;
  return c.dmg * hits * (move.acc / 100);
}

export function calcDamage(state: BattleState, side: Side, move: Move, rng: Rng | null): DamageCalc {
  const atkMon = activeOf(state, side);
  const defMon = activeOf(state, other(side));
  const atkSp = getSpecies(atkMon.speciesId);
  const defSp = getSpecies(defMon.speciesId);
  const A = effStat(state, side, 'atk');
  const D = effStat(state, other(side), 'def');
  const L = atkMon.level;
  let dmg = (((2 * L) / 5 + 2) * move.power * (A / D)) / 50 + 2;

  const eff = effectiveness(move.element, defSp.elements);
  dmg *= eff;
  if (move.element !== 'neutral' && atkSp.elements.includes(move.element)) dmg *= STAB;

  // 공명 1단계+: 해당 속성 +15%
  if (move.element !== 'neutral' && res(state, side, move.element) >= 1) dmg *= 1.15;
  // 속성 부적 +20%
  if (side === 'p' && state.ctx.charms.includes('amp_' + move.element)) dmg *= 1.2;
  if (side === 'p' && state.ctx.modifier === 'monoBlaze' && move.element === 'blaze') dmg *= 1.25;
  // 역전의 배지
  if (hasCharm(state, side, 'underdog') && atkMon.hp / maxHp(atkMon) <= 0.35) dmg *= 1.35;
  // 화상: 공격력 저하
  if (atkMon.status === 'burn') dmg *= 0.75;
  // 대지 공명 2단계: 받는 피해 -15%
  if (hasRes2(state, other(side), 'terra')) dmg *= 0.85;
  dmg *= damageMods(state, side, atkMon, defMon);

  let crit = false;
  if (rng) {
    let critP = BASE_CRIT + (move.effect?.critBonus ?? 0);
    if (hasCharm(state, side, 'critLens')) critP += 0.1;
    if (hasRes2(state, side, 'umbra')) critP += 0.15;
    if (side === 'p' && hasCharm(state, side, 'firstBlood') && !state.firstBloodUsed) critP = 1;
    crit = rng.chance(critP);
    if (crit) dmg *= 1.5;
    dmg *= 0.85 + rng.next() * 0.15;
  } else {
    dmg *= 0.925;
  }
  return { dmg: Math.max(1, Math.floor(dmg)), eff, crit };
}

/** v0.2 부적·접두사·각성 피해 배율 (공격 측 side 기준) */
function damageMods(state: BattleState, side: Side, atkMon: BattleMonster, defMon: BattleMonster): number {
  let m = 1;
  const ctx = state.ctx;
  const def = other(side);
  // 공격 측 (플레이어)
  if (side === 'p') {
    if (hasCharm(state, 'p', 'glassHeart')) m *= 1.35;
    if (hasCharm(state, 'p', 'lonewolf') && state.p.team.length === 1) m *= 1.5;
    if (hasCharm(state, 'p', 'collector')) m *= 1 + 0.04 * state.p.team.length;
    if (hasCharm(state, 'p', 'catalyst') && defMon.status) m *= 1.3;
    if (hasCharm(state, 'p', 'goldenTouch')) m *= 1 + Math.min(0.4, Math.floor((ctx.gold ?? 0) / 100) * 0.04);
    if (hasCharm(state, 'p', 'snowball')) m *= 1 + 0.03 * (ctx.snowball ?? 0);
    if (hasCharm(state, 'p', 'overcharge') && state.overchargeNow) m *= 1.3;
  } else {
    if ((ctx.ascension ?? 0) >= 8) m *= 1.1;
    if (hasAffix(state, 'e', 'enraged') && atkMon.hp / maxHp(atkMon) <= 0.5) m *= 1.3;
  }
  // 방어 측
  if (def === 'p') {
    if (hasCharm(state, 'p', 'glassHeart')) m *= 1.2;
    if (hasCharm(state, 'p', 'lonewolf') && state.p.team.length === 1) m *= 0.75;
  } else if (hasAffix(state, 'e', 'armored')) m *= 0.8;
  return m;
}

// ─────────── AI ───────────
export function chooseAiMove(state: BattleState, side: Side, rng: Rng | null): number {
  const me = activeOf(state, side);
  const foe = activeOf(state, other(side));
  const en = state[side].en;
  const myStages = state[side].stages;
  const foeStages = state[other(side)].stages;
  // 변화기 가치는 "최선 공격기 기대피해" 대비 비율로 환산 → 레벨과 무관하게 일관된 판단
  const bestDmg = Math.max(
    1,
    ...me.moves.map((id) => getMove(id)).filter((m) => m.cost <= en && m.power > 0).map((m) => expectedDamage(state, side, m)),
  );
  const hitsToKill = foe.hp / bestDmg;
  const hpPct = me.hp / maxHp(me);
  let best = 0;
  let bestScore = -Infinity;
  me.moves.forEach((id, idx) => {
    const mv = getMove(id);
    if (mv.cost > en) return;
    let score = 0;
    if (mv.power > 0) {
      score = expectedDamage(state, side, mv);
      if (score >= foe.hp) score += bestDmg + (mv.priority ?? 0) * bestDmg;
      score -= mv.cost * bestDmg * 0.04; // EN 절약 성향
    } else {
      const ef = mv.effect ?? {};
      // 곧 끝낼 수 있는 상대에게 변화기는 낭비
      const longFight = hitsToKill > 2.5;
      if (ef.healPct) score = hpPct < 0.4 ? bestDmg * 1.6 : hpPct < 0.6 ? bestDmg * 0.6 : -1;
      else if (ef.status) score = foe.status || !longFight ? -1 : bestDmg * (ef.status === 'sleep' ? 1.3 : 1.05) * (mv.acc / 100);
      else if (ef.selfStat) {
        const room = Object.entries(ef.selfStat).reduce((a, [k, v]) => a + (myStages[k as StatKey] < 2 ? v : 0), 0);
        score = longFight && hpPct > 0.6 ? bestDmg * 0.45 * room : -1;
      } else if (ef.targetStat) {
        const room = Object.entries(ef.targetStat).reduce((a, [k, v]) => a + (foeStages[k as StatKey] > -2 ? -v : 0), 0);
        score = longFight && hpPct > 0.5 ? bestDmg * 0.35 * room : -1;
      }
    }
    if (rng) score *= 0.85 + rng.next() * 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = idx;
    }
  });
  return best;
}

// ─────────── 턴 진행 ───────────
interface QueuedAction {
  side: Side;
  kind: 'move';
  moveIdx: number;
  priority: number;
  speed: number;
}

export function resolveTurn(state: BattleState, action: PlayerAction, rng: Rng): BEvent[] {
  const ev: BEvent[] = [];
  if (state.over || state.needSwitch) return ev;

  const queue: QueuedAction[] = [];

  // 1) 플레이어 비-기술 행동은 항상 선행
  if (action.type === 'switch') {
    doSwitch(state, 'p', action.idx, ev);
  } else if (action.type === 'item') {
    useItem(state, action.item, action.target, ev);
  } else if (action.type === 'capture') {
    const done = tryCapture(state, action.item, rng, ev);
    if (done) return ev;
  } else {
    const mv = getMove(activeOf(state, 'p').moves[action.idx]);
    queue.push({ side: 'p', kind: 'move', moveIdx: action.idx, priority: mv.priority ?? 0, speed: effStat(state, 'p', 'spd') });
  }

  // 2) 적 행동: 턴 시작 때 공개한 예고를 그대로 실행 (교체해도 바뀌지 않음 → 상성 교체 전략)
  const planned = state.eIntent;
  const eIdx = planned !== null && activeOf(state, 'e').moves[planned] ? planned : chooseAiMove(state, 'e', rng);
  const eMove = getMove(activeOf(state, 'e').moves[eIdx]);
  queue.push({ side: 'e', kind: 'move', moveIdx: eIdx, priority: eMove.priority ?? 0, speed: effStat(state, 'e', 'spd') });

  queue.sort((a, b) => b.priority - a.priority || b.speed - a.speed || (rng.chance(0.5) ? 1 : -1));

  for (const q of queue) {
    if (state.over) break;
    const user = activeOf(state, q.side);
    if (user.hp <= 0) continue;
    // 교체 등으로 출전 몬스터가 바뀐 경우 해당 행동 무효
    executeMove(state, q.side, q.moveIdx, rng, ev);
    if (checkFaints(state, rng, ev)) break;
  }

  if (!state.over) endOfTurn(state, rng, ev);
  if (!state.over) state.turn += 1;
  planIntent(state, rng);
  return ev;
}

function canAct(state: BattleState, side: Side, rng: Rng, ev: BEvent[]): boolean {
  const m = activeOf(state, side);
  const name = displayName(m);
  if (m.status === 'sleep') {
    m.statusTurns = (m.statusTurns ?? 1) - 1;
    if (m.statusTurns <= 0) {
      m.status = undefined;
      ev.push({ t: 'status', side, status: null }, { t: 'msg', text: `${name}이(가) 잠에서 깼다!` });
      return true;
    }
    ev.push({ t: 'msg', text: `${name}은(는) 쿨쿨 자고 있다…` });
    return false;
  }
  if (m.status === 'shock' && rng.chance(0.25)) {
    ev.push({ t: 'msg', text: `${name}은(는) 몸이 저려 움직일 수 없다!` });
    return false;
  }
  if (m.status === 'chill') {
    if (rng.chance(0.2)) {
      ev.push({ t: 'msg', text: `${name}은(는) 얼어붙어 움직일 수 없다!` });
      return false;
    }
  }
  return true;
}

function executeMove(state: BattleState, side: Side, moveIdx: number, rng: Rng, ev: BEvent[]): void {
  const s = state[side];
  const user = activeOf(state, side);
  let moveId = user.moves[moveIdx];
  let mv = getMove(moveId);
  // EN 부족 시 기본기로 대체
  if (mv.cost > s.en) {
    const fallback = user.moves.findIndex((id) => getMove(id).cost === 0);
    moveId = fallback >= 0 ? user.moves[fallback] : 'tackle';
    mv = getMove(moveId);
  }
  if (!canAct(state, side, rng, ev)) return;

  state.overchargeNow = side === 'p' && s.en >= s.maxEn;
  s.en -= mv.cost;
  ev.push({ t: 'use', side, move: mv.id, name: displayName(user) });
  if (mv.cost > 0) ev.push({ t: 'en', side, en: s.en });
  // 🔁 메아리 방: EN 환급
  if (mv.cost > 0 && hasCharm(state, side, 'echoChamber') && rng.chance(0.3)) {
    s.en = Math.min(s.maxEn, s.en + mv.cost);
    ev.push({ t: 'en', side, en: s.en }, { t: 'msg', text: '🔁 메아리! EN이 돌아왔다.' });
  }

  const tSide = other(side);
  const target = activeOf(state, tSide);
  const ef = mv.effect ?? {};

  // 명중 판정 (자기 대상 변화기는 필중)
  const selfOnly = mv.power === 0 && !ef.status && !ef.targetStat;
  if (!selfOnly && !rng.chance(mv.acc / 100)) {
    ev.push({ t: 'miss', side: tSide }, { t: 'msg', text: '공격이 빗나갔다!' });
    return;
  }

  if (mv.power > 0) {
    const hits = ef.hits ? rng.int(ef.hits[0], ef.hits[1]) : 1;
    let total = 0;
    for (let h = 0; h < hits && target.hp > 0; h++) {
      const c = calcDamage(state, side, mv, rng);
      let dmg = c.dmg;
      // 불굴의 매듭
      if (dmg >= target.hp && hasCharm(state, tSide, 'lastStand') && !state[tSide].lastStandUsed && target.hp > 1) {
        dmg = target.hp - 1;
        state[tSide].lastStandUsed = true;
        ev.push({ t: 'msg', text: `🎗️ ${displayName(target)}은(는) 불굴의 의지로 버텼다!` });
      }
      target.hp = Math.max(0, target.hp - dmg);
      total += dmg;
      ev.push({ t: 'hit', side: tSide, dmg, hp: target.hp, eff: c.eff, crit: c.crit, hitNo: hits > 1 ? h + 1 : undefined });
      if (side === 'p') state.firstBloodUsed = true;
    }
    if (hits > 1) ev.push({ t: 'msg', text: `${hits}번 맞았다!` });

    // 흡수: 기술 drain + 흡혈 송곳니 + 새싹 공명2
    let drain = ef.drain ?? 0;
    if (hasCharm(state, side, 'vampFang')) drain += 0.12;
    if (hasRes2(state, side, 'bloom')) drain += 0.15;
    if (hasAffix(state, side, 'vampiric')) drain += 0.2;
    if (drain > 0 && user.hp > 0) heal(state, side, Math.ceil(total * drain), ev);

    // 반동
    if (ef.recoil) {
      const r = Math.max(1, Math.floor(total * ef.recoil));
      user.hp = Math.max(0, user.hp - r);
      ev.push({ t: 'hit', side, dmg: r, hp: user.hp, eff: 1, crit: false, src: 'recoil' }, { t: 'msg', text: `${displayName(user)}은(는) 반동 피해를 입었다!` });
    }
    // 가시 갑옷 반사
    if (hasCharm(state, tSide, 'thornMail') && user.hp > 0) {
      const r = Math.max(1, Math.floor(total * 0.2));
      user.hp = Math.max(0, user.hp - r);
      ev.push({ t: 'hit', side, dmg: r, hp: user.hp, eff: 1, crit: false, src: 'thorns' }, { t: 'msg', text: '🌵 가시에 찔렸다!' });
    }
    // 엘리트 가시 접두사
    if (hasAffix(state, tSide, 'thorns') && user.hp > 0) {
      const r = Math.max(1, Math.floor(total * 0.15));
      user.hp = Math.max(0, user.hp - r);
      ev.push({ t: 'hit', side, dmg: r, hp: user.hp, eff: 1, crit: false, src: 'thorns' }, { t: 'msg', text: '🌵 엘리트의 가시가 반격했다!' });
    }
    // 불꽃 공명2: 20% 화상
    if (hasRes2(state, side, 'blaze') && target.hp > 0 && !target.status && rng.chance(0.2)) {
      applyStatus(state, tSide, 'burn', rng, ev);
    }
  }

  // 부가효과
  if (ef.healPct && user.hp > 0) heal(state, side, Math.ceil(maxHp(user) * ef.healPct), ev);
  if (ef.cleanse && user.status) {
    user.status = undefined;
    ev.push({ t: 'status', side, status: null }, { t: 'msg', text: `${displayName(user)}의 상태이상이 나았다!` });
  }
  if (ef.selfStat) for (const [k, v] of Object.entries(ef.selfStat)) changeStage(state, side, k as StatKey, v, ev);

  if (target.hp > 0) {
    const chance = ef.statusChance ?? 1;
    const procs = rng.chance(chance);
    if (ef.status && procs) applyStatus(state, tSide, ef.status, rng, ev);
    if (ef.targetStat && (mv.power === 0 || procs)) {
      for (const [k, v] of Object.entries(ef.targetStat)) changeStage(state, tSide, k as StatKey, v, ev);
    }
  }
  state.overchargeNow = false;
  checkPhase(state, ev);
}

/** 👑 보스 2페이즈: HP 50% 이하가 되는 순간 1회 분노 각성 */
function checkPhase(state: BattleState, ev: BEvent[]): void {
  if (state.kind !== 'boss' || state.phase2) return;
  const boss = activeOf(state, 'e');
  if (getSpecies(boss.speciesId).rarity !== 'legend' || boss.hp <= 0 || boss.hp > maxHp(boss) / 2) return;
  state.phase2 = true;
  // 액트1 보스는 학습용: 공격 상승 없이 스피드만. 액트2+는 공격 +1, 각성5+ 추가 +1
  const atkUp = ((state.ctx.act ?? 0) >= 1 ? 1 : 0) + ((state.ctx.ascension ?? 0) >= 5 ? 1 : 0);
  ev.push({ t: 'phase', side: 'e' }, { t: 'msg', text: `💢 ${displayName(boss)}이(가) 분노 각성했다!` });
  if (atkUp > 0) changeStage(state, 'e', 'atk', atkUp, ev);
  changeStage(state, 'e', 'spd', 1, ev);
  if ((state.ctx.act ?? 0) >= 1) {
    state.e.en = state.e.maxEn;
    ev.push({ t: 'en', side: 'e', en: state.e.en });
  }
  if (boss.status) {
    boss.status = undefined;
    ev.push({ t: 'status', side: 'e', status: null });
  }
}

function heal(state: BattleState, side: Side, amount: number, ev: BEvent[]): void {
  const m = activeOf(state, side);
  const mx = maxHp(m);
  const before = m.hp;
  m.hp = Math.min(mx, m.hp + amount);
  if (m.hp > before) ev.push({ t: 'heal', side, amount: m.hp - before, hp: m.hp });
}

export function applyStatus(state: BattleState, side: Side, status: StatusId, rng: Rng, ev: BEvent[]): boolean {
  const m = activeOf(state, side);
  if (m.status || m.hp <= 0) return false;
  if (hasRes2(state, side, 'lumen')) {
    ev.push({ t: 'msg', text: '✨ 빛의 공명이 상태이상을 막았다!' });
    return false;
  }
  if (hasCharm(state, side, 'statusWard') && rng.chance(0.5)) {
    ev.push({ t: 'msg', text: '🧿 정화 부적이 상태이상을 막았다!' });
    return false;
  }
  // 동일 속성 면역
  const els = getSpecies(m.speciesId).elements;
  if ((status === 'burn' && els.includes('blaze')) || (status === 'shock' && els.includes('volt')) || (status === 'poison' && els.includes('bloom') && els.includes('umbra'))) {
    return false;
  }
  m.status = status;
  m.statusTurns = status === 'sleep' ? rng.int(1, 3) : status === 'chill' ? 3 : undefined;
  ev.push({ t: 'status', side, status }, { t: 'msg', text: `${displayName(m)}은(는) ${STATUS_NAME[status]} 상태가 됐다!` });
  return true;
}

function changeStage(state: BattleState, side: Side, stat: StatKey, delta: number, ev: BEvent[]): void {
  const st = state[side].stages;
  const before = st[stat];
  st[stat] = Math.max(-4, Math.min(4, before + delta));
  const real = st[stat] - before;
  if (real !== 0) ev.push({ t: 'stat', side, stat, delta: real });
}

function doSwitch(state: BattleState, side: Side, idx: number, ev: BEvent[], force = false): void {
  const s = state[side];
  if ((!force && idx === s.active) || !s.team[idx] || s.team[idx].hp <= 0) return;
  // 교체 시 빙결/수면 외 상태 유지, 스탯 단계 초기화
  s.active = idx;
  s.stages = zeroStages();
  if (side === 'p' && !state.participants.includes(s.team[idx].uid)) state.participants.push(s.team[idx].uid);
  ev.push({ t: 'switch', side, idx }, { t: 'msg', text: side === 'p' ? `가랏, ${displayName(s.team[idx])}!` : `상대는 ${displayName(s.team[idx])}을(를) 내보냈다!` });
}

/** 플레이어 기절 후 강제 교체 (턴 소모 없음) */
export function forceSwitch(state: BattleState, idx: number): BEvent[] {
  const ev: BEvent[] = [];
  if (!state.needSwitch) return ev;
  const m = state.p.team[idx];
  if (!m || m.hp <= 0) return ev;
  state.needSwitch = false;
  doSwitch(state, 'p', idx, ev, true);
  planIntent(state, null);
  return ev;
}

function useItem(state: BattleState, item: ItemId, target: number | undefined, ev: BEvent[]): void {
  const def = ITEMS[item];
  const tIdx = target ?? state.p.active;
  const m = state.p.team[tIdx];
  ev.push({ t: 'msg', text: `${def.icon} ${def.name} 사용!` });
  switch (item) {
    case 'potion':
    case 'superPotion': {
      const before = m.hp;
      healPct(m, item === 'potion' ? 0.4 : 1);
      if (tIdx === state.p.active) ev.push({ t: 'heal', side: 'p', amount: m.hp - before, hp: m.hp });
      else ev.push({ t: 'msg', text: `${displayName(m)}의 HP가 ${m.hp - before} 회복됐다.` });
      break;
    }
    case 'revive':
      if (m.hp <= 0) {
        healPct(m, 0.5, true);
        ev.push({ t: 'msg', text: `${displayName(m)}이(가) 부활했다!` });
      }
      break;
    case 'cleanser':
      if (m.status) {
        m.status = undefined;
        if (tIdx === state.p.active) ev.push({ t: 'status', side: 'p', status: null });
        ev.push({ t: 'msg', text: `${displayName(m)}의 상태이상이 나았다!` });
      }
      break;
    case 'energyDrink':
      state.p.en = Math.min(state.p.maxEn, state.p.en + 2);
      ev.push({ t: 'en', side: 'p', en: state.p.en });
      break;
    default:
      break;
  }
}

export function captureChance(state: BattleState, item: 'capsule' | 'hyperCapsule'): number {
  const m = activeOf(state, 'e');
  const sp = getSpecies(m.speciesId);
  if (state.kind !== 'wild' || sp.catchRate <= 0) return 0;
  const hpPct = m.hp / maxHp(m);
  let p = sp.catchRate * (1.6 - hpPct);
  if (m.status) p *= m.status === 'sleep' || m.status === 'chill' ? 1.8 : 1.4;
  if (item === 'hyperCapsule') p *= 2;
  if (state.ctx.charms.includes('tamerGlove')) p += 0.25;
  if (state.ctx.modifier === 'catchFever') p += 0.3;
  if ((state.ctx.ascension ?? 0) >= 9) p -= 0.1;
  return Math.max(0.02, Math.min(0.97, p));
}

/** 포획 시도. 성공하면 true(전투 종료) */
function tryCapture(state: BattleState, item: 'capsule' | 'hyperCapsule', rng: Rng, ev: BEvent[]): boolean {
  const p = captureChance(state, item);
  const target = activeOf(state, 'e');
  ev.push({ t: 'msg', text: `${ITEMS[item].icon} ${ITEMS[item].name}을(를) 던졌다!` });
  if (p <= 0) {
    ev.push({ t: 'msg', text: '이 에코링은 포획할 수 없다!' });
    return false;
  }
  // 3번 흔들림 판정: 각 흔들림 확률 = p^(1/3)
  const per = Math.pow(p, 1 / 3);
  let shakes = 0;
  while (shakes < 3 && rng.chance(per)) shakes++;
  const success = shakes === 3;
  ev.push({ t: 'capture', shakes, success });
  if (success) {
    target.status = undefined;
    delete target.power;
    delete target.hpMult;
    target.hp = maxHp(target); // 싱크 완료 → 풀HP로 합류
    state.caughtMon = target;
    state.over = 'caught';
    ev.push({ t: 'msg', text: `찰칵! ${displayName(target)}을(를) 포획했다!` });
    awardExp(state, target, ev, 0.7);
    ev.push({ t: 'end', result: 'caught' });
  } else {
    ev.push({ t: 'msg', text: shakes === 0 ? '앗, 바로 튀어나왔다!' : '아깝다! 조금만 더…!' });
  }
  return success;
}

/** 경험치 지급: 참전자 100%, 벤치 60%, 기절 30%, 레벨차 캐치업 보정 */
function awardExp(state: BattleState, defeated: BattleMonster, ev: BEvent[], mult = 1): void {
  const sp = getSpecies(defeated.speciesId);
  let base = (sp.exp * defeated.level) / 3.5;
  if (state.kind === 'trainer') base *= 1.3;
  if (state.kind === 'elite') base *= 1.5;
  if (state.kind === 'boss') base *= 1.6;
  if (state.ctx.charms.includes('expBoost')) base *= 1.3;
  base *= mult;
  for (const m of state.p.team) {
    // 캐치업 보정: 적보다 레벨이 낮으면 더 많이, 높으면 적게 (자연스러운 레벨 수렴)
    const catchUp = Math.max(0.3, Math.min(2.2, 1 + (defeated.level - m.level) * 0.12));
    const share = m.hp <= 0 ? 0.3 : state.participants.includes(m.uid) ? 1 : 0.6;
    const amt = Math.floor(base * catchUp * share);
    const r: LevelUpResult = gainExp(m, amt);
    for (const mv of r.pendingMoves) state.pendingLearn.push({ uid: m.uid, moveId: mv });
    ev.push({ t: 'exp', uid: m.uid, amount: amt, levels: r.levels, learned: r.learned });
  }
}

/** 기절 처리. 전투가 끝났거나 교체가 필요하면 true */
function checkFaints(state: BattleState, rng: Rng, ev: BEvent[]): boolean {
  let stop = false;
  const e = activeOf(state, 'e');
  if (e.hp <= 0 && !state.over) {
    ev.push({ t: 'faint', side: 'e' }, { t: 'msg', text: `${displayName(e)}은(는) 쓰러졌다!` });
    awardExp(state, e, ev);
    const next = state.e.team.findIndex((m) => m.hp > 0);
    if (next < 0) {
      state.over = 'win';
      ev.push({ t: 'end', result: 'win' });
      return true;
    }
    doSwitch(state, 'e', next, ev, true);
    stop = true; // 교체된 적은 이번 턴 행동하지 않음
  }
  const p = activeOf(state, 'p');
  if (p.hp <= 0 && !state.over) {
    ev.push({ t: 'faint', side: 'p' }, { t: 'msg', text: `${displayName(p)}은(는) 쓰러졌다…` });
    p.status = undefined;
    const phoenixIdx = state.ctx.charms.indexOf('phoenix');
    if (state.p.team.every((m) => m.hp <= 0) && phoenixIdx >= 0) {
      // 🪶 불사조 깃털: 런당 1회 (부적 소멸 → 런 데이터에도 반영됨)
      state.ctx.charms.splice(phoenixIdx, 1);
      for (const m of state.p.team) healPct(m, 0.5, true);
      ev.push({ t: 'revive' }, { t: 'msg', text: '🪶 불사조 깃털이 타오르며 모두가 되살아났다!' });
      return true; // 출전 중이던 에코링이 그대로 부활해 전투 계속
    }
    if (state.p.team.every((m) => m.hp <= 0)) {
      state.over = 'lose';
      ev.push({ t: 'end', result: 'lose' });
      return true;
    }
    state.needSwitch = true;
    stop = true;
  }
  void rng;
  return stop;
}

function endOfTurn(state: BattleState, rng: Rng, ev: BEvent[]): void {
  for (const side of ['p', 'e'] as Side[]) {
    const m = activeOf(state, side);
    if (m.hp <= 0) continue;
    const mx = maxHp(m);
    if (m.status === 'burn' || m.status === 'poison') {
      const d = Math.max(1, Math.floor(mx * (m.status === 'burn' ? 1 / 16 : 1 / 8)));
      m.hp = Math.max(0, m.hp - d);
      ev.push({ t: 'hit', side, dmg: d, hp: m.hp, eff: 1, crit: false, src: m.status }, { t: 'msg', text: `${displayName(m)}은(는) ${STATUS_NAME[m.status]} 피해를 입었다.` });
    }
    if (m.status === 'chill') {
      m.statusTurns = (m.statusTurns ?? 1) - 1;
      if (m.statusTurns <= 0) {
        m.status = undefined;
        ev.push({ t: 'status', side, status: null }, { t: 'msg', text: `${displayName(m)}의 얼음이 녹았다.` });
      }
    }
    if (m.hp > 0) {
      let regen = 0;
      if (hasCharm(state, side, 'mossRegen')) regen += 0.05;
      if (hasRes2(state, side, 'tide')) regen += 0.04;
      if (hasAffix(state, side, 'regen')) regen += 0.06;
      if (regen > 0 && m.hp < mx) heal(state, side, Math.ceil(mx * regen), ev);
    }
    // EN 회복
    const s = state[side];
    let gain = 1;
    if (hasRes2(state, side, 'volt') && rng.chance(0.3)) gain += 1;
    const before = s.en;
    s.en = Math.min(s.maxEn, s.en + gain);
    if (s.en !== before) ev.push({ t: 'en', side, en: s.en });
  }
  checkPhase(state, ev);
  checkFaints(state, rng, ev);
}

/** 전투 종료 후 상태 정리 (런 파티 보존) */
export function cleanupAfterBattle(state: BattleState): void {
  for (const m of state.p.team) {
    if (m.status === 'sleep' || m.status === 'chill') m.status = undefined;
    m.statusTurns = undefined;
  }
}
