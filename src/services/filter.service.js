'use strict';

const MAX_PRICE = parseInt(process.env.MAX_PRICE || '17000', 10);
const MIN_FLOOR = 2;

function filterListings(listings) {
  const result = listings.filter((l) => {
    if (!l.price || l.price <= 0) {
      console.log(`[Drop] ${l.externalId}: Invalid Price (${l.price})`);
      return false;
    }

    if (l.price > MAX_PRICE) {
      console.log(`[Drop] ${l.externalId}: Price too high (${l.price} > ${MAX_PRICE})`);
      return false;
    }

    if (l.floor !== null && l.floor < MIN_FLOOR) {
      console.log(`[Drop] ${l.externalId}: Floor too low (${l.floor} < ${MIN_FLOOR})`);
      return false;
    }

    return true;
  });

  console.log(`[Filter] ${listings.length} → ${result.length} after filtering`);
  return result;
}

module.exports = { filterListings };