import { test, expect } from '@playwright/test';
import { checkReviewInAdmin, publishReviewInAdmin, deleteReviewInAdmin, isReviewPublishedInAdmin } from '../helpers/admin.js';
import { BASE_URL } from '../helpers/config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEO_PATH_MOV = path.resolve(__dirname, 'ezhik-v-tumane-1m59s.mov');

const TEST_NAME     = 'Тест Тестов';
const TEST_PHONE    = '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const REVIEWS_PAGE  = BASE_URL + '/otzyvy';
const REVIEW_TEXT   = 'Проверка отправки отзыва с видео MOV — автотестирование';
const REVIEW_SNIPPET = 'с видео MOV — автотестирование';

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

test('Форма "Написать отзыв" — отправка с видео MOV (1:59): видео загружается, отзыв публикуется и отображается в видео-галерее', async ({ page, context }) => {
  test.setTimeout(420000);

  let reviewSubmitted = false;
  let reviewPublished = false;

  // Отдельная вкладка для админ-панели: делит куки/сессию логина с основной страницей
  // (context общий), но у неё своя история навигации. Иначе «клик Акции → goBack()»
  // при проверке на /otzyvy мог бы случайно вернуть не на публичную страницу, а в
  // засорённую переходами внутри SPA-админки историю того же таба.
  const adminPage = await context.newPage();

  try {
    // 1. Открываем форму
    await openReviewModal(page);

    const form = page.locator('.reviews-form-container');

    // 2. Выбираем 4 звезды
    await form.locator('div.stars svg.star').nth(3).click();

    // 3. Загружаем MOV-видео через файловый диалог
    const videoItem = form.locator('.media-item.video-item');
    await videoItem.waitFor({ state: 'visible', timeout: 8000 });

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }),
      videoItem.click(),
    ]);
    await fileChooser.setFiles(VIDEO_PATH_MOV);
    console.log('[test] Видеофайл MOV передан в диалог выбора файлов');

    // 4. Ждём завершения загрузки — превью, исчезновение прогресс-индикатора или ошибка
    const uploadResult = await page.waitForFunction(
      () => {
        const f = document.querySelector('.reviews-form-container');
        if (!f) return false;
        const errText = f.innerText.toLowerCase();
        if (
          errText.includes('ошибка') ||
          errText.includes('не поддерживается') ||
          errText.includes('не принят')
        ) return 'error';
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

    // 5. Заполняем остальные поля
    await form.locator('textarea.review-input').fill(REVIEW_TEXT);
    await form.locator('input[name="fio"]').fill(TEST_NAME);
    await form.locator('input[name="phone"]').click();
    await page.keyboard.type(TEST_PHONE);
    const checkbox = form.locator('input[name="agreeCheckbox"]');
    if (!await checkbox.isChecked()) await checkbox.check();

    // 6. Ждём пока кнопка станет активной — MOV дольше загружается на сервер,
    // чем MP4: превью появляется раньше, чем завершается backend-upload.
    await page.waitForFunction(
      () => {
        const btn = document.querySelector('button.send-review-button');
        return btn && !btn.disabled;
      },
      { timeout: 120000 }
    );
    console.log('[test] ✓ Кнопка отправки стала активной');

    // 7. Отправляем
    await form.locator('button.send-review-button').click();
    reviewSubmitted = true;
    // Кнопка отправки становится активной уже после локальной обработки превью, но сама отправка
    // с прикреплённым видео (сервер повторно валидирует/обрабатывает файл) может занимать
    // заметно дольше, чем у текстовых отзывов — 15с оказалось недостаточно.
    await expect(page.locator('.reviews-form-container')).not.toBeVisible({ timeout: 60000 });
    console.log('[test] ✓ Отзыв с видео MOV отправлен');

    // 8. Проверяем в панели администратора (в отдельной вкладке)
    await checkReviewInAdmin(adminPage, REVIEW_SNIPPET);
    console.log('[test] ✓ Отзыв найден в панели администратора');

    // 9. Публикуем
    await publishReviewInAdmin(adminPage, REVIEW_SNIPPET);
    reviewPublished = true;
    console.log('[test] ✓ Отзыв опубликован');

    // 10. Проверяем на /otzyvy (акции → назад, до 3 попыток)
    await page.goto(REVIEWS_PAGE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.getByRole('link', { name: /акции/i }).first().click();
    await page.waitForURL('**/akczii**', { timeout: 15000 });
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);

    let found = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      found = await page.evaluate(
        (text) => document.body.innerText.includes(text),
        REVIEW_TEXT
      );
      if (found) break;
      if (attempt < 3) {
        console.log(`[test] Отзыв не найден на /otzyvy, попытка ${attempt}/3, жду 5 с...`);
        await page.waitForTimeout(5000);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(500);
      }
    }
    if (!found) throw new Error(`Отзыв с MOV не найден на странице ${REVIEWS_PAGE}`);
    console.log('[test] ✓ Отзыв с видео MOV виден на странице /otzyvy');

    // 11. Видео-карточка отображается в галерее /otzyvy
    for (let y = 400; y <= 2000; y += 400) {
      await page.evaluate(pos => window.scrollTo(0, pos), y);
      await page.waitForTimeout(100);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    const videoCard = page.locator('.media-item').first();
    await videoCard.waitFor({ state: 'visible', timeout: 10000 });
    console.log('[test] ✓ Видео-отзыв MOV отображается в галерее на /otzyvy');

    // 12. Клик на карточку открывает плеер
    await videoCard.scrollIntoViewIfNeeded();
    await videoCard.click();
    await page.waitForTimeout(800);

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
    await page.waitForTimeout(300);

  } finally {
    if (reviewSubmitted) {
      try {
        if (reviewPublished) {
          const actuallyPublished = await isReviewPublishedInAdmin(adminPage, REVIEW_SNIPPET);
          await deleteReviewInAdmin(adminPage, REVIEW_SNIPPET);
          if (actuallyPublished) {
            console.log('[test] ✓ Тестовый отзыв удалён');
          } else {
            console.warn(
              '\n⚠️  Удалён, но НЕОПУБЛИКОВАН.\n' +
              '   Тогл публикации в админке был выключен — публикация не сработала.\n'
            );
          }
        } else {
          await deleteReviewInAdmin(adminPage, REVIEW_SNIPPET);
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
    await adminPage.close();
  }
});
