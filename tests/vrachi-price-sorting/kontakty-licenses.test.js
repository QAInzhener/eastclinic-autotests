import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'https://eastclinic.ru';
const PAGE_URL = BASE_URL + '/kontakty/licenziya';

// Ссылки на лицензии распознаём по пути файла (/files?name=licenzii/...), а не по CSS-классу —
// у класса a.block-button есть и другие, не относящиеся к лицензиям ссылки в футере страницы.
const LICENSE_LINK_SELECTOR = 'a[href*="/files?name=licenzii/"]';

test('Документы и лицензии — /kontakty/licenziya — все ссылки открываются корректно', async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try { await page.getByRole('button', { name: /принять/i }).click({ timeout: 3000 }); } catch {}

  await page.waitForSelector(LICENSE_LINK_SELECTOR, { timeout: 15000 });

  // Собираем ссылки динамически — список лицензий со временем растёт, никаких
  // захардкоженных количеств или имён филиалов здесь быть не должно.
  const rawLinks = await page.$$eval(LICENSE_LINK_SELECTOR, (els) => els.map(a => ({
    href: a.href,
    label: a.closest('div')?.querySelector('h2, h3, h4, [class*="title"], [class*="name"]')?.textContent?.trim() || null,
  })));

  // Дедуп по href — одна и та же лицензия иногда встречается в карточке филиала дважды
  const seen = new Set();
  const links = rawLinks.filter(l => {
    if (!l.href || seen.has(l.href)) return false;
    seen.add(l.href);
    return true;
  });

  expect(links.length, 'На странице должна быть хотя бы одна ссылка на лицензию').toBeGreaterThan(0);
  console.log(`[licenses] Найдено уникальных документов: ${links.length}`);

  const failed = [];

  for (const { href, label } of links) {
    const name = label || href;
    try {
      const response = await page.request.get(href, { timeout: 45000 });
      const status = response.status();
      const contentType = response.headers()['content-type'] || '';
      const body = await response.body();

      const isPdfContentType = /pdf/i.test(contentType);
      const isPdfMagicBytes  = body.subarray(0, 5).toString('latin1') === '%PDF-';
      const hasContent       = body.length > 500; // защита от пустого/битого файла

      if (status !== 200 || !isPdfContentType || !isPdfMagicBytes || !hasContent) {
        const reason =
          status !== 200 ? `HTTP ${status}` :
          !isPdfMagicBytes ? 'не похоже на PDF (нет сигнатуры %PDF-)' :
          !isPdfContentType ? `неожиданный Content-Type: ${contentType}` :
          'файл пустой/слишком маленький';
        failed.push({ name, href, reason });
        console.log(`  ✗ ${name} — ${href} (${status}, ${contentType}, ${body.length} байт) — ${reason}`);
      } else {
        console.log(`  ✓ ${name} — ${href} (${(body.length / 1024).toFixed(0)} КБ)`);
      }
    } catch (e) {
      failed.push({ name, href, reason: `ошибка запроса: ${e.message}` });
      console.log(`  ✗ ${name} — ${href} — ошибка запроса: ${e.message}`);
    }
  }

  if (failed.length) {
    throw new Error(
      `Не открылись корректно ${failed.length} из ${links.length} документов:\n` +
      failed.map(f => `  • ${f.name} (${f.href}) — ${f.reason}`).join('\n')
    );
  }
});
