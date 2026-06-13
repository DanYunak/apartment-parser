'use strict';

const db = require('../db/client');

async function getKnownIds(source) {
  const res = await db.query(
    `SELECT external_id FROM seen_listings WHERE source = $1`,
    [source]
  );
  const ids = new Set(res.rows.map((r) => r.external_id));
  console.log(`[Dedup] Loaded ${ids.size} known IDs for source="${source}"`);
  return ids;
}

async function saveNewListings(listings) {
  if (!listings.length) return 0;

  let inserted = 0;

  for (const l of listings) {
    const res = await db.query(
      `INSERT INTO seen_listings
         (external_id, source, url, title, price, floor, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       ON CONFLICT (external_id, source) DO NOTHING`,
      [l.externalId, l.source, l.url, l.title, l.price, l.floor ?? null]
    );
    inserted += res.rowCount;
  }

  console.log(`[Dedup] Inserted ${inserted} new listings as pending`);
  return inserted;
}

async function getPendingListings() {
  const res = await db.query(
    `SELECT id, external_id, source, url, title, price, floor, retry_count
     FROM seen_listings
     WHERE status = 'pending'
       AND retry_count < 3
     ORDER BY created_at ASC`
  );
  return res.rows;
}

async function markAsSent(id) {
  await db.query(
    `UPDATE seen_listings
     SET status = 'sent', sent_at = NOW()
     WHERE id = $1`,
    [id]
  );
}

async function markAsRetry(id) {
  await db.query(
    `UPDATE seen_listings
     SET retry_count = retry_count + 1,
         status = CASE
           WHEN retry_count + 1 >= 3 THEN 'failed'
           ELSE 'pending'
         END
     WHERE id = $1`,
    [id]
  );
}

module.exports = { getKnownIds, saveNewListings, getPendingListings, markAsSent, markAsRetry };