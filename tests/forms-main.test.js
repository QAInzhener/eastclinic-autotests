import { test, expect } from '@playwright/test';
import { checkEmailMessage } from './helpers/email.js';
import { BASE_URL } from './helpers/config.js';

const TEST_NAME = 'РўРµСЃС‚ РўРµСЃС‚РѕРІ';
const TEST_PHONE = '4444444444'; // +7 (444) 444-44-44

async function acceptCookies(page) {
  const cookieBtn = page.getByRole('button', { name: /РїСЂРёРЅСЏС‚СЊ/i });
  if (await cookieBtn.isVisible()) {
    await cookieBtn.click();
  }
}

// --- Р¤РѕСЂРјР° 1: Р—Р°РїРёСЃР°С‚СЊСЃСЏ РЅР° РїСЂРёС‘Рј (РєРЅРѕРїРєР° РІ С€Р°РїРєРµ) ---

test('Р¤РѕСЂРјР° "Р—Р°РїРёСЃР°С‚СЊСЃСЏ" вЂ” РѕС‚РєСЂС‹РІР°РµС‚СЃСЏ', async ({ page }) => {
  await page.goto(BASE_URL + '/');
  await acceptCookies(page);
  await page.getByRole('button', { name: /Р·Р°РїРёСЃР°С‚СЊСЃСЏ/i }).first().click();
  await expect(page.getByPlaceholder('Р’Р°С€Рµ РёРјСЏ Рё С„Р°РјРёР»РёСЏ')).toBeVisible();
});

test('Р¤РѕСЂРјР° "Р—Р°РїРёСЃР°С‚СЊСЃСЏ" вЂ” Р·Р°РїРѕР»РЅСЏРµС‚СЃСЏ Рё РѕС‚РїСЂР°РІР»СЏРµС‚СЃСЏ', async ({ page }) => {
  await page.goto(BASE_URL + '/');
  await acceptCookies(page);
  await page.getByRole('button', { name: /Р·Р°РїРёСЃР°С‚СЊСЃСЏ/i }).first().click();

  await page.getByPlaceholder('Р’Р°С€Рµ РёРјСЏ Рё С„Р°РјРёР»РёСЏ').fill(TEST_NAME);
  await page.locator('input[type="tel"]').first().click();
  await page.keyboard.type(TEST_PHONE);

  await page.locator('.appointment-modal-submit').scrollIntoViewIfNeeded();
  const checkbox = page.locator('input[type="checkbox"]').first();
  if (!await checkbox.isChecked()) {
    await checkbox.check();
  }

  const emailSince = new Date();
  await page.locator('.appointment-modal-submit').click();

  await expect(
    page.getByText(/СЃРІСЏР¶РµРјСЃСЏ|РїРѕРґР±РёСЂР°С‚СЊ|СЃРїР°СЃРёР±Рѕ|Р·Р°СЏРІРєР° РїСЂРёРЅСЏС‚Р°|РїРµСЂРµР·РІРѕРЅРёРј|СѓСЃРїРµС€РЅРѕ/i)
  ).toBeVisible({ timeout: 10000 });

  await checkEmailMessage('eastclinic.ru/index', emailSince, 120000);
});

// --- Р¤РѕСЂРјР° 2: РћР±СЂР°С‚РЅР°СЏ СЃРІСЏР·СЊ (РїРѕРґРІР°Р») ---

test('Р¤РѕСЂРјР° "РћР±СЂР°С‚РЅР°СЏ СЃРІСЏР·СЊ" вЂ” РѕС‚РєСЂС‹РІР°РµС‚СЃСЏ', async ({ page }) => {
  await page.goto(BASE_URL + '/');
  await acceptCookies(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByText('РћР±СЂР°С‚РЅР°СЏ СЃРІСЏР·СЊ').first().click();
  await expect(page.getByPlaceholder(/СЂР°СЃСЃРєР°Р¶РёС‚Рµ/i)).toBeVisible();
});

test('Р¤РѕСЂРјР° "РћР±СЂР°С‚РЅР°СЏ СЃРІСЏР·СЊ" вЂ” Р·Р°РїРѕР»РЅСЏРµС‚СЃСЏ Рё РѕС‚РїСЂР°РІР»СЏРµС‚СЃСЏ', async ({ page }) => {
  await page.goto(BASE_URL + '/');
  await acceptCookies(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByText('РћР±СЂР°С‚РЅР°СЏ СЃРІСЏР·СЊ').first().click();

  await page.getByPlaceholder(/СЂР°СЃСЃРєР°Р¶РёС‚Рµ/i).fill('РўРµСЃС‚РѕРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ - Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєР°СЏ РїСЂРѕРІРµСЂРєР° С„РѕСЂРјС‹ РћР±СЂР°С‚РЅР°СЏ СЃРІСЏР·СЊ');
  await page.getByPlaceholder('Р’Р°С€Рµ РёРјСЏ Рё С„Р°РјРёР»РёСЏ').fill(TEST_NAME);
  await page.locator('input[type="tel"]').click();
  await page.keyboard.type(TEST_PHONE);

  const checkbox = page.locator('input[type="checkbox"]').first();
  if (!await checkbox.isChecked()) {
    await checkbox.check();
  }

  const emailSince = new Date();
  await page.getByRole('button', { name: /РѕС‚РїСЂР°РІРёС‚СЊ/i }).click();

  await expect(
    page.getByText(/СЃРїР°СЃРёР±Рѕ|Р·Р°СЏРІРєР° РїСЂРёРЅСЏС‚Р°|РїРµСЂРµР·РІРѕРЅРёРј|СѓСЃРїРµС€РЅРѕ/i)
  ).toBeVisible({ timeout: 10000 });

  await checkEmailMessage('eastclinic.ru/index', emailSince, 120000);
});

// --- Р¤РѕСЂРјР° 3: РџРёСЃСЊРјРѕ РґРёСЂРµРєС‚РѕСЂСѓ (РїРѕРґРІР°Р») ---

test('Р¤РѕСЂРјР° "РќР°РїРёСЃР°С‚СЊ РґРёСЂРµРєС‚РѕСЂСѓ" вЂ” РѕС‚РєСЂС‹РІР°РµС‚СЃСЏ', async ({ page }) => {
  await page.goto(BASE_URL + '/');
  await acceptCookies(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByText('РќР°РїРёСЃР°С‚СЊ РґРёСЂРµРєС‚РѕСЂСѓ').first().click();
  await expect(page.getByText('РџРёСЃСЊРјРѕ РґРёСЂРµРєС‚РѕСЂСѓ')).toBeVisible();
});

test('Р¤РѕСЂРјР° "РќР°РїРёСЃР°С‚СЊ РґРёСЂРµРєС‚РѕСЂСѓ" вЂ” Р·Р°РїРѕР»РЅСЏРµС‚СЃСЏ Рё РѕС‚РїСЂР°РІР»СЏРµС‚СЃСЏ', async ({ page }) => {
  await page.goto(BASE_URL + '/');
  await acceptCookies(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByText('РќР°РїРёСЃР°С‚СЊ РґРёСЂРµРєС‚РѕСЂСѓ').first().click();

  await page.getByPlaceholder(/СЂР°СЃСЃРєР°Р¶РёС‚Рµ/i).fill('РўРµСЃС‚РѕРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ - Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєР°СЏ РїСЂРѕРІРµСЂРєР° С„РѕСЂРјС‹ РџРёСЃСЊРјРѕ РґРёСЂРµРєС‚РѕСЂСѓ');
  await page.getByPlaceholder('Р’Р°С€Рµ РёРјСЏ Рё С„Р°РјРёР»РёСЏ').fill(TEST_NAME);
  await page.locator('input[type="tel"]').click();
  await page.keyboard.type(TEST_PHONE);

  const checkbox = page.locator('input[type="checkbox"]').first();
  if (!await checkbox.isChecked()) {
    await checkbox.check();
  }

  const emailSince = new Date();
  await page.getByRole('button', { name: /РѕС‚РїСЂР°РІРёС‚СЊ/i }).click();

  await expect(
    page.getByText(/СЃРїР°СЃРёР±Рѕ|Р·Р°СЏРІРєР° РїСЂРёРЅСЏС‚Р°|РїРµСЂРµР·РІРѕРЅРёРј|СѓСЃРїРµС€РЅРѕ/i)
  ).toBeVisible({ timeout: 10000 });

  await checkEmailMessage('eastclinic.ru/index', emailSince, 120000);
});
