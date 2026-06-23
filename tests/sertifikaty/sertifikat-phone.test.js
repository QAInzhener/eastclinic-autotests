import { test, expect } from '@playwright/test';
import { checkEmailMessage } from '../helpers/email.js';
import { BASE_URL } from '../helpers/config.js';

const SERTIFIKATY_PAGE  = BASE_URL + '/sertifikaty';
const AMOUNT            = '30000';
const RECIPIENT_PHONE   = '7777777777';        // +7 (777) 777-77-77
const RECIPIENT_NAME    = 'Тест Сертификат Получатель';
const WISH_TEXT         = 'Тестовое поздравление - автоматическая проверка формы Выберите дизайн/ номинал сертификата';
const SENDER_NAME       = 'Тест Тестов';
const SENDER_PHONE      = '4444444444';        // +7 (444) 444-44-44
const SENDER_EMAIL      = 'autotesting@gmail.com';

async function acceptCookies(page) {
  const cookieBtn = page.getByRole('button', { name: /принять/i });
  try { await cookieBtn.waitFor({ state: 'visible', timeout: 5000 }); await cookieBtn.click(); } catch {}
}

test('Сертификат (вариант 1) — оформление по номеру телефона', async ({ page }) => {
  const sentAt = new Date();

  // 1. Открываем страницу
  await page.goto(SERTIFIKATY_PAGE);
  await page.waitForLoadState('networkidle');
  await acceptCookies(page);

  // 2. Сумма сертификата
  const amountInput = page.locator('input.gift-default-input.price-input-margins');
  await amountInput.scrollIntoViewIfNeeded();
  await amountInput.click();
  await amountInput.fill(AMOUNT);

  // 3. Телефон получателя (первый tel-input, без id)
  const recipientPhone = page.locator('input[type="tel"].text-color-main').first();
  await recipientPhone.click();
  await page.keyboard.type(RECIPIENT_PHONE);

  // 4. Раскрываем блок пожелания
  const wishBtn = page.locator('div.add-wish-button-container');
  await wishBtn.scrollIntoViewIfNeeded();
  await wishBtn.click();
  await page.locator('input[placeholder="Имя и фамилия получателя"]')
    .waitFor({ state: 'visible', timeout: 6000 });

  // 5. Имя и фамилия получателя
  await page.locator('input[placeholder="Имя и фамилия получателя"]').fill(RECIPIENT_NAME);

  // 6. Текст поздравления
  await page.locator('textarea.wish-text-input').fill(WISH_TEXT);

  // 7. Дата и время отправки — 7 суток от текущего момента
  const send = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const dateStr = [
    String(send.getDate()).padStart(2, '0'),
    String(send.getMonth() + 1).padStart(2, '0'),
    send.getFullYear(),
  ].join('.') + ' ' + [
    String(send.getHours()).padStart(2, '0'),
    String(send.getMinutes()).padStart(2, '0'),
  ].join(':');
  await page.locator('input[placeholder="Введите дату и желаемое время отправки"]').fill(dateStr);

  // 8. Данные отправителя
  await page.locator('input[name="fio"]').fill(SENDER_NAME);

  const senderPhone = page.locator('input#phone');
  await senderPhone.click();
  await page.keyboard.type(SENDER_PHONE);

  await page.locator('input[type="email"].gift-default-input').fill(SENDER_EMAIL);

  const checkbox = page.locator('input[name="agreeCheckbox"]');
  if (!await checkbox.isChecked()) await checkbox.check();

  // 9. Отправляем форму
  const submitBtn = page.locator('button[class*="services-button-container"]');
  await submitBtn.scrollIntoViewIfNeeded();
  await submitBtn.click();

  // 10. Ждём индикатора успеха — кнопка пропадает или появляется текст подтверждения
  await expect(
    page.locator('text=/спасибо|заявка|оформлен|принята|успешно/i')
  ).toBeVisible({ timeout: 10000 }).catch(async () => {
    // Если явного сообщения нет — проверяем, что кнопка исчезла
    await expect(submitBtn).not.toBeVisible({ timeout: 5000 });
  });

  // 11. Проверяем прибытие письма на почту (только для prod)
  if (BASE_URL === 'https://eastclinic.ru') {
    test.setTimeout(240000);
    await checkEmailMessage(SENDER_EMAIL, sentAt, 120000);
  }
});
