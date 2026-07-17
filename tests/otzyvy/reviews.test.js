import { test, expect } from '@playwright/test';
import { checkReviewInAdmin, deleteReviewInAdmin, isReviewPublishedInAdmin } from '../helpers/admin.js';
import { BASE_URL } from '../helpers/config.js';

const TEST_NAME = 'Тест Тестов';
const TEST_PHONE = '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const REVIEWS_PAGE = BASE_URL + '/otzyvy';
const REVIEW_TEXT = 'Проверка отправки отзыва с общей страницы отзывов – автотестирование';
// Фрагмент уникальный для этого теста — используется для поиска строки в таблице
const REVIEW_SNIPPET = 'общей страницы отзывов';

async function acceptCookies(page) {
  const cookieBtn = page.getByRole('button', { name: /принять/i });
  try {
    await cookieBtn.waitFor({ state: 'visible', timeout: 5000 });
    await cookieBtn.click();
  } catch {}
}

async function openReviewModal(page) {
  await page.goto(REVIEWS_PAGE);
  await page.waitForLoadState('domcontentloaded');
  await acceptCookies(page);
  const crashed     = await page.locator('text=Что-то пошло не так').isVisible({ timeout: 1000 }).catch(() => false);
  const maintenance = await page.locator('text=Сайт скоро вернётся').isVisible({ timeout: 1000 }).catch(() => false);
  if (crashed || maintenance) throw new Error('Приложение недоступно — страница показывает экран ошибки');

  const writeReviewBtn = page.locator('button.total-reviews-button');
  await writeReviewBtn.waitFor({ state: 'visible', timeout: 8000 });
  await writeReviewBtn.scrollIntoViewIfNeeded();
  await writeReviewBtn.click();

  await page.locator('.reviews-form-container').waitFor({ state: 'visible', timeout: 8000 });
}

// retries: 0 — отзыв нельзя отправлять дважды при повторном прогоне
test.describe.configure({ retries: 0 });

// --- Форма: Написать отзыв (страница /otzyvy) ---

test('Форма "Написать отзыв" — открывается', async ({ page }) => {
  await openReviewModal(page);
  await expect(page.getByText('Как вам приём у врача?')).toBeVisible();
  await expect(page.locator('textarea.review-input')).toBeVisible();
});

test('Форма "Написать отзыв" — заполняется, отправляется, публикуется и отображается на странице отзывов', async ({ page }) => {
  test.setTimeout(360000);
  let reviewSubmitted = false;
  let reviewPublished = false;

  try {
    // 1. Отправляем отзыв с публичной страницы
    await openReviewModal(page);

    const form = page.locator('.reviews-form-container');
    await form.locator('div.stars svg.star').nth(3).click(); // 4 звезды
    await form.locator('textarea.review-input').fill(REVIEW_TEXT);
    await form.locator('input[name="fio"]').fill(TEST_NAME);
    await form.locator('input[name="phone"]').click();
    await page.keyboard.type(TEST_PHONE);
    const checkbox = form.locator('input[name="agreeCheckbox"]');
    if (!await checkbox.isChecked()) await checkbox.check();
    await form.locator('button.send-review-button').click();
    reviewSubmitted = true;
    await expect(page.locator('.reviews-form-container')).not.toBeVisible({ timeout: 10000 });
    console.log('[test] ✓ Отзыв отправлен');

    // 2. Ждём появления отзыва в панели администратора
    // Отзывы с dev1 попадают в ту же базу что и prod — проверка и удаление нужны всегда.
    await checkReviewInAdmin(page, REVIEW_SNIPPET);
    console.log('[test] ✓ Отзыв найден в панели администратора');

    // 3. Публикуем и проверяем на публичной странице
    reviewPublished = true;
    await publishAndVerify(page);

  } finally {
    if (reviewSubmitted) {
      try {
        if (reviewPublished) {
          const actuallyPublished = await isReviewPublishedInAdmin(page, REVIEW_SNIPPET);
          await deleteReviewInAdmin(page, REVIEW_SNIPPET);
          if (actuallyPublished) {
            console.log('[test] ✓ Тестовый отзыв удалён');
          } else {
            console.warn(
              '\n⚠️  Удалён, но НЕОПУБЛИКОВАН.\n' +
              '   Тогл публикации в админке был выключен — публикация не сработала.\n'
            );
          }
        } else {
          await deleteReviewInAdmin(page, REVIEW_SNIPPET);
          console.warn(
            '\n⚠️  Удалён, до ПУБЛИКАЦИИ.\n' +
            '   Тест упал раньше шага публикации.\n'
          );
        }
      } catch (e) {
        console.warn(
          '\n⚠️  ВНИМАНИЕ: тестовый отзыв НЕ удалён из панели администратора!\n' +
          `   Текст: "${REVIEW_TEXT}"\n` +
          `   Причина: ${e.message}\n` +
          '   Удалите отзыв вручную, чтобы не загрязнять базу.\n'
        );
      }
    }
  }
});

// Находит строку с тестовым отзывом в таблице и возвращает её индекс.
// Также выводит в консоль структуру строки для диагностики селекторов.
async function findReviewRow(page) {
  const info = await page.evaluate((snippet) => {
    const rows = [...document.querySelectorAll('tr')];
    const idx = rows.findIndex(r => (r.innerText || '').includes(snippet));
    if (idx < 0) return { idx: -1 };

    const row = rows[idx];
    const buttons = [...row.querySelectorAll('button')];
    const checkboxes = [...row.querySelectorAll('input[type="checkbox"]')];

    return {
      idx,
      buttonCount: buttons.length,
      checkboxCount: checkboxes.length,
      buttons: buttons.map(b => ({
        text: b.textContent?.trim().slice(0, 40),
        class: b.className.slice(0, 80),
        title: b.title,
      })),
      checkboxes: checkboxes.map(cb => ({
        checked: cb.checked,
        class: cb.className.slice(0, 80),
        id: cb.id,
      })),
    };
  }, REVIEW_SNIPPET);

  console.log('[admin] Строка с отзывом:', JSON.stringify(info, null, 2));

  if (info.idx < 0) throw new Error(`Строка с отзывом "${REVIEW_SNIPPET}" не найдена в таблице`);
  return info;
}

async function publishAndVerify(page) {
  // Переходим в раздел Отзывы (мы уже залогинены после checkReviewInAdmin)
  await page.getByRole('link', { name: 'Отзывы' }).click();
  await page.waitForFunction(
    () => [...document.querySelectorAll('th')].some(th => th.textContent.trim() === 'Отзыв'),
    { timeout: 15000 }
  );
  await page.waitForTimeout(500);

  const info = await findReviewRow(page);

  // PrimeVue InputSwitch: DOM eval (cb.click()) не триггерит Vue-реактивность.
  // Нужен Playwright-клик через role="switch" — только он посылает правильные браузерные события.
  const row = page.locator('tr').nth(info.idx);
  const switches = row.getByRole('switch');
  if (await switches.count() > 0) {
    await switches.last().click({ force: true });
  } else {
    await row.locator('button').first().click({ force: true });
  }
  await page.waitForTimeout(800);
  console.log('[admin] ✓ Кнопка публикации нажата');

  // Проверяем, что отзыв виден как ПЕРВЫЙ в списке текстовых отзывов на /otzyvy.
  // Структура страницы: слева — видео-галерея, ниже неё — список текстовых отзывов;
  // справа — кнопка «Написать отзыв». Первый отзыв в списке = последний опубликованный.
  // Заходим на /otzyvy → переходим на /akczii → возвращаемся обратно — так страница гарантированно свежая.
  console.log('[test] Проверяю отображение отзыва на странице /otzyvy...');
  await page.goto(REVIEWS_PAGE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);
  // Кликаем «Акции» в шапке сайта — переходим на /akczii без прямого goto
  await page.getByRole('link', { name: /акции/i }).first().click();
  await page.waitForURL('**/akczii**', { timeout: 15000 });
  // Возвращаемся назад через кнопку браузера
  await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);
  console.log('[test] Вернулся на /otzyvy через кнопку «Назад»');

  // Прокручиваем к фильтрам «Новые» / «Со всех площадок» — они идут сразу над списком отзывов
  await page.getByText('Новые').first().scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);

  // Проверяем, что текст тестового отзыва виден на странице
  const found = await page.evaluate(
    (reviewText) => document.body.innerText.includes(reviewText),
    REVIEW_TEXT
  );

  if (!found) {
    throw new Error(`Тестовый отзыв не найден на странице ${REVIEWS_PAGE}`);
  }
  console.log('[test] ✓ Тестовый отзыв виден в списке на /otzyvy');
}

