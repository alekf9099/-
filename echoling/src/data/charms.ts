import type { Element, ItemId } from '../core/types';

// 부적(Charm) = 런 한정 패시브. 빌드 다양성의 핵심.
export interface Charm {
  id: string;
  name: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legend';
  /** 빌드 축 태그 (UI 표시용) */
  tag?: string;
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
  // ── v0.2 빌드 정의 부적
  { id: 'snowball', name: '눈덩이', icon: '❄️', rarity: 'legend', tag: '성장', desc: '전투 승리마다 모든 피해 +3% 누적 (상한 없음).' },
  { id: 'echoChamber', name: '메아리 방', icon: '🔁', rarity: 'legend', tag: 'EN', desc: 'EN을 쓰는 기술 사용 시 30% 확률로 EN 환급.' },
  { id: 'phoenix', name: '불사조 깃털', icon: '🪶', rarity: 'legend', tag: '생존', desc: '런당 1회, 전멸하는 순간 파티 전원이 HP 50%로 부활 (사용 후 소멸).' },
  { id: 'goldenTouch', name: '미다스의 손', icon: '👑', rarity: 'legend', tag: '골드', desc: '보유 골드 100당 피해 +4% (최대 +40%).' },
  { id: 'glassHeart', name: '유리 심장', icon: '💔', rarity: 'epic', tag: '리스크', desc: '주는 피해 +35%, 받는 피해 +20%.' },
  { id: 'lonewolf', name: '외로운 늑대', icon: '🐺', rarity: 'epic', tag: '솔로', desc: '파티가 1마리일 때 주는 피해 +50%, 받는 피해 -25%.' },
  { id: 'overcharge', name: '과충전', icon: '⚡', rarity: 'epic', tag: 'EN', desc: 'EN이 가득 찬 상태에서 쓰는 기술 피해 +30%.' },
  { id: 'firstBlood', name: '선수필승', icon: '🩸', rarity: 'rare', tag: '버스트', desc: '매 전투 첫 공격은 치명타 확정.' },
  { id: 'collector', name: '수집가', icon: '📚', rarity: 'rare', tag: '풀파티', desc: '파티 1마리당 주는 피해 +4%.' },
  { id: 'catalyst', name: '촉매', icon: '🧪', rarity: 'rare', tag: '상태이상', desc: '상태이상에 걸린 적에게 주는 피해 +30%.' },
  { id: 'luckyClover', name: '네잎클로버', icon: '🍀', rarity: 'rare', tag: '선택지', desc: '전투 보상 선택지 +1.' },
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
