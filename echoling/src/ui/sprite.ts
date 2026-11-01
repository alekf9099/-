// 프로시저럴 SVG 스프라이트 — 외부 이미지 0개, 모든 해상도에서 선명
import type { Look, Monster } from '../core/types';
import { getSpecies } from '../data/species';

let uidSeq = 0;

function mix(hex: string, target: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex);
  const b = p(target);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const light = (c: string, t = 0.45) => mix(c, '#ffffff', t);
const dark = (c: string, t = 0.35) => mix(c, '#000000', t);

interface Head {
  x: number;
  y: number;
  r: number;
}

function bodyShape(look: Look, g: string): { svg: string; head: Head } {
  const c = `url(#${g})`;
  const o = dark(look.color, 0.45);
  const st = `stroke="${o}" stroke-width="2.2"`;
  const belly = light(look.accent, 0.3);
  switch (look.body) {
    case 'round':
      return {
        svg: `<circle cx="60" cy="68" r="31" fill="${c}" ${st}/>
              <ellipse cx="60" cy="80" rx="18" ry="14" fill="${belly}" opacity=".75"/>
              <ellipse cx="46" cy="98" rx="8" ry="5" fill="${dark(look.color, 0.15)}" ${st}/>
              <ellipse cx="74" cy="98" rx="8" ry="5" fill="${dark(look.color, 0.15)}" ${st}/>`,
        head: { x: 60, y: 62, r: 26 },
      };
    case 'tall':
      return {
        svg: `<ellipse cx="60" cy="74" rx="22" ry="26" fill="${c}" ${st}/>
              <ellipse cx="60" cy="82" rx="13" ry="15" fill="${belly}" opacity=".75"/>
              <circle cx="60" cy="46" r="22" fill="${c}" ${st}/>
              <ellipse cx="48" cy="100" rx="7" ry="4.5" fill="${dark(look.color, 0.15)}" ${st}/>
              <ellipse cx="72" cy="100" rx="7" ry="4.5" fill="${dark(look.color, 0.15)}" ${st}/>`,
        head: { x: 60, y: 46, r: 22 },
      };
    case 'blob':
      return {
        svg: `<path d="M24 96 Q20 52 60 36 Q100 52 96 96 Q90 102 80 98 Q70 104 60 98 Q50 104 40 98 Q30 102 24 96Z" fill="${c}" ${st}/>
              <ellipse cx="60" cy="82" rx="20" ry="11" fill="${belly}" opacity=".55"/>`,
        head: { x: 60, y: 64, r: 26 },
      };
    case 'quad':
      return {
        svg: `<ellipse cx="60" cy="80" rx="32" ry="18" fill="${c}" ${st}/>
              <rect x="34" y="88" width="9" height="14" rx="4" fill="${dark(look.color, 0.12)}" ${st}/>
              <rect x="77" y="88" width="9" height="14" rx="4" fill="${dark(look.color, 0.12)}" ${st}/>
              <ellipse cx="60" cy="86" rx="16" ry="8" fill="${belly}" opacity=".6"/>
              <circle cx="60" cy="52" r="23" fill="${c}" ${st}/>
              <ellipse cx="60" cy="62" rx="11" ry="7" fill="${belly}" opacity=".85"/>`,
        head: { x: 60, y: 50, r: 23 },
      };
    case 'bird':
      return {
        svg: `<path d="M30 70 Q14 64 12 50 Q26 56 36 60Z" fill="${light(look.color, 0.2)}" ${st}/>
              <path d="M90 70 Q106 64 108 50 Q94 56 84 60Z" fill="${light(look.color, 0.2)}" ${st}/>
              <ellipse cx="60" cy="68" rx="29" ry="30" fill="${c}" ${st}/>
              <ellipse cx="60" cy="80" rx="16" ry="13" fill="${belly}" opacity=".8"/>
              <path d="M55 70 L60 78 L65 70Z" fill="#ffb347" stroke="${o}" stroke-width="1.5"/>
              <path d="M50 98 l-3 6 M54 98 l0 6 M66 98 l0 6 M70 98 l3 6" stroke="#ffb347" stroke-width="3" stroke-linecap="round"/>`,
        head: { x: 60, y: 60, r: 24 },
      };
    case 'serpent':
      return {
        svg: `<path d="M30 100 Q12 86 30 76 Q48 68 44 84 Q40 98 66 100 Q96 102 90 80" fill="none" stroke="${o}" stroke-width="20" stroke-linecap="round"/>
              <path d="M30 100 Q12 86 30 76 Q48 68 44 84 Q40 98 66 100 Q96 102 90 80" fill="none" stroke="${look.color}" stroke-width="15" stroke-linecap="round"/>
              <path d="M34 98 Q22 88 32 80" fill="none" stroke="${belly}" stroke-width="5" stroke-linecap="round" opacity=".7"/>
              <ellipse cx="62" cy="54" rx="27" ry="24" fill="${c}" ${st}/>
              <ellipse cx="62" cy="66" rx="14" ry="7" fill="${belly}" opacity=".8"/>`,
        head: { x: 62, y: 52, r: 24 },
      };
    case 'golem':
    default:
      return {
        svg: `<rect x="28" y="40" width="64" height="58" rx="20" fill="${c}" ${st}/>
              <rect x="18" y="58" width="16" height="26" rx="8" fill="${dark(look.color, 0.1)}" ${st}/>
              <rect x="86" y="58" width="16" height="26" rx="8" fill="${dark(look.color, 0.1)}" ${st}/>
              <path d="M38 50 l8 -4 l6 6 l-7 5Z M74 82 l9 -2 l3 8 l-9 1Z" fill="${light(look.accent, 0.1)}" opacity=".8"/>
              <rect x="38" y="96" width="14" height="8" rx="4" fill="${dark(look.color, 0.2)}" ${st}/>
              <rect x="68" y="96" width="14" height="8" rx="4" fill="${dark(look.color, 0.2)}" ${st}/>`,
        head: { x: 60, y: 62, r: 26 },
      };
  }
}

function ears(look: Look, h: Head): string {
  const o = dark(look.color, 0.45);
  const st = `stroke="${o}" stroke-width="2" stroke-linejoin="round"`;
  const top = h.y - h.r;
  const a = look.accent;
  switch (look.ears) {
    case 'cat':
      return `<path d="M${h.x - h.r * 0.85} ${top + 12} L${h.x - h.r * 0.75} ${top - 10} L${h.x - h.r * 0.2} ${top + 4}Z" fill="${look.color}" ${st}/>
              <path d="M${h.x + h.r * 0.85} ${top + 12} L${h.x + h.r * 0.75} ${top - 10} L${h.x + h.r * 0.2} ${top + 4}Z" fill="${look.color}" ${st}/>
              <path d="M${h.x - h.r * 0.7} ${top + 8} L${h.x - h.r * 0.68} ${top - 3} L${h.x - h.r * 0.38} ${top + 5}Z" fill="${light(a, 0.3)}"/>
              <path d="M${h.x + h.r * 0.7} ${top + 8} L${h.x + h.r * 0.68} ${top - 3} L${h.x + h.r * 0.38} ${top + 5}Z" fill="${light(a, 0.3)}"/>`;
    case 'bunny':
      return `<ellipse cx="${h.x - 10}" cy="${top - 14}" rx="7" ry="20" fill="${look.color}" ${st} transform="rotate(-12 ${h.x - 10} ${top})"/>
              <ellipse cx="${h.x + 10}" cy="${top - 14}" rx="7" ry="20" fill="${look.color}" ${st} transform="rotate(12 ${h.x + 10} ${top})"/>
              <ellipse cx="${h.x - 10}" cy="${top - 12}" rx="3" ry="13" fill="${light(a, 0.2)}" transform="rotate(-12 ${h.x - 10} ${top})"/>
              <ellipse cx="${h.x + 10}" cy="${top - 12}" rx="3" ry="13" fill="${light(a, 0.2)}" transform="rotate(12 ${h.x + 10} ${top})"/>`;
    case 'horn':
      return `<path d="M${h.x - 12} ${top + 6} Q${h.x - 26} ${top - 10} ${h.x - 16} ${top - 18} Q${h.x - 14} ${top - 4} ${h.x - 4} ${top + 3}Z" fill="${a}" ${st}/>
              <path d="M${h.x + 12} ${top + 6} Q${h.x + 26} ${top - 10} ${h.x + 16} ${top - 18} Q${h.x + 14} ${top - 4} ${h.x + 4} ${top + 3}Z" fill="${a}" ${st}/>`;
    case 'fin':
      return `<path d="M${h.x - h.r} ${h.y} Q${h.x - h.r - 16} ${h.y - 14} ${h.x - h.r - 6} ${h.y - 22} Q${h.x - h.r + 4} ${h.y - 12} ${h.x - h.r + 6} ${h.y - 6}Z" fill="${light(look.color, 0.25)}" ${st}/>
              <path d="M${h.x + h.r} ${h.y} Q${h.x + h.r + 16} ${h.y - 14} ${h.x + h.r + 6} ${h.y - 22} Q${h.x + h.r - 4} ${h.y - 12} ${h.x + h.r - 6} ${h.y - 6}Z" fill="${light(look.color, 0.25)}" ${st}/>
              <path d="M${h.x - 6} ${top + 2} Q${h.x} ${top - 16} ${h.x + 8} ${top + 2}Z" fill="${light(look.color, 0.25)}" ${st}/>`;
    case 'leaf':
      return `<path d="M${h.x} ${top + 4} Q${h.x - 2} ${top - 8} ${h.x} ${top - 12}" stroke="${dark('#3fa34d', 0.2)}" stroke-width="3" fill="none"/>
              <path d="M${h.x} ${top - 10} Q${h.x - 22} ${top - 24} ${h.x - 26} ${top - 8} Q${h.x - 12} ${top - 2} ${h.x} ${top - 10}Z" fill="#6ee07f" ${st}/>
              <path d="M${h.x} ${top - 10} Q${h.x + 18} ${top - 26} ${h.x + 24} ${top - 12} Q${h.x + 12} ${top - 4} ${h.x} ${top - 10}Z" fill="#9af08f" ${st}/>`;
    case 'antenna':
      return `<path d="M${h.x - 8} ${top + 4} Q${h.x - 14} ${top - 10} ${h.x - 18} ${top - 16}" stroke="${o}" stroke-width="2.5" fill="none"/>
              <path d="M${h.x + 8} ${top + 4} Q${h.x + 14} ${top - 10} ${h.x + 18} ${top - 16}" stroke="${o}" stroke-width="2.5" fill="none"/>
              <circle cx="${h.x - 18}" cy="${top - 17}" r="5" fill="${a}" ${st}/>
              <circle cx="${h.x + 18}" cy="${top - 17}" r="5" fill="${a}" ${st}/>`;
    case 'crown':
      return `<path d="M${h.x - 16} ${top + 6} L${h.x - 18} ${top - 12} L${h.x - 8} ${top - 2} L${h.x} ${top - 16} L${h.x + 8} ${top - 2} L${h.x + 18} ${top - 12} L${h.x + 16} ${top + 6}Z" fill="${a}" ${st}/>
              <circle cx="${h.x}" cy="${top - 4}" r="3" fill="#fff" opacity=".9"/>`;
    case 'wing':
      return `<path d="M${h.x - h.r + 4} ${h.y - 6} Q${h.x - h.r - 20} ${h.y - 30} ${h.x - h.r - 8} ${h.y - 36} Q${h.x - h.r + 2} ${h.y - 24} ${h.x - h.r + 12} ${h.y - 14}Z" fill="${light(a, 0.3)}" ${st}/>
              <path d="M${h.x + h.r - 4} ${h.y - 6} Q${h.x + h.r + 20} ${h.y - 30} ${h.x + h.r + 8} ${h.y - 36} Q${h.x + h.r - 2} ${h.y - 24} ${h.x + h.r - 12} ${h.y - 14}Z" fill="${light(a, 0.3)}" ${st}/>`;
    case 'none':
    default:
      return '';
  }
}

function tail(look: Look): string {
  const o = dark(look.color, 0.45);
  const st = `stroke="${o}" stroke-width="2" stroke-linejoin="round"`;
  const a = look.accent;
  switch (look.tail) {
    case 'flame':
      return `<path class="flame" d="M88 84 Q104 80 102 62 Q110 70 112 58 Q118 74 108 86 Q100 96 88 92Z" fill="#ff7b2e" ${st}/>
              <path class="flame" d="M94 86 Q104 82 104 72 Q110 80 104 88Z" fill="#ffe066"/>`;
    case 'leaf':
      return `<path d="M88 86 Q108 84 110 66 Q96 66 88 80Z" fill="#6ee07f" ${st}/><path d="M90 84 Q100 78 106 70" stroke="${dark('#6ee07f')}" stroke-width="1.5" fill="none"/>`;
    case 'fin':
      return `<path d="M86 88 Q104 92 110 78 Q112 96 98 100 Q90 100 86 94Z" fill="${light(look.color, 0.25)}" ${st}/>`;
    case 'bolt':
      return `<path d="M86 84 L100 78 L96 70 L112 62 L104 76 L110 78 L92 92Z" fill="${a}" ${st}/>`;
    case 'wisp':
      return `<path class="flame" d="M86 90 Q106 94 108 76 Q108 64 98 66 Q106 72 100 80 Q94 86 86 84Z" fill="${light(a, 0.2)}" opacity=".85" ${st}/>`;
    case 'fluff':
      return `<circle cx="96" cy="86" r="9" fill="${light(look.color, 0.5)}" ${st}/><circle cx="104" cy="80" r="6" fill="${light(look.color, 0.6)}" ${st}/>`;
    case 'spike':
      return `<path d="M86 88 L104 86 L98 80 L112 78 L100 94Z" fill="${a}" ${st}/>`;
    case 'none':
    default:
      return '';
  }
}

function eyes(look: Look, h: Head): string {
  const ex = h.r * 0.42;
  const ey = h.y - h.r * 0.05;
  const L = h.x - ex;
  const R = h.x + ex;
  const ink = '#1b1530';
  const cheek = `<ellipse cx="${L - 5}" cy="${ey + 11}" rx="5" ry="3" fill="#ff7aa8" opacity=".55"/>
                 <ellipse cx="${R + 5}" cy="${ey + 11}" rx="5" ry="3" fill="#ff7aa8" opacity=".55"/>`;
  const mouth = `<path d="M${h.x - 4} ${ey + 12} Q${h.x} ${ey + 16} ${h.x + 4} ${ey + 12}" stroke="${ink}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  switch (look.eyes) {
    case 'fierce':
      return `<path d="M${L - 7} ${ey - 2} L${L + 6} ${ey + 2} L${L + 4} ${ey + 8} L${L - 5} ${ey + 6}Z" fill="${ink}"/>
              <path d="M${R + 7} ${ey - 2} L${R - 6} ${ey + 2} L${R - 4} ${ey + 8} L${R + 5} ${ey + 6}Z" fill="${ink}"/>
              <circle cx="${L + 1}" cy="${ey + 3}" r="1.6" fill="#fff"/><circle cx="${R - 1}" cy="${ey + 3}" r="1.6" fill="#fff"/>
              <path d="M${L - 9} ${ey - 6} L${L + 7} ${ey - 1}" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>
              <path d="M${R + 9} ${ey - 6} L${R - 7} ${ey - 1}" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>
              <path d="M${h.x - 5} ${ey + 13} L${h.x + 5} ${ey + 13}" stroke="${ink}" stroke-width="2" stroke-linecap="round"/>
              <path d="M${h.x + 2} ${ey + 13} l1.5 3 l1.5 -3" fill="#fff"/>`;
    case 'sleepy':
      return `<path d="M${L - 6} ${ey + 2} Q${L} ${ey + 7} ${L + 6} ${ey + 2}" stroke="${ink}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
              <path d="M${R - 6} ${ey + 2} Q${R} ${ey + 7} ${R + 6} ${ey + 2}" stroke="${ink}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
              ${cheek}<ellipse cx="${h.x}" cy="${ey + 14}" rx="3" ry="2.2" fill="${ink}"/>`;
    case 'mono':
      return `<ellipse cx="${h.x}" cy="${ey}" rx="11" ry="12" fill="#fff" stroke="${ink}" stroke-width="2"/>
              <circle class="eye" cx="${h.x}" cy="${ey + 1}" r="6.5" fill="${look.accent}"/>
              <circle cx="${h.x}" cy="${ey + 1}" r="3" fill="${ink}"/>
              <circle cx="${h.x + 3}" cy="${ey - 3}" r="2" fill="#fff"/>
              <path d="M${h.x - 5} ${ey + 17} Q${h.x} ${ey + 20} ${h.x + 5} ${ey + 17}" stroke="${ink}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    case 'cute':
    default:
      return `<ellipse class="eye" cx="${L}" cy="${ey}" rx="5" ry="6.5" fill="${ink}"/>
              <ellipse class="eye" cx="${R}" cy="${ey}" rx="5" ry="6.5" fill="${ink}"/>
              <circle cx="${L + 1.8}" cy="${ey - 2.5}" r="2.2" fill="#fff"/><circle cx="${R + 1.8}" cy="${ey - 2.5}" r="2.2" fill="#fff"/>
              <circle cx="${L - 1.5}" cy="${ey + 2.5}" r="1" fill="#fff" opacity=".8"/><circle cx="${R - 1.5}" cy="${ey + 2.5}" r="1" fill="#fff" opacity=".8"/>
              ${cheek}${mouth}`;
  }
}

export interface SpriteOpts {
  size?: number;
  flip?: boolean;
  shiny?: boolean;
  silhouette?: boolean;
  className?: string;
}

/** 종 ID → SVG 문자열 */
export function spriteSvg(speciesId: string, opts: SpriteOpts = {}): string {
  const sp = getSpecies(speciesId);
  const look = { ...sp.look };
  if (opts.shiny) {
    // 이로치: 색 반전 계열 팔레트
    look.color = mix(look.color, '#7af7ff', 0.55);
    look.accent = mix(look.accent, '#ff6bd6', 0.5);
  }
  const id = 'g' + ++uidSeq;
  const b = bodyShape(look, id);
  const size = opts.size ?? 120;
  const sc = Math.min(look.scale, 1.3);
  const tr = `translate(60 104) scale(${opts.flip ? -sc : sc} ${sc}) translate(-60 -104)`;
  const sil = opts.silhouette ? ' style="filter:brightness(0) opacity(.55)"' : '';
  return `<svg class="sprite ${opts.className ?? ''}" viewBox="-12 -24 144 136" width="${size}" height="${size}" aria-hidden="true"${sil}>
    <defs><radialGradient id="${id}" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="${light(look.color, 0.35)}"/><stop offset="1" stop-color="${look.color}"/></radialGradient></defs>
    <ellipse cx="60" cy="106" rx="${30 * sc}" ry="6" fill="#000" opacity=".22"/>
    <g transform="${tr}"><g class="bob">
      ${tail(look)}
      ${b.svg}
      ${ears(look, b.head)}
      ${eyes(look, b.head)}
      ${opts.shiny ? `<path d="M22 30 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3Z" fill="#fff6a8" class="sparkle"/>` : ''}
    </g></g>
  </svg>`;
}

export function monSprite(m: Monster, opts: SpriteOpts = {}): string {
  return spriteSvg(m.speciesId, { ...opts, shiny: m.shiny });
}
