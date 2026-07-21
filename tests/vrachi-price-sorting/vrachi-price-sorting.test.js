import { test } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '../..');
const BASE_URL  = process.env.TEST_BASE_URL || 'https://eastclinic.ru';
const ENV_LABEL = BASE_URL.includes('dev') ? 'dev' : 'prod';
const ROTATION_PATH = join(ROOT, 'results', `specialty-rotation-${ENV_LABEL}.json`);
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
// На странице специальности (напр. /vrachi/androlog):
//   - первые карточки = специалисты, у каждого услуга «Консультация андролога»
//   - ниже заголовок «Другие врачи Ист Клиники» — там уже другие услуги
// Фильтруем по услуге из первой карточки — берём только карточки
// с точно таким же названием услуги.
// На общей /vrachi фильтр не нужен — берём первые LIMIT_MAIN карточек.

async function collectSpecialtyCards(page, isMainPage) {
  return page.evaluate(({ cardSel, limitMain, isMain }) => {
    const allCards = [...document.querySelectorAll(cardSel)];
    if (allCards.length === 0) return [];

    // Ищем название услуги в карточке — кратчайший элемент, в чьём тексте есть «Консультация».
    // Название услуги может быть в нелистовом элементе (напр. <a>Консультация андролога<span>₽</span></a>),
    // поэтому перебираем все элементы и берём с наименьшей длиной текста.
    function getService(card) {
      const seen = new Set();
      const candidates = [];
      for (const el of card.querySelectorAll('*')) {
        const t = el.textContent.replace(/\s+/g, ' ').trim();
        if (/Консультация/i.test(t) && t.length > 10 && t.length < 80 && !seen.has(t)) {
          seen.add(t);
          candidates.push(t);
        }
      }
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => a.length - b.length);
      return candidates[0]; // кратчайшая строка = наиболее специфичное название услуги
    }

    // Ближайший рабочий день берём из календарной ленты — она не внутри самой карточки
    // .doctor-info-container, а лежит рядом с ней в общей обёртке .doctor-item-container
    // (.doctor-item-container > ... > .doctor-info-container + .doctor-calendar-container).
    // Дни в ленте идут подряд от сегодняшнего — поэтому позиция активного дня (класс
    // active-day) в списке .calendar-day-container — это и есть «дней до записи»,
    // сравнимое между разными карточками без разбора русских названий месяцев.
    function getNearestDayIndex(card) {
      const wrapper = card.closest('.doctor-item-container');
      if (!wrapper) return null;
      const days = [...wrapper.querySelectorAll('.calendar-day-container')];
      if (days.length === 0) return null;
      const activeIdx = days.findIndex(d => d.classList.contains('active-day'));
      return activeIdx >= 0 ? activeIdx : null;
    }

    function extractCard(card, idx) {
      // Цена
      let priceEl = card.querySelector('[class*="price"]');
      if (!priceEl || !/\d/.test(priceEl.textContent)) {
        priceEl = [...card.querySelectorAll('*')].find(el =>
          el.childElementCount === 0 && /₽/.test(el.textContent) && /\d/.test(el.textContent)
        ) || null;
      }
      const priceText = priceEl ? priceEl.textContent.trim() : null;

      // Имя врача
      const nameEl =
        card.querySelector('[class*="doctor-name"]') ||
        card.querySelector('[class*="name"]') ||
        card.querySelector('h2') ||
        card.querySelector('h3') ||
        card.querySelector('a[href*="/vrach/"]');
      const name = (nameEl ? nameEl.textContent.replace(/\s+/g, ' ').trim() : '').slice(0, 60)
                   || `Врач #${idx + 1}`;

      return { pos: idx + 1, name, priceText, service: getService(card), nearestDayIndex: getNearestDayIndex(card) };
    }

    if (isMain) {
      // Общая /vrachi — берём первые limitMain карточек без фильтра по услуге
      return allCards.slice(0, limitMain).map(extractCard);
    }

    // Страница специальности: определяем услугу по первой карточке
    const firstService = getService(allCards[0]);
    if (!firstService) {
      // Название услуги не найдено — берём первые limitMain карточек
      return allCards.slice(0, limitMain).map(extractCard);
    }

    // Берём только карточки с той же услугой, что у первой карточки
    return allCards
      .filter(card => getService(card) === firstService)
      .map(extractCard);

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
  cards.forEach(c => console.log(
    `  [${c.pos}] ${c.name} — ${c.price} ₽` +
    (c.nearestDayIndex !== null ? `, ближайший день: +${c.nearestDayIndex}` : ', ближайший день: неизвестен') +
    (c.service ? ` (${c.service})` : '')
  ));

  if (cards.length < 2) {
    console.log('  ⚠ Недостаточно карточек с ценой — пропуск');
    return { ok: true, skipped: true, shortUrl };
  }

  // Ключ сортировки: сначала цена, при равной цене — чей день записи ближе
  // (меньше индекс в календарной ленте). Врача без известного дня (нет слотов
  // /не нашли календарь) при равной цене считаем «дальше всех» — не выигрывает тай-брейк.
  const dayKey = (c) => c.nearestDayIndex === null ? Infinity : c.nearestDayIndex;
  const compare = (a, b) => a.price !== b.price ? a.price - b.price : dayKey(a) - dayKey(b);

  let bestIdx = 0;
  for (let i = 1; i < cards.length; i++) {
    if (compare(cards[i], cards[bestIdx]) < 0) bestIdx = i;
  }
  const best = cards[bestIdx];

  // Нарушители первой позиции — все карточки перед лучшей по цене (и дню при равной цене)
  const violators = bestIdx > 0 ? cards.slice(0, bestIdx) : [];

  // Отдельно ищем инверсии при РАВНОЙ цене по всему списку: врач с более далёким днём
  // стоит раньше врача с более близким днём той же цены.
  const dayViolations = [];
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      if (cards[i].price === cards[j].price &&
          cards[i].nearestDayIndex !== null && cards[j].nearestDayIndex !== null &&
          cards[i].nearestDayIndex > cards[j].nearestDayIndex) {
        dayViolations.push({ earlier: cards[i], later: cards[j] });
      }
    }
  }

  if (violators.length === 0 && dayViolations.length === 0) {
    console.log(`  ✓ OK: первый врач (${cards[0].price} ₽) — лучший по цене/дню`);
    return { ok: true, shortUrl };
  }

  console.log(`  ✗ ОШИБКА на ${shortUrl}`);
  violators.forEach(c => console.log(`    ✗ [${c.pos}] ${c.name} — ${c.price} ₽ (день +${dayKey(c)})`));
  if (violators.length) {
    console.log(`    ✓ [${best.pos}] ${best.name} — ${best.price} ₽ (день +${dayKey(best)})  ← должен быть первым`);
  }
  dayViolations.forEach(({ earlier, later }) => console.log(
    `    ✗ при цене ${earlier.price} ₽: [${earlier.pos}] ${earlier.name} (день +${earlier.nearestDayIndex}) ` +
    `стоит раньше [${later.pos}] ${later.name} (день +${later.nearestDayIndex}), хотя должен быть после`
  ));

  return { ok: false, shortUrl, violators, best, dayViolations };
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
    test.setTimeout(300_000); // 10 страниц × ~30 сек каждая
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
      const lines = [`\n${f.shortUrl}:`];
      if (f.violators.length) {
        lines.push(
          `  Нарушен порядок по цене (лучший вариант — ${f.best.price} ₽):`,
          ...f.violators.map(c => `    • [позиция ${c.pos}] ${c.name} — ${c.price} ₽`),
          `    ← должен стоять первым: [позиция ${f.best.pos}] ${f.best.name} — ${f.best.price} ₽`,
        );
      }
      f.dayViolations.forEach(({ earlier, later }) => lines.push(
        `  При цене ${earlier.price} ₽: [позиция ${earlier.pos}] ${earlier.name} (день +${earlier.nearestDayIndex}) ` +
        `стоит раньше [позиция ${later.pos}] ${later.name} (день +${later.nearestDayIndex}), а должен быть после`
      ));
      return lines.join('\n');
    });

    throw new Error(
      `Нарушена сортировка по цене на ${failed.length} стр. из ${urls.length}:` +
      report.join('\n')
    );
  });
});
