// 💀 엘리트 접두사 — 같은 몬스터라도 매번 다른 대응을 요구
export interface Affix {
  id: string;
  name: string;
  icon: string;
  desc: string;
}

export const AFFIXES: Record<string, Affix> = {
  thorns: { id: 'thorns', name: '가시', icon: '🌵', desc: '받은 피해의 15%를 공격자에게 반사' },
  regen: { id: 'regen', name: '재생', icon: '💚', desc: '매 턴 최대 HP 6% 회복' },
  armored: { id: 'armored', name: '철갑', icon: '🛡️', desc: '받는 피해 -20%' },
  swift: { id: 'swift', name: '신속', icon: '💨', desc: '스피드 ×1.3' },
  vampiric: { id: 'vampiric', name: '흡혈', icon: '🦇', desc: '준 피해의 20% 흡수' },
  enraged: { id: 'enraged', name: '광폭', icon: '💢', desc: 'HP 50% 이하에서 피해 +30%' },
};

export const AFFIX_IDS = Object.keys(AFFIXES);
