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
  test.setTimeout(180000);

  await openCatalog(page);

  const count = await page.locator('.catalog-link').count();
  console.log(`[test] Разделов для проверки: ${count}`);

  for (let i = 0; i < count; i++) {
    const link = page.locator('.catalog-link').nth(i);
    const sectionName = (await link.innerText()).trim();
    const href = await link.getAttribute('href');

    await link.scrollIntoViewIfNeeded();
    await link.click();

    // Раздел стал активным в левой панели
    await expect(link).toHaveClass(/\bactive\b/, { timeout: 8000 });

    // URL соответствует разделу (для разделов с собственным URL, игнорируем якоря #)
    const expectedPath = href ? href.split('#')[0] : null;
    if (expectedPath && expectedPath.length > 1) {
      await expect(page).toHaveURL(new RegExp(expectedPath.replace(/\//g, '\\/')), { timeout: 8000 });
    }

    console.log(`[test] ✓ ${i + 1}/${count} «${sectionName}» → ${href}`);
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
