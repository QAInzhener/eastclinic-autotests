import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import http from 'http';

const env = process.argv[2] || 'prod';
const PID_FILE = 'results/cron.pid';
try { writeFileSync(PID_FILE, process.pid.toString()); } catch {}
const isDev = env === 'dev';
const baseUrl = isDev ? 'http://dev1.eastclinic.local' : 'https://eastclinic.ru';
const label = 'все тесты (' + (isDev ? 'dev1.eastclinic.local' : 'eastclinic.ru') + ')';
const logFile = 'results/last-log-' + (isDev ? 'dev' : 'prod') + '.json';
const resultsFile = 'results/all-results-' + (isDev ? 'dev' : 'prod') + '.json';

const runStart = new Date();
const startHeader = runStart.toLocaleDateString('ru-RU') + ' ' + runStart.toLocaleTimeString('ru-RU') + ' — ' + label + '\n';
let output = startHeader;

// Sends a notification to the running dashboard.js server (silently ignored if not running)
function notifyDashboard(path, body) {
  const data = JSON.stringify(body);
  const req = http.request(
    { hostname: 'localhost', port: 3000, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
    res => res.resume()
  );
  req.on('error', () => {});
  req.write(data);
  req.end();
}

// Buffer log chunks to avoid flooding dashboard with tiny HTTP requests
let logBuffer = '';
let logFlushTimer = null;
function flushLogBuffer() {
  if (logBuffer) { notifyDashboard('/api/internal/log', { text: logBuffer }); logBuffer = ''; }
  logFlushTimer = null;
}
function queueLog(text) {
  logBuffer += text;
  if (!logFlushTimer) logFlushTimer = setTimeout(flushLogBuffer, 250);
}

notifyDashboard('/api/internal/start', { env, label });

const proc = spawn('npx', ['playwright', 'test', '--retries=1'], {
  shell: true,
  cwd: process.cwd(),
  env: { ...process.env, TEST_BASE_URL: baseUrl },
});

proc.stdout.on('data', chunk => { const t = chunk.toString(); output += t; process.stdout.write(chunk); queueLog(t); });
proc.stderr.on('data', chunk => { const t = chunk.toString(); output += t; process.stderr.write(chunk); queueLog(t); });

proc.on('close', code => {
  clearTimeout(logFlushTimer);
  if (logBuffer) { notifyDashboard('/api/internal/log', { text: logBuffer }); logBuffer = ''; }

  try {
    writeFileSync(logFile, JSON.stringify({ text: output, label }));
  } catch (e) { console.error('log write error:', e.message); }

  try {
    const fresh = JSON.parse(readFileSync('results/last-run.json', 'utf8'));
    const existing = existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, 'utf8')) : null;
    if (!existing || !existing.suites) {
      writeFileSync(resultsFile, JSON.stringify(fresh, null, 2));
    } else {
      const freshFiles = new Set(fresh.suites.map(s => s.file));
      const testsDir = join(process.cwd(), 'tests');
      const rawSuites = [
        ...existing.suites.filter(s => {
          if (freshFiles.has(s.file)) return false;
          // Удаляем записи о тест-файлах, которых больше нет в репозитории
          const fp = s.file ? join(testsDir, s.file) : '';
          return fp && existsSync(fp);
        }),
        ...fresh.suites,
      ];
      // Дедупликация: оставляем последнюю запись на каждый file
      const seenFiles2 = new Set();
      const dedupedSuites = rawSuites.slice().reverse().filter(s => {
        const k = s.file || s.title || '';
        if (seenFiles2.has(k)) return false;
        seenFiles2.add(k);
        return true;
      }).reverse();
      writeFileSync(resultsFile, JSON.stringify({
        ...existing,
        stats: fresh.stats,
        suites: dedupedSuites,
      }, null, 2));
    }
  } catch (e) { console.error('merge error:', e.message); }

  try { unlinkSync(PID_FILE); } catch {}
  notifyDashboard('/api/internal/done', { code: code || 0 });
  process.exit(code || 0);
});
