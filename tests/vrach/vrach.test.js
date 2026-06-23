import { test, expect } from '@playwright/test';
import { BASE_URL } from '../helpers/config.js';

async function gotoDoctor25(page) {
  await page.goto(BASE_URL + '/vrachi', { waitUntil: 'load' });
  try { await page.getByRole('button', { name: /принять/i }).click({ timeout: 3000 }); } catch {}

  let count = await page.evaluate(() => document.querySelectorAll('.doctor-info-container').length);
  while (count < 25) {
    const btn = page.locator('button.more-button').first();
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await page.waitForTimeout(2000);
    const newCount = await page.evaluate(() => document.querySelectorAll('.doctor-info-container').length);
    if (newCount === count) break;
    count = newCount;
  }
  expect(count, 'Должно быть не менее 25 карточек врачей').toBeGreaterThanOrEqual(25);

  const doctorHref = await page.evaluate(() => {
    const containers = [...document.querySelectorAll('.doctor-info-container')];
    return containers[24]?.querySelector('a[href*="/vrach/"]')?.href;
  });
  expect(doctorHref, '25-я карточка должна содержать ссылку на страницу врача').toBeTruthy();

  await page.goto(doctorHref, { waitUntil: 'load' });
  await page.waitForTimeout(1000);
}

test('Личная страница врача — блок информации: ФИО, специальности, стаж, возраст приёма, счётчик отзывов, работа с беременными', async ({ page }) => {
  test.setTimeout(120000);
  await gotoDoctor25(page);

  // Информационный блок присутствует под блоком с фото
  await expect(page.locator('.single-doctor__info').first()).toBeVisible({ timeout: 10000 });

  // ФИО врача
  const nameEl = page.locator('h1.single-doctor-full-name').first();
  await expect(nameEl).toBeVisible({ timeout: 5000 });
  const doctorName = (await nameEl.textContent()).trim();
  expect(doctorName.length, 'ФИО врача не должно быть пустым').toBeGreaterThan(0);
  console.log('[test] Врач:', doctorName);

  // Специальности видны
  const specialsEl = page.locator('.doctor__top__info__desc_specials .specials').first();
  await expect(specialsEl).toBeVisible({ timeout: 5000 });
  const specialsText = (await specialsEl.textContent()).trim();
  expect(specialsText.length, 'Список специальностей не должен быть пустым').toBeGreaterThan(0);

  // Кнопка «еще N» — если у врача больше 3 специальностей
  const etcEl = page.locator('.doctor__top__info__desc_specials span.main-color').first();
  if (await etcEl.isVisible()) {
    const etcText = (await etcEl.textContent()).trim();
    expect(etcText).toMatch(/еще\s*\d+/i);
    console.log('[test] Скрытые специальности:', etcText);
  }

  // Блок стаж / возраст приёма / счётчик отзывов
  await expect(page.locator('.experience-container').first()).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.experience-container .table-el').filter({ hasText: /стаж/i }).first()).toBeVisible();
  await expect(page.locator('.experience-container .table-el').filter({ hasText: /принимает/i }).first()).toBeVisible();
  // Счётчик отзывов присутствует только если у врача есть отзывы
  const reviewsTableEl = page.locator('.experience-container .table-el').filter({ hasText: /отзыв/i }).first();
  if (await reviewsTableEl.isVisible()) {
    await expect(reviewsTableEl).toBeVisible();
    console.log('[test] ✓ Счётчик отзывов присутствует');
  } else {
    console.log('[test] Счётчик отзывов — отсутствует (у врача нет отзывов)');
  }

  // «Работает с беременными» — только если присутствует у данного врача
  // .text-top-page отличает главный блок от карточек других врачей внизу страницы
  const pregEl = page.locator('.experience-bottom.text-top-page').filter({ hasText: /беременн/i });
  if (await pregEl.isVisible()) {
    await expect(pregEl).toBeVisible();
    console.log('[test] ✓ Работает с беременными — присутствует');
  } else {
    console.log('[test] Работает с беременными — отсутствует (врач не работает)');
  }
});

test('Личная страница врача — счётчик отзывов: клик переводит по якорю на раздел «Отзывы»', async ({ page }) => {
  test.setTimeout(120000);
  await gotoDoctor25(page);

  // Счётчик отзывов содержит a[href="#reviews"] только если у врача есть отзывы
  const reviewLink = page.locator('.experience-container a[href="#reviews"]').first();
  if (!await reviewLink.isVisible()) {
    console.log('[test] У врача нет отзывов — ссылка #reviews отсутствует, проверка пропущена');
    return;
  }

  await reviewLink.click();
  await page.waitForTimeout(1000);

  // URL получает якорь #reviews
  expect(page.url(), 'URL должен содержать #reviews').toContain('#reviews');

  // Секция отзывов прокрутилась в область видимости
  await expect(page.locator('div#reviews').first()).toBeVisible({ timeout: 5000 });
  console.log('[test] ✓ Переход по якорю #reviews выполнен');
});

test('Личная страница врача — блок наград, должности, научного звания, категории', async ({ page }) => {
  test.setTimeout(120000);
  await gotoDoctor25(page);

  const mainInfoBlock = page.locator('.single-doctor__main-info').first();

  if (!await mainInfoBlock.isVisible()) {
    console.log('[test] Блок наград/должности отсутствует у данного врача, проверка пропущена');
    return;
  }
  await expect(mainInfoBlock).toBeVisible();

  const items = mainInfoBlock.locator('.single-doctor__main-info__item');
  const itemCount = await items.count();
  expect(itemCount, 'Хотя бы один элемент в блоке').toBeGreaterThan(0);

  // Проверяем каждый непустой элемент (пустые — Vue-плейсхолдеры без контента)
  for (let i = 0; i < itemCount; i++) {
    const item = items.nth(i);
    const titleEl = item.locator('.text-semibold').first();
    if (!await titleEl.isVisible()) continue;

    const titleText = (await titleEl.textContent()).trim();
    expect(titleText.length, `Заголовок элемента #${i + 1} не должен быть пустым`).toBeGreaterThan(0);

    // Аннотация (описание / источник награды) — непустая
    const annotationEl = item.locator('.annotation').first();
    if (await annotationEl.isVisible()) {
      const annText = (await annotationEl.textContent()).trim();
      expect(annText.length, `Аннотация "${titleText}" не должна быть пустой`).toBeGreaterThan(0);
    }

    // Определяем тип для лога
    const hasAwardImg = await item.locator('.award-img').count() > 0;
    if (hasAwardImg) {
      console.log(`[test] Награда: "${titleText}"`);
    } else {
      const imgSrc = await item.locator('img').first().getAttribute('src') ?? '';
      const type = /kandnauk|docnauk/i.test(imgSrc) ? 'Научное звание'
        : /vysshei|pervoi|vtoroi/i.test(imgSrc) ? 'Категория'
        : 'Должность';
      console.log(`[test] ${type}: "${titleText}"`);
    }
  }

  // Награда — item с .pointer, содержит div.award-img
  const awardItems = mainInfoBlock.locator('.single-doctor__main-info__item.pointer');
  if (await awardItems.count() > 0) {
    await expect(awardItems.first().locator('.text-semibold').first()).toBeVisible();
    await expect(awardItems.first().locator('.annotation').first()).toBeVisible();
    console.log('[test] ✓ Награда проверена');
  }

  // Должность — img с ved / expert / nauchruk
  const positionItems = mainInfoBlock.locator(
    '.single-doctor__main-info__item:has(img[src*="ved"]), ' +
    '.single-doctor__main-info__item:has(img[src*="expert"]), ' +
    '.single-doctor__main-info__item:has(img[src*="nauchruk"])'
  );
  if (await positionItems.count() > 0) {
    await expect(positionItems.first().locator('.text-semibold').first()).toBeVisible();
    console.log('[test] ✓ Должность проверена');
  }

  // Научное звание — img с kandnauk / docnauk
  const rankItems = mainInfoBlock.locator(
    '.single-doctor__main-info__item:has(img[src*="kandnauk"]), ' +
    '.single-doctor__main-info__item:has(img[src*="docnauk"])'
  );
  if (await rankItems.count() > 0) {
    await expect(rankItems.first().locator('.text-semibold').first()).toBeVisible();
    console.log('[test] ✓ Научное звание проверено');
  }

  // Категория — img с vysshei / pervoi / vtoroi
  const categoryItems = mainInfoBlock.locator(
    '.single-doctor__main-info__item:has(img[src*="vysshei"]), ' +
    '.single-doctor__main-info__item:has(img[src*="pervoi"]), ' +
    '.single-doctor__main-info__item:has(img[src*="vtoroi"])'
  );
  if (await categoryItems.count() > 0) {
    await expect(categoryItems.first().locator('.text-semibold').first()).toBeVisible();
    console.log('[test] ✓ Категория проверена');
  }
});

test('Личная страница врача — кнопка «еще»: клик раскрывает дополнительные специальности', async ({ page }) => {
  test.setTimeout(120000);
  await gotoDoctor25(page);

  const etcEl = page.locator('.doctor__top__info__desc_specials span.main-color').first();
  if (!await etcEl.isVisible()) {
    console.log('[test] У врача не более 3 специальностей — кнопка «еще» отсутствует, проверка пропущена');
    return;
  }

  const etcText = (await etcEl.textContent()).trim();
  expect(etcText, 'Кнопка должна содержать «еще N»').toMatch(/еще\s*\d+/i);
  console.log('[test] Кнопка:', etcText);

  // Кликаем «еще N»
  await etcEl.click();
  await page.waitForTimeout(500);

  // Кнопка «еще» исчезает
  await expect(etcEl).not.toBeVisible({ timeout: 3000 });

  // Появляется второй span.specials с дополнительными специальностями
  const extraSpecials = page.locator('.doctor__top__info__desc_specials span.specials').nth(1);
  await expect(extraSpecials).toBeVisible({ timeout: 3000 });
  const extraText = (await extraSpecials.textContent()).trim();
  expect(extraText.length, 'Дополнительные специальности не должны быть пустыми').toBeGreaterThan(0);
  console.log('[test] ✓ Раскрытые специальности:', extraText.slice(0, 80));
});
