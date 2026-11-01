import type { Element } from '../core/types';

export interface ElementInfo {
  id: Element;
  name: string;
  icon: string;
  color: string;
}

export const ELEMENTS: Record<Element, ElementInfo> = {
  neutral: { id: 'neutral', name: '무', icon: '◇', color: '#a8a8c0' },
  blaze: { id: 'blaze', name: '불꽃', icon: '🔥', color: '#ff6b3d' },
  tide: { id: 'tide', name: '물결', icon: '💧', color: '#3da5ff' },
  bloom: { id: 'bloom', name: '새싹', icon: '🌿', color: '#4cd97b' },
  volt: { id: 'volt', name: '전류', icon: '⚡', color: '#ffd23d' },
  terra: { id: 'terra', name: '대지', icon: '⛰️', color: '#c49a5a' },
  gale: { id: 'gale', name: '바람', icon: '🌪️', color: '#8ee6e0' },
  umbra: { id: 'umbra', name: '그림자', icon: '🌑', color: '#9b6bff' },
  lumen: { id: 'lumen', name: '빛', icon: '✨', color: '#fff1a8' },
};

/**
 * 상성표: 공격 속성 → 효과가 굉장한 방어 속성
 *  사이클 A: 불꽃 → 새싹 → 물결 → 불꽃
 *  사이클 B: 전류 → 바람 → 대지 → 전류
 *  교차: 물결→대지, 대지→불꽃, 새싹→대지, 전류→물결, 불꽃→바람, 바람→새싹
 *  그림자 ⇄ 빛 : 서로 약점 (하이리스크 하이리턴)
 */
export const STRONG: Record<Element, Element[]> = {
  neutral: [],
  blaze: ['bloom', 'gale'],
  tide: ['blaze', 'terra'],
  bloom: ['tide', 'terra'],
  volt: ['tide', 'gale'],
  terra: ['volt', 'blaze'],
  gale: ['bloom', 'terra'],
  umbra: ['lumen'],
  lumen: ['umbra'],
};

/** 상성 배율 — 원작류(2×)보다 완만하게: 한 번의 상성 불리로 런이 끝나지 않도록 */
export const SUPER = 1.6;
export const RESIST = 0.625;

/** 단일 속성 대 단일 속성 배율 */
export function singleEff(atk: Element, def: Element): number {
  if (atk === 'neutral' || def === 'neutral') return 1;
  if (STRONG[atk].includes(def)) return SUPER;
  if (STRONG[def].includes(atk)) return RESIST;
  if (atk === def) return RESIST;
  return 1;
}

/** 복합 속성 대응 (곱연산) */
export function effectiveness(atk: Element, defs: Element[]): number {
  return defs.reduce((m, d) => m * singleEff(atk, d), 1);
}

export function effLabel(mult: number): string {
  if (mult >= 2.5) return '초월 효과!!';
  if (mult > 1) return '효과 굉장!';
  if (mult === 0) return '효과 없음';
  if (mult <= 0.4) return '거의 안 통함…';
  if (mult < 1) return '효과 별로…';
  return '';
}
