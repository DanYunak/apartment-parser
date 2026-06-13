'use strict';

const axios = require('axios');

const OLX_API_URL = 'https://www.olx.ua/api/v1/offers/';

const REGION_ID = parseInt(process.env.OLX_REGION_ID, 10);
const CITY_ID = parseInt(process.env.OLX_CITY_ID, 10);
const CATEGORY_ID = parseInt(process.env.OLX_CATEGORY_ID, 10);
const MAX_PRICE = parseInt(process.env.MAX_PRICE || '17000', 10);
const LIMIT = parseInt(process.env.OLX_LIMIT || '40', 10);

const STOP_AFTER_N_KNOWN = 5;

function extractFloor(params = []) {
  const floorParam = params.find(
    (p) => p.key === 'floor_no' || p.key === 'floor'
  );
  if (!floorParam) return null;

  const raw = floorParam?.value?.key ?? floorParam?.value?.label ?? null;
  if (!raw) return null;

  const match = String(raw).match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

function normalizeOffer(offer) {
  try {
    const priceParam = (offer.params || []).find((p) => p.key === 'price');
    const price = priceParam?.value?.value ?? null;

    return {
      externalId: String(offer.id),
      source: 'olx',
      title: offer.title ?? '',
      url: offer.url ?? '',
      price: price ? Math.round(price) : null,
      floor: extractFloor(offer.params),
      isOwner: offer.business === false,
    };
  } catch (err) {
    console.warn('[OLX] Failed to normalize offer:', offer?.id, err.message);
    return null;
  }
}

async function parseOlx(knownIds = new Set()) {
  const newListings = [];
  let offset = 0;
  let hasMore = true;
  let consecutiveKnown = 0;

  console.log(`[OLX] Starting parse. Known IDs in DB: ${knownIds.size}`);

  while (hasMore) {
    const params = {
      offset,
      limit: LIMIT,
      category_id: CATEGORY_ID,
      region_id: REGION_ID,
      city_id: CITY_ID,
      query: 'довгострокова оренда квартири',
      'filter_float_price:to': MAX_PRICE,
      'filter_enum_number_of_rooms_string[0]': 'odnokomnatnye',
      filter_bool_commission: 1,
      'filter_float_floor:from': 2,
      currency: 'UAH',
      sort_by: 'created_at:desc',
    };

    let response;
    try {
      response = await axios.get(OLX_API_URL, {
        params,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
            'AppleWebKit/537.36 (KHTML, like Gecko) ' +
            'Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'uk-UA,uk;q=0.9',
        },
        timeout: 15000,
      });
    } catch (err) {
      const status = err?.response?.status;
      console.error(`[OLX] Request failed (offset=${offset}): ${status ?? err.message}`);

      if (status === 429) {
        console.warn('[OLX] Rate limited — sleeping 10s before retry...');
        await new Promise((r) => setTimeout(r, 10000));
        continue;
      }
      break;
    }

    const data = response.data?.data ?? [];
    const links = response.data?.links ?? {};

    if (!Array.isArray(data) || data.length === 0) {
      hasMore = false;
      break;
    }

    let newOnThisPage = 0;

    for (const offer of data) {
      const normalized = normalizeOffer(offer);
      if (!normalized) continue;

      if (knownIds.has(normalized.externalId)) {
        consecutiveKnown++;

        if (consecutiveKnown >= STOP_AFTER_N_KNOWN) {
          console.log(
            `[OLX] Early stop at offset=${offset}: ` +
            `${consecutiveKnown} consecutive known IDs`
          );
          hasMore = false;
          break;
        }
      } else {
        consecutiveKnown = 0;
        newListings.push(normalized);
        newOnThisPage++;
      }
    }

    console.log(
      `[OLX] offset=${offset}: ${data.length} offers, ` +
      `${newOnThisPage} new, consecutiveKnown=${consecutiveKnown}`
    );

    hasMore = hasMore && !!links.next;
    offset += LIMIT;

    if (hasMore) await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`[OLX] Parse complete. New listings found: ${newListings.length}`);
  return newListings;
}

module.exports = { parseOlx };