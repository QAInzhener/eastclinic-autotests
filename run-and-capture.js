import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const env = process.argv[2] || 'prod';
const isDev = env === 'dev';
const baseUrl = isDev ? 'http://dev1.eastclinic.local' : 'https://eastclinic.ru';
const label = 'все тесты (' + (isDev ? 'dev1.eastclinic.local' : 'eastclinic.ru') + ')';
const logFile = 'results/last-log-' + (isDev ? 'dev' : 'prod') + '.json';
const resultsFile = 'results/all-results-' + (isDev ? 'dev' : 'prod') + '.json';

let output = '';

const proc = spawn('npx', ['playwright', 'test', '--retries=1'], {
  shell: true,
  cwd: process.cwd(),
  env: { ...process.env, TEST_BASE_URL: baseUrl },
});

proc.stdout.on('data', chunk => { output += chunk.toString(); process.stdout.write(chunk); });
proc.stderr.on('data', chunk => { output += chunk.toString(); process.stderr.write(chunk); });

proc.on('close', code => {
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
      writeFileSync(resultsFile, JSON.stringify({
        ...existing,
        suites: [...existing.suites.filter(s => !freshFiles.has(s.file)), ...fresh.suites],
      }, null, 2));
    }
  } catch (e) { console.error('merge error:', e.message); }

  process.exit(code || 0);
});
