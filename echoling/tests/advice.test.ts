import { describe, expect, it } from 'vitest';
import { dangerOf, counterElements, bossReadiness, defeatAdvice, expectedEnemyLevel } from '../src/game/advice';
import { newRun } from '../src/game/run';
import { defaultMeta } from '../src/game/meta';
import { availableNodes } from '../src/game/map';

describe('🧭 조언 로직', () => {
  it('위험도: 레벨차와 노드 종류 반영', () => {
    expect(dangerOf(5, 10)).toBe('easy');
    expect(dangerOf(10, 10)).toBe('fair');
    expect(dangerOf(10, 10, 'elite')).toBe('risky');
    expect(dangerOf(14, 8, 'boss')).toBe('deadly');
  });
  it('상성 카운터 속성: 대지 → 물결·새싹·바람, 복합(새싹+대지) → 바람만', () => {
    expect(counterElements(['terra']).sort()).toEqual(['bloom', 'gale', 'tide']);
    expect(counterElements(['bloom', 'terra'])).toEqual(['gale']);
    expect(counterElements(['neutral'])).toEqual([]);
  });
  it('보스 준비도는 각성 레벨 보정 포함', () => {
    const r0 = newRun('embercat', defaultMeta(), 'normal', 1, 0);
    const r10 = newRun('embercat', defaultMeta(), 'normal', 1, 10);
    expect(bossReadiness(r10).bossLevel).toBe(bossReadiness(r0).bossLevel + 2);
    expect(bossReadiness(r0).danger).toBe('deadly');
  });
  it('노드 예상 적 레벨: 비전투 노드는 null', () => {
    const r = newRun('embercat', defaultMeta(), 'normal', 2);
    const n = availableNodes(r.map, null)[0];
    expect(expectedEnemyLevel(r, n)).toBeGreaterThan(0);
    expect(expectedEnemyLevel(r, { ...n, type: 'shop' })).toBeNull();
  });
  it('패배 조언: 레벨 부족·보스 팁 포함, 최대 3개', () => {
    const tips = defeatAdvice({ enemySpecies: 'mossking', enemyLevel: 12, myBestLevel: 8, kind: 'boss', moveId: 'rockSlam' });
    expect(tips.length).toBeLessThanOrEqual(3);
    expect(tips[0]).toContain('레벨이 4 부족');
    expect(tips.some((t) => t.includes('분노'))).toBe(true);
  });
});
