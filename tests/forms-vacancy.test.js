import { test, expect } from '@playwright/test';
import { checkEmailMessage } from './helpers/email.js';
import { BASE_URL } from './helpers/config.js';

const TEST_NAME = 'Тест Тестов';
const TEST_PHONE = '4444444444'; // +7 (444) 444-44-44
const TEST_SPECIALTY = 'Тестирование';

const VACANCIES_PAGE = BASE_URL + '/vakansii';

async function acceptCookies(page) {
  const cookieBtn = page.getByRole('button', { name: /принять/i });
  try {
    await cookieBtn.waitFor({ state: 'visible', timeout: 5000 });
    await cookieBtn.click();
  } catch {}
}

// Переходит на страницу первой вакансии через кнопку "Откликнуться" на /vakansii,
// затем на странице вакансии кликает "Откликнуться" (прокрутка к форме).
// Возвращает URL страницы вакансии.
async function navigateToVacancyForm(page) {
  await page.goto(VACANCIES_PAGE);
  await acceptCookies(page);

  // Первая кнопка "Откликнуться" — ссылка на конкретную вакансию
  const applyLink = page.locator('a.vacancy-button').first();
  await applyLink.waitFor({ state: 'visible', timeout: 8000 });
  await applyLink.click();

  // SPA-навигация на страницу вакансии
  await page.waitForURL(/vakansii\/.+/, { timeout: 15000 });
  const vacancyUrl = page.url();

  // На странице вакансии нажимаем "Откликнуться" → прокрутка к форме
  const applyBtn = page.locator('button.vacancy-button').filter({ hasText: /откликнуться/i }).first();
  await applyBtn.waitFor({ state: 'visible', timeout: 8000 });
  await applyBtn.click();
  await page.waitForTimeout(1000);

  return vacancyUrl;
}

// Скроллит к форме "Не нашли подходящую вакансию?" через кнопку "Хочу на экскурсию"
async function scrollToNoVacancyForm(page) {
  await page.goto(VACANCIES_PAGE);
  await acceptCookies(page);

  const excursionBtn = page.locator('button.excursion-button');
  await excursionBtn.waitFor({ state: 'visible', timeout: 8000 });
  await excursionBtn.scrollIntoViewIfNeeded();
  await excursionBtn.click();
  await page.waitForTimeout(1000);
}

// --- Форма: Откликнуться на вакансию ---

test('Форма "Откликнуться на вакансию" — форма отображается', async ({ page }) => {
  await navigateToVacancyForm(page);

  await expect(page.getByPlaceholder('Ваше имя и фамилия')).toBeVisible({ timeout: 8000 });
  await expect(page.getByPlaceholder('Специальность')).toBeVisible();
  await expect(page.locator('input[name="phone"]')).toBeVisible();
});

test('Форма "Откликнуться на вакансию" — заполняется и отправляется', async ({ page }) => {
  const vacancyUrl = await navigateToVacancyForm(page);

  // Заполняем поля формы
  await page.getByPlaceholder('Ваше имя и фамилия').fill(TEST_NAME);
  await page.getByPlaceholder('Специальность').fill(TEST_SPECIALTY);
  await page.locator('input[name="phone"]').click();
  await page.keyboard.type(TEST_PHONE);

  // Чекбокс согласия
  const checkbox = page.locator('input[name="agreeCheckbox"]');
  if (!await checkbox.isChecked()) {
    await checkbox.check();
  }

  const emailSince = new Date();
  await page.getByRole('button', { name: /отправить/i }).click();

  // Проверяем сообщение об успешной отправке
  await expect(
    page.getByText(/спасибо|заявка принята|перезвоним|успешно|отправлено|ваша заявка/i)
  ).toBeVisible({ timeout: 10000 });

  // Проверяем, что письмо пришло на почту
  const urlPath = vacancyUrl.replace(BASE_URL, '');
  await checkEmailMessage('eastclinic.ru' + urlPath, emailSince, 120000);
});

// --- Форма: Не нашли подходящую вакансию ---

test('Форма "Не нашли подходящую вакансию" — форма отображается', async ({ page }) => {
  await scrollToNoVacancyForm(page);

  const form = page.locator('.patient-help-form-with-title');
  await expect(form.getByPlaceholder('Ваше имя и фамилия')).toBeVisible({ timeout: 8000 });
  await expect(form.getByPlaceholder('Специальность')).toBeVisible();
  await expect(form.locator('input[name="phone"]')).toBeVisible();
});

test('Форма "Не нашли подходящую вакансию" — заполняется и отправляется', async ({ page }) => {
  await scrollToNoVacancyForm(page);

  const form = page.locator('.patient-help-form-with-title');

  await form.getByPlaceholder('Ваше имя и фамилия').fill(TEST_NAME);
  await form.getByPlaceholder('Специальность').fill(TEST_SPECIALTY);
  await form.locator('input[name="phone"]').click();
  await page.keyboard.type(TEST_PHONE);

  const checkbox = form.locator('input[name="agreeCheckbox"]');
  if (!await checkbox.isChecked()) {
    await checkbox.check();
  }

  const emailSince = new Date();
  await form.getByRole('button', { name: /отправить/i }).click();

  await expect(
    page.getByText(/спасибо|заявка принята|перезвоним|успешно|отправлено|ваша заявка/i)
  ).toBeVisible({ timeout: 10000 });

  await checkEmailMessage('eastclinic.ru/vakansii', emailSince, 120000);
});
