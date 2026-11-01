// 🧭 플레이어 조언 로직 (순수 함수) — 위험도, 보스 준비도, 패배 원인 분석
import type { Element, MapNode, Monster, RunState } from '../core/types';
import { ELEMENTS, STRONG, effectiveness } from '../data/elements';
import { ACTS } from '../data/world';
import { getSpecies } from '../data/species';
import { enemyLevel, asc } from './run';
import type { BattleKind } from './battle';

export type Danger = 'easy' | 'fair' | 'risky' | 'deadly';

export const DANGER_LABEL: Record<Danger, string> = { easy: '쉬움', fair: '적정', risky: '위험', deadly: '매우 위험' };

/** 적 레벨과 내 레벨 차이로 위험도 산정 (엘리트·보스는 한 단계 가중) */
export function dangerOf(enemyLv: number, myLv: number, kind: BattleKind = 'wild'): Danger {
  const gap = enemyLv - myLv + (kind === 'elite' ? 2 : kind === 'boss' ? 3 : 0);
  if (gap <= -3) return 'easy';
  if (gap <= 1) return 'fair';
  if (gap <= 4) return 'risky';
  return 'deadly';
}

export function nodeKind(node: MapNode): BattleKind | null {
  return node.type === 'battle' ? 'wild' : node.type === 'trainer' ? 'trainer' : node.type === 'elite' ? 'elite' : node.type === 'boss' ? 'boss' : null;
}

/** 노드의 예상 적 레벨 (각성 보정 포함) */
export function expectedEnemyLevel(run: RunState, node: MapNode): number | null {
  const kind = nodeKind(node);
  if (!kind) return null;
  return enemyLevel(run.act, node.row, kind) + (asc(run, 6) ? 1 : 0) + (asc(run, 10) ? 1 : 0);
}

export function bestLevel(party: Monster[]): number {
  return party.reduce((m, x) => Math.max(m, x.hp > 0 ? x.level : 0), 0) || party[0]?.level || 1;
}

export interface Readiness {
  bossLevel: number;
  myBest: number;
  danger: Danger;
}

/** 👑 보스 준비도 */
export function bossReadiness(run: RunState): Readiness {
  const bossLevel = ACTS[run.act].bossLevel + (asc(run, 6) ? 1 : 0) + (asc(run, 10) ? 1 : 0);
  const myBest = bestLevel(run.party);
  return { bossLevel, myBest, danger: dangerOf(bossLevel, myBest, 'boss') };
}

/** 이 속성(복합 포함)을 상대로 실제 배율이 1보다 큰 공격 속성 — 배율 높은 순 */
export function counterElements(defs: Element[]): Element[] {
  return (Object.keys(STRONG) as Element[])
    .map((atk) => [atk, effectiveness(atk, defs)] as const)
    .filter(([, m]) => m > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([atk]) => atk);
}

export interface DefeatCause {
  enemySpecies: string;
  enemyLevel: number;
  moveId?: string;
  myBestLevel: number;
  kind: BattleKind;
}

/** 패배 원인 → 다음 런을 위한 조언 문장들 */
export function defeatAdvice(c: DefeatCause): string[] {
  const tips: string[] = [];
  const gap = c.enemyLevel - c.myBestLevel;
  if (gap >= 2) tips.push(`레벨이 ${gap} 부족했어요. 보스·엘리트 전에 일반 전투 노드를 더 거쳐 성장하세요.`);
  const els = getSpecies(c.enemySpecies).elements;
  const counters = counterElements(els);
  if (counters.length) {
    const name = (e: Element) => ELEMENTS[e].name;
    tips.push(`${els.map(name).join('·')} 속성에는 ${counters.map(name).join('·')} 속성 기술이 효과 굉장해요. 이 속성 동료를 키워보세요.`);
  }
  if (c.kind === 'boss') tips.push('보스는 HP 50%에서 분노해요. 강한 기술(EN)을 분노 직후를 위해 아껴두세요.');
  if (tips.length < 3) tips.push('적의 「다음 행동」 예고가 「위험!」이면 교체로 피하는 게 기본이에요.');
  return tips.slice(0, 3);
}
