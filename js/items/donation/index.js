import { discoverItems } from '../discover.js';

const discovered = await discoverItems('donation', import.meta.url, { schema: 'donation' });

export const DONATION_ITEMS = discovered.items;
export const DONATION_ITEM_ICONS = Object.freeze(Object.fromEntries(
  Object.entries(discovered.icons).map(([id, icon]) => [donationItemKey(id), icon])
));

export function donationItemKey(id) {
  return `donation/${id}`;
}
