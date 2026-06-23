import 'dotenv/config';
import { ProxyAgent } from 'undici';
const dispatcher = new ProxyAgent(process.env.PROXY_URL);
const TOKEN = process.env.TELEGRAM_BOT_API_KEY;
const API = `https://api.telegram.org/bot${TOKEN}`;

const res = await fetch(`${API}/getUpdates?limit=50`, { dispatcher });
const data = await res.json();
console.log('Обновлений в getUpdates:', data.result?.length ?? 0);
console.log(JSON.stringify(data.result, null, 2));
