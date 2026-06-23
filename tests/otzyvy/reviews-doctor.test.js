import { test, expect } from '@playwright/test';
import { checkReviewInAdminWithDoctor } from '../helpers/admin.js';
import { BASE_URL } from '../helpers/config.js';

const TEST_NAME    = 'Тест Тестов';
const TEST_PHONE   = '4444444444';
const VRACHI_PAGE  = BASE_URL + '/vrachi';
const REVIEWS_PAGE = BASE_URL + '/otzyvy';
const REVIEW_TEXT  = 'Проверка отправки отзыва с личной страницы врача – автотестирование';
const REVIEW_SNIPPET = 'личной страницы врача';

async function acceptCookies(page) {
  const cookieBtn = page.getByRole('button', { name: /принять/i });
  try { await cookieBtn.waitFor({ state: 'visible', timeout: 5000 }); await cookieBtn.click(); } catch {}
}

// Находит строку в таблице отзывов, содержащую REVIEW_SNIPPET и doctorName.
// Выводит диагностику кнопок в строке.
async function findReviewRow(page, doctorName) {
  const info = await page.evaluate(({ snippet, doctor }) => {
    const rows = [...document.querySelectorAll('tr')];
    const idx = rows.findIndex(r => {
      const text = r.innerText || '';
      return text.includes(snippet) && text.includes(doctor);
    });
    if (idx < 0) return { idx: -1 };

    const row = rows[idx];
    const buttons   = [...row.querySelectorAll('button')];
    const checkboxes = [...row.querySelectorAll('input[type="checkbox"]')];
    return {
      idx,
      buttonCount:   buttons.length,
      checkboxCount: checkboxes.length,
      buttons:   buttons.map(b => ({ text: b.textContent?.trim().slice(0, 40), class: b.className.slice(0, 80) })),
      checkboxes: checkboxes.map(cb => ({ checked: cb.checked, class: cb.className.slice(0, 80) })),
    };
  }, { snippet: REVIEW_SNIPPET, doctor: doctorName });

  console.log('[admin] Строка с отзывом:', JSON.stringify(info, null, 2));
  if (info.idx < 0) throw new Error(`Строка с отзывом "${REVIEW_SNIPPET}" + врач "${doctorName}" не найдена`);
  return info;
}

async function publishReview(page, doctorName) {
  await page.getByRole('link', { name: 'Отзывы' }).click();
  await page.waitForFunction(
    () => [...document.querySelectorAll('th')].some(th => th.textContent.trim() === 'Отзыв'),
    { timeout: 15000 }
  );
  await page.waitForTimeout(500);

  const info = await findReviewRow(page, doctorName);

  const published = await page.evaluate((rowIdx) => {
    const row = document.querySelectorAll('tr')[rowIdx];
    if (!row) return false;
    const cb = row.querySelector('input[type="checkbox"]');
    if (cb) { if (!cb.checked) cb.click(); return true; }
    const buttons = [...row.querySelectorAll('button')];
    if (buttons.length > 0) { buttons[0].click(); return true; }
    return false;
  }, info.idx);

  if (!published) throw new Error('Не удалось найти кнопку публикации в строке отзыва');
  await page.waitForTimeout(1500);
  console.log('[admin] ✓ Кнопка публикации нажата');
}

// Проверяет видимость отзыва на странице врача:
// переходит на /akczii через шапку, возвращается назад, проверяет текст.
async function checkOnDoctorPage(page, doctorHref) {
  console.log('[test] Проверяю отзыв на странице врача...');
  await page.goto(doctorHref, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.getByRole('link', { name: /акции/i }).first().click();
  await page.waitForURL('**/akczii**', { timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  console.log('[test] Вернулся на страницу врача через кнопку «Назад»');

  // Прокручиваем до секции отзывов и проверяем
  await page.getByText('Новые').first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);

  const found = await page.evaluate(
    (reviewText) => document.body.innerText.includes(reviewText),
    REVIEW_TEXT
  );
  if (!found) throw new Error(`Отзыв не найден на странице врача: ${doctorHref}`);
  console.log('[test] ✓ Отзыв виден на личной странице врача');
}

// Проверяет видимость отзыва на общей странице /otzyvy:
// Акции в шапке → Назад → прокрутка к фильтрам → проверка текста.
async function checkOnReviewsPage(page) {
  console.log('[test] Проверяю отзыв на странице /otzyvy...');
  await page.goto(REVIEWS_PAGE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.getByRole('link', { name: /акции/i }).first().click();
  await page.waitForURL('**/akczii**', { timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  console.log('[test] Вернулся на /otzyvy через кнопку «Назад»');

  await page.getByText('Новые').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  const found = await page.evaluate(
    (reviewText) => document.body.innerText.includes(reviewText),
    REVIEW_TEXT
  );
  if (!found) throw new Error(`Отзыв не найден на странице ${REVIEWS_PAGE}`);
  console.log('[test] ✓ Отзыв виден на общей странице /otzyvy');
}

async function deleteReview(page, doctorName) {
  await page.goto('https://eastclinic.ru/nimda-panel/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.getByRole('link', { name: 'Отзывы' }).click();
  await page.waitForFunction(
    () => [...document.querySelectorAll('th')].some(th => th.textContent.trim() === 'Отзыв'),
    { timeout: 15000 }
  );
  await page.waitForTimeout(500);

  const info = await findReviewRow(page, doctorName);

  // Убеждаемся, что текст строки совпадает с тестовым отзывом
  const rowText = await page.evaluate(
    (idx) => document.querySelectorAll('tr')[idx]?.innerText || '',
    info.idx
  );
  if (!rowText.includes(REVIEW_TEXT)) {
    throw new Error('Текст в строке не совпадает с тестовым отзывом — удаление отменено');
  }

  // Регистрируем обработчик нативного диалога «Подтвердить действие на eastclinic.ru»
  page.on('dialog', async dialog => {
    console.log('[dialog] Подтверждаю:', dialog.message().slice(0, 80));
    await dialog.accept();
  });

  // Кнопка Карандаш — первая кнопка в строке
  await page.evaluate((rowIdx) => {
    const row = document.querySelectorAll('tr')[rowIdx];
    const buttons = [...row.querySelectorAll('button')];
    buttons[0].click();
  }, info.idx);

  // Ждём PrimeVue-диалог редактирования
  await page.locator('[class*="p-dialog"]').first().waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(1000);
  console.log('[admin] Окно редактирования отзыва открылось');

  // Прокручиваем модал колёсиком мыши вниз — кнопка «Удалить» внизу справа
  const modal = page.locator('[class*="p-dialog"]').first();
  await modal.hover();
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(600);

  // Нажимаем «Удалить»
  await page.getByRole('button', { name: /удалить/i }).waitFor({ state: 'visible', timeout: 5000 });
  await page.getByRole('button', { name: /удалить/i }).click();
  console.log('[admin] Нажал «Удалить»');

  // В окне «Удалить отзыв» нажимаем «Принять»
  await page.getByRole('button', { name: /принять/i }).waitFor({ state: 'visible', timeout: 5000 });
  await page.getByRole('button', { name: /принять/i }).click();
  console.log('[admin] ✓ Тестовый отзыв удалён');

  await page.waitForTimeout(1500);
}

// --- Тест ---

test('Форма отзыва с личной страницы врача — заполняется, отправляется, публикуется и удаляется', async ({ page }) => {
  test.setTimeout(360000);

  // 1. Открываем список врачей
  await page.goto(VRACHI_PAGE);
  await page.waitForLoadState('networkidle');
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
  await page.goto(doctorHref, { waitUntil: 'networkidle', timeout: 30000 });

  // 6. Читаем ФИО врача — нужно для поиска строки в таблице администратора
  const doctorName = (await page.locator('h1').first().textContent()).trim();
  console.log('[test] Врач:', doctorName);

  // 7. Открываем форму отзыва
  const reviewBtn = page.locator('button.total-reviews-button');
  await reviewBtn.scrollIntoViewIfNeeded();
  await reviewBtn.click();
  await page.locator('.reviews-form-container').waitFor({ state: 'visible', timeout: 8000 });

  // 8. Заполняем форму (3 звезды)
  const form = page.locator('.reviews-form-container');
  await form.locator('div.stars svg.star').nth(2).click();
  await form.locator('textarea.review-input').fill(REVIEW_TEXT);
  await form.locator('input[name="fio"]').fill(TEST_NAME);
  await form.locator('input[name="phone"]').click();
  await page.keyboard.type(TEST_PHONE);
  const checkbox = form.locator('input[name="agreeCheckbox"]');
  if (!await checkbox.isChecked()) await checkbox.check();
  await form.locator('button.send-review-button').click();

  // 9. Форма скрывается после успешной отправки
  await expect(page.locator('.reviews-form-container')).not.toBeVisible({ timeout: 10000 });
  console.log('[test] ✓ Отзыв отправлен');

  // 10. Ждём появления отзыва в панели администратора
  // Отзывы с dev1 попадают в ту же базу что и prod — проверка и удаление нужны всегда.
  await checkReviewInAdminWithDoctor(page, REVIEW_SNIPPET, doctorName);
  console.log('[test] ✓ Отзыв найден в панели администратора');

  // 11–13. Публикуем и проверяем на публичных страницах
  await publishReview(page, doctorName);
  await checkOnDoctorPage(page, doctorHref);
  await checkOnReviewsPage(page);

  // 14. Удаляем тестовый отзыв
  await deleteReview(page, doctorName);
  console.log('[test] ✓ Тестовый отзыв удалён');
});
