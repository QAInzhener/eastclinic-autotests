import { test, expect } from '@playwright/test';
import { checkReviewInAdmin } from '../helpers/admin.js';
import { BASE_URL } from '../helpers/config.js';

const TEST_NAME = 'Тест Тестов';
const TEST_PHONE = '4444444444'; // +7 (444) 444-44-44
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
  await page.waitForLoadState('networkidle');
  await acceptCookies(page);

  const writeReviewBtn = page.locator('button.total-reviews-button');
  await writeReviewBtn.waitFor({ state: 'visible', timeout: 8000 });
  await writeReviewBtn.scrollIntoViewIfNeeded();
  await writeReviewBtn.click();

  await page.locator('.reviews-form-container').waitFor({ state: 'visible', timeout: 8000 });
}

// --- Форма: Написать отзыв (страница /otzyvy) ---

test('Форма "Написать отзыв" — открывается', async ({ page }) => {
  await openReviewModal(page);
  await expect(page.getByText('Как вам приём у врача?')).toBeVisible();
  await expect(page.locator('textarea.review-input')).toBeVisible();
});

test('Форма "Написать отзыв" — заполняется, отправляется, публикуется и отображается на странице отзывов', async ({ page }) => {
  test.setTimeout(360000);

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

  await expect(page.locator('.reviews-form-container')).not.toBeVisible({ timeout: 10000 });
  console.log('[test] ✓ Отзыв отправлен');

  // 2. Ждём появления отзыва в панели администратора
  // Отзывы с dev1 попадают в ту же базу что и prod — проверка и удаление нужны всегда.
  await checkReviewInAdmin(page, REVIEW_SNIPPET);
  console.log('[test] ✓ Отзыв найден в панели администратора');

  // 3. Публикуем и проверяем на публичной странице
  await publishAndVerify(page);

  // 4. Удаляем тестовый отзыв
  await deleteTestReview(page);
  console.log('[test] ✓ Тестовый отзыв удалён');
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

  // Включаем кнопку публикации (справа от даты — переключатель, зеленеет при включении).
  // Если в строке есть чекбокс — это и есть тогл; иначе берём первую кнопку.
  const published = await page.evaluate((rowIdx) => {
    const row = document.querySelectorAll('tr')[rowIdx];
    if (!row) return false;

    // Попытка 1: чекбокс-тогл
    const cb = row.querySelector('input[type="checkbox"]');
    if (cb) {
      if (!cb.checked) cb.click();
      return true;
    }

    // Попытка 2: кнопки в строке — публикация идёт до карандаша,
    // т.е. первая кнопка если их несколько, или единственная если одна
    const buttons = [...row.querySelectorAll('button')];
    if (buttons.length > 0) {
      buttons[0].click();
      return true;
    }

    return false;
  }, info.idx);

  if (!published) throw new Error('Не удалось найти кнопку публикации в строке отзыва');
  await page.waitForTimeout(1500);
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
  await page.waitForTimeout(1000);
  // Возвращаемся назад через кнопку браузера
  await page.goBack({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  console.log('[test] Вернулся на /otzyvy через кнопку «Назад»');

  // Прокручиваем к фильтрам «Новые» / «Со всех площадок» — они идут сразу над списком отзывов
  await page.getByText('Новые').first().scrollIntoViewIfNeeded();
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

async function deleteTestReview(page) {
  // Возвращаемся в раздел Отзывы в панели администратора
  await page.goto('https://eastclinic.ru/nimda-panel/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.getByRole('link', { name: 'Отзывы' }).click();
  await page.waitForFunction(
    () => [...document.querySelectorAll('th')].some(th => th.textContent.trim() === 'Отзыв'),
    { timeout: 15000 }
  );
  await page.waitForTimeout(500);

  const info = await findReviewRow(page);

  // Убеждаемся, что текст в строке совпадает с тестовым отзывом — удалять можно только его
  const rowText = await page.evaluate(
    (idx) => document.querySelectorAll('tr')[idx]?.innerText || '',
    info.idx
  );
  if (!rowText.includes(REVIEW_TEXT)) {
    throw new Error('Текст в найденной строке не совпадает с тестовым отзывом — удаление отменено');
  }

  // Регистрируем обработчик нативного диалога «Подтвердить действие на eastclinic.ru»
  page.on('dialog', async dialog => {
    console.log('[dialog] Подтверждаю:', dialog.message().slice(0, 80));
    await dialog.accept();
  });

  // Нажимаем кнопку Карандаш (первая кнопка в строке) — открывает «Редактирование отзыва»
  await page.evaluate((rowIdx) => {
    const row = document.querySelectorAll('tr')[rowIdx];
    const buttons = [...row.querySelectorAll('button')];
    buttons[0].click();
  }, info.idx);

  // Ждём открытия PrimeVue-диалога (в этой админке называется «Создание нового отзыва»)
  await page.locator('[class*="p-dialog"]').first().waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(1000); // даём форме загрузить данные отзыва
  console.log('[admin] Окно редактирования отзыва открылось');

  // Прокручиваем содержимое модала колёсиком мыши вниз — кнопка «Удалить» внизу справа
  const modal = page.locator('[class*="modal"], [role="dialog"]').first();
  await modal.hover();
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(600);

  // Нажимаем кнопку «Удалить» (внизу справа в модале редактирования)
  await page.getByRole('button', { name: /удалить/i }).waitFor({ state: 'visible', timeout: 5000 });
  await page.getByRole('button', { name: /удалить/i }).click();
  console.log('[admin] Нажал «Удалить»');

  // В окне «Удалить отзыв» нажимаем «Принять»
  await page.getByRole('button', { name: /принять/i }).waitFor({ state: 'visible', timeout: 5000 });
  await page.getByRole('button', { name: /принять/i }).click();
  console.log('[admin] ✓ Тестовый отзыв удалён');

  await page.waitForTimeout(1500);
}
