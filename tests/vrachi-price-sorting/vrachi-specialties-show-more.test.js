import { test } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { checkShowMore } from '../helpers/show-more.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '../..');
const BASE_URL  = process.env.TEST_BASE_URL || 'https://eastclinic.ru';
const ENV_LABEL = BASE_URL.includes('dev') ? 'dev' : 'prod';
const ROTATION_PATH = join(ROOT, 'results', `show-more-rotation-${ENV_LABEL}.json`);
const BATCH_SIZE = 10;

const BRANCH_SLUGS = new Set([
  'sokol', 'universitet', 'cheremushki', 'belyaevo', 'volokolamskaya',
  'lyubercy', 'odintsovo', 'mytishchi-na-kadomceva', 'dolgoprudnaya', 'kaluga',
]);

function loadIndex() {
  try { return JSON.parse(readFileSync(ROTATION_PATH, 'utf8')).index || 0; } catch { return 0; }
}
function saveIndex(i) {
  try {
    mkdirSync(join(ROOT, 'results'), { recursive: true });
    writeFileSync(ROTATION_PATH, JSON.stringify({ index: i }));
  } catch {}
}

const specialtyUrls = [];

test.describe('Кнопка «Показать ещё» — специальности', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(async ({ browser }) => {
    if (specialtyUrls.length > 0) return;
    const ctx  = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    try {
      await page.goto(BASE_URL + '/vrachi', { waitUntil: 'domcontentloaded', timeout: 30000 });

      const allUrls = await page.evaluate(({ base, branchSlugs }) => {
        const seen = new Set();
        return [...document.querySelectorAll('a[href]')]
          .map(a => a.href)
          .filter(href => {
            try {
              const u = new URL(href);
              if (!u.pathname.startsWith('/vrachi/')) return false;
              const slug = u.pathname.replace('/vrachi/', '').replace(/\//g, '');
              return slug.length > 0 && !branchSlugs.includes(slug);
            } catch { return false; }
          })
          .map(href => {
            const u = new URL(href);
            return base.replace(/\/$/, '') + u.pathname.replace(/\/$/, '');
          })
          .filter(url => { if (seen.has(url)) return false; seen.add(url); return true; })
          .sort();
      }, { base: BASE_URL, branchSlugs: [...BRANCH_SLUGS] });

      console.log(`[show-more-spec] Специальностей: ${allUrls.length}`);
      if (allUrls.length === 0) { console.warn('[show-more-spec] Не найдено страниц специальностей'); return; }

      const idx = loadIndex();
      for (let i = 0; i < BATCH_SIZE; i++) {
        specialtyUrls.push(allUrls[(idx + i) % allUrls.length]);
      }
      saveIndex((idx + BATCH_SIZE) % allUrls.length);

      console.log(`[show-more-spec] Порция (${idx + 1}–${idx + BATCH_SIZE}):`);
      specialtyUrls.forEach((u, i) => console.log(`  ${i + 1}. ${u.replace(BASE_URL, '')}`));
    } finally {
      await ctx.close();
    }
  });

  test('Кнопка «Показать ещё» — 10 страниц специальностей (ротация)', async ({ page }) => {
    test.setTimeout(300_000);
    if (specialtyUrls.length === 0) { console.warn('[show-more-spec] Нет URL для проверки — пропущено'); return; }

    const failed = [];
    let checked = 0;

    for (const url of specialtyUrls) {
      const path   = url.replace(BASE_URL, '');
      const result = await checkShowMore(page, url, path);
      if (result.skipped) {
        console.log(`[show-more-spec] ⚠ ${path}: ${result.reason}`);
        continue;
      }
      checked++;
      if (!result.ok) {
        failed.push(`${path}:\n  ${result.errors.join('\n  ')}`);
      } else {
        console.log(`[show-more-spec] ✓ ${path}: ${result.totalClicks} кликов, итого ${result.finalCount} карточек`);
      }
    }

    if (failed.length) {
      throw new Error(
        `Нарушена работа «Показать ещё» на ${failed.length} из ${checked} страниц:\n` +
        failed.map(f => `• ${f}`).join('\n')
      );
    }
  });
});
