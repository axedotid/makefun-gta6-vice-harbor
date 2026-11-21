// Bullets, impact particles, blood, explosions and rubber on the road.
// The combat system owns damage application so every source (guns, rams,
// blasts) goes through one place.

import { PLAYER, VEHICLE, PALETTE } from './config.js';
import { clamp, dist, runtimeRandom } from './random.js';
import { circleHitsBuilding } from './world.js';

const MAX_BULLETS = 80;
const MAX_SKIDS = 320;
const MAX_PARTICLES = 520;

function particle(x, y, vx, vy, life, size, color, extra = {}) {
  return {
    x,
    y,
    vx,
    vy,
    life,
    maxLife: life,
    size,
    color,
    gravity: extra.gravity ?? 0,
    drag: extra.drag ?? 0.99,
    fade: extra.fade ?? true,
    kind: extra.kind ?? 'dot',
    angle: extra.angle ?? 0,
  };
}

export class CombatSystem {
  constructor(game) {
    this.game = game;
    this.bullets = [];
    this.particles = [];
    this.skids = [];
    this.explosions = [];
    this.flashes = [];
    this.blood = [];
    this.shake = 0;
  }

  reset() {
    this.bullets.length = 0;
    this.particles.length = 0;
    this.skids.length = 0;
    this.explosions.length = 0;
    this.flashes.length = 0;
    this.blood.length = 0;
    this.shake = 0;
  }

  playerShoot(x, y, angle) {
    const game = this.game;
    if (this.bullets.length >= MAX_BULLETS) this.bullets.shift();
    const spread = (runtimeRandom() - 0.5) * 0.05;
    const a = angle + spread;
    const mx = x + Math.cos(a) * 20;
    const my = y + Math.sin(a) * 20;
    this.bullets.push({
      x: mx,
      y: my,
      px: mx,
      py: my,
      vx: Math.cos(a) * PLAYER.bulletSpeed,
      vy: Math.sin(a) * PLAYER.bulletSpeed,
      angle: a,
      life: 0.85,
      damage: PLAYER.bulletDamage,
      owner: 'player',
    });
    this.addMuzzleFlash(mx, my, a);
    this.spawnCasing(mx, my, a);
    for (const p of game.peds) {
      if (p.alive && dist(p.x, p.y, x, y) < 320) p.panic(x, y, 3.2);
    }
    game.onGunshot?.(x, y);
    this.shake = Math.max(this.shake, 2.4);
  }

  addMuzzleFlash(x, y, angle) {
    this.flashes.push({ x, y, angle, life: 0.07, maxLife: 0.07 });
    for (let i = 0; i < 5; i += 1) {
      const a = angle + (runtimeRandom() - 0.5) * 0.9;
      const s = 120 + runtimeRandom() * 220;
      this.pushParticle(
        particle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.09 + runtimeRandom() * 0.08, 2.5, i % 2 ? '#ffe9a8' : '#ff9c42', {
          drag: 0.9,
        }),
      );
    }
  }

  spawnCasing(x, y, angle) {
    const a = angle + Math.PI / 2 + (runtimeRandom() - 0.5) * 0.4;
    this.pushParticle(
      particle(x, y, Math.cos(a) * (60 + runtimeRandom() * 70), Math.sin(a) * (60 + runtimeRandom() * 70), 0.7, 2, '#e7c46a', {
        gravity: 240,
        drag: 0.97,
      }),
    );
  }

  spawnBlood(x, y, count = 10, direction = null) {
    for (let i = 0; i < count; i += 1) {
      const a = direction !== null ? direction + (runtimeRandom() - 0.5) * 1.5 : runtimeRandom() * Math.PI * 2;
      const s = 30 + runtimeRandom() * 160;
      this.pushParticle(
        particle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.35 + runtimeRandom() * 0.5, 1.6 + runtimeRandom() * 2.6, PALETTE.blood, {
          gravity: 40,
          drag: 0.94,
        }),
      );
    }
    // Persistent stain under the body.
    this.blood.push({ x, y, r: 8 + runtimeRandom() * 9, life: 30, maxLife: 30, alpha: 0.5 });
    if (this.blood.length > 120) this.blood.shift();
  }

  spawnSparks(x, y, count = 7) {
    for (let i = 0; i < count; i += 1) {
      const a = runtimeRandom() * Math.PI * 2;
      const s = 60 + runtimeRandom() * 240;
      this.pushParticle(
        particle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.16 + runtimeRandom() * 0.24, 1.4 + runtimeRandom() * 1.6, i % 3 === 0 ? '#fff4bb' : '#ffb15a', {
          gravity: 280,
          drag: 0.93,
        }),
      );
    }
  }

  spawnDust(x, y, count = 8) {
    for (let i = 0; i < count; i += 1) {
      const a = runtimeRandom() * Math.PI * 2;
      const s = 15 + runtimeRandom() * 70;
      this.pushParticle(
        particle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4 + runtimeRandom() * 0.5, 3 + runtimeRandom() * 5, 'rgba(196,181,164,0.55)', {
          drag: 0.93,
          fade: true,
        }),
      );
    }
  }

  addSkid(x, y, angle, strength = 0.5) {
    if (this.skids.length >= MAX_SKIDS) this.skids.shift();
    this.skids.push({
      x,
      y,
      angle,
      strength: clamp(strength, 0.15, 1),
      life: 26,
      maxLife: 26,
    });
  }

  pushParticle(p) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
  }

  explode(x, y, radius = VEHICLE.explosionRadius, damage = VEHICLE.explosionDamage, owner = null) {
    const game = this.game;
    this.explosions.push({ x, y, radius, life: 0.55, maxLife: 0.55 });
    for (let i = 0; i < 36; i += 1) {
      const a = runtimeRandom() * Math.PI * 2;
      const s = 60 + runtimeRandom() * 420;
      const colors = ['#fff2b8', '#ffc45c', '#ff7a2f', '#ff4d2e', '#6b5a58'];
      this.pushParticle(
        particle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.35 + runtimeRandom() * 0.9, 3 + runtimeRandom() * 9, colors[Math.floor(runtimeRandom() * colors.length)], {
          gravity: 90,
          drag: 0.94,
        }),
      );
    }
    for (let i = 0; i < 10; i += 1) {
      const a = runtimeRandom() * Math.PI * 2;
      const s = 12 + runtimeRandom() * 60;
      this.pushParticle(
        particle(x, y, Math.cos(a) * s, Math.sin(a) * s, 1.2 + runtimeRandom(), 12 + runtimeRandom() * 18, 'rgba(38,32,38,0.5)', {
          drag: 0.96,
        }),
      );
    }
    this.shake = Math.max(this.shake, 10);

    for (const p of game.peds) {
      if (!p.alive) continue;
      const d = dist(p.x, p.y, x, y);
      if (d < radius) {
        p.panic(x, y, 4);
        if (p.takeDamage(damage + 40)) {
          this.spawnBlood(p.x, p.y, 14);
          game.onPedestrianKilled?.(p, owner === 'player');
        }
      }
    }
    const targets = [...game.vehicles, ...game.police];
    for (const v of targets) {
      if (v.destroyed) continue;
      const d = dist(v.x, v.y, x, y);
      if (d < radius + v.r) {
        const dmg = damage * clamp(1 - d / (radius + v.r), 0.25, 1);
        v.vx += ((v.x - x) / (d || 1)) * 220;
        v.vy += ((v.y - y) / (d || 1)) * 220;
        if (v.damage(dmg)) game.onVehicleDestroyed?.(v, owner === 'player');
      }
    }
    const player = game.player;
    const pd = dist(player.x, player.y, x, y);
    if (pd < radius + 10 && !player.dead) {
      if (player.vehicle) {
        if (player.vehicle.damage(damage * 1.4)) game.onVehicleDestroyed?.(player.vehicle, false);
      } else if (player.takeDamage(damage * clamp(1 - pd / (radius + 10), 0.3, 1))) {
        game.onPlayerDeath?.();
      }
    }
    if (owner === 'player') game.onExplosion?.(x, y);
  }

  update(dt) {
    const game = this.game;
    const city = game.city;

    // Bullets travel in short steps so fast rounds cannot tunnel through walls.
    for (let i = this.bullets.length - 1; i >= 0; i -= 1) {
      const b = this.bullets[i];
      b.px = b.x;
      b.py = b.y;
      const steps = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 18));
      let dead = false;
      for (let s = 0; s < steps && !dead; s += 1) {
        b.x += (b.vx * dt) / steps;
        b.y += (b.vy * dt) / steps;
        if (circleHitsBuilding(b.x, b.y, 2, city)) {
          this.spawnSparks(b.x, b.y, 4);
          dead = true;
          break;
        }
        const all = [...game.vehicles, ...game.police];
        for (const v of all) {
          if (v.destroyed) continue;
          if (v === game.player.vehicle) continue;
          if (v.hits(b.x, b.y, 3)) {
            if (v.damage(b.damage)) game.onVehicleDestroyed?.(v, true);
            this.spawnSparks(b.x, b.y, 8);
            if (v.police) game.onPoliceAttacked?.(v);
            dead = true;
            break;
          }
        }
        if (dead) break;
        for (const p of game.peds) {
          if (!p.alive) continue;
          if (dist(p.x, p.y, b.x, b.y) < p.r + 4) {
            p.panic(game.player.x, game.player.y, 5);
            this.spawnBlood(b.x, b.y, 8, Math.atan2(b.vy, b.vx));
            if (p.takeDamage(b.damage)) game.onPedestrianKilled?.(p, true);
            dead = true;
            break;
          }
        }
        if (dead) break;
        if (!game.player.vehicle && !game.player.dead && dist(game.player.x, game.player.y, b.x, b.y) < PLAYER.hitRadius) {
          // Only police/other shooters could hurt the player; the player's own
          // rounds start outside their hit radius, so this is a safety valve.
          dead = true;
        }
      }
      b.life -= dt;
      if (dead || b.life <= 0 || b.x < 0 || b.y < 0 || b.x > city.size || b.y > city.size) {
        this.bullets.splice(i, 1);
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    for (let i = this.skids.length - 1; i >= 0; i -= 1) {
      this.skids[i].life -= dt;
      if (this.skids[i].life <= 0) this.skids.splice(i, 1);
    }
    for (let i = this.blood.length - 1; i >= 0; i -= 1) {
      this.blood[i].life -= dt;
      if (this.blood[i].life <= 0) this.blood.splice(i, 1);
    }
    for (let i = this.flashes.length - 1; i >= 0; i -= 1) {
      this.flashes[i].life -= dt;
      if (this.flashes[i].life <= 0) this.flashes.splice(i, 1);
    }
    for (let i = this.explosions.length - 1; i >= 0; i -= 1) {
      this.explosions[i].life -= dt;
      if (this.explosions[i].life <= 0) this.explosions.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 14);
  }
}
