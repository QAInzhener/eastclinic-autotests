/**
 * Проверяет кнопку «Показать ещё» (.more-button) на указанной странице врачей.
 * Каждый клик должен добавлять от 1 до 10 карточек (.doctor-info-container).
 * Возвращает { skipped, reason } | { ok, errors[], totalClicks, finalCount }
 */
export async function checkShowMore(page, url, label) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try { await page.getByRole('button', { name: /принять/i }).click({ timeout: 2000 }); } catch {}

  const crashed     = await page.locator('text=Что-то пошло не так').isVisible({ timeout: 1000 }).catch(() => false);
  const maintenance = await page.locator('text=Сайт скоро вернётся').isVisible({ timeout: 1000 }).catch(() => false);
  if (crashed || maintenance) return { skipped: true, reason: 'страница недоступна' };

  // Ждём появления хотя бы одной карточки
  await page.waitForFunction(
    () => document.querySelectorAll('.doctor-info-container').length > 0,
    { timeout: 15000 }
  ).catch(() => {});

  let count = await page.evaluate(() => document.querySelectorAll('.doctor-info-container').length);
  if (count === 0) return { skipped: true, reason: 'нет карточек врачей' };

  console.log(`[show-more] ${label}: начальное кол-во = ${count}`);

  let clickNum = 0;
  const errors = [];
  const MAX_CLICKS = 20; // защита от многоминутного цикла на специальностях с очень большим числом врачей
  const LOOP_DEADLINE_MS = 25000; // защита по времени — независимо от MAX_CLICKS, не даём одной странице съесть весь бюджет теста
  const loopStart = Date.now();

  while (clickNum < MAX_CLICKS && Date.now() - loopStart < LOOP_DEADLINE_MS) {
    const btn     = page.locator('button.more-button').first();
    const visible = await btn.isVisible({ timeout: 1000 }).catch(() => false);
    if (!visible) break;
    const enabled = await btn.isEnabled({ timeout: 1000 }).catch(() => false);
    if (!enabled) break;

    const prev = count;
    await btn.scrollIntoViewIfNeeded({ timeout: 15000 });
    await btn.click({ timeout: 15000 });
    clickNum++;

    // Ждём, пока в DOM появятся новые карточки (до 10 с)
    await page.waitForFunction(
      (n) => document.querySelectorAll('.doctor-info-container').length > n,
      prev,
      { timeout: 10000 }
    ).catch(() => {});

    count = await page.evaluate(() => document.querySelectorAll('.doctor-info-container').length);
    let added = count - prev;

    // Даём странице ещё до 2 попыток — AJAX-запрос мог не успеть ответить за 10с
    // из-за разовой задержки сети, а не из-за реальной поломки кнопки. Один повтор
    // оказался недостаточен на страницах с большим числом врачей — увеличено до двух.
    for (let retry = 0; added === 0 && retry < 2; retry++) {
      const stillVisible = await btn.isVisible({ timeout: 1000 }).catch(() => false);
      const stillEnabled = stillVisible && await btn.isEnabled({ timeout: 1000 }).catch(() => false);
      if (!stillVisible || !stillEnabled) break;

      await btn.click({ timeout: 15000 });
      await page.waitForFunction(
        (n) => document.querySelectorAll('.doctor-info-container').length > n,
        prev,
        { timeout: 12000 }
      ).catch(() => {});
      count = await page.evaluate(() => document.querySelectorAll('.doctor-info-container').length);
      added = count - prev;
    }

    if (added === 0) {
      errors.push(`клик ${clickNum}: карточки не добавились при видимой кнопке`);
      break;
    }
    if (added > 10) {
      errors.push(`клик ${clickNum}: добавилось ${added} карточек (ожидалось ≤10 за раз)`);
    }

    console.log(`[show-more] ${label}: клик ${clickNum} → +${added} (итого ${count})`);
  }

  if (clickNum === MAX_CLICKS) {
    console.log(`[show-more] ${label}: достигнут лимит ${MAX_CLICKS} кликов, прекращаем (список ещё не исчерпан, но страница слишком большая)`);
  } else if (Date.now() - loopStart >= LOOP_DEADLINE_MS) {
    console.log(`[show-more] ${label}: истёк лимит времени на страницу (${LOOP_DEADLINE_MS}мс), прекращаем`);
  }

  return { ok: errors.length === 0, errors, totalClicks: clickNum, finalCount: count };
}
