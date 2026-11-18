// AI traffic and pedestrians. Cars follow the road grid with a pure-pursuit controller that steers
// them onto their lane centreline, turns them at intersections and keeps them out of the car ahead;
// pedestrians walk the sidewalk grid the same way, slower and unbothered by traffic. Both live in the
// shared game state and are stepped every tick; this file also handles the player's car running people
// over (which raises the wanted level) and light car-on-car bumps.
import { CITY, DENSITY, PALETTE, PLAYER, VEHICLES, WANTED } from './config.js';
import { addWanted, addEffect, clamp, damagePlayer, roadCenter, turnToward } from './world.js';
import { chance, int, pick, range } from './random.js';

const LANE_OFFSET = CITY.road / 4;
const SIDEWALK_OFFSET = CITY.road / 2 + 11;

/** The right-hand lane side for a direction of travel. */
function rightLaneSide(axis, dir) {
  return axis === 'h' ? dir : -dir;
}

/** The next road intersection coordinate (a road centreline) along `pos` in direction `dir`. */
function nextIntersection(city, pos, dir) {
  const c0 = city.road / 2;
  let k;
  if (dir > 0) k = Math.ceil((pos - c0 + 0.001) / city.cell);
  else k = Math.floor((pos - c0 - 0.001) / city.cell);
  k = clamp(k, 0, city.grid);
  return c0 + k * city.cell;
}

/** The (x1,y1)-(x2,y2) endpoints of a route's travel line, offset from the road centreline. */
function routeLine(city, route, offset) {
  const c = roadCenter(route.line) + route.side * offset;
  if (route.axis === 'h') return { x1: route.from, y1: c, x2: route.to, y2: c };
  return { x1: c, y1: route.from, x2: c, y2: route.to };
}

/** The new direction of travel for a left or right turn at an intersection. */
function turnDir(axis, dir, left) {
  if (axis === 'h') return dir > 0 ? (left ? { axis: 'v', dir: -1 } : { axis: 'v', dir: 1 }) : (left ? { axis: 'v', dir: 1 } : { axis: 'v', dir: -1 });
  return dir > 0 ? (left ? { axis: 'h', dir: 1 } : { axis: 'h', dir: -1 }) : (left ? { axis: 'h', dir: -1 } : { axis: 'h', dir: 1 });
}

/** Choose the route after an intersection, straight or a turn. */
function chooseNext(city, random, route, fix, turnProb) {
  const dir = Math.sign(route.to - route.from);
  const c0 = city.road / 2;
  const max = c0 + city.grid * city.cell;
  const canStraight = dir > 0 ? route.to < max : route.to > c0;
  let turn = 'straight';
  const r = random();
  if (!canStraight) turn = r < 0.5 ? 'left' : 'right';
  else if (r < turnProb) turn = 'left';
  else if (r < turnProb * 2) turn = 'right';

  if (turn === 'straight') {
    return { axis: route.axis, line: route.line, side: route.side, from: route.to, to: nextIntersection(city, route.to + dir * 0.001, dir) };
  }
  const next = turnDir(route.axis, dir, turn === 'left');
  const side = rightLaneSide(next.axis, next.dir);
  return { axis: next.axis, line: Math.round((route.to - c0) / city.cell), side, from: fix, to: nextIntersection(city, fix + next.dir * 0.001, next.dir) };
}

/** A fresh route somewhere on the grid (used when a follower needs one). */
function randomRoute(city, random, offset, onSidewalk) {
  const axis = chance(random, 0.5) ? 'h' : 'v';
  let line = int(random, 0, city.grid);
  const dir = chance(random, 0.5) ? 1 : -1;
  let side = rightLaneSide(axis, dir);
  if (onSidewalk) {
    if (line === 0) side = 1;
    else if (line === city.grid) side = -1;
    else side = chance(random, 0.5) ? 1 : -1;
  }
  const c0 = city.road / 2;
  const max = c0 + city.grid * city.cell;
  const pos = range(random, c0, max);
  return { axis, line, side, from: pos, to: nextIntersection(city, pos + dir * 0.001, dir) };
}

/** Place an entity (car or ped) on the start of its route's travel line. */
function placeOnRoute(city, e, route, offset) {
  const { x1, y1, x2, y2 } = routeLine(city, route, offset);
  if (route.axis === 'h') {
    e.x = route.from;
    e.y = y1;
  } else {
    e.x = x1;
    e.y = route.from;
  }
  e.angle = Math.atan2(y2 - y1, x2 - x1);
}

/** Distance to the nearest other car in front of `e`, within `look`; look when none. */
function carAhead(e, cars, look) {
  let best = look;
  const fx = Math.cos(e.angle);
  const fy = Math.sin(e.angle);
  for (let i = 0; i < cars.length; i += 1) {
    const o = cars[i];
    if (o === e) continue;
    const dx = o.x - e.x;
    const dy = o.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d >= look || d < 0.001) continue;
    const dot = dx * fx + dy * fy;
    if (dot <= 0) continue;
    if (Math.abs(dot / d) < 0.7) continue;
    if (d < best) best = d;
  }
  return best;
}

/**
 * Advance one lane/sidewalk follower along its route. Shared by traffic cars and pedestrians:
 * `speed` is the cruise speed, `turnRate` the max steering rate, `offset` the lane distance from the
 * road centreline, and `cars` the car list to avoid (null for pedestrians).
 */
function stepRouteFollower(city, e, dt, speed, turnRate, offset, turnProb, random, cars) {
  if (!e.route) {
    e.route = randomRoute(city, random, offset, offset !== LANE_OFFSET);
    placeOnRoute(city, e, e.route, offset);
  }
  for (let guard = 0; guard < 2; guard += 1) {
    const route = e.route;
    const along = route.axis === 'h' ? e.x : e.y;
    const dir = Math.sign(route.to - route.from);
    if ((dir > 0 && along >= route.to) || (dir < 0 && along <= route.to)) {
      const fix = roadCenter(route.line) + route.side * offset;
      e.route = chooseNext(city, random, route, fix, turnProb);
      continue;
    }
    break;
  }

  const route = e.route;
  const { x1, y1, x2, y2 } = routeLine(city, route, offset);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const segLen = Math.hypot(dx, dy) || 1;
  let t = ((e.x - x1) * dx + (e.y - y1) * dy) / (segLen * segLen);
  t = clamp(t, 0, 1);
  const px = x1 + dx * t;
  const py = y1 + dy * t;
  const nx = -dy / segLen;
  const ny = dx / segLen;
  const lat = (e.x - px) * nx + (e.y - py) * ny;
  const segAngle = Math.atan2(dy, dx);
  const desired = segAngle - clamp(lat * 0.09, -0.9, 0.9);

  let cruise = speed;
  if (cars) {
    const ahead = carAhead(e, cars, 76);
    if (ahead < 30) cruise = 0;
    else if (ahead < 62) cruise = speed * 0.35;
  }
  if (t > 0.72) cruise = Math.min(cruise, speed * Math.max(0.32, 1 - (t - 0.72) * 3.2));

  const accel = (cars ? e.vehicle.accel : 180);
  const delta = clamp(cruise - e.speed, -accel * 2 * dt, accel * dt);
  e.speed += delta;
  e.speed = Math.max(0, e.speed);
  e.angle = turnToward(e.angle, desired, turnRate * dt);
  e.vx = Math.cos(e.angle) * e.speed;
  e.vy = Math.sin(e.angle) * e.speed;
  e.x += e.vx * dt;
  e.y += e.vy * dt;
}

/** Spawn traffic cars, parked cars and pedestrians into the fresh game. */
export function spawnTraffic(game) {
  const { city, random } = game;
  const trafficCount = Math.round(26 * DENSITY.traffic);
  const parkedCount = Math.round(24 * DENSITY.parked);
  const pedCount = Math.round(48 * DENSITY.peds);

  for (let i = 0; i < trafficCount; i += 1) {
    const type = int(random, 0, 6); // civilian vehicles only (0..6)
    const vehicle = VEHICLES[type];
    const car = { id: game.nextCarId++, type, vehicle, color: pick(random, vehicle.colors), x: 0, y: 0, angle: 0, vx: 0, vy: 0, speed: 0, state: 'traffic', hp: vehicle.hp, route: null };
    car.route = randomRoute(city, random, LANE_OFFSET, false);
    placeOnRoute(city, car, car.route, LANE_OFFSET);
    game.cars.push(car);
  }

  for (let i = 0; i < parkedCount; i += 1) {
    const type = int(random, 0, 6);
    const vehicle = VEHICLES[type];
    const car = { id: game.nextCarId++, type, vehicle, color: pick(random, vehicle.colors), x: 0, y: 0, angle: 0, vx: 0, vy: 0, speed: 0, state: 'parked', hp: vehicle.hp, route: null };
    parkCar(city, random, car);
    game.cars.push(car);
  }

  for (let i = 0; i < pedCount; i += 1) {
    const ped = { id: game.nextPedId++, x: 0, y: 0, angle: 0, speed: 0, vx: 0, vy: 0, route: null, alive: true, skin: pickPedSkin(random) };
    const route = randomRoute(city, random, SIDEWALK_OFFSET, true);
    ped.route = route;
    placeOnRoute(city, ped, route, SIDEWALK_OFFSET);
    ped.speed = int(random, 34, 60);
    game.peds.push(ped);
  }
}

function pickPedSkin(random) {
  return int(random, 0, 5);
}

/** Park a car at the curb of a random road, facing along it. */
function parkCar(city, random, car) {
  const axis = chance(random, 0.5) ? 'h' : 'v';
  const k = int(random, 0, city.grid);
  const side = chance(random, 0.5) ? 1 : -1;
  const c0 = city.road / 2;
  const max = c0 + city.grid * city.cell;
  const along = range(random, c0, max);
  const c = roadCenter(k) + side * (city.road / 2 + 2);
  if (axis === 'h') {
    car.x = along;
    car.y = c;
    car.angle = chance(random, 0.5) ? 0 : Math.PI;
  } else {
    car.x = c;
    car.y = along;
    car.angle = chance(random, 0.5) ? Math.PI / 2 : -Math.PI / 2;
  }
}

/** Advance all traffic cars and pedestrians for one tick, and resolve player collisions with them. */
export function stepTraffic(game, dt) {
  const { city, random, player } = game;

  for (let i = 0; i < game.cars.length; i += 1) {
    const car = game.cars[i];
    car.bumpTimer = Math.max(0, (car.bumpTimer || 0) - dt);
    if (car.state === 'traffic') {
      stepRouteFollower(city, car, dt, car.vehicle.max * 0.62, car.vehicle.turn * 2, LANE_OFFSET, 0.38, random, game.cars);
    }
  }

  for (let i = 0; i < game.peds.length; i += 1) {
    const ped = game.peds[i];
    if (!ped.alive) continue;
    stepRouteFollower(city, ped, dt, ped.speed, 7, SIDEWALK_OFFSET, 0.32, random, null);
  }

  collidePlayerWithWorld(game);
  hitPlayerOnFoot(game);
}

/** A car hitting the player on foot damages and shoves them. */
function hitPlayerOnFoot(game) {
  const p = game.player;
  if (p.mode !== 'walk' || !p.alive) return;
  for (let i = 0; i < game.cars.length; i += 1) {
    const car = game.cars[i];
    if (car.state === 'parked' || Math.abs(car.speed) < 90) continue;
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    const r = PLAYER.radius + car.vehicle.width / 2 + 3;
    if (dx * dx + dy * dy < r * r) {
      damagePlayer(game, 12);
      game.shake = Math.max(game.shake, 0.4);
      const a = Math.atan2(dy, dx);
      p.x = car.x + Math.cos(a) * r;
      p.y = car.y + Math.sin(a) * r;
      addEffect(game, '-HP', p.x, p.y - 18, PALETTE.health);
      break;
    }
  }
}

/** The player's car hitting pedestrians and other cars; raises the wanted level for casualties. */
function collidePlayerWithWorld(game) {
  const p = game.player;
  if (p.mode !== 'drive' || !p.car) return;
  const car = p.car;
  const half = car.vehicle.length / 2 + 4;

  for (let i = game.peds.length - 1; i >= 0; i -= 1) {
    const ped = game.peds[i];
    if (!ped.alive) continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    const d = Math.hypot(dx, dy);
    if (d < half + 8 && Math.abs(car.speed) > 40) {
      ped.alive = false;
      splatter(game, ped.x, ped.y);
      addWanted(game, WANTED.starOnPedHit, 'Hit and run');
      addEffect(game, '+1 heat', car.x, car.y - 30, PALETTE.wanted);
      break;
    }
  }

  for (let i = 0; i < game.cars.length; i += 1) {
    const o = game.cars[i];
    if (o === car || o.state === 'player') continue;
    const dx = o.x - car.x;
    const dy = o.y - car.y;
    const d = Math.hypot(dx, dy);
    const min = (car.vehicle.length + o.vehicle.length) / 2;
    if (d < min && (car.bumpTimer || 0) <= 0 && Math.abs(car.speed - o.speed) > 90) {
      const knock = Math.min(16, Math.abs(car.speed - o.speed) * 0.06);
      o.hp -= knock;
      car.hp -= knock * 0.4;
      car.bumpTimer = 0.45;
      o.bumpTimer = 0.45;
      sparks(game, (car.x + o.x) / 2, (car.y + o.y) / 2);
      if (o.hp <= 0) o.hp = 0;
      game.shake = Math.max(game.shake, 0.4);
      // Push the two apart so they don't keep grinding.
      const a = Math.atan2(dy, dx) || Math.random() * Math.PI * 2;
      const push = (min - d) / 2 + 1;
      o.x += Math.cos(a) * push;
      o.y += Math.sin(a) * push;
      car.x -= Math.cos(a) * push;
      car.y -= Math.sin(a) * push;
      break;
    }
  }
}

function splatter(game, x, y) {
  for (let i = 0; i < 10; i += 1) {
    const a = game.random() * Math.PI * 2;
    const s = 30 + game.random() * 90;
    game.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.8 + game.random() * 0.5, color: '#c0392b', size: 2 + game.random() * 3 });
  }
}

function sparks(game, x, y) {
  for (let i = 0; i < 8; i += 1) {
    const a = game.random() * Math.PI * 2;
    const s = 60 + game.random() * 140;
    game.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4, color: '#ffd166', size: 1.5 + game.random() * 2 });
  }
}
