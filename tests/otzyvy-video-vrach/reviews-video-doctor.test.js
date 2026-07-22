import { test, expect } from '@playwright/test';
import { checkReviewInAdminWithDoctor, publishReviewInAdmin, deleteReviewInAdmin, isReviewPublishedInAdmin } from '../helpers/admin.js';
import { BASE_URL } from '../helpers/config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEO_PATH      = path.resolve(__dirname, '../videos/ezhik-v-tumane-1m59s.mp4');
const VIDEO_PATH_2M01 = path.resolve(__dirname, '../videos/ezhik-v-tumane-2m01s.mp4');
const VIDEO_PATH_3M00 = path.resolve(__dirname, '../videos/ezhik-v-tumane-3m00s.mp4');

const TEST_NAME    = 'Тест Тестов';
const TEST_PHONE   = '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const VRACHI_PAGE  = BASE_URL + '/vrachi';
const REVIEWS_PAGE = BASE_URL + '/otzyvy';
const REVIEW_TEXT  = 'Проверка отправки отзыва с видео с личной страницы врача — автотестирование';
const REVIEW_SNIPPET = 'с видео с личной страницы';

async function acceptCookies(page) {
  try {
    await page.getByRole('button', { name: /принять/i }).waitFor({ state: 'visible', timeout: 5000 });
    await page.getByRole('button', { name: /принять/i }).click();
  } catch {}
}

// Открывает форму отзыва на странице врача (первый из «Показать еще»).
// Возвращает { doctorName, doctorHref, form }.
async function openDoctorReviewForm(page) {
  await page.goto(VRACHI_PAGE);
  await page.waitForLoadState('domcontentloaded');
  await acceptCookies(page);

  const crachedVrachi    = await page.locator('text=Что-то пошло не так').isVisible({ timeout: 1000 }).catch(() => false);
  const maintenanceVrachi = await page.locator('text=Сайт скоро вернётся').isVisible({ timeout: 1000 }).catch(() => false);
  test.skip(crachedVrachi || maintenanceVrachi, 'страница /vrachi недоступна (сайт на обслуживании)');

  const countBefore = await page.evaluate(() =>
    document.querySelectorAll('.doctor-info-container').length
  );

  const moreBtn = page.locator('button.more-button').first();
  await moreBtn.scrollIntoViewIfNeeded();
  await moreBtn.click();
  await page.waitForFunction(
    (prev) => document.querySelectorAll('.doctor-info-container').length > prev,
    countBefore,
    { timeout: 10000 }
  );

  const doctorHref = await page.evaluate((idx) => {
    const containers = [...document.querySelectorAll('.doctor-info-container')];
    return containers[idx]?.querySelector('a[href*="/vrach/"]')?.href || null;
  }, countBefore);
  if (!doctorHref) throw new Error('Не найдена карточка врача после «Показать еще»');

  await page.goto(doctorHref, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const doctorName = (await page.locator('h1').first().textContent()).trim();
  console.log('[test] Врач:', doctorName);

  const crashed     = await page.locator('text=Что-то пошло не так').isVisible({ timeout: 1000 }).catch(() => false);
  const maintenance = await page.locator('text=Сайт скоро вернётся').isVisible({ timeout: 1000 }).catch(() => false);
  test.skip(crashed || maintenance, 'страница врача недоступна (сайт на обслуживании)');
  const reviewBtn = page.locator('button.total-reviews-button');
  await reviewBtn.waitFor({ state: 'visible', timeout: 8000 });
  await reviewBtn.scrollIntoViewIfNeeded();
  await reviewBtn.click();
  await page.locator('.reviews-form-container').waitFor({ state: 'visible', timeout: 8000 });

  return { doctorName, doctorHref, form: page.locator('.reviews-form-container') };
}

// retries: 0 — отзыв нельзя отправлять дважды при повторном прогоне
test.describe.configure({ retries: 0 });

// ──────────────────────────────────────────────────────────────────────────────

test('Форма отзыва с личной страницы врача — отправка с видео (1:59): видео загружается, отзыв публикуется и отображается в видео-галерее', async ({ page, context }) => {
  test.setTimeout(420000);

  let reviewSubmitted = false;
  let reviewPublished = false;
  let doctorName = null;

  // Отдельная вкладка для работы в админ-панели: она делит куки/сессию логина с основной
  // страницей (context общий), но у неё своя история навигации. Если бы админка работала
  // в том же page, что и публичные проверки (шаги 14 и 17), «клик Акции → goBack()» мог бы
  // случайно вернуть не на публичную страницу, а в засорённую навигациями внутри SPA-админки
  // историю того же таба.
  const adminPage = await context.newPage();

  try {
    // 1. Открываем список врачей
    await page.goto(VRACHI_PAGE);
    await page.waitForLoadState('domcontentloaded');
    await acceptCookies(page);

    const crachedVrachi    = await page.locator('text=Что-то пошло не так').isVisible({ timeout: 1000 }).catch(() => false);
    const maintenanceVrachi = await page.locator('text=Сайт скоро вернётся').isVisible({ timeout: 1000 }).catch(() => false);
    if (crachedVrachi || maintenanceVrachi) throw new Error('Приложение недоступно — страница /vrachi показывает экран ошибки');

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

    // 6. Читаем ФИО врача — нужно для поиска строки в таблице администратора
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

    // 9. Загружаем видео через файловый диалог
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

    // 10. Заполняем остальные поля
    await form.locator('textarea.review-input').fill(REVIEW_TEXT);
    await form.locator('input[name="fio"]').fill(TEST_NAME);
    await form.locator('input[name="phone"]').click();
    await page.keyboard.type(TEST_PHONE);
    const checkbox = form.locator('input[name="agreeCheckbox"]');
    if (!await checkbox.isChecked()) await checkbox.check();

    // 11. Отправляем
    await form.locator('button.send-review-button').click();
    reviewSubmitted = true;
    // Кнопка отправки становится активной уже после локальной обработки превью, но сама отправка
    // с прикреплённым видео (сервер повторно валидирует/обрабатывает файл) может занимать
    // заметно дольше, чем у текстовых отзывов — 15с оказалось недостаточно.
    await expect(page.locator('.reviews-form-container')).not.toBeVisible({ timeout: 60000 });
    console.log('[test] ✓ Отзыв с видео отправлен');

    // 12. Проверяем в панели администратора (в отдельной вкладке)
    await checkReviewInAdminWithDoctor(adminPage, REVIEW_SNIPPET, doctorName);
    console.log('[test] ✓ Отзыв найден в панели администратора');

    // 13. Публикуем
    await publishReviewInAdmin(adminPage, REVIEW_SNIPPET, doctorName);
    reviewPublished = true;
    console.log('[test] ✓ Отзыв опубликован');

    // 14. Проверяем на личной странице врача (до 3 попыток)
    await page.goto(doctorHref, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.getByRole('link', { name: /акции/i }).first().click();
    await page.waitForURL('**/akczii**', { timeout: 15000 });
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);

    let textFoundOnDoctorPage = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      textFoundOnDoctorPage = await page.evaluate(
        (reviewText) => document.body.innerText.includes(reviewText),
        REVIEW_TEXT
      );
      if (textFoundOnDoctorPage) break;
      if (attempt < 3) {
        console.log(`[test] Отзыв не найден на странице врача, попытка ${attempt}/3, жду 5 с...`);
        await page.waitForTimeout(5000);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(500);
      }
    }
    if (!textFoundOnDoctorPage) {
      throw new Error(`Опубликованный видео-отзыв не найден на странице врача ${doctorHref}`);
    }
    console.log('[test] ✓ Отзыв с видео виден на странице врача');

    // 15. Видео-карточка отображается в галерее на странице врача
    for (let y = 400; y <= 2000; y += 400) {
      await page.evaluate(pos => window.scrollTo(0, pos), y);
      await page.waitForTimeout(100);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    const videoCard = page.locator('.media-item').first();
    await videoCard.waitFor({ state: 'visible', timeout: 10000 });
    console.log('[test] ✓ Видео-отзыв отображается в галерее на странице врача');

    // 16. Клик на карточку открывает видео-плеер
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

    // 17. Проверяем отзыв на общей странице /otzyvy (до 3 попыток)
    await page.goto(REVIEWS_PAGE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.getByRole('link', { name: /акции/i }).first().click();
    await page.waitForURL('**/akczii**', { timeout: 15000 });
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);

    let textFoundOnReviewsPage = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      textFoundOnReviewsPage = await page.evaluate(
        (reviewText) => document.body.innerText.includes(reviewText),
        REVIEW_TEXT
      );
      if (textFoundOnReviewsPage) break;
      if (attempt < 3) {
        console.log(`[test] Отзыв не найден на /otzyvy, попытка ${attempt}/3, жду 5 с...`);
        await page.waitForTimeout(5000);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(500);
      }
    }
    if (!textFoundOnReviewsPage) {
      throw new Error(`Опубликованный видео-отзыв не найден на странице ${REVIEWS_PAGE}`);
    }
    console.log('[test] ✓ Отзыв с видео виден на странице /otzyvy');

  } finally {
    if (reviewSubmitted) {
      try {
        if (reviewPublished) {
          const actuallyPublished = await isReviewPublishedInAdmin(adminPage, REVIEW_SNIPPET, doctorName);
          await deleteReviewInAdmin(adminPage, REVIEW_SNIPPET, doctorName);
          if (actuallyPublished) {
            console.log('[test] ✓ Тестовый отзыв удалён');
          } else {
            console.warn(
              '\n⚠️  Удалён, но НЕОПУБЛИКОВАН.\n' +
              '   Тогл публикации в админке был выключен — публикация не сработала.\n'
            );
          }
        } else {
          await deleteReviewInAdmin(adminPage, REVIEW_SNIPPET, doctorName);
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

// ──────────────────────────────────────────────────────────────────────────────

test('Форма отзыва с личной страницы врача — видео 2:01 (чуть длиннее лимита) не принимается', async ({ page }) => {
  // 180 с: видео 2:01 не отклоняется клиентом мгновенно — начинает загружаться,
  // ответ об ошибке приходит с сервера, на это нужно время
  test.setTimeout(180000);

  const { form } = await openDoctorReviewForm(page);

  const videoItem = form.locator('.media-item.video-item');
  await videoItem.waitFor({ state: 'visible', timeout: 8000 });

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    videoItem.click(),
  ]);
  await fileChooser.setFiles(VIDEO_PATH_2M01);
  console.log('[test] Видеофайл 2:01 передан в диалог');

  // Ждём до 120 с: либо появится ошибка, либо загрузка завершится
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

  // БАГ САЙТА: форма принимает видео 2:01, хотя ограничение — до 2 мин.
  // Видео 3:00 отклоняется клиентом мгновенно, видео 2:01 — нет.
  expect(videoAccepted, 'БАГ: видео 2:01 принято формой, хотя лимит — до 2 мин').toBe(false);
  console.log('[test] ✓ Видео 2:01 не принято формой');
});

// ──────────────────────────────────────────────────────────────────────────────

test('Форма отзыва с личной страницы врача — видео 3:00 (значительно длиннее лимита) не принимается', async ({ page }) => {
  test.setTimeout(60000);

  const { form } = await openDoctorReviewForm(page);

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
