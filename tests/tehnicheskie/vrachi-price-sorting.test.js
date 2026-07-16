import { test } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT          = join(__dirname, '../..');
const ROTATION_PATH = join(ROOT, 'results', 'specialty-rotation.json');
const BASE_URL      = process.env.TEST_BASE_URL || 'https://eastclinic.ru';
const VRACHI_URL    = BASE_URL + '/vrachi';

const BATCH_SIZE  = 9;   // страниц специальностей за один прогон
const LIMIT_MAIN  = 20;  // лимит карточек для /vrachi (общей страницы)

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
  const clean = text.replace(/ /g, ' ');
  const m = clean.match(/(\d[\d\s]*)\s*₽/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/\s/g, ''), 10);
  return n >= 100 && n <= 500000 ? n : null;
}

// ── Загрузить все карточки (кликать «Показать ещё» пока видна) ──

async function loadCards(page) {
  await page.waitForSelector('.doctor-info-container', { timeout: 12000 }).catch(() => {});
  for (let attempt = 0; attempt < 5; attempt++) {
    const moreBtn = page.locator('button.more-button').first();
    if (!await moreBtn.isVisible().catch(() => false)) break;
    const count = await page.locator('.doctor-info-container').count();
    await moreBtn.scrollIntoViewIfNeeded();
    await moreBtn.click();
    await page.waitForFunction(
      (prev) => document.querySelectorAll('.doctor-info-container').length > prev,
      count,
      { timeout: 8000 }
    ).catch(() => {});
  }
}

// ── Сбор карточек только из секции специальности ─────────────
// Страницы специальностей делятся на два блока:
//   1) врачи выбранной специальности (нужны нам)
//   2) «Другие врачи Ист Клиники» — идут ниже подзаголовка (исключаем)
// На общей /vrachi подзаголовка нет → берём первые LIMIT_MAIN карточек.

async function collectSpecialtyCards(page, isMainPage) {
  return page.evaluate(({ cardSel, limitMain, isMain }) => {
    // Ищем подзаголовок «Другие врачи» — он отделяет блок специальности от остальных
    const separator = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,strong,div')]
      .find(el => {
        const t = el.textContent.trim();
        return /Другие врачи/i.test(t) && t.length < 120;
      });

    const allCards = [...document.querySelectorAll(cardSel)];

    let targetCards;
    if (separator) {
      // Берём только карточки, которые стоят ДО разделителя в DOM
      // compareDocumentPosition возвращает DOCUMENT_POSITION_PRECEDING (4),
      // когда аргумент (card) предшествует вызывающему узлу (separator)
      targetCards = allCards.filter(card => (separator.compareDocumentPosition(card) & 4) !== 0);
    } else {
      // Общая страница /vrachi — берём первые LIMIT_MAIN карточек
      targetCards = allCards.slice(0, limitMain);
    }

    return targetCards.map((card, idx) => {
      // Цена
      let priceEl = card.querySelector('[class*="price"]');
      if (!priceEl || !/\d/.test(priceEl.textContent)) {
        priceEl = [...card.querySelectorAll('*')].find(el =>
          el.childElementCount === 0 && /₽/.test(el.textContent) && /\d/.test(el.textContent)
        ) || null;
      }
      const priceText = priceEl ? priceEl.textContent.trim() : null;

      // Название услуги (для лога)
      const serviceEl = card.querySelector('[class*="service-name"], [class*="speciality"], [class*="specialty"]');
      const service   = serviceEl ? serviceEl.textContent.trim().slice(0, 60) : null;

      // Имя врача
      const nameEl =
        card.querySelector('[class*="doctor-name"]') ||
        card.querySelector('[class*="name"]') ||
        card.querySelector('h2') ||
        card.querySelector('h3') ||
        card.querySelector('a[href*="/vrach/"]');
      const name = (nameEl ? nameEl.textContent.replace(/\s+/g, ' ').trim() : '').slice(0, 60)
                   || `Врач #${idx + 1}`;

      return { pos: idx + 1, name, priceText, service };
    });
  }, { cardSel: '.doctor-info-container', limitMain: LIMIT_MAIN, isMain: isMainPage });
}

// ── Проверка одной страницы, возвращает объект результата ─────

async function checkOnePage(page, url) {
  const shortUrl = url.replace(BASE_URL, '') || '/vrachi';
  const isMain   = url === VRACHI_URL;

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

  const maintenance = await page.locator('text=Сайт скоро вернётся').isVisible({ timeout: 2000 }).catch(() => false);
  const crashed     = await page.locator('text=Что-то пошло не так').isVisible({ timeout: 1000 }).catch(() => false);
  if (maintenance || crashed) {
    console.log(`\n[price-sort] ${shortUrl} — ⚠ страница недоступна`);
    return { ok: false, unavailable: true, shortUrl };
  }

  await loadCards(page);

  const raw   = await collectSpecialtyCards(page, isMain);
  const cards = raw.map(c => ({ ...c, price: parsePrice(c.priceText) })).filter(c => c.price !== null);

  console.log(`\n[price-sort] ${shortUrl}`);
  console.log(`  Карточек специальности: ${raw.length}, с ценой: ${cards.length}`);
  cards.forEach(c => console.log(`  [${c.pos}] ${c.name} — ${c.price} ₽${c.service ? ` (${c.service})` : ''}`));

  if (cards.length < 2) {
    console.log('  ⚠ Недостаточно карточек с ценой — пропуск');
    return { ok: true, skipped: true, shortUrl };
  }

  const firstPrice = cards[0].price;
  const minPrice   = Math.min(...cards.map(c => c.price));

  if (firstPrice === minPrice) {
    console.log(`  ✓ OK: первый врач (${firstPrice} ₽) самый дешёвый`);
    return { ok: true, shortUrl };
  }

  // Нарушители — все карточки от начала до первого врача с минимальной ценой
  const cheapestIdx = cards.findIndex(c => c.price === minPrice);
  const violators   = cards.slice(0, cheapestIdx);
  const cheapest    = cards[cheapestIdx];

  console.log(`  ✗ ОШИБКА: первый врач (${firstPrice} ₽), мин. цена ${minPrice} ₽`);
  violators.forEach(c => console.log(`    ✗ [${c.pos}] ${c.name} — ${c.price} ₽`));
  console.log(`    ✓ [${cheapest.pos}] ${cheapest.name} — ${minPrice} ₽  ← должен быть первым`);

  return { ok: false, shortUrl, violators, cheapest, firstPrice, minPrice };
}

// ── Тест ─────────────────────────────────────────────────────

const specialtyUrls = [];

test.describe('Сортировка врачей по цене', () => {
  test.describe.configure({ retries: 0 });

  test.beforeAll(async ({ browser }) => {
    if (specialtyUrls.length > 0) return;
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

  test('Сортировка врачей по цене — /vrachi + 9 специальностей', async ({ page }) => {
    const urls    = [VRACHI_URL, ...specialtyUrls];
    const failed  = [];

    for (const url of urls) {
      const result = await checkOnePage(page, url);
      if (!result.ok && !result.unavailable && !result.skipped) {
        failed.push(result);
      }
    }

    if (failed.length === 0) return;

    // Формируем подробный отчёт о нарушениях
    const report = failed.map(f => {
      const lines = [
        `\n${f.shortUrl} (мин. цена ${f.minPrice} ₽, нарушители):`,
        ...f.violators.map(c => `  • [позиция ${c.pos}] ${c.name} — ${c.price} ₽`),
        `  ← должен стоять первым: [позиция ${f.cheapest.pos}] ${f.cheapest.name} — ${f.minPrice} ₽`,
      ];
      return lines.join('\n');
    });

    throw new Error(
      `Нарушена сортировка по цене на ${failed.length} стр. из ${urls.length}:` +
      report.join('\n')
    );
  });
});
