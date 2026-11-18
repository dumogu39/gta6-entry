// The story missions: a chain of original jobs for the courier Mara Voss. Each mission is a list of
// steps (steal a car, drive to a point, collect a package, kill a target, lose the heat); the mission
// runner checks the active step against the player's state and advances through them, paying out on
// completion and briefing the next job in dialogue. Targets and mission cars are spawned here.
import { CITY } from './config.js';
import { addMoney, createCar, laneCoord, roadCenter, toast } from './world.js';

/** How close the player must get to a waypoint for it to count as reached. */
const ARRIVE_RADIUS = 62;

/** Snap a point to the nearest traffic lane, so markers are reachable by car. */
function snapToRoad(city, x, y) {
  const c0 = city.road / 2;
  const max = c0 + city.grid * city.cell;
  let best = { x: c0, y: c0, angle: 0, d: Infinity };
  for (let k = 0; k <= city.grid; k += 1) {
    const c = roadCenter(k);
    const xc = Math.min(max, Math.max(c0, x));
    const yc = Math.min(max, Math.max(c0, y));
    for (const side of [-1, 1]) {
      const lc = laneCoord(k, side);
      const d1 = (xc - x) * (xc - x) + (lc - y) * (lc - y);
      if (d1 < best.d) best = { x: xc, y: lc, angle: x >= xc ? 0 : Math.PI, d: d1 };
      const d2 = (lc - x) * (lc - x) + (yc - y) * (yc - y);
      if (d2 < best.d) best = { x: lc, y: yc, angle: y >= yc ? Math.PI / 2 : -Math.PI / 2, d: d2 };
    }
  }
  return best;
}

/** The centre of a block, used to scatter markers around the city. */
function blockCenter(city, col, row) {
  return { x: col * city.cell + city.road + (city.cell - city.road) / 2, y: row * city.cell + city.road + (city.cell - city.road) / 2 };
}

/** Build the mission chain with concrete waypoints from this city. */
export function createMissions(game) {
  const { city } = game;
  const g = CITY.grid - 1;
  const c = (col, row) => snapToRoad(city, blockCenter(city, col, row).x, blockCenter(city, col, row).y);

  const chopShop = c(2, 5);
  const port = c(9, 2);
  const office = c(5, 9);
  const docks = c(10, 6);
  const district = c(8, 4);
  const armory = c(5, 5);
  const safehouse = c(0, 9);

  game.missions = [
    {
      title: 'First Gear',
      giver: 'Rook',
      brief: ['Mara, you are new in Solara. Rook wants to see if you can drive.', 'Grab any car and drop it at the chop shop. Do not get caught.'],
      reward: 200,
      steps: [
        { type: 'stealAny', label: 'Steal any car' },
        { type: 'goto', x: chopShop.x, y: chopShop.y, label: 'Deliver it to the chop shop' },
      ],
    },
    {
      title: 'Package Deal',
      giver: 'Rook',
      brief: ['Good work. Now a real job: pick up a package at the port.', 'Bring it to the office uptown before the cops notice.'],
      reward: 300,
      steps: [
        { type: 'collect', x: port.x, y: port.y, label: 'Collect the package at the port' },
        { type: 'goto', x: office.x, y: office.y, label: 'Deliver the package uptown' },
      ],
    },
    {
      title: 'Hot Wheels',
      giver: 'Sable',
      brief: ['The client wants a specific ride: a red Sunset near the docks.', 'Lift it and hit the checkpoints to shake any tail.'],
      reward: 400,
      steps: [
        { type: 'stealThis', x: docks.x, y: docks.y, label: 'Steal the Sunset' },
        { type: 'goto', x: district.x, y: district.y, label: 'Hit the checkpoint' },
        { type: 'goto', x: port.x, y: port.y, label: 'Reach the drop point' },
      ],
    },
    {
      title: 'Bad Blood',
      giver: 'Sable',
      brief: ['A rival lieutenant is shaking down our district.', 'Put him down and get out clean.'],
      reward: 500,
      steps: [
        { type: 'kill', x: district.x, y: district.y, label: 'Take out the lieutenant' },
        { type: 'evade', label: 'Lose the cops' },
      ],
    },
    {
      title: 'Clean Sweep',
      giver: 'Sable',
      brief: ['Three of his crew are holed up by the warehouses.', 'Clear them all before they run.'],
      reward: 600,
      steps: [
        { type: 'kill', x: c(8, 2).x, y: c(8, 2).y, label: 'Take out the lookout' },
        { type: 'kill', x: c(10, 3).x, y: c(10, 3).y, label: 'Take out the enforcer' },
        { type: 'kill', x: c(9, 5).x, y: c(9, 5).y, label: 'Take out the boss' },
      ],
    },
    {
      title: 'Sunset Heist',
      giver: 'Rook',
      brief: ['The big one. Hit the armory, grab the cash, and run.', 'Reach the safehouse before they corner you.'],
      reward: 1200,
      steps: [
        { type: 'goto', x: armory.x, y: armory.y, label: 'Reach the armory' },
        { type: 'collect', x: armory.x, y: armory.y, label: 'Grab the cash (heat!)' },
        { type: 'goto', x: safehouse.x, y: safehouse.y, label: 'Escape to the safehouse' },
      ],
    },
  ];

  game.mission = { index: -1, step: 0, active: false, timer: 0 };
  game.missionTargets = [];
}

/** Start mission `index`, briefing the player and activating its first step. */
export function startMission(game, index) {
  const m = game.missions[index];
  game.mission = { index, step: 0, active: true, timer: 0 };
  game.dialogue = { title: `${m.title}`, giver: m.giver, lines: m.brief };
  game.dialogueT = 6.5;
  setupStep(game, m, 0);
}

/** Resume a saved mission at a given step, without replaying the briefing. */
export function resumeMission(game, index, step) {
  const m = game.missions[index];
  game.mission = { index, step, active: true, timer: 0 };
  setupStep(game, m, step);
}

/** Activate a step: set the objective marker and spawn anything it needs. */
function setupStep(game, m, stepIndex) {
  const step = m.steps[stepIndex];
  if (step.type === 'stealAny') {
    game.objective = { label: step.label, type: step.type };
  } else {
    game.objective = { x: step.x, y: step.y, label: step.label, type: step.type };
  }
  if (step.type === 'stealThis') {
    const car = createCar(game, 1, step.x, step.y, snapToRoad(game.city, step.x, step.y).angle, 'parked');
    car.color = '#e8503a';
    car.missionCar = true;
    game.cars.push(car);
    step.car = car;
    game.objective = { x: step.x, y: step.y, label: step.label, type: step.type };
  } else if (step.type === 'kill') {
    const target = { id: game.nextTargetId++, x: step.x, y: step.y, angle: 0, hp: 70, alive: true, hitT: 0, color: '#e8503a' };
    step.target = target;
    game.targets.push(target);
  }
}

/** Whether the active step is satisfied. */
function stepDone(game, step) {
  const p = game.player;
  switch (step.type) {
    case 'stealAny':
      return p.mode === 'drive';
    case 'stealThis':
      return p.car === step.car;
    case 'goto':
    case 'collect': {
      const d = Math.hypot(p.x - step.x, p.y - step.y);
      return d < ARRIVE_RADIUS;
    }
    case 'kill':
      return step.target && !step.target.alive;
    case 'evade':
      return p.wanted === 0;
    default:
      return false;
  }
}

/** Advance the current mission one tick. */
export function stepMissions(game, dt) {
  if (!game.mission || !game.mission.active) return;
  const m = game.missions[game.mission.index];
  const step = m.steps[game.mission.step];

  if (step.type === 'collect' && stepDone(game, step)) {
    // The heist's cash grab trips the alarm; the reward itself is paid on completion.
    if (m.title === 'Sunset Heist') {
      game.player.wanted = Math.max(game.player.wanted, 3);
      toast(game, 'Alarm tripped — cops incoming!');
    }
  }

  if (stepDone(game, step)) {
    game.mission.step += 1;
    if (game.mission.step >= m.steps.length) {
      completeMission(game, m);
    } else {
      setupStep(game, m, game.mission.step);
    }
  }
}

function completeMission(game, m) {
  game.mission.active = false;
  addMoney(game, m.reward);
  game.dialogue = { title: `${m.title} complete`, giver: m.giver, lines: [`Paid $${m.reward}.`] };
  game.dialogueT = 4;
  toast(game, `Mission complete +$${m.reward}`, 3);
  const next = game.mission.index + 1;
  if (next < game.missions.length) {
    game.mission.pendingNext = next;
    game.mission.timer = 4;
  } else {
    game.mission.finished = true;
    toast(game, 'Solara City is yours.', 4);
  }
}

/** Chain the next mission after a short pause, outside the hot path. */
export function stepMissionChain(game, dt) {
  if (game.mission && game.mission.pendingNext !== undefined && !game.mission.active) {
    game.mission.timer -= dt;
    if (game.mission.timer <= 0) {
      const next = game.mission.pendingNext;
      game.mission.pendingNext = undefined;
      startMission(game, next);
    }
  }
}
