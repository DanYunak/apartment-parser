'use strict';

require('dotenv').config();

const { parseOlx } = require('./parsers/olx.parser');
const { filterListings } = require('./services/filter.service');
const {
  getKnownIds,
  saveNewListings,
  getPendingListings,
  markAsSent,
  markAsRetry,
} = require('./services/dedup.service');
const { sendAll, sendAdminAlert } = require('./services/telegram.service');
const db = require('./db/client');

function validateEnv() {
  const required = [
    'DATABASE_URL',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID',
    'OLX_REGION_ID',
    'OLX_CITY_ID',
    'OLX_CATEGORY_ID'
  ];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length) {
    console.error('[Startup] Missing required env vars:', missing.join(', '));
    process.exit(1);
  }
}

function isMorningReportTime() {
  const now = new Date();
  return now.getUTCHours() === 6 && now.getUTCMinutes() < 15;
}

async function main() {
  const startedAt = Date.now();
  console.log(`\n${'='.repeat(50)}`);
  console.log(`[Main] Run started at ${new Date().toISOString()}`);

  validateEnv();

  try {
    const knownIds = await getKnownIds('olx');

    if (isMorningReportTime()) {
      console.log('[Main] Sending daily morning report...');
      await sendAdminAlert(`🟢 Ранковий звіт: Spotter працює штатно.\nОголошень в базі: ${knownIds.size}`);
    }

    const results = await Promise.allSettled([
      parseOlx(knownIds),
    ]);

    const rawListings = results
      .filter((r) => r.status === 'fulfilled')
      .flatMap((r) => r.value);

    results
      .filter((r) => r.status === 'rejected')
      .forEach((r, i) => console.error(`[Main] Parser ${i} failed:`, r.reason?.message));

    console.log(`[Main] Raw listings collected: ${rawListings.length}`);

    const filtered = filterListings(rawListings);

    if (filtered.length === 0) {
      console.log('[Main] No listings passed filters. Exiting.');
      return;
    }

    await saveNewListings(filtered);

    const pending = await getPendingListings();
    console.log(`[Main] Pending listings to send: ${pending.length}`);

    if (pending.length === 0) {
      console.log('[Main] Nothing to send. Exiting.');
      return;
    }

    const { sent, failed } = await sendAll(pending, markAsSent, markAsRetry);

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[Main] Done in ${elapsed}s. Sent: ${sent}, Failed: ${failed}`);

  } finally {
    await db.disconnect();
    console.log(`[Main] DB disconnected.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('[Fatal] Unhandled execution error:', err);
    try {
      await sendAdminAlert(`🔴 КРИТИЧНА ПОМИЛКА ПАРСЕРА:\n\n${err.message}`);
    } catch (tgErr) {
      console.error('[Fatal] Failed to send crash alert to Telegram:', tgErr.message);
    }
    process.exit(1);
  });