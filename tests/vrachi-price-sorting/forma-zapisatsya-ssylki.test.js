import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'https://eastclinic.ru';

// Три ссылки в форме «Записаться» (шапка сайта), ведущие на согласия/политики.
// Тексты — единственные совпадения на всей странице, поэтому без сужения до модалки.
const LINKS = [
  'обработки персональных данных',
  'Пользовательское соглашение на бронирование времени услуги',
  'политику обработки данных',
];

async function acceptCookies(page) {
  const cookieBtn = page.getByRole('button', { name: /принять/i });
  if (await cookieBtn.isVisible().catch(() => false)) {
    await cookieBtn.click();
  }
}

async function openAppointmentModal(page) {
  await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await acceptCookies(page);

  const crashed     = await page.locator('text=Что-то пошло не так').isVisible({ timeout: 1000 }).catch(() => false);
  const maintenance = await page.locator('text=Сайт скоро вернётся').isVisible({ timeout: 1000 }).catch(() => false);
  if (maintenance) throw new Error('ОШИБКА 500: сайт упал — главная страница показывает экран "Сайт скоро вернётся"');
  if (crashed) throw new Error('Приложение недоступно — главная страница показывает экран ошибки "Что-то пошло не так"');

  await page.getByRole('button', { name: /записаться/i }).first().click();
  await expect(page.getByPlaceholder('Ваше имя и фамилия')).toBeVisible({ timeout: 10000 });
}

test('Форма "Записаться" (шапка) — ссылки на согласия/политики открываются корректно', async ({ page }) => {
  test.setTimeout(120_000);

  await openAppointmentModal(page);

  const failed = [];

  for (const linkText of LINKS) {
    const link = page.getByRole('link', { name: linkText, exact: false });
    const visible = await link.first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) {
      failed.push({ name: linkText, reason: 'ссылка не найдена в форме' });
      continue;
    }
    const href = await link.first().getAttribute('href');

    try {
      // Клик может привести либо к открытию новой вкладки (внешние Яндекс-ссылки),
      // либо к скачиванию файла (собственный PDF-эндпоинт) — ждём оба варианта разом.
      const outcome = await Promise.race([
        page.waitForEvent('popup', { timeout: 10000 }).then(popup => ({ type: 'popup', popup })),
        page.waitForEvent('download', { timeout: 10000 }).then(download => ({ type: 'download', download })),
      ]);
      await link.first().click({ timeout: 5000 }).catch(() => {});

      if (outcome.type === 'download') {
        const { download } = outcome;
        const fileUrl = download.url();
        const response = await page.request.get(fileUrl, { timeout: 30000 });
        const status = response.status();
        const body = await response.body();
        if (status >= 400 || body.length < 500) {
          failed.push({ name: linkText, href: fileUrl, reason: status >= 400 ? `HTTP ${status}` : 'файл пустой/слишком маленький' });
          console.log(`  ✗ ${linkText} — ${fileUrl} (скачивание, ${status}, ${body.length} байт)`);
        } else {
          console.log(`  ✓ ${linkText} — ${fileUrl} (скачивание, ${status}, ${(body.length / 1024).toFixed(0)} КБ)`);
        }
      } else {
        // Внешние ссылки (Яндекс) блокируют «сырые» HTTP-запросы антибот-защитой (капча),
        // поэтому статус не проверяем — достаточно, что реальный клик в браузере
        // действительно открыл вкладку и она ушла с about:blank на целевой домен.
        const { popup } = outcome;
        await popup.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
        await popup.waitForTimeout(1000);
        const finalUrl = popup.url();
        const hasContent = await popup.evaluate(() => document.body?.innerText?.length > 0).catch(() => false);

        if (!finalUrl || finalUrl === 'about:blank' || !hasContent) {
          failed.push({ name: linkText, href, reason: `новая вкладка не открыла страницу (осталась на "${finalUrl || 'about:blank'}")` });
          console.log(`  ✗ ${linkText} — ${href} — вкладка не открыла контент (url="${finalUrl}")`);
        } else {
          console.log(`  ✓ ${linkText} — ${finalUrl} (внешняя ссылка, вкладка открылась)`);
        }
        await popup.close();
      }
    } catch (e) {
      failed.push({ name: linkText, href, reason: `при клике не последовало ни новой вкладки, ни скачивания: ${e.message}` });
      console.log(`  ✗ ${linkText} — ${href} — ${e.message}`);
    }

    // Модалка может закрыться/потерять фокус после клика по внешней ссылке — переоткрываем перед следующей.
    const modalStillOpen = await page.getByPlaceholder('Ваше имя и фамилия').isVisible().catch(() => false);
    if (!modalStillOpen) {
      await openAppointmentModal(page);
    }
  }

  if (failed.length) {
    throw new Error(
      `Не открылись корректно ${failed.length} из ${LINKS.length} ссылок в форме "Записаться":\n` +
      failed.map(f => `  • ${f.name}${f.href ? ` (${f.href})` : ''} — ${f.reason}`).join('\n')
    );
  }
});
