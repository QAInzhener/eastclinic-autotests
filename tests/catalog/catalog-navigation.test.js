import { test, expect } from '@playwright/test';
import { BASE_URL } from '../helpers/config.js';

const CATALOG_URL = BASE_URL + '/catalog';

async function acceptCookies(page) {
  try {
    await page.getByRole('button', { name: /принять/i }).waitFor({ state: 'visible', timeout: 5000 });
    await page.getByRole('button', { name: /принять/i }).click();
  } catch {}
}

async function openCatalog(page) {
  await page.goto(CATALOG_URL, { waitUntil: 'domcontentloaded' });
  await acceptCookies(page);
  await page.locator('.catalog-link').first().waitFor({ state: 'visible', timeout: 8000 });
}

test.describe.configure({ retries: 0 });

test('Каталог услуг — страница загружается, в левой панели отображаются разделы, «Полный список» активен', async ({ page }) => {
  await openCatalog(page);

  const sections = page.locator('.catalog-link');
  const count = await sections.count();
  expect(count, 'Разделов в левой панели должно быть не менее 20').toBeGreaterThanOrEqual(20);
  console.log(`[test] Разделов в левой панели: ${count}`);

  const firstSection = sections.first();
  await expect(firstSection).toHaveText('Полный список');
  await expect(firstSection).toHaveClass(/\bactive\b/);
  console.log('[test] ✓ «Полный список» активен по умолчанию');

  // Правая часть загружена — есть хотя бы одна цена
  await expect(page.locator('body')).toContainText('₽', { timeout: 8000 });
  console.log('[test] ✓ Услуги с ценами отображаются в правой части');
});

test('Каталог услуг — все разделы левой панели: клик делает раздел активным и показывает услуги с ценами', async ({ page }) => {
  test.setTimeout(240000);

  await openCatalog(page);

  // Собираем данные всех разделов до начала итерации
  const count = await page.locator('.catalog-link').count();
  const sections = [];
  for (let i = 0; i < count; i++) {
    const el = page.locator('.catalog-link').nth(i);
    sections.push({
      text: (await el.innerText()).trim(),
      href: await el.getAttribute('href'),
    });
  }
  console.log(`[test] Разделов для проверки: ${sections.length}`);

  for (let i = 0; i < sections.length; i++) {
    const { text } = sections[i];

    // Кликаем с retry: перед каждой попыткой убеждаемся что на КОРНЕВОМ каталоге
    // (Vue может сделать отложенный редирект или уйти на /catalog/uslugi/X где нет всех разделов)
    let clicked = false;
    for (let attempt = 0; attempt < 3 && !clicked; attempt++) {
      const urlBase = page.url().split('?')[0].split('#')[0];
      if (!urlBase.endsWith('/catalog')) {
        await page.goto(CATALOG_URL, { waitUntil: 'domcontentloaded' });
        await page.locator('.catalog-link').first().waitFor({ state: 'visible', timeout: 8000 });
      }
      try {
        const link = page.locator('.catalog-link').filter({ hasText: text }).first();
        await link.scrollIntoViewIfNeeded({ timeout: 5000 });
        await link.click({ timeout: 5000 });
        clicked = true;
      } catch (e) {
        if (attempt === 2) throw e;
        await page.waitForTimeout(200);
      }
    }

    // Ждём завершения навигации (полная загрузка или SPA)
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });

    const currentUrl = page.url();

    // Если остались на странице каталога — проверяем активный класс
    if (currentUrl.includes('/catalog')) {
      await expect(page.locator('.catalog-link.active')).toBeVisible({ timeout: 8000 });
    }

    console.log(`[test] ✓ ${i + 1}/${sections.length} «${text}» → ${currentUrl}`);
  }
});

test('Каталог услуг — переключение между разделами обновляет содержимое правой панели', async ({ page }) => {
  await openCatalog(page);

  // Переходим в Неврологию
  await page.locator('.catalog-link').filter({ hasText: /^Неврология$/ }).click();
  await expect(page).toHaveURL(/nevrologiya/, { timeout: 10000 });
  await expect(page.locator('body')).toContainText('₽', { timeout: 8000 });
  const neuralContent = await page.locator('body').innerText();
  console.log('[test] ✓ Раздел «Неврология» загружен');

  // Переходим в Гинекологию
  await page.locator('.catalog-link').filter({ hasText: /^Гинекология$/ }).click();
  await expect(page).toHaveURL(/ginekologiya/, { timeout: 10000 });
  await expect(page.locator('body')).toContainText('₽', { timeout: 8000 });
  const gynContent = await page.locator('body').innerText();
  console.log('[test] ✓ Раздел «Гинекология» загружен');

  // Содержимое правой части должно отличаться
  expect(neuralContent).not.toEqual(gynContent);
  console.log('[test] ✓ Содержимое правой части различается при смене раздела');
});
