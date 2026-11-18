// Every tuning number, colour and piece of game data in one place. The city is a fixed logical
// area; the renderer scales it to the window and the camera follows the player, so no rule below
// depends on the screen size. All randomness for the simulation comes from the seeded generator in
// random.js, never Math.random, so the same seed always plays the same city and the screenshot
// scenes repeat exactly.

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/**
 * Visual polish knobs. These are read by the renderer and the traffic spawner only; nothing here
 * changes any gameplay rule, just how much is on screen and how tightly the camera frames it.
 */
export const CAMERA = { zoom: 1.22 };
export const DENSITY = { traffic: 3, parked: 3, peds: 3 };

/** The logical viewport the game is laid out for (the renderer fits it to the window). */
export const VIEW = { width: 1280, height: 720 };

/** The HUD minimap: its on-screen size and the distance from the screen's corner. */
export const MINIMAP = { size: 200, margin: 18 };

/**
 * The city's road grid. Roads run on a square lattice; `grid` blocks sit between `grid + 1` roads
 * in each direction. A road centreline k (0..grid) lies at road/2 + k*cell, so every lane stays on
 * the map and each block occupies cell - road on a side.
 */
export const CITY = {
  grid: 12,
  cell: 320,
  road: 72,
};
// The logical side length of the square city: grid cells plus the outer half-road margin on each side.
CITY.world = CITY.grid * CITY.cell + CITY.road;

/** The player on foot: speed, size and the range at which a car can be entered. */
export const PLAYER = {
  walkSpeed: 165,
  radius: 12,
  maxHealth: 100,
  startMoney: 320,
  enterRange: 46,
  exitClear: 26,
};

/** Vehicle handling, from nimble compacts to lumbering trucks. All names are original to Solara City. */
export const VEHICLES = [
  { name: 'Rook', kind: 'compact', max: 250, accel: 300, brake: 540, turn: 3.2, length: 32, width: 15, hp: 60, colors: ['#8b9bb0', '#5f6f86', '#aebfd4'] },
  { name: 'Sunset', kind: 'sports', max: 348, accel: 380, brake: 620, turn: 3.5, length: 36, width: 16, hp: 55, colors: ['#e85d75', '#ffd166', '#ff8fa3'] },
  { name: 'Talon', kind: 'muscle', max: 320, accel: 420, brake: 560, turn: 2.6, length: 40, width: 17, hp: 72, colors: ['#5a4fcf', '#c44536', '#2e2e35'] },
  { name: 'Mule', kind: 'van', max: 210, accel: 220, brake: 470, turn: 2.4, length: 46, width: 19, hp: 95, colors: ['#dedede', '#b9b9b9', '#d9a05b'] },
  { name: 'Zephyr', kind: 'sedan', max: 300, accel: 310, brake: 540, turn: 3.0, length: 42, width: 17, hp: 72, colors: ['#2b2b33', '#3d3a50', '#8a7fa8'] },
  { name: 'Hauler', kind: 'truck', max: 180, accel: 170, brake: 430, turn: 2.0, length: 54, width: 21, hp: 130, colors: ['#7a5a44', '#8c6a50', '#5c4636'] },
  { name: 'Cab', kind: 'taxi', max: 272, accel: 290, brake: 520, turn: 3.1, length: 38, width: 17, hp: 60, colors: ['#f2c14e', '#e0a830'] },
  { name: 'Interceptor', kind: 'police', max: 352, accel: 390, brake: 660, turn: 3.3, length: 40, width: 17, hp: 95, colors: ['#20283a'] },
];

/** The index into VEHICLES of the police interceptor, used wherever a police car is spawned. */
export const POLICE_TYPE = 7;

/** The player's weapons. Melee weapons are free of ammo; guns spend it and are bought at the armory. */
export const WEAPONS = {
  fists: { name: 'Fists', kind: 'melee', damage: 8, range: 36, cooldown: 0.28, price: 0, auto: false },
  bat: { name: 'Bat', kind: 'melee', damage: 22, range: 48, cooldown: 0.5, price: 120, auto: false },
  pistol: { name: 'Pistol', kind: 'gun', damage: 26, pellets: 1, range: 560, cooldown: 0.42, price: 260, ammo: 64, speed: 920, spread: 0.022, auto: false },
  shotgun: { name: 'Shotgun', kind: 'gun', damage: 9, pellets: 6, range: 400, cooldown: 0.95, price: 520, ammo: 24, speed: 800, spread: 0.16, auto: false },
  smg: { name: 'SMG', kind: 'gun', damage: 13, pellets: 1, range: 480, cooldown: 0.09, price: 680, ammo: 96, speed: 980, spread: 0.06, auto: true },
};

/** The order new weapons are offered at the armory, after fists. */
export const WEAPON_SHOP_ORDER = ['bat', 'pistol', 'shotgun', 'smg'];

/** The wanted system: stars rise on crime, fade while the player hides. */
export const WANTED = {
  maxStars: 5,
  fadeDelay: 8,       // seconds of no crime before stars begin to fade
  fadeTime: 6,        // seconds to lose one star while hidden
  sightRange: 340,    // how near a police car must be to notice a crime or the player
  starOnKill: 1,
  starOnSteal: 1,
  starOnPedHit: 1,
  starOnCarHit: 0,    // ramming AI cars raises a little, below
};

/** Districts: three regions a side, the centre downtown, the edges residential, the corners industrial. */
export const DISTRICT_LAYOUT = [
  ['industrial', 'residential', 'industrial'],
  ['residential', 'downtown', 'residential'],
  ['industrial', 'residential', 'industrial'],
];

/** The palette: a sun-soaked sunset city in warm tones with neon accents. */
export const PALETTE = {
  asphalt: '#2b2320',
  asphaltLine: '#4a3f36',
  sidewalk: '#3c352d',
  sidewalkEdge: '#2a251f',
  park: '#4c6340',
  parkDark: '#3c4f33',
  shadow: 'rgba(0,0,0,0.22)',
  shadowLong: 'rgba(0,0,0,0.30)',
  windowLit: '#ffd27a',
  windowDim: 'rgba(20,16,40,0.55)',
  skid: 'rgba(0,0,0,0.16)',
  sunsetTop: 'rgba(255,150,60,0.18)',
  sunsetMid: 'rgba(255,90,90,0.10)',
  sunsetBottom: 'rgba(120,40,110,0.24)',
  text: '#fff3e2',
  muted: '#c9b59a',
  gold: '#ffd166',
  cyan: '#38f2ff',
  magenta: '#ff4fd8',
  health: '#ff6b6b',
  wanted: '#ffd166',
};

/** Per-district building colour bands, roof tints and the neon colour their signs glow. */
export const DISTRICT_STYLE = {
  downtown: {
    building: ['#46356b', '#3a2f5e', '#2f2a55', '#4a3a6e'],
    roof: ['#2b2547', '#332c55'],
    neon: ['#ff4fd8', '#38f2ff', '#a78bfa', '#ffd166'],
    windows: true,
  },
  residential: {
    building: ['#c9783f', '#d88a4a', '#b86a38', '#a5653a'],
    roof: ['#8f5228', '#7a4522'],
    neon: ['#ffb86b', '#ff9e64'],
    windows: false,
  },
  industrial: {
    building: ['#7a5a44', '#6b4e3a', '#8a6a50', '#5c4636'],
    roof: ['#4d3c2c', '#574534'],
    neon: ['#ff6b6b', '#f7b267'],
    windows: false,
  },
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** localStorage keys. */
export const SAVE_KEY = 'solara-city.save';

/** The protagonist and story names (original). */
export const PROTAGONIST = 'Mara Voss';
export const CITY_NAME = 'Solara City';
