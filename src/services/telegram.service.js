'use strict';

const axios = require('axios');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const SEND_DELAY_MS = 1500;

function formatMessage(listing) {
  const price = listing.price ? `${listing.price.toLocaleString('uk-UA')} грн/міс` : 'Ціна не вказана';
  const floor = listing.floor ? `${listing.floor} поверх` : 'Поверх не вказано';
  const title = listing.title || 'Без назви';

  const escape = (s) => String(s).replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');

  return (
    `🏠 *Нове оголошення \\| OLX*\n\n` +
    `📋 ${escape(title)}\n` +
    `💰 *${escape(price)}*\n` +
    `🏢 ${escape(floor)}\n` +
    `👤 Від власника\n\n` +
    `🔗 [Переглянути оголошення](${listing.url})`
  );
}

async function sendListing(listing) {
  const text = formatMessage(listing);

  try {
    await axios.post(
      `${TG_API}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: false,
      },
      { timeout: 10000 }
    );
  } catch (err) {
    const status = err?.response?.status;
    const tgError = err?.response?.data?.description;

    if (status === 429) {
      const retryAfter = err?.response?.data?.parameters?.retry_after ?? 10;
      console.warn(`[TG] Rate limited. Waiting ${retryAfter}s...`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      throw err;
    }

    console.error(`[TG] Failed to send listing ${listing.id}: ${status} ${tgError ?? err.message}`);
    throw err;
  }
}

async function sendAll(listings, onSent, onFailed) {
  let sent = 0;
  let failed = 0;

  for (const [index, listing] of listings.entries()) {
    try {
      await sendListing(listing);
      await onSent(listing.id);
      sent++;
      console.log(`[TG] Sent listing ${listing.id} (${listing.external_id})`);
    } catch {
      await onFailed(listing.id);
      failed++;
    }

    if (index < listings.length - 1) {
      await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
    }
  }

  return { sent, failed };
}

module.exports = { sendAll };