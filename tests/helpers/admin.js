import 'dotenv/config';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASS = process.env.ADMIN_PASS;

async function goToReviews(page) {
  await page.getByRole('link', { name: 'Отзывы' }).click();
  await page.waitForFunction(
    () => [...document.querySelectorAll('th')].some(th => th.textContent.trim() === 'Отзыв'),
    { timeout: 15000 }
  );
  await page.waitForTimeout(500);
}

async function loginToAdmin(page) {
  await page.goto('https://eastclinic.ru/nimda-panel/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const passInput = page.locator('input[type="password"]');
  if (await passInput.isVisible()) {
    await page.locator('input[type="email"], input[type="text"]').first().fill(ADMIN_EMAIL);
    await passInput.fill(ADMIN_PASS);
    await page.getByRole('button', { name: /войти/i }).click();
    await page.waitForURL('**/nimda-panel/**', { timeout: 15000 });
    await page.waitForTimeout(1500);
  }

  await goToReviews(page);
}

// Возвращает индекс строки в таблице отзывов, содержащей searchSnippet (и doctorName, если указан).
async function findReviewRowIndex(page, searchSnippet, doctorName) {
  return page.evaluate(({ snippet, doctor }) => {
    const rows = [...document.querySelectorAll('tr')];
    return rows.findIndex(row => {
      const text = row.innerText || '';
      return text.includes(snippet) && (!doctor || text.includes(doctor));
    });
  }, { snippet: searchSnippet, doctor: doctorName || null });
}

export async function checkReviewInAdmin(page, searchSnippet, timeoutMs = 60000) {
  await loginToAdmin(page);

  const deadline = Date.now() + timeoutMs;
  while (true) {
    const found = await page.evaluate(
      (snippet) => document.body.innerText.includes(snippet),
      searchSnippet
    );
    if (found) return;

    if (Date.now() >= deadline) break;
    await page.waitForTimeout(5000);
    await goToReviews(page);
  }

  throw new Error(`Отзыв "${searchSnippet}" не найден в панели администратора за ${timeoutMs / 1000}с`);
}

export async function checkReviewInAdminWithDoctor(page, searchSnippet, doctorName, timeoutMs = 60000) {
  await loginToAdmin(page);

  const deadline = Date.now() + timeoutMs;
  while (true) {
    const found = await page.evaluate(
      ({ snippet, doctor }) => {
        const rows = [...document.querySelectorAll('tr')];
        return rows.some(row => {
          const text = row.innerText || '';
          return text.includes(snippet) && text.includes(doctor);
        });
      },
      { snippet: searchSnippet, doctor: doctorName }
    );
    if (found) return;

    if (Date.now() >= deadline) break;
    await page.waitForTimeout(5000);
    await goToReviews(page);
  }

  throw new Error(
    `Отзыв "${searchSnippet}" с врачом "${doctorName}" не найден в панели администратора за ${timeoutMs / 1000}с`
  );
}

// Публикует отзыв в админ-панели: находит строку и включает кнопку публикации (становится зелёной).
// Вызывать после checkReviewInAdmin / checkReviewInAdminWithDoctor — мы уже в разделе Отзывы.
export async function publishReviewInAdmin(page, searchSnippet, doctorName = null) {
  await goToReviews(page);

  const idx = await findReviewRowIndex(page, searchSnippet, doctorName);
  if (idx < 0) throw new Error(`Строка с отзывом "${searchSnippet}" не найдена для публикации`);

  const row = page.locator('tr').nth(idx);

  // Кнопка публикации — переключатель справа от даты публикации.
  // Сначала пробуем чекбокс (многие SPA-админки используют hidden-checkbox под стилизованным тоглом).
  const toggleCheckbox = row.locator('input[type="checkbox"]');
  if (await toggleCheckbox.count() > 0) {
    if (!await toggleCheckbox.first().isChecked()) {
      await toggleCheckbox.first().check();
    }
  } else {
    // Если чекбокса нет — первая кнопка в строке (предположительно тогл публикации)
    await row.locator('button').first().click();
  }

  await page.waitForTimeout(1000);
}

// Удаляет тестовый отзыв из админ-панели: Карандаш → Удалить → Принять.
// Вызывать после всех проверок, чтобы не оставлять мусор в базе.
export async function deleteReviewInAdmin(page, searchSnippet, doctorName = null) {
  // loginToAdmin обеспечивает попадание на панель администратора
  // и при необходимости повторно логинится (сессия могла истечь за время теста с видео)
  await loginToAdmin(page);
  // После loginToAdmin мы уже в разделе Отзывы

  const idx = await findReviewRowIndex(page, searchSnippet, doctorName);
  if (idx < 0) throw new Error(`Строка с отзывом "${searchSnippet}" не найдена для удаления`);

  page.on('dialog', async dialog => dialog.accept());

  // Кнопка Карандаш (первая кнопка в строке) — открывает модал редактирования
  await page.evaluate((rowIdx) => {
    const row = document.querySelectorAll('tr')[rowIdx];
    const buttons = [...row.querySelectorAll('button')];
    if (buttons[0]) buttons[0].click();
  }, idx);

  // Ждём PrimeVue-диалога редактирования
  await page.locator('[class*="p-dialog"]').first().waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(1000);

  // Прокручиваем модал вниз — кнопка «Удалить» внизу справа
  const modal = page.locator('[class*="modal"], [role="dialog"]').first();
  await modal.hover();
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(600);

  // Нажимаем «Удалить»
  await page.getByRole('button', { name: /удалить/i }).waitFor({ state: 'visible', timeout: 5000 });
  await page.getByRole('button', { name: /удалить/i }).click();

  // Подтверждаем «Принять»
  await page.getByRole('button', { name: /принять/i }).waitFor({ state: 'visible', timeout: 5000 });
  await page.getByRole('button', { name: /принять/i }).click();

  await page.waitForTimeout(1500);
}

// Проверяет, что текст отзыва виден на публичной странице сайта.
// Делает несколько попыток с паузой — опубликованный отзыв может появиться с задержкой.
export async function checkReviewOnPage(page, reviewText, pageUrl, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    const found = await page.evaluate(text => document.body.innerText.includes(text), reviewText);
    if (found) return;
    if (Date.now() >= deadline) break;
    await page.waitForTimeout(5000);
  }
  throw new Error(`Отзыв не найден на странице ${pageUrl} за ${timeoutMs / 1000}с`);
}
