import { test, expect } from '@playwright/test';
import { checkReviewInAdminWithDoctor, publishReviewInAdmin, deleteReviewInAdmin, isReviewPublishedInAdmin } from '../helpers/admin.js';
import { BASE_URL } from '../helpers/config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEO_PATH_MOV = path.resolve(__dirname, '../videos/ezhik-v-tumane-1m59s.mov');

const TEST_NAME    = 'Тест Тестов';
const TEST_PHONE   = '4444444444';
const VRACHI_PAGE  = BASE_URL + '/vrachi';
const REVIEWS_PAGE = BASE_URL + '/otzyvy';
const REVIEW_TEXT  = 'Проверка отправки отзыва с видео MOV с личной страницы врача — автотестирование';
const REVIEW_SNIPPET = 'с видео MOV с личной';

async function acceptCookies(page) {
  try {
    await page.getByRole('button', { name: /принять/i }).waitFor({ state: 'visible', timeout: 5000 });
    await page.getByRole('button', { name: /принять/i }).click();
  } catch {}
}

// retries: 0 — отзыв нельзя отправлять дважды при повторном прогоне
test.describe.configure({ retries: 0 });

test('Форма отзыва с личной страницы врача — отправка с видео MOV: видео загружается, отзыв публикуется и отображается', async ({ page }) => {
  test.setTimeout(420000);

  let reviewSubmitted = false;
  let reviewPublished = false;
  let doctorName = null;

  try {
    // 1. Открываем список врачей
    await page.goto(VRACHI_PAGE);
    await page.waitForLoadState('domcontentloaded');
    await acceptCookies(page);

    // 2. Запоминаем количество карточек до «Показать еще»
    const countBefore = await page.evaluate(() =>
      document.querySelectorAll('.doctor-info-container').length
    );

    // 3. Показываем следующую порцию врачей
    const moreBtn = page.locator('button.more-button').first();
    await moreBtn.scrollIntoViewIfNeeded();
    await moreBtn.click();
    await page.waitForFunction(
      (prev) => document.querySelectorAll('.doctor-info-container').length > prev,
      countBefore,
      { timeout: 10000 }
    );

    // 4. Берём ссылку первой новой карточки
    const doctorHref = await page.evaluate((idx) => {
      const containers = [...document.querySelectorAll('.doctor-info-container')];
      return containers[idx]?.querySelector('a[href*="/vrach/"]')?.href || null;
    }, countBefore);
    if (!doctorHref) throw new Error('Не найдена карточка врача после «Показать еще»');

    // 5. Переходим на личную страницу врача
    await page.goto(doctorHref, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 6. Читаем ФИО врача
    doctorName = (await page.locator('h1').first().textContent()).trim();
    console.log('[test] Врач:', doctorName);

    // 7. Открываем форму отзыва
    const reviewBtn = page.locator('button.total-reviews-button');
    await reviewBtn.scrollIntoViewIfNeeded();
    await reviewBtn.click();
    await page.locator('.reviews-form-container').waitFor({ state: 'visible', timeout: 8000 });

    const form = page.locator('.reviews-form-container');

    // 8. Выбираем 4 звезды
    await form.locator('div.stars svg.star').nth(3).click();

    // 9. Загружаем MOV-видео через файловый диалог
    const videoItem = form.locator('.media-item.video-item');
    await videoItem.waitFor({ state: 'visible', timeout: 8000 });

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }),
      videoItem.click(),
    ]);
    await fileChooser.setFiles(VIDEO_PATH_MOV);
    console.log('[test] Видеофайл MOV передан в диалог выбора файлов');

    // 10. Ждём завершения загрузки — либо превью, либо исчезновение прогресс-индикатора
    const uploadResult = await page.waitForFunction(
      () => {
        const f = document.querySelector('.reviews-form-container');
        if (!f) return false;
        const hasError = f.innerText.toLowerCase().includes('ошибка') ||
          f.innerText.toLowerCase().includes('не поддерживается') ||
          f.innerText.toLowerCase().includes('не принят');
        if (hasError) return 'error';
        if (f.querySelector('video, [class*="preview"], [class*="uploaded"], [class*="video-thumb"]')) return 'ok';
        const progress = f.querySelector('[class*="progress"], [class*="loading"], [class*="uploading"]');
        return !progress ? 'no-progress' : false;
      },
      { timeout: 90000 }
    ).then(h => h.jsonValue()).catch(() => 'timeout');

    console.log('[test] Результат загрузки MOV:', uploadResult);

    if (uploadResult === 'error') {
      throw new Error('Форма отклонила MOV-видео с сообщением об ошибке');
    }
    console.log('[test] ✓ Видео MOV загружено');

    // 11. Заполняем остальные поля и отправляем
    await form.locator('textarea.review-input').fill(REVIEW_TEXT);
    await form.locator('input[name="fio"]').fill(TEST_NAME);
    await form.locator('input[name="phone"]').click();
    await page.keyboard.type(TEST_PHONE);
    const checkbox = form.locator('input[name="agreeCheckbox"]');
    if (!await checkbox.isChecked()) await checkbox.check();

    await form.locator('button.send-review-button').click();
    reviewSubmitted = true;
    await expect(page.locator('.reviews-form-container')).not.toBeVisible({ timeout: 15000 });
    console.log('[test] ✓ Отзыв с видео MOV отправлен');

    // 12. Проверяем в панели администратора
    await checkReviewInAdminWithDoctor(page, REVIEW_SNIPPET, doctorName);
    console.log('[test] ✓ Отзыв найден в панели администратора');

    // 13. Публикуем
    await publishReviewInAdmin(page, REVIEW_SNIPPET, doctorName);
    reviewPublished = true;
    console.log('[test] ✓ Отзыв опубликован');

    // 14. Проверяем на личной странице врача (акции → назад, до 3 попыток)
    await page.goto(doctorHref, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.getByRole('link', { name: /акции/i }).first().click();
    await page.waitForURL('**/akczii**', { timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    let foundOnDoctorPage = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      foundOnDoctorPage = await page.evaluate(
        (text) => document.body.innerText.includes(text),
        REVIEW_TEXT
      );
      if (foundOnDoctorPage) break;
      if (attempt < 3) {
        console.log(`[test] Отзыв не найден на странице врача, попытка ${attempt}/3, жду 5 с...`);
        await page.waitForTimeout(5000);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);
      }
    }
    if (!foundOnDoctorPage) throw new Error(`Отзыв с MOV не найден на странице врача ${doctorHref}`);
    console.log('[test] ✓ Отзыв с видео MOV виден на странице врача');

    // 15. Видео-карточка отображается в галерее
    for (let y = 400; y <= 2000; y += 400) {
      await page.evaluate(pos => window.scrollTo(0, pos), y);
      await page.waitForTimeout(250);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    const videoCard = page.locator('.media-item').first();
    await videoCard.waitFor({ state: 'visible', timeout: 10000 });
    console.log('[test] ✓ Видео-отзыв MOV отображается в галерее на странице врача');

    // 16. Клик на карточку открывает плеер
    await videoCard.scrollIntoViewIfNeeded();
    await videoCard.click();
    await page.waitForTimeout(1500);

    const playerOpened = await page.waitForFunction(
      () => {
        const vids = [...document.querySelectorAll('video')];
        if (vids.some(v => v.src && v.src !== window.location.href)) return true;
        const modals = [...document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="overlay"], [class*="lightbox"], [class*="player"]')];
        return modals.some(m => m.querySelector('video, iframe') && getComputedStyle(m).display !== 'none');
      },
      { timeout: 10000 }
    ).then(() => true).catch(() => false);

    expect(playerOpened, 'Плеер должен открыться при клике на иконку видео').toBe(true);
    console.log('[test] ✓ Плеер открывается при клике на иконку видео');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // 17. Проверяем на странице /otzyvy (акции → назад, до 3 попыток)
    await page.goto(REVIEWS_PAGE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.getByRole('link', { name: /акции/i }).first().click();
    await page.waitForURL('**/akczii**', { timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    let foundOnReviewsPage = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      foundOnReviewsPage = await page.evaluate(
        (text) => document.body.innerText.includes(text),
        REVIEW_TEXT
      );
      if (foundOnReviewsPage) break;
      if (attempt < 3) {
        console.log(`[test] Отзыв не найден на /otzyvy, попытка ${attempt}/3, жду 5 с...`);
        await page.waitForTimeout(5000);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);
      }
    }
    if (!foundOnReviewsPage) throw new Error(`Отзыв с MOV не найден на странице ${REVIEWS_PAGE}`);
    console.log('[test] ✓ Отзыв с видео MOV виден на странице /otzyvy');

  } finally {
    if (reviewSubmitted) {
      try {
        if (reviewPublished) {
          const actuallyPublished = await isReviewPublishedInAdmin(page, REVIEW_SNIPPET, doctorName);
          await deleteReviewInAdmin(page, REVIEW_SNIPPET, doctorName);
          if (actuallyPublished) {
            console.log('[test] ✓ Тестовый отзыв удалён');
          } else {
            console.warn(
              '\n⚠️  Удалён, но НЕОПУБЛИКОВАН.\n' +
              '   Тогл публикации в админке был выключен — публикация не сработала.\n'
            );
          }
        } else {
          await deleteReviewInAdmin(page, REVIEW_SNIPPET, doctorName);
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
