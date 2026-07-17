import { test, expect } from '@playwright/test';
import { BASE_URL } from '../helpers/config.js';

const CLINIC_ITEMS = [
  { name: /^Сокол$/,              url: '/vrachi/sokol' },
  { name: /^Университет$/,        url: '/vrachi/universitet' },
  { name: /Новые Черемушки/,      url: '/vrachi/cheremushki' },
  { name: /^Беляево$/,            url: '/vrachi/belyaevo' },
  { name: /Волоколамская/,        url: '/vrachi/volokolamskaya' },
  { name: /^Люберцы$/,            url: '/vrachi/lyubercy' },
  { name: /^Одинцово$/,           url: '/vrachi/odintsovo' },
  { name: /Мытищи на Кадомцева/,  url: '/vrachi/mytishchi-na-kadomceva' },
  { name: /^Долгопрудный$/,       url: '/vrachi/dolgoprudnaya' },
];

// ─── Левая часть: текстовый поиск ────────────────────────────────────────────
// Структура: input.main-search-input (placeholder через CSS, не атрибут)
// Результаты: div.search-result-wrapper (без <a>, навигация через Vue click-хендлер)
// URL-паттерны: врач=/vrachi/, услуга=/uslugi/, заболевание=/zabolevaniya/<slug>, статья=/zabolevaniya/<категория>/<slug> (2 уровня)

async function openSearchAndType(page, query) {
  await page.goto(BASE_URL + '/', { waitUntil: 'load' });
  await page.waitForTimeout(500);
  try { await page.getByRole('button', { name: /принять/i }).click({ timeout: 2000 }); } catch {}
  const input = page.locator('input.main-search-input');
  await input.waitFor({ state: 'visible', timeout: 10000 });
  await input.click();                           // открывает выпадающий список
  await page.waitForTimeout(600);
  await page.keyboard.type(query, { delay: 60 }); // посимвольный ввод — триггерит события поиска
  await page.waitForTimeout(1200);               // debounce + загрузка результатов
}

async function clickFirstResult(page) {
  const wrapper = page.locator('.search-result-wrapper').first();
  await wrapper.waitFor({ state: 'visible', timeout: 10000 });
  const text = (await wrapper.textContent())?.trim();
  console.log('[test] Кликаем по подсказке:', text);
  await wrapper.click();
  await page.waitForURL(url => !url.href.endsWith('/') && url.href !== BASE_URL, { timeout: 10000 });
  const url = page.url();
  console.log('[test] ✓ URL:', url);
  return url;
}

test('Поле поиска (левая часть): несуществующий запрос — показывает «Такого нет»', async ({ page }) => {
  test.setTimeout(30000);
  await openSearchAndType(page, 'вагываыва');
  await expect(page.locator('.search-results-container').getByText('Такого нет')).toBeVisible({ timeout: 8000 });
  console.log('[test] ✓ При несуществующем запросе отображается «Такого нет»');
});

test('Поле поиска (левая часть): поиск врача — клик по подсказке открывает страницу врача', async ({ page }) => {
  test.setTimeout(30000);
  await openSearchAndType(page, 'Невролог');
  const url = await clickFirstResult(page);
  expect(url).toMatch(/\/vrachi\//);
});

test('Поле поиска (левая часть): поиск услуги — клик по подсказке открывает страницу услуги', async ({ page }) => {
  test.setTimeout(30000);
  await openSearchAndType(page, 'МРТ');
  const url = await clickFirstResult(page);
  expect(url).toMatch(/\/uslugi\//);
});

test('Поле поиска (левая часть): поиск заболевания — клик по подсказке открывает страницу заболевания', async ({ page }) => {
  test.setTimeout(30000);
  await openSearchAndType(page, 'остеохондроз');
  const url = await clickFirstResult(page);
  expect(url).toMatch(/\/zabolevaniya\//);
  expect(url).not.toMatch(/\/zabolevaniya\/info\//);
});

test('Поле поиска (левая часть): поиск статьи — клик по подсказке открывает страницу статьи', async ({ page }) => {
  test.setTimeout(30000);
  await openSearchAndType(page, 'как лечить');
  const url = await clickFirstResult(page);
  expect(url).toMatch(/\/zabolevaniya\/[^/]+\/[^/]+/);
});

// ─── Правая часть: выбор филиала ─────────────────────────────────────────────

test('Поле поиска: правая часть — выбор каждого филиала открывает нужную страницу врачей, кнопка × сбрасывает фильтр и переходит на /vrachi', async ({ page }) => {
  test.setTimeout(480000);

  async function gotoHomeAndOpenDropdown() {
    await page.goto(BASE_URL + '/', { waitUntil: 'load' });
    await page.locator('.clinic-search').waitFor({ state: 'visible', timeout: 15000 });
    // Принять куки ДО открытия дропдауна — иначе закрывает его
    try { await page.getByRole('button', { name: /принять/i }).click({ timeout: 2000 }); } catch {}
    await page.locator('.clinic-search').first().click();
    // Ждём пока список клиник полностью загрузится (span.text-main с «Сокол» — первый пункт)
    await page.locator('span.text-main').filter({ hasText: 'Сокол' }).first()
      .waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(300); // дать Vue завершить рендер всего списка
  }

  await gotoHomeAndOpenDropdown();

  for (const { name, url } of CLINIC_ITEMS) {
    const clinicSpan = page.locator('span.text-main').filter({ hasText: name }).first();
    await clinicSpan.waitFor({ state: 'visible', timeout: 5000 });
    await clinicSpan.click();
    await page.waitForURL('**' + url + '**', { timeout: 30000 });
    expect(page.url()).toContain(url);
    await gotoHomeAndOpenDropdown();
  }

  // Калуга — последний филиал
  const kalugaSpan = page.locator('span.text-main').filter({ hasText: 'Калуга' }).first();
  await kalugaSpan.waitFor({ state: 'visible', timeout: 5000 });
  await kalugaSpan.click();
  await page.waitForURL('**/vrachi/kaluga**', { timeout: 30000 });
  expect(page.url()).toContain('/vrachi/kaluga');

  // Нажимаем × — фильтр сбрасывается, переход на /vrachi (все клиники)
  await page.locator('.right > .nuxt-icon--fill.close > g > path').first().click();
  await page.waitForURL(/\/vrachi$/, { timeout: 15000 });
  expect(page.url()).toMatch(/\/vrachi$/);
});
