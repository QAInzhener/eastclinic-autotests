import { test, expect } from '@playwright/test';
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

const REVIEWS_PAGE = BASE_URL + '/otzyvy';

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
  test.setTimeout(180000);

  await openReviewModal(page);
  const form = page.locator('.reviews-form-container');

  // Выбираем 4 звезды
  await form.locator('div.stars svg.star').nth(3).click();

  // Загружаем 4 фото по одному
  for (let i = 0; i < PHOTOS_4.length; i++) {
    await uploadOnePhoto(page, form, PHOTOS_4[i].path, i + 1);
    console.log(`[test] ✓ Фото ${i + 1}/4 ${PHOTOS_4[i].label} загружено`);
  }

  // Ждём полного завершения загрузок на сервер
  await waitForUploadsComplete(page, 4);

  const countAfter4 = await form.locator('img[src]:not([src=""])').count();
  expect(countAfter4, 'Ожидается 4 превью после загрузки 4 фото').toBe(4);
  console.log('[test] ✓ 4 фото в форме');

  // Проверяем лимит: после 4 фото слот добавления должен скрыться
  const uploadSlot = form.locator('.media-item.image-item');
  await expect(uploadSlot.first(), 'После 4 фото кнопка добавления должна быть скрыта').not.toBeVisible({ timeout: 3000 });
  console.log('[test] ✓ После 4 фото кнопка добавления скрыта — лимит соблюдён');
});
