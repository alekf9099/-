/* 스크립트 샌드박스: 사용자 스크립트를 페이지와 분리된 Worker 에서 실행 (DOM·localStorage 접근 불가) */
/* global EasyEngine */
importScripts('engine.js');
const pending = new Map();
let seq = 0;

self.onmessage = async (e) => {
  const m = e.data || {};
  if (m.type === 'run') {
    let result;
    try {
      result = await EasyEngine.executeScript(m.code, m.ctx, {
        sendRequest: (spec) => new Promise((resolve) => {
          const id = 's' + (++seq);
          pending.set(id, resolve);
          self.postMessage({ type: 'send', id: id, spec: spec });
        })
      });
    } catch (err) {
      result = { tests: [], logs: [], vars: m.ctx.vars, error: String((err && err.message) || err) };
    }
    self.postMessage({ type: 'done', id: m.id, result: JSON.parse(JSON.stringify(result)) });
  } else if (m.type === 'sendResult') {
    const r = pending.get(m.id);
    if (r) { pending.delete(m.id); r(m.res); }
  }
};
