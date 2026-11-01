// ─────────────────────────────────────────────────────────────
// ECHOLING 핵심 타입 정의
// 모든 게임 상태는 JSON 직렬화 가능해야 한다 (모바일 자동저장).
// ─────────────────────────────────────────────────────────────

export type Element =
  | 'neutral'
  | 'blaze'
  | 'tide'
  | 'bloom'
  | 'volt'
  | 'terra'
  | 'gale'
  | 'umbra'
  | 'lumen';

export type StatusId = 'burn' | 'poison' | 'shock' | 'chill' | 'sleep';

export type StatKey = 'atk' | 'def' | 'spd';

export interface BaseStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

/** 프로시저럴 SVG 스프라이트 파라미터 (오리지널 아트) */
export interface Look {
  body: 'round' | 'tall' | 'blob' | 'quad' | 'bird' | 'serpent' | 'golem';
  ears: 'cat' | 'bunny' | 'horn' | 'none' | 'fin' | 'leaf' | 'antenna' | 'crown' | 'wing';
  tail: 'flame' | 'leaf' | 'fin' | 'bolt' | 'none' | 'wisp' | 'fluff' | 'spike';
  eyes: 'cute' | 'fierce' | 'sleepy' | 'mono';
  color: string;
  accent: string;
  /** 0.8 ~ 1.3 */
  scale: number;
}

export interface Species {
  id: string;
  name: string;
  en: string;
  elements: Element[];
  base: BaseStats;
  /** 경험치 기본 보상 */
  exp: number;
  /** 0~1, 높을수록 잡기 쉬움 */
  catchRate: number;
  /** [레벨, 기술ID] — 해당 레벨 도달 시 습득 */
  learnset: [number, string][];
  evolveTo?: string;
  evolveLevel?: number;
  look: Look;
  /** 한줄 도감 설명 */
  dex: string;
  rarity: 'common' | 'rare' | 'epic' | 'legend';
  /** 야생 출현 액트 (0,1,2). 비어있으면 야생 출현 X */
  acts: number[];
}

export interface MoveEffect {
  status?: StatusId;
  statusChance?: number;
  /** 대상 스탯 단계 변화 */
  targetStat?: Partial<Record<StatKey, number>>;
  /** 자신 스탯 단계 변화 */
  selfStat?: Partial<Record<StatKey, number>>;
  /** 최대 HP 대비 회복 비율 */
  healPct?: number;
  /** 준 피해 대비 흡수 비율 */
  drain?: number;
  /** 준 피해 대비 반동 비율 */
  recoil?: number;
  /** 다단 히트 [min,max] */
  hits?: [number, number];
  /** 치명타 보너스 */
  critBonus?: number;
  /** 자신의 상태이상 회복 */
  cleanse?: boolean;
}

export interface Move {
  id: string;
  name: string;
  element: Element;
  /** 0 이면 변화기 */
  power: number;
  /** 0~100 */
  acc: number;
  /** 에코 에너지(EN) 소모 0~3 */
  cost: number;
  priority?: number;
  effect?: MoveEffect;
  desc: string;
}

export interface Monster {
  uid: string;
  speciesId: string;
  nickname?: string;
  level: number;
  exp: number;
  hp: number;
  /** 최대 4개 */
  moves: string[];
  status?: StatusId;
  /** 상태이상 잔여 턴 (수면 등) */
  statusTurns?: number;
  /** 개체값 0~15 — 같은 종이라도 개성 */
  iv: BaseStats;
  /** 빛나는 개체 (1/128) */
  shiny?: boolean;
}

export interface ComputedStats {
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
}

export type ItemId =
  | 'potion'
  | 'superPotion'
  | 'revive'
  | 'capsule'
  | 'hyperCapsule'
  | 'cleanser'
  | 'candy'
  | 'energyDrink';

export type NodeType =
  | 'battle'
  | 'trainer'
  | 'elite'
  | 'event'
  | 'shop'
  | 'rest'
  | 'treasure'
  | 'boss';

export interface MapNode {
  id: string;
  row: number;
  col: number;
  type: NodeType;
  next: string[];
}

export interface ActMap {
  act: number;
  nodes: Record<string, MapNode>;
  rows: number;
  cols: number;
}

export interface RunState {
  version: number;
  seed: number;
  /** RNG 내부 상태 (재현성/세이브스컴 방지) */
  rngState: number;
  mode: 'normal' | 'daily';
  dailyModifier?: string;
  act: number;
  map: ActMap;
  currentNodeId: string | null;
  visited: string[];
  party: Monster[];
  /** 파티 초과분 보관함 */
  box: Monster[];
  gold: number;
  items: Partial<Record<ItemId, number>>;
  charms: string[];
  floorsCleared: number;
  battlesWon: number;
  caught: number;
  startedAt: number;
  uidCounter: number;
  /** 대기중인 보상/화면 등 */
  pending?: PendingScreen;
  /** 각성(난이도) 단계 0~10 */
  ascension: number;
  /** 눈덩이 부적 누적 스택 */
  snowball: number;
}

export type PendingScreen =
  | { kind: 'reward'; options: RewardOption[]; gold: number; title: string; battleKind?: 'wild' | 'trainer' | 'elite' | 'boss'; rerolls?: number }
  | { kind: 'shop'; stock: ShopEntry[] }
  | { kind: 'event'; eventId: string }
  | { kind: 'rest' }
  | { kind: 'treasure'; options: RewardOption[] }
  | { kind: 'battle' }
  | { kind: 'actClear' }
  | { kind: 'blessing'; options: string[] };

export type RewardOption =
  | { kind: 'charm'; charmId: string }
  | { kind: 'item'; itemId: ItemId; qty: number }
  | { kind: 'gold'; amount: number }
  | { kind: 'monster'; speciesId: string; level: number }
  | { kind: 'move'; moveId: string };

export interface ShopEntry {
  id: string;
  kind: 'item' | 'charm' | 'monster';
  ref: string;
  price: number;
  qty: number;
  sold?: boolean;
  level?: number;
}

export interface MetaSave {
  version: number;
  shards: number;
  unlockedStarters: string[];
  seen: string[];
  caught: string[];
  bestFloor: number;
  totalRuns: number;
  wins: number;
  upgrades: Record<string, number>;
  dailyBest: Record<string, number>;
  settings: Settings;
  /** 첫 실행 튜토리얼 완료 */
  tutorialDone: boolean;
  /** 해금된 최대 각성 단계 */
  maxAscension: number;
}

export interface Settings {
  speed: 1 | 2 | 3;
  haptics: boolean;
  sound: boolean;
  reduceMotion: boolean;
}
