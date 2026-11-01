// 액트(바이옴), 공명 시너지, 데일리 모디파이어, 메타 업그레이드
import type { Element } from '../core/types';

export interface ActInfo {
  name: string;
  sub: string;
  bg: [string, string];
  boss: string;
  /** 일반 적 레벨 범위 [시작, 끝] */
  levels: [number, number];
  bossLevel: number;
}

export const ACTS: ActInfo[] = [
  { name: '이끼숲', sub: 'ACT 1 · Mossy Woods', bg: ['#0f2a1d', '#1f4d33'], boss: 'mossking', levels: [3, 10], bossLevel: 13 },
  { name: '폭풍 협곡', sub: 'ACT 2 · Storm Canyon', bg: ['#141a3a', '#2b3d7a'], boss: 'tempestwyrm', levels: [13, 24], bossLevel: 27 },
  { name: '에코 코어', sub: 'ACT 3 · Echo Core', bg: ['#1a0d2e', '#4a1f5c'], boss: 'eclipsion', levels: [27, 37], bossLevel: 41 },
];

export const MAP_ROWS = 11; // 0..9 일반, 10 보스
export const MAP_COLS = 5;

/** 공명(Resonance): 파티 내 같은 속성 수에 따른 세트 보너스 */
export interface Resonance {
  element: Element;
  t1: string;
  t2: string;
}

export const RESONANCES: Record<Exclude<Element, 'neutral'>, Resonance> = {
  blaze: { element: 'blaze', t1: '불꽃 피해 +15%', t2: '공격 시 20% 화상' },
  tide: { element: 'tide', t1: '물결 피해 +15%', t2: '매 턴 HP 4% 회복' },
  bloom: { element: 'bloom', t1: '새싹 피해 +15%', t2: '피해 15% 흡수' },
  volt: { element: 'volt', t1: '전류 피해 +15%', t2: '턴 시작 30% 확률 EN +1' },
  terra: { element: 'terra', t1: '대지 피해 +15%', t2: '받는 피해 -15%' },
  gale: { element: 'gale', t1: '바람 피해 +15%', t2: '스피드 +25%' },
  umbra: { element: 'umbra', t1: '그림자 피해 +15%', t2: '치명타 +15%p' },
  lumen: { element: 'lumen', t1: '빛 피해 +15%', t2: '상태이상 면역' },
};

export const RES_T1 = 2;
export const RES_T2 = 3;

export interface DailyModifier {
  id: string;
  name: string;
  desc: string;
}

export const DAILY_MODIFIERS: DailyModifier[] = [
  { id: 'glassCannon', name: '유리대포', desc: '모든 에코링 공격 +30%, 방어 -30%.' },
  { id: 'richRun', name: '골드 러시', desc: '골드 2배, 상점 가격 +50%.' },
  { id: 'speedDemon', name: '스피드 데몬', desc: '모든 적 스피드 +25%.' },
  { id: 'catchFever', name: '포획 열풍', desc: '포획 확률 +30%p, 시작 캡슐 +3.' },
  { id: 'monoBlaze', name: '불꽃 축제', desc: '야생 출현이 불꽃 속성 위주. 불꽃 피해 +25%.' },
  { id: 'ironman', name: '아이언맨', desc: '휴식 노드 회복량 절반. 클리어 시 결정 +50%.' },
];

export interface MetaUpgrade {
  id: string;
  name: string;
  desc: string;
  max: number;
  cost: (lv: number) => number;
}

export const META_UPGRADES: MetaUpgrade[] = [
  { id: 'startGold', name: '용돈 주머니', desc: '시작 골드 +40', max: 5, cost: (l) => 30 + l * 30 },
  { id: 'startCapsule', name: '캡슐 벨트', desc: '시작 캡슐 +1', max: 3, cost: (l) => 40 + l * 40 },
  { id: 'startPotion', name: '응급 키트', desc: '시작 포션 +1', max: 3, cost: (l) => 30 + l * 35 },
  { id: 'starterLevel', name: '특훈', desc: '스타터 시작 레벨 +1', max: 5, cost: (l) => 50 + l * 50 },
  { id: 'rerollShop', name: '상점 VIP', desc: '상점 진열 +1', max: 2, cost: (l) => 80 + l * 80 },
];

export const STARTER_UNLOCK_COST: Record<string, number> = {
  zaprit: 120,
  gloomouse: 200,
};
