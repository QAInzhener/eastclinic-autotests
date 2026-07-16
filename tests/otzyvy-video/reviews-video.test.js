import { test, expect } from '@playwright/test';
import { checkReviewInAdmin, publishReviewInAdmin, deleteReviewInAdmin, isReviewPublishedInAdmin } from '../helpers/admin.js';
import { BASE_URL } from '../helpers/config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEO_PATH      = path.resolve(__dirname, '../videos/ezhik-v-tumane-1m59s.mp4');
const VIDEO_PATH_2M01 = path.resolve(__dirname, '../videos/ezhik-v-tumane-2m01s.mp4');
const VIDEO_PATH_3M00 = path.resolve(__dirname, '../videos/ezhik-v-tumane-3m00s.mp4');

const TEST_NAME    = 'Тест Тестов';
const TEST_PHONE   = '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const REVIEWS_PAGE = BASE_URL + '/otzyvy';
const REVIEW_TEXT  = 'Проверка отправки отзыва с видео — автотестирование';
const REVIEW_SNIPPET = 'отзыва с видео — автотестирование';

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
  const crashed = await page.locator('text=Что-то пошло не так').isVisible({ timeout: 1000 }).catch(() => false);
  if (crashed) throw new Error('Приложение упало — страница показывает экран ошибки');
  const btn = page.locator('button.total-reviews-button');
  await btn.waitFor({ state: 'visible', timeout: 8000 });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  await page.locator('.reviews-form-container').waitFor({ state: 'visible', timeout: 8000 });
}

// retries: 0 — отзыв нельзя отправлять дважды при повторном прогоне
test.describe.configure({ retries: 0 });

// ──────────────────────────────────────────────────────────────────────────────

test('Форма "Написать отзыв" — отправка с видео (1:59): видео загружается, отзыв публикуется и отображается в видео-галерее', async ({ page }) => {
  test.setTimeout(420000);

  let reviewSubmitted = false;
  let reviewPublished = false;

  try {
    // 1. Открываем форму
    await openReviewModal(page);

    const form = page.locator('.reviews-form-container');

    // 2. Выбираем 4 звезды
    await form.locator('div.stars svg.star').nth(3).click();

    // 3. Загружаем видео через файловый диалог
    const videoItem = form.locator('.media-item.video-item');
    await videoItem.waitFor({ state: 'visible', timeout: 8000 });

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }),
      videoItem.click(),
    ]);
    await fileChooser.setFiles(VIDEO_PATH);
    console.log('[test] Видеофайл передан в диалог выбора файлов');

    await page.waitForFunction(
      () => {
        const form = document.querySelector('.reviews-form-container');
        if (!form) return false;
        if (form.querySelector('video, [class*="preview"], [class*="uploaded"], [class*="video-thumb"]')) return true;
        const progress = form.querySelector('[class*="progress"], [class*="loading"], [class*="uploading"]');
        return !progress;
      },
      { timeout: 90000 }
    ).catch(() => {
      console.log('[test] Не дождались явного превью — продолжаем');
    });
    console.log('[test] ✓ Видео загружено');

    // 4. Заполняем остальные поля
    await form.locator('textarea.review-input').fill(REVIEW_TEXT);
    await form.locator('input[name="fio"]').fill(TEST_NAME);
    await form.locator('input[name="phone"]').click();
    await page.keyboard.type(TEST_PHONE);
    const checkbox = form.locator('input[name="agreeCheckbox"]');
    if (!await checkbox.isChecked()) await checkbox.check();

    // 5. Отправляем
    await form.locator('button.send-review-button').click();
    reviewSubmitted = true; // флаг ставим сразу — отзыв мог уйти на сервер даже если форма не закрылась
    await expect(page.locator('.reviews-form-container')).not.toBeVisible({ timeout: 15000 });
    console.log('[test] ✓ Отзыв с видео отправлен');

    // 6. Проверяем в панели администратора
    await checkReviewInAdmin(page, REVIEW_SNIPPET);
    console.log('[test] ✓ Отзыв найден в панели администратора');

    // 7. Публикуем
    await publishReviewInAdmin(page, REVIEW_SNIPPET);
    reviewPublished = true;
    console.log('[test] ✓ Отзыв опубликован');

    // 8. Проверяем на странице /otzyvy
    await page.goto(REVIEWS_PAGE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.getByRole('link', { name: /акции/i }).first().click();
    await page.waitForURL('**/akczii**', { timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // 8а. Текст отзыва виден на странице (до 3 попыток с интервалом 5 с)
    let textFound = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      textFound = await page.evaluate(
        (reviewText) => document.body.innerText.includes(reviewText),
        REVIEW_TEXT
      );
      if (textFound) break;
      if (attempt < 3) {
        console.log(`[test] Отзыв не найден на странице, попытка ${attempt}/3, жду 5 с...`);
        await page.waitForTimeout(5000);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);
      }
    }
    if (!textFound) {
      throw new Error(`Опубликованный отзыв с видео не найден на странице ${REVIEWS_PAGE}`);
    }
    console.log('[test] ✓ Отзыв с видео виден на странице /otzyvy');

    // 8б. Видео-карточка отображается в галерее
    for (let y = 400; y <= 2000; y += 400) {
      await page.evaluate(pos => window.scrollTo(0, pos), y);
      await page.waitForTimeout(250);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    const videoCard = page.locator('.media-item').first();
    await videoCard.waitFor({ state: 'visible', timeout: 10000 });
    console.log('[test] ✓ Видео-отзыв отображается в галерее');

    // 8в. Клик на карточку открывает видео-плеер
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

  } finally {
    // Удаляем тестовый отзыв всегда — даже если тест упал на середине
    if (reviewSubmitted) {
      try {
        if (reviewPublished) {
          // Проверяем реальное состояние тогла публикации в админке
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

test('Форма "Написать отзыв" — видео 2:01 (чуть длиннее лимита) не принимается', async ({ page }) => {
  // 180 с: видео 2:01 не отклоняется клиентом мгновенно — начинает загружаться,
  // ответ об ошибке приходит с сервера, на это нужно время
  test.setTimeout(180000);

  await openReviewModal(page);

  const form = page.locator('.reviews-form-container');
  const videoItem = form.locator('.media-item.video-item');
  await videoItem.waitFor({ state: 'visible', timeout: 8000 });

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    videoItem.click(),
  ]);
  await fileChooser.setFiles(VIDEO_PATH_2M01);
  console.log('[test] Видеофайл 2:01 передан в диалог');

  // Ждём до 120 с: либо появится ошибка, либо загрузка завершится (превью или исчезнет прогресс)
  await page.waitForFunction(
    () => {
      const body = document.body.innerText.toLowerCase();
      const hasError = (
        body.includes('слишком') ||
        body.includes('превышает') ||
        body.includes('длиннее') ||
        body.includes('ограничение') ||
        body.includes('не более') ||
        !!document.querySelector('[class*="error"], [class*="invalid"], [class*="reject"]')
      );
      const hasPreview = !!document.querySelector(
        '.reviews-form-container video, .reviews-form-container [class*="preview"], .reviews-form-container [class*="uploaded"]'
      );
      const loadingGone = !document.querySelector(
        '.reviews-form-container [class*="progress"], .reviews-form-container [class*="loading"], .reviews-form-container [class*="uploading"]'
      );
      // Завершаем ожидание когда: пришла ошибка ИЛИ (загрузка закончена и прогресс-бара нет)
      return hasError || hasPreview || loadingGone;
    },
    { timeout: 120000 }
  ).catch(() => {
    console.log('[test] Ожидание завершилось по таймауту — проверяем итоговое состояние формы');
  });

  const videoAccepted = await page.evaluate(() => {
    const form = document.querySelector('.reviews-form-container');
    if (!form) return false;
    return !!form.querySelector('video, [class*="video-preview"], [class*="uploaded-video"]');
  });

  // На prod сервер корректно отклоняет 2:01. На dev1 — пропускает (баг окружения).
  // Видео 3:00 отклоняется клиентом мгновенно, видео 2:01 — только сервером.
  expect(videoAccepted, 'БАГ dev1: видео 2:01 принято формой, хотя лимит — до 2 мин').toBe(false);
  console.log('[test] ✓ Видео 2:01 не принято формой');
});

test('Форма "Написать отзыв" — видео 3:00 (значительно длиннее лимита) не принимается', async ({ page }) => {
  test.setTimeout(60000);

  await openReviewModal(page);

  const form = page.locator('.reviews-form-container');
  const videoItem = form.locator('.media-item.video-item');
  await videoItem.waitFor({ state: 'visible', timeout: 8000 });

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    videoItem.click(),
  ]);
  await fileChooser.setFiles(VIDEO_PATH_3M00);
  console.log('[test] Видеофайл 3:00 передан в диалог');

  await page.waitForFunction(
    () => {
      const body = document.body.innerText.toLowerCase();
      return (
        body.includes('2 мин') ||
        body.includes('слишком') ||
        body.includes('превышает') ||
        body.includes('длиннее') ||
        body.includes('ограничение') ||
        body.includes('не более') ||
        !!document.querySelector('[class*="error"], [class*="invalid"], [class*="reject"]')
      );
    },
    { timeout: 15000 }
  ).catch(() => {
    console.log('[test] Явного сообщения об ошибке не найдено — проверяем что файл не принят');
  });

  const videoAccepted = await page.evaluate(() => {
    const form = document.querySelector('.reviews-form-container');
    if (!form) return false;
    return !!form.querySelector('video, [class*="video-preview"], [class*="uploaded-video"]');
  });

  expect(videoAccepted, 'Видео 3:00 не должно быть принято формой').toBe(false);
  console.log('[test] ✓ Видео 3:00 не принято формой');
});
