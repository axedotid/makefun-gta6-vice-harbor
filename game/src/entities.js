// Player, pedestrians, traffic vehicles and police cruisers.
// Physics is deliberately arcade-flavoured: grip, drift, ramps and a little
// bounce off the city's concrete.

import { PLAYER, VEHICLE, POLICE, PEDESTRIANS, PALETTE } from './config.js';
import { clamp, lerp, dist, angleDelta } from './random.js';
import { resolveCircleRect, circleHitsBuilding, rampAt, randomRoadPoint } from './world.js';

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = PLAYER.radius;
    this.angle = -Math.PI / 2;
    this.aimAngle = this.angle;
    this.vx = 0;
    this.vy = 0;
    this.health = PLAYER.maxHealth;
    this.maxHealth = PLAYER.maxHealth;
    this.cash = PLAYER.startCash;
    this.wanted = 0;
    this.onFoot = true;
    this.vehicle = null;
    this.walkPhase = 0;
    this.moving = false;
    this.sprinting = false;
    this.fireCooldown = 0;
    this.hurtFlash = 0;
    this.dead = false;
    this.lastVehicle = null;
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  updateOnFoot(dt, input, city) {
    if (!this.onFoot) return;
    let dx = 0;
    let dy = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) dy -= 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) dy += 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) dx -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) dx += 1;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len;
      dy /= len;
    }
    this.sprinting = len > 0 && (input.isDown('ShiftLeft') || input.isDown('ShiftRight'));
    const speed = this.sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    const targetVx = dx * speed;
    const targetVy = dy * speed;
    const blend = 1 - Math.exp(-14 * dt);
    this.vx = lerp(this.vx, targetVx, blend);
    this.vy = lerp(this.vy, targetVy, blend);
    moveAndCollide(this, dt, city);
    this.moving = len > 0 && Math.hypot(this.vx, this.vy) > 8;
    this.walkPhase += Math.hypot(this.vx, this.vy) * dt * 0.13;
    if (!this.moving) {
      this.vx *= Math.exp(-8 * dt);
      this.vy *= Math.exp(-8 * dt);
    }
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
  }

  enter(vehicle) {
    this.vehicle = vehicle;
    this.onFoot = false;
    this.lastVehicle = vehicle;
    vehicle.driver = this;
    vehicle.occupied = true;
    vehicle.ai = false;
    this.x = vehicle.x;
    this.y = vehicle.y;
    this.vx = 0;
    this.vy = 0;
  }

  exit(city) {
    const vehicle = this.vehicle;
    if (!vehicle) return false;
    const side = this.angleFromVehicle(vehicle, 1);
    let pos = side;
    let guard = 0;
    while (circleHitsBuilding(pos.x, pos.y, this.r + 1, city) && guard < 4) {
      pos = this.angleFromVehicle(vehicle, guard % 2 === 0 ? -1 : 1, 22 + guard * 12);
      guard += 1;
    }
    this.x = clamp(pos.x, 24, city.size - 24);
    this.y = clamp(pos.y, 24, city.size - 24);
    this.angle = vehicle.angle;
    this.aimAngle = this.angle;
    this.vx = 0;
    this.vy = 0;
    this.onFoot = true;
    this.vehicle = null;
    vehicle.driver = null;
    vehicle.occupied = false;
    vehicle.ai = false;
    vehicle.handbrake = false;
    return true;
  }

  angleFromVehicle(vehicle, side, extra = 34) {
    const a = vehicle.angle + Math.PI / 2;
    return {
      x: vehicle.x + Math.cos(a) * side * (vehicle.r + extra),
      y: vehicle.y + Math.sin(a) * side * (vehicle.r + extra),
    };
  }

  takeDamage(amount) {
    if (this.dead) return false;
    this.health = Math.max(0, this.health - amount);
    this.hurtFlash = 0.35;
    if (this.health <= 0) {
      this.dead = true;
      return true;
    }
    return false;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  syncToVehicle() {
    if (!this.vehicle) return;
    this.x = this.vehicle.x;
    this.y = this.vehicle.y;
    this.angle = this.vehicle.angle;
  }
}

// A small shared movement + collision routine for walking actors.
function moveAndCollide(actor, dt, city) {
  actor.x += actor.vx * dt;
  for (const b of city.buildings) {
    const hit = resolveCircleRect(actor.x, actor.y, actor.r, b);
    if (hit) {
      actor.x = hit.x;
      actor.y = hit.y;
      if (Math.abs(hit.nx) > Math.abs(hit.ny)) actor.vx *= 0.15;
      else actor.vy *= 0.15;
    }
  }
  actor.y += actor.vy * dt;
  for (const b of city.buildings) {
    const hit = resolveCircleRect(actor.x, actor.y, actor.r, b);
    if (hit) {
      actor.x = hit.x;
      actor.y = hit.y;
      if (Math.abs(hit.ny) > 0.5) actor.vy *= 0.15;
      else actor.vx *= 0.15;
    }
  }
  const m = actor.r + 2;
  actor.x = clamp(actor.x, m, city.size - m);
  actor.y = clamp(actor.y, m, city.size - m);
}

export class Vehicle {
  constructor(options = {}) {
    this.x = options.x ?? 0;
    this.y = options.y ?? 0;
    this.angle = options.angle ?? 0;
    this.vx = options.vx ?? 0;
    this.vy = options.vy ?? 0;
    this.z = 0;
    this.vz = 0;
    this.r = options.police ? POLICE.radius : VEHICLE.radius;
    this.color = options.color ?? PALETTE.building[0];
    this.name = options.name ?? 'Sedan';
    this.type = options.type ?? 'sedan';
    this.police = Boolean(options.police);
    this.missionTag = options.missionTag ?? null;
    this.health = options.health ?? (this.police ? POLICE.maxHealth : VEHICLE.maxHealth);
    this.maxHealth = this.health;
    this.driver = null;
    this.occupied = false;
    this.ai = options.ai ?? !options.parked;
    this.parked = Boolean(options.parked);
    this.destroyed = false;
    this.explosionTimer = 0;
    this.skidTimer = 0;
    this.stuckTimer = 0;
    this.wheelAngle = 0;
    this.onRamp = false;
    this.justLanded = 0;
    this.throttleSmoke = 0;
    this.target = null;
    this.cruiseAngle = this.angle;
    this.headlightPhase = 0;
    this.sirenPhase = Math.random() * Math.PI * 2;
    this.lastCollision = 0;
    this.speedAtCollision = 0;
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  get forwardSpeed() {
    return this.vx * Math.cos(this.angle) + this.vy * Math.sin(this.angle);
  }

  get airborne() {
    return this.z > 0.5 || this.vz > 1;
  }

  setParked(x, y, angle) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.vx = 0;
    this.vy = 0;
    this.parked = true;
    this.ai = false;
    this.target = null;
  }

  update(dt, controls, city, game) {
    if (this.destroyed) {
      this.explosionTimer += dt;
      this.vx *= Math.exp(-3 * dt);
      this.vy *= Math.exp(-3 * dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      return;
    }
    const throttle = clamp(controls.throttle ?? 0, -1, 1);
    const steer = clamp(controls.steer ?? 0, -1, 1);
    const handbrake = Boolean(controls.handbrake);
    const maxSpeed = this.police ? POLICE.maxSpeed : VEHICLE.maxSpeed;
    const accel = this.police ? POLICE.acceleration : VEHICLE.acceleration;

    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    let fwd = this.vx * c + this.vy * s;
    let lat = -this.vx * s + this.vy * c;

    const onGround = !this.airborne;
    if (onGround) {
      if (throttle > 0) {
        if (fwd < 0) fwd += VEHICLE.brakeForce * dt * throttle;
        else fwd += accel * throttle * dt;
      } else if (throttle < 0) {
        if (fwd > 0) fwd += VEHICLE.brakeForce * dt * throttle;
        else fwd += VEHICLE.reverseAcceleration * throttle * dt;
      }
      if (handbrake) fwd *= Math.exp(-1.8 * dt);
      else fwd *= Math.exp(-VEHICLE.rollingDrag * 0.14 * dt);
      fwd = clamp(fwd, -VEHICLE.reverseSpeed, maxSpeed);

      // Tyres slide when the handbrake is on or the car is thrown sideways.
      const grip = handbrake ? VEHICLE.handbrakeGrip : VEHICLE.lateralGrip;
      lat *= Math.pow(1 - grip, dt * 60);

      if (Math.abs(fwd) > 14) {
        const speedFactor = clamp(Math.abs(fwd) / maxSpeed, 0.08, 1);
        const steering = VEHICLE.steerRate * (handbrake ? 1.18 : 1) * speedFactor;
        const direction = fwd >= 0 ? 1 : -1;
        this.angle += steer * steering * direction * dt;
        lat += steer * Math.abs(fwd) * 0.22 * dt * (handbrake ? 1.5 : 1) * direction;
      }
      this.wheelAngle = lerp(this.wheelAngle, steer * 0.45, 1 - Math.exp(-10 * dt));
    } else {
      fwd *= Math.exp(-0.08 * dt);
    }

    const nc = Math.cos(this.angle);
    const ns = Math.sin(this.angle);
    this.vx = nc * fwd - ns * lat;
    this.vy = ns * fwd + nc * lat;

    // Skid marks under hard cornering and handbrake stops.
    if (onGround && (handbrake || Math.abs(lat) > 70) && Math.abs(fwd) > 55) {
      this.skidTimer -= dt;
      if (this.skidTimer <= 0) {
        this.skidTimer = 0.035;
        game.combat?.addSkid(this.x, this.y, this.angle, Math.abs(lat) / 260);
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.collideBuildings(dt, game);
    this.handleRamp(dt, game);

    if (this.airborne) {
      this.z += this.vz * dt;
      this.vz -= VEHICLE.gravity * dt;
      if (this.z <= 0) {
        const impact = -this.vz;
        this.z = 0;
        this.vz = 0;
        this.justLanded = impact;
        if (impact > 120) {
          game.combat?.spawnDust(this.x, this.y, 10);
          game.onVehicleLand?.(this, impact);
        }
      }
    }

    if (Math.abs(fwd) < 2 && Math.abs(throttle) > 0.4) {
      this.stuckTimer += dt;
    } else {
      this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2);
    }
    this.headlightPhase += dt;
    this.sirenPhase += dt * 7;
  }

  collideBuildings(dt, game) {
    for (const b of game.city.buildings) {
      const hit = resolveCircleRect(this.x, this.y, this.r, b);
      if (!hit) continue;
      this.x = hit.x;
      this.y = hit.y;
      const dot = this.vx * hit.nx + this.vy * hit.ny;
      if (dot < 0) {
        const impact = Math.abs(dot);
        this.vx -= (1.35 * dot * hit.nx);
        this.vy -= (1.35 * dot * hit.ny);
        this.vx *= 0.62;
        this.vy *= 0.62;
        if (impact > 130) {
          this.damage((impact - 120) * VEHICLE.collisionDamage);
          game.combat?.spawnSparks(this.x + hit.nx * this.r, this.y + hit.ny * this.r, 6);
          if (impact > 240) game.shake?.(Math.min(9, impact / 60));
        }
      }
    }
    const margin = this.r + 6;
    if (this.x < margin || this.x > game.city.size - margin) {
      this.x = clamp(this.x, margin, game.city.size - margin);
      this.vx *= -0.35;
    }
    if (this.y < margin || this.y > game.city.size - margin) {
      this.y = clamp(this.y, margin, game.city.size - margin);
      this.vy *= -0.35;
    }
    void dt;
  }

  handleRamp(dt, game) {
    const info = rampAt(this.x, this.y, game.city);
    if (info && !this.airborne) {
      const footHeight = info.progress * info.ramp.height;
      this.z = Math.max(this.z, footHeight);
      this.onRamp = true;
      this.rampProgress = info.progress;
      if (info.progress > 0.94 && this.forwardSpeed > 130 && this.vz <= 0) {
        this.z = info.ramp.height;
        this.vz = Math.min(330, this.forwardSpeed * 0.62 + 50);
        this.onRamp = false;
        game.combat?.spawnDust(this.x, this.y, 8);
        game.onRampLaunch?.(this);
      }
    } else if (this.onRamp && !info) {
      this.onRamp = false;
      if (this.forwardSpeed > 100) {
        this.z = Math.max(this.z, 10);
        this.vz = Math.min(300, this.forwardSpeed * 0.42 + 40);
      }
    }
    if (!this.airborne && !info) this.z = 0;
    void dt;
  }

  driveToward(tx, ty, dt, city, game, options = {}) {
    const canReverse = options.canReverse ?? false;
    const d = dist(this.x, this.y, tx, ty);
    if (d < (options.stopDistance ?? 34)) {
      this.update(dt, { throttle: 0, steer: 0 }, city, game);
      return true;
    }
    const desired = Math.atan2(ty - this.y, tx - this.x);
    const err = angleDelta(this.angle, desired);
    let steer = clamp(err * 2.4, -1, 1);
    const speed = this.forwardSpeed;
    let throttle = options.throttle ?? 0.62;
    if (Math.abs(err) > 1.35) {
      throttle = speed > 55 ? -0.65 : 0.42;
      if (speed > 55) steer = clamp(err * 2.4, -1, 1);
    } else if (Math.abs(err) > 0.7) {
      throttle = Math.min(throttle, speed > 120 ? 0.22 : 0.45);
    }
    if (this.stuckTimer > 1.4 && canReverse) {
      throttle = -0.8;
      steer = -Math.sign(err || 1);
    }
    this.update(dt, { throttle, steer, handbrake: false }, city, game);
    return false;
  }

  damage(amount) {
    if (this.destroyed) return false;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.destroyed = true;
      this.explosionTimer = 0;
      return true;
    }
    return false;
  }

  // Directional damage used by the combat system when a bullet connects.
  hits(x, y, padding = 0) {
    return dist(x, y, this.x, this.y) < this.r + padding + (this.airborne ? 4 : 0);
  }
}

export class PoliceCar extends Vehicle {
  constructor(x, y, angle) {
    super({
      x,
      y,
      angle,
      color: PALETTE.policeBody,
      name: 'HCPD Cruiser',
      type: 'police',
      police: true,
      ai: true,
      health: POLICE.maxHealth,
    });
    this.sirenOn = false;
    this.ramCooldown = 0;
    this.officer = true;
  }

  pursuitUpdate(dt, target, city, game) {
    this.ramCooldown = Math.max(0, this.ramCooldown - dt);
    this.sirenOn = game.wanted > 0;
    if (!target) {
      this.update(dt, { throttle: 0, steer: 0 }, city, game);
      return;
    }
    const d = dist(this.x, this.y, target.x, target.y);
    let tx = target.x;
    let ty = target.y;
    // If a building sits directly in the way, aim for the road line first so
    // cruisers loop around corners instead of grinding into a wall.
    const desired = Math.atan2(target.y - this.y, target.x - this.x);
    if (!clearPath(this.x, this.y, desired, Math.min(180, d), city)) {
      const roadX = nearestRoad(this.x, city.roadXs);
      const roadY = nearestRoad(this.y, city.roadYs);
      const toX = nearestRoad(target.x, city.roadXs);
      const toY = nearestRoad(target.y, city.roadYs);
      if (Math.abs(this.x - roadX) > Math.abs(this.y - roadY)) {
        tx = roadX;
        ty = roadY + (target.y > this.y ? city.tile * 0.5 : -city.tile * 0.5);
      } else {
        tx = roadX + (target.x > this.x ? city.tile * 0.5 : -city.tile * 0.5);
        ty = roadY;
      }
      if (Math.abs(toX - this.x) + Math.abs(toY - this.y) < 80) {
        tx = toX;
        ty = toY;
      }
    }
    const distance = dist(this.x, this.y, tx, ty);
    const throttle = distance < 120 ? 0.38 : d < 420 ? 0.85 : 1;
    this.driveToward(tx, ty, dt, city, game, { throttle, canReverse: true, stopDistance: 26 });
    if (d < this.r + 30 && this.speed > 60) {
      // Main handles the actual ram damage on contact; this just marks intent.
      this.ramming = true;
    } else {
      this.ramming = false;
    }
  }
}

export class Pedestrian {
  constructor(x, y, options = {}) {
    this.x = x;
    this.y = y;
    this.r = PEDESTRIANS.radius;
    this.angle = options.angle ?? Math.random() * Math.PI * 2;
    this.vx = 0;
    this.vy = 0;
    this.health = PEDESTRIANS.maxHealth;
    this.maxHealth = PEDESTRIANS.maxHealth;
    this.alive = true;
    this.deathTimer = 0;
    this.fleeTimer = 0;
    this.threatX = 0;
    this.threatY = 0;
    this.target = null;
    this.idleTimer = Math.random() * 2;
    this.walkPhase = Math.random() * Math.PI * 2;
    this.shirt = options.shirt ?? PALETTE.building[0];
    this.skin = options.skin ?? '#c68d6f';
    this.speed = PEDESTRIANS.walkSpeed * (options.speedFactor ?? 1);
    this.fleeing = false;
  }

  update(dt, city, game) {
    if (!this.alive) {
      this.deathTimer += dt;
      return;
    }
    this.fleeTimer = Math.max(0, this.fleeTimer - dt);
    if (this.fleeTimer > 0) {
      this.fleeing = true;
      const dx = this.x - this.threatX;
      const dy = this.y - this.threatY;
      const len = Math.hypot(dx, dy) || 1;
      this.vx = (dx / len) * PEDESTRIANS.fleeSpeed;
      this.vy = (dy / len) * PEDESTRIANS.fleeSpeed;
      this.angle = Math.atan2(this.vy, this.vx);
      this.walkPhase += dt * 15;
    } else {
      this.fleeing = false;
      if (!this.target || dist(this.x, this.y, this.target.x, this.target.y) < 16) {
        this.idleTimer -= dt;
        if (this.idleTimer <= 0 || !this.target) {
          this.pickTarget(city, game);
          this.idleTimer = 1 + Math.random() * 4;
        }
      }
      if (this.target) {
        const desired = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        this.angle += clamp(angleDelta(this.angle, desired), -3 * dt, 3 * dt);
        this.vx = Math.cos(this.angle) * this.speed;
        this.vy = Math.sin(this.angle) * this.speed;
        this.walkPhase += dt * 7;
      } else {
        this.vx *= Math.exp(-5 * dt);
        this.vy *= Math.exp(-5 * dt);
      }
      // Run from gunfire or a moving car about to hit them.
      for (const v of game.vehicles) {
        if (v.destroyed || v === game.player.vehicle) continue;
        if (dist(this.x, this.y, v.x, v.y) < 90 && v.speed > 150) {
          this.panic(this.x + Math.cos(this.angle) * -100, this.y + Math.sin(this.angle) * -100, 1.4);
          break;
        }
      }
    }
    moveAndCollide(this, dt, city);
    if (this.x < 20 || this.y < 20 || this.x > city.size - 20 || this.y > city.size - 20) {
      this.x = clamp(this.x, 20, city.size - 20);
      this.y = clamp(this.y, 20, city.size - 20);
    }
    this.vx *= 0.98;
    this.vy *= 0.98;
  }

  pickTarget(city, game) {
    const points = city.spawnPoints.pedestrians;
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < 12; i += 1) {
      const p = points[Math.floor(Math.random() * points.length)];
      const d = dist(this.x, this.y, p.x, p.y);
      if (d > 40 && d < 340) {
        best = p;
        bestDist = d;
        break;
      }
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    this.target = best ? { x: best.x, y: best.y } : null;
    void game;
  }

  panic(x, y, duration = 2.4) {
    if (!this.alive) return;
    this.threatX = x;
    this.threatY = y;
    this.fleeTimer = Math.max(this.fleeTimer, duration);
  }

  takeDamage(amount) {
    if (!this.alive) return false;
    this.health -= amount;
    if (this.health <= 0) {
      this.alive = false;
      this.deathTimer = 0;
      this.vx = 0;
      this.vy = 0;
      return true;
    }
    return false;
  }
}

// --- helpers local to the entities module ---------------------------------

function nearestRoad(value, roads) {
  let best = roads[0];
  let bestD = Math.abs(value - best);
  for (const r of roads) {
    const d = Math.abs(value - r);
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

function clearPath(x, y, angle, length, city) {
  const steps = Math.ceil(length / 36);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (let i = 1; i <= steps; i += 1) {
    const px = x + c * (i / steps) * length;
    const py = y + s * (i / steps) * length;
    if (circleHitsBuilding(px, py, 22, city)) return false;
  }
  return true;
}

// Traffic waypoint: pick the next intersection in a direction that does not
// immediately leave the map. Keeps traffic flowing on the road grid.
export function chooseTrafficTarget(vehicle, city, rng = Math.random, playerPos = null) {
  const gx = nearestIndex(city.roadXs, vehicle.x);
  const gy = nearestIndex(city.roadYs, vehicle.y);
  const options = [];
  if (gx + 1 < city.roadXs.length) options.push({ gx: gx + 1, gy, dir: 0 });
  if (gx - 1 >= 0) options.push({ gx: gx - 1, gy, dir: Math.PI });
  if (gy + 1 < city.roadYs.length) options.push({ gx, gy: gy + 1, dir: Math.PI / 2 });
  if (gy - 1 >= 0) options.push({ gx, gy: gy - 1, dir: -Math.PI / 2 });
  options.sort((a, b) => {
    const da = Math.abs(angleDelta(vehicle.angle, a.dir));
    const db = Math.abs(angleDelta(vehicle.angle, b.dir));
    return da - db;
  });
  const roll = rng();
  let chosen = options[0];
  if (options.length > 1 && roll < 0.33) chosen = options[Math.floor(rng() * options.length)];
  const x = city.roadXs[chosen.gx];
  const y = city.roadYs[chosen.gy];
  return {
    x: x + Math.cos(chosen.dir) * 0,
    y: y + Math.sin(chosen.dir) * 0,
    dir: chosen.dir,
  };
}

function nearestIndex(values, v) {
  let best = 0;
  let bestD = Math.abs(v - values[0]);
  for (let i = 1; i < values.length; i += 1) {
    const d = Math.abs(v - values[i]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// Spawn a car on the road network a comfortable distance from a point.
export function spawnTrafficVehicle(city, rng, avoidX = null, avoidY = null, minDist = TRAFFIC_SPAWN_MIN) {
  let point = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    point = randomRoadPoint(rng, city);
    if (avoidX === null || dist(point.x, point.y, avoidX, avoidY) >= minDist) break;
  }
  return new Vehicle({
    x: point.x,
    y: point.y,
    angle: point.angle,
    color: PALETTE.building[Math.floor(rng() * PALETTE.building.length)],
    name: 'Sedan',
    ai: true,
  });
}

const TRAFFIC_SPAWN_MIN = 420;

// A parked car for a city lot or the kerb.
export function spawnParkedVehicle(city, rng) {
  const spot = city.parkedCars[Math.floor(rng() * city.parkedCars.length)];
  return new Vehicle({
    x: spot.x,
    y: spot.y,
    angle: spot.angle,
    color: spot.color,
    name: 'Lynx',
    parked: true,
    ai: false,
  });
}