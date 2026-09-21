import { discoverItems } from '../discover.js';

export const DONATION_KINDS = Object.freeze(['ammo', 'health', 'credits']);

const discovered = await Promise.all(DONATION_KINDS.map((kind) => discoverItems(
  'donation-' + kind,
  import.meta.url,
  {
    directory: `./${kind}/definitions/`,
    modulePath: `js/items/donation/${kind}/modules/`,
    schema: 'donation',
  }
)));

const items = {};
const icons = {};
for (let i = 0; i < DONATION_KINDS.length; i++) {
  const kind = DONATION_KINDS[i];
  items[kind] = discovered[i].items;
  for (const [id, icon] of Object.entries(discovered[i].icons)) {
    icons[donationItemKey(kind, id)] = icon;
  }
}

export const DONATION_ITEMS = Object.freeze(items);
export const DONATION_ITEM_ICONS = Object.freeze(icons);

export function donationItemKey(kind, id) {
  return `donation/${kind}/${id}`;
}
