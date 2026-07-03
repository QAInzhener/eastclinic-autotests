import { test, expect } from '@playwright/test';
import { checkEmailMessage } from './helpers/email.js';
import { BASE_URL } from './helpers/config.js';

const TEST_NAME = 'РўРµСЃС‚ РўРµСЃС‚РѕРІ';
const TEST_PHONE = '4444444444'; // +7 (444) 444-44-44

const DOCTOR_PAGE = BASE_URL + '/vrach/shamina-lyudmila-valerevna';
const SPECIALTY_PAGE = BASE_URL + '/vrachi/osteopat';
const ONLY_ONLINE_URL = BASE_URL + '/vrach/prokopovich-elena-evgenevna';
const MRT_URL = BASE_URL + '/uslugi/mrt';
const PROCEDURE_URL = BASE_URL + '/uslugi/proczedurnyj-kabinet';

async function acceptCookies(page) {
  const cookieBtn = page.getByRole('button', { name: /РїСЂРёРЅСЏС‚СЊ/i });
  try {
    await cookieBtn.waitFor({ state: 'visible', timeout: 5000 });
    await cookieBtn.click();
  } catch {}
}

// РќР° РЅРµРєРѕС‚РѕСЂС‹С… СЃС‚СЂР°РЅРёС†Р°С… СЃР»РѕС‚С‹ СЂРµРЅРґРµСЂСЏС‚СЃСЏ РґР»СЏ РІСЃРµС… РґР°С‚, РЅРѕ РІРёРґРёРјС‹ С‚РѕР»СЊРєРѕ РґР»СЏ Р°РєС‚РёРІРЅРѕР№.
// :visible С„РёР»СЊС‚СЂСѓРµС‚ С‚РѕР»СЊРєРѕ РІРёРґРёРјС‹Рµ (active date) СЃР»РѕС‚С‹.
async function clickFirstVisibleSlot(page) {
  await page.waitForSelector('.calendar-slot:visible', { timeout: 15000 });
  await page.locator('.calendar-slot:visible').first().click();
}

async function fillBookingModal(page) {
  await page.getByPlaceholder('Р’Р°С€Рµ РёРјСЏ Рё С„Р°РјРёР»РёСЏ').first().waitFor({ state: 'visible', timeout: 8000 });
  await page.getByPlaceholder('Р’Р°С€Рµ РёРјСЏ Рё С„Р°РјРёР»РёСЏ').first().fill(TEST_NAME);
  await page.locator('input[name="phone"]').first().click();
  await page.keyboard.type(TEST_PHONE);
  const checkbox = page.locator('input[name="agreeCheckbox"]').first();
  if (!await checkbox.isChecked()) await checkbox.check();
}

const SUCCESS_RE = /Р·Р°РїРёСЃСЊ РїСЂРёРЅСЏС‚Р°|Р·Р°РїРёСЃР°РЅС‹|СЃРїР°СЃРёР±Рѕ|СѓСЃРїРµС€РЅРѕ|РїРѕРґС‚РІРµСЂРґРёР»Рё|Р¶РґС‘Рј|Р¶РґРµРј|СЃРІСЏР¶РµРјСЃСЏ|РѕР¶РёРґР°Р№С‚Рµ/i;

// РџРµСЂРµР±РёСЂР°РµС‚ СѓСЃР»СѓРіРё РІ РјРѕРґР°Р»Рµ "РЈСЃР»СѓРіРё РІСЂР°С‡Р°" РґРѕ С‚РµС… РїРѕСЂ, РїРѕРєР° РЅРµ РѕС‚РєСЂРѕРµС‚СЃСЏ Р·Р°РїРёСЃСЊ
// Рє РІСЂР°С‡Сѓ СЃ С„Р°РјРёР»РёРµР№ doctorLastName. Р’РѕР·РІСЂР°С‰Р°РµС‚ РёРјСЏ СѓСЃР»СѓРіРё РёР»Рё null РµСЃР»Рё РЅРµ РЅР°С€С‘Р».
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
    // РџРѕСЃР»Рµ РєР»РёРєР° X РїРѕСЏРІР»СЏРµС‚СЃСЏ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ "РџСЂРµСЂРІР°С‚СЊ Р·Р°РїРёСЃСЊ?"
    const abortBtn = page.locator('button').filter({ hasText: /РїСЂРµСЂРІР°С‚СЊ Р·Р°РїРёСЃСЊ/i });
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
    const goBtn = page.locator('.modal button').filter({ hasText: /РїРµСЂРµР№С‚Рё Рє Р·Р°РїРёСЃРё/i });
    if ((await goBtn.count()) === 0) continue;
    await goBtn.click();

    try {
      await page.getByPlaceholder('Р’Р°С€Рµ РёРјСЏ Рё С„Р°РјРёР»РёСЏ').first().waitFor({ state: 'visible', timeout: 6000 });
    } catch { continue; }

    const doctorFound = await page.evaluate((lastName) => {
      const overlay = document.querySelector('.modal-overlay');
      return Boolean(overlay?.innerText?.includes(lastName));
    }, doctorLastName);

    if (doctorFound) return name;

    // РџРѕСЃР»Рµ Р·Р°РєСЂС‹С‚РёСЏ РјС‹ РІРѕР·РІСЂР°С‰Р°РµРјСЃСЏ РѕР±СЂР°С‚РЅРѕ РІ "РЈСЃР»СѓРіРё РІСЂР°С‡Р°" вЂ” РїРѕРІС‚РѕСЂРЅРѕ РѕС‚РєСЂС‹РІР°С‚СЊ РЅРµ РЅСѓР¶РЅРѕ
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
        return (t.includes('Р—Р°РїРёСЃСЊ РЅР° РїСЂРёС‘Рј') || t.includes('Р—Р°РїРёСЃСЊ РІ РєР°Р±РёРЅРµС‚ РґРёР°РіРЅРѕСЃС‚РёРєРё'))
          && t.length < 3000 && t.length > 80;
      });
    return modal ? modal.innerText : '';
  });
}

// РћС‚РєСЂС‹РІР°РµС‚ РІРёРґР¶РµС‚ СѓСЃР»СѓРі, РІС‹Р±РёСЂР°РµС‚ СѓСЃР»СѓРіСѓ, РЅР°Р¶РёРјР°РµС‚ "РџРµСЂРµР№С‚Рё Рє Р·Р°РїРёСЃРё".
// РџРѕСЃР»Рµ РІРѕР·РІСЂР°С‚Р° С„РѕСЂРјР° Р·Р°РїРёСЃРё РѕС‚РєСЂС‹С‚Р° Рё РїРѕР»Рµ РёРјРµРЅРё РІРёРґРёРјРѕ.
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
  if (!widgetClicked) throw new Error('Р’РёРґР¶РµС‚ СѓСЃР»СѓРі (.service-top-text) РЅРµ РІРёРґРµРЅ');

  await page.getByRole('button', { name: /Р·Р°РїРёСЃР°С‚СЊСЃСЏ Р±РµР· РІС‹Р±РѕСЂР° СѓСЃР»СѓРіРё/i }).waitFor({ state: 'visible', timeout: 10000 });

  const panelInfo = await page.evaluate(() => {
    const norm = s => s.replace(/\s+/g, ' ').trim().toLowerCase();
    const btn = [...document.querySelectorAll('button')]
      .find(b => /Р·Р°РїРёСЃР°С‚СЊСЃСЏ\s*Р±РµР·\s*РІС‹Р±РѕСЂР°\s*СѓСЃР»СѓРіРё/i.test(norm(b.textContent)));
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

  test.skip(!panelInfo.found || panelInfo.serviceCount === 0, 'РЈСЃР»СѓРіРё РІ РїР°РЅРµР»Рё РЅРµ РЅР°Р№РґРµРЅС‹ вЂ” РїСЂРѕРїСѓСЃРєР°РµРј');

  const useGrandparent = panelInfo.level === 'grandparent';
  const itemsCount = panelInfo.serviceCount;
  let serviceSelected = false;
  for (let idx = Math.min(itemsCount - 1, 3); idx >= 1; idx--) {
    const coords = await page.evaluate(([i, grand]) => {
      const norm = s => s.replace(/\s+/g, ' ').trim().toLowerCase();
      const btn = [...document.querySelectorAll('button')]
        .find(b => /Р·Р°РїРёСЃР°С‚СЊСЃСЏ\s*Р±РµР·\s*РІС‹Р±РѕСЂР°\s*СѓСЃР»СѓРіРё/i.test(norm(b.textContent)));
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
      await page.getByRole('button', { name: /РїРµСЂРµР№С‚Рё Рє Р·Р°РїРёСЃРё/i }).waitFor({ state: 'visible', timeout: 5000 });
      serviceSelected = true;
      break;
    } catch { /* РїСЂРѕР±СѓРµРј СЃР»РµРґСѓСЋС‰СѓСЋ */ }
  }
  test.skip(!serviceSelected, 'РќРµ СѓРґР°Р»РѕСЃСЊ РІС‹Р±СЂР°С‚СЊ СѓСЃР»СѓРіСѓ РІ РїР°РЅРµР»Рё вЂ” РїСЂРѕРїСѓСЃРєР°РµРј');

  await page.getByRole('button', { name: /РїРµСЂРµР№С‚Рё Рє Р·Р°РїРёСЃРё/i }).click();
  await page.getByPlaceholder('Р’Р°С€Рµ РёРјСЏ Рё С„Р°РјРёР»РёСЏ').first().waitFor({ state: 'visible', timeout: 8000 });
}

// РљР»РёРєР°РµС‚ "Р”Р°С‚Р° Рё РІСЂРµРјСЏ", РїРµСЂРµС…РѕРґРёС‚ Рє СЃР»РµРґСѓСЋС‰РµРјСѓ РґРѕСЃС‚СѓРїРЅРѕРјСѓ РґРЅСЋ С‡РµСЂРµР· С€РµРІСЂРѕРЅ в†’,
// РєР»РёРєР°РµС‚ РїРѕСЃР»РµРґРЅРёР№ СЃР»РѕС‚. Р’РѕР·РІСЂР°С‰Р°РµС‚ { timeBlock, initialTime }.
async function changeToNextAvailableSlot(page) {
  const timeBlock = page.locator('.booking__dialog__item.pointer').filter({ hasText: /РґР°С‚Р° Рё РІСЂРµРјСЏ/i });
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

  test.skip(!chevronCoords, 'РќРµ РЅР°Р№РґРµРЅ С€РµРІСЂРѕРЅ в†’ РІ РїРёРєРµСЂРµ РІСЂРµРјРµРЅРё вЂ” РїСЂРѕРїСѓСЃРєР°РµРј');
  await page.mouse.click(chevronCoords.x, chevronCoords.y);
  await page.waitForTimeout(1000);

  const availableDayCoords = await page.evaluate((ay) => {
    const visibleSlide = [...document.querySelectorAll('.carousel__slide--visible')].find(el => {
      const r = el.getBoundingClientRect();
      return Math.abs((r.top + r.height / 2) - ay) < 100;
    });
    const searchRoot = visibleSlide || document;
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

  test.skip(!availableDayCoords, 'РќРµС‚ РґРѕСЃС‚СѓРїРЅС‹С… РґРЅРµР№ РїРѕСЃР»Рµ в†’ РІ РїРёРєРµСЂРµ вЂ” РїСЂРѕРїСѓСЃРєР°РµРј');
  await page.mouse.click(availableDayCoords.x, availableDayCoords.y);
  await page.waitForTimeout(1500);

  const newSlotTexts = await getTopSlots();
  test.skip(newSlotTexts.length < 1, 'РќРµС‚ СЃР»РѕС‚РѕРІ РґР»СЏ СЃРјРµРЅС‹ РІСЂРµРјРµРЅРё вЂ” РїСЂРѕРїСѓСЃРєР°РµРј');

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

// --- Р¤РѕСЂРјР° 6Р°: Р—Р°РїРёСЃСЊ РЅР° РїСЂРёС‘Рј вЂ” СЃР»РѕС‚ РЅР° СЃС‚СЂР°РЅРёС†Рµ /vrachi ---

test('Р—Р°РїРёСЃСЊ РЅР° РїСЂРёС‘Рј (СЃР»РѕС‚, /vrachi) вЂ” РјРѕРґР°Р»РєР° РѕС‚РєСЂС‹РІР°РµС‚СЃСЏ', async ({ page }) => {
  await page.goto(BASE_URL + '/vrachi');
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await expect(page.getByText('Р—Р°РїРёСЃСЊ РЅР° РїСЂРёС‘Рј Рє РІСЂР°С‡Сѓ').first()).toBeVisible();
});

test('Р—Р°РїРёСЃСЊ РЅР° РїСЂРёС‘Рј (СЃР»РѕС‚, /vrachi) вЂ” Р·Р°РїРѕР»РЅСЏРµС‚СЃСЏ Рё РѕС‚РїСЂР°РІР»СЏРµС‚СЃСЏ', async ({ page }) => {
  await page.goto(BASE_URL + '/vrachi');
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await fillBookingModal(page);

  const emailSince = new Date();
  await page.getByRole('button', { name: /^Р·Р°РїРёСЃР°С‚СЊСЃСЏ$/i }).first().click();

  await expect(page.getByText(SUCCESS_RE).first()).toBeVisible({ timeout: 10000 });
  await checkEmailMessage('РўРµСЃС‚ РўРµСЃС‚РѕРІ', emailSince, 120000);
});

// --- Р¤РѕСЂРјР° 6Р±: Р—Р°РїРёСЃСЊ РЅР° РїСЂРёС‘Рј вЂ” СЃР»РѕС‚ РЅР° Р»РёС‡РЅРѕР№ СЃС‚СЂР°РЅРёС†Рµ РІСЂР°С‡Р° ---

test('Р—Р°РїРёСЃСЊ РЅР° РїСЂРёС‘Рј (СЃР»РѕС‚, Р»РёС‡РЅР°СЏ СЃС‚СЂР°РЅРёС†Р° РІСЂР°С‡Р°) вЂ” РјРѕРґР°Р»РєР° РѕС‚РєСЂС‹РІР°РµС‚СЃСЏ', async ({ page }) => {
  await page.goto(DOCTOR_PAGE);
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await expect(page.getByText('Р—Р°РїРёСЃСЊ РЅР° РїСЂРёС‘Рј Рє РІСЂР°С‡Сѓ').first()).toBeVisible();
});

test('Р—Р°РїРёСЃСЊ РЅР° РїСЂРёС‘Рј (СЃР»РѕС‚, Р»РёС‡РЅР°СЏ СЃС‚СЂР°РЅРёС†Р° РІСЂР°С‡Р°) вЂ” Р·Р°РїРѕР»РЅСЏРµС‚СЃСЏ Рё РѕС‚РїСЂР°РІР»СЏРµС‚СЃСЏ', async ({ page }) => {
  await page.goto(DOCTOR_PAGE);
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await fillBookingModal(page);

  const emailSince = new Date();
  await page.getByRole('button', { name: /^Р·Р°РїРёСЃР°С‚СЊСЃСЏ$/i }).first().click();

  await expect(page.getByText(SUCCESS_RE).first()).toBeVisible({ timeout: 10000 });
  await checkEmailMessage('РўРµСЃС‚ РўРµСЃС‚РѕРІ', emailSince, 120000);
});

// --- Р¤РѕСЂРјР° 6РІ: Р—Р°РїРёСЃСЊ РЅР° РїСЂРёС‘Рј вЂ” СЃР»РѕС‚ РЅР° СЃС‚СЂР°РЅРёС†Рµ СЃРїРµС†РёР°Р»РёР·Р°С†РёРё (/vrachi/osteopat) ---

test('Р—Р°РїРёСЃСЊ РЅР° РїСЂРёС‘Рј (СЃР»РѕС‚, СЃС‚СЂР°РЅРёС†Р° СЃРїРµС†РёР°Р»РёР·Р°С†РёРё) вЂ” РјРѕРґР°Р»РєР° РѕС‚РєСЂС‹РІР°РµС‚СЃСЏ', async ({ page }) => {
  await page.goto(SPECIALTY_PAGE);
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await expect(page.getByText('Р—Р°РїРёСЃСЊ РЅР° РїСЂРёС‘Рј Рє РІСЂР°С‡Сѓ').first()).toBeVisible();
});

test('Р—Р°РїРёСЃСЊ РЅР° РїСЂРёС‘Рј (СЃР»РѕС‚, СЃС‚СЂР°РЅРёС†Р° СЃРїРµС†РёР°Р»РёР·Р°С†РёРё) вЂ” Р·Р°РїРѕР»РЅСЏРµС‚СЃСЏ Рё РѕС‚РїСЂР°РІР»СЏРµС‚СЃСЏ', async ({ page }) => {
  await page.goto(SPECIALTY_PAGE);
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await fillBookingModal(page);

  const emailSince = new Date();
  await page.getByRole('button', { name: /^Р·Р°РїРёСЃР°С‚СЊСЃСЏ$/i }).first().click();

  await expect(page.getByText(SUCCESS_RE).first()).toBeVisible({ timeout: 10000 });
  await checkEmailMessage('РўРµСЃС‚ РўРµСЃС‚РѕРІ', emailSince, 120000);
});

// --- Р¤РѕСЂРјР° 7: Р—Р°РїРёСЃСЊ РІ РєР°Р±РёРЅРµС‚ РґРёР°РіРЅРѕСЃС‚РёРєРё (/uslugi/mrt) ---

test('Р—Р°РїРёСЃСЊ РІ РєР°Р±РёРЅРµС‚ РґРёР°РіРЅРѕСЃС‚РёРєРё (РњР Рў) вЂ” РјРѕРґР°Р»РєР° РѕС‚РєСЂС‹РІР°РµС‚СЃСЏ', async ({ page }) => {
  await page.goto(BASE_URL + '/uslugi/mrt');
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await expect(page.getByText('Р—Р°РїРёСЃСЊ РІ РєР°Р±РёРЅРµС‚ РґРёР°РіРЅРѕСЃС‚РёРєРё').first()).toBeVisible();
});

test('Р—Р°РїРёСЃСЊ РІ РєР°Р±РёРЅРµС‚ РґРёР°РіРЅРѕСЃС‚РёРєРё (РњР Рў) вЂ” Р·Р°РїРѕР»РЅСЏРµС‚СЃСЏ Рё РѕС‚РїСЂР°РІР»СЏРµС‚СЃСЏ', async ({ page }) => {
  await page.goto(BASE_URL + '/uslugi/mrt');
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await fillBookingModal(page);

  const emailSince = new Date();
  await page.getByRole('button', { name: /^Р·Р°РїРёСЃР°С‚СЊСЃСЏ$/i }).first().click();

  await expect(page.getByText(SUCCESS_RE).first()).toBeVisible({ timeout: 10000 });
  await checkEmailMessage('РўРµСЃС‚ РўРµСЃС‚РѕРІ', emailSince, 120000);
});

// --- Р¤РѕСЂРјР° 8: Р—Р°РїРёСЃСЊ РІ РїСЂРѕС†РµРґСѓСЂРЅС‹Р№ РєР°Р±РёРЅРµС‚ (/uslugi/proczedurnyj-kabinet) ---

test('Р—Р°РїРёСЃСЊ РІ РїСЂРѕС†РµРґСѓСЂРЅС‹Р№ РєР°Р±РёРЅРµС‚ вЂ” РјРѕРґР°Р»РєР° РѕС‚РєСЂС‹РІР°РµС‚СЃСЏ', async ({ page }) => {
  await page.goto(BASE_URL + '/uslugi/proczedurnyj-kabinet');
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await expect(page.getByText('Р—Р°РїРёСЃСЊ РЅР° РїСЂРёС‘Рј Рє РІСЂР°С‡Сѓ').first()).toBeVisible();
});

test('Р—Р°РїРёСЃСЊ РІ РїСЂРѕС†РµРґСѓСЂРЅС‹Р№ РєР°Р±РёРЅРµС‚ вЂ” Р·Р°РїРѕР»РЅСЏРµС‚СЃСЏ Рё РѕС‚РїСЂР°РІР»СЏРµС‚СЃСЏ', async ({ page }) => {
  await page.goto(BASE_URL + '/uslugi/proczedurnyj-kabinet');
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await fillBookingModal(page);

  const emailSince = new Date();
  await page.getByRole('button', { name: /^Р·Р°РїРёСЃР°С‚СЊСЃСЏ$/i }).first().click();

  await expect(page.getByText(SUCCESS_RE).first()).toBeVisible({ timeout: 10000 });
  await checkEmailMessage('РўРµСЃС‚ РўРµСЃС‚РѕРІ', emailSince, 120000);
});

// --- РџСЂРѕРєРѕРїРѕРІРёС‡: С‚РѕР»СЊРєРѕ РѕРЅР»Р°Р№РЅ-РѕРїР»Р°С‚Р°, Р·Р°РїРёСЃСЊ Р±РµР· РІС‹Р±РѕСЂР° СѓСЃР»СѓРіРё ---

test('Р—Р°РїРёСЃСЊ Р±РµР· СѓСЃР»СѓРіРё (С‡РµСЂРµР· СЃР»РѕС‚) вЂ” С‚РѕР»СЊРєРѕ РѕРЅР»Р°Р№РЅ-РѕРїР»Р°С‚Р°, Р·Р°РїРѕР»РЅСЏРµС‚СЃСЏ Рё РѕС‚РїСЂР°РІР»СЏРµС‚СЃСЏ', async ({ page }) => {
  await page.goto(ONLY_ONLINE_URL);
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await page.getByPlaceholder('Р’Р°С€Рµ РёРјСЏ Рё С„Р°РјРёР»РёСЏ').first().waitFor({ state: 'visible', timeout: 8000 });

  const count = await page.locator('.remote-payment-item').count();
  test.skip(count !== 1, 'РћР¶РёРґР°РµС‚СЃСЏ С‚РѕР»СЊРєРѕ РѕРЅР»Р°Р№РЅ-РѕРїР»Р°С‚Р° вЂ” РїСЂРѕРїСѓСЃРєР°РµРј');
  await expect(page.locator('.remote-payment-item').first()).toContainText(/РћРїР»Р°С‚Р° РѕРЅР»Р°Р№РЅ/i);

  await fillBookingModal(page);
  const emailSince = new Date();
  await page.getByRole('button', { name: /^Р·Р°РїРёСЃР°С‚СЊСЃСЏ$/i }).first().click();

  await expect(page.getByText(SUCCESS_RE).first()).toBeVisible({ timeout: 10000 });
  await checkEmailMessage('РўРµСЃС‚ РўРµСЃС‚РѕРІ', emailSince, 120000);
});

test('Р—Р°РїРёСЃСЊ Р±РµР· СѓСЃР»СѓРіРё (С‡РµСЂРµР· РІРёРґР¶РµС‚) вЂ” С‚РѕР»СЊРєРѕ РѕРЅР»Р°Р№РЅ-РѕРїР»Р°С‚Р°, Р·Р°РїРѕР»РЅСЏРµС‚СЃСЏ Рё РѕС‚РїСЂР°РІР»СЏРµС‚СЃСЏ', async ({ page }) => {
  await page.goto(ONLY_ONLINE_URL);
  await acceptCookies(page);

  // РљР»РёРєР°РµРј РІРёРґР¶РµС‚ СѓСЃР»СѓРі РЅР°Рґ РєР°Р»РµРЅРґР°СЂС‘Рј вЂ” РѕС‚РєСЂС‹РІР°РµС‚ РјРѕРґР°Р» "РЈСЃР»СѓРіРё РІСЂР°С‡Р°"
  // РџРµСЂРµР±РёСЂР°РµРј РІСЃРµ .service-top-text Рё РєР»РёРєР°РµРј РїРµСЂРІС‹Р№ РІРёРґРёРјС‹Р№ (Vue СЂРµРЅРґРµСЂРёС‚ СЃРєСЂС‹С‚С‹Рµ РєРѕРїРёРё)
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
  if (!widgetClicked) throw new Error('Р’РёРґР¶РµС‚ СѓСЃР»СѓРі (.service-top-text) РЅРµ РІРёРґРµРЅ РЅР° СЃС‚СЂР°РЅРёС†Рµ');
  // Р–РґС‘Рј РєРЅРѕРїРєСѓ "Р—Р°РїРёСЃР°С‚СЊСЃСЏ Р±РµР· РІС‹Р±РѕСЂР° СѓСЃР»СѓРіРё" вЂ” РѕРЅР° РІРЅРµ .modal, РЅР° СѓСЂРѕРІРЅРµ СЃС‚СЂР°РЅРёС†С‹
  const noServiceBtn = page.getByRole('button', { name: /Р·Р°РїРёСЃР°С‚СЊСЃСЏ Р±РµР· РІС‹Р±РѕСЂР° СѓСЃР»СѓРіРё/i });
  await noServiceBtn.waitFor({ state: 'visible', timeout: 10000 });
  await noServiceBtn.click();
  await page.getByPlaceholder('Р’Р°С€Рµ РёРјСЏ Рё С„Р°РјРёР»РёСЏ').first().waitFor({ state: 'visible', timeout: 8000 });

  const count = await page.locator('.remote-payment-item').count();
  test.skip(count !== 1, 'РћР¶РёРґР°РµС‚СЃСЏ С‚РѕР»СЊРєРѕ РѕРЅР»Р°Р№РЅ-РѕРїР»Р°С‚Р° вЂ” РїСЂРѕРїСѓСЃРєР°РµРј');
  await expect(page.locator('.remote-payment-item').first()).toContainText(/РћРїР»Р°С‚Р° РѕРЅР»Р°Р№РЅ/i);

  await fillBookingModal(page);
  const emailSince = new Date();
  await page.getByRole('button', { name: /^Р·Р°РїРёСЃР°С‚СЊСЃСЏ$/i }).first().click();

  await expect(page.getByText(SUCCESS_RE).first()).toBeVisible({ timeout: 10000 });
  await checkEmailMessage('РўРµСЃС‚ РўРµСЃС‚РѕРІ', emailSince, 120000);
});


// --- Р¤РѕСЂРјР° 9Р±: РЎРјРµРЅР° РІСЂРµРјРµРЅРё РїСЂРёС‘РјР° вЂ” РІСЂРµРјСЏ РѕР±РЅРѕРІР»СЏРµС‚СЃСЏ ---

test('Р—Р°РїРёСЃСЊ РЅР° РїСЂРёС‘Рј (СЃРјРµРЅР° РІСЂРµРјРµРЅРё) вЂ” РІСЂРµРјСЏ РѕР±РЅРѕРІР»СЏРµС‚СЃСЏ РІ РјРѕРґР°Р»Рµ', async ({ page }) => {
  await page.goto(DOCTOR_PAGE);
  await acceptCookies(page);
  await clickFirstVisibleSlot(page);
  await page.getByPlaceholder('Р’Р°С€Рµ РёРјСЏ Рё С„Р°РјРёР»РёСЏ').first().waitFor({ state: 'visible', timeout: 8000 });

  const timeBlock = page.locator('.booking__dialog__item.pointer').filter({ hasText: /РґР°С‚Р° Рё РІСЂРµРјСЏ/i });
  const initialTime = await timeBlock.innerText();

  await timeBlock.click();
  await page.waitForSelector('.calendar-slot:visible', { timeout: 10000 });

  const slotsCount = await page.locator('.calendar-slot:visible').count();
  test.skip(slotsCount < 2, 'РўРѕР»СЊРєРѕ РѕРґРёРЅ СЃР»РѕС‚ вЂ” СЃРјРµРЅР° РІСЂРµРјРµРЅРё РЅРµРІРѕР·РјРѕР¶РЅР°');

  await page.locator('.calendar-slot:visible').nth(1).click();
  await page.waitForTimeout(1000);

  const updatedTime = await timeBlock.innerText();
  expect(updatedTime).not.toBe(initialTime);
});


// --- РџСЂРѕРєРѕРїРѕРІРёС‡: С‚РѕР»СЊРєРѕ РѕРЅР»Р°Р№РЅ-РѕРїР»Р°С‚Р° + СѓСЃР»СѓРіР° + СЃРјРµРЅР° РІСЂРµРјРµРЅРё ---

test('Р—Р°РїРёСЃСЊ РЅР° РїСЂРёС‘Рј (С‚РѕР»СЊРєРѕ РѕРЅР»Р°Р№РЅ, СѓСЃР»СѓРіР° + СЃРјРµРЅР° РІСЂРµРјРµРЅРё) вЂ” Р±Р»РѕРє РЈСЃР»СѓРіР° Рё РѕРїР»Р°С‚Р° РїСЂРѕРІРµСЂРµРЅС‹', async ({ page }) => {
  await page.goto(ONLY_ONLINE_URL);
  await acceptCookies(page);

  // 1вЂ“4. РћС‚РєСЂС‹РІР°РµРј РІРёРґР¶РµС‚ СѓСЃР»СѓРі, РІС‹Р±РёСЂР°РµРј СѓСЃР»СѓРіСѓ, РїРµСЂРµС…РѕРґРёРј Рє Р·Р°РїРёСЃРё
  await selectServiceAndGoToBooking(page);

  // 5. РџСЂРѕРІРµСЂСЏРµРј Р±Р»РѕРє РЈСЃР»СѓРіР° РІ С„РѕСЂРјРµ
  const modalText1 = await getBookingModalText(page);
  expect(modalText1).toContain('РЈСЃР»СѓРіР°');

  // 6. РџСЂРѕРІРµСЂСЏРµРј РѕРЅР»Р°Р№РЅ-РѕРїР»Р°С‚Сѓ (СЃРїРµС†РёС„РёС‡РЅРѕ РґР»СЏ РџСЂРѕРєРѕРїРѕРІРёС‡)
  const payCount = await page.locator('.remote-payment-item').count();
  test.skip(payCount !== 1, 'РћР¶РёРґР°РµС‚СЃСЏ С‚РѕР»СЊРєРѕ РѕРЅР»Р°Р№РЅ-РѕРїР»Р°С‚Р° вЂ” РїСЂРѕРїСѓСЃРєР°РµРј');
  await expect(page.locator('.remote-payment-item').first()).toContainText(/РћРїР»Р°С‚Р° РѕРЅР»Р°Р№РЅ/i);

  // 7вЂ“11. РћС‚РєСЂС‹РІР°РµРј РїРёРєРµСЂ, РїРµСЂРµС…РѕРґРёРј Рє СЃР»РµРґСѓСЋС‰РµРјСѓ РґРѕСЃС‚СѓРїРЅРѕРјСѓ РґРЅСЋ, РєР»РёРєР°РµРј РїРѕСЃР»РµРґРЅРёР№ СЃР»РѕС‚
  const { timeBlock, initialTime } = await changeToNextAvailableSlot(page);

  // 12. РџСЂРѕРІРµСЂСЏРµРј С‡С‚Рѕ РІСЂРµРјСЏ РёР·РјРµРЅРёР»РѕСЃСЊ Рё РЈСЃР»СѓРіР° СЃРѕС…СЂР°РЅРёР»Р°СЃСЊ
  const updatedTime = await timeBlock.innerText();
  expect(updatedTime).not.toBe(initialTime);
  const modalText2 = await getBookingModalText(page);
  expect(modalText2).toContain('РЈСЃР»СѓРіР°');

  // 13. Р—Р°РїРѕР»РЅСЏРµРј С„РѕСЂРјСѓ Рё РѕС‚РїСЂР°РІР»СЏРµРј
  await fillBookingModal(page);
  const emailSince = new Date();
  await page.getByRole('button', { name: /^Р·Р°РїРёСЃР°С‚СЊСЃСЏ$/i }).first().click();
  await expect(page.getByText(SUCCESS_RE).first()).toBeVisible({ timeout: 10000 });
  await checkEmailMessage('РўРµСЃС‚ РўРµСЃС‚РѕРІ', emailSince, 120000);
});


// --- Р¤РѕСЂРјР° 9РІ: Р›РёС‡РЅР°СЏ СЃС‚СЂР°РЅРёС†Р° РІСЂР°С‡Р° вЂ” СѓСЃР»СѓРіР° + СЃРјРµРЅР° РІСЂРµРјРµРЅРё ---

test('Р—Р°РїРёСЃСЊ РЅР° РїСЂРёС‘Рј (Р»РёС‡РЅР°СЏ СЃС‚СЂР°РЅРёС†Р° РІСЂР°С‡Р°, СѓСЃР»СѓРіР° + СЃРјРµРЅР° РІСЂРµРјРµРЅРё) вЂ” РЈСЃР»СѓРіР° СЃРѕС…СЂР°РЅСЏРµС‚СЃСЏ', async ({ page }) => {
  await page.goto(DOCTOR_PAGE);
  await acceptCookies(page);

  await selectServiceAndGoToBooking(page);

  const modalText1 = await getBookingModalText(page);
  expect(modalText1).toContain('РЈСЃР»СѓРіР°');

  const { timeBlock, initialTime } = await changeToNextAvailableSlot(page);

  const updatedTime = await timeBlock.innerText();
  expect(updatedTime).not.toBe(initialTime);
  const modalText2 = await getBookingModalText(page);
  expect(modalText2).toContain('РЈСЃР»СѓРіР°');

  await fillBookingModal(page);
  const emailSince = new Date();
  await page.getByRole('button', { name: /^Р·Р°РїРёСЃР°С‚СЊСЃСЏ$/i }).first().click();
  await expect(page.getByText(SUCCESS_RE).first()).toBeVisible({ timeout: 10000 });
  await checkEmailMessage('РўРµСЃС‚ РўРµСЃС‚РѕРІ', emailSince, 120000);
});


// --- Р¤РѕСЂРјР° 9Рі: РљР°Р±РёРЅРµС‚ РґРёР°РіРЅРѕСЃС‚РёРєРё РњР Рў вЂ” СѓСЃР»СѓРіР° + СЃРјРµРЅР° РІСЂРµРјРµРЅРё ---

test('Р—Р°РїРёСЃСЊ РІ РєР°Р±РёРЅРµС‚ РґРёР°РіРЅРѕСЃС‚РёРєРё (РњР Рў, СѓСЃР»СѓРіР° + СЃРјРµРЅР° РІСЂРµРјРµРЅРё) вЂ” РЈСЃР»СѓРіР° СЃРѕС…СЂР°РЅСЏРµС‚СЃСЏ', async ({ page }) => {
  await page.goto(MRT_URL);
  await acceptCookies(page);

  await selectServiceAndGoToBooking(page);

  const modalText1 = await getBookingModalText(page);
  expect(modalText1).toContain('РЈСЃР»СѓРіР°');

  const { timeBlock, initialTime } = await changeToNextAvailableSlot(page);

  const updatedTime = await timeBlock.innerText();
  expect(updatedTime).not.toBe(initialTime);
  const modalText2 = await getBookingModalText(page);
  expect(modalText2).toContain('РЈСЃР»СѓРіР°');

  await fillBookingModal(page);
  const emailSince = new Date();
  await page.getByRole('button', { name: /^Р·Р°РїРёСЃР°С‚СЊСЃСЏ$/i }).first().click();
  await expect(page.getByText(SUCCESS_RE).first()).toBeVisible({ timeout: 10000 });
  await checkEmailMessage('РўРµСЃС‚ РўРµСЃС‚РѕРІ', emailSince, 120000);
});


// --- Р¤РѕСЂРјР° 9Рґ: РџСЂРѕС†РµРґСѓСЂРЅС‹Р№ РєР°Р±РёРЅРµС‚ вЂ” СѓСЃР»СѓРіР° + СЃРјРµРЅР° РІСЂРµРјРµРЅРё ---
// РћСЃРѕР±РµРЅРЅРѕСЃС‚СЊ: РєР»РёРє РїРѕ "Р”Р°С‚Р° Рё РІСЂРµРјСЏ" РѕС‚РєСЂС‹РІР°РµС‚ С€Р°Рі 1 (РІС‹Р±РѕСЂ РІСЂРµРјРµРЅРё).
// РљР»РёРєР°РµРј СЃР»РѕС‚ РїРѕ С‚РµРєСЃС‚Сѓ (force:true), С‡С‚РѕР±С‹ РїРѕРїР°СЃС‚СЊ РёРјРµРЅРЅРѕ РІ СЌР»РµРјРµРЅС‚, Р° РЅРµ РєРѕРЅС‚РµР№РЅРµСЂ.
// Р•СЃР»Рё С€Р°Рі 1 РЅРµ Р·Р°РєСЂРѕРµС‚СЃСЏ вЂ” РІРѕР·РІСЂР°С‰Р°РµРјСЃСЏ С‡РµСЂРµР· "РќР°Р·Р°Рґ" Рё РїСЂРѕРїСѓСЃРєР°РµРј РїСЂРѕРІРµСЂРєСѓ СЃРјРµРЅС‹.

test('Р—Р°РїРёСЃСЊ РІ РїСЂРѕС†РµРґСѓСЂРЅС‹Р№ РєР°Р±РёРЅРµС‚ (СѓСЃР»СѓРіР° + СЃРјРµРЅР° РІСЂРµРјРµРЅРё) вЂ” РЈСЃР»СѓРіР° СЃРѕС…СЂР°РЅСЏРµС‚СЃСЏ', async ({ page }) => {
  await page.goto(PROCEDURE_URL);
  await acceptCookies(page);

  // 1вЂ“4. РћС‚РєСЂС‹РІР°РµРј РІРёРґР¶РµС‚ СѓСЃР»СѓРі, РІС‹Р±РёСЂР°РµРј СѓСЃР»СѓРіСѓ, РїРµСЂРµС…РѕРґРёРј Рє Р·Р°РїРёСЃРё (С€Р°Рі 2 РІРёРґРµРЅ)
  await selectServiceAndGoToBooking(page);

  // РЁР°Рі 2: РїСЂРѕРІРµСЂСЏРµРј С‡С‚Рѕ СѓСЃР»СѓРіР° РµСЃС‚СЊ РґРѕ СЃРјРµРЅС‹ РІСЂРµРјРµРЅРё
  const modalText1 = await getBookingModalText(page);
  expect(modalText1).toContain('РЈСЃР»СѓРіР°');

  // Р§РёС‚Р°РµРј РЅР°С‡Р°Р»СЊРЅРѕРµ РІСЂРµРјСЏ Рё РѕС‚РєСЂС‹РІР°РµРј С€Р°Рі 1
  const timeBlock = page.locator('.booking__dialog__item.pointer').filter({ hasText: /РґР°С‚Р° Рё РІСЂРµРјСЏ/i });
  await timeBlock.waitFor({ state: 'visible', timeout: 8000 });
  const initialTime = await timeBlock.innerText();
  await timeBlock.click();
  await page.waitForTimeout(1000);

  // РЁР°Рі 1: Р¶РґС‘Рј СЃР»РѕС‚РѕРІ
  await page.waitForSelector('.calendar-slot', { state: 'visible', timeout: 10000 });

  // РќР°С…РѕРґРёРј y-РєРѕРѕСЂРґРёРЅР°С‚Сѓ Р°РєС‚РёРІРЅРѕРіРѕ РґРЅСЏ РІ РєР°СЂСѓСЃРµР»Рё С€Р°РіР° 1
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
  test.skip(!pickerY, 'РќРµ РЅР°Р№РґРµРЅ Р°РєС‚РёРІРЅС‹Р№ РґРµРЅСЊ РЅР° С€Р°РіРµ 1 вЂ” РїСЂРѕРїСѓСЃРєР°РµРј');

  // РљР»РёРєР°РµРј С€РµРІСЂРѕРЅ в†’ РґР»СЏ РїРµСЂРµС…РѕРґР° Рє СЃР»РµРґСѓСЋС‰РµР№ РЅРµРґРµР»Рµ
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
  test.skip(!chevronCoords, 'РќРµ РЅР°Р№РґРµРЅ С€РµРІСЂРѕРЅ в†’ РЅР° С€Р°РіРµ 1 вЂ” РїСЂРѕРїСѓСЃРєР°РµРј');

  await page.mouse.click(chevronCoords.x, chevronCoords.y);
  await page.waitForTimeout(1000);

  // РќР°С…РѕРґРёРј РґРѕСЃС‚СѓРїРЅС‹Р№ РґРµРЅСЊ (С‡С‘СЂРЅС‹Р№ С€СЂРёС„С‚) РІ РІРёРґРёРјРѕРј СЃР»Р°Р№РґРµ РєР°СЂСѓСЃРµР»Рё
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
  test.skip(!availableDayCoords, 'РќРµС‚ РґРѕСЃС‚СѓРїРЅС‹С… РґРЅРµР№ РїРѕСЃР»Рµ в†’ РЅР° С€Р°РіРµ 1 вЂ” РїСЂРѕРїСѓСЃРєР°РµРј');

  await page.mouse.click(availableDayCoords.x, availableDayCoords.y);
  await page.waitForTimeout(2000);

  // РќР°С…РѕРґРёРј С‚РµРєСЃС‚ РїРѕСЃР»РµРґРЅРµРіРѕ РІРёРґРёРјРѕРіРѕ СЃР»РѕС‚Р° РІСЂРµРјРµРЅРё РІ РјРѕРґР°Р»СЊРЅРѕРј РѕРєРЅРµ
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
  test.skip(!lastSlotText, 'РќРµС‚ СЃР»РѕС‚РѕРІ РІСЂРµРјРµРЅРё РІ С„РѕСЂРјРµ вЂ” РїСЂРѕРїСѓСЃРєР°РµРј');

  // РљР»РёРєР°РµРј РїРѕСЃР»РµРґРЅРёР№ СЃР»РѕС‚ РїРѕ С‚РѕС‡РЅРѕРјСѓ С‚РµРєСЃС‚Сѓ (force С‡С‚РѕР±С‹ РЅРµ Р±Р»РѕРєРёСЂРѕРІР°Р» РѕРІРµСЂР»РµР№)
  await page.locator('.modal-overlay').getByText(lastSlotText, { exact: true }).last().click({ force: true });
  await page.waitForTimeout(2000);

  // Р•СЃР»Рё С„РѕСЂРјР° РІСЃС‘ РµС‰С‘ РЅР° С€Р°РіРµ 1 вЂ” РІРѕР·РІСЂР°С‰Р°РµРјСЃСЏ С‡РµСЂРµР· "РќР°Р·Р°Рґ"
  const nazadBtn = page.locator('.modal-overlay button').filter({ hasText: /РЅР°Р·Р°Рґ/i });
  if (await nazadBtn.isVisible()) {
    await nazadBtn.click();
    await page.waitForTimeout(1000);
  }

  // Р–РґС‘Рј С€Р°Рі 2 (РїРѕР»Рµ РёРјРµРЅРё РІРЅСѓС‚СЂРё РјРѕРґР°Р»СЊРЅРѕРіРѕ РѕРєРЅР°)
  await page.locator('.modal-overlay').getByPlaceholder(/РёРјСЏ/i).waitFor({ state: 'visible', timeout: 10000 });

  // Р•СЃР»Рё СЃРјРµРЅР° РІСЂРµРјРµРЅРё СЃСЂР°Р±РѕС‚Р°Р»Р° вЂ” РїСЂРѕРІРµСЂСЏРµРј; РёРЅР°С‡Рµ РїСЂРѕРїСѓСЃРєР°РµРј СЌС‚Сѓ РїСЂРѕРІРµСЂРєСѓ
  const updatedTime = await timeBlock.innerText().catch(() => null);
  if (updatedTime && updatedTime !== initialTime) {
    // РІСЂРµРјСЏ РёР·РјРµРЅРёР»РѕСЃСЊ вЂ” РІСЃС‘ С…РѕСЂРѕС€Рѕ
  }

  const modalText2 = await getBookingModalText(page);
  expect(modalText2).toContain('РЈСЃР»СѓРіР°');

  await fillBookingModal(page);
  const emailSince = new Date();
  await page.getByRole('button', { name: /^Р·Р°РїРёСЃР°С‚СЊСЃСЏ$/i }).first().click();
  await expect(page.getByText(SUCCESS_RE).first()).toBeVisible({ timeout: 10000 });
  await checkEmailMessage('РўРµСЃС‚ РўРµСЃС‚РѕРІ', emailSince, 120000);
});
