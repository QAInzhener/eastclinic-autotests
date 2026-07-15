import http from 'http';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname, normalize, basename } from 'path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = 3000;
const LAST_RUN_PATH  = join(ROOT, 'results', 'last-run.json');
const TEST_LIST_PATH = join(ROOT, 'results', 'test-list.json');
const HTML_PATH = join(ROOT, 'dashboard.html');
const REPORT_DIR = join(ROOT, 'playwright-report');
const TEST_RESULTS_DIR = join(ROOT, 'test-results');
const PANEL_ORDER_PATH = join(ROOT, 'results', 'panel-order.json');
const THEME_PATH = join(ROOT, 'results', 'theme.json');

const REPORT_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.zip': 'application/zip',
  '.md': 'text/markdown; charset=utf-8',
};

function normEnv(env) {
  return env === 'dev' ? 'dev' : 'prod';
}
function resultsPath(env) {
  return join(ROOT, 'results', `all-results-${normEnv(env)}.json`);
}
function logPath(env) {
  return join(ROOT, 'results', `last-log-${normEnv(env)}.json`);
}

const sseClients = new Set();
let isRunning = false;
let currentFile = '';
let currentGrep = '';
let currentEnv = 'prod';
let currentProc = null;
let stopRequested = false;
let currentLogText = '';
let currentLogLabel = '';
let runStartedAt = 0;

// Watchdog for cron runs: if no log activity for 5 min, assume run finished
// without sending /api/internal/done (e.g. network error or process crash).
let cronWatchdog = null;
const CRON_INACTIVITY_MS = 5 * 60 * 1000;
function armCronWatchdog() {
  clearTimeout(cronWatchdog);
  cronWatchdog = setTimeout(() => {
    if (isRunning && !currentProc) {
      console.log('[watchdog] Нет активности от cron 5 мин — завершаем прогон автоматически');
      isRunning = false;
      saveLastLog(currentEnv);
      const existing = getResults(currentEnv);
      if (existing) saveAllResults(existing, currentEnv);
      broadcast('done', { code: 0, stopped: false });
    }
  }, CRON_INACTIVITY_MS);
}
function clearCronWatchdog() {
  clearTimeout(cronWatchdog);
  cronWatchdog = null;
}

function fmtDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU');
}

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(msg); } catch { sseClients.delete(client); }
  }
}

// ---- Result merge helpers ----

function specStatus(spec) {
  if (!spec.tests || !spec.tests.length) return 'unknown';
  const r = spec.tests[0].results;
  if (!r || !r.length) return 'unknown';
  return r[r.length - 1].status || 'unknown';
}

function walkSpecs(suite, cb) {
  if (suite.specs) suite.specs.forEach(cb);
  if (suite.suites) suite.suites.forEach(s => walkSpecs(s, cb));
}

function recalcStats(suites, baseStats) {
  let expected = 0, unexpected = 0, skipped = 0;
  suites.forEach(suite => walkSpecs(suite, spec => {
    const st = specStatus(spec);
    if (st === 'passed') expected++;
    else if (['failed', 'timedOut', 'interrupted'].includes(st)) unexpected++;
    else if (st === 'skipped') skipped++;
  }));
  // "flaky" (passed on retry) is already counted as "passed" above via the last
  // attempt's status — zero it out so totals don't double-count those specs.
  return { ...(baseStats || {}), expected, unexpected, skipped, flaky: 0 };
}

function mergeResults(existing, fresh, file, grep) {
  if (!fresh || !fresh.suites) return existing;
  if (!existing || !existing.suites) return { ...fresh, stats: recalcStats(fresh.suites, fresh.stats) };

  // Full run — fresh wins entirely, but stats are still recalculated (see recalcStats)
  if (!file && !grep) return { ...fresh, stats: recalcStats(fresh.suites, fresh.stats) };

  let mergedSuites;

  if (file && !grep) {
    // File run: replace suite(s) matching that file path
    const freshFiles = new Set(fresh.suites.map(s => s.file));
    mergedSuites = [
      ...existing.suites.filter(s => !freshFiles.has(s.file)),
      ...fresh.suites,
    ];
  } else {
    // Grep run (with or without file): update only the matching specs inside their files
    // Build a map: file → (specTitle → freshSpec)
    const freshByFile = new Map();
    fresh.suites.forEach(suite => {
      if (!freshByFile.has(suite.file)) freshByFile.set(suite.file, new Map());
      walkSpecs(suite, spec => freshByFile.get(suite.file).set(spec.title, spec));
    });

    function patchSuite(suite) {
      const freshSpecs = freshByFile.get(suite.file);
      if (!freshSpecs) return suite;
      const existingTitles = new Set((suite.specs || []).map(sp => sp.title));
      return {
        ...suite,
        specs: [
          ...(suite.specs || []).map(sp => freshSpecs.has(sp.title) ? freshSpecs.get(sp.title) : sp),
          ...[...freshSpecs.values()].filter(sp => !existingTitles.has(sp.title)), // новые specs
        ],
        suites: (suite.suites || []).map(patchSuite),
      };
    }

    const existingFiles = new Set(existing.suites.map(s => s.file));
    mergedSuites = [
      ...existing.suites.map(patchSuite),
      ...fresh.suites.filter(s => !existingFiles.has(s.file)), // new files not seen before
    ];
  }

  return {
    ...existing,
    suites: mergedSuites,
    stats:  recalcStats(mergedSuites, fresh.stats),
  };
}

function getLastRun() {
  if (!existsSync(LAST_RUN_PATH)) return null;
  try { return JSON.parse(readFileSync(LAST_RUN_PATH, 'utf8')); } catch { return null; }
}

function getResults(env) {
  const p = resultsPath(env);
  let data = null;
  if (existsSync(p)) {
    try { data = JSON.parse(readFileSync(p, 'utf8')); } catch {}
  }
  if (data && data.suites) data = { ...data, stats: recalcStats(data.suites, data.stats) };
  return data;
}

function saveAllResults(data, env) {
  try { writeFileSync(resultsPath(env), JSON.stringify(data)); } catch {}
}

function getLastLog(env) {
  if (normEnv(env) === currentEnv && (currentLogText || currentLogLabel)) {
    return { text: currentLogText, label: currentLogLabel };
  }
  const p = logPath(env);
  if (existsSync(p)) {
    try { return JSON.parse(readFileSync(p, 'utf8')); } catch {}
  }
  return { text: '', label: '' };
}

function saveLastLog(env) {
  try { writeFileSync(logPath(env), JSON.stringify({ text: currentLogText, label: currentLogLabel })); } catch {}
}

// ---- Test runner ----

const TEST_TITLE_PATTERNS = [
  /\btest\s*\(\s*'([^'\n]+)'/,
  /\btest\s*\(\s*"([^"\n]+)"/,
  /\btest\s*\(\s*`([^`\n]+)`/,
];

function findTestLine(filePath, title) {
  try {
    const lines = readFileSync(filePath, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const pat of TEST_TITLE_PATTERNS) {
        const m = lines[i].match(pat);
        if (m && m[1] === title) return i + 1;
      }
    }
  } catch {}
  return 0;
}

const ENV_URLS = {
  prod: 'https://eastclinic.ru',
  dev: 'http://dev1.eastclinic.local',
};

function runTests(file = '', grep = '', line = 0, env = 'prod') {
  if (isRunning) return false;
  isRunning = true;
  runStartedAt = Date.now();
  currentFile = file;
  currentGrep = grep;
  currentEnv = normEnv(env);
  const baseUrl = ENV_URLS[currentEnv];
  const name = grep ? grep : (file ? file.replace(/^tests[\/\\]/, '') : 'все тесты');
  currentLogText = '';
  currentLogLabel = name + ' (' + baseUrl.replace(/^https?:\/\//, '') + ')';
  broadcast('start', { file: file || 'все тесты', grep, env: currentEnv, baseUrl });
  const startHeader = fmtDateTime(runStartedAt) + ' — ' + currentLogLabel + '\n';
  currentLogText = startHeader;
  broadcast('log', { text: startHeader });

  const args = ['playwright', 'test'];
  if (file) {
    // suite.file in Playwright JSON is relative to testDir (no 'tests/' prefix).
    // findTestLine needs a full path from ROOT, and Playwright CLI needs 'tests/' prefix.
    const fullFile = file.replace(/\\/g, '/').startsWith('tests/') ? file.replace(/\\/g, '/') : 'tests/' + file.replace(/\\/g, '/');
    if (grep) {
      // Re-scan file to get the current line — immune to stale test-list.json after edits.
      const scanned = findTestLine(join(ROOT, fullFile), grep);
      if (scanned > 0) {
        args.push(`${fullFile}:${scanned}`);
      } else if (line > 0) {
        // title not found in file (renamed?) — fall back to stored line number
        args.push(`${fullFile}:${line}`);
      } else {
        args.push(fullFile);
      }
    } else {
      args.push(line > 0 ? `${fullFile}:${line}` : fullFile);
    }
  }

  const proc = spawn('npx', args, {
    cwd: ROOT,
    shell: true,
    env: { ...process.env, TEST_BASE_URL: baseUrl },
  });
  currentProc = proc;

  proc.stdout.on('data', chunk => {
    const text = chunk.toString();
    currentLogText += text;
    broadcast('log', { text });
  });
  proc.stderr.on('data', chunk => {
    const text = chunk.toString();
    currentLogText += text;
    broadcast('log', { text });
  });

  proc.on('close', code => {
    isRunning = false;
    currentProc = null;
    const wasStopped = stopRequested;
    stopRequested = false;
    saveLastLog(currentEnv);

    // Merge fresh results into the cumulative all-results file for this environment
    const fresh = getLastRun();
    if (fresh) {
      const merged = mergeResults(getResults(currentEnv), fresh, currentFile, currentGrep);
      saveAllResults(merged, currentEnv);
    }

    broadcast('done', { code, stopped: wasStopped });
  });

  proc.on('error', err => {
    isRunning = false;
    currentProc = null;
    stopRequested = false;
    saveLastLog(currentEnv);
    broadcast('error', { message: err.message });
  });

  return true;
}

function stopTests() {
  if (!isRunning) return false;
  stopRequested = true;
  if (currentProc && currentProc.pid) {
    // UI-triggered run: kill the cmd.exe tree spawned by runTests()
    spawn('taskkill', ['/pid', currentProc.pid, '/T', '/F'], { shell: true });
    return true;
  }
  // Cron run (run-and-capture.js): kill via PID file
  const pidPath = join(ROOT, 'results', 'cron.pid');
  if (existsSync(pidPath)) {
    try {
      const pid = parseInt(readFileSync(pidPath, 'utf8').trim());
      if (pid) {
        spawn('taskkill', ['/pid', pid, '/T', '/F'], { shell: true });
        // run-and-capture.js won't send /api/internal/done after being killed —
        // broadcast done ourselves after a short delay
        clearCronWatchdog();
        setTimeout(() => {
          if (isRunning) {
            isRunning = false;
            currentProc = null;
            saveLastLog(currentEnv);
            broadcast('done', { code: 1, stopped: true });
          }
        }, 2000);
        return true;
      }
    } catch {}
  }
  return false;
}

// ---- Trace scanning ----

function buildTraceTitleMap() {
  const map = {};
  const sources = [
    resultsPath('prod'),
    resultsPath('dev'),
    LAST_RUN_PATH,
  ];
  for (const p of sources) {
    if (!existsSync(p)) continue;
    let data;
    try { data = JSON.parse(readFileSync(p, 'utf8')); } catch { continue; }
    if (!data || !data.suites) continue;
    function walkSpecs(suite) {
      if (suite.specs) suite.specs.forEach(spec => {
        if (!spec.tests) return;
        spec.tests.forEach(test => {
          if (!test.results) return;
          test.results.forEach(result => {
            if (!result.attachments) return;
            result.attachments.forEach(att => {
              if (att.path) {
                const folder = basename(dirname(att.path));
                if (folder && spec.title && !map[folder]) map[folder] = spec.title;
              }
            });
          });
        });
      });
      if (suite.suites) suite.suites.forEach(walkSpecs);
    }
    data.suites.forEach(walkSpecs);
  }
  return map;
}

function scanTraces() {
  const titleMap = buildTraceTitleMap();
  const traces = [];
  if (!existsSync(TEST_RESULTS_DIR)) return traces;
  function walk(dir) {
    try {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
          walk(full);
        } else if (entry === 'trace.zip') {
          const rel = full.slice(TEST_RESULTS_DIR.length + 1).replace(/\\/g, '/');
          const name = basename(dirname(full));
          traces.push({ rel, name, title: titleMap[name] || null, size: st.size, mtime: st.mtimeMs });
        }
      }
    } catch {}
  }
  walk(TEST_RESULTS_DIR);
  traces.sort((a, b) => b.mtime - a.mtime);
  return traces;
}

// ---- HTTP server ----

function parseBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); }
    });
  });
}

mkdirSync(join(ROOT, 'results'), { recursive: true });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/') {
    const html = readFileSync(HTML_PATH, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  if (req.method === 'GET' && url.pathname === '/api/results') {
    const data = getResults(url.searchParams.get('env'));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(data !== null ? JSON.stringify(data) : 'null');
  }

  if (req.method === 'GET' && url.pathname === '/api/test-list') {
    let data = {};
    if (existsSync(TEST_LIST_PATH)) {
      try { data = JSON.parse(readFileSync(TEST_LIST_PATH, 'utf8')); } catch {}
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(data));
  }

  if (req.method === 'GET' && url.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ running: isRunning, env: isRunning ? currentEnv : null, startedAt: isRunning ? runStartedAt : null }));
  }

  if (req.method === 'GET' && url.pathname === '/api/log') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(getLastLog(url.searchParams.get('env'))));
  }

  if (req.method === 'POST' && url.pathname === '/api/run') {
    const body = await parseBody(req);
    const started = runTests(body.file || '', body.grep || '', body.line || 0, body.env || 'prod');
    res.writeHead(started ? 200 : 409, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ started }));
  }

  if (req.method === 'POST' && url.pathname === '/api/stop') {
    const stopped = stopTests();
    res.writeHead(stopped ? 200 : 409, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ stopped }));
  }

  // Internal API for cron/run-and-capture.js — notifies dashboard of external test runs
  if (req.method === 'POST' && url.pathname === '/api/internal/start') {
    const body = await parseBody(req);
    if (!isRunning) {
      isRunning = true;
      currentFile = '';
      currentGrep = '';
      currentEnv = normEnv(body.env || 'prod');
      currentLogText = '';
      currentLogLabel = body.label || ('все тесты (' + (ENV_URLS[currentEnv] || '').replace(/^https?:\/\//, '') + ')');
      stopRequested = false;
      runStartedAt = Date.now();
      broadcast('start', { file: 'все тесты', grep: '', env: currentEnv, baseUrl: ENV_URLS[currentEnv] });
      const startHeader = fmtDateTime(runStartedAt) + ' — ' + currentLogLabel + '\n';
      currentLogText = startHeader;
      broadcast('log', { text: startHeader });
      armCronWatchdog();
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (req.method === 'POST' && url.pathname === '/api/internal/log') {
    const body = await parseBody(req);
    if (body.text) {
      currentLogText += body.text;
      broadcast('log', { text: body.text });
      if (isRunning && !currentProc) armCronWatchdog();
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (req.method === 'POST' && url.pathname === '/api/internal/done') {
    const body = await parseBody(req);
    clearCronWatchdog();
    if (isRunning) {
      isRunning = false;
      currentProc = null;
      saveLastLog(currentEnv);
      // run-and-capture.js already merged results into all-results file;
      // just recalculate stats so the panel gets fresh counts
      const existing = getResults(currentEnv);
      if (existing) saveAllResults(existing, currentEnv);
      broadcast('done', { code: body.code || 0, stopped: false });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (req.method === 'GET' && url.pathname.startsWith('/report/')) {
    let rel = url.pathname.slice('/report/'.length) || 'index.html';
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const filePath = normalize(join(REPORT_DIR, rel));
    if (!filePath.startsWith(REPORT_DIR) || !existsSync(filePath)) {
      res.writeHead(404);
      return res.end('Отчёт не найден. Запустите хотя бы один прогон тестов.');
    }
    const mime = REPORT_MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    return res.end(readFileSync(filePath));
  }

  if (req.method === 'GET' && url.pathname === '/api/theme') {
    let theme = null;
    if (existsSync(THEME_PATH)) {
      try { theme = JSON.parse(readFileSync(THEME_PATH, 'utf8')).theme; } catch {}
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ theme: theme || null }));
  }

  if (req.method === 'POST' && url.pathname === '/api/theme') {
    const body = await parseBody(req);
    if (body.theme === 'dark' || body.theme === 'light') {
      try { writeFileSync(THEME_PATH, JSON.stringify({ theme: body.theme })); } catch {}
      broadcast('theme', { theme: body.theme });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (req.method === 'GET' && url.pathname === '/api/panel-order') {
    let order = [];
    if (existsSync(PANEL_ORDER_PATH)) {
      try { order = JSON.parse(readFileSync(PANEL_ORDER_PATH, 'utf8')); } catch {}
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(order));
  }

  if (req.method === 'POST' && url.pathname === '/api/panel-order') {
    const body = await parseBody(req);
    if (Array.isArray(body.order)) {
      try { writeFileSync(PANEL_ORDER_PATH, JSON.stringify(body.order)); } catch {}
      broadcast('panel-order', { order: body.order });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (req.method === 'GET' && url.pathname === '/api/traces') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(scanTraces()));
  }

  if (req.method === 'GET' && url.pathname.startsWith('/traces/')) {
    const rel = decodeURIComponent(url.pathname.slice('/traces/'.length));
    const filePath = normalize(join(TEST_RESULTS_DIR, rel));
    if (!filePath.startsWith(TEST_RESULTS_DIR) || !existsSync(filePath)) {
      res.writeHead(404);
      return res.end('Трейс не найден');
    }
    let data;
    try { data = readFileSync(filePath); } catch {
      res.writeHead(500);
      return res.end('Ошибка чтения файла трейса');
    }
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${basename(filePath)}"`,
    });
    return res.end(data);
  }

  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write('event: connected\ndata: {}\n\n');
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\nПанель тестирования запущена: http://localhost:${PORT}\n`);
});
