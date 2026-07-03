import { test, expect } from '@playwright/test';
import { checkEmailMessage } from './helpers/email.js';
import { BASE_URL } from './helpers/config.js';

const TEST_NAME = 'Тест Тестов';
const TEST_PHONE = '4444444444'; // +7 (444) 444-44-44

async function acceptCookies(page) {
  const cookieBtn = page.getByRole('button', { name: /принять/i });
  if (await cookieBtn.isVisible()) {
    await cookieBtn.click();
  }
}

// --- Форма 1: Записаться на приём (кнопка в шапке) ---

test('Форма "Записаться" — открывается', async ({ page }) => {
  await page.goto(BASE_URL + '/');
  await acceptCookies(page);
  await page.getByRole('button', { name: /записаться/i }).first().click();
  await expect(page.getByPlaceholder('Ваше имя и фамилия')).toBeVisible();
});

test('Форма "Записаться" — заполняется и отправляется', async ({ page }) => {
  await page.goto(BASE_URL + '/');
  await acceptCookies(page);
  await page.getByRole('button', { name: /записаться/i }).first().click();

  await page.getByPlaceholder('Ваше имя и фамилия').fill(TEST_NAME);
  await page.locator('input[type="tel"]').first().click();
  await page.keyboard.type(TEST_PHONE);

  await page.locator('.appointment-modal-submit').scrollIntoViewIfNeeded();
  const checkbox = page.locator('input[type="checkbox"]').first();
  if (!await checkbox.isChecked()) {
    await checkbox.check();
  }

  const emailSince = new Date();
  await page.locator('.appointment-modal-submit').click();

  await expect(
    page.getByText(/свяжемся|подбирать|спасибо|заявка принята|перезвоним|успешно/i)
  ).toBeVisible({ timeout: 10000 });

  await checkEmailMessage('eastclinic.ru/index', emailSince, 120000);
});

// --- Форма 2: Обратная связь (подвал) ---

test('Форма "Обратная связь" — открывается', async ({ page }) => {
  await page.goto(BASE_URL + '/');
  await acceptCookies(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByText('Обратная связь').first().click();
  await expect(page.getByPlaceholder(/расскажите/i)).toBeVisible();
});

test('Форма "Обратная связь" — заполняется и отправляется', async ({ page }) => {
  await page.goto(BASE_URL + '/');
  await acceptCookies(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByText('Обратная связь').first().click();

  await page.getByPlaceholder(/расскажите/i).fill('Тестовое сообщение - автоматическая проверка формы Обратная связь');
  await page.getByPlaceholder('Ваше имя и фамилия').fill(TEST_NAME);
  await page.locator('input[type="tel"]').click();
  await page.keyboard.type(TEST_PHONE);

  const checkbox = page.locator('input[type="checkbox"]').first();
  if (!await checkbox.isChecked()) {
    await checkbox.check();
  }

  const emailSince = new Date();
  await page.getByRole('button', { name: /отправить/i }).click();

  await expect(
    page.getByText(/спасибо|заявка принята|перезвоним|успешно/i)
  ).toBeVisible({ timeout: 10000 });

  await checkEmailMessage('eastclinic.ru/index', emailSince, 120000);
});

// --- Форма 3: Письмо директору (подвал) ---

test('Форма "Написать директору" — открывается', async ({ page }) => {
  await page.goto(BASE_URL + '/');
  await acceptCookies(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByText('Написать директору').first().click();
  await expect(page.getByText('Письмо директору')).toBeVisible();
});

test('Форма "Написать директору" — заполняется и отправляется', async ({ page }) => {
  await page.goto(BASE_URL + '/');
  await acceptCookies(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByText('Написать директору').first().click();

  await page.getByPlaceholder(/расскажите/i).fill('Тестовое сообщение - автоматическая проверка формы Письмо директору');
  await page.getByPlaceholder('Ваше имя и фамилия').fill(TEST_NAME);
  await page.locator('input[type="tel"]').click();
  await page.keyboard.type(TEST_PHONE);

  const checkbox = page.locator('input[type="checkbox"]').first();
  if (!await checkbox.isChecked()) {
    await checkbox.check();
  }

  const emailSince = new Date();
  await page.getByRole('button', { name: /отправить/i }).click();

  await expect(
    page.getByText(/спасибо|заявка принята|перезвоним|успешно/i)
  ).toBeVisible({ timeout: 10000 });

  await checkEmailMessage('eastclinic.ru/index', emailSince, 120000);
});
