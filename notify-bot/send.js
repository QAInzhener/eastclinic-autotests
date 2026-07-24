// Разовая отправка уведомления в Delta Chat и чистый выход — предназначен
// для запуска как отдельный дочерний процесс из run-and-capture.js после
// каждого ночного прогона (а не для постоянной работы, в отличие от index.js).
//
// Использование: node notify-bot/send.js <группа> <текст>
// chatId группы берётся из .env по имени NOTIFY_CHAT_ID_<ГРУППА заглавными>,
// например для группы "tests" — переменная NOTIFY_CHAT_ID_TESTS.

import { connectBot, disconnectBot } from './core.js';

const [, , group, text] = process.argv;

if (!group || !text) {
  console.error('Использование: node notify-bot/send.js <группа> <текст>');
  process.exit(1);
}

const envKey = 'NOTIFY_CHAT_ID_' + group.toUpperCase();
const chatId = Number(process.env[envKey]);

if (!chatId) {
  console.error(`Не задан chatId для группы "${group}" — ожидается переменная ${envKey} в .env`);
  process.exit(1);
}

try {
  const { dc, accountId } = await connectBot();
  await dc.rpc.miscSendTextMessage(accountId, chatId, text);
  // miscSendTextMessage лишь ставит сообщение в локальную очередь на отправку —
  // само SMTP-отправление происходит асинхронно фоновым планировщиком ядра
  // (это видно по логам: между "поставлено в очередь" и реальной отправкой
  // проходит секунда-две). Ждём с запасом, прежде чем гасить процесс, иначе
  // рискуем выйти раньше, чем сообщение реально уйдёт по SMTP.
  await new Promise(resolve => setTimeout(resolve, 8000));
  await disconnectBot(dc, accountId);
  console.log(`Уведомление отправлено в группу "${group}" (chatId=${chatId}).`);
  process.exit(0);
} catch (err) {
  console.error('Не удалось отправить уведомление:', err);
  process.exit(1);
}
