import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'https://eastclinic.ru';
const PAGE_URL = BASE_URL + '/nalogovyy-vychet';
const BUTTON_TEXT = 'Скачать заявление';

test('Налоговый вычет — /nalogovyy-vychet — файлы заявлений открываются корректно', async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try { await page.getByRole('button', { name: /принять/i }).click({ timeout: 3000 }); } catch {}

  // Кнопок несколько (по числу заявлений), количество со временем может меняться —
  // никаких захардкоженных чисел, ищем все кнопки с этим текстом.
  const buttons = page.getByRole('button', { name: BUTTON_TEXT, exact: true });
  const count = await buttons.count();
  expect(count, `На странице должна быть хотя бы одна кнопка «${BUTTON_TEXT}»`).toBeGreaterThan(0);
  console.log(`[nalogovyy-vychet] Найдено кнопок «${BUTTON_TEXT}»: ${count}`);

  const seen = new Set();
  const failed = [];

  for (let i = 0; i < count; i++) {
    const label = `Кнопка №${i + 1}`;
    let url = null;

    try {
      // Кнопка открывает файл во внешнем вьюере (docs.yandex.ru) новой вкладкой,
      // а не через нативное скачивание браузера. На случай, если поведение изменится,
      // параллельно ловим и настоящий download-эвент и сразу его отменяем —
      // чтобы файл точно никогда не сохранялся на диск сервера.
      const [result] = await Promise.all([
        Promise.race([
          page.waitForEvent('popup', { timeout: 15000 }).then(popup => ({ popup })),
          page.waitForEvent('download', { timeout: 15000 }).then(download => ({ download })),
        ]),
        buttons.nth(i).click(),
      ]);

      if (result?.download) {
        url = result.download.url();
        await result.download.cancel();
      } else if (result?.popup) {
        const popup = result.popup;
        await popup.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
        url = popup.url();
        await popup.close();
      }
    } catch (e) {
      failed.push({ name: label, href: null, reason: `не удалось открыть файл: ${e.message}` });
      console.log(`  ✗ ${label} — не удалось открыть файл: ${e.message}`);
      continue;
    }

    if (!url || url === 'about:blank') {
      failed.push({ name: label, href: url, reason: 'не получили ссылку на файл' });
      console.log(`  ✗ ${label} — не получили ссылку на файл`);
      continue;
    }
    if (seen.has(url)) {
      console.log(`  ✓ ${label} — ${url} (дубликат уже проверенной ссылки)`);
      continue;
    }
    seen.add(url);

    try {
      const response = await page.request.get(url, { timeout: 45000 });
      const status = response.status();
      const body = await response.body();
      const hasContent = body.length > 500;

      if (status >= 400 || !hasContent) {
        const reason = status >= 400 ? `HTTP ${status}` : 'пустой ответ';
        failed.push({ name: label, href: url, reason });
        console.log(`  ✗ ${label} — ${url} (${status}) — ${reason}`);
      } else {
        console.log(`  ✓ ${label} — ${url} (${status}, ${(body.length / 1024).toFixed(0)} КБ)`);
      }
    } catch (e) {
      failed.push({ name: label, href: url, reason: `ошибка запроса: ${e.message}` });
      console.log(`  ✗ ${label} — ${url} — ошибка запроса: ${e.message}`);
    }
  }

  if (failed.length) {
    throw new Error(
      `Не открылись корректно ${failed.length} из ${count} файлов заявлений:\n` +
      failed.map(f => `  • ${f.name} (${f.href || 'нет ссылки'}) — ${f.reason}`).join('\n')
    );
  }
});
