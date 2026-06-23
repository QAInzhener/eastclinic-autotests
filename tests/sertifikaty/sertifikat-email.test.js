import { test, expect } from '@playwright/test';
import { checkEmailMessage } from '../helpers/email.js';
import { BASE_URL } from '../helpers/config.js';

const SERTIFIKATY_PAGE   = BASE_URL + '/sertifikaty';
const RECIPIENT_EMAIL    = 'recipient@gmail.com';
const RECIPIENT_NAME     = 'Тест Сертификат Получатель';
const WISH_TEXT          = 'Тестовое поздравление - автоматическая проверка формы Выберите дизайн/ номинал сертификата';
const SENDER_NAME        = 'Тест Тестов';
const SENDER_PHONE       = '4444444444';           // +7 (444) 444-44-44
const SENDER_EMAIL       = 'autotesting@gmail.com';

async function acceptCookies(page) {
  const cookieBtn = page.getByRole('button', { name: /принять/i });
  try { await cookieBtn.waitFor({ state: 'visible', timeout: 5000 }); await cookieBtn.click(); } catch {}
}

// Находит vanillaFlicking внутри Vue-компонента карусели и переключает карточку вправо
async function flickPrev(page) {
  await page.evaluate(async () => {
    const root = document.getElementById('__nuxt')?._vnode;
    if (!root) return;

    const seen = new WeakSet();
    let flicking = null;

    const search = (obj, depth) => {
      if (!obj || typeof obj !== 'object' || depth > 60 || seen.has(obj)) return;
      seen.add(obj);

      if (obj.__v_isVNode && obj.component) {
        const proxy = obj.component.proxy;
        if (proxy && typeof proxy.next === 'function' && typeof proxy.moveTo === 'function') {
          const vf = proxy.vanillaFlicking;
          if (vf && typeof vf.moveTo === 'function') {
            flicking = vf;
            return;
          }
        }
      }

      const fields = ['children', 'suspense'];
      fields.forEach(f => {
        if (!flicking && obj[f]) {
          if (Array.isArray(obj[f])) obj[f].forEach(c => search(c, depth + 1));
          else search(obj[f], depth + 1);
        }
      });
      if (!flicking && obj.component?.subTree) search(obj.component.subTree, depth + 1);
      if (!flicking && obj.children && typeof obj.children === 'object' && !Array.isArray(obj.children)) {
        Object.values(obj.children).forEach(slot => {
          if (typeof slot === 'function' && !flicking) {
            try { const r = slot({}); if (Array.isArray(r)) r.forEach(n => search(n, depth + 1)); else search(r, depth + 1); } catch {}
          }
        });
      }
      if (!flicking && obj.suspense) {
        ['activeBranch', 'pendingBranch'].forEach(k => { if (obj.suspense[k] && !flicking) search(obj.suspense[k], depth + 1); });
      }
    };

    search(root, 0);
    if (flicking) await flicking.prev();
  });
  await page.waitForTimeout(600); // ждём завершения анимации
}

test('Сертификат (вариант 2) — оформление по email', async ({ page }) => {
  const sentAt = new Date();

  // 1. Открываем страницу
  await page.goto(SERTIFIKATY_PAGE);
  await page.waitForLoadState('networkidle');
  await acceptCookies(page);

  // 2. Прокручиваем до карусели и переключаем на следующую карточку
  await page.locator('.flicking-viewport').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await flickPrev(page);

  // 3. Выбираем номинал 50 000 ₽
  const preset50k = page.locator('div.price-suggestion', { hasText: '50 000' });
  await preset50k.scrollIntoViewIfNeeded();
  await preset50k.click();

  // 4. Включаем чекбокс «Отправить на почту» (кликаем по SVG-иконке чекбокса)
  const giftCheckbox = page.locator('div.gift-checkbox');
  await giftCheckbox.scrollIntoViewIfNeeded();
  await giftCheckbox.click();

  // 5. Поле Email получателя (появляется вместо поля телефона)
  const recipientEmailInput = page.locator('input[placeholder="Email получателя"]');
  await recipientEmailInput.waitFor({ state: 'visible', timeout: 6000 });
  await recipientEmailInput.fill(RECIPIENT_EMAIL);

  // 6. Раскрываем блок пожелания
  const wishBtn = page.locator('div.add-wish-button-container');
  await wishBtn.scrollIntoViewIfNeeded();
  await wishBtn.click();
  await page.locator('input[placeholder="Имя и фамилия получателя"]').waitFor({ state: 'visible', timeout: 6000 });

  // 7. Имя и фамилия получателя
  await page.locator('input[placeholder="Имя и фамилия получателя"]').fill(RECIPIENT_NAME);

  // 8. Текст поздравления
  await page.locator('textarea.wish-text-input').fill(WISH_TEXT);

  // 9. Дата отправки — 7 дней вперёд
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

  // 10. Данные отправителя
  await page.locator('input[name="fio"]').fill(SENDER_NAME);

  const senderPhone = page.locator('input#phone');
  await senderPhone.click();
  await page.keyboard.type(SENDER_PHONE);

  await page.locator('input[placeholder="Ваш e-mail"]').fill(SENDER_EMAIL);

  const checkbox = page.locator('input[name="agreeCheckbox"]');
  if (!await checkbox.isChecked()) await checkbox.check();

  // 11. Отправляем форму
  const submitBtn = page.locator('button[class*="services-button-container"]');
  await submitBtn.scrollIntoViewIfNeeded();
  await submitBtn.click();

  // 12. Ждём индикатора успеха
  await expect(
    page.locator('text=/спасибо|заявка|оформлен|принята|успешно/i')
  ).toBeVisible({ timeout: 10000 }).catch(async () => {
    await expect(submitBtn).not.toBeVisible({ timeout: 5000 });
  });

  // 13. Проверяем прибытие письма (только для prod)
  if (BASE_URL === 'https://eastclinic.ru') {
    test.setTimeout(240000);
    await checkEmailMessage(SENDER_EMAIL, sentAt, 120000);
  }
});
