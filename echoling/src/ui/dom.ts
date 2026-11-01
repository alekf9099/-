// 초경량 DOM 헬퍼 (프레임워크 없이 번들 ~수십KB 유지 → 저사양 안드로이드 대응)
type Child = Node | string | number | null | undefined | false | Child[];
type Props = {
  class?: string;
  style?: string;
  html?: string;
  onclick?: (e: MouseEvent) => void;
  [attr: string]: unknown;
};

export function h(tag: string, props: Props | null = null, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k === 'html') el.innerHTML = String(v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: HTMLElement, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function root(): HTMLElement {
  return document.getElementById('app')!;
}

/** 화면 전환 (페이드/슬라이드) */
export function mount(screen: HTMLElement): void {
  const r = root();
  r.innerHTML = '';
  screen.classList.add('screen', 'enter');
  r.appendChild(screen);
  requestAnimationFrame(() => requestAnimationFrame(() => screen.classList.remove('enter')));
}

let toastTimer = 0;
export function toast(text: string, kind: 'info' | 'good' | 'bad' = 'info'): void {
  let t = document.getElementById('toast');
  if (!t) {
    t = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.className = 'show ' + kind;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t!.classList.remove('show'), 2200);
}

/** 하단 시트 (모바일 엄지 영역 친화) */
export interface Sheet {
  close: () => void;
  body: HTMLElement;
}

const sheetStack: Sheet[] = [];

export function openSheet(title: string, content: HTMLElement | HTMLElement[], opts: { dismissible?: boolean; onClose?: () => void; tall?: boolean } = {}): Sheet {
  const dismissible = opts.dismissible ?? true;
  const body = h('div', { class: 'sheet-body' }, content);
  const panel = h('div', { class: 'sheet' + (opts.tall ? ' tall' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-grip' }),
    h('div', { class: 'sheet-head' }, h('h3', null, title), dismissible ? h('button', { class: 'icon-btn', 'aria-label': '닫기', onclick: () => close() }, '✕') : null),
    body,
  );
  const backdrop = h('div', { class: 'backdrop', onclick: (e: MouseEvent) => { if (e.target === backdrop && dismissible) close(); } }, panel);
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('open'));
  let closed = false;
  const sheet: Sheet = { body, close };
  function close() {
    if (closed) return;
    closed = true;
    backdrop.classList.remove('open');
    setTimeout(() => backdrop.remove(), 220);
    const i = sheetStack.indexOf(sheet);
    if (i >= 0) sheetStack.splice(i, 1);
    opts.onClose?.();
  }
  (sheet as Sheet & { dismissible: boolean }).dismissible = dismissible;
  sheetStack.push(sheet);
  return sheet;
}

/** 안드로이드 뒤로가기: 열린 시트부터 닫기. 닫았으면 true */
export function closeTopSheet(): boolean {
  const top = sheetStack[sheetStack.length - 1] as (Sheet & { dismissible?: boolean }) | undefined;
  if (top && top.dismissible !== false) {
    top.close();
    return true;
  }
  return !!top;
}

export function confirmSheet(title: string, text: string, okLabel = '확인', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const s = openSheet(title, [
      h('p', { class: 'muted pad' }, text),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn ghost grow', onclick: () => { done = true; s.close(); resolve(false); } }, '취소'),
        h('button', { class: 'btn grow ' + (danger ? 'danger' : 'primary'), onclick: () => { done = true; s.close(); resolve(true); } }, okLabel),
      ),
    ], { onClose: () => { if (!done) resolve(false); } });
  });
}

export function bar(pct: number, cls = ''): HTMLElement {
  const p = Math.max(0, Math.min(1, pct));
  const tone = p > 0.5 ? 'hi' : p > 0.2 ? 'mid' : 'lo';
  return h('div', { class: `bar ${cls}` }, h('div', { class: `fill ${tone}`, style: `width:${(p * 100).toFixed(1)}%` }));
}
