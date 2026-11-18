// The city, the game state and the player's rules, with no drawing and no browser in it. It builds
// the road grid and its blocks from a seeded random, holds every entity (cars, pedestrians, bullets,
// particles), and steps the player on foot and behind the wheel. It also owns the shared, low-level
// helpers the higher systems lean on: collisions, damage, money, wanted stars and toasts, so nothing
// above it has to know how the state is laid out.
import { CITY, DISTRICT_LAYOUT, DISTRICT_STYLE, PALETTE, PLAYER, VEHICLES, WEAPONS, WANTED } from './config.js';
import { chance, int, pick, range } from './random.js';

const TAU = Math.PI * 2;

/** How many particles a destroyed car throws out. */
const EXPLOSION_PARTICLES = 26;

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** The shortest signed angle from `from` to `to`, wrapped to [-PI, PI]. */
export function angleDelta(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Rotate `from` toward `to` by at most `max` radians, wrapping correctly. */
export function turnToward(from, to, max) {
  const d = angleDelta(from, to);
  if (Math.abs(d) <= max) return to;
  return from + Math.sign(d) * max;
}

/** A road centreline coordinate (x or y) for road index k. */
export function roadCenter(k) {
  return CITY.road / 2 + k * CITY.cell;
}

/** A lane centreline coordinate for road k and side sign (-1 upper/left lane, +1 lower/right lane). */
export function laneCoord(k, sign) {
  return roadCenter(k) + sign * CITY.road / 4;
}

/** The district name for a block, from the 3x3 layout over the grid. */
export function districtOf(col, row) {
  const region = Math.max(1, Math.ceil(CITY.grid / 3));
  const rc = clamp(Math.floor(col / region), 0, 2);
  const rr = clamp(Math.floor(row / region), 0, 2);
  return DISTRICT_LAYOUT[rr][rc];
}

/** Build the city: blocks with buildings or parks, and the flat list of solid building rectangles. */
export function createCity(random) {
  const { grid, cell, road } = CITY;
  const blocks = [];
  const buildings = [];
  const parks = [];
  const sidewalk = 22;

  for (let row = 0; row < grid; row += 1) {
    for (let col = 0; col < grid; col += 1) {
      const bx = col * cell + road;
      const by = row * cell + road;
      const bw = cell - road;
      const bh = cell - road;
      const district = districtOf(col, row);
      const style = DISTRICT_STYLE[district];
      const park = district !== 'downtown' && chance(random, 0.14);
      const pieces = [];

      if (park) {
        parks.push({ x: bx, y: by, w: bw, h: bh });
      } else if (district === 'downtown') {
        const inset = 26;
        pieces.push({ x: bx + inset, y: by + inset, w: bw - inset * 2, h: bh - inset * 2, tower: true });
      } else if (district === 'residential') {
        const margin = 20;
        const gap = 14;
        const cw = (bw - margin * 2 - gap) / 2;
        const ch = (bh - margin * 2 - gap) / 2;
        for (let hx = 0; hx < 2; hx += 1) {
          for (let hy = 0; hy < 2; hy += 1) {
            pieces.push({ x: bx + margin + hx * (cw + gap), y: by + margin + hy * (ch + gap), w: cw, h: ch });
          }
        }
      } else {
        const inset = 24;
        if (chance(random, 0.5)) {
          pieces.push({ x: bx + inset, y: by + inset, w: bw - inset * 2, h: bh - inset * 2 });
        } else {
          const mid = 16;
          const ww = (bw - inset * 2 - mid) / 2;
          pieces.push({ x: bx + inset, y: by + inset, w: ww, h: bh - inset * 2 });
          pieces.push({ x: bx + inset + ww + mid, y: by + inset, w: ww, h: bh - inset * 2 });
        }
      }

      const built = [];
      for (const p of pieces) {
        const b = {
          x: p.x, y: p.y, w: p.w, h: p.h,
          color: pick(random, style.building),
          roof: pick(random, style.roof),
          tower: !!p.tower,
          neon: style.windows ? pick(random, style.neon) : null,
          detail: random(),
        };
        built.push(b);
        buildings.push(b);
      }

      blocks.push({ col, row, x: bx, y: by, w: bw, h: bh, district, sidewalk, park, buildings: built });
    }
  }

  return { grid, cell, road, world: CITY.world, blocks, buildings, parks, districtOf: (c, r) => districtOf(c, r) };
}

/** Push a circle of radius r out of every solid building and the world edge; returns the corrected point. */
export function collideCircle(city, x, y, r) {
  let cx = clamp(x, r, city.world - r);
  let cy = clamp(y, r, city.world - r);
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    const nx = clamp(cx, b.x, b.x + b.w);
    const ny = clamp(cy, b.y, b.y + b.h);
    const dx = cx - nx;
    const dy = cy - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    const d = Math.sqrt(d2) || 1;
    const push = r - d;
    if (d === 1 && d2 < 1e-9) {
      // centre inside a building: push out along the smallest axis
      const left = cx - b.x;
      const right = b.x + b.w - cx;
      const top = cy - b.y;
      const bottom = b.y + b.h - cy;
      const m = Math.min(left, right, top, bottom);
      if (m === left) cx = b.x - r;
      else if (m === right) cx = b.x + b.w + r;
      else if (m === top) cy = b.y - r;
      else cy = b.y + b.h + r;
    } else {
      cx = nx + (dx / d) * r;
      cy = ny + (dy / d) * r;
    }
  }
  return { x: cx, y: cy };
}

/** Whether a circle overlaps any building. */
export function hitsBuilding(city, x, y, r) {
  for (let i = 0; i < city.buildings.length; i += 1) {
    const b = city.buildings[i];
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    const dx = x - nx;
    const dy = y - ny;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

/** Create a fresh car object. `state` is one of traffic, parked, police or player. */
export function createCar(game, typeIndex, x, y, angle, state) {
  const vehicle = VEHICLES[typeIndex];
  const car = {
    id: game.nextCarId++,
    type: typeIndex,
    vehicle,
    color: pick(game.random, vehicle.colors),
    x, y, angle,
    vx: 0, vy: 0,
    speed: 0,
    state,
    hp: vehicle.hp,
    // Lane-following route state (traffic and police only).
    route: null,
    throttle: 0,
    steer: 0,
    brake: false,
    handbrake: false,
    // Police chase and siren state.
    siren: 0,
    chaseTimer: 0,
    ramTimer: 0,
  };
  return car;
}

/** Advance one car's simple arcade physics; shared by the player, traffic and the police. */
export function driveCar(car, dt, throttle, steer, handbrake) {
  const v = car.vehicle;
  if (throttle !== 0) {
    const dir = Math.sign(car.speed) || Math.sign(throttle);
    if (Math.sign(throttle) !== dir) car.speed -= Math.sign(throttle) * v.brake * dt;
    else car.speed += throttle * v.accel * dt;
  } else {
    car.speed -= Math.sign(car.speed) * v.accel * 0.45 * dt;
    if (Math.abs(car.speed) < 3) car.speed = 0;
  }
  // Reverse tops out at 40% of top speed, so a car can always back out of a jam but never outruns forwards.
  car.speed = clamp(car.speed, -v.max * 0.4, v.max);
  const grip = handbrake ? 1.7 : 1;
  const speedFactor = Math.min(1, Math.abs(car.speed) / 46);
  car.angle += steer * v.turn * speedFactor * grip * dt;
  car.vx = Math.cos(car.angle) * car.speed;
  car.vy = Math.sin(car.angle) * car.speed;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.throttle = throttle;
  car.steer = steer;
  car.handbrake = handbrake;
}

/** Add wanted stars and flash a toast on the HUD when the level rises. */
export function addWanted(game, stars, reason) {
  const p = game.player;
  const before = p.wanted;
  p.wanted = Math.min(WANTED.maxStars, p.wanted + stars);
  p.wantedTimer = 0;
  if (p.wanted > before) game.toast = { text: `${p.wanted} ${p.wanted > 1 ? 'STARS' : 'STAR'} — ${reason}`, t: 2.6 };
  else if (stars > 0) game.toast = { text: reason, t: 2.6 };
}

/** Reduce wanted by `stars` stars (the paint shop). */
export function clearWanted(game, stars) {
  const p = game.player;
  const before = p.wanted;
  p.wanted = Math.max(0, p.wanted - stars);
  if (p.wanted < before) game.toast = { text: 'Heat washed off.', t: 2.4 };
}

/** Damage the player; returns true when they died. */
export function damagePlayer(game, amount) {
  const p = game.player;
  if (!p.alive) return false;
  p.health -= amount;
  if (p.health <= 0) {
    p.health = 0;
    p.alive = false;
    return true;
  }
  return false;
}

/** Add money and flash the amount. */
export function addMoney(game, amount) {
  game.player.money += amount;
  if (amount > 0) game.moneyFlash = { text: `+$${amount}`, t: 1.6 };
}

/** Set a transient HUD toast. */
export function toast(game, text, t = 2.6) {
  game.toast = { text, t };
}

/** A floating text effect in the world (damage numbers, labels). */
export function addEffect(game, text, x, y, color = PALETTE.text) {
  game.effects.push({ text, x, y, color, t: 1.2, life: 1.2 });
}

export function createGame(random, city) {
  const spawn = roadCenter(Math.floor(CITY.grid / 2)) + CITY.road / 2 + 11;
  const player = {
    x: spawn,
    y: spawn,
    angle: 0,
    vx: 0,
    vy: 0,
    mode: 'walk',
    car: null,
    health: PLAYER.maxHealth,
    money: PLAYER.startMoney,
    wanted: 0,
    wantedTimer: 0,
    alive: true,
    weapon: 'fists',
    owned: { fists: true },
    ammo: {},
    fireTimer: 0,
    aimX: 0,
    aimY: 0,
    aimAngle: 0,
  };

  const game = {
    city,
    random,
    player,
    cars: [],
    peds: [],
    bullets: [],
    particles: [],
    effects: [],
    roadblocks: [],
    targets: [],
    time: 0,
    camera: { x: 0, y: 0 },
    toast: null,
    moneyFlash: null,
    dialogue: null,
    dialogueT: 0,
    objective: null,
    nextCarId: 1,
    nextPedId: 1,
    nextBulletId: 1,
    nextTargetId: 1,
    shake: 0,
    deadTimer: 0,
  };

  return game;
}

/** The nearest car within range of a point, if any. */
function nearestCar(game, x, y, range) {
  let best = null;
  let bestD = range * range;
  for (let i = 0; i < game.cars.length; i += 1) {
    const c = game.cars[i];
    if (c.state === 'player') continue;
    const dx = c.x - x;
    const dy = c.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/**
 * Step the player for one tick. `input` holds the raw controls (move vector, one-shot flags, aim).
 * Returns a small event bitmask so the loop can react (e.g. play sounds) without this file knowing
 * about screens or audio.
 */
export function stepPlayer(game, dt, input) {
  const p = game.player;
  const city = game.city;

  if (!p.alive) return 0;

  p.fireTimer = Math.max(0, p.fireTimer - dt);

  if (p.mode === 'walk') {
    let mx = input.move.x;
    let my = input.move.y;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    p.vx = mx * PLAYER.walkSpeed;
    p.vy = my * PLAYER.walkSpeed;
    let nx = p.x + p.vx * dt;
    let ny = p.y + p.vy * dt;
    const hit = collideCircle(city, nx, ny, PLAYER.radius);
    p.x = hit.x;
    p.y = hit.y;
    if (mx !== 0 || my !== 0) p.angle = Math.atan2(my, mx);
    else p.angle = p.aimAngle;
    if (input.enter) {
      const car = nearestCar(game, p.x, p.y, PLAYER.enterRange);
      if (car) enterCar(game, car);
    }
  } else if (p.car) {
    const car = p.car;
    const throttle = -input.move.y; // W is -y, so it accelerates forward
    const steer = input.move.x;
    driveCar(car, dt, throttle, steer, input.handbrake);
    const hit = collideCircle(city, car.x, car.y, car.vehicle.length / 2);
    car.x = hit.x;
    car.y = hit.y;
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    if (car.hp <= 0) {
      explosion(game, car.x, car.y);
      exitCar(game);
      damagePlayer(game, 18);
    } else if (input.enter) {
      exitCar(game);
    }
  }
  return 0;
}

function explosion(game, x, y) {
  for (let i = 0; i < EXPLOSION_PARTICLES; i += 1) {
    const a = game.random() * TAU;
    const s = 60 + game.random() * 220;
    game.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + game.random() * 0.5, color: i % 3 === 0 ? '#ffd166' : '#ff6b3d', size: 2 + game.random() * 4 });
  }
  game.shake = Math.max(game.shake, 1);
}

/** Enter a nearby car (stealing a moving or police car raises the wanted level). */
export function enterCar(game, car) {
  const p = game.player;
  if (car.state === 'traffic' || car.state === 'police') {
    addWanted(game, WANTED.starOnSteal, 'Carjacking');
  }
  car.state = 'player';
  car.speed = 0;
  car.vx = 0;
  car.vy = 0;
  car.route = null;
  p.car = car;
  p.mode = 'drive';
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
}

/** Get out of the current car, leaving it parked beside the player. */
export function exitCar(game) {
  const p = game.player;
  const car = p.car;
  if (!car) return;
  car.state = 'parked';
  car.speed = 0;
  car.vx = 0;
  car.vy = 0;
  car.route = null;
  const back = car.angle + Math.PI / 2;
  p.x = clamp(car.x + Math.cos(back) * (PLAYER.exitClear + car.vehicle.width), PLAYER.radius, game.city.world - PLAYER.radius);
  p.y = clamp(car.y + Math.sin(back) * (PLAYER.exitClear + car.vehicle.width), PLAYER.radius, game.city.world - PLAYER.radius);
  p.mode = 'walk';
  p.car = null;
  p.angle = back;
}

/** Advance short-lived effects (floating text, muzzle flashes) and the HUD toast. */
export function stepEffects(game, dt) {
  game.time += dt;
  for (let i = game.effects.length - 1; i >= 0; i -= 1) {
    const e = game.effects[i];
    e.t -= dt;
    if (e.t <= 0) game.effects.splice(i, 1);
  }
  for (let i = game.particles.length - 1; i >= 0; i -= 1) {
    const pt = game.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    const drag = Math.max(0, 1 - 3 * dt);
    pt.vx *= drag;
    pt.vy *= drag;
    pt.life -= dt;
    if (pt.life <= 0) game.particles.splice(i, 1);
  }
  if (game.toast) {
    game.toast.t -= dt;
    if (game.toast.t <= 0) game.toast = null;
  }
  if (game.moneyFlash) {
    game.moneyFlash.t -= dt;
    if (game.moneyFlash.t <= 0) game.moneyFlash = null;
  }
  if (game.dialogue) {
    game.dialogueT -= dt;
    if (game.dialogueT <= 0) game.dialogue = null;
  }
  game.shake = Math.max(0, game.shake - dt * 22);
}

/** The player's current weapon definition. */
export function currentWeapon(game) {
  return WEAPONS[game.player.weapon];
}
