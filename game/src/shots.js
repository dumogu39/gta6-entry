// The screenshot scenes behind ?shot=start|city|mission|wanted. Each one stages a fixed seed state
// and returns the controls an autopilot should hold plus how long to simulate, so the frame the
// screenshot captures is what a real game looks like (traffic flowing, a mission on the HUD, police
// in pursuit) and the same seed always gives the same frame. No drawing happens here.
import { CITY, POLICE_TYPE } from './config.js';
import { createCar, enterCar, laneCoord, roadCenter } from './world.js';
import { startMission } from './missions.js';
import { spawnPoliceAt } from './police.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

/** A plain controls object with nothing held but forward throttle. */
function driveForward(throttle = -1) {
  // move.y of -1 is forward (W/up), so the autopilot drives straight ahead.
  return { move: { x: 0, y: throttle }, fire: false, firePressed: false, enter: false, use: false, handbrake: false, aim: { x: 0, y: 0 } };
}

function idleControls() {
  return { move: { x: 0, y: 0 }, fire: false, firePressed: false, enter: false, use: false, handbrake: false, aim: { x: 0, y: 0 } };
}

/** Put the player behind the wheel of a car on a horizontal road, facing east. */
function placeDriver(game, type, roadK, side, startX) {
  const x = startX ?? roadCenter(1) + 120;
  const y = laneCoord(roadK, side);
  const car = createCar(game, type, x, y, 0, 'parked');
  game.cars.push(car);
  enterCar(game, car);
  return car;
}

/** Spawn a moving traffic car on horizontal road `roadK` at x, heading east (dir 1) or west (dir -1). */
function spawnMoving(game, type, roadK, side, x, dir) {
  const car = createCar(game, type, x, laneCoord(roadK, side), dir > 0 ? 0 : Math.PI, 'traffic');
  let to = dir > 0 ? CITY.world : 0;
  for (let j = 0; j <= CITY.grid; j += 1) {
    const c = roadCenter(j);
    if (dir > 0 && c > x + 24) { to = c; break; }
    if (dir < 0 && c < x - 24) { to = c; break; }
  }
  car.route = { axis: 'h', line: roadK, side, from: x, to };
  car.speed = car.vehicle.max * 0.45;
  game.cars.push(car);
  return car;
}

/** Park a car at the curb of horizontal road `roadK`. */
function parkH(game, type, roadK, side, x) {
  const y = roadCenter(roadK) + side * (CITY.road / 2 + 8);
  const car = createCar(game, type, x, y, side > 0 ? 0 : Math.PI, 'parked');
  game.cars.push(car);
  return car;
}

/** Stage a roadblock (barricade + a parked interceptor) at an exact spot. */
function addRoadblock(game, x, y, blockerAngle) {
  const blocker = createCar(game, POLICE_TYPE, x, y, blockerAngle, 'parked');
  blocker.color = '#20283a';
  game.cars.push(blocker);
  game.roadblocks.push({ x, y, angle: 0, t: 0, blocker });
  return blocker;
}

/**
 * Set `game` to the named scene and return its controls and simulation length. Any name other than
 * city, mission or wanted is the start screen.
 */
export function stageShot(name, game) {
  if (name !== 'city' && name !== 'mission' && name !== 'wanted') {
    return { controls: idleControls(), seconds: 0, screen: SCREEN_TITLE };
  }

  if (name === 'city') {
    placeDriver(game, 0, 6, 1);
    // Oncoming traffic in the far lane passes the player without touching it.
    spawnMoving(game, 1, 6, -1, 1300, -1);
    spawnMoving(game, 3, 6, -1, 1550, -1);
    spawnMoving(game, 4, 6, -1, 1800, -1);
    spawnMoving(game, 6, 6, -1, 2050, -1);
    // Same-lane traffic well ahead, out of reach before the frame is taken.
    spawnMoving(game, 6, 6, 1, 2000, 1);
    spawnMoving(game, 0, 6, 1, 2300, 1);
    // Parked cars lining the curb near the crossing ahead.
    parkH(game, 4, 6, 1, 1700);
    parkH(game, 0, 6, 1, 1740);
    parkH(game, 5, 6, -1, 1650);
    parkH(game, 1, 6, -1, 1690);
    return { controls: driveForward(-0.55), seconds: 3.2, screen: SCREEN_PLAY };
  }

  if (name === 'mission') {
    placeDriver(game, 0, 6, 1);
    startMission(game, 1); // Package Deal: an objective marker across town
    return { controls: driveForward(-0.6), seconds: 3.8, screen: SCREEN_PLAY };
  }

  // wanted: a live chase with police closing in and a roadblock ahead, player healthy.
  game.player.wanted = 3;
  const car = placeDriver(game, 2, 6, 1);
  car.hp = 400;
  const p = game.player;
  p.health = 100;
  const y = p.y;
  const cops = [
    spawnPoliceAt(game, p.x - 70, y, 0),
    spawnPoliceAt(game, p.x - 130, y, 0),
    spawnPoliceAt(game, p.x - 190, y, 0),
    spawnPoliceAt(game, p.x - 250, y, 0),
  ];
  for (const c of cops) c.shootTimer = 999;
  addRoadblock(game, p.x + 380, y, Math.PI / 2);
  game.roadblockTimer = 999; // suppress the automatic roadblock so the staged one is the only one
  return { controls: driveForward(-0.25), seconds: 2.5, screen: SCREEN_PLAY };
}
