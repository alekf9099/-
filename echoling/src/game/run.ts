// 런(1회 플레이) 진행 로직: 노드 진입 · 조우 생성 · 보상 · 상점 · 캠프
import type { ItemId, MapNode, MetaSave, Monster, RewardOption, RunState, ShopEntry, Species } from '../core/types';
import { Rng, dailySeed, hashString, todayKey } from '../core/rng';
import { ACTS, DAILY_MODIFIERS, MAP_ROWS } from '../data/world';
import { BOSSES, SPECIES_LIST, getSpecies, wildPool } from '../data/species';
import { CHARM_LIST, ITEMS } from '../data/charms';
import { MOVE_LIST } from '../data/moves';
import { generateMap } from './map';
import { type BattleMonster, createMonster, evolvedFormFor, healPct, maxHp } from './monster';
import { RUN_VERSION } from './meta';
import { type BattleKind, type BattleState, cleanupAfterBattle, computeResonance, createBattle } from './battle';

export const MAX_PARTY = 6;

/** 런 RNG: 상태를 RunState에 저장해 세이브스컴 방지 & 재현성 확보 */
export function runRng(run: RunState): Rng {
  return new Rng(run.rngState);
}
export function commitRng(run: RunState, rng: Rng): void {
  run.rngState = rng.state;
}

export function nextUid(run: RunState): string {
  run.uidCounter += 1;
  return 'm' + run.uidCounter;
}

export function newRun(starterId: string, meta: MetaSave, mode: 'normal' | 'daily' = 'normal', seedOverride?: number): RunState {
  const seed = seedOverride ?? (mode === 'daily' ? dailySeed() : (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
  const rng = new Rng(seed);
  const up = (id: string) => meta.upgrades[id] ?? 0;
  const run: RunState = {
    version: RUN_VERSION,
    seed,
    rngState: 0,
    mode,
    act: 0,
    map: generateMap(0, rng),
    currentNodeId: null,
    visited: [],
    party: [],
    box: [],
    gold: 60 + up('startGold') * 40,
    items: { potion: 2 + up('startPotion'), capsule: 3 + up('startCapsule') },
    charms: [],
    floorsCleared: 0,
    battlesWon: 0,
    caught: 0,
    startedAt: Date.now(),
    uidCounter: 0,
  };
  if (mode === 'daily') {
    const mod = DAILY_MODIFIERS[hashString(todayKey()) % DAILY_MODIFIERS.length];
    run.dailyModifier = mod.id;
    if (mod.id === 'catchFever') run.items.capsule = (run.items.capsule ?? 0) + 3;
  }
  const starter = createMonster(starterId, 5 + up('starterLevel'), rng, nextUid(run), { shinyChance: 1 / 64 });
  // 스타터는 개체값 하한 보장 (첫인상이 약하면 이탈률 ↑)
  starter.iv = { hp: Math.max(starter.iv.hp, 8), atk: Math.max(starter.iv.atk, 8), def: Math.max(starter.iv.def, 8), spd: Math.max(starter.iv.spd, 8) };
  starter.hp = maxHp(starter);
  run.party.push(starter);
  commitRng(run, rng);
  return run;
}

// ─────────── 레벨 스케일링 ───────────
export function enemyLevel(act: number, row: number, kind: BattleKind): number {
  const a = ACTS[act];
  if (kind === 'boss') return a.bossLevel;
  const t = row / (MAP_ROWS - 2);
  const base = Math.round(a.levels[0] + (a.levels[1] - a.levels[0]) * t);
  return base + (kind === 'elite' ? 2 : kind === 'trainer' ? 1 : 0);
}

const RARITY_W: Record<Species['rarity'], number> = { common: 60, rare: 28, epic: 8, legend: 0 };

function pickWild(rng: Rng, act: number, modifier?: string): Species {
  let pool = wildPool(act);
  if (modifier === 'monoBlaze' && rng.chance(0.6)) {
    const blaze = SPECIES_LIST.filter((s) => s.elements.includes('blaze') && s.acts.length > 0);
    if (blaze.length) pool = blaze;
  }
  return rng.weighted(pool.map((s) => [s, RARITY_W[s.rarity]] as [Species, number]));
}

const TRAINER_NAMES = ['캠퍼 하늘', '레인저 도윤', '스트리머 유나', '탐험가 준', '학생 테이머 서아', '바리스타 민호', '배달러 지호', '아이돌 연습생 리아', '등산러 태오', '고고학자 세린'];
const ELITE_NAMES = ['그림자 사냥꾼 카엘', '폭풍술사 아린', '철벽의 바론', '독안개 마녀 니케'];
const BOSS_TITLES = ['이끼숲의 군주', '하늘 협곡의 지배자', '모든 에코의 근원'];

/** 일반 적 스탯 보정 (플레이어는 1마리로 시작하므로 초반 완충) */
const WILD_POWER = [0.88, 0.97, 1.04];

export interface Encounter {
  kind: BattleKind;
  title: string;
  enemies: BattleMonster[];
}

export function makeEncounter(run: RunState, node: MapNode): Encounter {
  const rng = runRng(run);
  const act = run.act;
  const kind: BattleKind = node.type === 'boss' ? 'boss' : node.type === 'elite' ? 'elite' : node.type === 'trainer' ? 'trainer' : 'wild';
  const lvl = enemyLevel(act, node.row, kind);
  const mk = (sid: string, l: number, evolve = true): BattleMonster => createMonster(sid, Math.max(2, l), rng, nextUid(run), { evolve });
  let enc: Encounter;

  if (kind === 'wild') {
    const sp = pickWild(rng, act, run.dailyModifier);
    const m = mk(sp.id, lvl + rng.int(-1, 1));
    m.power = WILD_POWER[act];
    enc = { kind, title: `야생의 ${getSpecies(m.speciesId).name}이(가) 나타났다!`, enemies: [m] };
  } else if (kind === 'trainer') {
    const n = act === 0 ? 2 : 3;
    const enemies = Array.from({ length: n }, (_, i) => mk(pickWild(rng, act, run.dailyModifier).id, lvl - (n - 1 - i)));
    enemies.forEach((m) => (m.power = WILD_POWER[act]));
    enc = { kind, title: `${rng.pick(TRAINER_NAMES)}이(가) 승부를 걸어왔다!`, enemies };
  } else if (kind === 'elite') {
    const strong = wildPool(act).filter((s) => s.rarity !== 'common');
    const lead = mk(rng.pick(strong.length ? strong : wildPool(act)).id, lvl);
    lead.power = [1.05, 1.1, 1.12][act];
    lead.hpMult = [1.15, 1.25, 1.3][act];
    lead.hp = maxHp(lead);
    const enemies: BattleMonster[] = act === 0 ? [lead] : [mk(pickWild(rng, act).id, lvl - 2), lead];
    enc = { kind, title: `엘리트 ${rng.pick(ELITE_NAMES)}이(가) 앞을 막아섰다!`, enemies };
  } else {
    const boss = mk(BOSSES[act], lvl, false);
    boss.power = [0.95, 1.1, 1.18][act];
    boss.hpMult = [1.3, 2.2, 2.7][act];
    boss.hp = maxHp(boss);
    const escorts: BattleMonster[] = [];
    for (let i = 0; i < act; i++) escorts.push(mk(pickWild(rng, act).id, lvl - 4));
    enc = { kind, title: `${BOSS_TITLES[act]}, ${getSpecies(boss.speciesId).name}!`, enemies: [...escorts, boss] };
  }
  commitRng(run, rng);
  return enc;
}

// ─────────── 보상 ───────────
export function goldMult(run: RunState): number {
  let m = 1;
  if (run.charms.includes('luckyCoin')) m *= 1.35;
  if (run.dailyModifier === 'richRun') m *= 2;
  return m;
}

export function priceMult(run: RunState): number {
  let m = 1;
  if (run.charms.includes('bargain')) m *= 0.75;
  if (run.dailyModifier === 'richRun') m *= 1.5;
  return m;
}

function randomCharms(rng: Rng, run: RunState, n: number, minRarity?: 'rare'): string[] {
  const pool = CHARM_LIST.filter((c) => !run.charms.includes(c.id) && (!minRarity || c.rarity !== 'common'));
  const w: Record<string, number> = { common: 6, rare: 3, epic: 1 };
  const out: string[] = [];
  const cand = [...pool];
  while (out.length < n && cand.length) {
    const c = rng.weighted(cand.map((x) => [x, w[x.rarity]] as [typeof x, number]));
    out.push(c.id);
    cand.splice(cand.indexOf(c), 1);
  }
  return out;
}

const ITEM_WEIGHTS: [ItemId, number][] = [
  ['potion', 30],
  ['capsule', 26],
  ['superPotion', 10],
  ['revive', 9],
  ['hyperCapsule', 8],
  ['cleanser', 8],
  ['energyDrink', 7],
  ['candy', 5],
];

export function battleRewards(run: RunState, kind: BattleKind): { gold: number; options: RewardOption[] } {
  const rng = runRng(run);
  const baseGold = { wild: 22, trainer: 45, elite: 70, boss: 120 }[kind];
  const gold = Math.round((baseGold + rng.int(0, 12) + run.act * 10) * goldMult(run));
  const options: RewardOption[] = [];
  if (kind === 'elite' || kind === 'boss') {
    for (const c of randomCharms(rng, run, 3, kind === 'boss' ? 'rare' : undefined)) options.push({ kind: 'charm', charmId: c });
  } else {
    const items = new Set<ItemId>();
    while (items.size < 2) items.add(rng.weighted(ITEM_WEIGHTS));
    for (const it of items) options.push({ kind: 'item', itemId: it, qty: it === 'capsule' || it === 'potion' ? 2 : 1 });
    if (kind === 'trainer' && rng.chance(0.45)) {
      const c = randomCharms(rng, run, 1)[0];
      if (c) options.push({ kind: 'charm', charmId: c });
    } else if (rng.chance(0.35)) {
      // 새 기술 디스크
      const mv = rng.pick(MOVE_LIST.filter((m) => m.cost >= 1 && m.cost <= 2));
      options.push({ kind: 'move', moveId: mv.id });
    } else options.push({ kind: 'gold', amount: Math.round(30 * goldMult(run)) });
  }
  commitRng(run, rng);
  return { gold, options };
}

export function treasureRewards(run: RunState): RewardOption[] {
  const rng = runRng(run);
  const out = randomCharms(rng, run, 3).map((c) => ({ kind: 'charm', charmId: c }) as RewardOption);
  commitRng(run, rng);
  return out;
}

export function addMonster(run: RunState, m: Monster): 'party' | 'box' {
  if (run.party.length < MAX_PARTY) {
    run.party.push(m);
    return 'party';
  }
  run.box.push(m);
  return 'box';
}

export function addItem(run: RunState, id: ItemId, qty = 1): void {
  run.items[id] = (run.items[id] ?? 0) + qty;
}

export function useItemOutOfBattle(run: RunState, id: ItemId, target: Monster): string | null {
  if ((run.items[id] ?? 0) <= 0) return null;
  const def = ITEMS[id];
  let msg: string | null = null;
  switch (id) {
    case 'potion':
    case 'superPotion':
      if (target.hp <= 0 || target.hp >= maxHp(target)) return null;
      healPct(target, id === 'potion' ? 0.4 : 1);
      msg = `${def.name}: HP 회복!`;
      break;
    case 'revive':
      if (target.hp > 0) return null;
      healPct(target, 0.5, true);
      msg = '부활했다!';
      break;
    case 'cleanser':
      if (!target.status) return null;
      target.status = undefined;
      msg = '상태이상 회복!';
      break;
    default:
      return null;
  }
  run.items[id] = (run.items[id] ?? 1) - 1;
  return msg;
}

// ─────────── 상점 ───────────
export function makeShop(run: RunState, meta: MetaSave): ShopEntry[] {
  const rng = runRng(run);
  const pm = priceMult(run);
  const stock: ShopEntry[] = [];
  const itemPool: ItemId[] = ['potion', 'superPotion', 'revive', 'capsule', 'hyperCapsule', 'cleanser', 'energyDrink', 'candy'];
  const nItems = 4 + (meta.upgrades['rerollShop'] ?? 0);
  for (const id of rng.sample(itemPool, nItems)) {
    stock.push({ id: 'i_' + id, kind: 'item', ref: id, price: Math.round(ITEMS[id].price * pm), qty: id === 'capsule' || id === 'potion' ? 3 : 1 });
  }
  for (const c of randomCharms(rng, run, 2)) {
    const rarity = CHARM_LIST.find((x) => x.id === c)!.rarity;
    stock.push({ id: 'c_' + c, kind: 'charm', ref: c, price: Math.round({ common: 110, rare: 170, epic: 260 }[rarity] * pm), qty: 1 });
  }
  // 희귀 에코링 분양
  const rare = wildPool(run.act).filter((s) => s.rarity !== 'common');
  if (rare.length) {
    const level = Math.max(4, enemyLevel(run.act, 5, 'wild'));
    // 레벨에 맞는 진화 단계로 표시 (예: Lv.6 진화형 같은 부자연스러운 조합 방지)
    const sid = evolvedFormFor(rng.pick(rare).id, level);
    stock.push({ id: 'm_' + sid, kind: 'monster', ref: sid, price: Math.round((150 + run.act * 40) * pm), qty: 1, level });
  }
  commitRng(run, rng);
  return stock;
}

// ─────────── 캠프 ───────────
export function restHeal(run: RunState): void {
  const pct = run.dailyModifier === 'ironman' ? 0.3 : 0.6;
  for (const m of run.party) {
    healPct(m, pct, true);
    if (m.status) m.status = undefined;
  }
}

/** 액트 클리어 → 다음 액트 맵 생성 + 전원 회복. 마지막 액트면 true(승리) */
export function advanceAct(run: RunState): boolean {
  if (run.act >= ACTS.length - 1) return true;
  const rng = runRng(run);
  run.act += 1;
  run.map = generateMap(run.act, rng);
  run.currentNodeId = null;
  run.visited = [];
  for (const m of run.party) {
    healPct(m, 1, true);
    m.status = undefined;
  }
  commitRng(run, rng);
  return false;
}

export function aliveCount(run: RunState): number {
  return run.party.filter((m) => m.hp > 0).length;
}

/** 보스 판정용: 전체 종 중 보스 제외 */
export function catchableSpecies(): Species[] {
  return SPECIES_LIST.filter((s) => s.rarity !== 'legend');
}

/** 전투 종료 공통 처리 (UI · 시뮬레이터 공용) */
export function applyBattleOutcome(run: RunState, b: BattleState): { caughtWhere?: 'party' | 'box' } {
  cleanupAfterBattle(b);
  const out: { caughtWhere?: 'party' | 'box' } = {};
  if (b.over === 'win' || b.over === 'caught') {
    run.battlesWon += 1;
    // 승리 후 숨 고르기: 파티 10% 회복 (+휴대 구급함 12%), 기절한 동료도 10%로 일어남
    const pct = 0.1 + (run.charms.includes('medkit') ? 0.12 : 0);
    for (const m of run.party) healPct(m, pct, true);
  }
  if (b.over === 'caught' && b.caughtMon) {
    const m = b.caughtMon;
    m.statusTurns = undefined;
    out.caughtWhere = addMonster(run, m);
    run.caught += 1;
  }
  return out;
}

export function buildBattle(run: RunState, enc: Encounter): BattleState {
  return createBattle(enc.kind, enc.title, run.party, enc.enemies, {
    charms: run.charms,
    modifier: run.dailyModifier,
    resonance: computeResonance(run.party, run.charms),
  });
}
