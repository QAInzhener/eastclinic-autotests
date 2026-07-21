import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'https://eastclinic.ru';
const PAGE_URL = BASE_URL + '/kontakty/licenziya';
const SITE_HOST = new URL(BASE_URL).hostname;

// Ссылки на лицензии и документы распознаём по тексту кнопки, а не по URL/CSS-классу —
// на странице два блока (лицензии филиалов и «Документы» ниже), у части ссылок
// домен вообще внешний (Яндекс), так что общий признак только один: текст "Открыть в PDF".
const LINK_TEXT = 'Открыть в PDF';

test('Документы и лицензии — /kontakty/licenziya — все ссылки открываются корректно', async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try { await page.getByRole('button', { name: /принять/i }).click({ timeout: 3000 }); } catch {}

  await page.getByText(LINK_TEXT, { exact: true }).first().waitFor({ state: 'attached', timeout: 15000 });

  // Список карточек может подгружаться частями/виртуализироваться при скролле,
  // поэтому собираем ссылки инкрементально по ходу прокрутки, а не одним снимком в конце —
  // иначе карточки, прокрученные выше экрана, успевают пропасть из DOM до сбора.
  const collectNow = () => page.$$eval('a', (els, linkText) => els
    .filter(a => a.textContent.trim() === linkText)
    .map(a => ({
      href: a.href,
      label: a.closest('div')?.querySelector('h2, h3, h4, [class*="title"], [class*="name"]')?.textContent?.trim() || null,
    })), LINK_TEXT);

  const collected = new Map();
  for (const l of await collectNow()) collected.set(l.href, l);
  for (let i = 0; i < 20; i++) {
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(300);
    for (const l of await collectNow()) collected.set(l.href, l);
  }

  // Список лицензий и документов со временем растёт — никаких захардкоженных
  // количеств или имён филиалов здесь быть не должно.
  const links = [...collected.values()];

  expect(links.length, 'На странице должна быть хотя бы одна ссылка «Открыть в PDF»').toBeGreaterThan(0);
  console.log(`[licenses] Найдено уникальных ссылок «${LINK_TEXT}»: ${links.length}`);

  const failed = [];

  for (const { href, label } of links) {
    const name = label || href;
    const isOwnDomain = new URL(href).hostname === SITE_HOST;

    try {
      const response = await page.request.get(href, { timeout: 45000 });
      const status = response.status();
      const contentType = response.headers()['content-type'] || '';
      const body = await response.body();
      const hasContent = body.length > 500; // защита от пустого/битого ответа

      if (isOwnDomain) {
        // Свои файлы обязаны быть настоящим PDF: проверяем и заголовок, и сигнатуру.
        const isPdfContentType = /pdf/i.test(contentType);
        const isPdfMagicBytes  = body.subarray(0, 5).toString('latin1') === '%PDF-';

        if (status !== 200 || !isPdfContentType || !isPdfMagicBytes || !hasContent) {
          const reason =
            status !== 200 ? `HTTP ${status}` :
            !isPdfMagicBytes ? 'не похоже на PDF (нет сигнатуры %PDF-)' :
            !isPdfContentType ? `неожиданный Content-Type: ${contentType}` :
            'файл пустой/слишком маленький';
          failed.push({ name, href, reason });
          console.log(`  ✗ ${name} — ${href} (${status}, ${contentType}, ${body.length} байт) — ${reason}`);
        } else {
          console.log(`  ✓ ${name} — ${href} (${(body.length / 1024).toFixed(0)} КБ, PDF)`);
        }
      } else {
        // Внешние ссылки (Яндекс.Диск, страницы Яндекса) не обязаны отдавать сырой PDF —
        // достаточно, что ссылка живая и действительно открывается.
        if (status >= 400 || !hasContent) {
          const reason = status >= 400 ? `HTTP ${status}` : 'пустой ответ';
          failed.push({ name, href, reason });
          console.log(`  ✗ ${name} — ${href} (внешняя ссылка, ${status}) — ${reason}`);
        } else {
          console.log(`  ✓ ${name} — ${href} (внешняя ссылка, ${status}, ${(body.length / 1024).toFixed(0)} КБ)`);
        }
      }
    } catch (e) {
      failed.push({ name, href, reason: `ошибка запроса: ${e.message}` });
      console.log(`  ✗ ${name} — ${href} — ошибка запроса: ${e.message}`);
    }
  }

  if (failed.length) {
    throw new Error(
      `Не открылись корректно ${failed.length} из ${links.length} ссылок:\n` +
      failed.map(f => `  • ${f.name} (${f.href}) — ${f.reason}`).join('\n')
    );
  }
});
