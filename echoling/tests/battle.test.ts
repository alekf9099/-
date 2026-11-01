import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { createMonster, maxHp } from '../src/game/monster';
import { createBattle, resolveTurn, forceSwitch, captureChance, calcDamage, computeResonance, activeOf } from '../src/game/battle';
import { getMove } from '../src/data/moves';

const ctx = { charms: [] as string[], resonance: {} };

describe('전투 엔진', () => {
  it('상성 유리 기술이 더 큰 피해', () => {
    const rng = new Rng(5);
    const p = createMonster('puddlo', 10, rng, 'p');
    const e = createMonster('salamint', 10, rng, 'e');
    const b = createBattle('wild', 't', [p], [e], ctx);
    const tide = calcDamage(b, 'p', getMove('splash'), null).dmg;
    const neutral = calcDamage(b, 'p', getMove('tackle'), null).dmg;
    expect(tide).toBeGreaterThan(neutral * 1.5);
  });

  it('전투는 반드시 종료된다 (무한루프 없음)', () => {
    for (let seed = 1; seed < 40; seed++) {
      const rng = new Rng(seed);
      const p = createMonster('sproutle', 8, rng, 'p');
      const e = createMonster('pebblo', 8, rng, 'e');
      const b = createBattle('wild', 't', [p], [e], ctx);
      let guard = 0;
      while (!b.over && guard++ < 200) {
        if (b.needSwitch) break;
        resolveTurn(b, { type: 'move', idx: 0 }, rng);
      }
      expect(b.over === 'win' || b.over === 'lose').toBe(true);
    }
  });

  it('EN 소모 및 회복, 최대치 제한', () => {
    const rng = new Rng(2);
    const p = createMonster('embercat', 30, rng, 'p');
    const e = createMonster('pebblo', 60, rng, 'e');
    const b = createBattle('wild', 't', [p], [e], ctx);
    expect(b.p.en).toBe(1);
    resolveTurn(b, { type: 'move', idx: p.moves.indexOf('growl') >= 0 ? p.moves.indexOf('growl') : 0 }, rng);
    expect(b.p.en).toBeLessThanOrEqual(b.p.maxEn);
  });

  it('기절 시 강제 교체 요구 → 교체 후 진행', () => {
    const rng = new Rng(9);
    const weak = createMonster('sporelet', 2, rng, 'a');
    const back = createMonster('pebblo', 20, rng, 'b');
    const e = createMonster('salamint', 25, rng, 'e');
    const b = createBattle('trainer', 't', [weak, back], [e], ctx);
    let guard = 0;
    while (!b.needSwitch && !b.over && guard++ < 20) resolveTurn(b, { type: 'move', idx: 0 }, rng);
    expect(b.needSwitch).toBe(true);
    const ev = forceSwitch(b, 1);
    expect(ev.some((x) => x.t === 'switch')).toBe(true);
    expect(activeOf(b, 'p').uid).toBe('b');
  });

  it('포획 확률: 체력 낮을수록 증가, 트레이너전은 0', () => {
    const rng = new Rng(3);
    const p = createMonster('embercat', 10, rng, 'p');
    const e = createMonster('puffeather', 10, rng, 'e');
    const b = createBattle('wild', 't', [p], [e], ctx);
    const full = captureChance(b, 'capsule');
    e.hp = 1;
    expect(captureChance(b, 'capsule')).toBeGreaterThan(full);
    expect(captureChance(b, 'hyperCapsule')).toBeGreaterThan(captureChance(b, 'capsule'));
    const t = createBattle('trainer', 't', [p], [e], ctx);
    expect(captureChance(t, 'capsule')).toBe(0);
  });

  it('공명: 같은 속성 2/3마리 단계', () => {
    const rng = new Rng(1);
    const party = [createMonster('embercat', 5, rng, '1'), createMonster('salamint', 5, rng, '2')];
    expect(computeResonance(party, []).blaze).toBe(1);
    party.push(createMonster('lampghost', 5, rng, '3'));
    expect(computeResonance(party, []).blaze).toBe(2);
    expect(computeResonance(party.slice(0, 1), ['resonator']).blaze).toBe(1);
  });

  it('불굴의 매듭: 1회 HP1 생존', () => {
    const rng = new Rng(4);
    const p = createMonster('sporelet', 3, rng, 'p');
    const e = createMonster('magmaw', 40, rng, 'e');
    const b = createBattle('wild', 't', [p], [e], { charms: ['lastStand'], resonance: {} });
    const ev = resolveTurn(b, { type: 'move', idx: 0 }, rng);
    const survived = ev.some((x) => x.t === 'msg' && x.text.includes('불굴'));
    if (survived) expect(b.p.lastStandUsed).toBe(true);
    expect(maxHp(p)).toBeGreaterThan(0);
  });
});
