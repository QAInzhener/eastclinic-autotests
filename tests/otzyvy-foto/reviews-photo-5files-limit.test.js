import { test, expect } from '@playwright/test';
import { checkReviewInAdmin, publishReviewInAdmin, deleteReviewInAdmin, isReviewPublishedInAdmin } from '../helpers/admin.js';
import { BASE_URL } from '../helpers/config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PHOTOS_4 = [
  { path: path.resolve(__dirname, 'dedushka-vnutchka-1280x720.jpg'),   label: 'JPG'  },
  { path: path.resolve(__dirname, 'devushka-model-960x1440.jpeg'),     label: 'JPEG' },
  { path: path.resolve(__dirname, 'devushka-model-960x1440.png'),      label: 'PNG'  },
  { path: path.resolve(__dirname, 'muzhchina-ocean-1280x720.webp'),    label: 'WebP' },
];
const PHOTO_5TH = { path: path.resolve(__dirname, 'luna-964x1280.jpg'), label: 'Луна (JPG)' };

const TEST_NAME      = 'Тест Тестов';
const TEST_PHONE     = '4444444444';
const REVIEWS_PAGE   = BASE_URL + '/otzyvy';
const REVIEW_TEXT    = 'Отзыв с четырьмя фото из пяти — проверка лимита формы — автотестирование';
const REVIEW_SNIPPET = 'лимита формы — автотестирование';

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
      const spinning = f.querySelector(
        '[class*="loading"], [class*="uploading"], [class*="progress"], ' +
        '[class*="spinner"], svg.animate-spin, .v-progress'
      );
      if (spinning) return false;
      const imgs = f.querySelectorAll('img[src]:not([src=""])');
      return imgs.length >= n ? imgs.length : false;
    },
    expectedCount,
    { timeout: 120000 }
  );
}

// Загружает одно фото в слот и ждёт появления N-го превью
async function uploadOnePhoto(page, form, photoPath, expectedPreviewCount) {
  const slot = form.locator('.media-item.image-item');
  await slot.first().waitFor({ state: 'visible', timeout: 8000 });
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    slot.first().click(),
  ]);
  await fileChooser.setFiles(photoPath);

  await page.waitForFunction(
    (n) => {
      const f = document.querySelector('.reviews-form-container');
      if (!f) return false;
      const imgs = f.querySelectorAll('img[src]:not([src=""])');
      return imgs.length >= n ? imgs.length : false;
    },
    expectedPreviewCount,
    { timeout: 30000 }
  ).then(h => h.jsonValue());
}

test.describe.configure({ retries: 0 });

test('Форма "Написать отзыв" — попытка загрузить 5 фото (JPG, JPEG, PNG, WebP, Луна): четыре загружаются, пятое невозможно загрузить', async ({ page }) => {
  test.setTimeout(300000);

  let reviewSubmitted = false;
  let reviewPublished = false;

  try {
    await openReviewModal(page);
    const form = page.locator('.reviews-form-container');

    // Выбираем 4 звезды
    await form.locator('div.stars svg.star').nth(3).click();

    // Загружаем первые 4 фото по одному — все должны принятые
    for (let i = 0; i < PHOTOS_4.length; i++) {
      await uploadOnePhoto(page, form, PHOTOS_4[i].path, i + 1);
      console.log(`[test] ✓ Фото ${i + 1}/4 ${PHOTOS_4[i].label} загружено`);
    }

    // Ждём полного завершения загрузок на сервер (PNG 2.8MB может быть медленнее)
    await waitForUploadsComplete(page, 4);

    const countAfter4 = await form.locator('img[src]:not([src=""])').count();
    expect(countAfter4, 'Ожидается 4 превью после загрузки 4 фото').toBe(4);
    console.log('[test] ✓ 4 фото в форме');

    // Пробуем загрузить 5-е фото (Луна)
    const uploadSlot = form.locator('.media-item.image-item');
    const slotVisible = await uploadSlot.first().isVisible({ timeout: 3000 }).catch(() => false);

    if (slotVisible) {
      // Слот ещё доступен — пробуем загрузить 5-й файл
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 10000 }),
        uploadSlot.first().click(),
      ]);
      await fileChooser.setFiles(PHOTO_5TH.path);
      console.log(`[test] Файл «${PHOTO_5TH.label}» передан в диалог выбора`);

      // Ждём 5 секунд — 5-е фото не должно появиться
      await page.waitForTimeout(5000);
      const countAfter5th = await form.locator('img[src]:not([src=""])').count();
      expect(countAfter5th, '5-е фото не должно быть принято формой').toBe(4);
      console.log('[test] ✓ 5-е фото (Луна) отклонено — в форме по-прежнему 4 превью');
    } else {
      // Слот скрыт — форма корректно ограничивает до 4 фото
      console.log('[test] ✓ После 4 фото кнопка добавления скрыта — лимит соблюдён');
    }

    // Форма с 4 фото работает: заполняем и отправляем
    await form.locator('textarea.review-input').fill(REVIEW_TEXT);
    await form.locator('input[name="fio"]').fill(TEST_NAME);
    await form.locator('input[name="phone"]').click();
    await page.keyboard.type(TEST_PHONE);
    const checkbox = form.locator('input[name="agreeCheckbox"]');
    if (!await checkbox.isChecked()) await checkbox.check();

    await page.waitForFunction(
      () => { const btn = document.querySelector('button.send-review-button'); return btn && !btn.disabled; },
      { timeout: 120000 }
    );
    console.log('[test] ✓ Кнопка отправки стала активной');

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
    if (!found) throw new Error(`Отзыв не найден на странице ${REVIEWS_PAGE}`);
    console.log('[test] ✓ Отзыв виден на странице /otzyvy');

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
