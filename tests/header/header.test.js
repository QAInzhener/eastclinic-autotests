import { test, expect } from '@playwright/test';
import { BASE_URL } from '../helpers/config.js';

const DROPDOWNS = [
  { name: 'Услуги',    label: /^Услуги/ },
  { name: 'Врачи',     label: /^Врачи/ },
  { name: 'Клиники',   label: /^Клиники/ },
  { name: 'О клинике', label: /^О клинике/ },
  { name: 'Пациентам', label: /^Пациентам/ },
  { name: 'Еще',       label: /^Еще/ },
];

test('Шапка: кнопки Услуги / Врачи / Клиники / О клинике / Пациентам / Еще — каждая открывает свой раскрывающийся список', async ({ page }) => {
  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });

  for (const { name, label } of DROPDOWNS) {
    const btn = page.locator('button.nav-item').filter({ hasText: label }).first();
    await btn.click();

    // Кнопка получает nav-item--active, появляется дропдаун
    // (Услуги/Врачи/О клинике/Пациентам/Еще → .dropdown-panel, Клиники → .clinics-dropdown)
    await expect(btn).toHaveClass(/nav-item--active/, { timeout: 5000 });
    await expect(page.locator('[class*="dropdown"]').first()).toBeVisible({ timeout: 5000 });
  }
});

// Вспомогательная функция: открывает дропдаун и кликает по разделу в сайдбаре,
// затем проверяет, что раздел стал активным (получил класс --active).
async function checkSidebarItem(page, navLabel, itemLabel, itemSelector, activeClass) {
  const navBtn = page.locator('button.nav-item').filter({ hasText: navLabel }).first();
  await navBtn.click();
  await expect(page.locator('[class*="dropdown"]').first()).toBeVisible({ timeout: 5000 });

  const item = page.locator(itemSelector).filter({ hasText: itemLabel }).first();
  await item.click();
  await expect(item).toHaveClass(new RegExp(activeClass), { timeout: 5000 });
}

// --- Услуги: разделы в сайдбаре ---
test('Шапка: Услуги — разделы Направления / Диагностика / Реабилитация переключаются', async ({ page }) => {
  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });

  // Открываем дропдаун Услуги
  await page.locator('button.nav-item').filter({ hasText: /^Услуги/ }).first().click();
  await expect(page.locator('.dropdown-panel').first()).toBeVisible({ timeout: 5000 });

  // Направления активен по умолчанию при открытии
  await expect(
    page.locator('button.sidebar-item').filter({ hasText: /^Направления/ }).first()
  ).toHaveClass(/sidebar-item--active/, { timeout: 3000 });

  // Кликаем Диагностика — не закрывая дропдаун
  const диагностика = page.locator('button.sidebar-item').filter({ hasText: /^Диагностика/ }).first();
  await диагностика.click();
  await expect(диагностика).toHaveClass(/sidebar-item--active/, { timeout: 5000 });

  // Кликаем Реабилитация — не закрывая дропдаун
  const реабилитация = page.locator('button.sidebar-item').filter({ hasText: /^Реабилитация/ }).first();
  await реабилитация.click();
  await expect(реабилитация).toHaveClass(/sidebar-item--active/, { timeout: 5000 });
});

// --- Врачи: разделы в сайдбаре ---
test('Шапка: Врачи — разделы Взрослые / Детские переключаются', async ({ page }) => {
  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });

  // Открываем дропдаун Врачи
  await page.locator('button.nav-item').filter({ hasText: /^Врачи/ }).first().click();
  await expect(page.locator('.dropdown-panel').first()).toBeVisible({ timeout: 5000 });

  // Взрослые активен по умолчанию при открытии
  await expect(
    page.locator('button.sidebar-item').filter({ hasText: /^Взрослые/ }).first()
  ).toHaveClass(/sidebar-item--active/, { timeout: 3000 });

  // Кликаем Детские — не закрывая дропдаун
  const детские = page.locator('button.sidebar-item').filter({ hasText: /^Детские/ }).first();
  await детские.click();
  await expect(детские).toHaveClass(/sidebar-item--active/, { timeout: 5000 });

  // Кликаем Взрослые — не закрывая дропдаун
  const взрослые = page.locator('button.sidebar-item').filter({ hasText: /^Взрослые/ }).first();
  await взрослые.click();
  await expect(взрослые).toHaveClass(/sidebar-item--active/, { timeout: 5000 });
});

// --- Кнопка «Закрыть» в дропдауне ---
test('Шапка: кнопка "Закрыть" — закрывает раскрывающийся список', async ({ page }) => {
  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });

  // Открываем дропдаун Услуги
  await page.locator('button.nav-item').filter({ hasText: /^Услуги/ }).first().click();
  const panel = page.locator('.dropdown-panel').first();
  await expect(panel).toBeVisible({ timeout: 5000 });

  // Кликаем кнопку «Закрыть ×» в правом верхнем углу дропдауна
  await page.locator('button.dropdown-close').first().click();

  // Дропдаун должен скрыться
  await expect(panel).not.toBeVisible({ timeout: 5000 });
});

// --- Клиники: города в сайдбаре ---
// Кнопки городов содержат цифру после названия (напр. «Москва5»), используем частичное совпадение.
test('Шапка: Клиники — города Москва / Люберцы / Одинцово / Мытищи / Долгопрудный / Калуга переключаются', async ({ page }) => {
  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });

  // Открываем дропдаун Клиники
  await page.locator('button.nav-item').filter({ hasText: /^Клиники/ }).first().click();
  await expect(page.locator('.clinics-dropdown').first()).toBeVisible({ timeout: 5000 });

  // Москва активна по умолчанию при открытии
  await expect(
    page.locator('button.clinics-sidebar-item').filter({ hasText: /^Москва/ }).first()
  ).toHaveClass(/clinics-sidebar-item--active/, { timeout: 3000 });

  // Кликаем остальные города по очереди — не закрывая дропдаун
  const CITIES = ['Люберцы', 'Одинцово', 'Мытищи', 'Долгопрудный', 'Калуга', 'Москва'];
  for (const city of CITIES) {
    const btn = page.locator('button.clinics-sidebar-item').filter({ hasText: new RegExp('^' + city) }).first();
    await btn.click();
    await expect(btn).toHaveClass(/clinics-sidebar-item--active/, { timeout: 5000 });
  }
});

// --- Переходы из раскрывающихся списков ---
// Ссылки ищем по тексту (getByRole), а не по классу — иначе .first()
// берёт первый элемент из DOM независимо от того, какой дропдаун открыт.

test('Шапка: "Перейти ко всем услугам" — переход на страницу /catalog', async ({ page }) => {
  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
  await page.locator('button.nav-item').filter({ hasText: /^Услуги/ }).first().click();
  await expect(page.locator('.dropdown-panel').first()).toBeVisible({ timeout: 5000 });
  await page.getByRole('link', { name: /перейти ко всем услугам/i }).first().click();
  await page.waitForURL('**/catalog**', { timeout: 15000 });
  expect(page.url()).toContain('/catalog');
});

test('Шапка: "Перейти ко всем специалистам" — переход на страницу /vrachi', async ({ page }) => {
  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
  await page.locator('button.nav-item').filter({ hasText: /^Врачи/ }).first().click();
  await expect(page.locator('.dropdown-panel').first()).toBeVisible({ timeout: 5000 });
  await page.getByRole('link', { name: /перейти ко всем специалистам/i }).first().click();
  await page.waitForURL('**/vrachi**', { timeout: 15000 });
  expect(page.url()).toContain('/vrachi');
});

test('Шапка: "Перейти к контактам" — переход на страницу /kontakty', async ({ page }) => {
  await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
  await page.locator('button.nav-item').filter({ hasText: /^Клиники/ }).first().click();
  await expect(page.locator('.clinics-dropdown').first()).toBeVisible({ timeout: 5000 });
  await page.getByRole('link', { name: /перейти к контактам/i }).first().click();
  await page.waitForURL('**/kontakty**', { timeout: 15000 });
  expect(page.url()).toContain('/kontakty');
});
