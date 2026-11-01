import type { Move } from '../core/types';

// EN(에코 에너지) 설계 원칙
//  0 EN: 기본기 (위력 35~50) — 항상 사용 가능
//  1 EN: 주력기 (위력 60~75 또는 부가효과)
//  2 EN: 강력기 (위력 85~100)
//  3 EN: 궁극기 (위력 120+ / 강한 부가효과)
//  EN은 매 턴 +1, 최대 3 (부적으로 확장 가능)

const list: Move[] = [
  // ── 무속성
  { id: 'tackle', name: '몸통박치기', element: 'neutral', power: 40, acc: 100, cost: 0, desc: '기본 공격.' },
  { id: 'quickJab', name: '퀵잽', element: 'neutral', power: 35, acc: 100, cost: 0, priority: 1, desc: '반드시 먼저 공격한다.' },
  { id: 'focus', name: '집중', element: 'neutral', power: 0, acc: 100, cost: 0, effect: { selfStat: { atk: 1 } }, desc: '공격 +1단계.' },
  { id: 'guard', name: '단단해지기', element: 'neutral', power: 0, acc: 100, cost: 0, effect: { selfStat: { def: 1 } }, desc: '방어 +1단계.' },
  { id: 'growl', name: '으르렁', element: 'neutral', power: 0, acc: 100, cost: 0, effect: { targetStat: { atk: -1 } }, desc: '상대 공격 -1단계.' },
  { id: 'rest', name: '낮잠', element: 'neutral', power: 0, acc: 100, cost: 2, effect: { healPct: 0.5, cleanse: true }, desc: 'HP 50% 회복 + 상태이상 해제.' },
  { id: 'echoBurst', name: '에코 버스트', element: 'neutral', power: 130, acc: 90, cost: 3, effect: { recoil: 0.25 }, desc: '반동 25%의 필살 일격.' },

  // ── 불꽃
  { id: 'ember', name: '불씨', element: 'blaze', power: 40, acc: 100, cost: 0, effect: { status: 'burn', statusChance: 0.1 }, desc: '10% 화상.' },
  { id: 'flameClaw', name: '화염 할퀴기', element: 'blaze', power: 70, acc: 95, cost: 1, effect: { status: 'burn', statusChance: 0.2, critBonus: 0.1 }, desc: '20% 화상, 치명타 +10%.' },
  { id: 'heatWave', name: '열풍', element: 'blaze', power: 90, acc: 90, cost: 2, effect: { status: 'burn', statusChance: 0.3 }, desc: '30% 화상.' },
  { id: 'inferno', name: '인페르노', element: 'blaze', power: 130, acc: 85, cost: 3, effect: { status: 'burn', statusChance: 0.5 }, desc: '50% 화상의 대화염.' },
  { id: 'warmUp', name: '워밍업', element: 'blaze', power: 0, acc: 100, cost: 1, effect: { selfStat: { atk: 1, spd: 1 } }, desc: '공격·스피드 +1단계.' },

  // ── 물결
  { id: 'splash', name: '물대포', element: 'tide', power: 40, acc: 100, cost: 0, desc: '기본 물 공격.' },
  { id: 'bubbleBeam', name: '버블빔', element: 'tide', power: 65, acc: 100, cost: 1, effect: { targetStat: { spd: -1 }, statusChance: 0.3 }, desc: '30% 상대 스피드 -1.' },
  { id: 'tidalCrash', name: '타이달 크래시', element: 'tide', power: 95, acc: 90, cost: 2, desc: '파도로 들이받는다.' },
  { id: 'tsunami', name: '쓰나미', element: 'tide', power: 125, acc: 85, cost: 3, effect: { targetStat: { def: -1 } }, desc: '상대 방어 -1단계.' },
  { id: 'aquaVeil', name: '아쿠아 베일', element: 'tide', power: 0, acc: 100, cost: 1, effect: { healPct: 0.3, cleanse: true }, desc: 'HP 30% 회복 + 정화.' },

  // ── 새싹
  { id: 'leafCut', name: '잎날', element: 'bloom', power: 40, acc: 100, cost: 0, effect: { critBonus: 0.1 }, desc: '치명타 +10%.' },
  { id: 'vineDrain', name: '덩굴 흡수', element: 'bloom', power: 60, acc: 100, cost: 1, effect: { drain: 0.5 }, desc: '준 피해 50% 흡수.' },
  { id: 'sporeCloud', name: '포자 구름', element: 'bloom', power: 0, acc: 85, cost: 1, effect: { status: 'sleep', statusChance: 1 }, desc: '상대를 잠재운다.' },
  { id: 'toxicThorn', name: '독가시', element: 'bloom', power: 50, acc: 100, cost: 1, effect: { status: 'poison', statusChance: 0.5 }, desc: '50% 중독.' },
  { id: 'solarBloom', name: '솔라 블룸', element: 'bloom', power: 120, acc: 90, cost: 3, effect: { drain: 0.25 }, desc: '피해 25% 흡수.' },
  { id: 'petalStorm', name: '꽃잎 폭풍', element: 'bloom', power: 90, acc: 95, cost: 2, desc: '꽃잎을 흩날린다.' },

  // ── 전류
  { id: 'spark', name: '스파크', element: 'volt', power: 40, acc: 100, cost: 0, effect: { status: 'shock', statusChance: 0.1 }, desc: '10% 감전.' },
  { id: 'voltDash', name: '볼트 대시', element: 'volt', power: 60, acc: 100, cost: 1, priority: 1, desc: '선제 전기 돌진.' },
  { id: 'thunderFang', name: '천둥 이빨', element: 'volt', power: 80, acc: 95, cost: 2, effect: { status: 'shock', statusChance: 0.3 }, desc: '30% 감전.' },
  { id: 'gigavolt', name: '기가볼트', element: 'volt', power: 135, acc: 80, cost: 3, effect: { status: 'shock', statusChance: 0.3 }, desc: '명중 불안정한 초전압.' },
  { id: 'charge', name: '충전', element: 'volt', power: 0, acc: 100, cost: 0, effect: { selfStat: { spd: 2 } }, desc: '스피드 +2단계.' },

  // ── 대지
  { id: 'pebbleShot', name: '돌팔매', element: 'terra', power: 40, acc: 100, cost: 0, desc: '돌을 던진다.' },
  { id: 'quake', name: '지진', element: 'terra', power: 90, acc: 100, cost: 2, desc: '대지를 뒤흔든다.' },
  { id: 'rockSlam', name: '바위 내려찍기', element: 'terra', power: 70, acc: 90, cost: 1, effect: { targetStat: { spd: -1 } }, desc: '상대 스피드 -1.' },
  { id: 'ironWall', name: '철벽', element: 'terra', power: 0, acc: 100, cost: 1, effect: { selfStat: { def: 2 } }, desc: '방어 +2단계.' },
  { id: 'tectonic', name: '텍토닉 붕괴', element: 'terra', power: 140, acc: 85, cost: 3, effect: { selfStat: { spd: -1 } }, desc: '자신 스피드 -1.' },

  // ── 바람
  { id: 'gust', name: '돌풍', element: 'gale', power: 40, acc: 100, cost: 0, desc: '바람을 일으킨다.' },
  { id: 'aerialSlash', name: '에어 슬래시', element: 'gale', power: 70, acc: 95, cost: 1, effect: { critBonus: 0.15 }, desc: '치명타 +15%.' },
  { id: 'tailwind', name: '순풍', element: 'gale', power: 0, acc: 100, cost: 1, effect: { selfStat: { spd: 2 } }, desc: '스피드 +2단계.' },
  { id: 'cyclone', name: '사이클론', element: 'gale', power: 25, acc: 95, cost: 2, effect: { hits: [2, 5] }, desc: '2~5회 연속 공격.' },
  { id: 'skyfall', name: '스카이폴', element: 'gale', power: 125, acc: 90, cost: 3, effect: { critBonus: 0.2 }, desc: '치명타 +20%의 낙하 일격.' },

  // ── 그림자
  { id: 'shadowBite', name: '그림자 물기', element: 'umbra', power: 45, acc: 100, cost: 0, effect: { critBonus: 0.05 }, desc: '치명타 +5%.' },
  { id: 'hex', name: '저주', element: 'umbra', power: 65, acc: 100, cost: 1, effect: { targetStat: { def: -1 }, statusChance: 0.5 }, desc: '50% 상대 방어 -1.' },
  { id: 'nightmare', name: '악몽', element: 'umbra', power: 0, acc: 90, cost: 1, effect: { status: 'sleep', statusChance: 1, targetStat: { atk: -1 } }, desc: '수면 + 공격 -1.' },
  { id: 'soulDrain', name: '영혼 흡수', element: 'umbra', power: 80, acc: 100, cost: 2, effect: { drain: 0.5 }, desc: '피해 50% 흡수.' },
  { id: 'eclipse', name: '이클립스', element: 'umbra', power: 140, acc: 90, cost: 3, effect: { critBonus: 0.15 }, desc: '세계를 덮는 어둠.' },

  // ── 빛
  { id: 'glint', name: '반짝임', element: 'lumen', power: 40, acc: 100, cost: 0, desc: '빛을 반사한다.' },
  { id: 'prism', name: '프리즘 레이', element: 'lumen', power: 70, acc: 100, cost: 1, effect: { targetStat: { atk: -1 }, statusChance: 0.3 }, desc: '30% 상대 공격 -1.' },
  { id: 'blessing', name: '축복', element: 'lumen', power: 0, acc: 100, cost: 1, effect: { healPct: 0.4, cleanse: true }, desc: 'HP 40% 회복 + 정화.' },
  { id: 'radiance', name: '래디언스', element: 'lumen', power: 95, acc: 95, cost: 2, desc: '찬란한 빛줄기.' },
  { id: 'supernova', name: '슈퍼노바', element: 'lumen', power: 140, acc: 90, cost: 3, effect: { recoil: 0.2 }, desc: '반동 20%의 별빛 폭발.' },

  // ── 상태 계열 (복합)
  { id: 'frostBreath', name: '서리 숨결', element: 'tide', power: 55, acc: 95, cost: 1, effect: { status: 'chill', statusChance: 0.4 }, desc: '40% 빙결(스피드↓, 행동불능 확률).' },
  { id: 'venomFang', name: '맹독 이빨', element: 'umbra', power: 55, acc: 100, cost: 1, effect: { status: 'poison', statusChance: 0.4 }, desc: '40% 중독.' },
];

export const MOVES: Record<string, Move> = Object.fromEntries(list.map((m) => [m.id, m]));
export const MOVE_LIST = list;

export function getMove(id: string): Move {
  const m = MOVES[id];
  if (!m) throw new Error('Unknown move: ' + id);
  return m;
}
