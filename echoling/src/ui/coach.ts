// 💡 코치 팁 — 처음 겪는 상황에서 딱 한 번, 플레이를 막지 않는 말풍선으로 알려준다
import { app } from './app';
import { saveMeta } from '../game/meta';
import { h } from './dom';
import { ico } from './assets';

export type TipId = 'map-first' | 'intent-lethal' | 'capture-chance' | 'resonance-first' | 'charm-first' | 'low-hp-lead' | 'fast-forward' | 'boss-ready';

const TIPS: Record<TipId, { title: string; body: string }> = {
  'map-first': { title: '경로를 골라요', body: '빛나는 노드를 탭하면 정보가 보여요. 위로 올라갈수록 강해지고, 맨 위에 보스가 기다려요.' },
  'intent-lethal': { title: '쓰러질 위기!', body: '적의 다음 공격에 쓰러질 수 있어요. 「교체」로 저항하는 동료를 내보내거나 회복하세요. 예고는 교체해도 바뀌지 않아요.' },
  'capture-chance': { title: '포획 찬스', body: '적 체력이 절반 이하예요. 지금 캡슐을 던지면 성공률이 높아요. 잡은 에코링은 풀HP로 합류해요!' },
  'resonance-first': { title: '공명 발동!', body: '같은 속성 에코링이 모여 공명 보너스가 생겼어요. 상단의 공명 칩을 탭하면 효과와 다음 단계 조건을 볼 수 있어요.' },
  'charm-first': { title: '첫 부적 획득', body: '부적은 이번 런 내내 자동으로 적용돼요. 상단 아이콘을 탭하면 효과를 다시 볼 수 있어요.' },
  'low-hp-lead': { title: '선두 체력 주의', body: '선두 에코링의 체력이 낮아요. 노드를 탭하면 나오는 카드에서 바로 선두를 바꿀 수 있어요.' },
  'fast-forward': { title: '빨리 감기', body: '전투 연출 중에 화면을 탭하면 이번 턴을 바로 넘길 수 있어요.' },
  'boss-ready': { title: '보스 준비도', body: '상단 보스 카드에 권장 레벨이 보여요. 「위험」이면 전투 노드를 더 거쳐 성장하세요.' },
};

let current: HTMLElement | null = null;
let queue: TipId[] = [];

export function seenTip(id: TipId): boolean {
  return (app.meta.tipsSeen ?? []).includes(id);
}

/** 처음이면 말풍선 표시 (이미 본 팁은 무시). 동시에 여러 개면 순서대로 */
export function coach(id: TipId): void {
  if (seenTip(id) || queue.includes(id)) return;
  queue.push(id);
  if (!current) showNext();
}

function showNext(): void {
  const id = queue.shift();
  if (!id) return;
  app.meta.tipsSeen = [...(app.meta.tipsSeen ?? []), id];
  saveMeta(app.meta);
  const t = TIPS[id];
  const close = () => {
    if (!el.isConnected) return;
    el.classList.remove('show');
    setTimeout(() => {
      el.remove();
      current = null;
      showNext();
    }, 220);
  };
  const el = h('div', { class: 'coach', role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'coach-ico' }, ico('spark', 18)),
    h('div', { class: 'grow' }, h('b', null, t.title), h('p', null, t.body)),
    h('button', { class: 'coach-ok', onclick: close }, '알겠어요'),
  );
  document.body.appendChild(el);
  current = el;
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(close, 9000);
}
