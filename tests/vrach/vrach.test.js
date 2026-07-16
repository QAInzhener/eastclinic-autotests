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
    await page.waitForTimeout(3000);
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

test('Личная страница врача — вертикальная галерея фотографий: позиция, hover, клик, иконка видео, шевроны', async ({ page }) => {
  test.setTimeout(120000);
  await gotoDoctor25(page);

  const gallery  = page.locator('.single-doctor__gallery').first();
  const backBtn  = page.locator('button.back-button').first();
  const thumbSel = '.desktop-carousel-container .carousel__slide';
  const thumbs   = gallery.locator(thumbSel);

  if (!await gallery.isVisible({ timeout: 3000 })) {
    console.log('[test] Галерея отсутствует — проверка пропущена');
    return;
  }

  // Галерея расположена ниже кнопки «Назад»
  if (await backBtn.isVisible()) {
    const backBottom  = await backBtn.evaluate(el => el.getBoundingClientRect().bottom);
    const galleryTop  = await gallery.evaluate(el => el.getBoundingClientRect().top);
    expect(galleryTop, 'Галерея должна быть ниже кнопки «Назад»').toBeGreaterThanOrEqual(backBottom);
    console.log('[test] ✓ Галерея расположена под кнопкой «Назад»');
  }

  let thumbCount = await thumbs.count();
  console.log(`[test] Фотографий в галерее: ${thumbCount}`);

  if (thumbCount === 0) {
    console.log('[test] Нет фотографий — проверка пропущена');
    return;
  }

  // Hover → синяя обводка
  await thumbs.first().hover();
  await page.waitForTimeout(300);
  const borderOnHover = await thumbs.first().evaluate(el => window.getComputedStyle(el).border);
  expect(borderOnHover, 'При наведении должна появиться синяя обводка').toContain('rgb(45, 127, 249)');
  console.log('[test] ✓ Hover → синяя обводка');

  // Клик на 2-й блок → он получает класс «active»
  if (thumbCount >= 2) {
    await thumbs.nth(1).click();
    await page.waitForTimeout(500);
    const secondIsActive = await thumbs.nth(1).evaluate(el => el.classList.contains('active'));
    expect(secondIsActive, '2-й блок должен стать активным после клика').toBe(true);
    console.log('[test] ✓ Клик на 2-й блок → демонстрируется в основном блоке');
    // Возвращаем к первому
    await thumbs.first().click();
    await page.waitForTimeout(300);
  }

  // Иконка видео (белый треугольник 16×16) — только в блоках с видео
  const playIcon = thumbs.first().locator('.single-doctor__gallery__playbutton svg').first();
  if (await playIcon.count() > 0) {
    expect(await playIcon.getAttribute('width'),  'Иконка видео: ширина 16px').toBe('16');
    expect(await playIcon.getAttribute('height'), 'Иконка видео: высота 16px').toBe('16');
    console.log('[test] ✓ Иконка видео 16×16 в первом блоке');
  } else {
    console.log('[test] Первый блок — фото (иконка видео отсутствует)');
  }

  const getSize = (loc) => loc.evaluate(el => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  const topChevron    = gallery.locator('.chevron-container').nth(0);
  const bottomChevron = gallery.locator('.chevron-container').nth(1);

  if (thumbCount <= 3) {
    // При 1–3 фото оба шеврона скрыты
    expect((await getSize(bottomChevron)).w, 'При ≤3 фото нижний шеврон скрыт').toBe(0);
    expect((await getSize(topChevron)).w,    'При ≤3 фото верхний шеврон скрыт').toBe(0);
    console.log('[test] ✓ 1–3 фото → шевроны скрыты');

    // Для проверки шевронов переходим к Шуваевой (≥4 фото)
    await page.goto('https://eastclinic.ru/vrach/shuvaeva-olga-borisovna-nevrolog', { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    thumbCount = await thumbs.count();
    console.log(`[test] Шуваева — фотографий: ${thumbCount}`);
  }

  if (thumbCount >= 4) {
    // Нижний шеврон видим, SVG внутри 24×24
    await expect(bottomChevron, 'Нижний шеврон должен быть виден при ≥4 фото').toBeVisible();
    const svgBot = await bottomChevron.locator('svg.nav-chevron').first().evaluate(el => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    expect(svgBot.w, 'Нижний шеврон SVG: ширина 24px').toBe(24);
    expect(svgBot.h, 'Нижний шеврон SVG: высота 24px').toBe(24);
    console.log('[test] ✓ Нижний шеврон 24×24 (≥4 фото)');

    // Верхний шеврон скрыт в начале
    expect((await getSize(topChevron)).w, 'В начале верхний шеврон должен быть скрыт').toBe(0);
    console.log('[test] ✓ Верхний шеврон скрыт в начале');

    // Прокрутка вниз → верхний шеврон появляется
    let topW = 0;
    for (let i = 0; i < 6 && topW === 0; i++) {
      if ((await getSize(bottomChevron)).w === 0) break;
      await bottomChevron.click();
      await page.waitForTimeout(600);
      topW = (await getSize(topChevron)).w;
    }
    expect(topW, 'После прокрутки вниз верхний шеврон должен появиться').toBeGreaterThan(0);
    const svgTop = await topChevron.locator('svg.nav-chevron').first().evaluate(el => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    expect(svgTop.w, 'Верхний шеврон SVG: ширина 24px').toBe(24);
    expect(svgTop.h, 'Верхний шеврон SVG: высота 24px').toBe(24);
    console.log('[test] ✓ Верхний шеврон 24×24 появился после прокрутки вниз');
  }
});

test('Личная страница врача — основной блок фото: размер, шевроны лево/право, прокрутка, синяя обводка в галерее, кнопка звука, таймер, иконка громкости, пагинация', async ({ page }) => {
  test.setTimeout(120000);
  await gotoDoctor25(page);

  const gallery = page.locator('.single-doctor__gallery').first();
  if (!await gallery.isVisible({ timeout: 3000 })) {
    console.log('[test] Галерея отсутствует — проверка пропущена');
    return;
  }

  // Если у врача нет видео в первом слайде, переходим к Шуваевой (≥4 фото, первый слайд — видео)
  const hasVideo = await gallery.locator('.single-doctor__gallery__footer-bar').first().isVisible().catch(() => false);
  if (!hasVideo) {
    await page.goto(BASE_URL + '/vrach/shuvaeva-olga-borisovna-nevrolog', { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    console.log('[test] Перешли к Шуваевой (первый слайд — видео)');
  }

  // --- 1. Основной блок: размер 523×523 ---
  const mainPhoto = gallery.locator('.single-doctor__gallery__main-photo').first();
  await expect(mainPhoto, 'Основной блок фото должен быть виден').toBeVisible({ timeout: 5000 });
  const mainSize = await mainPhoto.evaluate(el => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  expect(mainSize.w, 'Основной блок: ширина 523px').toBe(523);
  expect(mainSize.h, 'Основной блок: высота 523px').toBe(523);
  console.log(`[test] ✓ Основной блок: ${mainSize.w}×${mainSize.h}`);

  // --- 2. Шевроны влево / вправо: 32×32, SVG чёрного цвета ---
  const leftArrow  = gallery.locator('.single-doctor__gallery__back_arrow').first();
  const rightArrow = gallery.locator('.single-doctor__gallery__next_arrow').first();
  await expect(leftArrow,  'Шеврон влево должен быть виден').toBeVisible();
  await expect(rightArrow, 'Шеврон вправо должен быть виден').toBeVisible();

  const leftSize = await leftArrow.evaluate(el => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  expect(leftSize.w,  'Шеврон влево: ширина 32px').toBe(32);
  expect(leftSize.h,  'Шеврон влево: высота 32px').toBe(32);

  const rightSize = await rightArrow.evaluate(el => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  expect(rightSize.w, 'Шеврон вправо: ширина 32px').toBe(32);
  expect(rightSize.h, 'Шеврон вправо: высота 32px').toBe(32);

  // SVG внутри шеврона — чёрного цвета (#323232)
  const leftSvgFill = await leftArrow.locator('svg').first().getAttribute('fill');
  expect(leftSvgFill, 'SVG шеврона влево: чёрный цвет').toBe('#323232');
  console.log('[test] ✓ Шевроны влево/вправо: 32×32, SVG чёрный');

  // --- 3. Клик вправо → главный слайд и активная миниатюра меняются ---
  const getActiveMainIdx = () => page.evaluate(() => {
    const slides = [...document.querySelectorAll('.single-doctor__gallery__images-wrap')];
    return slides.findIndex(s => s.classList.contains('carousel__slide--active'));
  });
  const getActiveThumbIdx = () => page.evaluate(() => {
    const thumbs = [...document.querySelectorAll('.single-doctor__gallery .desktop-carousel-container .carousel__slide')];
    return thumbs.findIndex(t => t.classList.contains('active'));
  });

  // Ждём, пока вертикальная галерея проставит класс active на первую миниатюру
  await page.waitForFunction(
    () => document.querySelector('.single-doctor__gallery .desktop-carousel-container .carousel__slide.active') !== null,
    { timeout: 5000 }
  ).catch(() => {});

  const mainBefore  = await getActiveMainIdx();
  const thumbBefore = await getActiveThumbIdx();
  console.log(`[test] До клика: главный слайд #${mainBefore}, миниатюра #${thumbBefore}`);

  await rightArrow.click();
  await page.waitForTimeout(700);

  const mainAfterRight  = await getActiveMainIdx();
  const thumbAfterRight = await getActiveThumbIdx();
  expect(mainAfterRight,  'Клик вправо: главный слайд должен перейти к следующему').toBe(mainBefore + 1);
  expect(thumbAfterRight, 'Клик вправо: активная миниатюра в галерее должна сдвинуться').toBe(thumbBefore + 1);
  console.log(`[test] ✓ После клика вправо: слайд #${mainAfterRight}, миниатюра #${thumbAfterRight} (синяя обводка)`);

  // --- 4. Клик влево → возврат к исходному слайду ---
  await leftArrow.click();
  await page.waitForTimeout(700);
  const mainAfterLeft  = await getActiveMainIdx();
  const thumbAfterLeft = await getActiveThumbIdx();
  expect(mainAfterLeft,  'Клик влево: главный слайд должен вернуться').toBe(mainBefore);
  expect(thumbAfterLeft, 'Клик влево: активная миниатюра должна вернуться').toBe(thumbBefore);
  console.log('[test] ✓ Клик влево: вернулись к первому слайду');

  // --- 5. Кнопка звука (только на видео-слайде) ---
  const footerBar  = gallery.locator('.single-doctor__gallery__footer-bar').first();
  const soundWrap  = gallery.locator('.single-doctor__gallery__main-video__button__wrap').first();
  if (await footerBar.isVisible({ timeout: 2000 }).catch(() => false)) {
    await expect(soundWrap, 'Кнопка звука должна быть видна').toBeVisible();

    const soundSize = await soundWrap.evaluate(el => {
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      return { w: Math.round(r.width), h: Math.round(r.height), br: s.borderRadius, bg: s.backgroundColor };
    });
    expect(soundSize.h,  'Кнопка звука: высота 40px').toBe(40);
    expect(parseInt(soundSize.br), 'Кнопка звука: закруглённые края').toBeGreaterThan(0);
    // Полупрозрачный фон (rgba с alpha < 1)
    expect(soundSize.bg, 'Кнопка звука: полупрозрачный фон').toContain('rgba');
    console.log(`[test] ✓ Кнопка звука: ${soundSize.w}×${soundSize.h}, borderRadius ${soundSize.br}, bg ${soundSize.bg}`);

    // --- 6. Таймер: формат «0:30», белый цвет ---
    const timerEl = soundWrap.locator('span.text-semibold').first();
    await expect(timerEl, 'Таймер должен быть виден').toBeVisible();
    const timerText = (await timerEl.textContent()).trim();
    expect(timerText, 'Таймер: формат M:SS').toMatch(/^\d+:\d+$/);
    const timerColor = await timerEl.evaluate(el => window.getComputedStyle(el).color);
    expect(timerColor, 'Таймер: белый цвет текста').toBe('rgb(255, 255, 255)');
    // Шрифт: 14px, font-weight 400
    const timerFont = await timerEl.evaluate(el => {
      const s = window.getComputedStyle(el);
      return { size: s.fontSize, weight: s.fontWeight };
    });
    expect(parseFloat(timerFont.size), 'Таймер: размер цифр 14–16px').toBeLessThanOrEqual(16);
    expect(parseInt(timerFont.weight), 'Таймер: вес 400–500').toBeLessThanOrEqual(500);
    console.log(`[test] ✓ Таймер: "${timerText}", ${timerFont.size} / weight ${timerFont.weight}`);

    // --- 7. Иконка громкости: 24×24, изначально выключена (volume_off) ---
    const volSvg  = soundWrap.locator('svg').first();
    await expect(volSvg, 'Иконка громкости должна быть видна').toBeVisible();
    const volSize = await volSvg.evaluate(el => ({
      w: parseInt(el.getAttribute('width') || '0'),
      h: parseInt(el.getAttribute('height') || '0'),
    }));
    expect(volSize.w, 'Иконка громкости: ширина 24px').toBe(24);
    expect(volSize.h, 'Иконка громкости: высота 24px').toBe(24);
    // Иконка перечёркнута (звук выключен) — g#volume_off
    const isMuted = await volSvg.evaluate(el => !!el.querySelector('#volume_off, [id*="volume_off"], [id*="mute"]'));
    expect(isMuted, 'Иконка громкости: при загрузке звук выключен (перечёркнута)').toBe(true);
    console.log('[test] ✓ Иконка громкости: 24×24, звук выключен');
  } else {
    console.log('[test] Первый слайд — фото (кнопка звука отсутствует, проверка пропущена)');
  }

  // --- 8. Пагинация: контейнер + кружки, один активен ---
  const pagination = gallery.locator('.carousel-control-container').first();
  await expect(pagination, 'Блок пагинации должен быть виден').toBeVisible();
  const controls = pagination.locator('.control');
  const totalControls = await controls.count();
  expect(totalControls, 'Пагинация: должна содержать хотя бы 1 кружок').toBeGreaterThan(0);

  // Кружки — окружности (borderRadius 50px)
  const firstControlBR = await controls.first().evaluate(el => window.getComputedStyle(el).borderRadius);
  expect(parseInt(firstControlBR), 'Кружки пагинации: закруглённые (border-radius ≥ 40px)').toBeGreaterThanOrEqual(40);

  // Ровно один кружок активен
  const activeControls = await pagination.locator('.control.active').count();
  expect(activeControls, 'Пагинация: ровно один кружок должен быть активен').toBe(1);
  console.log(`[test] ✓ Пагинация: ${totalControls} кружков, 1 активен`);
});

test('Личная страница врача — воспроизведение видео: клик на кнопку звука включает звук, видео стартует с начала, таймер убывает', async ({ page }) => {
  test.setTimeout(60000);

  // Переходим к Шуваевой — первый слайд всегда видео
  await page.goto(BASE_URL + '/vrach/shuvaeva-olga-borisovna-nevrolog', { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  const gallery  = page.locator('.single-doctor__gallery').first();
  const soundBtn = gallery.locator('.single-doctor__gallery__main-video__button__wrap').first();
  const timerEl  = gallery.locator('.single-doctor__gallery__main-video__button__wrap span.text-semibold').first();
  const volSvg   = gallery.locator('.single-doctor__gallery__main-video__button__wrap svg').first();

  await expect(soundBtn, 'Кнопка звука должна быть видна').toBeVisible({ timeout: 5000 });

  // Вспомогательная функция: парсим таймер "M:SS" → секунды
  const parseTimer = async () => {
    const txt = (await timerEl.textContent()).trim();
    const [m, s] = txt.split(':').map(Number);
    return m * 60 + s;
  };

  // --- До клика ---
  const timerStart = await parseTimer();
  const stateBefore = await page.evaluate(() => {
    const v = document.querySelector('video.single-doctor__gallery_main-video');
    return { muted: v.muted, paused: v.paused, currentTime: v.currentTime };
  });
  expect(stateBefore.muted,  'До клика: видео должно быть без звука (muted)').toBe(true);
  expect(stateBefore.paused, 'До клика: видео идёт в фоне (не на паузе)').toBe(false);
  // Иконка перечёркнута
  const iconBefore = await volSvg.evaluate(el => el.querySelector('g')?.getAttribute('id') || '');
  expect(iconBefore, 'До клика: иконка громкости перечёркнута (volume_off)').toContain('volume_off');
  console.log(`[test] До клика: muted=${stateBefore.muted}, currentTime=${stateBefore.currentTime.toFixed(2)}, таймер ${timerStart}с`);

  // --- Клик на кнопку звука ---
  await soundBtn.click();
  await page.waitForTimeout(1500);

  const stateAfter = await page.evaluate(() => {
    const v = document.querySelector('video.single-doctor__gallery_main-video');
    return { muted: v.muted, paused: v.paused, currentTime: v.currentTime, duration: v.duration };
  });
  expect(stateAfter.muted,  'После клика: звук должен включиться (muted = false)').toBe(false);
  expect(stateAfter.paused, 'После клика: видео должно играть (paused = false)').toBe(false);

  // Видео перезапустилось с начала — currentTime < 5 сек через 1.5с после клика
  expect(stateAfter.currentTime, 'После клика: видео стартовало с начала (currentTime < 5)').toBeLessThan(5);
  console.log(`[test] После клика: muted=${stateAfter.muted}, currentTime=${stateAfter.currentTime.toFixed(2)}с`);

  // Иконка громкости изменилась (звук включён)
  const iconAfter = await volSvg.evaluate(el => el.querySelector('g')?.getAttribute('id') || '');
  expect(iconAfter, 'После клика: иконка громкости не должна быть перечёркнутой').not.toContain('volume_off');
  console.log(`[test] ✓ Иконка громкости: "${iconBefore}" → "${iconAfter}"`);

  // Таймер убыл — ждём пока обновится (компонент тикает раз в секунду)
  await page.waitForFunction(
    (start) => {
      const el = document.querySelector('.single-doctor__gallery__main-video__button__wrap span.text-semibold');
      if (!el) return false;
      const [m, s] = el.textContent.trim().split(':').map(Number);
      return (m * 60 + s) < start;
    },
    timerStart,
    { timeout: 5000 }
  );
  const timer1 = await parseTimer();
  expect(timer1, 'После клика: таймер должен убыть (идёт отсчёт)').toBeLessThan(timerStart);
  console.log(`[test] Таймер через 1.5с: ${timer1}с`);

  // --- Ждём 2 секунды → таймер должен ещё убыть ---
  await page.waitForTimeout(2000);

  const timer3 = await parseTimer();
  expect(timer3, 'Через 2с таймер должен убыть ещё').toBeLessThan(timer1);
  expect(timer1 - timer3, 'Таймер убывает: разница ≥ 1 сек за 2 секунды').toBeGreaterThanOrEqual(1);
  console.log(`[test] Таймер через 3.5с: ${timer3}с (убыл на ${timer1 - timer3}с)`);

  // Видео всё ещё играет
  const stateEnd = await page.evaluate(() => {
    const v = document.querySelector('video.single-doctor__gallery_main-video');
    return { muted: v.muted, paused: v.paused, currentTime: v.currentTime };
  });
  expect(stateEnd.paused,  'Через 3.5с: видео продолжает играть').toBe(false);
  expect(stateEnd.muted,   'Через 3.5с: звук остаётся включённым').toBe(false);
  expect(stateEnd.currentTime, 'Через 3.5с: currentTime нарос').toBeGreaterThan(stateAfter.currentTime);
  console.log(`[test] ✓ Видео играет со звуком: currentTime=${stateEnd.currentTime.toFixed(2)}с, убывание таймера подтверждено`);
});

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

  // URL получает якорь #reviews (ждём обновления)
  await expect(page).toHaveURL(/#reviews/, { timeout: 5000 });

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

  // Фиксированные категории: иконка добавляется сайтом автоматически, не редактируется в админке.
  // Если у такой категории нет img — это баг на проде.
  const FIXED_CATEGORIES = [
    'Доктор медицинских наук', 'Кандидат медицинских наук',
    'Научный руководитель', 'Главный врач',
    'Врач-эксперт', 'Ведущий врач', 'Ведущий специалист',
    'Врач высшей категории', 'Врач первой категории', 'Врач второй категории',
  ];

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
      const imgSrc = await item.locator('img').first().getAttribute('src', { timeout: 0 }).catch(() => null);
      const isFixed = FIXED_CATEGORIES.some(cat => titleText.includes(cat));
      if (imgSrc === null) {
        if (isFixed) {
          throw new Error(`У фиксированной категории "${titleText}" отсутствует иконка`);
        }
        // Кастомная категория — иконка добавляется вручную контент-менеджером
        console.log(`[test] Пользовательская категория: "${titleText}"`);
      } else {
        const type = /kandnauk|docnauk/i.test(imgSrc) ? 'Научное звание'
          : /vysshei|pervoi|vtoroi/i.test(imgSrc) ? 'Категория'
          : 'Должность';
        console.log(`[test] ${type}: "${titleText}"`);
      }
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

test('Личная страница врача — аккордеоны: Врач о себе / С чем поможет / Награды / Образование', async ({ page }) => {
  test.setTimeout(120000);
  await gotoDoctor25(page);

  const BLOCKS = ['Врач о себе', 'С чем поможет', 'Награды', 'Образование'];

  for (const title of BLOCKS) {
    const details = page.locator('details.accordion-container').filter({ hasText: title }).first();

    if (!await details.isVisible()) {
      console.log(`[test] "${title}" — блок отсутствует (не заполнен в админке)`);
      continue;
    }

    // Заголовок аккордеона виден
    await expect(details.locator('summary .accordion-text').first()).toBeVisible();

    // Кликаем — блок раскрывается
    await details.locator('summary').click();
    await page.waitForTimeout(300);

    // Содержимое появляется и непустое
    const content = details.locator('.accordion-content').first();
    await expect(content).toBeVisible({ timeout: 3000 });
    const contentText = (await content.textContent()).trim();
    expect(contentText.length, `Содержимое блока "${title}" не должно быть пустым`).toBeGreaterThan(0);
    console.log(`[test] ✓ "${title}" — открылся, ${contentText.length} символов`);
  }
});

test('Личная страница врача — блок «Врач о себе»: шеврон и кнопка «Свернуть»', async ({ page }) => {
  test.setTimeout(120000);
  await gotoDoctor25(page);

  const details = page.locator('details.accordion-container').filter({ hasText: 'Врач о себе' }).first();

  if (!await details.isVisible()) {
    console.log('[test] Блок "Врач о себе" отсутствует, проверка пропущена');
    return;
  }

  const chevron = details.locator('summary svg.chevron').first();

  // Закрытый шеврон смотрит вниз — transform: none (не повёрнут)
  const transformClosed = await chevron.evaluate(el => window.getComputedStyle(el).transform);
  expect(transformClosed, 'Закрытый шеврон не должен быть повёрнут').not.toContain('matrix(-1');
  console.log('[test] Шеврон вниз (закрыт)');

  // Клик на шеврон вниз — блок открывается, шеврон поворачивается вверх
  await details.locator('summary').click();
  await page.waitForTimeout(500);
  expect(await details.evaluate(d => d.open), 'Блок должен открыться').toBe(true);
  const transformOpen = await chevron.evaluate(el => window.getComputedStyle(el).transform);
  expect(transformOpen, 'Открытый шеврон должен быть повёрнут на 180°').toContain('matrix(-1');
  console.log('[test] ✓ Шеврон вверх (открыт)');

  // Кнопка «Свернуть» видна в конце текста
  const svernBtn = details.locator('button.accordion-button').first();
  await expect(svernBtn).toBeVisible({ timeout: 3000 });
  console.log('[test] ✓ Кнопка «Свернуть» присутствует');

  // Клик «Свернуть» — блок сворачивается, шеврон возвращается вниз
  await svernBtn.scrollIntoViewIfNeeded();
  await svernBtn.click();
  await page.waitForTimeout(500);
  expect(await details.evaluate(d => d.open), 'Блок должен закрыться').toBe(false);
  const transformAfterSvern = await chevron.evaluate(el => window.getComputedStyle(el).transform);
  expect(transformAfterSvern, 'Шеврон должен вернуться в положение вниз').not.toContain('matrix(-1');
  console.log('[test] ✓ «Свернуть» сработала — блок закрыт, шеврон вниз');

  // Клик на шеврон вверх — блок снова открывается
  await details.locator('summary').click();
  await page.waitForTimeout(500);
  expect(await details.evaluate(d => d.open)).toBe(true);
  // Клик на шеврон вверх — блок закрывается
  await details.locator('summary').click();
  await page.waitForTimeout(500);
  expect(await details.evaluate(d => d.open), 'Клик на открытый шеврон должен закрыть блок').toBe(false);
  console.log('[test] ✓ Шеврон вверх → закрыл блок');
});

test('Личная страница врача — блок «С чем поможет»: расположен после «Врач о себе», шеврон и кнопка «Свернуть»', async ({ page }) => {
  test.setTimeout(120000);
  await gotoDoctor25(page);

  const vroSebe  = page.locator('details.accordion-container').filter({ hasText: 'Врач о себе' }).first();
  const schemPom = page.locator('details.accordion-container').filter({ hasText: 'С чем поможет' }).first();

  if (!await schemPom.isVisible()) {
    console.log('[test] Блок "С чем поможет" отсутствует, проверка пропущена');
    return;
  }

  // «С чем поможет» идёт после «Врач о себе» в DOM
  if (await vroSebe.isVisible()) {
    const isAfter = await page.evaluate(() => {
      const all = [...document.querySelectorAll('details.accordion-container')];
      const idxA = all.findIndex(d => d.innerText.includes('Врач о себе'));
      const idxB = all.findIndex(d => d.innerText.includes('С чем поможет'));
      return idxB > idxA;
    });
    expect(isAfter, '«С чем поможет» должен быть ниже «Врач о себе»').toBe(true);
    console.log('[test] ✓ Порядок: «Врач о себе» → «С чем поможет»');
  }

  const chevron = schemPom.locator('summary svg.chevron').first();

  // Закрытый шеврон смотрит вниз
  const transformClosed = await chevron.evaluate(el => window.getComputedStyle(el).transform);
  expect(transformClosed, 'Закрытый шеврон не должен быть повёрнут').not.toContain('matrix(-1');
  console.log('[test] Шеврон вниз (закрыт)');

  // Клик — блок открывается, шеврон поворачивается вверх
  await schemPom.locator('summary').click();
  await page.waitForTimeout(500);
  expect(await schemPom.evaluate(d => d.open), 'Блок должен открыться').toBe(true);
  const transformOpen = await chevron.evaluate(el => window.getComputedStyle(el).transform);
  expect(transformOpen, 'Открытый шеврон должен быть повёрнут на 180°').toContain('matrix(-1');
  console.log('[test] ✓ Шеврон вверх (открыт)');

  // Кнопка «Свернуть» видна в конце списка
  const svernBtn = schemPom.locator('button.accordion-button').first();
  await expect(svernBtn).toBeVisible({ timeout: 3000 });
  console.log('[test] ✓ Кнопка «Свернуть» присутствует');

  // Клик «Свернуть» — блок закрывается, шеврон возвращается вниз
  await svernBtn.scrollIntoViewIfNeeded();
  await svernBtn.click();
  await page.waitForTimeout(500);
  expect(await schemPom.evaluate(d => d.open), 'Блок должен закрыться').toBe(false);
  const transformAfterSvern = await chevron.evaluate(el => window.getComputedStyle(el).transform);
  expect(transformAfterSvern, 'Шеврон должен вернуться в положение вниз').not.toContain('matrix(-1');
  console.log('[test] ✓ «Свернуть» сработала — блок закрыт, шеврон вниз');

  // Клик на шеврон вверх — блок снова открывается, затем закрывается
  await schemPom.locator('summary').click();
  await page.waitForTimeout(500);
  expect(await schemPom.evaluate(d => d.open)).toBe(true);
  await schemPom.locator('summary').click();
  await page.waitForTimeout(500);
  expect(await schemPom.evaluate(d => d.open), 'Клик на открытый шеврон должен закрыть блок').toBe(false);
  console.log('[test] ✓ Шеврон вверх → закрыл блок');
});

test('Личная страница врача — блок «Награды»: расположен после «С чем поможет», шеврон, фотографии, навигация', async ({ page }) => {
  test.setTimeout(120000);
  await gotoDoctor25(page);

  const schemPom = page.locator('details.accordion-container').filter({ hasText: 'С чем поможет' }).first();
  const details  = page.locator('details.accordion-container').filter({ hasText: 'Награды' }).first();

  if (!await details.isVisible()) {
    console.log('[test] Блок "Награды" отсутствует (у врача нет наград) — проверка пропущена');
    return;
  }

  // «Награды» идёт после «С чем поможет» в DOM
  if (await schemPom.isVisible()) {
    const isAfter = await page.evaluate(() => {
      const all = [...document.querySelectorAll('details.accordion-container')];
      const idxA = all.findIndex(d => d.innerText.includes('С чем поможет'));
      const idxB = all.findIndex(d => d.innerText.includes('Награды'));
      return idxB > idxA;
    });
    expect(isAfter, '«Награды» должен быть ниже «С чем поможет»').toBe(true);
    console.log('[test] ✓ Порядок: «С чем поможет» → «Награды»');
  }

  const chevron = details.locator('summary svg.chevron').first();

  // Закрытый шеврон смотрит вниз
  const transformClosed = await chevron.evaluate(el => window.getComputedStyle(el).transform);
  expect(transformClosed, 'Закрытый шеврон не должен быть повёрнут').not.toContain('matrix(-1');
  console.log('[test] Шеврон вниз (закрыт)');

  // Клик — блок открывается, шеврон поворачивается вверх
  await details.locator('summary').click();
  await page.waitForTimeout(500);
  expect(await details.evaluate(d => d.open), 'Блок должен открыться').toBe(true);
  const transformOpen = await chevron.evaluate(el => window.getComputedStyle(el).transform);
  expect(transformOpen, 'Открытый шеврон должен быть повёрнут на 180°').toContain('matrix(-1');
  console.log('[test] ✓ Шеврон вверх (открыт)');

  // Фотографии наград видны
  const slides = details.locator('.slide-gallery__item');
  const slideCount = await slides.count();
  expect(slideCount, 'Должна быть хотя бы одна фотография награды').toBeGreaterThan(0);
  await expect(slides.first().locator('img').first()).toBeVisible({ timeout: 3000 });
  console.log(`[test] ✓ Фотографий наград: ${slideCount}`);

  // Навигация (только если наград > 4)
  if (slideCount > 4) {
    const rightBtn = details.locator('.chevron-container.right').first();
    const leftBtn  = details.locator('.chevron-container.left').first();

    // Правая кнопка видна и имеет размер 48×48
    await expect(rightBtn).toBeVisible({ timeout: 3000 });
    const rightSize = await rightBtn.evaluate(el => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    expect(rightSize.w, 'Правая кнопка должна быть 48px в ширину').toBe(48);
    expect(rightSize.h, 'Правая кнопка должна быть 48px в высоту').toBe(48);
    console.log('[test] ✓ Правая кнопка навигации 48×48');

    // Левая кнопка скрыта в начале (класс hidden)
    expect(
      await leftBtn.evaluate(el => el.classList.contains('hidden')),
      'Левая кнопка должна быть скрыта в начале галереи'
    ).toBe(true);

    // Клик → — левая кнопка появляется
    await rightBtn.click();
    await page.waitForTimeout(600);
    expect(
      await leftBtn.evaluate(el => el.classList.contains('hidden')),
      'После прокрутки вправо левая кнопка должна стать видимой'
    ).toBe(false);
    const leftSize = await leftBtn.evaluate(el => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    expect(leftSize.w, 'Левая кнопка должна быть 48px в ширину').toBe(48);
    expect(leftSize.h, 'Левая кнопка должна быть 48px в высоту').toBe(48);
    console.log('[test] ✓ Прокрутка → : левая кнопка (48×48) появилась');

    // Клик ← — левая кнопка снова скрывается
    await leftBtn.click();
    await page.waitForTimeout(600);
    expect(
      await leftBtn.evaluate(el => el.classList.contains('hidden')),
      'После возврата в начало левая кнопка должна снова скрыться'
    ).toBe(true);
    console.log('[test] ✓ Прокрутка ← : левая кнопка скрылась');
  } else {
    console.log(`[test] Наград ${slideCount} (≤4) — кнопки навигации не нужны`);
  }

  // Клик на шеврон вверх — блок закрывается
  await details.locator('summary').click();
  await page.waitForTimeout(500);
  expect(await details.evaluate(d => d.open), 'Блок должен закрыться').toBe(false);
  const transformBack = await chevron.evaluate(el => window.getComputedStyle(el).transform);
  expect(transformBack, 'Шеврон должен вернуться в положение вниз').not.toContain('matrix(-1');
  console.log('[test] ✓ Шеврон вверх → закрыл блок');
});

test('Личная страница врача — блок «Образование»: расположен после «Награды», шеврон, фотографии, навигация, плеер, Свернуть', async ({ page }) => {
  test.setTimeout(120000);
  await gotoDoctor25(page);

  const nagrady = page.locator('details.accordion-container').filter({ hasText: 'Награды' }).first();
  const details  = page.locator('details.accordion-container').filter({ hasText: 'Образование' }).first();

  if (!await details.isVisible()) {
    console.log('[test] Блок "Образование" отсутствует — проверка пропущена');
    return;
  }

  // «Образование» идёт после «Награды» в DOM
  if (await nagrady.isVisible()) {
    const isAfter = await page.evaluate(() => {
      const all = [...document.querySelectorAll('details.accordion-container')];
      const idxA = all.findIndex(d => d.innerText.includes('Награды'));
      const idxB = all.findIndex(d => d.innerText.includes('Образование'));
      return idxB > idxA;
    });
    expect(isAfter, '«Образование» должен быть ниже «Награды»').toBe(true);
    console.log('[test] ✓ Порядок: «Награды» → «Образование»');
  }

  const chevron = details.locator('summary svg.chevron').first();

  // Закрытый шеврон смотрит вниз
  const transformClosed = await chevron.evaluate(el => window.getComputedStyle(el).transform);
  expect(transformClosed, 'Закрытый шеврон не должен быть повёрнут').not.toContain('matrix(-1');
  console.log('[test] Шеврон вниз (закрыт)');

  // Клик — открывается, шеврон поворачивается вверх
  await details.locator('summary').click();
  await page.waitForTimeout(500);
  expect(await details.evaluate(d => d.open), 'Блок должен открыться').toBe(true);
  const transformOpen = await chevron.evaluate(el => window.getComputedStyle(el).transform);
  expect(transformOpen, 'Открытый шеврон должен быть повёрнут на 180°').toContain('matrix(-1');
  console.log('[test] ✓ Шеврон вверх (открыт)');

  // Фотографии дипломов
  const slides = details.locator('.slide-gallery__item');
  const slideCount = await slides.count();
  console.log(`[test] Фотографий дипломов: ${slideCount}`);

  if (slideCount > 0) {
    await expect(slides.first().locator('img').first()).toBeVisible({ timeout: 3000 });
    console.log('[test] ✓ Первая фотография видна');

    // Навигация (только если дипломов > 4)
    if (slideCount > 4) {
      const rightBtn = details.locator('.chevron-container.right').first();
      const leftBtn  = details.locator('.chevron-container.left').first();

      await expect(rightBtn).toBeVisible({ timeout: 3000 });
      const rightSize = await rightBtn.evaluate(el => {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      });
      expect(rightSize.w, 'Правая кнопка: ширина 48px').toBe(48);
      expect(rightSize.h, 'Правая кнопка: высота 48px').toBe(48);

      expect(
        await leftBtn.evaluate(el => el.classList.contains('hidden')),
        'Левая кнопка должна быть скрыта в начале'
      ).toBe(true);

      await rightBtn.click();
      await page.waitForTimeout(600);
      expect(
        await leftBtn.evaluate(el => el.classList.contains('hidden')),
        'После прокрутки вправо левая кнопка должна появиться'
      ).toBe(false);
      const leftSize = await leftBtn.evaluate(el => {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      });
      expect(leftSize.w, 'Левая кнопка: ширина 48px').toBe(48);
      expect(leftSize.h, 'Левая кнопка: высота 48px').toBe(48);
      console.log('[test] ✓ Прокрутка → : левая кнопка (48×48) появилась');

      await leftBtn.click();
      await page.waitForTimeout(600);
      expect(
        await leftBtn.evaluate(el => el.classList.contains('hidden')),
        'После возврата в начало левая кнопка должна скрыться'
      ).toBe(true);
      console.log('[test] ✓ Прокрутка ← : левая кнопка скрылась');
    } else {
      console.log(`[test] Дипломов ${slideCount} (≤4) — кнопки навигации не нужны`);
    }

    // Клик на фото → плеер открывается
    await slides.first().scrollIntoViewIfNeeded();
    await slides.first().click();
    await page.waitForTimeout(1000);

    const overlay = page.locator('div.stories__overlay.active').first();
    await expect(overlay, 'Плеер должен открыться').toBeVisible({ timeout: 5000 });
    console.log('[test] ✓ Плеер открылся');

    // Кнопка закрытия плеера
    const closeBtn = page.locator('div.stories__play-area__close').first();
    await expect(closeBtn, 'Кнопка закрытия плеера должна быть видна').toBeVisible();
    await closeBtn.click();
    await page.waitForTimeout(600);
    await expect(overlay, 'Плеер должен закрыться').not.toBeVisible({ timeout: 3000 });
    console.log('[test] ✓ Плеер закрылся');
  }

  // Кнопка «Свернуть» закрывает блок
  const svernBtn = details.locator('button.accordion-button').first();
  await expect(svernBtn, 'Кнопка «Свернуть» должна быть видна').toBeVisible({ timeout: 3000 });
  await svernBtn.scrollIntoViewIfNeeded();
  await svernBtn.click();
  await page.waitForTimeout(500);
  expect(await details.evaluate(d => d.open), 'Блок должен закрыться после «Свернуть»').toBe(false);
  const transformAfterSvern = await chevron.evaluate(el => window.getComputedStyle(el).transform);
  expect(transformAfterSvern, 'Шеврон должен смотреть вниз после «Свернуть»').not.toContain('matrix(-1');
  console.log('[test] ✓ «Свернуть» закрыла блок, шеврон вниз');

  // Открываем снова и закрываем шевроном
  await details.locator('summary').click();
  await page.waitForTimeout(500);
  expect(await details.evaluate(d => d.open), 'Блок должен открыться').toBe(true);
  await details.locator('summary').click();
  await page.waitForTimeout(500);
  expect(await details.evaluate(d => d.open), 'Блок должен закрыться').toBe(false);
  const transformFinal = await chevron.evaluate(el => window.getComputedStyle(el).transform);
  expect(transformFinal, 'Шеврон должен смотреть вниз').not.toContain('matrix(-1');
  console.log('[test] ✓ Шеврон вверх → закрыл блок');
});

test('Личная страница врача — отзывы: фильтры «По типам», «По площадкам» и кнопка «Показать ещё»', async ({ page }) => {
  test.setTimeout(120000);
  await gotoDoctor25(page);

  const reviewsSection = page.locator('#reviews');
  if (!await reviewsSection.isVisible({ timeout: 3000 })) {
    console.log('[test] Блок #reviews не найден — проверка пропущена');
    return;
  }

  await reviewsSection.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);

  const countReviews = () => page.locator('#reviews .reviews .review-container').count();
  const initialCount = await countReviews();

  if (initialCount === 0) {
    console.log('[test] Отзывов нет — проверка пропущена');
    return;
  }
  console.log(`[test] Отзывов на странице: ${initialCount}`);

  // === ФИЛЬТР ПО ТИПАМ ===
  const typeFilter = page.locator('#reviews span.filter-current-type-text').first();

  await typeFilter.click();
  await page.waitForTimeout(400);
  const highOpt = page.locator('#reviews .popup-option').filter({ hasText: 'С высокой оценкой' }).first();
  await expect(highOpt, 'Опция «С высокой оценкой» должна быть видна').toBeVisible({ timeout: 3000 });
  await highOpt.click();
  await page.waitForTimeout(1000);
  expect((await typeFilter.textContent()).trim(), 'Фильтр типа должен переключиться').toBe('С высокой оценкой');
  console.log(`[test] ✓ Тип «С высокой оценкой»: ${await countReviews()} отзывов`);

  await typeFilter.click();
  await page.waitForTimeout(400);
  await page.locator('#reviews .popup-option').filter({ hasText: 'С низкой оценкой' }).first().click();
  await page.waitForTimeout(1000);
  expect((await typeFilter.textContent()).trim()).toBe('С низкой оценкой');
  console.log(`[test] ✓ Тип «С низкой оценкой»: ${await countReviews()} отзывов`);

  // Сброс типа
  await typeFilter.click();
  await page.waitForTimeout(400);
  await page.locator('#reviews .popup-option').filter({ hasText: 'Новые' }).first().click();
  await page.waitForTimeout(800);
  expect((await typeFilter.textContent()).trim()).toBe('Новые');
  console.log('[test] ✓ Тип сброшен → «Новые»');

  // === ФИЛЬТР ПО ПЛОЩАДКАМ ===
  const platFilter = page.locator('#reviews span.filter-current-platform-text').first();

  await platFilter.click();
  await page.waitForTimeout(400);

  // Находим площадку с отзывами, отличную от «Со всех площадок»
  const allOpts = page.locator('#reviews .popup-option');
  const optCount = await allOpts.count();
  expect(optCount, 'Должно быть несколько площадок').toBeGreaterThan(1);

  let selectedPlatName = '';
  for (let i = 1; i < optCount; i++) {
    const opt = allOpts.nth(i);
    const txt = (await opt.textContent()).trim();
    const num = parseInt(txt.match(/(\d+)\s*отзыв/)?.[1] || '0');
    if (num > 0) {
      selectedPlatName = txt.split('\n')[0].trim();
      await opt.click();
      break;
    }
  }

  if (!selectedPlatName) {
    console.log('[test] Не нашли площадку с отзывами — пропускаем фильтр площадок');
    await page.keyboard.press('Escape');
  } else {
    await page.waitForTimeout(1000);
    const newPlatLabel = (await platFilter.textContent()).trim();
    expect(newPlatLabel, 'Фильтр площадки должен переключиться').not.toBe('Со всех площадок');
    const countAfterPlat = await countReviews();
    expect(countAfterPlat, 'После фильтра по площадке видны отзывы').toBeGreaterThan(0);
    expect(countAfterPlat, 'Фильтр площадки должен изменить показываемые отзывы').toBeLessThanOrEqual(initialCount);
    console.log(`[test] ✓ Площадка «${selectedPlatName}»: ${countAfterPlat} отзывов`);

    // Сброс площадки
    await platFilter.click();
    await page.waitForTimeout(400);
    await page.locator('#reviews .popup-option').filter({ hasText: 'Со всех площадок' }).first().click();
    await page.waitForTimeout(800);
    expect((await platFilter.textContent()).trim()).toContain('Со всех площадок');
    console.log('[test] ✓ Площадка сброшена → «Со всех площадок»');
  }

  // === КНОПКА «ПОКАЗАТЬ ЕЩЁ» ===
  const showMoreBtn = page.locator('#reviews button.show-more').first();
  if (!await showMoreBtn.isVisible({ timeout: 2000 })) {
    console.log('[test] Кнопка «Показать ещё» не видна — все отзывы уже показаны');
    return;
  }

  const btnText1 = (await showMoreBtn.textContent()).trim();
  const firstBatch = parseInt(btnText1.match(/\d+/)?.[0] || '0');
  expect(firstBatch, 'Первая загрузка должна показывать ≤8 отзывов').toBeLessThanOrEqual(8);
  console.log(`[test] Кнопка 1-й клик: "${btnText1}"`);

  // 1-й клик — ждём смены текста (count может не измениться)
  await showMoreBtn.click();
  await page.waitForFunction(
    (prev) => {
      const b = document.querySelector('#reviews button.show-more');
      return !b || b.textContent.trim() !== prev;
    },
    btnText1,
    { timeout: 8000 }
  );
  const afterFirst = await countReviews();
  const btnText2 = await showMoreBtn.isVisible()
    ? (await showMoreBtn.textContent()).trim()
    : null;
  console.log(`[test] После 1-го клика: ${afterFirst} отзывов | кнопка: "${btnText2 || 'скрыта'}"`);

  if (!btnText2 || !await showMoreBtn.isVisible()) {
    console.log('[test] ✓ Все отзывы показаны после 1-го клика');
    return;
  }

  const secondBatch = parseInt(btnText2.match(/\d+/)?.[0] || '0');
  // Второй и последующие клики показывают до 10 отзывов (меньше — если в базе осталось меньше)
  expect(secondBatch, '2-я загрузка должна показывать от 1 до 10 отзывов').toBeGreaterThan(0);
  expect(secondBatch, '2-я загрузка должна показывать не более 10 отзывов').toBeLessThanOrEqual(10);

  // 2-й клик — ждём добавления отзывов в DOM
  const beforeSecond = await countReviews();
  await showMoreBtn.click();
  await page.waitForFunction(
    (n) => document.querySelectorAll('#reviews .reviews .review-container').length > n,
    beforeSecond,
    { timeout: 8000 }
  );
  const afterSecond = await countReviews();
  // Добавлено ровно столько, сколько обещала кнопка
  expect(afterSecond - beforeSecond, `2-й клик должен добавить ${secondBatch} отзывов`).toBe(secondBatch);
  console.log(`[test] ✓ После 2-го клика: ${afterSecond} отзывов (+10)`);
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
