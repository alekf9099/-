// 🏆 업적 판정 호출 + 달성 팝업
import { type Achievement, evaluateAchievements } from '../data/achievements';
import { getCharm } from '../data/charms';
import { lineage } from '../game/monster';
import { computeResonance } from '../game/battle';
import { saveMeta } from '../game/meta';
import { app } from './app';
import { h } from './dom';
import { sfx } from './fx';
import { img, uiUrl } from './assets';

const queue: Achievement[] = [];
let showing = false;

export function checkAchievements(ended?: { victory: boolean }): void {
  const run = app.run;
  const res2 = !!run && Object.values(computeResonance(run.party, run.charms)).some((t) => (t ?? 0) >= 2);
  const finalEvo = !!run && run.party.some((m) => lineage(m.speciesId).length >= 3);
  const got = evaluateAchievements({ meta: app.meta, run, ended, res2, finalEvo });
  if (!got.length) return;
  saveMeta(app.meta);
  queue.push(...got);
  if (!showing) next();
}

function next(): void {
  const a = queue.shift();
  if (!a) {
    showing = false;
    return;
  }
  showing = true;
  sfx('level');
  const reward = [a.reward.charm ? `부적 「${getCharm(a.reward.charm).name}」 해금` : '', a.reward.shards ? `💎 +${a.reward.shards}` : ''].filter(Boolean).join(' · ');
  const el = h('div', { class: 'achv-pop', role: 'status', 'aria-live': 'polite' },
    img(uiUrl(a.icon), 44, 'achv-ico'),
    h('div', { class: 'grow' }, h('small', null, '🏆 업적 달성'), h('b', null, a.name), h('p', null, reward)),
  );
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => {
      el.remove();
      next();
    }, 250);
  }, 2600);
}
