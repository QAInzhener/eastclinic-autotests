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
  data.suites = data.suites.filter(s => {
    if (!s.file) return true;
    const fp = join(testsDir, s.file);
    if (!existsSync(fp)) { removed.push(s.file); return false; }
    return true;
  });

  if (removed.length) {
    writeFileSync(p, JSON.stringify(data, null, 2));
    console.log(`${p}: удалено ${removed.length} записей:`);
    removed.forEach(f => console.log(`  - ${f}`));
  } else {
    console.log(`${p}: нечего удалять (все файлы на месте)`);
  }
}
