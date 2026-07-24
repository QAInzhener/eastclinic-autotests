// Интерактивный инструмент бота-уведомителя для Delta Chat: первичная
// настройка аккаунта, вступление в группу по ссылке-приглашению (JOIN_QR),
// разовая ручная отправка для проверки (SEND_TO_CHAT_ID + SEND_TEXT).
//
// Для автоматической отправки из ночного прогона используется send.js —
// он не остаётся висеть в памяти после отправки, в отличие от этого файла.
//
// Источник паттерна: официальный пример deltachat-bot/echo (nodejs_stdio_jsonrpc).

import { connectBot } from './core.js';

async function main() {
  const { dc, accountId: botAccountId } = await connectBot();
  console.log('Используется deltachat-rpc-server:', dc.pathToServerBinary);

  const botAddress = await dc.rpc.getConfig(botAccountId, 'addr');
  // Точное имя единственного рабочего метода (getChatSecurejoinQr без "Code"
  // не существует) — возвращает кортеж [?, ?]; выводим оба элемента, чтобы
  // на глаз определить, какой из них — обычный текст, а какой — SVG-разметка.
  const [qrPart0, qrPart1] = await dc.rpc.getChatSecurejoinQrCodeSvg(botAccountId, null);

  console.info(''.padEnd(50, '='));
  console.info('Email-адрес бота:', botAddress);
  console.info('Чтобы добавить бота в Delta Chat: отсканируйте QR ниже');
  console.info('(в приложении: Настройки → значок QR → «Сканировать код»),');
  console.info('затем добавьте появившийся контакт-бота в группу/канал «Упавшие тесты».');
  console.info('Часть 0 (обычно текстовая ссылка openpgp4fpr:...):');
  console.info(qrPart0);
  console.info('Часть 1 (обычно SVG-разметка изображения QR):');
  console.info(String(qrPart1).slice(0, 120) + '...');
  console.info(''.padEnd(50, '='));

  // Слушаем входящие сообщения — пригодится, чтобы узнать chatId группы,
  // как только бота добавят и кто-нибудь напишет туда (или сам бот увидит
  // системное сообщение о добавлении).
  const emitter = dc.getContextEvents(botAccountId);
  emitter.on('IncomingMsg', async ({ chatId, msgId }) => {
    const chat = await dc.rpc.getBasicChatInfo(botAccountId, chatId);
    const message = await dc.rpc.getMessage(botAccountId, msgId);
    console.info(
      `[входящее] chatId=${chatId} тип=${chat.chatType} название="${chat.name}" текст="${message.text}"`
    );
  });

  // Также слушаем смену состояния join'а — при обработке групповой
  // securejoin-ссылки полезно видеть прогресс (запрос отправлен →
  // подтверждён → присоединение завершено).
  emitter.on('SecurejoinJoinerProgress', ({ progress }) => {
    // Внутренняя шкала ядра — 0..1000, а не 0..100
    console.info(`[securejoin] прогресс присоединения: ${(progress / 10).toFixed(0)}%`);
  });

  if (process.env.JOIN_QR) {
    console.info('Обрабатываю ссылку-приглашение в группу...');
    try {
      const joinChatId = await dc.rpc.secureJoin(botAccountId, process.env.JOIN_QR);
      console.info('Запрос на присоединение отправлен. Предварительный chatId:', joinChatId);
    } catch (err) {
      console.error('Не удалось обработать ссылку-приглашение:', err);
    }
  }

  // Тестовая/разовая отправка сообщения в уже известный chatId — для
  // регулярной автоматической отправки используется send.js, не этот файл.
  if (process.env.SEND_TO_CHAT_ID && process.env.SEND_TEXT) {
    const targetChatId = Number(process.env.SEND_TO_CHAT_ID);
    console.info(`Отправляю сообщение в chatId=${targetChatId}...`);
    await dc.rpc.miscSendTextMessage(botAccountId, targetChatId, process.env.SEND_TEXT);
    console.info('Сообщение отправлено.');
  }

  console.info('Бот запущен и слушает входящие события. Ctrl+C для остановки.');
}

main();
