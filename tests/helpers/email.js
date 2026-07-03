import 'dotenv/config';
import { ImapFlow } from 'imapflow';

function decodeQP(qpText) {
  const cleaned = qpText.replace(/=\r\n/g, '').replace(/=\n/g, '');
  const bytes = [];
  for (let i = 0; i < cleaned.length; ) {
    if (cleaned[i] === '=' && i + 2 < cleaned.length && /[0-9A-Fa-f]{2}/.test(cleaned.slice(i + 1, i + 3))) {
      bytes.push(parseInt(cleaned.slice(i + 1, i + 3), 16));
      i += 3;
    } else {
      bytes.push(cleaned.charCodeAt(i));
      i++;
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function extractText(source) {
  const raw = source.toString('latin1');
  const bodyStart = raw.indexOf('\r\n\r\n');
  const body = bodyStart >= 0 ? raw.slice(bodyStart + 4) : raw;
  const decoded = decodeQP(body);
  const afterStyle = decoded.includes('</style>') ? decoded.split('</style>').slice(1).join('') : decoded;
  return afterStyle.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Ждёт письма, содержащего searchText, полученного после since.
// Выбрасывает ошибку если письмо не пришло за timeoutMs миллисекунд.
export async function checkEmailMessage(searchText, since, timeoutMs = 120000) {
  const sinceDate = since instanceof Date ? since : new Date(Date.now() - 2 * 60 * 1000);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const client = new ImapFlow({
      host: process.env.EMAIL_HOST,
      port: 993,
      secure: true,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      logger: false,
      tls: { rejectUnauthorized: false },
    });

    const elapsed = Math.round((Date.now() - (deadline - timeoutMs)) / 1000);
    console.log(`[email] ${elapsed}с: проверяю почту...`);

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      try {
        const uids = await client.search({ since: sinceDate });
        console.log(`[email] найдено писем: ${uids.length}`);
        if (uids.length > 0) {
          for await (const msg of client.fetch(uids, { source: true })) {
            const text = extractText(msg.source);
            if (text.includes(searchText)) {
              console.log(`[email] ✓ найдено письмо с текстом "${searchText}"`);
              return true;
            }
          }
          console.log(`[email] писем ${uids.length}, нужный текст не найден`);
        }
      } finally {
        lock.release();
      }
    } catch (e) {
      console.log(`[email] ошибка соединения: ${e.message}`);
    } finally {
      try { await client.logout(); } catch {}
    }

    if (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  throw new Error(`Email с текстом "${searchText}" не получен за ${timeoutMs / 1000}с`);
}
