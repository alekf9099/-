// 공용 UI 컴포넌트
import type { Element, Monster } from '../core/types';
import { ELEMENTS } from '../data/elements';
import { getSpecies } from '../data/species';
import { getMove } from '../data/moves';
import { getCharm } from '../data/charms';
import { RESONANCES } from '../data/world';
import { computeResonance, STATUS_NAME } from '../game/battle';
import { computeStats, displayName, expToNext, maxHp } from '../game/monster';
import { bar, h, openSheet } from './dom';
import { monSprite } from './sprite';
import { EL_ICON, img } from './assets';

export function elChip(el: Element, small = false): HTMLElement {
  const e = ELEMENTS[el];
  const src = EL_ICON[el];
  return h('span', { class: 'el-chip' + (small ? ' sm' : ''), style: `--c:${e.color}` }, src ? img(src, small ? 14 : 18, 'el-ico') : e.icon, e.name);
}

export function elChips(els: Element[], small = false): HTMLElement {
  return h('span', { class: 'el-chips' }, els.map((e) => elChip(e, small)));
}

export function statusChip(m: Monster): HTMLElement | null {
  if (!m.status) return null;
  return h('span', { class: 'status-chip st-' + m.status }, STATUS_NAME[m.status]);
}

export function hpLine(m: Monster): HTMLElement {
  const mx = maxHp(m);
  return h('div', { class: 'hp-line' }, bar(m.hp / mx, 'hp'), h('span', { class: 'hp-num' }, `${m.hp}/${mx}`));
}

export function costPips(cost: number, max = 3): HTMLElement {
  return h('span', { class: 'pips', 'aria-label': `EN ${cost}` }, Array.from({ length: Math.max(cost, 0) }, () => h('i', { class: 'pip on' })), cost === 0 ? h('small', null, 'FREE') : null, max < 0 ? null : null);
}

/** 파티 목록 행 */
export function monRow(m: Monster, opts: { onclick?: () => void; right?: HTMLElement | null; dim?: boolean } = {}): HTMLElement {
  const sp = getSpecies(m.speciesId);
  return h('button', { class: 'mon-row' + (m.hp <= 0 ? ' fainted' : '') + (opts.dim ? ' dim' : ''), onclick: opts.onclick },
    h('div', { class: 'mon-row-sprite', html: monSprite(m, { size: 56 }) }),
    h('div', { class: 'mon-row-main' },
      h('div', { class: 'mon-row-top' }, h('b', null, displayName(m)), m.shiny ? h('span', { class: 'shiny' }, '✦') : null, h('span', { class: 'lv' }, 'Lv.' + m.level), statusChip(m)),
      elChips(sp.elements, true),
      hpLine(m),
    ),
    opts.right ?? null,
  );
}

export function moveCard(id: string, extra?: HTMLElement | null): HTMLElement {
  const mv = getMove(id);
  const e = ELEMENTS[mv.element];
  return h('div', { class: 'move-card', style: `--c:${e.color}` },
    h('div', { class: 'row between' }, h('b', { class: 'row gap-s' }, EL_ICON[mv.element] ? img(EL_ICON[mv.element]!, 18, 'el-ico') : e.icon, mv.name), costPips(mv.cost)),
    h('div', { class: 'muted small' }, mv.power > 0 ? `위력 ${mv.power} · 명중 ${mv.acc}` : '변화기', ' — ', mv.desc),
    extra ?? null,
  );
}

const STAT_LABEL = { maxHp: 'HP', atk: '공격', def: '방어', spd: '스피드' } as const;

/** 막대 = 종족값(성장 잠재력), 숫자 = 현재 실수치 */
export function statBars(m: Monster): HTMLElement {
  const st = computeStats(m);
  const base = getSpecies(m.speciesId).base;
  const baseOf = { maxHp: base.hp, atk: base.atk, def: base.def, spd: base.spd };
  return h('div', { class: 'stat-bars' }, (Object.keys(STAT_LABEL) as (keyof typeof STAT_LABEL)[]).map((k) =>
    h('div', { class: 'stat-row' }, h('span', null, STAT_LABEL[k]), bar(baseOf[k] / 120, 'stat'), h('b', null, String(st[k]))),
  ));
}

export function expBar(m: Monster): HTMLElement {
  return h('div', { class: 'exp-line' }, h('small', null, 'EXP'), bar(m.exp / expToNext(m.level), 'exp'), h('small', null, `${m.exp}/${expToNext(m.level)}`));
}

export function charmIcon(id: string): HTMLElement {
  const c = getCharm(id);
  return h('button', { class: 'charm-icon r-' + c.rarity, 'aria-label': c.name, onclick: () => openSheet(c.name, h('div', { class: 'pad center' }, h('div', { class: 'big-emoji' }, c.icon), h('p', null, c.desc), h('small', { class: 'muted' }, rarityName(c.rarity) + (c.tag ? ` · #${c.tag}` : '')))) }, c.icon);
}

export function rarityName(r: string): string {
  return ({ common: '일반', rare: '희귀', epic: '영웅', legend: '전설' } as Record<string, string>)[r] ?? r;
}

/** 공명 칩 리스트 */
export function resonanceChips(party: Monster[], charms: string[]): HTMLElement {
  const res = computeResonance(party, charms);
  const active = (Object.entries(res) as [Exclude<Element, 'neutral'>, number][]).filter(([, t]) => t > 0);
  if (!active.length) return h('span', { class: 'muted small' }, '공명 없음 — 같은 속성 2마리부터 발동');
  return h('span', { class: 'res-chips' }, active.map(([el, t]) => {
    const e = ELEMENTS[el];
    const r = RESONANCES[el];
    return h('button', { class: 'res-chip t' + t, style: `--c:${e.color}`, onclick: () => openSheet(`${e.icon} ${e.name} 공명 ${t}단계`, h('div', { class: 'pad' },
      h('p', { class: t >= 1 ? '' : 'muted' }, `● 2마리: ${r.t1}`),
      h('p', { class: t >= 2 ? '' : 'muted' }, `● 3마리: ${r.t2}`),
      h('small', { class: 'muted' }, '파티(최대 6) 안의 같은 속성 에코링 수로 발동합니다.'),
    )) }, EL_ICON[el] ? img(EL_ICON[el]!, 16, 'el-ico') : e.icon, '★'.repeat(t));
  }));
}
