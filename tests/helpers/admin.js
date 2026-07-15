import 'dotenv/config';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASS = process.env.ADMIN_PASS;
const ADMIN_URL = process.env.TEST_ADMIN_URL || 'https://eastclinic.ru/nimda-panel/';

async function goToReviews(page) {
  await page.locator('a[href*="reviews"]').first().click();
  await page.waitForFunction(
    () => [...document.querySelectorAll('th')].some(th => th.textContent.trim() === 'Отзыв'),
    { timeout: 15000 }
  );
  await page.waitForTimeout(500);
}

// Переключает фильтр таблицы на «Все» — иначе опубликованный отзыв пропадает из дефолтного вида.
// Тихо ничего не делает, если кнопки нет.
async function showAllReviews(page) {
  const btn = page.locator('button, [role="tab"]').filter({ hasText: /^Все$/ }).first();
  if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(500);
  }
}

async function loginToAdmin(page) {
  await page.goto(ADMIN_URL);
  await page.waitForLoadState('domcontentloaded');
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
// Перебирает все страницы пагинатора, если строка не найдена на текущей.
async function findReviewRowIndex(page, searchSnippet, doctorName) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const idx = await page.evaluate(({ snippet, doctor }) => {
      const rows = [...document.querySelectorAll('tr')];
      return rows.findIndex(row => {
        const text = row.innerText || '';
        return text.includes(snippet) && (!doctor || text.includes(doctor));
      });
    }, { snippet: searchSnippet, doctor: doctorName || null });

    if (idx >= 0) return idx;

    // Не найдено — проверяем есть ли активная кнопка «следующая страница»
    const nextBtn = page.locator('.p-paginator-next, [aria-label="Next Page"]').first();
    const disabled = await nextBtn.evaluate(
      el => el.disabled || el.classList.contains('p-disabled')
    ).catch(() => true);
    if (disabled) break;

    await nextBtn.click();
    await page.waitForTimeout(800);
  }
  return -1;
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

// Публикует отзыв в админ-панели: находит строку и включает тогл публикации.
// Вызывать после checkReviewInAdmin / checkReviewInAdminWithDoctor — мы уже в разделе Отзывы.
export async function publishReviewInAdmin(page, searchSnippet, doctorName = null) {
  await goToReviews(page);

  const idx = await findReviewRowIndex(page, searchSnippet, doctorName);
  if (idx < 0) throw new Error(`Строка с отзывом "${searchSnippet}" не найдена для публикации`);

  // Проверяем текущее состояние — последний чекбокс в строке всегда тогл публикации.
  // Если уже опубликован — не трогаем (иначе отключим публикацию).
  const alreadyPublished = await page.evaluate((rowIdx) => {
    const row = document.querySelectorAll('tr')[rowIdx];
    if (!row) return false;
    const cbs = [...row.querySelectorAll('input[type="checkbox"]')];
    return cbs.length > 0 && cbs[cbs.length - 1].checked;
  }, idx);

  if (alreadyPublished) return;

  // PrimeVue InputSwitch/ToggleSwitch рендерится как role="switch".
  // Используем Playwright click — он правильно bubbles события для Vue-реактивности.
  const row = page.locator('tr').nth(idx);
  const switches = row.getByRole('switch');
  if (await switches.count() > 0) {
    await switches.last().click({ force: true });
  } else {
    // Fallback: кликаем последний чекбокс через DOM
    await page.evaluate((rowIdx) => {
      const row = document.querySelectorAll('tr')[rowIdx];
      const cbs = [...row.querySelectorAll('input[type="checkbox"]')];
      if (cbs.length > 0 && !cbs[cbs.length - 1].checked) cbs[cbs.length - 1].click();
    }, idx);
  }

  await page.waitForTimeout(1500);
}

// Проверяет, включён ли тогл публикации у отзыва в таблице.
// Возвращает true если последний чекбокс в строке отмечен (= отзыв опубликован).
export async function isReviewPublishedInAdmin(page, searchSnippet, doctorName = null) {
  await loginToAdmin(page);
  await showAllReviews(page);
  const idx = await findReviewRowIndex(page, searchSnippet, doctorName);
  if (idx < 0) return false;
  return page.evaluate((rowIdx) => {
    const row = document.querySelectorAll('tr')[rowIdx];
    if (!row) return false;
    const checkboxes = [...row.querySelectorAll('input[type="checkbox"]')];
    if (checkboxes.length === 0) return false;
    // Последний чекбокс в строке — всегда тогл публикации
    // (у видео-отзывов первый = флаг видео, последний = публикация)
    return checkboxes[checkboxes.length - 1].checked;
  }, idx);
}

// Удаляет тестовый отзыв из админ-панели: Карандаш → Удалить → Принять.
// Вызывать после всех проверок, чтобы не оставлять мусор в базе.
// Если удаление не удалось — выбрасывает ошибку (вызывающий код решает, падать или предупреждать).
export async function deleteReviewInAdmin(page, searchSnippet, doctorName = null) {
  async function attempt() {
    await loginToAdmin(page);
    await showAllReviews(page);

    const idx = await findReviewRowIndex(page, searchSnippet, doctorName);
    if (idx < 0) throw new Error(`Строка с отзывом "${searchSnippet}" не найдена для удаления`);

    page.on('dialog', async dialog => dialog.accept());

    await page.evaluate((rowIdx) => {
      const row = document.querySelectorAll('tr')[rowIdx];
      const buttons = [...row.querySelectorAll('button')];
      if (buttons[0]) buttons[0].click();
    }, idx);

    await page.locator('[class*="p-dialog"]').first().waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(1000);

    const modal = page.locator('[class*="modal"], [role="dialog"]').first();
    await modal.hover();
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(600);

    await page.getByRole('button', { name: /удалить/i }).waitFor({ state: 'visible', timeout: 5000 });
    await page.getByRole('button', { name: /удалить/i }).click();

    await page.getByRole('button', { name: /принять/i }).waitFor({ state: 'visible', timeout: 5000 });
    await page.getByRole('button', { name: /принять/i }).click();

    await page.waitForTimeout(1500);
  }

  try {
    await attempt();
  } catch (e) {
    // Первая попытка не удалась — ждём 5 с и пробуем ещё раз
    console.warn(`[admin] Первая попытка удаления не удалась (${e.message}), повтор через 5 с...`);
    await page.waitForTimeout(5000);
    await attempt();
  }
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
