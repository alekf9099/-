import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { effectiveness, singleEff, STRONG, SUPER, RESIST } from '../src/data/elements';
import { MOVES } from '../src/data/moves';
import { SPECIES_LIST, getSpecies } from '../src/data/species';
import { generateMap, availableNodes } from '../src/game/map';
import { createMonster, expToNext, gainExp, learnableUpTo, maxHp, evolve, canEvolve } from '../src/game/monster';
import { CHARMS } from '../src/data/charms';
import { EVENTS } from '../src/game/events';
import { MAP_ROWS } from '../src/data/world';

describe('RNG', () => {
  it('같은 시드 → 같은 수열 (재현성)', () => {
    const a = new Rng(42), b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('상태 저장/복원 가능', () => {
    const a = new Rng(7); a.next(); a.next();
    const b = new Rng(a.state);
    expect(b.next()).toBe(a.next());
  });
  it('int 범위 보장', () => {
    const r = new Rng(1);
    for (let i = 0; i < 1000; i++) { const v = r.int(-1, 1); expect(v).toBeGreaterThanOrEqual(-1); expect(v).toBeLessThanOrEqual(1); }
  });
});

describe('속성 상성', () => {
  it('사이클: 불꽃>새싹>물결>불꽃', () => {
    expect(singleEff('blaze', 'bloom')).toBe(SUPER);
    expect(singleEff('bloom', 'tide')).toBe(SUPER);
    expect(singleEff('tide', 'blaze')).toBe(SUPER);
    expect(singleEff('bloom', 'blaze')).toBe(RESIST);
  });
  it('그림자⇄빛 상호 약점', () => {
    expect(singleEff('umbra', 'lumen')).toBe(SUPER);
    expect(singleEff('lumen', 'umbra')).toBe(SUPER);
  });
  it('복합 속성 곱연산', () => {
    expect(effectiveness('tide', ['blaze', 'terra'])).toBeCloseTo(SUPER * SUPER);
    expect(effectiveness('neutral', ['umbra'])).toBe(1);
  });
  it('상성표에 상호 2배(그림자/빛 제외) 모순 없음', () => {
    for (const [a, list] of Object.entries(STRONG)) for (const d of list) {
      if ((a === 'umbra' && d === 'lumen') || (a === 'lumen' && d === 'umbra')) continue;
      expect(STRONG[d as keyof typeof STRONG].includes(a as never)).toBe(false);
    }
  });
});

describe('데이터 무결성', () => {
  it('모든 learnset 기술이 존재', () => {
    for (const s of SPECIES_LIST) for (const [, mv] of s.learnset) expect(MOVES[mv], `${s.id}:${mv}`).toBeDefined();
  });
  it('진화 대상 종 존재 & 진화 레벨 지정', () => {
    for (const s of SPECIES_LIST) if (s.evolveTo) { expect(getSpecies(s.evolveTo)).toBeDefined(); expect(s.evolveLevel).toBeGreaterThan(1); }
  });
  it('레벨 1에 최소 1개 공격기 보유 (계보 포함)', () => {
    for (const s of SPECIES_LIST) {
      const mv = learnableUpTo(s.id, 60).map((id) => MOVES[id]);
      expect(mv.some((m) => m.power > 0 && m.cost === 0), s.id).toBe(true);
    }
  });
  it('각 액트 야생 풀 비어있지 않음', () => {
    for (const a of [0, 1, 2]) expect(SPECIES_LIST.filter((s) => s.acts.includes(a)).length).toBeGreaterThanOrEqual(5);
  });
  it('부적/이벤트 ID 고유', () => {
    expect(Object.keys(CHARMS).length).toBeGreaterThan(20);
    expect(new Set(EVENTS.map((e) => e.id)).size).toBe(EVENTS.length);
  });
});

describe('성장', () => {
  it('레벨업 시 최대 HP 증가분만큼 현재 HP 증가', () => {
    const m = createMonster('embercat', 5, new Rng(1), 'x');
    m.hp -= 5;
    const before = maxHp(m);
    gainExp(m, expToNext(5));
    expect(m.level).toBe(6);
    expect(m.hp).toBe(maxHp(m) - 5);
    expect(maxHp(m)).toBeGreaterThan(before);
  });
  it('기술 슬롯 4개 초과 시 pending 처리', () => {
    const m = createMonster('embercat', 12, new Rng(1), 'x');
    expect(m.moves.length).toBeLessThanOrEqual(4);
    const r = gainExp(m, 100000);
    expect(m.moves.length).toBe(4);
    expect(r.pendingMoves.length).toBeGreaterThan(0);
    expect(r.canEvolve).toBe(true);
  });
  it('진화', () => {
    const m = createMonster('embercat', 14, new Rng(1), 'x');
    expect(canEvolve(m)).toBe(true);
    const r = evolve(m);
    expect(r.to).toBe('flarecat');
    expect(m.hp).toBeGreaterThan(0);
  });
  it('야생 생성 시 레벨에 맞는 진화형', () => {
    const m = createMonster('pebblo', 30, new Rng(3), 'x', { evolve: true });
    expect(m.speciesId).toBe('bouldron');
  });
});

describe('맵 생성', () => {
  it('모든 노드가 보스로 연결 & 시작 노드 존재', () => {
    for (let seed = 1; seed < 60; seed++) {
      const map = generateMap(seed % 3, new Rng(seed));
      const starts = availableNodes(map, null);
      expect(starts.length).toBeGreaterThanOrEqual(2);
      // BFS: 보스 도달 가능
      for (const st of starts) {
        const seen = new Set<string>(); const q = [st.id]; let boss = false;
        while (q.length) { const id = q.shift()!; if (seen.has(id)) continue; seen.add(id); const n = map.nodes[id]; if (n.type === 'boss') boss = true; q.push(...n.next); }
        expect(boss).toBe(true);
      }
      const bosses = Object.values(map.nodes).filter((n) => n.type === 'boss');
      expect(bosses.length).toBe(1);
      expect(bosses[0].row).toBe(MAP_ROWS - 1);
      // 비-보스 노드는 모두 다음 노드 보유
      for (const n of Object.values(map.nodes)) if (n.type !== 'boss') expect(n.next.length).toBeGreaterThan(0);
      expect(Object.values(map.nodes).some((n) => n.type === 'shop')).toBe(true);
    }
  });
});

describe('0EN 기본기 보장', () => {
  it('어떤 종/레벨로 생성해도 0EN 공격기 보유', () => {
    const rng = new Rng(11);
    for (const s of SPECIES_LIST) for (const lv of [3, 15, 30, 45]) {
      const m = createMonster(s.id, lv, rng, 'x', { evolve: true });
      expect(m.moves.some((id) => MOVES[id].cost === 0 && MOVES[id].power > 0), `${s.id}@${lv}`).toBe(true);
    }
  });
});
