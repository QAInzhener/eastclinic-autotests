import { test, expect } from '@playwright/test';
import { checkEmailMessage } from './helpers/email.js';
import { BASE_URL } from './helpers/config.js';

const TEST_NAME = 'РўРµСЃС‚ РўРµСЃС‚РѕРІ';
const TEST_PHONE = '4444444444'; // +7 (444) 444-44-44

const MOBILE_VIEWPORT = { width: 390, height: 844 };

async function acceptCookies(page) {
  const cookieBtn = page.getByRole('button', { name: /РїСЂРёРЅСЏС‚СЊ/i });
  try {
    await cookieBtn.waitFor({ state: 'visible', timeout: 5000 });
    await cookieBtn.click();
  } catch {}
}

// Р’РѕР·РІСЂР°С‰Р°РµС‚ URL РїРµСЂРІРѕРіРѕ РІСЂР°С‡Р° СЃРѕ СЃС‚СЂР°РЅРёС†С‹ /vrachi
async function getFirstDoctorUrl(page) {
  await page.goto(BASE_URL + '/vrachi');
  await page.waitForLoadState('domcontentloaded');
  await acceptCookies(page);

  const href = await page.evaluate(() => {
    const link = [...document.querySelectorAll('a[href*="/vrach/"]')]
      .find(e => e.offsetParent !== null && /\/vrach\/[a-z]/.test(new URL(e.href).pathname));
    return link ? link.href : null;
  });

  if (!href) throw new Error('РќРµ РЅР°Р№РґРµРЅР° СЃСЃС‹Р»РєР° РЅР° РІСЂР°С‡Р° РЅР° СЃС‚СЂР°РЅРёС†Рµ /vrachi');
  return href;
}

// --- РњРѕР±РёР»СЊРЅР°СЏ С„РѕСЂРјР°: РЅРёР¶РЅРёР№ Р·Р°РєСЂРµРї РЅР° СЃС‚СЂР°РЅРёС†Рµ РІСЂР°С‡Р° ---

test('РњРѕР±РёР»СЊРЅР°СЏ С„РѕСЂРјР° "Р—Р°РїРёСЃР°С‚СЊСЃСЏ РЅР° РїСЂРёС‘Рј" (РЅРёР¶РЅРёР№ Р·Р°РєСЂРµРї) вЂ” РѕС‚РєСЂС‹РІР°РµС‚СЃСЏ', async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);

  const doctorUrl = await getFirstDoctorUrl(page);
  await page.goto(doctorUrl);
  await page.waitForLoadState('domcontentloaded');

  // РќРёР¶РЅРёР№ Р·Р°РєСЂРµРї "Р—Р°РїРёСЃР°С‚СЊСЃСЏ РЅР° РїСЂРёС‘Рј"
  const bottomBtn = page.locator('button.banner-button').filter({ hasText: /Р·Р°РїРёСЃР°С‚СЊСЃСЏ РЅР° РїСЂРёС‘Рј/i });
  await bottomBtn.waitFor({ state: 'visible', timeout: 8000 });
  await bottomBtn.click({ force: true });

  // РџСЂРѕРІРµСЂСЏРµРј РѕС‚РєСЂС‹С‚РёРµ РјРѕРґР°Р»РєРё
  await expect(page.locator('input[name="fio"]')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('input[name="phone"]')).toBeVisible();
});

test('РњРѕР±РёР»СЊРЅР°СЏ С„РѕСЂРјР° "Р—Р°РїРёСЃР°С‚СЊСЃСЏ РЅР° РїСЂРёС‘Рј" (РЅРёР¶РЅРёР№ Р·Р°РєСЂРµРї) вЂ” Р·Р°РїРѕР»РЅСЏРµС‚СЃСЏ Рё РѕС‚РїСЂР°РІР»СЏРµС‚СЃСЏ', async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);

  const doctorUrl = await getFirstDoctorUrl(page);
  await page.goto(doctorUrl);
  await page.waitForLoadState('domcontentloaded');

  // РќР°Р¶РёРјР°РµРј РЅРёР¶РЅРёР№ Р·Р°РєСЂРµРї "Р—Р°РїРёСЃР°С‚СЊСЃСЏ РЅР° РїСЂРёС‘Рј"
  const bottomBtn = page.locator('button.banner-button').filter({ hasText: /Р·Р°РїРёСЃР°С‚СЊСЃСЏ РЅР° РїСЂРёС‘Рј/i });
  await bottomBtn.waitFor({ state: 'visible', timeout: 8000 });
  await bottomBtn.click({ force: true });

  // Р—Р°РїРѕР»РЅСЏРµРј С„РѕСЂРјСѓ
  await page.locator('input[name="fio"]').waitFor({ state: 'visible', timeout: 8000 });
  await page.locator('input[name="fio"]').fill(TEST_NAME);
  await page.locator('input[name="phone"]').click();
  await page.keyboard.type(TEST_PHONE);

  const checkbox = page.locator('input[name="agreeCheckbox"]');
  if (!await checkbox.isChecked()) {
    await checkbox.check();
  }

  // Р–РґС‘Рј РїРѕРєР° РєРЅРѕРїРєР° "Р—Р°РїРёСЃР°С‚СЊСЃСЏ" РІРЅСѓС‚СЂРё РјРѕРґР°Р»РєРё СЃС‚Р°РЅРµС‚ РєР»РёРєР°Р±РµР»СЊРЅРѕР№
  const submitBtn = page.locator('button').filter({ hasText: /^Р·Р°РїРёСЃР°С‚СЊСЃСЏ$/i });
  await submitBtn.waitFor({ state: 'visible', timeout: 8000 });

  const emailSince = new Date();
  await submitBtn.click();

  await expect(
    page.getByText(/Р·Р°Р±СЂРѕРЅРёСЂРѕРІР°РЅРѕ|Р·Р°РїРёСЃСЊ РїСЂРёРЅСЏС‚Р°|Р·Р°РїРёСЃР°РЅС‹|РѕР¶РёРґР°Р№С‚Рµ|Р¶РґРµРј|Р¶РґС‘Рј|СЃРІСЏР¶РµРјСЃСЏ|СЃРїР°СЃРёР±Рѕ|СѓСЃРїРµС€РЅРѕ/i).first()
  ).toBeVisible({ timeout: 10000 });

  // РџРёСЃСЊРјРѕ РґРѕР»Р¶РЅРѕ СЃРѕРґРµСЂР¶Р°С‚СЊ URL СЃС‚СЂР°РЅРёС†С‹ РІСЂР°С‡Р°
  const urlPath = doctorUrl.replace(BASE_URL, '');
  await checkEmailMessage('eastclinic.ru' + urlPath, emailSince, 120000);
});
