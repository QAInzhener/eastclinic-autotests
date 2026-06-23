import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'https://eastclinic.ru';
const SCREENSHOTS_DIR = 'C:\\Users\\Acer\\Documents\\Автотесты\\screenshots';

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/vrachi`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Accept cookies
  try {
    const btn = page.locator('button:has-text("Принять")').first();
    if (await btn.isVisible({ timeout: 2000 })) {
      await btn.click();
      await page.waitForTimeout(1000);
    }
  } catch {}

  // ---- Find actual doctor item cards (not wrappers) ----
  console.log('=== FINDING DOCTOR ITEM CARDS ===');

  // The structure found: doctor-item-container contains doctor-item-white-container
  // Let's count actual doctor items
  const itemContainersCount = await page.locator('.doctor-item-container').count();
  console.log(`doctor-item-container count: ${itemContainersCount}`);

  const whiteContainersCount = await page.locator('.doctor-item-white-container').count();
  console.log(`doctor-item-white-container count: ${whiteContainersCount}`);

  // Get info about each doctor item
  const doctorItems = await page.evaluate(() => {
    const items = document.querySelectorAll('.doctor-item-container');
    const results = [];
    for (let i = 0; i < Math.min(items.length, 15); i++) {
      const item = items[i];
      const nameEl = item.querySelector('.doctor-full-name');
      const specEl = item.querySelector('.doctor-speciality');
      const btn = item.querySelector('button, a[href*="zapis"], a[href*="record"], a[class*="btn"]');
      const allBtns = item.querySelectorAll('button');
      const allLinks = item.querySelectorAll('a');

      const btnsInfo = Array.from(allBtns).map(b => ({
        tag: b.tagName,
        class: b.className,
        text: b.textContent?.trim().substring(0, 50),
        type: b.getAttribute('type')
      }));

      const linksInfo = Array.from(allLinks).slice(0, 5).map(a => ({
        tag: a.tagName,
        class: a.className,
        href: a.getAttribute('href'),
        text: a.textContent?.trim().substring(0, 50)
      }));

      results.push({
        index: i,
        name: nameEl?.textContent?.trim() || 'N/A',
        spec: specEl?.textContent?.trim() || 'N/A',
        buttons: btnsInfo,
        links: linksInfo
      });
    }
    return results;
  });

  doctorItems.forEach(item => {
    console.log(`\n[${item.index}] ${item.name} | ${item.spec}`);
    console.log(`  Buttons: ${JSON.stringify(item.buttons)}`);
    console.log(`  Links: ${JSON.stringify(item.links)}`);
  });

  // ---- Scroll to 9th doctor (index 8) ----
  console.log('\n=== SCROLLING TO 9TH DOCTOR (index 8) ===');

  const ninthDoctor = page.locator('.doctor-item-container').nth(8);
  await ninthDoctor.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);

  // Screenshot of 9th doctor area
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_ninth_doctor_detailed.png') });
  console.log('Screenshot 07 saved');

  // Get bounding box of 9th doctor
  const bbox = await ninthDoctor.boundingBox();
  console.log('9th doctor bbox:', JSON.stringify(bbox));

  // Get name of 9th doctor
  const ninthName = await ninthDoctor.locator('.doctor-full-name').textContent();
  console.log('9th doctor name:', ninthName);

  // Get all buttons inside 9th doctor
  const ninthButtons = await page.evaluate(() => {
    const items = document.querySelectorAll('.doctor-item-container');
    const ninth = items[8];
    if (!ninth) return [];
    const btns = ninth.querySelectorAll('button');
    return Array.from(btns).map(b => ({
      class: b.className,
      text: b.textContent?.trim(),
      type: b.getAttribute('type'),
      'aria-label': b.getAttribute('aria-label'),
      disabled: b.disabled
    }));
  });
  console.log('9th doctor buttons:', JSON.stringify(ninthButtons, null, 2));

  // ---- Check the select-doctor-button class ----
  console.log('\n=== SELECT DOCTOR BUTTON ===');
  const selectBtns = await page.locator('.select-doctor-button').all();
  console.log(`Total .select-doctor-button elements: ${selectBtns.length}`);
  if (selectBtns.length > 0) {
    const firstCls = await selectBtns[0].getAttribute('class');
    const firstText = await selectBtns[0].textContent();
    console.log(`First button class: "${firstCls}"`);
    console.log(`First button text: "${firstText?.trim()}"`);
  }

  // ---- Check services-button-container ----
  const serviceBtns = await page.locator('.services-button-container').count();
  console.log(`Total .services-button-container: ${serviceBtns}`);

  // ---- Screenshot of the AI field area ----
  console.log('\n=== SCROLLING TO AI FIELD ===');
  await page.locator('.ai-search__input').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '08_ai_field_zoom.png') });
  console.log('Screenshot 08 saved');

  // Get full AI block structure
  const aiBlockInfo = await page.evaluate(() => {
    const input = document.querySelector('.ai-search__input');
    if (!input) return null;

    // Walk up to find the container
    let container = input;
    for (let i = 0; i < 5; i++) {
      container = container.parentElement;
      if (!container) break;
    }

    const allInputsInBlock = container.querySelectorAll('input, textarea, button');
    return {
      containerClass: container?.className,
      containerTag: container?.tagName,
      children: Array.from(container?.children || []).map(c => ({
        tag: c.tagName,
        class: c.className,
        id: c.id
      })),
      inputsInBlock: Array.from(allInputsInBlock).map(el => ({
        tag: el.tagName,
        class: el.className,
        type: el.getAttribute('type'),
        placeholder: el.getAttribute('placeholder'),
        'aria-label': el.getAttribute('aria-label')
      }))
    };
  });
  console.log('\nAI block structure:', JSON.stringify(aiBlockInfo, null, 2));

  await browser.close();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
