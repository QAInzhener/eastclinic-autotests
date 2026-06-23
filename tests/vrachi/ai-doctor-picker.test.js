import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { checkEmailMessage } from '../helpers/email.js';
import { BASE_URL } from '../helpers/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Читаем запросы из файла и выбираем два случайных разных для этого запуска
function loadQueries() {
  const content = readFileSync(join(__dirname, '../../gdoc_content.txt'), 'utf8');
  return content.split('\n')
    .map(l => l.trim())
    .filter(l => /^\d+\.\s+.+Тест\s*$/.test(l))
    .map(l => l.replace(/^\d+\.\s+/, ''));
}

function pickTwo(queries) {
  const i1 = Math.floor(Math.random() * queries.length);
  let i2;
  do { i2 = Math.floor(Math.random() * queries.length); } while (i2 === i1);
  return [queries[i1], queries[i2]];
}

const ALL_QUERIES = loadQueries();
const [AI_QUERY_1, AI_QUERY_2] = pickTwo(ALL_QUERIES);

const TEST_NAME  = 'Тест Тестов';
const TEST_PHONE = '4444444444';
const VRACHI_URL = BASE_URL + '/vrachi';
const SUCCESS_RE = /запись принята|записаны|спасибо|успешно|подтвердили|ждём|ждем|свяжемся|ожидайте/i;

async function acceptCookies(page) {
  try { await page.getByRole('button', { name: /принять/i }).click({ timeout: 5000 }); } catch {}
}

test('ИИ подборщик врача — два запроса, запись к 9-му врачу, письмо с историей чата', async ({ page }) => {
  // Тест медленный из-за AI (≥15с ответ) и проверки почты — расширяем таймаут
  test.setTimeout(300000);

  console.log('Запрос 1:', AI_QUERY_1);
  console.log('Запрос 2:', AI_QUERY_2);

  const emailSince = new Date();

  // 1. Страница /vrachi — принимаем куки
  await page.goto(VRACHI_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  await acceptCookies(page);

  // 2. Первый запрос в ИИ подборщик
  const aiField = page.locator('textarea.ai-search__input');
  await aiField.scrollIntoViewIfNeeded();
  await aiField.fill(AI_QUERY_1);
  await page.locator('button.ai-search__submit').click();

  // Ждём ответа ИИ: .ai-search__answer появляется с текстом (≥15с)
  await page.waitForFunction(
    () => {
      const el = document.querySelector('.ai-search__answer');
      return el && el.textContent.trim().length > 50;
    },
    { timeout: 60000 }
  );

  // 3. Второй запрос — фиксируем текущий ответ, чтобы отследить смену
  const answerAfterQ1 = await page.locator('.ai-search__answer').textContent();
  await aiField.fill(AI_QUERY_2);
  await page.locator('button.ai-search__submit').click();

  // Ждём нового ответа (текст изменился и непустой)
  await page.waitForFunction(
    (prev) => {
      const el = document.querySelector('.ai-search__answer');
      if (!el || el.textContent.trim().length < 50) return false;
      return el.textContent.trim() !== prev.trim();
    },
    answerAfterQ1,
    { timeout: 60000 }
  );

  // 4. Перезагружаем страницу (история чата должна сохраниться в сессии)
  await page.goto(VRACHI_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  // 5. Находим 9-го врача по счёту и кликаем первый доступный слот
  await page.waitForSelector('.doctor-item-container', { timeout: 20000 });
  await page.waitForSelector('.calendar-slot', { state: 'visible', timeout: 20000 }).catch(() => {});

  const ninth = page.locator('.doctor-item-container').nth(8);
  await ninth.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);

  const firstSlot = ninth.locator('.calendar-slot').first();
  const slotVisible = await firstSlot.isVisible().catch(() => false);
  test.skip(!slotVisible, 'Нет доступных слотов у 9-го врача — пропускаем');

  await firstSlot.click();

  // 6. Заполняем форму записи в модале
  await page.getByPlaceholder('Ваше имя и фамилия').first().waitFor({ state: 'visible', timeout: 10000 });
  await page.getByPlaceholder('Ваше имя и фамилия').first().fill(TEST_NAME);
  await page.locator('input[name="phone"]').first().click();
  await page.keyboard.type(TEST_PHONE);

  const checkbox = page.locator('input[name="agreeCheckbox"]').first();
  if (!await checkbox.isChecked()) await checkbox.check();

  // 7. Отправляем и ждём подтверждения
  await page.getByRole('button', { name: /^записаться$/i }).first().click();
  await expect(page.getByText(SUCCESS_RE).first()).toBeVisible({ timeout: 15000 });

  // 8. Проверяем почту: письмо должно содержать оба запроса (блок История чата)
  await checkEmailMessage(AI_QUERY_1, emailSince, 120000);
  await checkEmailMessage(AI_QUERY_2, emailSince, 30000);
});
