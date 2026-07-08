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
  await expect(firstSection).toHaveClass(/router-link-exact-active/);
  console.log('[test] ✓ «Полный список» активен по умолчанию');

  // Правая часть загружена — есть хотя бы одна цена
  await expect(page.locator('body')).toContainText('₽', { timeout: 8000 });
  console.log('[test] ✓ Услуги с ценами отображаются в правой части');
});

test('Каталог услуг — клик на раздел «Остеопатия» меняет URL и показывает услуги раздела', async ({ page }) => {
  await openCatalog(page);

  await page.locator('.catalog-link').filter({ hasText: /^Остеопатия$/ }).click();

  await expect(page).toHaveURL(/\/catalog\/uslugi\/osteopatiya/, { timeout: 10000 });
  console.log('[test] ✓ URL изменился на /catalog/uslugi/osteopatiya');

  // Раздел стал активным в левой панели (router-link-exact-active — точное совпадение URL)
  const activeLink = page.locator('.catalog-link.router-link-exact-active');
  await expect(activeLink).toHaveText('Остеопатия', { timeout: 5000 });
  console.log('[test] ✓ «Остеопатия» подсвечена в левой панели');

  // Правая часть показывает услуги по остеопатии
  await expect(page.locator('body')).toContainText('Остеопатическая коррекция', { timeout: 8000 });
  await expect(page.locator('body')).toContainText('₽');
  console.log('[test] ✓ Правая часть показывает услуги раздела с ценами');
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
