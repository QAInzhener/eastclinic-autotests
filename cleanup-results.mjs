// Одноразовая очистка: удаляет из all-results-*.json записи о тест-файлах,
// которых больше нет в папке tests/.
// Запустить один раз на сервере: node cleanup-results.mjs
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const testsDir = join(process.cwd(), 'tests');

for (const env of ['prod', 'dev']) {
  const p = `results/all-results-${env}.json`;
  if (!existsSync(p)) { console.log(`${p}: файл не найден`); continue; }

  const data = JSON.parse(readFileSync(p, 'utf8'));
  if (!data.suites) { console.log(`${p}: нет suites`); continue; }

  const before = data.suites.length;
  const removed = [];
  // Удаляем записи о файлах, которых нет на диске
  data.suites = data.suites.filter(s => {
    if (!s.file) return true;
    const fp = join(testsDir, s.file);
    if (!existsSync(fp)) { removed.push(s.file); return false; }
    return true;
  });

  // Дедупликация: если одно и то же file встречается дважды — оставляем последнее
  const seenFiles = new Set();
  const dupRemoved = [];
  data.suites = data.suites.slice().reverse().filter(s => {
    const k = s.file || s.title || '';
    if (seenFiles.has(k)) { dupRemoved.push(k); return false; }
    seenFiles.add(k);
    return true;
  }).reverse();

  if (removed.length || dupRemoved.length) {
    writeFileSync(p, JSON.stringify(data, null, 2));
    if (removed.length) {
      console.log(`${p}: удалено ${removed.length} несуществующих записей:`);
      removed.forEach(f => console.log(`  - ${f}`));
    }
    if (dupRemoved.length) {
      console.log(`${p}: удалено ${dupRemoved.length} дублирующих записей:`);
      dupRemoved.forEach(f => console.log(`  - ${f}`));
    }
  } else {
    console.log(`${p}: нечего удалять (все файлы на месте, дублей нет)`);
  }
}
