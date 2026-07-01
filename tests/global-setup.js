import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, '..', 'results', 'test-list.json');

export default async function globalSetup() {
  const list = {};

  function scan(dir, rel) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const relPath = rel ? rel + '/' + entry.name : entry.name;
      if (entry.isDirectory()) {
        scan(full, relPath);
      } else if (entry.name.endsWith('.test.js')) {
        const content = fs.readFileSync(full, 'utf8');
        const lines = content.split('\n');
        const tests = [];
        // Three separate patterns so that quote chars inside the string don't
        // truncate the title (e.g. test('Форма "X" — ...') must not stop at ").
        const PATTERNS = [
          /\btest\s*\(\s*'([^'\n]+)'/,   // single-quoted
          /\btest\s*\(\s*"([^"\n]+)"/,   // double-quoted
          /\btest\s*\(\s*`([^`\n]+)`/,   // template literal (static only)
        ];
        for (let i = 0; i < lines.length; i++) {
          for (const pat of PATTERNS) {
            const m = lines[i].match(pat);
            if (m && !m[1].includes('${')) {
              tests.push({ title: m[1], line: i + 1 });
              break;
            }
          }
        }
        if (tests.length) list[relPath] = tests;
      }
    }
  }

  try {
    scan(__dirname, '');
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.warn('[global-setup] Не удалось записать test-list.json:', e.message);
  }
}
