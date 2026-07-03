import { test, expect } from '@playwright/test';
import { checkEmailMessage } from './helpers/email.js';
import { BASE_URL } from './helpers/config.js';

const TEST_NAME = 'РўРµСЃС‚ РўРµСЃС‚РѕРІ';
const TEST_PHONE = '4444444444';      // РґР»СЏ С„РѕСЂРј СЃ Р°РІС‚РѕРїСЂРµС„РёРєСЃРѕРј +7
const TEST_PHONE_FULL = '+74444444444'; // РґР»СЏ С„РѕСЂРј Р±РµР· Р°РІС‚РѕРїСЂРµС„РёРєСЃР°

async function acceptCookies(page) {
  const cookieBtn = page.getByRole('button', { name: /РїСЂРёРЅСЏС‚СЊ/i });
  try {
    await cookieBtn.waitFor({ state: 'visible', timeout: 5000 });
    await cookieBtn.click();
  } catch {}
}

// --- Р¤РѕСЂРјР° 4: Р—Р°РїРёСЃР°С‚СЊСЃСЏ РЅР° РїСЂРёС‘Рј вЂ” СЃС‚СЂР°РЅРёС†Р° Р’СЂР°С‡Рё ---

test('Р¤РѕСЂРјР° "Р—Р°РїРёСЃР°С‚СЊСЃСЏ РЅР° РїСЂРёС‘Рј" (СЃС‚СЂР°РЅРёС†Р° Р’СЂР°С‡Рё) вЂ” РѕС‚РєСЂС‹РІР°РµС‚СЃСЏ', async ({ page }) => {
  await page.goto(BASE_URL + '/vrachi');
  await acceptCookies(page);
  await page.getByRole('button', { name: /Р·Р°РїРёСЃР°С‚СЊСЃСЏ РЅР° РїСЂРёС‘Рј/i }).first().click();
  const form = page.locator('.patient-help-form');
  await expect(form.getByPlaceholder('Р’Р°С€Рµ РёРјСЏ Рё С„Р°РјРёР»РёСЏ')).toBeVisible();
});

test('Р¤РѕСЂРјР° "Р—Р°РїРёСЃР°С‚СЊСЃСЏ РЅР° РїСЂРёС‘Рј" (СЃС‚СЂР°РЅРёС†Р° Р’СЂР°С‡Рё) вЂ” Р·Р°РїРѕР»РЅСЏРµС‚СЃСЏ Рё РѕС‚РїСЂР°РІР»СЏРµС‚СЃСЏ', async ({ page }) => {
  await page.goto(BASE_URL + '/vrachi');
  await acceptCookies(page);
  await page.getByRole('button', { name: /Р·Р°РїРёСЃР°С‚СЊСЃСЏ РЅР° РїСЂРёС‘Рј/i }).first().click();

  // Р’СЃРµ РІР·Р°РёРјРѕРґРµР№СЃС‚РІРёСЏ РІРЅСѓС‚СЂРё СЃРµРєС†РёРё .patient-help-form (РѕР±С‰Р°СЏ С„РѕСЂРјР° /vrachi, Р±РµР· С„РёР»РёР°Р»Р°)
  const form = page.locator('.patient-help-form');
  await form.getByPlaceholder('Р’Р°С€Рµ РёРјСЏ Рё С„Р°РјРёР»РёСЏ').fill(TEST_NAME);
  await form.locator('input[type="tel"]').click();
  await page.keyboard.type(TEST_PHONE);

  const checkbox = form.locator('input[type="checkbox"]');
  if (!await checkbox.isChecked()) {
    await checkbox.check();
  }

  const emailSince = new Date();
  await form.getByRole('button', { name: /^Р·Р°РїРёСЃР°С‚СЊСЃСЏ$/i }).click();

  await expect(
    page.getByText(/СЃРІСЏР¶РµРјСЃСЏ|РїРѕРґР±РёСЂР°С‚СЊ|СЃРїР°СЃРёР±Рѕ|Р·Р°СЏРІРєР° РїСЂРёРЅСЏС‚Р°|РїРµСЂРµР·РІРѕРЅРёРј|СѓСЃРїРµС€РЅРѕ/i).first()
  ).toBeVisible({ timeout: 10000 });

  await checkEmailMessage('eastclinic.ru/vrachi', emailSince, 120000);
});

// --- Р¤РѕСЂРјР° 5: Р”Р°РІР°Р№С‚Рµ РїРѕРјРѕР¶РµРј вЂ” СЃС‚СЂР°РЅРёС†Р° РєР»РёРЅРёРєРё ---

test('Р¤РѕСЂРјР° "Р”Р°РІР°Р№С‚Рµ РїРѕРјРѕР¶РµРј" (СЃС‚СЂР°РЅРёС†Р° РєР»РёРЅРёРєРё) вЂ” РѕС‚РєСЂС‹РІР°РµС‚СЃСЏ', async ({ page }) => {
  await page.goto(BASE_URL + '/kontakty/ist-klinik-na-sokole');
  await acceptCookies(page);
  await page.getByText('РћР±СЂР°С‚РёС‚СЊСЃСЏ Рє СЃРїРµС†РёР°Р»РёСЃС‚Сѓ').first().click();
  await expect(page.getByText('Р”Р°РІР°Р№С‚Рµ РїРѕРјРѕР¶РµРј').first()).toBeVisible();
});

test('Р¤РѕСЂРјР° "Р”Р°РІР°Р№С‚Рµ РїРѕРјРѕР¶РµРј" (СЃС‚СЂР°РЅРёС†Р° РєР»РёРЅРёРєРё) вЂ” Р·Р°РїРѕР»РЅСЏРµС‚СЃСЏ Рё РѕС‚РїСЂР°РІР»СЏРµС‚СЃСЏ', async ({ page }) => {
  await page.goto(BASE_URL + '/kontakty/ist-klinik-na-sokole');
  await acceptCookies(page);
  await page.getByText('РћР±СЂР°С‚РёС‚СЊСЃСЏ Рє СЃРїРµС†РёР°Р»РёСЃС‚Сѓ').first().click();

  await expect(page.getByText('Р”Р°РІР°Р№С‚Рµ РїРѕРјРѕР¶РµРј').first()).toBeVisible();

  const nameField = page.getByPlaceholder('Р’Р°С€Рµ РёРјСЏ Рё С„Р°РјРёР»РёСЏ').first();
  await nameField.fill(TEST_NAME);
  await nameField.press('Tab');
  await page.keyboard.type(TEST_PHONE_FULL);

  const checkbox = page.locator('input[type="checkbox"]').last();
  if (!await checkbox.isChecked()) {
    await checkbox.check();
  }

  const emailSince = new Date();
  await page.getByRole('button', { name: /Р¶РґСѓ Р·РІРѕРЅРєР°/i }).last().click();

  await expect(
    page.getByText(/СЃРєРѕСЂРѕ РїРѕР·РІРѕРЅРёРј|СЃРІСЏР¶РµРјСЃСЏ|СЃРїР°СЃРёР±Рѕ|Р·Р°СЏРІРєР° РїСЂРёРЅСЏС‚Р°|РїРµСЂРµР·РІРѕРЅРёРј|Р¶РґРёС‚Рµ|СѓСЃРїРµС€РЅРѕ/i).first()
  ).toBeVisible({ timeout: 10000 });

  await checkEmailMessage('eastclinic.ru/kontakty/ist-klinik-na-sokole', emailSince, 120000);
});
