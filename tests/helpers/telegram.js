import 'dotenv/config';
import { ProxyAgent } from 'undici';

const TOKEN = process.env.TELEGRAM_BOT_API_KEY;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const API = `https://api.telegram.org/bot${TOKEN}`;
const dispatcher = new ProxyAgent(process.env.PROXY_URL);

async function apiFetch(url) {
  const res = await fetch(url, { dispatcher });
  return res.json();
}

async function getLastUpdateId() {
  const data = await apiFetch(`${API}/getUpdates?offset=-1&limit=1`);
  if (data.result && data.result.length > 0) {
    return data.result[0].update_id;
  }
  return 0;
}

// Ждёт появления сообщения в чате, содержащего искомый текст.
// Возвращает true если сообщение найдено, иначе выбрасывает ошибку.
export async function checkTelegramMessage(searchText, timeoutMs = 30000) {
  const fromUpdateId = await getLastUpdateId();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));

    const data = await apiFetch(`${API}/getUpdates?offset=${fromUpdateId}&limit=100`);

    for (const update of data.result || []) {
      const msg = update.message || update.channel_post;
      if (!msg) continue;
      if (String(msg.chat.id) !== String(CHAT_ID)) continue;
      const text = msg.text || msg.caption || '';
      if (text.includes(searchText)) return true;
    }
  }

  throw new Error(`Сообщение с "${searchText}" не найдено в Телеграме за ${timeoutMs / 1000} секунд`);
}
