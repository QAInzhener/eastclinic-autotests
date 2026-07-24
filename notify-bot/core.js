// Общая логика подключения бота к Delta Chat — используется и интерактивным
// index.js (первичная настройка, вступление в группы), и send.js (разовая
// отправка уведомления из ночного прогона run-and-capture.js).
//
// Режим песочницы (сейчас): аккаунт создаётся автоматически на тестовом
// chatmail-сервере nine.testrun.org — переменная окружения CHATMAIL_QR.
// Боевой режим (позже, когда коллега заведёт настоящий почтовый ящик):
// переменные ADDR + MAIL_PW — код менять не нужно, только .env.

import 'dotenv/config';
import { startDeltaChat } from '@deltachat/stdio-rpc-server';

export async function connectBot() {
  const dc = await startDeltaChat('notify-bot/deltachat-data');

  dc.on('Info', (accountId, { msg }) => console.info(accountId, '[core:info]', msg));
  dc.on('Warning', (accountId, { msg }) => console.warn(accountId, '[core:warn]', msg));
  dc.on('Error', (accountId, { msg }) => console.error(accountId, '[core:error]', msg));

  let account = (await dc.rpc.getAllAccounts())[0];
  if (!account) {
    account = await dc.rpc.getAccountInfo(await dc.rpc.addAccount());
  }

  if (account.kind === 'Unconfigured') {
    console.info('Аккаунт ещё не настроен, выполняю вход/регистрацию...');
    if (process.env.ADDR && process.env.MAIL_PW) {
      console.info('Использую боевые учётные данные (ADDR/MAIL_PW) из .env');
      await dc.rpc.batchSetConfig(account.id, {
        addr: process.env.ADDR,
        mail_pw: process.env.MAIL_PW,
      });
    } else if (process.env.CHATMAIL_QR) {
      console.info('Регистрирую новый аккаунт на чатмейл-сервере из CHATMAIL_QR');
      await dc.rpc.setConfigFromQr(account.id, process.env.CHATMAIL_QR);
    } else {
      throw new Error(
        'Нет учётных данных: задайте в .env либо ADDR+MAIL_PW (боевой ящик), ' +
        'либо CHATMAIL_QR (например DCACCOUNT:https://nine.testrun.org/new — песочница)'
      );
    }

    // e2ee_enabled раньше требовался в примерах, но в текущей версии ядра
    // такого ключа нет (шифрование включено по умолчанию) — попытка его
    // выставить валит всю настройку аккаунта с ошибкой "unknown key".
    await dc.rpc.batchSetConfig(account.id, { bot: '1' });
    await dc.rpc.configure(account.id);
  } else {
    await dc.rpc.startIo(account.id);
  }

  return { dc, accountId: account.id };
}

// Аккуратно останавливает фоновые циклы ядра перед выходом из процесса —
// без этого возможна потеря ещё не отправленных сообщений из SMTP-очереди.
export async function disconnectBot(dc, accountId) {
  try {
    await dc.rpc.stopIo(accountId);
  } catch {}
}
