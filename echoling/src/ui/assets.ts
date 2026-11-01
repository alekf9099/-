// 🎨 UI 에셋 레지스트리 — Canva AI 일러스트 + Lucide 아이콘 (직접 그린 그래픽 없음)
import type { Element, ItemId, NodeType } from '../core/types';
import {
  createElement, ArrowLeft, X, Backpack, Users, CircleHelp, House, BookOpen, FlaskConical, Settings,
  Swords, Play, Zap, RefreshCw, Dices, Copy, Lock, ChevronRight, Trophy, Flame, Gem, Coins, Flag, Sparkles,
  type IconNode,
} from 'lucide';

const BASE = (import.meta.env?.BASE_URL ?? './').replace(/\/?$/, '/');
const ui = (name: string) => `${BASE}ui/${name}.webp`;

export const NODE_ICON: Record<NodeType, string> = {
  battle: ui('node_battle'), trainer: ui('node_trainer'), elite: ui('node_elite'), event: ui('node_event'),
  shop: ui('node_shop'), rest: ui('node_rest'), treasure: ui('node_treasure'), boss: ui('node_boss'),
};

export const ITEM_ICON: Record<ItemId, string> = {
  potion: ui('item_potion'), superPotion: ui('item_superPotion'), revive: ui('item_revive'), capsule: ui('item_capsule'),
  hyperCapsule: ui('item_hyperCapsule'), cleanser: ui('item_cleanser'), candy: ui('item_candy'), energyDrink: ui('item_energyDrink'),
};

export const EL_ICON: Partial<Record<Element, string>> = {
  blaze: ui('el_blaze'), tide: ui('el_tide'), bloom: ui('el_bloom'), volt: ui('el_volt'),
  terra: ui('el_terra'), gale: ui('el_gale'), umbra: ui('el_umbra'), lumen: ui('el_lumen'),
};

/** CSS 변수(--bgimg)에 넣는 배경은 절대 URL이어야 함 (상대 url()은 스타일시트 기준으로 해석되므로) */
const abs = (u: string) => (typeof document !== 'undefined' ? new URL(u, document.baseURI).href : u);
export const ACT_BG = [abs(ui('bg_act0')), abs(ui('bg_act1')), abs(ui('bg_act2'))];
export const TITLE_BG = abs(ui('bg_title'));

/** <img> 마크업 (innerHTML용) */
export function imgTag(src: string, size: number, cls = ''): string {
  return `<img class="ui-img ${cls}" src="${src}" width="${size}" height="${size}" alt="" draggable="false" decoding="async">`;
}

/** <img> 요소 */
export function img(src: string, size: number, cls = ''): HTMLImageElement {
  const el = document.createElement('img');
  el.className = 'ui-img ' + cls;
  el.src = src;
  el.width = size;
  el.height = size;
  el.alt = '';
  el.draggable = false;
  el.decoding = 'async';
  return el;
}

// ─────────── Lucide 아이콘 ───────────
export const ICONS = {
  back: ArrowLeft, close: X, bag: Backpack, party: Users, help: CircleHelp, home: House, dex: BookOpen,
  lab: FlaskConical, settings: Settings, battle: Swords, play: Play, auto: Zap, swap: RefreshCw, dice: Dices,
  copy: Copy, lock: Lock, chevron: ChevronRight, trophy: Trophy, flame: Flame, gem: Gem, coin: Coins, flag: Flag, spark: Sparkles,
} satisfies Record<string, IconNode>;

export function ico(name: keyof typeof ICONS, size = 20, stroke = 2.2): SVGElement {
  const el = createElement(ICONS[name]);
  el.setAttribute('width', String(size));
  el.setAttribute('height', String(size));
  el.setAttribute('stroke-width', String(stroke));
  el.classList.add('ico');
  el.setAttribute('aria-hidden', 'true');
  return el;
}
