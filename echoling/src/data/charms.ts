import type { Element, ItemId } from '../core/types';

// 부적(Charm) = 런 한정 패시브. 빌드 다양성의 핵심.
export interface Charm {
  id: string;
  name: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic';
  desc: string;
  /** 속성 강화 부적 */
  element?: Element;
}

const elementCharm = (element: Element, name: string, icon: string): Charm => ({
  id: 'amp_' + element,
  name,
  icon,
  rarity: 'common',
  element,
  desc: `${name.split(' ')[0]} 속성 기술 피해 +20%.`,
});

const list: Charm[] = [
  elementCharm('blaze', '불꽃 심지', '🕯️'),
  elementCharm('tide', '물결 조개', '🐚'),
  elementCharm('bloom', '새싹 씨앗', '🌱'),
  elementCharm('volt', '전류 코일', '🔋'),
  elementCharm('terra', '대지 화석', '🦴'),
  elementCharm('gale', '바람 깃털', '🪶'),
  elementCharm('umbra', '그림자 가면', '🎭'),
  elementCharm('lumen', '빛 프리즘', '🔮'),
  { id: 'mossRegen', name: '재생 이끼', icon: '🍀', rarity: 'common', desc: '출전 중인 에코링이 매 턴 HP 5% 회복.' },
  { id: 'firstStrike', name: '선봉의 깃', icon: '🎌', rarity: 'common', desc: '전투 시작 시 EN +1.' },
  { id: 'luckyCoin', name: '행운 동전', icon: '🪙', rarity: 'common', desc: '획득 골드 +35%.' },
  { id: 'tamerGlove', name: '테이머 장갑', icon: '🧤', rarity: 'rare', desc: '포획 확률 +25%p.' },
  { id: 'critLens', name: '크리티컬 렌즈', icon: '🔍', rarity: 'rare', desc: '치명타 확률 +10%p.' },
  { id: 'vampFang', name: '흡혈 송곳니', icon: '🦷', rarity: 'rare', desc: '모든 공격 피해의 12% 흡수.' },
  { id: 'thornMail', name: '가시 갑옷', icon: '🌵', rarity: 'common', desc: '받은 피해의 20%를 반사.' },
  { id: 'expBoost', name: '성장 촉진제', icon: '📈', rarity: 'common', desc: '획득 경험치 +30%.' },
  { id: 'lastStand', name: '불굴의 매듭', icon: '🎗️', rarity: 'epic', desc: '전투당 1회, 쓰러질 피해를 HP 1로 버틴다.' },
  { id: 'doubleCore', name: '듀얼 코어', icon: '💠', rarity: 'epic', desc: '최대 EN +1 (3 → 4).' },
  { id: 'medkit', name: '휴대 구급함', icon: '🩹', rarity: 'common', desc: '전투 승리 시 파티 전원 HP 12% 회복.' },
  { id: 'resonator', name: '공명 증폭기', icon: '📡', rarity: 'epic', desc: '공명 발동 조건 -1 (2마리 → 1마리 / 3마리 → 2마리).' },
  { id: 'underdog', name: '역전의 배지', icon: '🥊', rarity: 'rare', desc: 'HP 35% 이하일 때 피해 +35%.' },
  { id: 'speedShoes', name: '질풍 신발', icon: '👟', rarity: 'common', desc: '스피드 +15%.' },
  { id: 'statusWard', name: '정화 부적', icon: '🧿', rarity: 'rare', desc: '상태이상 저항 50%.' },
  { id: 'bargain', name: '단골 카드', icon: '💳', rarity: 'common', desc: '상점 가격 -25%.' },
];

export const CHARMS: Record<string, Charm> = Object.fromEntries(list.map((c) => [c.id, c]));
export const CHARM_LIST = list;

export function getCharm(id: string): Charm {
  const c = CHARMS[id];
  if (!c) throw new Error('Unknown charm: ' + id);
  return c;
}

// ─────────── 소모품 ───────────
export interface ItemDef {
  id: ItemId;
  name: string;
  icon: string;
  price: number;
  desc: string;
  /** 전투 중 사용 가능 */
  battle: boolean;
  /** 대상 에코링 필요 */
  target: 'none' | 'ally' | 'fainted';
}

export const ITEMS: Record<ItemId, ItemDef> = {
  potion: { id: 'potion', name: '에코 포션', icon: '🧪', price: 40, desc: 'HP 40% 회복.', battle: true, target: 'ally' },
  superPotion: { id: 'superPotion', name: '슈퍼 포션', icon: '⚗️', price: 85, desc: 'HP 100% 회복.', battle: true, target: 'ally' },
  revive: { id: 'revive', name: '리바이브 칩', icon: '💖', price: 120, desc: '기절한 에코링을 HP 50%로 부활.', battle: true, target: 'fainted' },
  capsule: { id: 'capsule', name: '싱크 캡슐', icon: '🔵', price: 35, desc: '야생 에코링을 포획한다.', battle: true, target: 'none' },
  hyperCapsule: { id: 'hyperCapsule', name: '하이퍼 캡슐', icon: '🟣', price: 90, desc: '포획 확률 2배.', battle: true, target: 'none' },
  cleanser: { id: 'cleanser', name: '정화 스프레이', icon: '🫧', price: 30, desc: '상태이상 회복.', battle: true, target: 'ally' },
  candy: { id: 'candy', name: '레벨 캔디', icon: '🍬', price: 110, desc: '레벨 +1.', battle: false, target: 'ally' },
  energyDrink: { id: 'energyDrink', name: '에너지 드링크', icon: '🥤', price: 50, desc: '전투 중 EN +2.', battle: true, target: 'none' },
};
