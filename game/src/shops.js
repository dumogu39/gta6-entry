// Shops and activities: the armory sells weapons, the paint shop washes away the wanted level. Each
// is a marker on the map the player drives or walks up to and presses F to use. They are created from
// the city so they sit on reachable road corners.
import { CITY, WEAPONS, WEAPON_SHOP_ORDER } from './config.js';
import { clearWanted, laneCoord, roadCenter, toast } from './world.js';

function snapToRoad(city, x, y) {
  const c0 = city.road / 2;
  const max = c0 + city.grid * city.cell;
  let best = { x: c0, y: c0, d: Infinity };
  for (let k = 0; k <= city.grid; k += 1) {
    const c = roadCenter(k);
    const xc = Math.min(max, Math.max(c0, x));
    const yc = Math.min(max, Math.max(c0, y));
    for (const side of [-1, 1]) {
      const lc = laneCoord(k, side);
      const d1 = (xc - x) * (xc - x) + (lc - y) * (lc - y);
      if (d1 < best.d) best = { x: xc, y: lc, d: d1 };
      const d2 = (lc - x) * (lc - x) + (yc - y) * (yc - y);
      if (d2 < best.d) best = { x: lc, y: yc, d: d2 };
    }
  }
  return best;
}

export function createShops(game) {
  const g = CITY.grid - 1;
  const mid = (city, col, row) => ({ x: col * city.cell + city.road + (city.cell - city.road) / 2, y: row * city.cell + city.road + (city.cell - city.road) / 2 });
  const armory = snapToRoad(game.city, mid(game.city, 5, 5).x, mid(game.city, 5, 5).y);
  const paint = snapToRoad(game.city, mid(game.city, 2, 2).x, mid(game.city, 2, 2).y);
  game.shops = [
    { type: 'armory', name: 'Solara Armory', x: armory.x, y: armory.y, prompt: 'Buy weapons' },
    { type: 'paint', name: 'Sunset Paint & Body', x: paint.x, y: paint.y, prompt: 'Wash the heat' },
  ];
}

/** The shop the player is standing at, or null. */
export function nearShop(game) {
  const p = game.player;
  for (const s of game.shops) {
    if (Math.hypot(p.x - s.x, p.y - s.y) < 64) return s;
  }
  return null;
}

/** Handle the F interact key at a shop. */
export function stepShops(game, input) {
  if (!input.use) return;
  const p = game.player;
  if (p.mode !== 'walk') return;
  const shop = nearShop(game);
  if (!shop) return;
  if (shop.type === 'armory') buyWeapon(game);
  else paintCar(game);
}

function buyWeapon(game) {
  const p = game.player;
  for (const key of WEAPON_SHOP_ORDER) {
    if (p.owned[key]) continue;
    const w = WEAPONS[key];
    if (p.money >= w.price) {
      p.money -= w.price;
      p.owned[key] = true;
      p.weapon = key;
      if (w.ammo) p.ammo[key] = (p.ammo[key] ?? 0) + w.ammo;
      toast(game, `Bought the ${w.name}`);
      return;
    }
    toast(game, `Need $${w.price} for the ${w.name}`);
    return;
  }
  toast(game, 'You own every weapon.');
}

function paintCar(game) {
  const p = game.player;
  if (p.wanted === 0) {
    toast(game, 'You are already clean.');
    return;
  }
  const cost = 120 * p.wanted;
  if (p.money < cost) {
    toast(game, `A respray costs $${cost}.`);
    return;
  }
  p.money -= cost;
  clearWanted(game, p.wanted);
  toast(game, 'Resprayed. Heat is gone.');
}
