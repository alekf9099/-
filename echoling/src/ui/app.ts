// 전역 상태 + 라우터
import type { MetaSave, RunState } from '../core/types';
import { loadMeta, loadRun, saveMeta, saveRun } from '../game/meta';
import { mount } from './dom';
import { bindSettings } from './fx';

export const app: { meta: MetaSave; run: RunState | null } = {
  meta: loadMeta(),
  run: loadRun(),
};
bindSettings(app.meta.settings);

export function saveAll(): void {
  saveMeta(app.meta);
  saveRun(app.run);
}

export type Route =
  | 'title' | 'starter' | 'map' | 'battle' | 'reward' | 'shop' | 'rest' | 'event' | 'treasure'
  | 'runEnd' | 'dex' | 'lab' | 'settings' | 'actClear' | 'blessing' | 'achievements';

type ScreenFn = (arg?: any) => HTMLElement; // eslint-disable-line @typescript-eslint/no-explicit-any
const routes: Partial<Record<Route, ScreenFn>> = {};
export let currentRoute: Route = 'title';
/** 화면 전환 훅 (배경음악 등) */
export const routeHooks: ((r: Route, arg?: unknown) => void)[] = [];

export function register(r: Route, fn: ScreenFn): void {
  routes[r] = fn;
}

export function go(r: Route, arg?: unknown): void {
  const fn = routes[r];
  if (!fn) throw new Error('route not registered: ' + r);
  currentRoute = r;
  mount(fn(arg));
  for (const hook of routeHooks) hook(r, arg);
  window.scrollTo(0, 0);
}
