import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: false, slowMo: 200 });
const page = await browser.newPage();
await page.goto('https://eastclinic.ru/vrachi', { waitUntil: 'networkidle', timeout: 60000 });

// Считаем по doctor-info-container
const countBefore = await page.evaluate(() =>
  document.querySelectorAll('.doctor-info-container').length
);
console.log('doctor-info-container до:', countBefore);

// Кликаем more-button (без ё)
const moreBtn = page.locator('button.more-button').first();
await moreBtn.scrollIntoViewIfNeeded();
await moreBtn.click();

// Ждём изменения
let countAfter = countBefore;
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(500);
  countAfter = await page.evaluate(() => document.querySelectorAll('.doctor-info-container').length);
  if (countAfter > countBefore) break;
}
console.log('doctor-info-container после:', countAfter);

// Первый новый врач
const firstNew = await page.evaluate((idx) => {
  const containers = [...document.querySelectorAll('.doctor-info-container')];
  const newContainer = containers[idx];
  if (!newContainer) return null;
  const link = newContainer.querySelector('a[href*="/vrach/"]');
  return { href: link?.href, text: newContainer.textContent.trim().slice(0, 80) };
}, countBefore);
console.log('Первый новый врач:', JSON.stringify(firstNew));

// Идём на его страницу
if (firstNew?.href) {
  await page.goto(firstNew.href, { waitUntil: 'networkidle', timeout: 30000 });

  const info = await page.evaluate(() => {
    const h1 = document.querySelector('h1')?.textContent?.trim();
    const reviewBtns = [...document.querySelectorAll('button')]
      .filter(el => /оставить отзыв/i.test(el.textContent) && el.offsetParent !== null)
      .map(b => ({ cls: b.className, text: b.textContent.trim() }));
    const hasForm = !!document.querySelector('.reviews-form-container');
    return { url: location.href, h1, reviewBtns, hasForm };
  });
  console.log('Страница врача:', JSON.stringify(info, null, 2));
}

await browser.close();
