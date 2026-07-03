import { test, expect } from '@playwright/test';
import { checkEmailMessage } from './helpers/email.js';
import { BASE_URL } from './helpers/config.js';

const TEST_NAME = 'РўРµСЃС‚ РўРµСЃС‚РѕРІ';
const TEST_PHONE = '4444444444'; // +7 (444) 444-44-44
const TEST_SPECIALTY = 'РўРµСЃС‚РёСЂРѕРІР°РЅРёРµ';

const VACANCIES_PAGE = BASE_URL + '/vakansii';

async function acceptCookies(page) {
  const cookieBtn = page.getByRole('button', { name: /РїСЂРёРЅСЏС‚СЊ/i });
  try {
    await cookieBtn.waitFor({ state: 'visible', timeout: 5000 });
    await cookieBtn.click();
  } catch {}
}

// РџРµСЂРµС…РѕРґРёС‚ РЅР° СЃС‚СЂР°РЅРёС†Сѓ РїРµСЂРІРѕР№ РІР°РєР°РЅСЃРёРё С‡РµСЂРµР· РєРЅРѕРїРєСѓ "РћС‚РєР»РёРєРЅСѓС‚СЊСЃСЏ" РЅР° /vakansii,
// Р·Р°С‚РµРј РЅР° СЃС‚СЂР°РЅРёС†Рµ РІР°РєР°РЅСЃРёРё РєР»РёРєР°РµС‚ "РћС‚РєР»РёРєРЅСѓС‚СЊСЃСЏ" (РїСЂРѕРєСЂСѓС‚РєР° Рє С„РѕСЂРјРµ).
// Р’РѕР·РІСЂР°С‰Р°РµС‚ URL СЃС‚СЂР°РЅРёС†С‹ РІР°РєР°РЅСЃРёРё.
async function navigateToVacancyForm(page) {
  await page.goto(VACANCIES_PAGE);
  await acceptCookies(page);

  // РџРµСЂРІР°СЏ РєРЅРѕРїРєР° "РћС‚РєР»РёРєРЅСѓС‚СЊСЃСЏ" вЂ” СЃСЃС‹Р»РєР° РЅР° РєРѕРЅРєСЂРµС‚РЅСѓСЋ РІР°РєР°РЅСЃРёСЋ
  const applyLink = page.locator('a.vacancy-button').first();
  await applyLink.waitFor({ state: 'visible', timeout: 8000 });
  await applyLink.click();

  // SPA-РЅР°РІРёРіР°С†РёСЏ РЅР° СЃС‚СЂР°РЅРёС†Сѓ РІР°РєР°РЅСЃРёРё
  await page.waitForURL(/vakansii\/.+/, { timeout: 15000 });
  const vacancyUrl = page.url();

  // РќР° СЃС‚СЂР°РЅРёС†Рµ РІР°РєР°РЅСЃРёРё РЅР°Р¶РёРјР°РµРј "РћС‚РєР»РёРєРЅСѓС‚СЊСЃСЏ" в†’ РїСЂРѕРєСЂСѓС‚РєР° Рє С„РѕСЂРјРµ
  const applyBtn = page.locator('button.vacancy-button').filter({ hasText: /РѕС‚РєР»РёРєРЅСѓС‚СЊСЃСЏ/i }).first();
  await applyBtn.waitFor({ state: 'visible', timeout: 8000 });
  await applyBtn.click();
  await page.waitForTimeout(1000);

  return vacancyUrl;
}

// РЎРєСЂРѕР»Р»РёС‚ Рє С„РѕСЂРјРµ "РќРµ РЅР°С€Р»Рё РїРѕРґС…РѕРґСЏС‰СѓСЋ РІР°РєР°РЅСЃРёСЋ?" С‡РµСЂРµР· РєРЅРѕРїРєСѓ "РҐРѕС‡Сѓ РЅР° СЌРєСЃРєСѓСЂСЃРёСЋ"
async function scrollToNoVacancyForm(page) {
  await page.goto(VACANCIES_PAGE);
  await acceptCookies(page);

  const excursionBtn = page.locator('button.excursion-button');
  await excursionBtn.waitFor({ state: 'visible', timeout: 8000 });
  await excursionBtn.scrollIntoViewIfNeeded();
  await excursionBtn.click();
  await page.waitForTimeout(1000);
}

// --- Р¤РѕСЂРјР°: РћС‚РєР»РёРєРЅСѓС‚СЊСЃСЏ РЅР° РІР°РєР°РЅСЃРёСЋ ---

test('Р¤РѕСЂРјР° "РћС‚РєР»РёРєРЅСѓС‚СЊСЃСЏ РЅР° РІР°РєР°РЅСЃРёСЋ" вЂ” С„РѕСЂРјР° РѕС‚РѕР±СЂР°Р¶Р°РµС‚СЃСЏ', async ({ page }) => {
  await navigateToVacancyForm(page);

  await expect(page.getByPlaceholder('Р’Р°С€Рµ РёРјСЏ Рё С„Р°РјРёР»РёСЏ')).toBeVisible({ timeout: 8000 });
  await expect(page.getByPlaceholder('РЎРїРµС†РёР°Р»СЊРЅРѕСЃС‚СЊ')).toBeVisible();
  await expect(page.locator('input[name="phone"]')).toBeVisible();
});

test('Р¤РѕСЂРјР° "РћС‚РєР»РёРєРЅСѓС‚СЊСЃСЏ РЅР° РІР°РєР°РЅСЃРёСЋ" вЂ” Р·Р°РїРѕР»РЅСЏРµС‚СЃСЏ Рё РѕС‚РїСЂР°РІР»СЏРµС‚СЃСЏ', async ({ page }) => {
  const vacancyUrl = await navigateToVacancyForm(page);

  // Р—Р°РїРѕР»РЅСЏРµРј РїРѕР»СЏ С„РѕСЂРјС‹
  await page.getByPlaceholder('Р’Р°С€Рµ РёРјСЏ Рё С„Р°РјРёР»РёСЏ').fill(TEST_NAME);
  await page.getByPlaceholder('РЎРїРµС†РёР°Р»СЊРЅРѕСЃС‚СЊ').fill(TEST_SPECIALTY);
  await page.locator('input[name="phone"]').click();
  await page.keyboard.type(TEST_PHONE);

  // Р§РµРєР±РѕРєСЃ СЃРѕРіР»Р°СЃРёСЏ
  const checkbox = page.locator('input[name="agreeCheckbox"]');
  if (!await checkbox.isChecked()) {
    await checkbox.check();
  }

  const emailSince = new Date();
  await page.getByRole('button', { name: /РѕС‚РїСЂР°РІРёС‚СЊ/i }).click();

  // РџСЂРѕРІРµСЂСЏРµРј СЃРѕРѕР±С‰РµРЅРёРµ РѕР± СѓСЃРїРµС€РЅРѕР№ РѕС‚РїСЂР°РІРєРµ
  await expect(
    page.getByText(/СЃРїР°СЃРёР±Рѕ|Р·Р°СЏРІРєР° РїСЂРёРЅСЏС‚Р°|РїРµСЂРµР·РІРѕРЅРёРј|СѓСЃРїРµС€РЅРѕ|РѕС‚РїСЂР°РІР»РµРЅРѕ|РІР°С€Р° Р·Р°СЏРІРєР°/i)
  ).toBeVisible({ timeout: 10000 });

  // РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ РїРёСЃСЊРјРѕ РїСЂРёС€Р»Рѕ РЅР° РїРѕС‡С‚Сѓ
  const urlPath = vacancyUrl.replace(BASE_URL, '');
  await checkEmailMessage('eastclinic.ru' + urlPath, emailSince, 120000);
});

// --- Р¤РѕСЂРјР°: РќРµ РЅР°С€Р»Рё РїРѕРґС…РѕРґСЏС‰СѓСЋ РІР°РєР°РЅСЃРёСЋ ---

test('Р¤РѕСЂРјР° "РќРµ РЅР°С€Р»Рё РїРѕРґС…РѕРґСЏС‰СѓСЋ РІР°РєР°РЅСЃРёСЋ" вЂ” С„РѕСЂРјР° РѕС‚РѕР±СЂР°Р¶Р°РµС‚СЃСЏ', async ({ page }) => {
  await scrollToNoVacancyForm(page);

  const form = page.locator('.patient-help-form-with-title');
  await expect(form.getByPlaceholder('Р’Р°С€Рµ РёРјСЏ Рё С„Р°РјРёР»РёСЏ')).toBeVisible({ timeout: 8000 });
  await expect(form.getByPlaceholder('РЎРїРµС†РёР°Р»СЊРЅРѕСЃС‚СЊ')).toBeVisible();
  await expect(form.locator('input[name="phone"]')).toBeVisible();
});

test('Р¤РѕСЂРјР° "РќРµ РЅР°С€Р»Рё РїРѕРґС…РѕРґСЏС‰СѓСЋ РІР°РєР°РЅСЃРёСЋ" вЂ” Р·Р°РїРѕР»РЅСЏРµС‚СЃСЏ Рё РѕС‚РїСЂР°РІР»СЏРµС‚СЃСЏ', async ({ page }) => {
  await scrollToNoVacancyForm(page);

  const form = page.locator('.patient-help-form-with-title');

  await form.getByPlaceholder('Р’Р°С€Рµ РёРјСЏ Рё С„Р°РјРёР»РёСЏ').fill(TEST_NAME);
  await form.getByPlaceholder('РЎРїРµС†РёР°Р»СЊРЅРѕСЃС‚СЊ').fill(TEST_SPECIALTY);
  await form.locator('input[name="phone"]').click();
  await page.keyboard.type(TEST_PHONE);

  const checkbox = form.locator('input[name="agreeCheckbox"]');
  if (!await checkbox.isChecked()) {
    await checkbox.check();
  }

  const emailSince = new Date();
  await form.getByRole('button', { name: /РѕС‚РїСЂР°РІРёС‚СЊ/i }).click();

  await expect(
    page.getByText(/СЃРїР°СЃРёР±Рѕ|Р·Р°СЏРІРєР° РїСЂРёРЅСЏС‚Р°|РїРµСЂРµР·РІРѕРЅРёРј|СѓСЃРїРµС€РЅРѕ|РѕС‚РїСЂР°РІР»РµРЅРѕ|РІР°С€Р° Р·Р°СЏРІРєР°/i)
  ).toBeVisible({ timeout: 10000 });

  await checkEmailMessage('eastclinic.ru/vakansii', emailSince, 120000);
});
