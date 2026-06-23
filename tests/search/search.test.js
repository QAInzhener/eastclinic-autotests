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

test('Поле поиска: правая часть — выбор каждого филиала открывает нужную страницу врачей, кнопка × сбрасывает фильтр и переходит на /vrachi', async ({ page }) => {
  test.setTimeout(480000);

  async function gotoHomeAndOpenDropdown() {
    await page.goto(BASE_URL + '/', { waitUntil: 'load' });
    await page.locator('.clinic-search').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(500);
    await page.locator('.clinic-search').first().click();
    await page.locator('.clinics-list').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(800);
  }

  await gotoHomeAndOpenDropdown();
  try { await page.getByRole('button', { name: /принять/i }).click({ timeout: 2000 }); } catch {}

  for (const { name, url } of CLINIC_ITEMS) {
    await page.locator('span').filter({ hasText: name }).first().click({ force: true });
    await page.waitForURL('**' + url + '**', { timeout: 15000 });
    expect(page.url()).toContain(url);
    await gotoHomeAndOpenDropdown();
  }

  // Калуга — последний филиал
  await page.locator('span').filter({ hasText: 'Калуга' }).first().click({ force: true });
  await page.waitForURL('**/vrachi/kaluga**', { timeout: 15000 });
  expect(page.url()).toContain('/vrachi/kaluga');

  // Нажимаем × — фильтр сбрасывается, переход на /vrachi (все клиники)
  await page.locator('.right > .nuxt-icon--fill.close > g > path').first().click();
  await page.waitForURL(/\/vrachi$/, { timeout: 15000 });
  expect(page.url()).toMatch(/\/vrachi$/);
});
