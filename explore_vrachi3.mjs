import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'https://eastclinic.ru';
const SCREENSHOTS_DIR = 'C:\\Users\\Acer\\Documents\\Автотесты\\screenshots';

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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

  // ---- Check if select-doctor-button is inside doctor-item-container ----
  console.log('=== CHECKING WHERE select-doctor-button LIVES ===');
  const info = await page.evaluate(() => {
    const btn = document.querySelector('.select-doctor-button');
    if (!btn) return { found: false };

    // Walk up to see where it lives
    const parents = [];
    let el = btn.parentElement;
    for (let i = 0; i < 8; i++) {
      if (!el) break;
      parents.push({ tag: el.tagName, class: el.className.substring(0, 80), id: el.id });
      el = el.parentElement;
    }

    // Is it inside a doctor-item-container?
    const inDoctorContainer = !!btn.closest('.doctor-item-container');
    const closestDoctor = btn.closest('.doctor-item-container');

    return {
      found: true,
      btnClass: btn.className,
      btnText: btn.textContent?.trim(),
      inDoctorContainer,
      doctorName: closestDoctor?.querySelector('.doctor-full-name')?.textContent?.trim(),
      parents
    };
  });
  console.log('select-doctor-button info:', JSON.stringify(info, null, 2));

  // ---- Check the full structure of doctor-cards-wrapper ----
  console.log('\n=== DOCTOR-CARDS-WRAPPER STRUCTURE ===');
  const wrapperInfo = await page.evaluate(() => {
    const wrapper = document.querySelector('.doctor-cards-wrapper');
    if (!wrapper) return null;

    // Get direct children
    const children = Array.from(wrapper.children).map(c => ({
      tag: c.tagName,
      class: c.className.substring(0, 100),
      id: c.id,
      childCount: c.children.length,
      text: c.textContent?.trim().substring(0, 60)
    }));

    return { class: wrapper.className, children };
  });
  console.log('wrapper children:', JSON.stringify(wrapperInfo?.children, null, 2));

  // ---- Is the button inside the ai-search block? ----
  console.log('\n=== AI SEARCH BLOCK - FULL STRUCTURE ===');
  const aiSearchInfo = await page.evaluate(() => {
    // Find the wrapper containing ai-search
    const aiInput = document.querySelector('.ai-search__input');
    if (!aiInput) return null;

    // Find the ai-search block (parent containers)
    let block = aiInput;
    for (let i = 0; i < 5; i++) {
      block = block.parentElement;
      if (!block) break;
      if (block.className.includes('ai-search')) break;
    }

    function getTree(el, depth) {
      if (depth > 3) return null;
      return {
        tag: el.tagName,
        class: el.className.substring(0, 80),
        id: el.id,
        children: Array.from(el.children).slice(0, 10).map(c => getTree(c, depth + 1)).filter(Boolean)
      };
    }

    return getTree(block, 0);
  });
  console.log('AI search block tree:', JSON.stringify(aiSearchInfo, null, 2));

  // ---- Hover over 9th doctor to see if button appears ----
  console.log('\n=== HOVERING OVER 9TH DOCTOR ===');
  const ninthDoctor = page.locator('.doctor-item-container').nth(8);
  await ninthDoctor.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // Hover
  await ninthDoctor.hover();
  await page.waitForTimeout(1000);

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '09_ninth_hover.png') });
  console.log('Screenshot 09 saved (hover on 9th doctor)');

  const afterHoverBtn = await page.evaluate(() => {
    const items = document.querySelectorAll('.doctor-item-container');
    const ninth = items[8];
    if (!ninth) return null;
    const btns = ninth.querySelectorAll('button');
    const links = ninth.querySelectorAll('a');
    return {
      buttons: Array.from(btns).map(b => ({
        class: b.className,
        text: b.textContent?.trim(),
        visible: b.offsetParent !== null,
        display: window.getComputedStyle(b).display,
        visibility: window.getComputedStyle(b).visibility,
        opacity: window.getComputedStyle(b).opacity
      })),
      links: Array.from(links).map(a => ({
        class: a.className,
        text: a.textContent?.trim().substring(0, 50),
        href: a.getAttribute('href'),
        display: window.getComputedStyle(a).display
      }))
    };
  });
  console.log('After hover - buttons:', JSON.stringify(afterHoverBtn?.buttons, null, 2));
  console.log('After hover - links:', JSON.stringify(afterHoverBtn?.links, null, 2));

  // ---- Check the calendar / appointment section in doctor card ----
  console.log('\n=== DOCTOR CALENDAR SECTION ===');
  const calendarInfo = await page.evaluate(() => {
    const items = document.querySelectorAll('.doctor-item-container');
    const ninth = items[8];
    if (!ninth) return null;

    const cal = ninth.querySelector('.doctor-calendar-container');
    if (!cal) return { found: false };

    // Get all clickable elements in calendar
    const clickable = cal.querySelectorAll('button, a');
    const days = cal.querySelectorAll('[class*="day"], [class*="slot"], [class*="time"], [class*="date"]');

    return {
      found: true,
      calClass: cal.className,
      clickableCount: clickable.length,
      clickable: Array.from(clickable).slice(0, 10).map(el => ({
        tag: el.tagName,
        class: el.className,
        text: el.textContent?.trim().substring(0, 40),
        href: el.getAttribute('href')
      })),
      daysCount: days.length,
      calHTML: cal.innerHTML.substring(0, 500)
    };
  });
  console.log('Calendar section:', JSON.stringify(calendarInfo, null, 2));

  // ---- Check if there's a "Записаться" button linked to a specific time slot ----
  console.log('\n=== CHECKING select-doctor-button FULL CONTEXT ===');
  const btnContext = await page.evaluate(() => {
    const btn = document.querySelector('.select-doctor-button');
    if (!btn) return null;

    // Get parent chain up to 10 levels
    const chain = [];
    let el = btn;
    for (let i = 0; i < 10; i++) {
      if (!el) break;
      chain.push({ tag: el.tagName, class: el.className.substring(0, 80) });
      el = el.parentElement;
    }

    // Get sibling structure
    const parent = btn.parentElement;
    const siblings = parent ? Array.from(parent.children).map(c => ({
      tag: c.tagName,
      class: c.className.substring(0, 60),
      text: c.textContent?.trim().substring(0, 50)
    })) : [];

    return { chain, siblings, parentHTML: btn.parentElement?.innerHTML?.substring(0, 300) };
  });
  console.log('Button parent chain:', JSON.stringify(btnContext?.chain, null, 2));
  console.log('Button siblings:', JSON.stringify(btnContext?.siblings, null, 2));
  console.log('Parent HTML:', btnContext?.parentHTML);

  await browser.close();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
