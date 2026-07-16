import { test } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT          = join(__dirname, '../..');
const ROTATION_PATH = join(ROOT, 'results', 'specialty-rotation.json');
const BASE_URL      = process.env.TEST_BASE_URL || 'https://eastclinic.ru';
const VRACHI_URL    = BASE_URL + '/vrachi';

const BATCH_SIZE    = 9;   // страниц специальностей за один прогон
const CARDS_LIMIT   = 20;  // первые N карточек для проверки

// ── Ротация специальностей ────────────────────────────────────

function loadIndex() {
  try { return JSON.parse(readFileSync(ROTATION_PATH, 'utf8')).index || 0; } catch { return 0; }
}
function saveIndex(i) {
  try {
    mkdirSync(join(ROOT, 'results'), { recursive: true });
    writeFileSync(ROTATION_PATH, JSON.stringify({ index: i }));
  } catch {}
}

// ── Извлечение цены из текста ─────────────────────────────────

function parsePrice(text) {
  if (!text) return null;
  // Убираем неразрывные пробелы, ищем первое число перед ₽
  const clean = text.replace(/ /g, ' ');
  const m = clean.match(/(\d[\d\s]*)\s*₽/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/\s/g, ''), 10);
  // Разумные границы: цена в рублях от 100 до 500 000
  return n >= 100 && n <= 500000 ? n : null;
}

// ── Сбор цен из карточек врачей ──────────────────────────────

async function collectPrices(page) {
  return page.evaluate(({ cardSel, limit }) => {
    const cards = [...document.querySelectorAll(cardSel)].slice(0, limit);
    return cards.map((card, idx) => {
      // Сначала пробуем селекторы с "price" в имени класса
      let priceEl = card.querySelector('[class*="price"]');
      // Если нет — ищем любой листовой элемент с ₽ и цифрой
      if (!priceEl || !/\d/.test(priceEl.textContent)) {
        const all = [...card.querySelectorAll('*')];
        priceEl = all.find(el =>
          el.childElementCount === 0 &&
          /₽/.test(el.textContent) &&
          /\d/.test(el.textContent)
        ) || null;
      }
      const priceText = priceEl ? priceEl.textContent.trim() : null;

      // Имя врача
      const nameEl = card.querySelector('h2, h3, [class*="name"], [class*="doctor"]:not([class*="container"])');
      const name   = (nameEl ? nameEl.textContent.trim() : '').slice(0, 60) || `Врач #${idx + 1}`;

      return { pos: idx + 1, name, priceText };
    });
  }, { cardSel: '.doctor-info-container', limit: CARDS_LIMIT });
}

// ── Загрузить достаточно карточек (кликать «Показать ещё») ───

async function loadCards(page) {
  await page.waitForSelector('.doctor-info-container', { timeout: 12000 }).catch(() => {});

  for (let attempt = 0; attempt < 3; attempt++) {
    const count = await page.locator('.doctor-info-container').count();
    if (count >= CARDS_LIMIT) break;
    const moreBtn = page.locator('button.more-button').first();
    if (!await moreBtn.isVisible().catch(() => false)) break;
    await moreBtn.scrollIntoViewIfNeeded();
    await moreBtn.click();
    await page.waitForFunction(
      (prev) => document.querySelectorAll('.doctor-info-container').length > prev,
      count,
      { timeout: 8000 }
    ).catch(() => {});
  }
}

// ── Главная проверка: первый врач = минимальная цена ─────────

async function checkPriceSorting(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const maintenance = await page.locator('text=Сайт скоро вернётся').isVisible({ timeout: 2000 }).catch(() => false);
  const crashed     = await page.locator('text=Что-то пошло не так').isVisible({ timeout: 1000 }).catch(() => false);
  if (maintenance || crashed) throw new Error(`Страница недоступна: ${url}`);

  await loadCards(page);

  const raw   = await collectPrices(page);
  const cards = raw
    .map(c => ({ ...c, price: parsePrice(c.priceText) }))
    .filter(c => c.price !== null);

  const shortUrl = url.replace(BASE_URL, '');
  console.log(`\n[price-sort] ${shortUrl}`);
  console.log(`  Карточек всего: ${raw.length}, с ценой: ${cards.length}`);
  cards.slice(0, 5).forEach(c => console.log(`  #${c.pos} ${c.name} — ${c.price} ₽`));

  if (cards.length < 2) {
    console.log('  ⚠ Недостаточно карточек с ценой — пропуск проверки');
    return;
  }

  const firstPrice = cards[0].price;
  const minPrice   = Math.min(...cards.map(c => c.price));

  if (firstPrice !== minPrice) {
    const cheaper = cards.find(c => c.price === minPrice);
    throw new Error(
      `Нарушена сортировка по цене на странице ${shortUrl}\n` +
      `Первый врач:  "${cards[0].name}" — ${firstPrice} ₽\n` +
      `Более дешёвый (позиция ${cheaper.pos}): "${cheaper.name}" — ${minPrice} ₽`
    );
  }

  console.log(`  ✓ OK — первый врач (${firstPrice} ₽) самый дешёвый`);
}

// ── Тесты ────────────────────────────────────────────────────

// Все тесты в файле последовательно: beforeAll гарантированно
// выполнится в том же воркере, что и сами тесты
test.describe.configure({ mode: 'serial' });

const specialtyUrls = []; // заполняется в beforeAll

test.describe('Сортировка врачей по цене', () => {
  test.beforeAll(async ({ browser }) => {
    const ctx  = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    try {
      await page.goto(VRACHI_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

      const allUrls = await page.evaluate((base) => {
        const seen = new Set();
        return [...document.querySelectorAll('a[href]')]
          .map(a => a.href)
          .filter(href => {
            try {
              const u = new URL(href);
              // /vrachi/что-то — не /vrachi сам по себе
              return u.pathname.startsWith('/vrachi/') && u.pathname.length > '/vrachi/'.length;
            } catch { return false; }
          })
          .map(href => {
            const u = new URL(href);
            return base.replace(/\/$/, '') + u.pathname.replace(/\/$/, '');
          })
          .filter(url => { if (seen.has(url)) return false; seen.add(url); return true; })
          .sort();
      }, BASE_URL);

      console.log(`[price-sort] Специальностей на сайте: ${allUrls.length}`);

      if (allUrls.length === 0) {
        console.warn('[price-sort] Не найдено ни одной страницы специальности');
        return;
      }

      const idx = loadIndex();
      for (let i = 0; i < BATCH_SIZE; i++) {
        specialtyUrls.push(allUrls[(idx + i) % allUrls.length]);
      }
      saveIndex((idx + BATCH_SIZE) % allUrls.length);

      console.log(`[price-sort] Порция (${idx}–${idx + BATCH_SIZE - 1} mod ${allUrls.length}):`);
      specialtyUrls.forEach((u, i) => console.log(`  ${i + 1}. ${u.replace(BASE_URL, '')}`));
    } finally {
      await ctx.close();
    }
  });

  test('Сортировка по цене — /vrachi (общая)', async ({ page }) => {
    await checkPriceSorting(page, VRACHI_URL);
  });

  for (let i = 0; i < BATCH_SIZE; i++) {
    test(`Сортировка по цене — специальность ${i + 1} из ${BATCH_SIZE}`, async ({ page }) => {
      const url = specialtyUrls[i];
      if (!url) {
        test.skip(true, 'URL специальности не определён (страниц меньше 9)');
        return;
      }
      await checkPriceSorting(page, url);
    });
  }
});
