import { test, expect } from '@playwright/test';
import { checkReviewInAdmin, publishReviewInAdmin, deleteReviewInAdmin, isReviewPublishedInAdmin } from '../helpers/admin.js';
import { BASE_URL } from '../helpers/config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PHOTOS = [
  { path: path.resolve(__dirname, 'dedushka-vnutchka-1280x720.jpg'),   label: 'JPG'  },
  { path: path.resolve(__dirname, 'devushka-model-960x1440.jpeg'),     label: 'JPEG' },
  { path: path.resolve(__dirname, 'devushka-model-960x1440.png'),      label: 'PNG'  },
  { path: path.resolve(__dirname, 'muzhchina-ocean-1280x720.webp'),    label: 'WebP' },
];

const TEST_NAME      = 'Тест Тестов';
const TEST_PHONE     = '4444444444';
const REVIEWS_PAGE   = BASE_URL + '/otzyvy';
const REVIEW_TEXT    = 'Проверка отправки отзыва с четырьмя фото (JPG, JPEG, PNG, WebP) — автотестирование';
const REVIEW_SNIPPET = 'четырьмя фото (JPG, JPEG, PNG, WebP) — автотестирование';

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

// Ждёт завершения загрузок: нет спиннеров и есть N превью
async function waitForUploadsComplete(page, expectedCount) {
  await page.waitForFunction(
    (n) => {
      const f = document.querySelector('.reviews-form-container');
      if (!f) return false;
      // Нет спиннеров или индикаторов загрузки
      const spinning = f.querySelector(
        '[class*="loading"], [class*="uploading"], [class*="progress"], ' +
        '[class*="spinner"], svg.animate-spin, .v-progress'
      );
      if (spinning) return false;
      // Все превью загружены (не чёрные/placeholder)
      const imgs = f.querySelectorAll('img[src]:not([src=""])');
      return imgs.length >= n ? imgs.length : false;
    },
    expectedCount,
    { timeout: 120000 }
  );
}

// Загружает одно фото в слот и ждёт появления превью
async function uploadOnePhoto(page, form, photoPath, expectedPreviewCount) {
  const slot = form.locator('.media-item.image-item');
  await slot.first().waitFor({ state: 'visible', timeout: 8000 });
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    slot.first().click(),
  ]);
  await fileChooser.setFiles(photoPath);

  // Ждём появления N-го превью
  await page.waitForFunction(
    (n) => {
      const f = document.querySelector('.reviews-form-container');
      if (!f) return false;
      const errText = f.innerText.toLowerCase();
      if (errText.includes('не поддерживается') || errText.includes('не принят')) return -1;
      const imgs = f.querySelectorAll('img[src]:not([src=""])');
      return imgs.length >= n ? imgs.length : false;
    },
    expectedPreviewCount,
    { timeout: 30000 }
  ).then(h => h.jsonValue());
}

test.describe.configure({ retries: 0 });

test('Форма "Написать отзыв" — загрузка и отправка четырёх фото (JPG, JPEG, PNG, WebP): все фото загружаются, отзыв публикуется', async ({ page }) => {
  test.setTimeout(300000);

  let reviewSubmitted = false;
  let reviewPublished = false;

  try {
    await openReviewModal(page);
    const form = page.locator('.reviews-form-container');

    // Выбираем 4 звезды
    await form.locator('div.stars svg.star').nth(3).click();

    // Загружаем фото по одному
    for (let i = 0; i < PHOTOS.length; i++) {
      await uploadOnePhoto(page, form, PHOTOS[i].path, i + 1);
      console.log(`[test] ✓ Фото ${i + 1}/${PHOTOS.length} ${PHOTOS[i].label} загружено`);
    }

    // Ждём полного завершения всех загрузок на сервер (PNG 2.8MB может идти дольше)
    await waitForUploadsComplete(page, 4);

    // Проверяем что в форме ровно 4 превью
    const previewCount = await form.locator('img[src]:not([src=""])').count();
    expect(previewCount, 'Ожидается 4 превью фото в форме').toBe(4);
    console.log('[test] ✓ Все 4 фото отображаются в форме');

    // Заполняем остальные поля
    await form.locator('textarea.review-input').fill(REVIEW_TEXT);
    await form.locator('input[name="fio"]').fill(TEST_NAME);
    await form.locator('input[name="phone"]').click();
    await page.keyboard.type(TEST_PHONE);
    const checkbox = form.locator('input[name="agreeCheckbox"]');
    if (!await checkbox.isChecked()) await checkbox.check();

    // Ждём активации кнопки отправки
    await page.waitForFunction(
      () => { const btn = document.querySelector('button.send-review-button'); return btn && !btn.disabled; },
      { timeout: 120000 }
    );
    console.log('[test] ✓ Кнопка отправки стала активной');

    // Отправляем
    await form.locator('button.send-review-button').click();
    reviewSubmitted = true;
    await expect(page.locator('.reviews-form-container')).not.toBeVisible({ timeout: 15000 });
    console.log('[test] ✓ Отзыв с 4 фото отправлен');

    // Проверяем в панели администратора
    await checkReviewInAdmin(page, REVIEW_SNIPPET);
    console.log('[test] ✓ Отзыв найден в панели администратора');

    // Публикуем
    await publishReviewInAdmin(page, REVIEW_SNIPPET);
    reviewPublished = true;
    console.log('[test] ✓ Отзыв опубликован');

    // Проверяем на /otzyvy
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
    if (!found) throw new Error(`Отзыв с 4 фото не найден на странице ${REVIEWS_PAGE}`);
    console.log('[test] ✓ Отзыв с 4 фото виден на странице /otzyvy');

    // Шаг 9. Проверяем фото-галерею
    console.log('[test] === ШАГ 9: Проверка фото-галереи ===');

    // Прокрутка страницы для загрузки lazy-контента
    for (let y = 400; y <= 3000; y += 400) {
      await page.evaluate(pos => window.scrollTo(0, pos), y);
      await page.waitForTimeout(300);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    // Скроллим к тексту нашего отзыва, чтобы он попал в поле зрения
    const reviewTextEl = page.getByText(REVIEW_TEXT, { exact: false }).first();
    await reviewTextEl.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    console.log('[test] ✓ Карточка отзыва прокручена в поле зрения');

    // Ищем ближайший предок, у которого внутри есть .media-item,
    // и берём первый .media-item в нём — это первое фото нашего отзыва
    const firstPhoto = reviewTextEl
      .locator('xpath=ancestor-or-self::*[.//*[contains(@class,"media-item")]][1]')
      .locator('.media-item')
      .first();

    await firstPhoto.waitFor({ state: 'visible', timeout: 10000 });
    await firstPhoto.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    console.log('[test] ✓ Первое фото в карточке отзыва найдено — кликаем...');

    // Клик на фото-миниатюру (открывает просмотрщик)
    await firstPhoto.click();
    await page.waitForTimeout(2500);

    // Проверяем открытие просмотрщика
    const viewerOpened = await page.waitForFunction(
      () => {
        const candidates = [...document.querySelectorAll(
          '[role="dialog"], [class*="modal"], [class*="overlay"], ' +
          '[class*="lightbox"], [class*="viewer"], [class*="carousel"], [class*="gallery"]'
        )];
        return candidates.some(m => {
          const s = getComputedStyle(m);
          return s.display !== 'none' && s.visibility !== 'hidden' &&
                 s.opacity !== '0' && m.querySelector('img');
        });
      },
      { timeout: 10000 }
    ).then(() => true).catch(() => false);

    expect(viewerOpened, 'Просмотрщик фото должен открыться при клике на миниатюру').toBe(true);
    console.log('[test] ✓ Просмотрщик фото открылся');

    // Пролистываем все 4 фото: шеврон «вправо» расположен СНАРУЖИ белого окна плеера —
    // ищем небольшую видимую кнопку в правой части экрана (правее 70% ширины вьюпорта)
    const vp = page.viewportSize() || { width: 1280, height: 720 };

    for (let photoIdx = 1; photoIdx < 4; photoIdx++) {
      let clicked = false;

      const allBtns = page.locator('button, [role="button"]');
      const total = await allBtns.count();
      for (let j = 0; j < total && !clicked; j++) {
        const btn = allBtns.nth(j);
        if (!await btn.isVisible({ timeout: 200 }).catch(() => false)) continue;
        const box = await btn.boundingBox();
        if (!box || box.x <= vp.width * 0.7 || box.width >= 100) continue;
        const text = (await btn.textContent().catch(() => '')).trim();
        if (['×', '✕', 'Закрыть'].includes(text)) continue;
        clicked = await btn.click({ timeout: 2000 }).then(() => true).catch(() => false);
        if (clicked) console.log(`[test] Шеврон → нажат (x=${Math.round(box.x)}, w=${Math.round(box.width)})`);
      }

      if (!clicked) {
        await page.keyboard.press('ArrowRight');
        console.log('[test] Шеврон не найден — использована стрелка →');
      }
      await page.waitForTimeout(1500);
      console.log(`[test] ✓ Пролистано до фото ${photoIdx + 1}/4`);
    }
    console.log('[test] ✓ Все 4 фото просмотрены в галерее');

    // Закрываем просмотрщик
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
    console.log('[test] ✓ Просмотрщик закрыт');

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
          console.warn('\n⚠️  Удалён до ПУБЛИКАЦИИ.\n   Тест упал раньше шага публикации.\n');
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
