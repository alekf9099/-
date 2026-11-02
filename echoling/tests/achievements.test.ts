import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, LOCKED_CHARMS, evaluateAchievements } from '../src/data/achievements';
import { newRun, battleRewards, makeShop } from '../src/game/run';
import { defaultMeta } from '../src/game/meta';

describe('🏆 업적', () => {
  it('ID 고유 & 보상 존재', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) expect(a.reward.shards || a.reward.charm).toBeTruthy();
    // 잠긴 부적은 모두 어떤 업적의 보상
    for (const c of LOCKED_CHARMS) expect(ACHIEVEMENTS.some((a) => a.reward.charm === c), c).toBe(true);
  });
  it('잠긴 부적은 보상·상점에 등장하지 않음', () => {
    for (let seed = 1; seed < 60; seed++) {
      const run = newRun('embercat', defaultMeta(), 'normal', seed);
      for (const k of ['wild', 'trainer', 'elite', 'boss'] as const) {
        for (const o of battleRewards(run, k).options) if (o.kind === 'charm') expect(LOCKED_CHARMS).not.toContain(o.charmId);
      }
      for (const e of makeShop(run, defaultMeta())) if (e.kind === 'charm') expect(LOCKED_CHARMS).not.toContain(e.ref);
    }
  });
  it('달성 시 보상 지급 · 부적 해금 · 진행 중 런에서도 즉시 해제, 중복 달성 없음', () => {
    const meta = defaultMeta();
    const run = newRun('embercat', meta, 'normal', 5);
    run.battlesWon = 1;
    run.bossesWon = 1;
    const got = evaluateAchievements({ meta, run });
    expect(got.map((a) => a.id)).toEqual(expect.arrayContaining(['first_win', 'act1']));
    expect(meta.shards).toBe(10);
    expect(meta.unlockedCharms).toContain('snowball');
    expect(run.lockedCharms).not.toContain('snowball');
    expect(evaluateAchievements({ meta, run })).toHaveLength(0);
    // 다음 런부터 잠금 해제 상태로 시작
    expect(newRun('embercat', meta, 'normal', 6).lockedCharms).not.toContain('snowball');
  });
  it('승리 업적은 런 종료 판정에서만', () => {
    const meta = defaultMeta();
    const run = newRun('embercat', meta, 'normal', 7, 3);
    expect(evaluateAchievements({ meta, run }).some((a) => a.id === 'victory')).toBe(false);
    const got = evaluateAchievements({ meta, run, ended: { victory: true } }).map((a) => a.id);
    expect(got).toEqual(expect.arrayContaining(['victory', 'ascended']));
  });
});
