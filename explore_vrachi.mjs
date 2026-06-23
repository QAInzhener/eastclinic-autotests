import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'https://eastclinic.ru';
const SCREENSHOTS_DIR = 'C:\\Users\\Acer\\Documents\\Автотесты\\screenshots';

async function main() {
  // Ensure screenshots dir exists
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  console.log('Navigating to /vrachi...');
  await page.goto(`${BASE_URL}/vrachi`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Accept cookies if present
  const cookieSelectors = [
    'button:has-text("Принять")',
    'button:has-text("Согласен")',
    'button:has-text("OK")',
    'button:has-text("Хорошо")',
    '[class*="cookie"] button',
    '[id*="cookie"] button',
    '.cookie-banner button',
    '.cookie-popup button',
    '.cookie-accept',
    '[data-testid*="cookie"] button'
  ];
  for (const sel of cookieSelectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1000 })) {
        console.log(`Clicking cookie button: ${sel}`);
        await btn.click();
        await page.waitForTimeout(1000);
        break;
      }
    } catch {}
  }

  // Screenshot of full page after load
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_vrachi_initial.png'), fullPage: false });
  console.log('Screenshot 01 saved');

  // ---- Find AI picker field ----
  console.log('\n=== SEARCHING FOR AI PICKER FIELD ===');

  // Look for text about AI picker
  const aiTextVariants = [
    'Опишите что вас беспокоит',
    'Опишите, что вас беспокоит',
    'Что вас беспокоит',
    'Введите симптом',
    'Расскажите о проблеме',
    'подберём врача',
    'подобрать врача',
    'ИИ',
    'искусственный интеллект'
  ];

  let aiSectionFound = false;
  for (const text of aiTextVariants) {
    try {
      const el = page.locator(`text="${text}"`).first();
      if (await el.isVisible({ timeout: 1000 })) {
        console.log(`Found AI text: "${text}"`);
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        aiSectionFound = true;
        break;
      }
    } catch {}
  }

  // Try partial text match
  if (!aiSectionFound) {
    try {
      const el = page.locator('text=/[Оо]пишите/').first();
      if (await el.isVisible({ timeout: 2000 })) {
        console.log('Found partial match for "Опишите"');
        await el.scrollIntoViewIfNeeded();
        aiSectionFound = true;
      }
    } catch {}
  }

  // Find the textarea/input for AI
  console.log('\n=== FINDING INPUT SELECTORS ===');

  const inputSelectors = [
    'textarea[placeholder*="беспокоит"]',
    'textarea[placeholder*="симптом"]',
    'textarea[placeholder*="опишите"]',
    'input[placeholder*="беспокоит"]',
    'input[placeholder*="симптом"]',
    'textarea',
    '[class*="ai"] textarea',
    '[class*="ai"] input',
    '[class*="search"] textarea',
    '[class*="finder"] textarea',
    '[class*="picker"] textarea',
    '[class*="assistant"] textarea',
    '[class*="chat"] textarea'
  ];

  let aiInputSelector = null;
  for (const sel of inputSelectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1000 })) {
        const placeholder = await el.getAttribute('placeholder') || '';
        const cls = await el.getAttribute('class') || '';
        const id = await el.getAttribute('id') || '';
        console.log(`Found input: ${sel}`);
        console.log(`  placeholder: "${placeholder}"`);
        console.log(`  class: "${cls}"`);
        console.log(`  id: "${id}"`);
        if (!aiInputSelector) aiInputSelector = sel;

        // Get parent element info
        const parentInfo = await el.evaluate(el => {
          const parent = el.parentElement;
          return {
            parentTag: parent?.tagName,
            parentClass: parent?.className,
            parentId: parent?.id
          };
        });
        console.log(`  parent: ${parentInfo.parentTag}.${parentInfo.parentClass} #${parentInfo.parentId}`);
        break;
      }
    } catch {}
  }

  // Try to find textarea by scrolling through page sections
  console.log('\nScrolling to find AI section...');

  // Check all textareas on page
  const allTextareas = await page.locator('textarea').all();
  console.log(`Total textareas on page: ${allTextareas.length}`);
  for (let i = 0; i < allTextareas.length; i++) {
    try {
      const ta = allTextareas[i];
      const placeholder = await ta.getAttribute('placeholder') || '';
      const cls = await ta.getAttribute('class') || '';
      const id = await ta.getAttribute('id') || '';
      const visible = await ta.isVisible();
      console.log(`  textarea[${i}]: visible=${visible}, placeholder="${placeholder}", class="${cls}", id="${id}"`);
    } catch {}
  }

  // Check all inputs
  const allInputs = await page.locator('input[type="text"], input:not([type])').all();
  console.log(`Total text inputs on page: ${allInputs.length}`);
  for (let i = 0; i < Math.min(allInputs.length, 10); i++) {
    try {
      const inp = allInputs[i];
      const placeholder = await inp.getAttribute('placeholder') || '';
      const cls = await inp.getAttribute('class') || '';
      const id = await inp.getAttribute('id') || '';
      const visible = await inp.isVisible();
      console.log(`  input[${i}]: visible=${visible}, placeholder="${placeholder}", class="${cls}", id="${id}"`);
    } catch {}
  }

  // Screenshot of AI area if found
  if (aiSectionFound || aiInputSelector) {
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_ai_picker_area.png'), fullPage: false });
    console.log('Screenshot 02 (AI area) saved');
  }

  // ---- Find submit button (blue circle with white arrow) ----
  console.log('\n=== SEARCHING FOR SUBMIT BUTTON ===');

  const submitSelectors = [
    'button[type="submit"]',
    'button:has(svg)',
    '[class*="submit"]',
    '[class*="send"]',
    '[class*="arrow"]',
    'button[class*="round"]',
    'button[class*="circle"]',
    'button[class*="search"]'
  ];

  for (const sel of submitSelectors) {
    try {
      const buttons = await page.locator(sel).all();
      for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i];
        const visible = await btn.isVisible({ timeout: 500 });
        if (visible) {
          const cls = await btn.getAttribute('class') || '';
          const id = await btn.getAttribute('id') || '';
          const type = await btn.getAttribute('type') || '';
          const ariaLabel = await btn.getAttribute('aria-label') || '';
          const bBox = await btn.boundingBox();
          // Check if round (width ≈ height)
          const isRound = bBox && Math.abs(bBox.width - bBox.height) < 10 && bBox.width < 80;
          console.log(`Submit btn candidate: ${sel}[${i}]`);
          console.log(`  class: "${cls}", id: "${id}", type: "${type}", aria-label: "${ariaLabel}"`);
          console.log(`  bbox: ${JSON.stringify(bBox)}, isRound: ${isRound}`);
        }
      }
    } catch {}
  }

  // ---- Find doctor cards ----
  console.log('\n=== SEARCHING FOR DOCTOR CARDS ===');

  // Scroll back to top first
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  const doctorCardSelectors = [
    '[class*="doctor"]',
    '[class*="врач"]',
    '[class*="specialist"]',
    '[class*="card"]',
    'article',
    '[class*="Doctor"]',
    '[class*="Specialist"]'
  ];

  let doctorSelector = null;
  let doctorCount = 0;

  for (const sel of doctorCardSelectors) {
    try {
      const cards = await page.locator(sel).all();
      if (cards.length >= 3) {
        console.log(`Doctor cards selector "${sel}": found ${cards.length} elements`);
        if (!doctorSelector) {
          doctorSelector = sel;
          doctorCount = cards.length;
          // Get class info of first card
          const cls = await cards[0].getAttribute('class') || '';
          console.log(`  First card class: "${cls}"`);
        }
      }
    } catch {}
  }

  // Try data-attributes
  const dataAttrCards = await page.locator('[data-doctor], [data-specialist], [data-id]').all();
  console.log(`Data-attr doctor cards: ${dataAttrCards.length}`);

  // Scroll to find doctor list
  console.log('\nScrolling down to find doctor list...');

  // Take screenshots at different scroll positions
  for (let scrollY = 0; scrollY <= 4000; scrollY += 1000) {
    await page.evaluate(y => window.scrollTo(0, y), scrollY);
    await page.waitForTimeout(800);
  }

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_vrachi_list_area.png'), fullPage: false });
  console.log('Screenshot 03 (doctor list area) saved');

  // Get detailed page structure
  console.log('\n=== PAGE STRUCTURE ANALYSIS ===');
  const pageStructure = await page.evaluate(() => {
    // Find all elements with class containing "doctor" or "врач"
    const results = [];
    const allEls = document.querySelectorAll('*');
    const seen = new Set();

    for (const el of allEls) {
      const cls = el.className || '';
      const clsStr = typeof cls === 'string' ? cls : cls.toString();
      if (clsStr.toLowerCase().includes('doctor') ||
          clsStr.toLowerCase().includes('spec') ||
          clsStr.toLowerCase().includes('врач')) {
        const key = el.tagName + '.' + clsStr.split(' ').sort().join('.');
        if (!seen.has(key) && results.length < 30) {
          seen.add(key);
          results.push({
            tag: el.tagName,
            class: clsStr,
            id: el.id,
            children: el.children.length,
            text: el.textContent?.trim().substring(0, 50)
          });
        }
      }
    }
    return results;
  });

  console.log('Elements with doctor/spec class:');
  pageStructure.forEach((el, i) => {
    console.log(`  [${i}] <${el.tag}> class="${el.class}" id="${el.id}" children=${el.children}`);
  });

  // Find AI input by looking at page source
  console.log('\n=== LOOKING FOR AI INPUT IN DOM ===');
  const aiElements = await page.evaluate(() => {
    const results = [];
    // Look for elements with placeholder containing common AI picker texts
    const inputs = document.querySelectorAll('input, textarea');
    inputs.forEach(el => {
      const ph = el.placeholder || '';
      const cls = el.className || '';
      results.push({
        tag: el.tagName,
        placeholder: ph,
        class: cls,
        id: el.id,
        visible: el.offsetParent !== null
      });
    });
    return results;
  });

  console.log('All inputs/textareas:');
  aiElements.forEach((el, i) => {
    console.log(`  [${i}] <${el.tag}> placeholder="${el.placeholder}" class="${el.class}" id="${el.id}" visible=${el.visible}`);
  });

  // Now scroll to 9th doctor
  console.log('\n=== SCROLLING TO 9TH DOCTOR ===');

  // Try various card selectors to find doctor cards
  const possibleCardSelectors = [
    '.doctor-card',
    '.doctors__item',
    '.doctor__item',
    '.specialist-card',
    '[class*="DoctorCard"]',
    '[class*="doctor-card"]',
    '[class*="doctors-item"]',
    '[class*="doctorItem"]',
    'li[class*="doctor"]',
    'div[class*="doctor"]'
  ];

  for (const sel of possibleCardSelectors) {
    try {
      const count = await page.locator(sel).count();
      if (count > 0) {
        console.log(`Found ${count} elements with selector: ${sel}`);
        const firstClass = await page.locator(sel).first().getAttribute('class');
        console.log(`  First element class: "${firstClass}"`);
      }
    } catch {}
  }

  // Try to find 9th doctor using a broader approach
  // First find all doctor-like cards by structure (has image + name + button)
  const doctorLikeCards = await page.evaluate(() => {
    // Look for repeated structure elements that likely represent doctors
    const candidates = [];

    // Check lists
    const lists = document.querySelectorAll('ul, ol, [class*="list"]');
    for (const list of lists) {
      const items = list.children;
      if (items.length >= 5) {
        const firstItem = items[0];
        const hasImg = firstItem.querySelector('img') !== null;
        const hasBtn = firstItem.querySelector('button, a[href*="zapis"], a[class*="btn"]') !== null;
        if (hasImg && hasBtn) {
          candidates.push({
            listTag: list.tagName,
            listClass: list.className,
            itemTag: firstItem.tagName,
            itemClass: firstItem.className,
            count: items.length
          });
        }
      }
    }
    return candidates;
  });

  console.log('Doctor-like list structures:');
  doctorLikeCards.forEach((c, i) => {
    console.log(`  [${i}] list: <${c.listTag}>.${c.listClass}, item: <${c.itemTag}>.${c.itemClass}, count: ${c.count}`);
  });

  // Take full page screenshot
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_full_page.png'), fullPage: true });
  console.log('Screenshot 04 (full page) saved');

  // Final: try to scroll to where 9th doctor would be and screenshot
  // Reload fresh to get clean state
  console.log('\nReloading for clean 9th doctor search...');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Get all visible doctor-like elements
  const allDoctorElements = await page.evaluate(() => {
    const results = [];
    // Find all elements that could be doctor cards
    const selectors = [
      '.doctor-card', '.doctors__item', '.doctor__item',
      '[class*="doctor"]', '[class*="Doctor"]'
    ];

    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 3) {
        for (let i = 0; i < Math.min(els.length, 12); i++) {
          const el = els[i];
          const rect = el.getBoundingClientRect();
          results.push({
            selector: sel,
            index: i,
            class: el.className,
            tag: el.tagName,
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
            text: el.textContent?.trim().substring(0, 80),
            hasButton: !!el.querySelector('button, a[class*="btn"], a[href*="zapis"]'),
            buttonClass: el.querySelector('button, a[class*="btn"]')?.className || ''
          });
        }
        break;
      }
    }
    return results;
  });

  console.log('\nDoctor elements (first 12):');
  allDoctorElements.forEach(el => {
    console.log(`  [${el.index}] <${el.tag}> class="${el.class}"`);
    console.log(`    rect: top=${el.rect.top}, w=${el.rect.width}, h=${el.rect.height}`);
    console.log(`    text: "${el.text}"`);
    console.log(`    hasButton: ${el.hasButton}, buttonClass: "${el.buttonClass}"`);
  });

  // Scroll to 9th element (index 8)
  if (allDoctorElements.length >= 9) {
    const ninth = allDoctorElements[8];
    console.log(`\nScrolling to 9th doctor: ${ninth.selector}[${ninth.index}]`);
    await page.locator(ninth.selector).nth(8).scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_ninth_doctor.png') });
    console.log('Screenshot 05 (9th doctor) saved');

    // Get button info for 9th doctor
    const ninthBtnInfo = await page.evaluate((sel) => {
      const cards = document.querySelectorAll(sel);
      const ninth = cards[8];
      if (!ninth) return null;
      const btn = ninth.querySelector('button, a[class*="btn"], a[href*="zapis"], a[href*="record"]');
      if (!btn) return { found: false };
      return {
        found: true,
        tag: btn.tagName,
        class: btn.className,
        href: btn.getAttribute('href'),
        text: btn.textContent?.trim(),
        type: btn.getAttribute('type')
      };
    }, ninth.selector);

    console.log('\n9th doctor button info:', JSON.stringify(ninthBtnInfo, null, 2));
  }

  // Screenshot of doctor list at scroll position showing several doctors
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_doctors_list.png') });
  console.log('Screenshot 06 (doctors list) saved');

  await browser.close();
  console.log('\nDone! All screenshots saved to:', SCREENSHOTS_DIR);
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
