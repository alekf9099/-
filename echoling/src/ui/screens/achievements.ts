// 🏆 업적 화면
import { ACHIEVEMENTS, LOCKED_CHARMS } from '../../data/achievements';
import { getCharm } from '../../data/charms';
import { app, go, register } from '../app';
import { bar, h } from '../dom';
import { ico, img, uiUrl } from '../assets';

register('achievements', () => {
  const m = app.meta;
  const done = ACHIEVEMENTS.filter((a) => m.achievements[a.id]).length;
  const ctx = { meta: m, run: app.run };
  const unlocked = LOCKED_CHARMS.filter((c) => m.unlockedCharms.includes(c)).length;
  return h('div', { class: 'page' },
    h('header', { class: 'topbar' }, h('button', { class: 'icon-btn', 'aria-label': '뒤로', onclick: () => go('title') }, ico('back', 22)), h('h2', null, '업적'), h('span', { class: 'spacer' }), h('span', { class: 'pill gold' }, `${done}/${ACHIEVEMENTS.length}`)),
    h('div', { class: 'achv-summary' },
      h('div', null, h('small', null, '달성'), h('b', null, `${done}/${ACHIEVEMENTS.length}`), bar(done / ACHIEVEMENTS.length, 'stat')),
      h('div', null, h('small', null, '해금한 특별 부적'), h('b', null, `${unlocked}/${LOCKED_CHARMS.length}`), h('div', { class: 'achv-locked-row' }, LOCKED_CHARMS.map((c) => img(uiUrl('charm_' + c), 26, m.unlockedCharms.includes(c) ? '' : 'locked')))),
    ),
    h('div', { class: 'list' }, ACHIEVEMENTS.map((a) => {
      const got = !!m.achievements[a.id];
      const prog = !got && a.progress ? a.progress(ctx) : null;
      const reward = [a.reward.charm ? `부적 「${getCharm(a.reward.charm).name}」` : '', a.reward.shards ? `💎 ${a.reward.shards}` : ''].filter(Boolean).join(' + ');
      return h('div', { class: 'card achv-row' + (got ? ' got' : '') },
        img(uiUrl(a.icon), 48, 'achv-ico'),
        h('div', { class: 'grow' },
          h('div', { class: 'row between' }, h('b', null, a.name), got ? h('span', { class: 'tag new' }, '달성') : null),
          h('p', { class: 'small muted', style: 'margin:2px 0 4px' }, a.desc),
          prog ? h('div', { class: 'hp-line' }, bar(prog[0] / prog[1], 'stat'), h('span', { class: 'hp-num' }, `${Math.min(prog[0], prog[1])}/${prog[1]}`)) : null,
          h('small', { class: 'achv-reward' }, `보상: ${reward}`),
        ),
      );
    })),
  );
});
