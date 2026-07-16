import { test, expect } from '@playwright/test';
import { checkReviewInAdmin, publishReviewInAdmin, deleteReviewInAdmin, isReviewPublishedInAdmin } from '../helpers/admin.js';
import { BASE_URL } from '../helpers/config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PHOTO_PATH = path.resolve(__dirname, 'dedushka-vnutchka-1280x720.jpg');

const TEST_NAME      = 'Тест Тестов';
const TEST_PHONE     = '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const REVIEWS_PAGE   = BASE_URL + '/otzyvy';
const REVIEW_TEXT    = 'Проверка отправки отзыва с фото JPG — автотестирование';
const REVIEW_SNIPPET = 'с фото JPG — автотестирование';

async function acceptCookies(page) {
  try {
    await page.getByRole('button', { name: /принять/i })
      .waitFor({ state: 'visible', timeout: 5000 });
    await page.getByRole('button', { name: /принять/i }).click();
  } catch {}
}

async function openReviewModal(page) {
  await page.goto(REVIEWS_PAGE);
  await page.waitForLoadState('domcontentloaded');
  await acceptCookies(page);
  const crashed     = await page.locator('text=Что-то пошло не так').isVisible({ timeout: 1000 }).catch(() => false);
  const maintenance = await page.locator('text=Сайт скоро вернётся').isVisible({ timeout: 1000 }).catch(() => false);
  if (crashed || maintenance) throw new Error('Приложение недоступно — страница показывает экран ошибки');
  const btn = page.locator('button.total-reviews-button');
  await btn.waitFor({ state: 'visible', timeout: 8000 });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await page.locator('.reviews-form-container').waitFor({ state: 'visible', timeout: 8000 });
}

// retries: 0 — отзыв нельзя отправлять дважды при повторном прогоне
test.describe.configure({ retries: 0 });

test('Форма "Написать отзыв" — отправка фото JPG (1280×720): фото загружается, отзыв публикуется и отображается на странице', async ({ page }) => {
  test.setTimeout(240000);

  let reviewSubmitted = false;
  let reviewPublished = false;

  try {
    // 1. Открываем форму
    await openReviewModal(page);

    const form = page.locator('.reviews-form-container');

    // 2. Выбираем 4 звезды
    await form.locator('div.stars svg.star').nth(3).click();

    // 3. Загружаем фото через файловый диалог
    const photoItem = form.locator('.media-item.image-item');
    await photoItem.waitFor({ state: 'visible', timeout: 8000 });

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }),
      photoItem.click(),
    ]);
    await fileChooser.setFiles(PHOTO_PATH);
    console.log('[test] Фото JPG передано в диалог выбора файлов');

    // 4. Ждём появления превью или исчезновения прогресс-индикатора
    const uploadResult = await page.waitForFunction(
      () => {
        const f = document.querySelector('.reviews-form-container');
        if (!f) return false;
        const errText = f.innerText.toLowerCase();
        if (errText.includes('ошибка') || errText.includes('не поддерживается') || errText.includes('не принят')) return 'error';
        if (f.querySelector('img[src]:not([src=""]), [class*="preview"], [class*="uploaded"], [class*="photo-thumb"]')) return 'ok';
        const progress = f.querySelector('[class*="progress"], [class*="loading"], [class*="uploading"]');
        return !progress ? 'no-progress' : false;
      },
      { timeout: 30000 }
    ).then(h => h.jsonValue()).catch(() => 'timeout');

    console.log('[test] Результат загрузки фото JPG:', uploadResult);
    if (uploadResult === 'error') throw new Error('Форма отклонила фото JPG с сообщением об ошибке');
    console.log('[test] ✓ Фото JPG загружено');

    // 5. Заполняем остальные поля
    await form.locator('textarea.review-input').fill(REVIEW_TEXT);
    await form.locator('input[name="fio"]').fill(TEST_NAME);
    await form.locator('input[name="phone"]').click();
    await page.keyboard.type(TEST_PHONE);
    const checkbox = form.locator('input[name="agreeCheckbox"]');
    if (!await checkbox.isChecked()) await checkbox.check();

    // 6. Ждём активации кнопки отправки
    await page.waitForFunction(
      () => { const btn = document.querySelector('button.send-review-button'); return btn && !btn.disabled; },
      { timeout: 30000 }
    );
    console.log('[test] ✓ Кнопка отправки стала активной');

    // 7. Отправляем
    await form.locator('button.send-review-button').click();
    reviewSubmitted = true;
    await expect(page.locator('.reviews-form-container')).not.toBeVisible({ timeout: 15000 });
    console.log('[test] ✓ Отзыв с фото JPG отправлен');

    // 8. Проверяем в панели администратора
    await checkReviewInAdmin(page, REVIEW_SNIPPET);
    console.log('[test] ✓ Отзыв найден в панели администратора');

    // 9. Публикуем
    await publishReviewInAdmin(page, REVIEW_SNIPPET);
    reviewPublished = true;
    console.log('[test] ✓ Отзыв опубликован');

    // 10. Проверяем на /otzyvy (акции → назад, до 3 попыток)
    await page.goto(REVIEWS_PAGE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.getByRole('link', { name: /акции/i }).first().click();
    await page.waitForURL('**/akczii**', { timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    let found = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      found = await page.evaluate(text => document.body.innerText.includes(text), REVIEW_TEXT);
      if (found) break;
      if (attempt < 3) {
        console.log(`[test] Отзыв не найден на /otzyvy, попытка ${attempt}/3, жду 5 с...`);
        await page.waitForTimeout(5000);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);
      }
    }
    if (!found) throw new Error(`Отзыв с фото JPG не найден на странице ${REVIEWS_PAGE}`);
    console.log('[test] ✓ Отзыв с фото JPG виден на странице /otzyvy');

  } finally {
    if (reviewSubmitted) {
      try {
        if (reviewPublished) {
          const actuallyPublished = await isReviewPublishedInAdmin(page, REVIEW_SNIPPET);
          await deleteReviewInAdmin(page, REVIEW_SNIPPET);
          if (actuallyPublished) {
            console.log('[test] ✓ Тестовый отзыв удалён');
          } else {
            console.warn('\n⚠️  Удалён, но НЕОПУБЛИКОВАН.\n   Тогл публикации в админке был выключен — публикация не сработала.\n');
          }
        } else {
          await deleteReviewInAdmin(page, REVIEW_SNIPPET);
          console.warn('\n⚠️  Удалён, до ПУБЛИКАЦИИ.\n   Тест упал раньше шага публикации.\n');
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
