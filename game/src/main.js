// Vice Harbor — game loop and state machine.
// Ties the city, people, cars, police, combat, missions, radio and HUD into
// one playable shift. Everything is local; nothing is fetched, ever.

import {
  VIEW,
  STEP,
  CITY,
  PLAYER,
  VEHICLE,
  POLICE,
  PEDESTRIANS,
  TRAFFIC,
  CRIME,
  TIME,
} from './config.js';
import { createRandom, clamp, dist, mod } from './random.js';
import {
  generateCity,
  circleHitsBuilding,
  nearestRoadCoord,
  nearestVehicle,
  randomRoadPoint,
} from './world.js';
import {
  Player,
  Vehicle,
  PoliceCar,
  Pedestrian,
  chooseTrafficTarget,
  spawnTrafficVehicle,
  spawnParkedVehicle,
} from './entities.js';
import { CombatSystem } from './combat.js';
import { MissionManager, STORY_INTRO } from './missions.js';
import { createInput } from './input.js';
import { Renderer } from './render.js';
import { Hud } from './hud.js';
import { Radio } from './radio.js';
import * as SaveGame from './savegame.js';

const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const citySeed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : CITY.seed;
const shotMode = params.get('shot');

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = createInput(canvas);
    this.renderer = new Renderer(canvas);
    this.hud = new Hud();
    this.radio = new Radio();
    this.combat = new CombatSystem(this);

    this.city = generateCity({ ...CITY, seed: citySeed });
    this.rng = createRandom(citySeed * 7 + 13);

    this.state = 'menu';
    this.player = new Player(this.city.spawn.player.x, this.city.spawn.player.y);
    this.player.angle = this.city.spawn.player.angle;
    this.player.aimAngle = this.player.angle;
    this.vehicles = [];
    this.peds = [];
    this.police = [];
    this.missions = new MissionManager();

    this.wanted = 0;
    this.unseenTimer = 0;
    this.decayTimer = 0;
    this.evade = { active: false, progress: 0, decaying: false, countdown: CRIME.decayDelay };
    this.policeSpawnTimer = 0;
    this.trafficTimer = 0;
    this.pedTimer = 0;
    this.saveTimer = 0;
    this.playTime = 0;
    this.dayPhase = TIME.startPhase;
    this.enterPrompt = null;
    this.pointer = { x: VIEW.width / 2, y: VIEW.height / 2 };
    this.toast = null;
    this.cashFlash = 0;
    this.roadHitTimer = 0;
    this.hasSave = SaveGame.hasSave();
    this.summary = SaveGame.saveSummary()?.label ?? '';
    this.stats = { kills: 0, carsStolen: 0, missionsDone: 0, cashEarned: 0, carsDestroyed: 0 };
    this.lastWantedToast = 0;

    this.renderer.snapTo(this.player.x, this.player.y);
    this.populateAmbient();

    if (shotMode === 'start') {
      SaveGame.clearSave();
      this.hasSave = false;
      this.summary = '';
      this.state = 'menu';
    } else if (shotMode === 'play') {
      this.setupPlayShot();
    } else if (shotMode === 'end') {
      this.setupEndShot();
    }

    window.addEventListener('pagehide', () => {
      if (this.state === 'playing') this.saveGame();
    });

    this.lastTime = 0;
    this.acc = 0;
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
    this.announce('Vice Harbor. Press Enter to start, or C to continue a saved game.');
  }

  // --- lifecycle -----------------------------------------------------------

  populateAmbient() {
    for (let i = 0; i < 10; i += 1) {
      const van = spawnTrafficVehicle(this.city, this.rng, this.player.x, this.player.y, 300);
      van.target = chooseTrafficTarget(van, this.city, Math.random);
      this.vehicles.push(van);
    }
    for (let i = 0; i < 16; i += 1) this.spawnPedestrian();
    for (let i = 0; i < 5; i += 1) this.vehicles.push(spawnParkedVehicle(this.city, this.rng));
  }

  startNew() {
    this.state = 'playing';
    const spawn = this.city.spawn.player;
    this.player = new Player(spawn.x, spawn.y);
    this.player.angle = spawn.angle;
    this.player.aimAngle = spawn.angle;
    this.player.cash = PLAYER.startCash;
    this.player.wanted = 0;
    this.vehicles = [];
    this.peds = [];
    this.police = [];
    this.combat.reset();
    this.missions = new MissionManager();
    this.radio = new Radio();
    this.wanted = 0;
    this.unseenTimer = 0;
    this.decayTimer = 0;
    this.evade = { active: false, progress: 0, decaying: false, countdown: CRIME.decayDelay };
    this.policeSpawnTimer = 0;
    this.trafficTimer = 0;
    this.pedTimer = 0;
    this.saveTimer = 0;
    this.playTime = 0;
    this.dayPhase = TIME.startPhase;
    this.stats = { kills: 0, carsStolen: 0, missionsDone: 0, cashEarned: 0, carsDestroyed: 0 };
    this.player.wanted = 0;
    this.enterPrompt = null;
    this.toast = null;
    this.cashFlash = 0;
    this.largeShake = 0;

    this.populateTraffic(TRAFFIC.count);
    for (let i = 0; i < PEDESTRIANS.count; i += 1) this.spawnPedestrian();
    for (let i = 0; i < 8; i += 1) this.vehicles.push(spawnParkedVehicle(this.city, this.rng));

    this.missions.start(this);
    this.renderer.snapTo(this.player.x, this.player.y);
    this.renderer.camera.zoom = 1.02;
    this.hasSave = SaveGame.hasSave();
    this.summary = SaveGame.saveSummary()?.label ?? '';
    this.announce('New game. Drive to the Sunset Market.');
  }

  continueGame() {
    const data = SaveGame.load();
    if (!data) {
      this.hasSave = false;
      this.summary = '';
      return;
    }
    this.startNew();
    this.player.cash = clamp(data.cash, 0, 1e9);
    this.player.health = clamp(data.health, 15, PLAYER.maxHealth);
    this.player.wanted = 0;
    this.player.x = clamp(data.position.x, 40, this.city.size - 40);
    this.player.y = clamp(data.position.y, 40, this.city.size - 40);
    if (circleHitsBuilding(this.player.x, this.player.y, this.player.r + 2, this.city)) {
      this.player.x = nearestRoadCoord(this.player.x, this.city) + CITY.laneOffset;
      this.player.y = nearestRoadCoord(this.player.y, this.city) + CITY.laneOffset;
    }
    this.player.angle = -Math.PI / 2;
    this.player.aimAngle = this.player.angle;
    this.dayPhase = mod(data.dayPhase, 1);
    this.playTime = data.playTime;
    this.stats.missionsDone = data.missionsDone;
    this.setWanted(data.wanted);
    this.missions.begin(clamp(data.missionIndex, 0, 5), this);
    this.renderer.snapTo(this.player.x, this.player.y);
    this.saveTimer = 0;
    this.hasSave = true;
    this.summary = SaveGame.saveSummary()?.label ?? '';
    this.showToast('SAVED GAME LOADED', 3);
    this.announce(`Saved game loaded. Job ${this.missions.index + 1}.`);
  }

  returnToMenu() {
    if (this.state === 'playing' || this.state === 'paused') this.saveGame();
    this.state = 'menu';
    this.hasSave = SaveGame.hasSave();
    this.summary = SaveGame.saveSummary()?.label ?? '';
    this.enterPrompt = null;
    this.announce('Main menu. Press Enter for a new game, or C to continue.');
  }

  saveGame() {
    if (this.state !== 'playing' || this.player.dead) return false;
    const ok = SaveGame.save({
      cash: this.player.cash,
      missionIndex: clamp(this.missions.index, 0, 5),
      wanted: this.wanted,
      position: { x: this.player.x, y: this.player.y },
      dayPhase: this.dayPhase,
      health: this.player.health,
      missionsDone: this.stats.missionsDone,
      playTime: this.playTime,
    });
    if (ok) {
      this.hasSave = true;
      this.summary = SaveGame.saveSummary()?.label ?? '';
    }
    return ok;
  }

  win() {
    if (this.state !== 'playing') return;
    this.state = 'victory';
    this.stats.missionsDone = 6;
    this.police.length = 0;
    SaveGame.clearSave();
    this.hasSave = false;
    this.summary = '';
    this.announce('Victory. You made it out of Vice Harbor.');
  }

  onPlayerDeath() {
    if (this.state !== 'playing') return;
    this.player.dead = true;
    this.player.health = 0;
    this.state = 'gameover';
    this.enterPrompt = null;
    this.saveGameBlocked = true;
    SaveGame.clearSave();
    this.hasSave = false;
    this.summary = '';
    this.announce('Wasted. Press Enter to try again.');
  }

  announce(text) {
    const el = document.getElementById('status');
    if (el) el.textContent = text;
  }

  showToast(text, seconds = 2.8) {
    this.toast = { text, timer: seconds, maxTime: seconds };
  }

  // --- spawning ------------------------------------------------------------

  spawnTraffic(count, minDistance = 620) {
    for (let i = 0; i < count; i += 1) {
      let vehicle = null;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const candidate = spawnTrafficVehicle(this.city, this.rng, this.player.x, this.player.y, minDistance);
        if (dist(candidate.x, candidate.y, this.player.x, this.player.y) >= minDistance) {
          vehicle = candidate;
          break;
        }
      }
      if (!vehicle) continue;
      vehicle.target = chooseTrafficTarget(vehicle, this.city, Math.random);
      this.vehicles.push(vehicle);
    }
  }

  populateTraffic(count) {
    this.spawnTraffic(count, 560);
  }

  spawnPedestrian(near = null) {
    const points = this.city.spawnPoints.pedestrians;
    let point = near;
    if (!point) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const p = points[Math.floor(this.rng() * points.length)];
        const d = dist(p.x, p.y, this.player.x, this.player.y);
        if (d > 240 && d < 2800) {
          point = p;
          break;
        }
        point = p;
      }
    }
    if (!point) return;
    const shirt = this.rng() < 0.25 ? TRAFFIC.colors[Math.floor(this.rng() * TRAFFIC.colors.length)] : this.city.buildings[0]?.color;
    const ped = new Pedestrian(point.x, point.y, {
      shirt: typeof shirt === 'string' ? shirt : '#7a5b66',
      speedFactor: 0.8 + this.rng() * 0.5,
    });
    ped.target = { x: points[Math.floor(this.rng() * points.length)].x, y: points[Math.floor(this.rng() * points.length)].y };
    this.peds.push(ped);
  }

  spawnCop() {
    let point = null;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const p = randomRoadPoint(Math.random, this.city);
      const d = dist(p.x, p.y, this.player.x, this.player.y);
      if (d > POLICE.spawnDistanceMin && d < POLICE.spawnDistanceMax) {
        point = p;
        break;
      }
    }
    if (!point) {
      point = randomRoadPoint(Math.random, this.city, { min: this.city.size * 0.3, max: this.city.size * 0.7 });
    }
    const cop = new PoliceCar(point.x, point.y, point.angle);
    this.police.push(cop);
    return cop;
  }

  // --- wanted --------------------------------------------------------------

  addWanted(amount) {
    if (amount <= 0) return;
    const before = this.wanted;
    this.wanted = clamp(this.wanted + amount, 0, CRIME.maxWanted);
    this.player.wanted = this.wanted;
    this.unseenTimer = 0;
    this.decayTimer = 0;
    this.evade = { active: false, progress: 0, decaying: false, countdown: CRIME.decayDelay };
    if (this.wanted > before) {
      this.showToast(`WANTED  ${'★'.repeat(this.wanted)}${'☆'.repeat(CRIME.maxWanted - this.wanted)}`, 2.4);
      this.announce(`Wanted level ${this.wanted}. Police are responding.`);
    }
  }

  setWanted(level) {
    const next = clamp(level, 0, CRIME.maxWanted);
    const was = this.wanted;
    this.wanted = next;
    this.player.wanted = next;
    this.unseenTimer = 0;
    this.decayTimer = 0;
    this.evade = { active: false, progress: 0, decaying: false, countdown: CRIME.decayDelay };
    if (next === 0 && was > 0) {
      this.police.length = 0;
      this.policeSpawnTimer = 0;
      this.showToast('HEAT IS OFF — KEEP MOVING', 2.6);
    }
  }

  hasLineOfSight(cop, player) {
    const dx = player.x - cop.x;
    const dy = player.y - cop.y;
    const len = Math.hypot(dx, dy);
    if (len > POLICE.sightRange) return false;
    const steps = Math.ceil(len / 55);
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      if (circleHitsBuilding(cop.x + dx * t, cop.y + dy * t, 3, this.city)) return false;
    }
    return true;
  }

  updateWanted(dt) {
    if (this.wanted <= 0) {
      this.player.wanted = 0;
      this.unseenTimer = 0;
      this.decayTimer = 0;
      this.evade = { active: false, progress: 0, decaying: false, countdown: CRIME.decayDelay };
      return;
    }
    let seen = false;
    for (const cop of this.police) {
      if (cop.destroyed) continue;
      if (this.hasLineOfSight(cop, this.player)) {
        seen = true;
        break;
      }
    }
    if (seen) {
      this.unseenTimer = 0;
      this.decayTimer = 0;
      this.evade = { active: false, progress: 0, decaying: false, countdown: CRIME.decayDelay };
      return;
    }
    this.unseenTimer += dt;
    if (this.unseenTimer < CRIME.decayDelay) {
      this.evade = {
        active: true,
        progress: this.unseenTimer / CRIME.decayDelay,
        decaying: false,
        countdown: CRIME.decayDelay - this.unseenTimer,
      };
      return;
    }
    this.evade.active = true;
    this.evade.decaying = true;
    this.evade.countdown = 0;
    this.decayTimer += dt;
    this.evade.progress = clamp(this.decayTimer / CRIME.decayInterval, 0, 1);
    if (this.decayTimer >= CRIME.decayInterval) {
      this.decayTimer = 0;
      this.wanted = Math.max(0, this.wanted - 1);
      this.player.wanted = this.wanted;
      this.announce(`Wanted level down to ${this.wanted}.`);
      if (this.wanted === 0) {
        this.police.length = 0;
        this.policeSpawnTimer = 0;
        this.evade = { active: false, progress: 0, decaying: false, countdown: CRIME.decayDelay };
        this.showToast('HEAT IS OFF — KEEP MOVING', 2.8);
      }
    }
  }

  // --- update --------------------------------------------------------------

  frame(now) {
    if (!this.lastTime) this.lastTime = now;
    let delta = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (!Number.isFinite(delta) || delta < 0) delta = 0;
    delta = Math.min(delta, 0.1);
    this.acc += delta;
    let steps = 0;
    while (this.acc >= STEP && steps < 6) {
      this.update(STEP);
      this.input.endFrame();
      this.acc -= STEP;
      steps += 1;
    }
    if (steps === 6) this.acc = 0;
    this.render(delta);
    requestAnimationFrame(this.frame);
  }

  update(dt) {
    const mouse = this.input.mouse;
    const world = this.renderer.screenToWorld(mouse.x, mouse.y);
    mouse.worldX = world.x;
    mouse.worldY = world.y;
    this.pointer = { x: mouse.x, y: mouse.y };
    this.radio.update(dt);
    if (this.toast) {
      this.toast.timer -= dt;
      if (this.toast.timer <= 0) this.toast = null;
    }
    this.cashFlash = Math.max(0, this.cashFlash - dt);
    this.dayPhase = mod(this.dayPhase + dt / TIME.cycleSeconds, 1);

    if (this.state === 'menu') {
      if (this.input.wasPressed('Enter') || this.input.wasPressed('NumpadEnter')) {
        this.startNew();
      } else if (this.input.wasPressed('KeyC') && this.hasSave) {
        this.continueGame();
      }
      return;
    }
    if (this.state === 'paused') {
      if (this.input.wasPressed('Escape')) {
        this.state = 'playing';
        this.announce('Resumed.');
      } else if (this.input.wasPressed('KeyM')) {
        this.returnToMenu();
      }
      return;
    }
    if (this.state === 'gameover' || this.state === 'victory') {
      if (this.input.wasPressed('Enter') || this.input.wasPressed('NumpadEnter')) {
        this.startNew();
      } else if (this.input.wasPressed('KeyM')) {
        this.returnToMenu();
      }
      return;
    }
    if (this.state !== 'playing') return;
    this.updatePlaying(dt);
  }

  updatePlaying(dt) {
    if (this.freeze) return;
    this.playTime += dt;
    this.player.fireCooldown = Math.max(0, this.player.fireCooldown - dt);
    this.roadHitTimer = Math.max(0, this.roadHitTimer - dt);

    if (this.input.wasPressed('Escape')) {
      this.state = 'paused';
      this.input.mouse.down = false;
      this.saveGame();
      this.announce('Paused. Press Escape to resume.');
      return;
    }

    this.handleEnterExit();

    if (this.player.vehicle) {
      this.updateDriving(dt);
    } else {
      this.player.updateOnFoot(dt, this.input, this.city);
      this.player.hurtFlash = Math.max(0, this.player.hurtFlash - dt);
    }
    this.player.syncToVehicle();
    this.updateAim();
    this.handleShooting();
    this.updateEnterPrompt();

    this.updateTraffic(dt);
    this.updatePolice(dt);
    this.updatePeds(dt);
    this.resolveVehicleCollisions();
    this.combat.update(dt);
    this.updateWanted(dt);
    this.missions.update(dt, this);

    this.cleanup(dt);
    this.autoSave(dt);

    if (this.player.dead || this.player.health <= 0) {
      this.onPlayerDeath();
      return;
    }
    if (this.missions.finished) {
      this.win();
    }
  }

  updateAim() {
    const dx = this.input.mouse.worldX - this.player.x;
    const dy = this.input.mouse.worldY - this.player.y;
    if (dx * dx + dy * dy > 16) {
      this.player.aimAngle = Math.atan2(dy, dx);
    }
  }

  handleShooting() {
    if (this.player.dead) return;
    if (this.player.fireCooldown > 0) return;
    const onFoot = !this.player.vehicle;
    const wants = this.input.mouse.down || (onFoot && this.input.isDown('Space'));
    if (!wants) return;
    const spread = onFoot ? 0.035 : 0.2;
    const angle = this.player.aimAngle + (Math.random() - 0.5) * spread;
    this.combat.playerShoot(this.player.x, this.player.y, angle);
    this.player.fireCooldown = onFoot ? PLAYER.fireCooldown : 0.2;
  }

  handleEnterExit() {
    if (!this.input.wasPressed('KeyE')) return;
    if (this.player.vehicle) {
      const car = this.player.vehicle;
      if (car.z > 25) {
        this.showToast('NOT WHILE AIRBORNE', 1.6);
        return;
      }
      const fast = Math.abs(car.forwardSpeed) > 190;
      this.player.exit(this.city);
      car.ai = false;
      car.parked = true;
      car.vx *= 0.35;
      car.vy *= 0.35;
      if (fast) {
        this.player.takeDamage(5);
        this.combat.spawnDust(this.player.x, this.player.y, 6);
      }
      this.enterPrompt = null;
      this.announce('On foot.');
      return;
    }
    const car = nearestVehicle(this.player.x, this.player.y, this.vehicles, 76, (v) => !v.destroyed && v.z < 20);
    if (!car) return;
    this.enterVehicle(car);
  }

  enterVehicle(car) {
    const hadDriver = car.ai && !car.parked;
    if (hadDriver) {
      const driver = new Pedestrian(car.x + Math.cos(car.angle + Math.PI / 2) * 38, car.y + Math.sin(car.angle + Math.PI / 2) * 38, {
        shirt: '#c45577',
      });
      driver.panic(this.player.x, this.player.y, 4);
      this.peds.push(driver);
    }
    if (!car.hasBeenStolen) {
      car.hasBeenStolen = true;
      this.stats.carsStolen += 1;
      this.addWanted(car.police ? CRIME.policeCarSteal : CRIME.carjack);
      this.showToast(hadDriver ? 'CARJACKED' : 'VEHICLE STOLEN', 2);
    }
    car.parked = false;
    car.ai = false;
    car.target = null;
    car.occupied = true;
    this.player.enter(car);
    this.player.aimAngle = car.angle;
    this.enterPrompt = null;
    this.renderer.snapTo(this.player.x, this.player.y);
    this.announce(`Driving ${car.name}.`);
  }

  updateEnterPrompt() {
    if (this.player.vehicle || this.player.dead) {
      this.enterPrompt = null;
      return;
    }
    this.enterPrompt = nearestVehicle(this.player.x, this.player.y, this.vehicles, 76, (v) => !v.destroyed && v.z < 20);
  }

  updateDriving(dt) {
    const car = this.player.vehicle;
    const up = this.input.isDown('KeyW') || this.input.isDown('ArrowUp');
    const down = this.input.isDown('KeyS') || this.input.isDown('ArrowDown');
    const left = this.input.isDown('KeyA') || this.input.isDown('ArrowLeft');
    const right = this.input.isDown('KeyD') || this.input.isDown('ArrowRight');
    const throttle = (up ? 1 : 0) - (down ? 1 : 0);
    const steer = (right ? 1 : 0) - (left ? 1 : 0);
    const handbrake = this.input.isDown('Space');
    car.update(dt, { throttle, steer, handbrake }, this.city, this);
    this.player.syncToVehicle();
    this.player.hurtFlash = Math.max(0, this.player.hurtFlash - dt);
    if (this.input.wasPressed('KeyR')) {
      const station = this.radio.cycle();
      this.showToast(`${station.frequency} · ${station.name} — “${station.track}”`, 2.6);
    }
    // Smoke from a badly damaged engine.
    if (car.health < car.maxHealth * 0.35 && !car.destroyed && Math.random() < 0.2) {
      this.combat.pushParticle({
        x: car.x + Math.cos(car.angle) * 20,
        y: car.y + Math.sin(car.angle) * 20,
        vx: (Math.random() - 0.5) * 20,
        vy: -20 - Math.random() * 20,
        life: 0.6 + Math.random() * 0.4,
        maxLife: 1,
        size: 5 + Math.random() * 5,
        color: 'rgba(60,54,58,0.5)',
        gravity: -20,
        drag: 0.98,
        fade: true,
      });
    }
  }

  updateTraffic(dt) {
    this.trafficTimer -= dt;
    let liveAi = 0;
    for (const v of this.vehicles) {
      if (v.destroyed || v.parked || !v.ai || v === this.player.vehicle) continue;
      liveAi += 1;
      if (!v.target || v.target.invalid) {
        v.target = chooseTrafficTarget(v, this.city, Math.random);
      }
      const d = dist(v.x, v.y, v.target.x, v.target.y);
      if (d < 70) {
        v.target = chooseTrafficTarget(v, this.city, Math.random);
      }
      // Brake for the player's car if it is directly ahead.
      let throttle = 0.42;
      if (this.player.vehicle) {
        const dx = this.player.vehicle.x - v.x;
        const dy = this.player.vehicle.y - v.y;
        const dd = Math.hypot(dx, dy);
        const ahead = dx * Math.cos(v.angle) + dy * Math.sin(v.angle);
        if (dd < 110 && ahead > 20) throttle = -0.5;
      }
      const reached = v.driveToward(v.target.x, v.target.y, dt, this.city, this, {
        throttle,
        canReverse: false,
        stopDistance: 30,
      });
      if (reached) v.target = null;
      if (v.stuckTimer > 2.2) v.target = chooseTrafficTarget(v, this.city, Math.random);
      if (v.stuckTimer > 6.5) {
        const point = randomRoadPoint(Math.random, this.city);
        v.x = point.x;
        v.y = point.y;
        v.angle = point.angle;
        v.vx = 0;
        v.vy = 0;
        v.stuckTimer = 0;
        v.target = chooseTrafficTarget(v, this.city, Math.random);
      }
    }
    if (liveAi < TRAFFIC.count && this.trafficTimer <= 0) {
      this.trafficTimer = TRAFFIC.spawnInterval;
      this.spawnTraffic(1, 900);
    }
  }

  updatePolice(dt) {
    this.policeSpawnTimer -= dt;
    if (this.wanted > 0) {
      const targetCops = Math.min(POLICE.maxUnits, 1 + Math.floor(this.wanted * 0.9));
      const active = this.police.filter((c) => !c.destroyed).length;
      if (active < targetCops && this.policeSpawnTimer <= 0) {
        this.policeSpawnTimer = POLICE.spawnInterval;
        this.spawnCop();
      }
    } else {
      this.policeSpawnTimer = 0;
    }

    for (const cop of this.police) {
      if (cop.destroyed) {
        cop.explosionTimer += dt;
        continue;
      }
      cop.pursuitUpdate(dt, this.player, this.city, this);
      const d = dist(cop.x, cop.y, this.player.x, this.player.y);
      if (this.player.vehicle) {
        if (d < cop.r + this.player.vehicle.r + 4 && cop.speed > 55 && cop.ramCooldown <= 0) {
          cop.ramCooldown = POLICE.ramCooldown;
          this.player.vehicle.vx += Math.cos(cop.angle) * 70;
          this.player.vehicle.vy += Math.sin(cop.angle) * 70;
          this.combat.spawnSparks(this.player.x, this.player.y, 8);
          this.shake(4);
          if (this.player.vehicle.damage(POLICE.ramDamage)) {
            this.onVehicleDestroyed(this.player.vehicle, false);
          }
        }
      } else if (d < 44 && cop.speed > 36 && cop.ramCooldown <= 0 && this.roadHitTimer <= 0) {
        cop.ramCooldown = POLICE.ramCooldown;
        this.roadHitTimer = 0.8;
        const a = Math.atan2(this.player.y - cop.y, this.player.x - cop.x);
        this.player.x += Math.cos(a) * 24;
        this.player.y += Math.sin(a) * 24;
        this.combat.spawnBlood(this.player.x, this.player.y, 5, a);
        this.shake(6);
        if (this.player.takeDamage(12)) {
          this.onPlayerDeath();
          return;
        }
      }
    }
  }

  updatePeds(dt) {
    this.pedTimer -= dt;
    let alive = 0;
    for (const ped of this.peds) {
      if (ped.alive) alive += 1;
      ped.update(dt, this.city, this);
    }
    // Vehicles run people over.
    const cars = [...this.vehicles, ...this.police];
    for (const ped of this.peds) {
      if (!ped.alive) continue;
      for (const v of cars) {
        if (v.destroyed || v.speed < 70) continue;
        if (dist(v.x, v.y, ped.x, ped.y) < v.r + ped.r + 3) {
          if (ped.takeDamage(120)) {
            this.combat.spawnBlood(ped.x, ped.y, 12, v.angle);
            this.combat.spawnDust(ped.x, ped.y, 4);
            this.onPedestrianKilled(ped, v === this.player.vehicle);
          } else {
            ped.panic(v.x, v.y, 3);
          }
          break;
        }
      }
      // The player can be hit by traffic too.
      if (this.player.onFoot && !this.player.dead && this.roadHitTimer <= 0) {
        for (const v of cars) {
          if (v.destroyed || v.speed < 90) continue;
          if (dist(v.x, v.y, this.player.x, this.player.y) < v.r + this.player.r + 2) {
            this.roadHitTimer = 0.7;
            const a = Math.atan2(this.player.y - v.y, this.player.x - v.x);
            this.player.x += Math.cos(a) * 20;
            this.player.y += Math.sin(a) * 20;
            this.shake(6);
            if (this.player.takeDamage(18)) {
              this.onPlayerDeath();
              return;
            }
            break;
          }
        }
      }
    }

    // Keep the sidewalks from emptying out.
    if (alive < PEDESTRIANS.count && this.pedTimer <= 0) {
      this.pedTimer = 2.2;
      this.spawnPedestrian();
    }
  }

  resolveVehicleCollisions() {
    const all = [];
    for (const v of this.vehicles) if (!v.destroyed) all.push(v);
    for (const v of this.police) if (!v.destroyed) all.push(v);
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        const a = all[i];
        const b = all[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = a.r + b.r;
        if (d >= min || d === 0) continue;
        const nx = dx / d;
        const ny = dy / d;
        const overlap = min - d;
        // Heavier player car pushes traffic a touch less.
        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel > 55) {
          const impulse = rel * 0.55;
          a.vx -= nx * impulse;
          a.vy -= ny * impulse;
          b.vx += nx * impulse;
          b.vy += ny * impulse;
          this.combat.spawnSparks((a.x + b.x) / 2, (a.y + b.y) / 2, 5);
          const byPlayerCar = a === this.player.vehicle || b === this.player.vehicle;
          const dmg = clamp(rel * 0.09, 3, 34);
          if (a.damage(dmg)) this.onVehicleDestroyed(a, byPlayerCar);
          if (b.damage(dmg)) this.onVehicleDestroyed(b, byPlayerCar);
          if (byPlayerCar) this.shake(3);
        }
      }
    }
  }

  cleanup(dt) {
    for (const v of this.vehicles) if (v.destroyed) v.explosionTimer += dt;
    for (const v of this.police) if (v.destroyed) v.explosionTimer += dt;
    this.vehicles = this.vehicles.filter((v) => !(v.destroyed && v.explosionTimer > 5));
    this.police = this.police.filter((v) => !(v.destroyed && v.explosionTimer > 5));
    this.peds = this.peds.filter((p) => p.alive || p.deathTimer < 11);
    if (this.peds.length > 70) {
      this.peds.splice(0, this.peds.length - 70);
    }
  }

  autoSave(dt) {
    this.saveTimer += dt;
    if (this.saveTimer >= TIME.autosaveSeconds) {
      this.saveTimer = 0;
      this.saveGame();
    }
  }

  shake(amount) {
    this.combat.shake = Math.max(this.combat.shake, amount);
  }

  // --- callbacks from combat / vehicles ------------------------------------

  onVehicleDestroyed(vehicle, byPlayer) {
    if (vehicle._exploded) return;
    vehicle._exploded = true;
    this.stats.carsDestroyed += 1;
    this.combat.explode(vehicle.x, vehicle.y, VEHICLE.explosionRadius, VEHICLE.explosionDamage, byPlayer ? 'player' : 'world');
    if (this.player.vehicle === vehicle) {
      this.player.exit(this.city);
      vehicle.driver = null;
      vehicle.occupied = false;
      if (this.player.takeDamage(32)) {
        this.onPlayerDeath();
      } else {
        this.showToast('GET OUT — IT’S GOING UP', 2.4);
      }
    }
    if (byPlayer) this.addWanted(CRIME.explosion);
    this.announce('A vehicle exploded.');
  }

  onPedestrianKilled(ped, byPlayer) {
    if (byPlayer) {
      this.stats.kills += 1;
      this.addWanted(CRIME.pedestrianKill);
    }
    if (ped.alive === false) ped.deathTimer = Math.min(ped.deathTimer, 0.01);
  }

  onPoliceAttacked() {
    this.addWanted(CRIME.policeHit);
  }

  onGunshot() {
    this.shake(1.4);
  }

  onVehicleLand(vehicle, impact) {
    if (impact > 200) {
      this.combat.spawnDust(vehicle.x, vehicle.y, Math.min(18, impact / 30));
      vehicle.damage((impact - 170) * 0.08);
    }
  }

  onRampLaunch(vehicle) {
    if (vehicle === this.player.vehicle) {
      this.showToast('AIRBORNE', 1.1);
    }
  }

  onExplosion() {
    this.shake(7);
    this.announce('Explosion.');
  }

  onMissionComplete(mission, reward) {
    this.cashFlash = 1.6;
    this.player.heal(15);
    this.showToast(`+ $${reward.toLocaleString('en-US')}`, 3);
  }

  // --- render --------------------------------------------------------------

  render(dt) {
    this.renderer.render(this, dt);
    const ctx = this.renderer.ctx;
    if (this.state === 'menu') {
      this.hud.drawStart(ctx, {
        hasSave: this.hasSave,
        summary: this.summary,
        intro: STORY_INTRO,
      });
    } else if (this.state === 'playing') {
      this.hud.draw(ctx, this);
    } else if (this.state === 'paused') {
      this.hud.draw(ctx, this);
      this.hud.drawPause(ctx, this);
    } else if (this.state === 'gameover') {
      this.hud.drawGameOver(ctx, this);
    } else if (this.state === 'victory') {
      this.hud.drawVictory(ctx, this);
    }
    this.hud.update(dt);
  }

  // --- screenshot staging --------------------------------------------------

  setupPlayShot() {
    this.startNew();
    this.state = 'playing';
    const city = this.city;
    const car = new Vehicle({
      x: city.roadXs[3] - 300,
      y: city.roadYs[2] + city.laneOffset,
      angle: 0,
      color: '#ff4f6d',
      name: 'Marina GT',
      type: 'coupe',
      health: 190,
    });
    car.hasBeenStolen = true;
    car.vx = 118;
    this.vehicles.push(car);
    this.player.enter(car);
    this.player.cash = 3450;
    this.player.health = 82;
    this.dayPhase = 0.205;
    this.playTime = 97;
    this.setWanted(3);
    this.stats.carsStolen = 2;
    this.stats.kills = 3;
    this.missions.begin(2, this);
    this.missions.banner = null;
    this.missions.bannerTimer = 0;
    this.missions.timeLeft = 83;
    this.radio.switchTo(0);
    this.freeze = true;
    this.renderer.snapTo(car.x, car.y);
    this.renderer.camera.zoom = 0.95;
    this.renderer.cameraZoomOverride = 0.95;

    const cop1 = new PoliceCar(car.x - 300, city.roadYs[2] + city.laneOffset - 62, 0);
    cop1.sirenOn = true;
    cop1.sirenPhase = 0.4;
    const cop2 = new PoliceCar(car.x - 160, city.roadYs[2] + city.laneOffset + 58, 0);
    cop2.sirenOn = true;
    cop2.sirenPhase = 2.1;
    this.police.push(cop1, cop2);

    const trafficCar = new Vehicle({
      x: car.x + 340,
      y: city.roadYs[2] - city.laneOffset,
      angle: Math.PI,
      color: '#e0b04c',
      name: 'Crosstown',
      parked: true,
      ai: false,
    });
    trafficCar.vx = 0;
    this.vehicles.push(trafficCar);

    // A crowd on the south sidewalk for scale.
    for (let i = 0; i < 7; i += 1) {
      const ped = new Pedestrian(car.x + 90 + i * 34, city.roadYs[2] + city.roadWidth / 2 + 22, {
        shirt: ['#e0a24c', '#6fc4d8', '#c4688a', '#7b8fd0'][i % 4],
      });
      ped.angle = -Math.PI / 2;
      this.peds.push(ped);
    }
  }

  setupEndShot() {
    this.startNew();
    this.state = 'victory';
    this.player.cash = 22400;
    this.player.health = 88;
    this.stats.missionsDone = 6;
    this.playTime = 1462;
    this.wanted = 0;
    this.police.length = 0;
    this.dayPhase = 0.235;
    this.missions.index = 5;
    this.missions.phase = 'done';
    this.missions.finished = true;
    this.missions.target = null;
    this.missions.banner = null;
    this.missions.bannerTimer = 0;
    this.player.x = this.city.locations.docks.x;
    this.player.y = this.city.locations.docks.y - 160;
    this.renderer.snapTo(this.player.x, this.player.y);
    this.renderer.camera.zoom = 0.95;
    this.enterPrompt = null;
  }
}

const canvas = document.getElementById('game');
if (canvas) {
  // A friendly error line if a module blows up at runtime, instead of a silent
  // black screen. This stays out of the game itself.
  window.addEventListener('error', (event) => {
    const status = document.getElementById('status');
    if (status) status.textContent = `Error: ${event.message}`;
  });
  const game = new Game(canvas);
  window.__viceHarbor = game;
}