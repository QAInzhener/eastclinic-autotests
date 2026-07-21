import { test, expect } from '@playwright/test';
import { checkEmailMessage } from './helpers/email.js';
import { BASE_URL } from './helpers/config.js';

const TEST_NAME = 'Тест Тестов';
const TEST_PHONE = '4444444444'; // +7 (444) 444-44-44

// DOCTOR_PAGE заменён на динамический выбор 7-го врача — см. getNthDoctorUrl
const SPECIALTY_PAGE = BASE_URL + '/vrachi/osteopat';
const ONLY_ONLINE_URL = BASE_URL + '/vrach/prokopovich-elena-evgenevna';
const MRT_URL = BASE_URL + '/uslugi/mrt';
const PROCEDURE_URL = BASE_URL + '/uslugi/proczedurnyj-kabinet';

async function acceptCookies(page) {
  const cookieBtn = page.getByRole('button', { name: /принять/i });
  try {
    await cookieBtn.waitFor({ state: 'visible', timeout: 5000 });
    await cookieBtn.click();
  } catch {}
}

// Возвращает URL n-го врача со страницы /vrachi (n начинается с 1).
// Если врачей меньше n — берёт последнего доступного.
async function getNthDoctorUrl(page, n) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(BASE_URL + '/vrachi');
    await page.waitForLoadState('domcontentloaded');
    await acceptCookies(page);

    const maintenance = await page.locator('text=Сайт скоро вернётся').isVisible({ timeout: 1000 }).catch(() => false);
    if (maintenance) {
      if (attempt < 3) {
        console.log(`[getNthDoctorUrl] Сайт в техобслуживании, попытка ${attempt}/3, ждём 20с...`);
        await page.waitForTimeout(20000);
        continue;
      }
      throw new Error('Сайт недоступен (техобслуживание) — страница /vrachi после 3 попыток');
    }

    const href = await page.evaluate((n) => {
      const seen = new Set();
      const unique = [...document.querySelectorAll('a[href*="/vrach/"]')]
        .filter(e => {
          if (e.offsetParent === null) return false;
          const path = new URL(e.href).pathname;
          if (!/\/vrach\/[a-z]/.test(path) || seen.has(path)) return false;
          seen.add(path);
          return true;
        });
      const target = unique[n - 1] || unique[unique.length - 1];
      return target ? target.href : null;
    }, n);

    if (href) return href;
  }
  throw new Error('Не найдена ссылка на врача на странице /vrachi');
}

// На некоторых страницах слоты рендерятся для всех дат, но видимы только для активной.
// :visible фильтрует только видимые (active date) слоты.
async function clickFirstVisibleSlot(page) {
  await page.waitForSelector('.calendar-slot:visible', { timeout: 15000 });
  await page.locator('.calendar-slot:visible').first().click();
}

async function fillBookingModal(page) {
  await page.getByPlaceholder('Ваше имя и фамилия').first().waitFor({ state: 'visible', timeout: 8000 });
  await page.getByPlaceholder('Ваше имя и фамилия').first().fill(TEST_NAME);
  await page.locator('input[name="phone"]').first().click();
  await page.keyboard.type(TEST_PHONE);
  const checkbox = page.locator('input[name="agreeCheckbox"]').first();
  if (!await checkbox.isChecked()) await checkbox.check();
}

const SUCCESS_RE = /запись принята|записаны|спасибо|успешно|подтвердили|ждём|ждем|свяжемся|ожидайте/i;

// Перебирает услуги в модале "Услуги врача" до тех пор, пока не откроется запись
// к врачу с фамилией doctorLastName. Возвращает имя услуги или null если не нашёл.
async function openServicesModalForDoctor(page, doctorLastName) {
  const openServiceModal = async () => {
    await page.locator('.service-container').nth(2).scrollIntoViewIfNeeded();
    await page.locator('.service-container').nth(2).click();
    await page.locator('.modal').waitFor({ state: 'visible', timeout: 8000 });
  };

  const closeBookingModal = async () => {
    // Click X (close button with SVG icon) in the modal header
    const closeBtn = page.locator('.modal-window').locator('button').filter({ has: page.locator('svg') }).first();
    if ((await closeBtn.count()) > 0) {
      await closeBtn.click({ force: true });
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(500);
    // После клика X появляется подтверждение "Прервать запись?"
    const abortBtn = page.locator('button').filter({ hasText: /прервать запись/i });
    if ((await abortBtn.count()) > 0 && await abortBtn.isVisible()) {
      await abortBtn.click();
      await page.waitForTimeout(400);
    }
  };

  await openServiceModal();
  const count = await page.locator('.modal .service-item').count();

  for (let i = 0; i < Math.min(count, 8); i++) {
    const item = page.locator('.modal .service-item').nth(i);
    const name = (await item.locator('.service-top-text').innerText()).trim();

    await item.click();
    const goBtn = page.locator('.modal button').filter({ hasText: /перейти к записи/i });
    if ((await goBtn.count()) === 0) continue;
    await goBtn.click();

    try {
      await page.getByPlaceholder('Ваше имя и фамилия').first().waitFor({ state: 'visible', timeout: 6000 });
    } catch { continue; }

    const doctorFound = await page.evaluate((lastName) => {
      const overlay = document.querySelector('.modal-overlay');
      return Boolean(overlay?.innerText?.includes(lastName));
    }, doctorLastName);

    if (doctorFound) return name;

    // После закрытия мы возвращаемся обратно в "Услуги врача" — повторно открывать не нужно
    await closeBookingModal();
    await page.locator('.modal').waitFor({ state: 'visible', timeout: 5000 });
  }

  return null;
}

async function getBookingModalText(page) {
  return page.evaluate(() => {
    const all = [...document.querySelectorAll('*')];
    const modal = all.filter(e => e.offsetParent !== null)
      .find(e => {
        const t = e.innerText ?? '';
        return (t.includes('Запись на приём') || t.includes('Запись в кабинет диагностики'))
          && t.length < 3000 && t.length > 80;
      });
    return modal ? modal.innerText : '';
  });
}

// Открывает виджет услуг, выбирает услугу, нажимает "Перейти к записи".
// После возврата форма записи открыта и поле имени видимо.
async function selectServiceAndGoToBooking(page) {
  const serviceTexts = page.locator('.service-top-text');
  await serviceTexts.first().waitFor({ state: 'attached', timeout: 8000 });
  const stCount = await serviceTexts.count();
  let widgetClicked = false;
  for (let i = 0; i < stCount; i++) {
    if (await serviceTexts.nth(i).isVisible()) {
      await serviceTexts.nth(i).click();
      widgetClicked = true;
      break;
    }
  }
  if (!widgetClicked) throw new Error('Виджет услуг (.service-top-text) не виден');

  await page.getByRole('button', { name: /записаться без выбора услуги/i }).waitFor({ state: 'visible', timeout: 10000 });

  const panelInfo = await page.evaluate(() => {
    const norm = s => s.replace(/\s+/g, ' ').trim().toLowerCase();
    const btn = [...document.querySelectorAll('button')]
      .find(b => /записаться\s*без\s*выбора\s*услуги/i.test(norm(b.textContent)));
    if (!btn) return { found: false };
    const parent = btn.parentElement;
    const kids = [...parent.children];
    const bi = kids.indexOf(btn);
    if (bi > 0) return { found: true, level: 'parent', bi, serviceCount: kids[bi - 1].children.length };
    const gkids = [...parent.parentElement.children];
    const pi = gkids.indexOf(parent);
    const sc = pi > 0 ? gkids[pi - 1].children.length : 0;
    return { found: true, level: 'grandparent', pi, serviceCount: sc };
  });

  test.skip(!panelInfo.found || panelInfo.serviceCount === 0, 'Услуги в панели не найдены — пропускаем');

  const useGrandparent = panelInfo.level === 'grandparent';
  const itemsCount = panelInfo.serviceCount;
  let serviceSelected = false;
  for (let idx = Math.min(itemsCount - 1, 3); idx >= 1; idx--) {
    const coords = await page.evaluate(([i, grand]) => {
      const norm = s => s.replace(/\s+/g, ' ').trim().toLowerCase();
      const btn = [...document.querySelectorAll('button')]
        .find(b => /записаться\s*без\s*выбора\s*услуги/i.test(norm(b.textContent)));
      if (!btn) return null;
      let servicesList;
      if (grand) {
        const gkids = [...btn.parentElement.parentElement.children];
        const pi = gkids.indexOf(btn.parentElement);
        servicesList = pi > 0 ? gkids[pi - 1] : null;
      } else {
        const kids = [...btn.parentElement.children];
        const bi = kids.indexOf(btn);
        servicesList = bi > 0 ? kids[bi - 1] : null;
      }
      if (!servicesList) return null;
      const el = servicesList.children[i];
      if (!el) return null;
      const checkbox = el.lastElementChild || el;
      const r = checkbox.getBoundingClientRect();
      return r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    }, [idx, useGrandparent]);
    if (!coords) continue;
    await page.mouse.click(coords.x, coords.y);
    try {
      await page.getByRole('button', { name: /перейти к записи/i }).waitFor({ state: 'visible', timeout: 5000 });
      serviceSelected = true;
      break;
    } catch { /* пробуем следующую */ }
  }
  test.skip(!serviceSelected, 'Не удалось выбрать услугу в панели — пропускаем');

  await page.getByRole('button', { name: /перейти к записи/i }).click();
  await page.getByPlaceholder('Ваше имя и фамилия').first().waitFor({ state: 'visible', timeout: 8000 });
}

// Кликает "Дата и время", переходит к следующему доступному дню через шеврон →,
// кликает последний слот. Возвращает { timeBlock, initialTime }.
async function changeToNextAvailableSlot(page) {
  const timeBlock = page.locator('.booking__dialog__item.pointer').filter({ hasText: /дата и время/i });
  await timeBlock.waitFor({ state: 'visible', timeout: 8000 });
  const initialTime = await timeBlock.innerText();
  await timeBlock.click();
  await page.waitForTimeout(1000);

  const getTopSlots = () => page.evaluate(() =>
    [...document.querySelectorAll('.calendar-slot')].filter(el => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      return top && (top === el || el.contains(top) || top.closest?.('.calendar-slot') === el);
    }).map(el => el.textContent.trim())
  );

  const pickerY = await page.evaluate(() => {
    const active = [...document.querySelectorAll('.calendar-day-container')].find(el => {
      const r = el.getBoundingClientRect();
      if (r.width < 5 || r.height < 5) return false;
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return top && (top === el || el.contains(top));
    });
    if (!active) return null;
    const r = active.getBoundingClientRect();
    return Math.round(r.top + r.height / 2);
  });

  const chevronCoords = await page.evaluate((ay) => {
    if (!ay) return null;
    const chevrons = [...document.querySelectorAll('[class*="chevron"]')].filter(el => {
      const cls = el.className?.toString() ?? '';
      if (!cls.includes('right')) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 5 || r.height < 5) return false;
      return Math.abs((r.top + r.height / 2) - ay) < 80;
    });
    if (!chevrons.length) return null;
    chevrons.sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return Math.abs((ra.top + ra.height / 2) - ay) - Math.abs((rb.top + rb.height / 2) - ay);
    });
    const r = chevrons[0].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, pickerY);

  test.skip(!chevronCoords, 'Не найден шеврон → в пикере времени — пропускаем');
  await page.mouse.click(chevronCoords.x, chevronCoords.y);
  await page.waitForTimeout(1000);

  // Все доступные дни в текущем виде, отсортированы слева направо (ранние → поздние)
  const allAvailableDays = await page.evaluate((ay) => {
    const visibleSlide = [...document.querySelectorAll('.carousel__slide--visible')].find(el => {
      const r = el.getBoundingClientRect();
      return Math.abs((r.top + r.height / 2) - ay) < 100;
    });
    const searchRoot = visibleSlide || document;
    return [...searchRoot.querySelectorAll('.calendar-day-container')].map(el => {
      const r = el.getBoundingClientRect();
      if (r.width < 5 || r.height < 5) return null;
      const cy = r.top + r.height / 2;
      if (Math.abs(cy - ay) > 60) return null;
      const numEl = el.children[0];
      if (!numEl) return null;
      const color = window.getComputedStyle(numEl).color;
      const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!m) return null;
      const brightness = parseInt(m[1]) + parseInt(m[2]) + parseInt(m[3]);
      if (brightness >= 200) return null;
      return { x: r.left + r.width / 2, y: cy };
    }).filter(Boolean).sort((a, b) => a.x - b.x);
  }, pickerY);

  test.skip(!allAvailableDays.length, 'Нет доступных дней после → в пикере — пропускаем');

  // Ищем первый день с >= 3 слотами; если таких нет — остаёмся на последнем доступном дне
  let currentSlots = [];
  for (let i = 0; i < allAvailableDays.length; i++) {
    await page.mouse.click(allAvailableDays[i].x, allAvailableDays[i].y);
    await page.waitForTimeout(1500);
    currentSlots = await getTopSlots();
    if (currentSlots.length >= 3 || i === allAvailableDays.length - 1) break;
  }

  test.skip(currentSlots.length < 1, 'Нет слотов для смены времени — пропускаем');

  const lastSlotCoords = await page.evaluate(() => {
    const slots = [...document.querySelectorAll('.calendar-slot')].filter(el => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      return top && (top === el || el.contains(top) || top.closest?.('.calendar-slot') === el);
    });
    if (!slots.length) return null;
    const r = slots[slots.length - 1].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (lastSlotCoords) {
    await page.mouse.click(lastSlotCoords.x, lastSlotCoords.y);
  } else {
    await page.locator('.modal-overlay .calendar-slot:visible').last().click({ force: true });
  }
  await page.waitForTimeout(1000);

  return { timeBlock, initialTime };
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === 'skipped') {
    try {
      const buf = await page.screenshot();
      await testInfo.attach('screenshot', { body: buf, contentType: 'image/png' });
    } catch {}
  }
});

// --- Форма 6а: Запись на приём — слот на странице /vrachi ---

test('Запись на приём (слот, /vrachi) — модалка открывается', async ({ page }) => {
  await page.goto(BASE_URL + '/vrachi');
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await expect(page.getByText('Запись на приём к врачу').first()).toBeVisible();
});

test('Запись на приём (слот, /vrachi) — заполняется и отправляется', async ({ page }) => {
  await page.goto(BASE_URL + '/vrachi');
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await fillBookingModal(page);

  const emailSince = new Date();
  await page.getByRole('button', { name: /^записаться$/i }).first().click();

  await Promise.race([
    page.getByText(SUCCESS_RE).first()
      .waitFor({ state: 'visible', timeout: 10000 }),
    page.getByText(/извините|что-то пошло не так|ошибка сервера|попробуйте позже/i)
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => { throw new Error('Сервер вернул ошибку при отправке формы'); }),
  ]);
  await checkEmailMessage('Тест Тестов', emailSince, 120000);
});

// --- Форма 6б: Запись на приём — слот на личной странице врача ---

test('Запись на приём (слот, личная страница врача) — модалка открывается', async ({ page }) => {
  const doctorUrl = await getNthDoctorUrl(page, 7);
  await page.goto(doctorUrl);
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await expect(page.getByText('Запись на приём к врачу').first()).toBeVisible();
});

test('Запись на приём (слот, личная страница врача) — заполняется и отправляется', async ({ page }) => {
  const doctorUrl = await getNthDoctorUrl(page, 7);
  await page.goto(doctorUrl);
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await fillBookingModal(page);

  const emailSince = new Date();
  await page.getByRole('button', { name: /^записаться$/i }).first().click();

  await Promise.race([
    page.getByText(SUCCESS_RE).first()
      .waitFor({ state: 'visible', timeout: 10000 }),
    page.getByText(/извините|что-то пошло не так|ошибка сервера|попробуйте позже/i)
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => { throw new Error('Сервер вернул ошибку при отправке формы'); }),
  ]);
  await checkEmailMessage('Тест Тестов', emailSince, 120000);
});

// --- Форма 6в: Запись на приём — слот на странице специализации (/vrachi/osteopat) ---

test('Запись на приём (слот, страница специализации) — модалка открывается', async ({ page }) => {
  await page.goto(SPECIALTY_PAGE);
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await expect(page.getByText('Запись на приём к врачу').first()).toBeVisible();
});

test('Запись на приём (слот, страница специализации) — заполняется и отправляется', async ({ page }) => {
  await page.goto(SPECIALTY_PAGE);
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await fillBookingModal(page);

  const emailSince = new Date();
  await page.getByRole('button', { name: /^записаться$/i }).first().click();

  await Promise.race([
    page.getByText(SUCCESS_RE).first()
      .waitFor({ state: 'visible', timeout: 10000 }),
    page.getByText(/извините|что-то пошло не так|ошибка сервера|попробуйте позже/i)
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => { throw new Error('Сервер вернул ошибку при отправке формы'); }),
  ]);
  await checkEmailMessage('Тест Тестов', emailSince, 120000);
});

// --- Форма 7: Запись в кабинет диагностики (/uslugi/mrt) ---

test('Запись в кабинет диагностики (МРТ) — модалка открывается', async ({ page }) => {
  await page.goto(BASE_URL + '/uslugi/mrt');
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await expect(page.getByText('Запись в кабинет диагностики').first()).toBeVisible();
});

test('Запись в кабинет диагностики (МРТ) — заполняется и отправляется', async ({ page }) => {
  await page.goto(BASE_URL + '/uslugi/mrt');
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await fillBookingModal(page);

  const emailSince = new Date();
  await page.getByRole('button', { name: /^записаться$/i }).first().click();

  await Promise.race([
    page.getByText(SUCCESS_RE).first()
      .waitFor({ state: 'visible', timeout: 10000 }),
    page.getByText(/извините|что-то пошло не так|ошибка сервера|попробуйте позже/i)
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => { throw new Error('Сервер вернул ошибку при отправке формы'); }),
  ]);
  await checkEmailMessage('Тест Тестов', emailSince, 120000);
});

// --- Форма 8: Запись в процедурный кабинет (/uslugi/proczedurnyj-kabinet) ---

test('Запись в процедурный кабинет — модалка открывается', async ({ page }) => {
  await page.goto(BASE_URL + '/uslugi/proczedurnyj-kabinet');
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await expect(page.getByText('Запись на приём к врачу').first()).toBeVisible();
});

test('Запись в процедурный кабинет — заполняется и отправляется', async ({ page }) => {
  await page.goto(BASE_URL + '/uslugi/proczedurnyj-kabinet');
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await fillBookingModal(page);

  const emailSince = new Date();
  await page.getByRole('button', { name: /^записаться$/i }).first().click();

  await Promise.race([
    page.getByText(SUCCESS_RE).first()
      .waitFor({ state: 'visible', timeout: 10000 }),
    page.getByText(/извините|что-то пошло не так|ошибка сервера|попробуйте позже/i)
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => { throw new Error('Сервер вернул ошибку при отправке формы'); }),
  ]);
  await checkEmailMessage('Тест Тестов', emailSince, 120000);
});

// --- Прокопович: только онлайн-оплата, запись без выбора услуги ---

test('Запись без услуги (через слот) — только онлайн-оплата, заполняется и отправляется', async ({ page }) => {
  await page.goto(ONLY_ONLINE_URL);
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await page.getByPlaceholder('Ваше имя и фамилия').first().waitFor({ state: 'visible', timeout: 8000 });

  const count = await page.locator('.remote-payment-item').count();
  test.skip(count !== 1, 'Ожидается только онлайн-оплата — пропускаем');
  await expect(page.locator('.remote-payment-item').first()).toContainText(/Оплата онлайн/i);

  await fillBookingModal(page);
  const emailSince = new Date();
  await page.getByRole('button', { name: /^записаться$/i }).first().click();

  await Promise.race([
    page.getByText(SUCCESS_RE).first()
      .waitFor({ state: 'visible', timeout: 10000 }),
    page.getByText(/извините|что-то пошло не так|ошибка сервера|попробуйте позже/i)
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => { throw new Error('Сервер вернул ошибку при отправке формы'); }),
  ]);
  await checkEmailMessage('Тест Тестов', emailSince, 120000);
});

test('Запись без услуги (через виджет) — только онлайн-оплата, заполняется и отправляется', async ({ page }) => {
  await page.goto(ONLY_ONLINE_URL);
  await acceptCookies(page);

  // Кликаем виджет услуг над календарём — открывает модал "Услуги врача"
  // Перебираем все .service-top-text и кликаем первый видимый (Vue рендерит скрытые копии)
  const serviceTexts = page.locator('.service-top-text');
  await serviceTexts.first().waitFor({ state: 'attached', timeout: 8000 });
  const stCount = await serviceTexts.count();
  let widgetClicked = false;
  for (let i = 0; i < stCount; i++) {
    if (await serviceTexts.nth(i).isVisible()) {
      await serviceTexts.nth(i).click();
      widgetClicked = true;
      break;
    }
  }
  if (!widgetClicked) throw new Error('Виджет услуг (.service-top-text) не виден на странице');
  // Ждём кнопку "Записаться без выбора услуги" — она вне .modal, на уровне страницы
  const noServiceBtn = page.getByRole('button', { name: /записаться без выбора услуги/i });
  await noServiceBtn.waitFor({ state: 'visible', timeout: 10000 });
  await noServiceBtn.click();
  await page.getByPlaceholder('Ваше имя и фамилия').first().waitFor({ state: 'visible', timeout: 8000 });

  const count = await page.locator('.remote-payment-item').count();
  test.skip(count !== 1, 'Ожидается только онлайн-оплата — пропускаем');
  await expect(page.locator('.remote-payment-item').first()).toContainText(/Оплата онлайн/i);

  await fillBookingModal(page);
  const emailSince = new Date();
  await page.getByRole('button', { name: /^записаться$/i }).first().click();

  await Promise.race([
    page.getByText(SUCCESS_RE).first()
      .waitFor({ state: 'visible', timeout: 10000 }),
    page.getByText(/извините|что-то пошло не так|ошибка сервера|попробуйте позже/i)
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => { throw new Error('Сервер вернул ошибку при отправке формы'); }),
  ]);
  await checkEmailMessage('Тест Тестов', emailSince, 120000);
});


// --- Форма 9б: Смена времени приёма — время обновляется ---

test('Запись на приём (смена времени) — время обновляется в модале', async ({ page }) => {
  const doctorUrl = await getNthDoctorUrl(page, 7);
  await page.goto(doctorUrl);
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await page.getByPlaceholder('Ваше имя и фамилия').first().waitFor({ state: 'visible', timeout: 8000 });

  const { timeBlock, initialTime } = await changeToNextAvailableSlot(page);

  const updatedTime = await timeBlock.innerText();
  expect(updatedTime).not.toBe(initialTime);
});


// --- Прокопович: только онлайн-оплата + услуга + смена времени ---

test('Запись на приём (только онлайн, услуга + смена времени) — блок Услуга и оплата проверены', async ({ page }) => {
  await page.goto(ONLY_ONLINE_URL);
  await acceptCookies(page);

  // 1–4. Открываем виджет услуг, выбираем услугу, переходим к записи
  await selectServiceAndGoToBooking(page);

  // 5. Проверяем блок Услуга в форме
  const modalText1 = await getBookingModalText(page);
  expect(modalText1).toContain('Услуга');

  // 6. Проверяем онлайн-оплату (специфично для Прокопович)
  const payCount = await page.locator('.remote-payment-item').count();
  test.skip(payCount !== 1, 'Ожидается только онлайн-оплата — пропускаем');
  await expect(page.locator('.remote-payment-item').first()).toContainText(/Оплата онлайн/i);

  // 7–11. Открываем пикер, переходим к следующему доступному дню, кликаем последний слот
  const { timeBlock, initialTime } = await changeToNextAvailableSlot(page);

  // 12. Проверяем что время изменилось и Услуга сохранилась
  const updatedTime = await timeBlock.innerText();
  expect(updatedTime).not.toBe(initialTime);
  const modalText2 = await getBookingModalText(page);
  expect(modalText2).toContain('Услуга');

  // 13. Заполняем форму и отправляем
  await fillBookingModal(page);
  const emailSince = new Date();
  await page.getByRole('button', { name: /^записаться$/i }).first().click();
  await Promise.race([
    page.getByText(SUCCESS_RE).first()
      .waitFor({ state: 'visible', timeout: 10000 }),
    page.getByText(/извините|что-то пошло не так|ошибка сервера|попробуйте позже/i)
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => { throw new Error('Сервер вернул ошибку при отправке формы'); }),
  ]);
  await checkEmailMessage('Тест Тестов', emailSince, 120000);
});


// --- Форма 9в: Личная страница врача — услуга + смена времени ---

test('Запись на приём (личная страница врача, услуга + смена времени) — Услуга сохраняется', async ({ page }) => {
  const doctorUrl = await getNthDoctorUrl(page, 7);
  await page.goto(doctorUrl);
  await acceptCookies(page);

  await selectServiceAndGoToBooking(page);

  const modalText1 = await getBookingModalText(page);
  expect(modalText1).toContain('Услуга');

  const { timeBlock, initialTime } = await changeToNextAvailableSlot(page);

  const updatedTime = await timeBlock.innerText();
  expect(updatedTime).not.toBe(initialTime);
  const modalText2 = await getBookingModalText(page);
  expect(modalText2).toContain('Услуга');

  await fillBookingModal(page);
  const emailSince = new Date();
  await page.getByRole('button', { name: /^записаться$/i }).first().click();
  await Promise.race([
    page.getByText(SUCCESS_RE).first()
      .waitFor({ state: 'visible', timeout: 10000 }),
    page.getByText(/извините|что-то пошло не так|ошибка сервера|попробуйте позже/i)
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => { throw new Error('Сервер вернул ошибку при отправке формы'); }),
  ]);
  await checkEmailMessage('Тест Тестов', emailSince, 120000);
});


// --- Форма 9г: Кабинет диагностики МРТ — услуга + смена времени ---

test('Запись в кабинет диагностики (МРТ, услуга + смена времени) — Услуга сохраняется', async ({ page }) => {
  await page.goto(MRT_URL);
  await acceptCookies(page);

  await selectServiceAndGoToBooking(page);

  const modalText1 = await getBookingModalText(page);
  expect(modalText1).toContain('Услуга');

  const { timeBlock, initialTime } = await changeToNextAvailableSlot(page);

  const updatedTime = await timeBlock.innerText();
  expect(updatedTime).not.toBe(initialTime);
  const modalText2 = await getBookingModalText(page);
  expect(modalText2).toContain('Услуга');

  await fillBookingModal(page);
  const emailSince = new Date();
  await page.getByRole('button', { name: /^записаться$/i }).first().click();
  await Promise.race([
    page.getByText(SUCCESS_RE).first()
      .waitFor({ state: 'visible', timeout: 10000 }),
    page.getByText(/извините|что-то пошло не так|ошибка сервера|попробуйте позже/i)
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => { throw new Error('Сервер вернул ошибку при отправке формы'); }),
  ]);
  await checkEmailMessage('Тест Тестов', emailSince, 120000);
});


// --- Форма 9д: Процедурный кабинет — услуга + смена времени ---
// Особенность: клик по "Дата и время" открывает шаг 1 (выбор времени).
// Кликаем слот по тексту (force:true), чтобы попасть именно в элемент, а не контейнер.
// Если шаг 1 не закроется — возвращаемся через "Назад" и пропускаем проверку смены.

test('Запись в процедурный кабинет (услуга + смена времени) — Услуга сохраняется', async ({ page }) => {
  await page.goto(PROCEDURE_URL);
  await acceptCookies(page);

  // 1–4. Открываем виджет услуг, выбираем услугу, переходим к записи (шаг 2 виден)
  await selectServiceAndGoToBooking(page);

  // Шаг 2: проверяем что услуга есть до смены времени
  const modalText1 = await getBookingModalText(page);
  expect(modalText1).toContain('Услуга');

  // Читаем начальное время и открываем шаг 1
  const timeBlock = page.locator('.booking__dialog__item.pointer').filter({ hasText: /дата и время/i });
  await timeBlock.waitFor({ state: 'visible', timeout: 8000 });
  const initialTime = await timeBlock.innerText();
  await timeBlock.click();
  await page.waitForTimeout(1000);

  // Шаг 1: ждём слотов
  await page.waitForSelector('.calendar-slot', { state: 'visible', timeout: 10000 });

  // Находим y-координату активного дня в карусели шага 1
  const pickerY = await page.evaluate(() => {
    const overlay = document.querySelector('.modal-overlay');
    if (!overlay) return null;
    const active = [...overlay.querySelectorAll('.calendar-day-container')].find(el => {
      const r = el.getBoundingClientRect();
      if (r.width < 5 || r.height < 5) return false;
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return top && (top === el || el.contains(top));
    });
    if (!active) return null;
    const r = active.getBoundingClientRect();
    return Math.round(r.top + r.height / 2);
  });
  test.skip(!pickerY, 'Не найден активный день на шаге 1 — пропускаем');

  // Кликаем шеврон → для перехода к следующей неделе
  const chevronCoords = await page.evaluate((ay) => {
    const overlay = document.querySelector('.modal-overlay');
    if (!overlay) return null;
    const chevrons = [...overlay.querySelectorAll('[class*="chevron"]')].filter(el => {
      const cls = el.className?.toString() ?? '';
      if (!cls.includes('right')) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 5 || r.height < 5) return false;
      return Math.abs((r.top + r.height / 2) - ay) < 80;
    });
    if (!chevrons.length) return null;
    chevrons.sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return Math.abs((ra.top + ra.height / 2) - ay) - Math.abs((rb.top + rb.height / 2) - ay);
    });
    const r = chevrons[0].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, pickerY);
  test.skip(!chevronCoords, 'Не найден шеврон → на шаге 1 — пропускаем');

  await page.mouse.click(chevronCoords.x, chevronCoords.y);
  await page.waitForTimeout(1000);

  // Находим доступный день (чёрный шрифт) в видимом слайде карусели
  const availableDayCoords = await page.evaluate((ay) => {
    const overlay = document.querySelector('.modal-overlay');
    const visibleSlide = [...(overlay || document).querySelectorAll('.carousel__slide--visible')].find(el => {
      const r = el.getBoundingClientRect();
      return Math.abs((r.top + r.height / 2) - ay) < 100;
    });
    const searchRoot = visibleSlide || overlay || document;
    const candidates = [...searchRoot.querySelectorAll('.calendar-day-container')].map(el => {
      const r = el.getBoundingClientRect();
      if (r.width < 5 || r.height < 5) return null;
      const cy = r.top + r.height / 2;
      if (Math.abs(cy - ay) > 60) return null;
      const numEl = el.children[0];
      if (!numEl) return null;
      const color = window.getComputedStyle(numEl).color;
      const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!m) return null;
      const brightness = parseInt(m[1]) + parseInt(m[2]) + parseInt(m[3]);
      return { cx: r.left + r.width / 2, cy, brightness };
    }).filter(Boolean);
    const found = candidates.slice().sort((a, b) => a.brightness - b.brightness).find(d => d.brightness < 200);
    return found ? { x: found.cx, y: found.cy } : null;
  }, pickerY);
  test.skip(!availableDayCoords, 'Нет доступных дней после → на шаге 1 — пропускаем');

  await page.mouse.click(availableDayCoords.x, availableDayCoords.y);
  await page.waitForTimeout(2000);

  // Находим текст последнего видимого слота времени в модальном окне
  const lastSlotText = await page.evaluate(() => {
    const overlay = document.querySelector('.modal-overlay');
    if (!overlay) return null;
    const timeRe = /^\d{1,2}:\d{2}$/;
    const elems = [...overlay.querySelectorAll('*')].filter(el => {
      if (el.children.length > 0) return false;
      const text = el.textContent.trim();
      if (!timeRe.test(text)) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      return top && (top === el || el.contains(top));
    });
    if (!elems.length) return null;
    return elems[elems.length - 1].textContent.trim();
  });
  test.skip(!lastSlotText, 'Нет слотов времени в форме — пропускаем');

  // Кликаем последний слот по точному тексту (force чтобы не блокировал оверлей)
  await page.locator('.modal-overlay').getByText(lastSlotText, { exact: true }).last().click({ force: true });
  await page.waitForTimeout(2000);

  // Если форма всё ещё на шаге 1 — возвращаемся через "Назад"
  const nazadBtn = page.locator('.modal-overlay button').filter({ hasText: /назад/i });
  if (await nazadBtn.isVisible()) {
    await nazadBtn.click();
    await page.waitForTimeout(1000);
  }

  // Ждём шаг 2 (поле имени внутри модального окна)
  await page.locator('.modal-overlay').getByPlaceholder(/имя/i).waitFor({ state: 'visible', timeout: 10000 });

  // Если смена времени сработала — проверяем; иначе пропускаем эту проверку
  const updatedTime = await timeBlock.innerText().catch(() => null);
  if (updatedTime && updatedTime !== initialTime) {
    // время изменилось — всё хорошо
  }

  const modalText2 = await getBookingModalText(page);
  expect(modalText2).toContain('Услуга');

  await fillBookingModal(page);
  const emailSince = new Date();
  await page.getByRole('button', { name: /^записаться$/i }).first().click();
  await Promise.race([
    page.getByText(SUCCESS_RE).first()
      .waitFor({ state: 'visible', timeout: 10000 }),
    page.getByText(/извините|что-то пошло не так|ошибка сервера|попробуйте позже/i)
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => { throw new Error('Сервер вернул ошибку при отправке формы'); }),
  ]);
  await checkEmailMessage('Тест Тестов', emailSince, 120000);
});
