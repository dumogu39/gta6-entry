// The wanted system and the police. Crime raises stars (addWanted lives in world.js); this file
// fades them once the player hides, and keeps a fleet of police interceptors chasing the player,
// ramming and shooting. At higher stars it throws a roadblock ahead of the player.
import { PALETTE, VEHICLES, WANTED } from './config.js';
import { addEffect, angleDelta, clamp, collideCircle, laneCoord, roadCenter, toast } from './world.js';

const POLICE_TYPE = 7; // Interceptor

/** How many police cars chase at each wanted level. */
function policeTarget(wanted) {
  return wanted <= 0 ? 0 : wanted + 1;
}

/** The nearest point on any traffic lane to (x, y), with the lane's heading. */
function nearestLane(city, x, y) {
  const c0 = city.road / 2;
  const max = c0 + city.grid * city.cell;
  let best = { x: c0, y: c0, angle: 0, d: Infinity };
  for (let k = 0; k <= city.grid; k += 1) {
    const c = roadCenter(k);
    const xc = clamp(x, c0, max);
    const yc = clamp(y, c0, max);
    for (const side of [-1, 1]) {
      const lc = laneCoord(k, side);
      const dh = Math.abs(y - lc);
      const dh2 = (xc - x) * (xc - x) + (lc - y) * (lc - y);
      if (dh2 < best.d) {
        best.d = dh2;
        best = { x: xc, y: lc, angle: x >= xc ? 0 : Math.PI, axis: 'h' };
      }
      const dv2 = (lc - x) * (lc - x) + (yc - y) * (yc - y);
      if (dv2 < best.d) {
        best.d = dv2;
        best = { x: lc, y: yc, angle: y >= yc ? Math.PI / 2 : -Math.PI / 2, axis: 'v' };
      }
      void dh;
    }
  }
  return best;
}

/** Spawn a police interceptor near the player, on a lane, and return it. */
function spawnPolice(game) {
  const p = game.player;
  const a = game.random() * Math.PI * 2;
  const dist = 360 + game.random() * 260;
  const tx = clamp(p.x + Math.cos(a) * dist, 30, game.city.world - 30);
  const ty = clamp(p.y + Math.sin(a) * dist, 30, game.city.world - 30);
  const lane = nearestLane(game.city, tx, ty);
  return spawnPoliceAt(game, lane.x, lane.y, lane.angle);
}

/** Spawn a police interceptor at an exact position and heading (also used to stage chase scenes). */
export function spawnPoliceAt(game, x, y, angle) {
  const vehicle = VEHICLES[POLICE_TYPE];
  const car = {
    id: game.nextCarId++, type: POLICE_TYPE, vehicle, color: vehicle.colors[0],
    x, y, angle, vx: 0, vy: 0, speed: vehicle.max * 0.4, state: 'police', hp: vehicle.hp, route: null,
    siren: 0, chaseTimer: 0, ramTimer: 0, shootTimer: game.random() * 0.6,
  };
  game.cars.push(car);
  return car;
}

/** Manage the police fleet size and chase each car toward the player. */
export function stepPolice(game, dt) {
  const p = game.player;

  // Wanted fade while hidden.
  if (p.wanted > 0) {
    p.wantedTimer = Math.min(p.wantedTimer + dt, 60);
    const seen = policeNear(game, WANTED.sightRange);
    if (!seen && p.wantedTimer >= WANTED.fadeDelay) {
      p.fadeTimer = (p.fadeTimer || 0) + dt;
      if (p.fadeTimer >= WANTED.fadeTime) {
        p.fadeTimer = 0;
        p.wanted -= 1;
        p.wantedTimer = WANTED.fadeDelay;
        if (p.wanted === 0) toast(game, 'You lost the heat.');
      }
    } else {
      p.fadeTimer = 0;
    }
  } else {
    p.fadeTimer = 0;
  }

  // Fleet size.
  const police = game.cars.filter((c) => c.state === 'police');
  const target = policeTarget(p.wanted);
  while (police.length < target) police.push(spawnPolice(game));
  while (police.length > target) {
    const c = police.pop();
    game.cars.splice(game.cars.indexOf(c), 1);
  }

  // Roadblocks at higher stars.
  if (p.wanted >= 2 && p.mode === 'drive') {
    game.roadblockTimer = (game.roadblockTimer || 0) - dt;
    if (game.roadblockTimer <= 0) {
      game.roadblockTimer = 26;
      spawnRoadblock(game);
    }
  }

  for (let i = 0; i < game.cars.length; i += 1) {
    const car = game.cars[i];
    if (car.state !== 'police') continue;
    car.siren += dt * 8;
    chase(car, p, dt, game);
    const hit = collideCircle(game.city, car.x, car.y, car.vehicle.length / 2);
    car.x = hit.x;
    car.y = hit.y;
  }

  stepRoadblocks(game, dt);
  policeShoot(game, dt);
}

/** Whether any police car is within `range` of the player. */
function policeNear(game, range) {
  const p = game.player;
  const r2 = range * range;
  for (let i = 0; i < game.cars.length; i += 1) {
    const c = game.cars[i];
    if (c.state !== 'police') continue;
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    if (dx * dx + dy * dy < r2) return true;
  }
  return false;
}

/** Steer a police car toward the player and accelerate; ram when close. */
function chase(car, player, dt, game) {
  const dx = player.x - car.x;
  const dy = player.y - car.y;
  const d = Math.hypot(dx, dy) || 1;
  const desired = Math.atan2(dy, dx);
  const steer = clamp(angleDelta(car.angle, desired) / 0.45, -1, 1);
  let throttle = 1;
  if (d < 90) throttle = 0.55;
  if (d < 40) throttle = 0.25;
  if (d < 22) throttle = -0.25; // back off so the squad does not climb onto the player
  // Slow a touch through sharp direction changes so they don't orbit.
  const delta = Math.abs(angleDelta(car.angle, desired));
  if (delta > 1.6) throttle = Math.max(-0.25, throttle - 0.4);

  // Reuse the shared arcade physics.
  const v = car.vehicle;
  if (throttle !== 0) {
    const dir = Math.sign(car.speed) || 1;
    if (Math.sign(throttle) !== dir) car.speed -= v.brake * dt;
    else car.speed += throttle * v.accel * dt;
  } else {
    car.speed -= Math.sign(car.speed) * v.accel * 0.45 * dt;
    if (Math.abs(car.speed) < 3) car.speed = 0;
  }
  car.speed = clamp(car.speed, -v.max * 0.4, v.max);
  const speedFactor = Math.min(1, Math.abs(car.speed) / 46);
  car.angle += steer * v.turn * speedFactor * dt;
  car.vx = Math.cos(car.angle) * car.speed;
  car.vy = Math.sin(car.angle) * car.speed;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // Ram the player's car when close and moving fast enough to matter.
  if (d < 26 && car.ramTimer <= 0 && car.speed > 50) {
    car.ramTimer = 1.2;
    if (player.mode === 'drive' && player.car) {
      player.car.hp -= 8;
      addEffect(game, 'RAMMED', car.x, car.y - 24, PALETTE.health);
      game.shake = Math.max(game.shake, 0.5);
    }
  }
  car.ramTimer = Math.max(0, car.ramTimer - dt);
}

/** Police open fire when the player is wanted and on foot within range. */
function policeShoot(game, dt) {
  const p = game.player;
  if (p.wanted === 0) return;
  for (let i = 0; i < game.cars.length; i += 1) {
    const car = game.cars[i];
    if (car.state !== 'police') continue;
    car.shootTimer = (car.shootTimer || 0) - dt;
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    const d = Math.hypot(dx, dy);
    if (car.shootTimer <= 0 && d < 460 && game.random() < 0.5) {
      car.shootTimer = 0.9;
      const a = Math.atan2(dy, dx) + (game.random() - 0.5) * 0.14;
      game.bullets.push({
        id: game.nextBulletId++, x: car.x + Math.cos(a) * 20, y: car.y + Math.sin(a) * 20,
        vx: Math.cos(a) * 640, vy: Math.sin(a) * 640, life: 1.4, hostile: true, color: '#ffb86b',
      });
    }
  }
}

function spawnRoadblock(game) {
  const p = game.player;
  const car = p.car;
  const lane = nearestLane(game.city, p.x, p.y);
  // Put the block ahead of the player's heading, on the lane they occupy.
  const ahead = 420;
  const ax = p.x + Math.cos(p.angle) * ahead;
  const ay = p.y + Math.sin(p.angle) * ahead;
  const bl = nearestLane(game.city, ax, ay);
  const vehicle = VEHICLES[POLICE_TYPE];
  const blocker = {
    id: game.nextCarId++, type: POLICE_TYPE, vehicle, color: vehicle.colors[0],
    x: bl.x, y: bl.y, angle: bl.angle + Math.PI / 2, vx: 0, vy: 0, speed: 0, state: 'parked', hp: vehicle.hp, route: null,
  };
  game.cars.push(blocker);
  game.roadblocks.push({ x: bl.x, y: bl.y, angle: bl.angle, t: 0, blocker });
  void lane; void car;
}

function stepRoadblocks(game, dt) {
  for (let i = game.roadblocks.length - 1; i >= 0; i -= 1) {
    const rb = game.roadblocks[i];
    rb.t += dt;
    if (rb.t > 30) {
      // Remove the blocker when it has served its time.
      const idx = game.cars.indexOf(rb.blocker);
      if (idx >= 0) game.cars.splice(idx, 1);
      game.roadblocks.splice(i, 1);
    }
  }
}
