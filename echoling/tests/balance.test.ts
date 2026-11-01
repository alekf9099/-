import { describe, expect, it } from 'vitest';
import { simulateRun } from './sim';

describe('밸런스 시뮬레이션 (봇 300런)', () => {
  it('승률과 사망 지점 분포가 목표 범위', () => {
    const N = 300;
    const starters = ['embercat', 'puddlo', 'sproutle'];
    const res = Array.from({ length: N }, (_, i) => simulateRun(1000 + i, starters[i % 3]));
    const wins = res.filter((r) => r.victory).length;
    const byAct = [0, 0, 0, 0];
    res.forEach((r) => byAct[r.act]++);
    const deaths: Record<string, number> = {};
    res.filter((r) => !r.victory).forEach((r) => { const k = r.deathAt!.split('R')[0]; deaths[k] = (deaths[k] ?? 0) + 1; });
    const perStarter = starters.map((_s, si) => res.filter((_, i) => i % 3 === si && res[i].victory).length);
    const avgLv = res.filter((r) => r.victory).map((r) => Math.max(...r.levels));
    console.log(`\n승률 ${(wins / N * 100).toFixed(1)}% | 도달 액트 분포 A1:${byAct[0]} A2:${byAct[1]} A3:${byAct[2]} 클리어:${byAct[3]}`);
    console.log('스타터별 승리', Object.fromEntries(starters.map((s, i) => [s, perStarter[i]])));
    console.log('사망 지점', Object.entries(deaths).sort((a, b) => b[1] - a[1]).slice(0, 10));
    console.log('클리어 시 최고 레벨 평균', avgLv.length ? (avgLv.reduce((a, b) => a + b, 0) / avgLv.length).toFixed(1) : '-');
    console.log('평균 파티 크기', (res.reduce((s, r) => s + r.partySize, 0) / N).toFixed(2));
    // 봇(단순 AI) 기준: 너무 쉽지도(>70%) 너무 어렵지도(<5%) 않게
    expect(wins / N).toBeGreaterThan(0.05);
    expect(wins / N).toBeLessThan(0.7);
  }, 60000);

  it('각성 10은 각성 0보다 어렵다', () => {
    const N = 200;
    const w = (a: number) => Array.from({ length: N }, (_, i) => simulateRun(5000 + i, ['embercat', 'puddlo', 'sproutle'][i % 3], undefined, a)).filter((r) => r.victory).length / N;
    const a0 = w(0), a5 = w(5), a10 = w(10);
    console.log(`각성별 봇 승률  A0 ${(a0 * 100).toFixed(1)}%  A5 ${(a5 * 100).toFixed(1)}%  A10 ${(a10 * 100).toFixed(1)}%`);
    expect(a10).toBeLessThan(a0);
  }, 120000);
});
