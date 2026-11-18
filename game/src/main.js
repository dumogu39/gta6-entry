// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps, and the
// renderer paints what is there. The game moves between the title screen, play and pause, and stages
// screenshot scenes behind ?shot=. It also autosaves progress to localStorage and respawns the player
// after they go down.
import { STEP } from './config.js';
import { PLAYER } from './config.js';
import { createRandom } from './random.js';
import { createCity, createGame, stepEffects, stepPlayer } from './world.js';
import { spawnTraffic, stepTraffic } from './traffic.js';
import { stepPolice } from './police.js';
import { playerAttack, stepCombat } from './combat.js';
import { createMissions, resumeMission, startMission, stepMissionChain, stepMissions } from './missions.js';
import { createShops, stepShops } from './shops.js';
import { createAudio } from './audio.js';
import { applySave, hasSave, loadGame, saveGame } from './save.js';
import { createInput } from './input.js';
import { createRenderer, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;

/** Build a whole fresh world deterministically from the seed. */
function buildWorld() {
  const random = createRandom(seed);
  const city = createCity(random);
  const game = createGame(random, city);
  createMissions(game);
  createShops(game);
  spawnTraffic(game);
  return game;
}

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();

let game = buildWorld();
let renderer = null;

// Audio feedback tracks changes between steps so sounds play once, when something happens.
const prev = { health: 0, wanted: 0, money: 0, bullets: 0, carHp: -1, wasDriving: false };

function resetAudioBaseline() {
  const p = game.player;
  prev.health = p.health;
  prev.wanted = p.wanted;
  prev.money = p.money;
  prev.bullets = game.bullets.length;
  prev.carHp = p.car ? p.car.hp : -1;
  prev.wasDriving = false;
}
resetAudioBaseline();

/** One fixed step of the whole simulation, driven by a controls snapshot. */
function step(controls) {
  const p = game.player;
  const aim = renderer.toWorld(controls.aim.x, controls.aim.y);
  p.aimX = aim.x;
  p.aimY = aim.y;
  p.aimAngle = Math.atan2(aim.y - p.y, aim.x - p.x);
  playerAttack(game, controls, p.aimX, p.aimY);
  stepPlayer(game, STEP, controls);
  stepTraffic(game, STEP);
  stepPolice(game, STEP);
  stepCombat(game, STEP);
  stepMissions(game, STEP);
  stepMissionChain(game, STEP);
  stepShops(game, controls);
  stepEffects(game, STEP);
  updateAudio();
}

function updateAudio() {
  const p = game.player;
  const driving = p.mode === 'drive' && p.car;
  if (driving && !prev.wasDriving) audio.startEngine();
  else if (!driving && prev.wasDriving) audio.stopEngine();
  prev.wasDriving = driving;
  audio.updateEngine(driving ? p.car.speed : 0);

  if (p.health < prev.health) audio.hurt();
  if (p.wanted > prev.wanted) audio.alert();
  if (p.money > prev.money) audio.cash();
  if (game.bullets.length > prev.bullets) audio.shot();
  const carHp = p.car ? p.car.hp : -1;
  if (carHp >= 0 && prev.carHp >= 0 && carHp < prev.carHp - 0.5) audio.crash();
  if (p.wanted > 0 && game.cars.some((c) => c.state === 'police')) audio.siren(game.time);

  prev.health = p.health;
  prev.wanted = p.wanted;
  prev.money = p.money;
  prev.bullets = game.bullets.length;
  prev.carHp = carHp;
}

function runShot(name) {
  renderer = createRenderer(canvas);
  const plan = stageShot(name, game);
  const steps = Math.round(plan.seconds / STEP);
  for (let i = 0; i < steps; i += 1) step(plan.controls);
  let painted = 0;
  function paint() {
    renderer.draw(game, plan.screen, false);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  renderer = createRenderer(canvas);
  const input = createInput(canvas);
  const saved = loadGame(game);
  const cont = !!saved;
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let saveTimer = 0;
  let pending = { enter: false, use: false, firePressed: false, pause: false };

  function announce(message) {
    status.textContent = message;
  }

  function startNewGame() {
    game = buildWorld();
    startMission(game, 0);
    resetAudioBaseline();
    screen = SCREEN_PLAY;
    pending.firePressed = false;
    pending.enter = false;
    announce('New job: steal a car and deliver it to the chop shop.');
  }

  function continueGame() {
    if (saved) {
      applySave(game, saved, resumeMission);
      resetAudioBaseline();
      screen = SCREEN_PLAY;
      announce('Welcome back to Solara City.');
    } else {
      startNewGame();
    }
  }

  function handleScreen() {
    pending.enter = input.enter;
    pending.use = input.use;
    pending.firePressed = input.firePressed;
    pending.pause = input.pause;
    input.clearPresses();
    if (screen === SCREEN_TITLE) {
      if (pending.firePressed || pending.enter) {
        pending.firePressed = false;
        pending.enter = false;
        if (cont) continueGame();
        else startNewGame();
      }
    } else if (screen === SCREEN_PLAY) {
      if (pending.pause) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED && pending.pause) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function respawnIfDead(dt) {
    const p = game.player;
    if (p.alive) return;
    game.deadTimer = (game.deadTimer || 0) + dt;
    if (game.deadTimer >= 2.4) {
      p.alive = true;
      p.health = PLAYER.maxHealth;
      p.wanted = 0;
      p.money = Math.max(0, p.money - 100);
      p.mode = 'walk';
      p.car = null;
      p.x = game.city.world / 2;
      p.y = game.city.world / 2;
      game.deadTimer = 0;
      resetAudioBaseline();
      announce('You are back on your feet.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleScreen();

    if (screen === SCREEN_PLAY) {
      let first = true;
      while (accumulator >= STEP) {
        const controls = {
          move: input.move(),
          fire: input.fire,
          firePressed: first && pending.firePressed,
          enter: first && pending.enter,
          use: first && pending.use,
          handbrake: input.handbrake,
          aim: input.aim,
        };
        step(controls);
        first = false;
        accumulator -= STEP;
      }
      respawnIfDead(1 / 60);
      saveTimer += 1 / 60;
      if (saveTimer >= 2.5) {
        saveTimer = 0;
        saveGame(game);
      }
    } else {
      accumulator = 0;
    }

    renderer.draw(game, screen, cont);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Solara City. Press Space or click to begin.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
