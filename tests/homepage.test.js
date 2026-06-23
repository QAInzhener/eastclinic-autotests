import { test, expect } from '@playwright/test';
import { BASE_URL } from './helpers/config.js';

test('Главная страница открывается', async ({ page }) => {
  await page.goto(BASE_URL + '/');
  await expect(page).toHaveTitle(/eastclinic|ист клиник|клиник/i);
});

test('Кнопка записи на приём присутствует на главной', async ({ page }) => {
  await page.goto(BASE_URL + '/');
  const appointmentButton = page.getByRole('button', { name: /записаться/i }).first();
  await expect(appointmentButton).toBeVisible();
});

test('Логотип клиники отображается', async ({ page }) => {
  await page.goto(BASE_URL + '/');
  const logo = page.locator('header a:not(.mobile-bar-logo)[href="/"]').first();
  await expect(logo).toBeVisible();
});

const ICON_NAV = [
  { text: 'Услуги',  url: '/catalog' },
  { text: 'Врачи',   url: '/vrachi' },
  { text: 'Клиники', url: '/kontakty' },
  { text: 'Акции',   url: '/akczii' },
  { text: 'Отзывы',  url: '/otzyvy' },
];

test('Главная: кнопки-иконки под поиском — Услуги / Врачи / Клиники / Акции / Отзывы открывают нужные страницы, Контакты открывает модальное окно', async ({ page }) => {
  test.setTimeout(180000);

  async function gotoHome() {
    await page.goto(BASE_URL + '/', { waitUntil: 'load' });
    await page.locator('.main-page-navigation').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(500);
  }

  await gotoHome();
  try { await page.getByRole('button', { name: /принять/i }).click({ timeout: 3000 }); } catch {}

  for (const { text, url } of ICON_NAV) {
    await page.locator('.main-page-navigation .nav-item').filter({ hasText: text }).first().click();
    await page.waitForURL('**' + url + '**', { timeout: 15000 });
    expect(page.url()).toContain(url);
    await gotoHome();
  }

  // Контакты → модальное окно (на странице два div.modal — второй с контентом)
  await page.locator('.main-page-navigation .nav-item').filter({ hasText: 'Контакты' }).first().click();
  await expect(page.locator('div.modal').filter({ hasText: 'Контакты' })).toBeVisible({ timeout: 5000 });
});

