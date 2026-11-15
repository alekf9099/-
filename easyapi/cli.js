#!/usr/bin/env node
/**
 * EasyAPI CLI — 컬렉션 자동 실행 (Newman 대체, CI 용)
 *
 *   node cli.js run <컬렉션.json> [옵션]
 *
 * 컬렉션: EasyAPI 백업 / EasyAPI 컬렉션 내보내기 / Postman v2.1 컬렉션
 */
'use strict';

const fs = require('fs');
const path = require('path');
const E = require('./public/js/engine.js');
const { performRequest } = require('./server.js');

const HELP = `
EasyAPI CLI - 컬렉션 자동 실행

사용법:
  node cli.js run <collection.json> [옵션]

옵션:
  -e, --environment <file>   환경 파일 (EasyAPI 백업 / Postman 환경 / {"key":"value"})
      --env-name <name>      백업 파일 안의 환경 이름 선택
  -g, --globals <file>       전역 변수 파일
      --var <key=value>      변수 직접 지정 (여러 번 사용 가능)
  -f, --folder <name>        특정 폴더(컬렉션)만 실행 (이름 일부 일치)
  -n, --iterations <n>       반복 횟수 (기본: 데이터 행 수 또는 1)
  -d, --data <file>          반복 데이터 (CSV 또는 JSON 배열)
      --delay <ms>           요청 사이 대기 시간
      --timeout <ms>         요청 타임아웃 (기본 30000)
      --bail                 첫 실패에서 중단
  -k, --insecure             SSL 인증서 검증 끄기
      --proxy <url>          HTTP/HTTPS 프록시
  -r, --reporters <list>     cli,junit,html,json,md (쉼표 구분, 기본 cli)
  -o, --out <dir>            리포트 저장 폴더 (기본 ./easyapi-reports)
      --no-color             색상 끄기

예시:
  node cli.js run shop.easyapi.json -e dev.json -r cli,junit,html
  node cli.js run postman_collection.json -d users.csv --bail
`;

function parseArgs(argv) {
  const o = { _: [], reporters: 'cli', out: 'easyapi-reports', vars: [], timeout: 30000, color: process.stdout.isTTY };
  const take = (i) => { if (argv[i + 1] === undefined) fail(argv[i] + ' 옵션에 값이 필요해요'); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-e': case '--environment': o.environment = take(i); i++; break;
      case '--env-name': o.envName = take(i); i++; break;
      case '-g': case '--globals': o.globals = take(i); i++; break;
      case '--var': o.vars.push(take(i)); i++; break;
      case '-f': case '--folder': o.folder = take(i); i++; break;
      case '-n': case '--iterations': o.iterations = Number(take(i)); i++; break;
      case '-d': case '--data': o.data = take(i); i++; break;
      case '--delay': o.delay = Number(take(i)); i++; break;
      case '--timeout': o.timeout = Number(take(i)); i++; break;
      case '--bail': o.bail = true; break;
      case '-k': case '--insecure': o.insecure = true; break;
      case '--proxy': o.proxy = take(i); i++; break;
      case '-r': case '--reporters': o.reporters = take(i); i++; break;
      case '-o': case '--out': o.out = take(i); i++; break;
      case '--no-color': o.color = false; break;
      case '-h': case '--help': o.help = true; break;
      default: o._.push(a);
    }
  }
  return o;
}
function fail(msg) { console.error('오류: ' + msg); process.exit(2); }
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { fail(file + ' 을(를) 읽을 수 없어요: ' + e.message); }
  return null;
}

function loadCollections(file, folder) {
  const j = readJson(file);
  let cols;
  if (j.info && j.item) cols = E.fromPostman(j);
  else if (Array.isArray(j.collections)) cols = j.collections.map(E.normalizeCollection);
  else if (Array.isArray(j.requests)) cols = [E.normalizeCollection(j)];
  else fail('알 수 없는 컬렉션 형식이에요 (EasyAPI 또는 Postman v2.1)');
  if (folder) {
    cols = cols.filter((c) => c.name.toLowerCase().indexOf(folder.toLowerCase()) >= 0);
    if (!cols.length) fail('"' + folder + '" 폴더를 찾지 못했어요');
  }
  return { cols, raw: j };
}

function loadEnv(file, name) {
  const j = readJson(file);
  if (Array.isArray(j.values)) return { name: j.name || path.basename(file), map: E.rowsToMap(j.values) };
  if (Array.isArray(j.envs)) {
    const env = name ? j.envs.find((e) => e.name === name) : j.envs[0];
    if (!env) fail('환경 "' + name + '" 이(가) 없어요');
    return { name: env.name, map: E.rowsToMap(env.vars) };
  }
  if (Array.isArray(j.vars)) return { name: j.name || path.basename(file), map: E.rowsToMap(j.vars) };
  const map = {};
  Object.keys(j).forEach((k) => { map[k] = typeof j[k] === 'object' ? JSON.stringify(j[k]) : String(j[k]); });
  return { name: path.basename(file), map };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._[0] !== 'run' || !args._[1]) { console.log(HELP); process.exit(args.help ? 0 : 2); }
  const c = args.color;
  const paint = (code) => (s) => (c ? '\x1b[' + code + 'm' + s + '\x1b[0m' : String(s));
  const green = paint('32'), red = paint('31'), dim = paint('2'), bold = paint('1'), yellow = paint('33'), lime = paint('92');

  const { cols, raw } = loadCollections(args._[1], args.folder);
  const vars = { globals: {}, collection: {}, environment: {}, data: {}, local: {} };
  if (raw && Array.isArray(raw.globals)) vars.globals = E.rowsToMap(raw.globals);
  let envName = '';
  if (args.environment) { const env = loadEnv(args.environment, args.envName); vars.environment = env.map; envName = env.name; }
  else if (raw && Array.isArray(raw.envs) && args.envName) { const env = raw.envs.find((e) => e.name === args.envName); if (env) { vars.environment = E.rowsToMap(env.vars); envName = env.name; } }
  if (args.globals) vars.globals = Object.assign(vars.globals, loadEnv(args.globals).map);
  args.vars.forEach((kv) => { const i = kv.indexOf('='); if (i > 0) vars.environment[kv.slice(0, i)] = kv.slice(i + 1); });
  const data = args.data ? E.parseDataFile(fs.readFileSync(args.data, 'utf8'), args.data) : [];

  const transport = (r) => performRequest({
    method: r.method, url: r.url, headers: r.headers, body: E.bodySpec(r),
    insecure: !!args.insecure, followRedirects: true, timeoutMs: args.timeout,
    proxy: args.proxy ? { enabled: true, url: args.proxy } : null
  }).catch((e) => ({ ok: false, error: { code: e.code || 'ERROR', message: e.message } }));
  const sandbox = (code, ctx) => E.executeScript(code, ctx, { sendRequest: transport });

  console.log('\n' + lime('▸') + ' ' + bold('EasyAPI') + dim(' · ' + cols.map((x) => x.name).join(', ') + (envName ? ' · 환경: ' + envName : '')));
  const total = { requests: 0, requestErrors: 0, tests: 0, passed: 0, failed: 0, totalTime: 0, failedRequests: 0 };
  const summaries = [];
  const iterCount = Math.max(1, Number(args.iterations) || data.length || 1);
  for (const col of cols) {
    vars.collection = E.rowsToMap(col.variables);
    const items = col.requests.map((req) => ({ req, parent: col }));
    if (!items.length) continue;
    console.log('\n' + bold(col.name));
    const sum = await E.runCollection(items, {
      iterations: args.iterations, data, delay: args.delay || 0, bail: args.bail, vars, cookieAuto: true, environmentName: envName
    }, { transport, sandbox }, {
      onResult: (rec, i) => {
        const r = rec.response;
        const st = rec.error ? red('ERR') : (r.status < 400 ? green(r.status) : yellow(r.status));
        const iter = iterCount > 1 ? dim('#' + (i + 1) + ' ') : '';
        console.log('  ' + iter + bold(rec.method.padEnd(6)) + ' ' + rec.name + ' ' + dim(rec.url) + '  ' + st + ' ' + dim(r && r.timeMs !== undefined ? r.timeMs + 'ms' : ''));
        if (rec.error) console.log('    ' + red('✗ ' + rec.error.message));
        rec.tests.forEach((t) => {
          if (t.skipped) console.log('    ' + dim('- ' + t.name + ' (skip)'));
          else if (t.passed) console.log('    ' + green('✓') + ' ' + t.name);
          else console.log('    ' + red('✗ ' + t.name) + '\n      ' + dim(t.error || ''));
        });
        rec.logs.filter((l) => l.level !== 'warn' || /변수/.test(l.text)).forEach((l) => console.log('    ' + dim('│ ' + l.text)));
      }
    });
    summaries.push({ col, sum });
    Object.keys(total).forEach((k) => { total[k] += sum.stats[k]; });
    if (args.bail && sum.stopped) break;
  }

  const line = '─'.repeat(48);
  console.log('\n' + dim(line));
  console.log('  요청        ' + total.requests + (total.failedRequests ? red('  (실패 ' + total.failedRequests + ')') : ''));
  console.log('  테스트      ' + (total.failed ? red(total.passed + '/' + total.tests) : green(total.passed + '/' + total.tests)) + ' 통과');
  console.log('  평균 응답   ' + (total.requests ? Math.round(total.totalTime / total.requests) : 0) + 'ms');
  console.log(dim(line) + '\n');

  // 리포트 파일
  const reporters = String(args.reporters).split(',').map((s) => s.trim()).filter(Boolean);
  const merged = {
    startedAt: summaries.length ? summaries[0].sum.startedAt : Date.now(), finishedAt: Date.now(),
    iterations: summaries.length ? summaries[0].sum.iterations : 1,
    results: summaries.reduce((a, s) => a.concat(s.sum.results.map((r) => Object.assign(r, { folder: s.col.name }))), []),
    stats: total, stopped: summaries.some((s) => s.sum.stopped)
  };
  const title = 'EasyAPI · ' + cols.map((x) => x.name).join(', ');
  const files = [];
  if (reporters.some((r) => r !== 'cli')) fs.mkdirSync(args.out, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const write = (name, content) => { const f = path.join(args.out, name); fs.writeFileSync(f, content); files.push(f); };
  if (reporters.includes('junit')) write('junit-' + stamp + '.xml', E.toJUnit(merged, title));
  if (reporters.includes('html')) write('report-' + stamp + '.html', E.toHtmlReport(merged, title));
  if (reporters.includes('md')) write('report-' + stamp + '.md', E.toMarkdown(merged, title));
  if (reporters.includes('json')) {
    write('result-' + stamp + '.json', JSON.stringify({
      title, stats: total, startedAt: merged.startedAt, finishedAt: merged.finishedAt,
      results: merged.results.map((r) => ({ iteration: r.iteration, folder: r.folder, name: r.name, method: r.method, url: r.url, status: r.response && r.response.status, timeMs: r.response && r.response.timeMs, error: r.error, tests: r.tests, extracted: r.extracted }))
    }, null, 2));
  }
  files.forEach((f) => console.log('  ' + dim('리포트: ') + f));
  if (files.length) console.log('');
  process.exit(total.failed || total.requestErrors ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
