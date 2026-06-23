import { test } from '@playwright/test';
import { BASE_URL } from './helpers/config.js';

async function acceptCookies(page) {
  try {
    const btn = page.getByRole('button', { name: /принять/i });
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    await btn.click();
  } catch {}
}

test('Смена времени приёма — исследование', async ({ page }) => {
  await page.goto(BASE_URL + '/vrach/shamina-lyudmila-valerevna');
  await page.waitForLoadState('domcontentloaded');
  await acceptCookies(page);

  // Открываем модалку кликом на первый слот
  await page.waitForSelector('.calendar-slot:visible', { timeout: 15000 });
  const firstSlotText = await page.locator('.calendar-slot:visible').first().innerText();
  console.log('Первый слот (исходное время):', firstSlotText);
  await page.locator('.calendar-slot:visible').first().click();
  await page.getByPlaceholder('Ваше имя и фамилия').first().waitFor({ state: 'visible', timeout: 8000 });

  // Читаем исходное время в модалке
  const initialTime = await page.locator('.booking__dialog__item.pointer').filter({ hasText: 'Дата и время приема' }).innerText();
  console.log('Исходное время в модалке:', initialTime);

  // Кликаем по блоку "Дата и время приема" (карандаш)
  await page.locator('.booking__dialog__item.pointer').filter({ hasText: 'Дата и время приема' }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'screenshots/time-01-picker-opened.png' });

  // Смотрим что появилось
  const pickerSlots = await page.locator('.calendar-slot:visible').count();
  console.log('Слотов в пикере:', pickerSlots);

  if (pickerSlots > 1) {
    // Выбираем ВТОРОЙ слот (не первый)
    const secondSlotText = await page.locator('.calendar-slot:visible').nth(1).innerText();
    console.log('Выбираем второй слот:', secondSlotText);
    await page.locator('.calendar-slot:visible').nth(1).click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'screenshots/time-02-slot-selected.png' });

    // Проверяем что время обновилось в форме
    const newTime = await page.locator('.booking__dialog__item.pointer').filter({ hasText: 'Дата и время приема' }).innerText();
    console.log('Новое время в модалке:', newTime);
    console.log('Время изменилось:', initialTime !== newTime);
  }
});


test('Выбор услуги и смена времени — исследование', async ({ page }) => {
  // Используем Шамину — у неё всегда есть слоты, нет онлайн-оплаты
  await page.goto(BASE_URL + '/vrach/shamina-lyudmila-valerevna');
  await page.waitForLoadState('domcontentloaded');
  await acceptCookies(page);

  // Список услуг в виджете
  const services = page.locator('.service-container');
  const serviceCount = await services.count();
  console.log('Услуг в виджете:', serviceCount);
  for (let i = 0; i < Math.min(serviceCount, 8); i++) {
    const txt = await services.nth(i).innerText();
    console.log(`  [${i}]`, txt.trim().replace(/\n/g, ' | '));
  }

  // Структура первого .service-container
  const firstStructure = await page.evaluate(() => {
    const el = document.querySelector('.service-container');
    return el ? el.outerHTML.substring(0, 500) : 'не найден';
  });
  console.log('HTML первого service-container:', firstStructure);

  await page.screenshot({ path: 'screenshots/svc-01-page-before.png' });

  // --- Шаг 1: открыть модалку с ДЕФОЛТНОЙ услугой и посмотреть весь контент ---
  await page.waitForSelector('.calendar-slot:visible', { timeout: 15000 });
  await page.locator('.calendar-slot:visible').first().click();
  await page.getByPlaceholder('Ваше имя и фамилия').first().waitFor({ state: 'visible', timeout: 8000 });

  // Прокрутить модалку вверх и вниз, делая скриншоты
  await page.screenshot({ path: 'screenshots/svc-02-modal-top.png' });

  // Полный HTML модалки
  const modalInfo = await page.evaluate(() => {
    const all = [...document.querySelectorAll('*')];
    const modal = all.filter(e => e.offsetParent !== null)
      .find(e => e.innerText && e.innerText.includes('Запись на приём к врачу') && e.innerText.length > 80 && e.innerText.length < 2000);
    if (!modal) return { fullText: 'не найдена', blocks: [] };
    const blocks = [...modal.querySelectorAll('*')]
      .filter(e => e.offsetParent !== null && e.children.length < 3 && e.innerText && e.innerText.trim().length > 0 && e.innerText.trim().length < 100)
      .map(e => ({ tag: e.tagName, cls: e.className.substring(0, 60), text: e.innerText.trim() }));
    return { fullText: modal.innerText.substring(0, 1000), blocks: blocks.slice(0, 30) };
  });
  console.log('Полный текст модалки:\n', modalInfo.fullText);
  console.log('\nБлоки модалки:', JSON.stringify(modalInfo.blocks, null, 2));

  // Ищем блок Услуга и кнопку редактирования даты
  const hasService = (modalInfo.fullText || '').toLowerCase().includes('услуг');
  console.log('Есть слово "услуг" в модалке:', hasService);

  // Структура поля даты/времени в модалке
  const dateFieldInfo = await page.evaluate(() => {
    const all = [...document.querySelectorAll('*')];
    const dateLabel = all.filter(e => e.offsetParent !== null)
      .find(e => e.innerText && e.innerText.trim() === 'Дата и время приема');
    if (!dateLabel) return 'не найден';
    // Поднимаемся до контейнера этого поля
    let container = dateLabel.parentElement;
    while (container && container.children.length < 2) container = container.parentElement;
    return {
      containerTag: container ? container.tagName : '',
      containerCls: container ? container.className : '',
      containerHTML: container ? container.outerHTML.substring(0, 500) : '',
    };
  });
  console.log('Поле даты:', JSON.stringify(dateFieldInfo, null, 2));

  await page.screenshot({ path: 'screenshots/svc-03-modal-full.png' });

  // --- Шаг 2: кликаем карандаш/иконку редактирования даты ---
  // Ищем svg или button рядом с "Дата и время приема"
  const editDateClicked = await page.evaluate(() => {
    const all = [...document.querySelectorAll('*')];
    const dateLabel = all.filter(e => e.offsetParent !== null)
      .find(e => e.innerText && e.innerText.trim() === 'Дата и время приема');
    if (!dateLabel) return false;
    let container = dateLabel.parentElement;
    while (container && container.children.length < 2) container = container.parentElement;
    if (!container) return false;
    // Найти кликабельный элемент (svg, button, div с cursor:pointer) внутри контейнера
    const clickable = [...container.querySelectorAll('svg, button, [class*="icon"], [class*="edit"], [class*="pencil"]')]
      .filter(e => e.offsetParent !== null);
    if (clickable.length > 0) {
      clickable[0].click();
      return true;
    }
    // Попробовать кликнуть сам контейнер
    container.click();
    return 'container';
  });
  console.log('Клик на карандаш даты:', editDateClicked);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'screenshots/svc-04-after-date-edit-click.png' });

  // Что появилось после клика?
  const afterEditInfo = await page.evaluate(() => {
    const all = [...document.querySelectorAll('*')];
    const newElements = all
      .filter(e => e.offsetParent !== null && /календ|слот|время|выбер|дата/i.test(e.className + e.innerText) && e.innerText.trim().length < 200)
      .map(e => ({ tag: e.tagName, cls: e.className.substring(0, 60), text: e.innerText.trim().substring(0, 80) }))
      .slice(0, 15);
    return newElements;
  });
  console.log('После клика на дату:', JSON.stringify(afterEditInfo, null, 2));
});


test('Вакансии — исследование формы', async ({ page }) => {
  await page.goto(BASE_URL + '/vakansii');
  await page.waitForLoadState('domcontentloaded');
  await acceptCookies(page);

  console.log('=== СТРАНИЦА ВАКАНСИЙ ===');
  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll('button, a')]
      .filter(e => e.offsetParent !== null && /откликнуться/i.test(e.textContent))
      .map(e => ({ tag: e.tagName, text: e.textContent.trim(), href: e.href || '', cls: e.className.substring(0, 80) }))
  );
  console.log('Кнопки "Откликнуться":', JSON.stringify(buttons, null, 2));

  // Кликаем первую кнопку "Откликнуться"
  const applyBtn = page.locator('a, button').filter({ hasText: /откликнуться/i }).first();
  const [response] = await Promise.all([
    page.waitForNavigation({ timeout: 10000 }).catch(() => null),
    applyBtn.click(),
  ]);
  await page.waitForLoadState('domcontentloaded');
  const vacancyUrl = page.url();
  console.log('URL после клика:', vacancyUrl);

  await page.screenshot({ path: 'screenshots/vacancy-01-page.png' });

  // Кнопки на странице вакансии
  const btns2 = await page.evaluate(() =>
    [...document.querySelectorAll('button, a')]
      .filter(e => e.offsetParent !== null && /откликнуться/i.test(e.textContent))
      .map(e => ({ tag: e.tagName, text: e.textContent.trim(), href: e.href || '', cls: e.className.substring(0, 80) }))
  );
  console.log('Кнопки "Откликнуться" на странице вакансии:', JSON.stringify(btns2, null, 2));

  // Кликаем "Откликнуться" на странице вакансии
  const applyBtn2 = page.locator('a, button').filter({ hasText: /откликнуться/i }).first();
  await applyBtn2.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'screenshots/vacancy-02-after-apply-click.png' });
  console.log('URL после второго клика:', page.url());

  // Исследуем форму
  const formInfo = await page.evaluate(() => {
    const forms = [...document.querySelectorAll('form')];
    const inputs = [...document.querySelectorAll('input, textarea, select')]
      .filter(e => e.offsetParent !== null && e.type !== 'hidden')
      .map(e => ({ tag: e.tagName, type: e.type, name: e.name, placeholder: e.placeholder, cls: e.className.substring(0, 60) }));
    const labels = [...document.querySelectorAll('label')]
      .filter(e => e.offsetParent !== null)
      .map(e => e.innerText.trim()).filter(t => t.length > 0);
    const headings = [...document.querySelectorAll('h1, h2, h3, h4')]
      .filter(e => e.offsetParent !== null)
      .map(e => e.innerText.trim());
    return { formsCount: forms.length, inputs, labels, headings };
  });
  console.log('Форм на странице:', formInfo.formsCount);
  console.log('Поля:', JSON.stringify(formInfo.inputs, null, 2));
  console.log('Лейблы:', JSON.stringify(formInfo.labels, null, 2));
  console.log('Заголовки:', JSON.stringify(formInfo.headings, null, 2));

  // Кнопки отправки
  const submitBtns = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter(e => e.offsetParent !== null)
      .map(e => ({ text: e.textContent.trim(), type: e.type, cls: e.className.substring(0, 60) }))
  );
  console.log('Кнопки на странице:', JSON.stringify(submitBtns, null, 2));
});

test('Вакансии — форма «Не нашли вакансию» исследование', async ({ page }) => {
  await page.goto(BASE_URL + '/vakansii');
  await page.waitForLoadState('domcontentloaded');
  await acceptCookies(page);

  // Ищем кнопку "Хочу на экскурсию" и похожие
  const allBtns = await page.evaluate(() =>
    [...document.querySelectorAll('button, a')]
      .filter(e => e.offsetParent !== null)
      .map(e => ({ tag: e.tagName, text: e.textContent.trim(), cls: e.className.substring(0, 80), href: e.href || '' }))
      .filter(e => e.text.length > 0)
  );
  console.log('Все кнопки и ссылки:', JSON.stringify(allBtns, null, 2));

  // Кликаем "Хочу на экскурсию"
  const btn = page.locator('button, a').filter({ hasText: /хочу на экскурсию/i }).first();
  const btnCount = await btn.count();
  console.log('Кнопок "Хочу на экскурсию":', btnCount);

  if (btnCount > 0) {
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    await page.waitForTimeout(1500);
    console.log('URL после клика:', page.url());
    await page.screenshot({ path: 'screenshots/no-vacancy-01-after-click.png' });

    // Исследуем форму
    const formInfo = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input, textarea, select')]
        .filter(e => e.offsetParent !== null && e.type !== 'hidden')
        .map(e => ({ tag: e.tagName, type: e.type, name: e.name, placeholder: e.placeholder, cls: e.className.substring(0, 60) }));
      const btns = [...document.querySelectorAll('button')]
        .filter(e => e.offsetParent !== null)
        .map(e => ({ text: e.textContent.trim(), type: e.type, cls: e.className.substring(0, 60) }));
      const headings = [...document.querySelectorAll('h1,h2,h3,h4,[class*="title"]')]
        .filter(e => e.offsetParent !== null && e.innerText.trim().length > 0)
        .map(e => ({ tag: e.tagName, cls: e.className.substring(0, 60), text: e.innerText.trim().substring(0, 80) }));
      return { inputs, btns, headings };
    });
    console.log('Поля формы:', JSON.stringify(formInfo.inputs, null, 2));
    console.log('Кнопки:', JSON.stringify(formInfo.btns, null, 2));
    console.log('Заголовки:', JSON.stringify(formInfo.headings, null, 2));
  }
});

test('Мобильная версия — нижний закреп на странице врача', async ({ page }) => {
  // Устанавливаем мобильный viewport (iPhone 14)
  await page.setViewportSize({ width: 390, height: 844 });

  // Находим первого врача на странице /vrachi
  await page.goto(BASE_URL + '/vrachi');
  await page.waitForLoadState('domcontentloaded');
  const cookieBtn = page.getByRole('button', { name: /принять/i });
  try { await cookieBtn.waitFor({ state: 'visible', timeout: 5000 }); await cookieBtn.click(); } catch {}

  // Собираем ссылки на врачей
  const doctorLinks = await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="/vrach/"]')]
      .filter(e => e.offsetParent !== null && e.href.match(/\/vrach\/[a-z]/))
      .map(e => e.href)
  );
  console.log('Первые 5 врачей:', doctorLinks.slice(0, 5));

  const firstDoctorUrl = doctorLinks[0];
  console.log('Переходим:', firstDoctorUrl);

  await page.goto(firstDoctorUrl);
  await page.waitForLoadState('domcontentloaded');
  await page.screenshot({ path: 'screenshots/mobile-01-doctor-page.png' });

  // Ищем нижнюю кнопку "Записаться на приём"
  const fixedBtns = await page.evaluate(() => {
    return [...document.querySelectorAll('button, a')]
      .filter(e => {
        const style = window.getComputedStyle(e);
        const isFixed = style.position === 'fixed' || style.position === 'sticky';
        return isFixed || e.closest('[style*="fixed"]') || e.closest('[class*="bottom"]') || e.closest('[class*="sticky"]') || e.closest('[class*="fixed"]');
      })
      .map(e => ({ tag: e.tagName, text: e.textContent.trim().substring(0, 60), cls: e.className.substring(0, 80), position: window.getComputedStyle(e).position }));
  });
  console.log('Зафиксированные кнопки:', JSON.stringify(fixedBtns, null, 2));

  // Все кнопки "Записаться"
  const allRecordBtns = await page.evaluate(() =>
    [...document.querySelectorAll('button, a')]
      .filter(e => e.offsetParent !== null && /записаться/i.test(e.textContent))
      .map(e => ({ tag: e.tagName, text: e.textContent.trim().substring(0, 60), cls: e.className.substring(0, 80), visible: e.getBoundingClientRect().top > 0 }))
  );
  console.log('Кнопки "Записаться":', JSON.stringify(allRecordBtns, null, 2));

  // Скроллим вниз страницы
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'screenshots/mobile-02-scrolled-bottom.png' });

  // Кнопки внизу экрана (y > 700 для 844px высоты)
  const bottomBtns = await page.evaluate(() =>
    [...document.querySelectorAll('button, a')]
      .filter(e => {
        const r = e.getBoundingClientRect();
        return r.top > 600 && r.width > 100 && e.textContent.trim().length > 0;
      })
      .map(e => ({ tag: e.tagName, text: e.textContent.trim().substring(0, 60), cls: e.className.substring(0, 80), top: Math.round(e.getBoundingClientRect().top) }))
  );
  console.log('Кнопки внизу экрана:', JSON.stringify(bottomBtns, null, 2));

  // Кликаем нижнюю кнопку "Записаться на приём"
  const bottomRecordBtn = page.locator('button, a').filter({ hasText: /записаться на приём/i }).last();
  const btnCount = await bottomRecordBtn.count();
  console.log('Кнопок "Записаться на приём":', btnCount);

  if (btnCount > 0) {
    await bottomRecordBtn.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'screenshots/mobile-03-before-click.png' });
    await bottomRecordBtn.click({ force: true });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/mobile-04-after-click.png' });

    // Что появилось?
    const modalInfo = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input')]
        .filter(e => e.offsetParent !== null && e.type !== 'hidden')
        .map(e => ({ type: e.type, name: e.name, placeholder: e.placeholder, cls: e.className.substring(0, 60) }));
      const btns = [...document.querySelectorAll('button')]
        .filter(e => e.offsetParent !== null)
        .map(e => ({ text: e.textContent.trim().substring(0, 60), type: e.type, cls: e.className.substring(0, 60) }));
      const title = [...document.querySelectorAll('*')]
        .filter(e => e.offsetParent !== null && /запись на приём/i.test(e.textContent) && e.children.length < 5)
        .map(e => ({ tag: e.tagName, cls: e.className.substring(0, 60), text: e.textContent.trim().substring(0, 80) }))
        .slice(0, 5);
      return { inputs, btns, title };
    });
    console.log('Поля модалки:', JSON.stringify(modalInfo.inputs, null, 2));
    console.log('Кнопки модалки:', JSON.stringify(modalInfo.btns, null, 2));
    console.log('Заголовки:', JSON.stringify(modalInfo.title, null, 2));
  }
});


test('МРТ и процедурный — изучение форм', async ({ page }) => {
  // --- МРТ ---
  await page.goto(BASE_URL + '/uslugi/mrt');
  await page.waitForLoadState('domcontentloaded');
  await acceptCookies(page);
  await page.screenshot({ path: 'screenshots/mrt-01-page.png' });

  const mrtSlots = await page.locator('.calendar-slot:visible').count();
  console.log('МРТ: видимых слотов:', mrtSlots);

  const mrtButtons = await page.evaluate(() =>
    [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => t.length > 0)
  );
  console.log('МРТ: кнопки:', JSON.stringify(mrtButtons.slice(0, 25)));

  if (mrtSlots > 0) {
    await page.locator('.calendar-slot:visible').first().click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/mrt-02-modal.png' });
    const fields = await page.evaluate(() =>
      [...document.querySelectorAll('input')].map(i => ({
        type: i.type, placeholder: i.placeholder, name: i.name, cls: i.className.substring(0, 60),
      })).filter(f => f.type !== 'hidden')
    );
    console.log('МРТ: поля в модалке:', JSON.stringify(fields, null, 2));
    const modalTitle = await page.evaluate(() => {
      const el = [...document.querySelectorAll('h2, h3, [class*="title"]')]
        .find(e => e.offsetParent !== null && e.innerText.trim().length > 2);
      return el ? el.innerText.trim() : 'не найдено';
    });
    console.log('МРТ: заголовок модалки:', modalTitle);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } else {
    const bookBtn = page.getByRole('button', { name: /записаться|запись|забронировать/i }).first();
    const hasBtn = await bookBtn.isVisible();
    console.log('МРТ: кнопка "Записаться" есть:', hasBtn);
    if (hasBtn) {
      await bookBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'screenshots/mrt-02-modal.png' });
    }
  }

  // --- Процедурный кабинет ---
  await page.goto(BASE_URL + '/uslugi/proczedurnyj-kabinet');
  await page.waitForLoadState('domcontentloaded');
  await acceptCookies(page);
  await page.screenshot({ path: 'screenshots/proc-01-page.png' });

  const procSlots = await page.locator('.calendar-slot:visible').count();
  console.log('Процедурный: видимых слотов:', procSlots);

  const procButtons = await page.evaluate(() =>
    [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => t.length > 0)
  );
  console.log('Процедурный: кнопки:', JSON.stringify(procButtons.slice(0, 25)));

  if (procSlots > 0) {
    await page.locator('.calendar-slot:visible').first().click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/proc-02-modal.png' });
    const fields = await page.evaluate(() =>
      [...document.querySelectorAll('input')].map(i => ({
        type: i.type, placeholder: i.placeholder, name: i.name, cls: i.className.substring(0, 60),
      })).filter(f => f.type !== 'hidden')
    );
    console.log('Процедурный: поля:', JSON.stringify(fields, null, 2));
    const modalTitle = await page.evaluate(() => {
      const el = [...document.querySelectorAll('h2, h3, [class*="title"]')]
        .find(e => e.offsetParent !== null && e.innerText.trim().length > 2);
      return el ? el.innerText.trim() : 'не найдено';
    });
    console.log('Процедурный: заголовок модалки:', modalTitle);
  }

  // --- Варианты оплаты ---
  await page.goto(BASE_URL + '/vrachi');
  await page.waitForLoadState('domcontentloaded');
  await acceptCookies(page);
  const paymentEl = await page.evaluate(() => {
    const all = [...document.querySelectorAll('*')];
    const found = all.filter(e => e.offsetParent !== null && /онлайн.{0,20}оплат|оплат.{0,20}онлайн/i.test(e.innerText) && e.children.length < 3);
    return found.map(e => e.innerText.trim().substring(0, 120));
  });
  console.log('Варианты оплаты на /vrachi:', paymentEl.slice(0, 10));
});
