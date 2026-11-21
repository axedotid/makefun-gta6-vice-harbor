// Vice Harbor — global tuning constants.
// Everything the simulation and the renderer need to agree on lives here.

export const VIEW = {
  width: 1280,
  height: 720,
  // Canvas keeps a fixed internal resolution so the game looks the same
  // on every desktop monitor. CSS stretches it to fill the window.
  maxPixelRatio: 1,
};

export const STEP = 1 / 60;

export const CITY = {
  name: 'Vice Harbor',
  seed: 1977,
  grid: 5, // blocks per axis
  blockSize: 620,
  roadWidth: 140,
  sidewalk: 26,
  tile: 760, // blockSize + roadWidth
  get size() {
    return this.grid * this.tile + this.roadWidth;
  },
  laneOffset: 32, // distance from a road centreline to a driving lane
  blockInset: 22,
  districtNames: ['Neon Mile', 'Coral Row', 'The Yards', 'Old Harbor', 'Sundown Strip'],
};

export const PALETTE = {
  // Sky is used for the world backdrop, the menu and the transition tint.
  sky: {
    dayTop: '#2c7fc4',
    dayBottom: '#a8d9e8',
    duskTop: '#1b2350',
    duskMid: '#7a2d68',
    duskBottom: '#ff8a5c',
    nightTop: '#070b1c',
    nightBottom: '#19213d',
    dawnTop: '#283362',
    dawnBottom: '#f0a074',
  },
  asphalt: '#262531',
  asphaltLight: '#302e3c',
  roadLine: '#d9c58c',
  roadLineDim: 'rgba(217,197,140,0.45)',
  crosswalk: '#b9b4a4',
  sidewalk: '#8f7d77',
  sidewalkLight: '#a3918a',
  sidewalkEdge: '#6d5f5c',
  lot: '#55484f',
  grass: '#4b6247',
  water: '#1f4f63',
  building: ['#4a4052', '#5c4750', '#414c5c', '#654b46', '#524a63', '#6a5844', '#3d4a4b'],
  buildingLit: ['#d9a066', '#e8b87a', '#c98e63'],
  buildingDark: '#26232f',
  neon: ['#ff4d9d', '#37e6ff', '#ffb43e', '#8cff6b', '#ff5b3e', '#b46bff'],
  neonSoft: 'rgba(255,77,157,0.28)',
  window: '#ffd98a',
  windowDim: '#6b6d88',
  palm: '#2f4a35',
  palmLight: '#557a4c',
  palmTrunk: '#6b4f3c',
  lamp: '#ffd9a0',
  playerBody: '#f2e7d8',
  playerShirt: '#e8455b',
  playerPants: '#202536',
  blood: '#8f1424',
  policeBody: '#e9edf2',
  policeStripe: '#1e4fa1',
  policeLightRed: '#ff3348',
  policeLightBlue: '#3f8dff',
  money: '#8fe27a',
  health: '#ff5b6e',
  mission: '#ffd166',
  text: '#f6efe6',
  textDim: '#b9b1ae',
  panel: 'rgba(16,16,26,0.76)',
  panelEdge: 'rgba(255,255,255,0.14)',
  black: '#0b0b12',
};

export const PLAYER = {
  radius: 13,
  maxHealth: 100,
  walkSpeed: 172,
  sprintSpeed: 268,
  acceleration: 1500,
  friction: 12,
  startCash: 500,
  fireCooldown: 0.16,
  bulletSpeed: 1180,
  bulletDamage: 26,
  hitRadius: 14,
};

export const VEHICLE = {
  radius: 25,
  maxSpeed: 380,
  reverseSpeed: 165,
  acceleration: 430,
  reverseAcceleration: 300,
  brakeForce: 820,
  rollingDrag: 0.72,
  lateralGrip: 0.86,
  handbrakeGrip: 0.965,
  steerRate: 2.9,
  steerHighSpeed: 1.55,
  maxHealth: 160,
  collisionDamage: 0.16,
  gravity: 700,
  rampLaunch: 0.42,
  explosionRadius: 145,
  explosionDamage: 85,
};

export const POLICE = {
  maxSpeed: 415,
  acceleration: 520,
  radius: 26,
  maxHealth: 190,
  sightRange: 880,
  weaponRange: 450,
  ramDamage: 18,
  ramCooldown: 0.9,
  spawnInterval: 3.2,
  spawnDistanceMin: 700,
  spawnDistanceMax: 1350,
  maxUnits: 5,
  ticketBonus: 420,
};

export const PEDESTRIANS = {
  count: 38,
  radius: 8,
  walkSpeed: 42,
  fleeSpeed: 128,
  maxHealth: 34,
  fleeRange: 280,
  spawnRadius: 3400,
};

export const TRAFFIC = {
  count: 18,
  speed: 116,
  spawnDistanceMin: 420,
  spawnDistanceMax: 1700,
  spawnInterval: 2.4,
  despawnDistance: 2600,
  colors: ['#d65757', '#4f83c4', '#d7b04c', '#65a37a', '#c0c3ce', '#8a6bb0', '#d9824a', '#5b6570'],
  names: ['Lynx', 'Marina', 'Bolt', 'Crosstown', 'Vista', 'Harbor GT', 'Penny', 'Dune'],
};

export const CRIME = {
  maxWanted: 6,
  carjack: 1,
  pedestrianKill: 1,
  policeHit: 2,
  policeKill: 3,
  policeCarSteal: 2,
  explosion: 1,
  decayDelay: 20, // seconds unseen before the wanted level starts falling
  decayInterval: 8, // seconds per star while evading
  pursuitMemory: 4,
};

export const RADIO = {
  stations: 3,
};

export const TIME = {
  cycleSeconds: 240,
  startPhase: 0.18, // late afternoon
  autosaveSeconds: 15,
};

export const FONT = '"Trebuchet MS", "Segoe UI", Verdana, sans-serif';
export const FONT_MONO = '"Lucida Console", "Courier New", monospace';
export const STORAGE_KEY = 'vice-harbor-save-v1';