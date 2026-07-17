import { test } from '@playwright/test';
import { checkShowMore } from '../helpers/show-more.js';

const BASE_URL = process.env.TEST_BASE_URL || 'https://eastclinic.ru';

const BRANCHES = [
  { name: 'Все клиники',          path: '/vrachi' },
  { name: 'Сокол',                path: '/vrachi/sokol' },
  { name: 'Университет',          path: '/vrachi/universitet' },
  { name: 'Новые Черемушки',      path: '/vrachi/cheremushki' },
  { name: 'Беляево',              path: '/vrachi/belyaevo' },
  { name: 'Волоколамская',        path: '/vrachi/volokolamskaya' },
  { name: 'Люберцы',              path: '/vrachi/lyubercy' },
  { name: 'Одинцово',             path: '/vrachi/odintsovo' },
  { name: 'Мытищи (Кадомцева)',   path: '/vrachi/mytishchi-na-kadomceva' },
  { name: 'Долгопрудный',         path: '/vrachi/dolgoprudnaya' },
  { name: 'Калуга',               path: '/vrachi/kaluga' },
];

test.describe('Кнопка «Показать ещё» — врачи по филиалам', () => {
  test.describe.configure({ retries: 0 });

  test('Кнопка «Показать ещё» — /vrachi и все филиалы (11 страниц)', async ({ page }) => {
    test.setTimeout(360_000);
    const failed = [];
    let checked = 0;

    for (const branch of BRANCHES) {
      const url = BASE_URL + branch.path;
      const result = await checkShowMore(page, url, branch.name);
      if (result.skipped) {
        console.log(`[show-more] ⚠ ${branch.name}: пропущено — ${result.reason}`);
        continue;
      }
      checked++;
      if (!result.ok) {
        failed.push(`${branch.name} (${branch.path}):\n  ${result.errors.join('\n  ')}`);
      } else {
        console.log(`[show-more] ✓ ${branch.name}: ${result.totalClicks} кликов, итого ${result.finalCount} карточек`);
      }
    }

    if (failed.length) {
      throw new Error(
        `Нарушена работа «Показать ещё» на ${failed.length} из ${checked} страниц:\n` +
        failed.map(f => `• ${f}`).join('\n')
      );
    }
  });
});
