import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: false, slowMo: 500 });
const page = await browser.newPage();
await page.goto('https://eastclinic.ru/sertifikaty', { waitUntil: 'networkidle', timeout: 60000 });
try { await page.getByRole('button', { name: /принять/i }).click(); await page.waitForTimeout(500); } catch {}

// Прокручиваем до блока Кому сертификат
await page.locator('.who-checkbox-container').scrollIntoViewIfNeeded();
await page.waitForTimeout(500);

console.log('Checkpoint 1: страница открыта, прокручено до чекбокса');
await page.screenshot({ path: 'screenshots/sert-22-before.png' });

// Кликаем по SVG внутри gift-checkbox
const giftCheckbox = page.locator('div.gift-checkbox');
await giftCheckbox.click();
await page.waitForTimeout(800);

console.log('Checkpoint 2: clicked gift-checkbox');
await page.screenshot({ path: 'screenshots/sert-22-after.png' });

// Проверяем структуру DOM после клика
const dom = await page.evaluate(() => {
  const checkboxDiv = document.querySelector('.gift-checkbox');
  return {
    checkboxHtml: checkboxDiv?.outerHTML?.slice(0, 300),
    inputsAfter: [...document.querySelectorAll('input')].filter(el => el.offsetParent !== null).map(el => ({
      type: el.type, placeholder: el.placeholder, cls: el.className.slice(0, 40), visible: true
    }))
  };
});
console.log('После клика на gift-checkbox:', JSON.stringify(dom, null, 2));

await browser.close();
