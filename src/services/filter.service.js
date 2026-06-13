'use strict';

const MAX_PRICE = parseInt(process.env.MAX_PRICE || '17000', 10);
const MIN_FLOOR = 2;

function filterListings(listings) {
  const result = listings.filter((l) => {
    if (!l.isOwner) return false;

    if (!l.price || l.price <= 0)    return false;
    if (l.price > MAX_PRICE)         return false;

    if (l.floor !== null && l.floor < MIN_FLOOR) return false;

    return true;
  });

  console.log(`[Filter] ${listings.length} → ${result.length} after filtering`);
  return result;
}

module.exports = { filterListings };