import { test, expect } from '@playwright/test';
import { checkEmailMessage } from './helpers/email.js';
import { BASE_URL } from './helpers/config.js';

const TEST_NAME = 'Тест Тестов';
const TEST_PHONE = '4444444444';      // для форм с автопрефиксом +7
const TEST_PHONE_FULL = '+74444444444'; // для форм без автопрефикса

async function acceptCookies(page) {
  const cookieBtn = page.getByRole('button', { name: /принять/i });
  try {
    await cookieBtn.waitFor({ state: 'visible', timeout: 5000 });
    await cookieBtn.click();
  } catch {}
}

// --- Форма 4: Записаться на приём — страница Врачи ---

test('Форма "Записаться на приём" (страница Врачи) — открывается', async ({ page }) => {
  await page.goto(BASE_URL + '/vrachi');
  await acceptCookies(page);
  await page.getByRole('button', { name: /записаться на приём/i }).first().click();
  const form = page.locator('.patient-help-form');
  await expect(form.getByPlaceholder('Ваше имя и фамилия')).toBeVisible();
});

test('Форма "Записаться на приём" (страница Врачи) — заполняется и отправляется', async ({ page }) => {
  await page.goto(BASE_URL + '/vrachi');
  await acceptCookies(page);
  await page.getByRole('button', { name: /записаться на приём/i }).first().click();

  // Все взаимодействия внутри секции .patient-help-form (общая форма /vrachi, без филиала)
  const form = page.locator('.patient-help-form');
  await form.getByPlaceholder('Ваше имя и фамилия').fill(TEST_NAME);
  await form.locator('input[type="tel"]').click();
  await page.keyboard.type(TEST_PHONE);

  const checkbox = form.locator('input[type="checkbox"]');
  if (!await checkbox.isChecked()) {
    await checkbox.check();
  }

  const emailSince = new Date();
  await form.getByRole('button', { name: /^записаться$/i }).click();

  await expect(
    page.getByText(/свяжемся|подбирать|спасибо|заявка принята|перезвоним|успешно/i).first()
  ).toBeVisible({ timeout: 10000 });

  await checkEmailMessage('eastclinic.ru/vrachi', emailSince, 120000);
});

// --- Форма 5: Давайте поможем — страница клиники ---

test('Форма "Давайте поможем" (страница клиники) — открывается', async ({ page }) => {
  await page.goto(BASE_URL + '/kontakty/ist-klinik-na-sokole');
  await acceptCookies(page);
  await page.getByText('Обратиться к специалисту').first().click();
  await expect(page.getByText('Давайте поможем').first()).toBeVisible();
});

test('Форма "Давайте поможем" (страница клиники) — заполняется и отправляется', async ({ page }) => {
  await page.goto(BASE_URL + '/kontakty/ist-klinik-na-sokole');
  await acceptCookies(page);
  await page.getByText('Обратиться к специалисту').first().click();

  await expect(page.getByText('Давайте поможем').first()).toBeVisible();

  const nameField = page.getByPlaceholder('Ваше имя и фамилия').first();
  await nameField.fill(TEST_NAME);
  await nameField.press('Tab');
  await page.keyboard.type(TEST_PHONE_FULL);

  const checkbox = page.locator('input[type="checkbox"]').last();
  if (!await checkbox.isChecked()) {
    await checkbox.check();
  }

  const emailSince = new Date();
  await page.getByRole('button', { name: /жду звонка/i }).last().click();

  await expect(
    page.getByText(/скоро позвоним|свяжемся|спасибо|заявка принята|перезвоним|ждите|успешно/i).first()
  ).toBeVisible({ timeout: 10000 });

  await checkEmailMessage('eastclinic.ru/kontakty/ist-klinik-na-sokole', emailSince, 120000);
});
