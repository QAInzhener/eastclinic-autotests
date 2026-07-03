import { test, expect } from '@playwright/test';
import { checkEmailMessage } from './helpers/email.js';
import { BASE_URL } from './helpers/config.js';

const TEST_NAME = 'Тест Тестов';
const TEST_PHONE = '4444444444'; // +7 (444) 444-44-44

const MOBILE_VIEWPORT = { width: 390, height: 844 };

async function acceptCookies(page) {
  const cookieBtn = page.getByRole('button', { name: /принять/i });
  try {
    await cookieBtn.waitFor({ state: 'visible', timeout: 5000 });
    await cookieBtn.click();
  } catch {}
}

// Возвращает URL первого врача со страницы /vrachi
async function getFirstDoctorUrl(page) {
  await page.goto(BASE_URL + '/vrachi');
  await page.waitForLoadState('domcontentloaded');
  await acceptCookies(page);

  const href = await page.evaluate(() => {
    const link = [...document.querySelectorAll('a[href*="/vrach/"]')]
      .find(e => e.offsetParent !== null && /\/vrach\/[a-z]/.test(new URL(e.href).pathname));
    return link ? link.href : null;
  });

  if (!href) throw new Error('Не найдена ссылка на врача на странице /vrachi');
  return href;
}

// --- Мобильная форма: нижний закреп на странице врача ---

test('Мобильная форма "Записаться на приём" (нижний закреп) — открывается', async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);

  const doctorUrl = await getFirstDoctorUrl(page);
  await page.goto(doctorUrl);
  await page.waitForLoadState('domcontentloaded');

  // Нижний закреп "Записаться на приём"
  const bottomBtn = page.locator('button.banner-button').filter({ hasText: /записаться на приём/i });
  await bottomBtn.waitFor({ state: 'visible', timeout: 8000 });
  await bottomBtn.click({ force: true });

  // Проверяем открытие модалки
  await expect(page.locator('input[name="fio"]')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('input[name="phone"]')).toBeVisible();
});

test('Мобильная форма "Записаться на приём" (нижний закреп) — заполняется и отправляется', async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);

  const doctorUrl = await getFirstDoctorUrl(page);
  await page.goto(doctorUrl);
  await page.waitForLoadState('domcontentloaded');

  // Нажимаем нижний закреп "Записаться на приём"
  const bottomBtn = page.locator('button.banner-button').filter({ hasText: /записаться на приём/i });
  await bottomBtn.waitFor({ state: 'visible', timeout: 8000 });
  await bottomBtn.click({ force: true });

  // Заполняем форму
  await page.locator('input[name="fio"]').waitFor({ state: 'visible', timeout: 8000 });
  await page.locator('input[name="fio"]').fill(TEST_NAME);
  await page.locator('input[name="phone"]').click();
  await page.keyboard.type(TEST_PHONE);

  const checkbox = page.locator('input[name="agreeCheckbox"]');
  if (!await checkbox.isChecked()) {
    await checkbox.check();
  }

  // Ждём пока кнопка "Записаться" внутри модалки станет кликабельной
  const submitBtn = page.locator('button').filter({ hasText: /^записаться$/i });
  await submitBtn.waitFor({ state: 'visible', timeout: 8000 });

  const emailSince = new Date();
  await submitBtn.click();

  await expect(
    page.getByText(/забронировано|запись принята|записаны|ожидайте|ждем|ждём|свяжемся|спасибо|успешно/i).first()
  ).toBeVisible({ timeout: 10000 });

  // Письмо должно содержать URL страницы врача
  const urlPath = doctorUrl.replace(BASE_URL, '');
  await checkEmailMessage('eastclinic.ru' + urlPath, emailSince, 120000);
});
