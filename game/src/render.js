// The renderer: a smooth-follow camera, a sunset city drawn from primitives,
// a slow day/night cycle, neon, streetlight pools and everything that moves.
// Nothing here loads an image; every shape is generated in code.

import { VIEW, CITY, PALETTE, FONT, FONT_MONO } from './config.js';
import { clamp, lerp, smoothstep, mixHex, mod } from './random.js';

export function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function shade(hex, amount) {
  return mixHex(hex, amount < 0 ? '#000000' : '#ffffff', Math.abs(amount));
}

function ell(ctx, x, y, rx, ry, color) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function makeGlowSprite(inner, mid) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const c = canvas.getContext('2d');
  const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner);
  g.addColorStop(0.45, mid);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 256, 256);
  return canvas;
}

function drawGlow(ctx, sprite, x, y, radius, alpha) {
  if (!sprite || alpha <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = 1;
}


export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.canvas.width = VIEW.width;
    this.canvas.height = VIEW.height;
    this.camera = { x: 1000, y: 1000, zoom: 1 };
    this.time = 0;
    this.menuAngle = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.cameraZoomOverride = null;
    this.glows = {
      warm: makeGlowSprite('rgba(255,244,214,0.95)', 'rgba(255,198,120,0.5)'),
      gold: makeGlowSprite('rgba(255,233,160,0.95)', 'rgba(255,190,70,0.45)'),
      red: makeGlowSprite('rgba(255,120,130,0.9)', 'rgba(255,40,60,0.4)'),
      blue: makeGlowSprite('rgba(150,200,255,0.9)', 'rgba(50,120,255,0.4)'),
    };
    this.vignette = (() => {
      const canvas = document.createElement('canvas');
      canvas.width = VIEW.width;
      canvas.height = VIEW.height;
      const c = canvas.getContext('2d');
      const g = c.createRadialGradient(
        VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.32,
        VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.85,
      );
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.38)');
      c.fillStyle = g;
      c.fillRect(0, 0, VIEW.width, VIEW.height);
      return canvas;
    })();
  }

  snapTo(x, y) {
    this.camera.x = x;
    this.camera.y = y;
  }

  screenToWorld(sx, sy) {
    const zoom = this.camera.zoom;
    return {
      x: this.camera.x + (sx - VIEW.width / 2) / zoom,
      y: this.camera.y + (sy - VIEW.height / 2) / zoom,
    };
  }

  worldToScreen(wx, wy) {
    const zoom = this.camera.zoom;
    return {
      x: (wx - this.camera.x) * zoom + VIEW.width / 2,
      y: (wy - this.camera.y) * zoom + VIEW.height / 2,
    };
  }

  updateCamera(game, dt) {
    const city = game.city;
    const player = game.player;
    const target = player.vehicle ?? player;
    const naturalZoom = player.vehicle
      ? clamp(1 - player.vehicle.speed / 2200, 0.84, 1)
      : 1.02;
    const zoomTarget = this.cameraZoomOverride ?? naturalZoom;
    this.camera.zoom = lerp(this.camera.zoom, zoomTarget, 1 - Math.exp(-2.4 * dt));

    let leadX = 0;
    let leadY = 0;
    if (player.vehicle) {
      leadX = clamp(player.vehicle.vx * 0.4, -150, 150);
      leadY = clamp(player.vehicle.vy * 0.4, -150, 150);
    } else {
      leadX = Math.cos(player.aimAngle) * 36;
      leadY = Math.sin(player.aimAngle) * 36;
    }
    const zoom = this.camera.zoom;
    const halfW = VIEW.width / (2 * zoom);
    const halfH = VIEW.height / (2 * zoom);
    const desiredX = clamp(target.x + leadX, halfW - 120, city.size - halfW + 120);
    const desiredY = clamp(target.y + leadY, halfH - 120, city.size - halfH + 120);
    const follow = 1 - Math.exp(-5.5 * dt);
    this.camera.x = lerp(this.camera.x, desiredX, follow);
    this.camera.y = lerp(this.camera.y, desiredY, follow);
  }

  updateMenuCamera(dt, city) {
    this.menuAngle += dt * 0.035;
    const radius = city.size * 0.26;
    const x = city.size / 2 + Math.cos(this.menuAngle) * radius;
    const y = city.size / 2 + Math.sin(this.menuAngle * 0.8) * radius;
    this.camera.zoom = lerp(this.camera.zoom, 0.74, 1 - Math.exp(-1.5 * dt));
    this.camera.x = lerp(this.camera.x, x, 1 - Math.exp(-1.2 * dt));
    this.camera.y = lerp(this.camera.y, y, 1 - Math.exp(-1.2 * dt));
  }

  skyFor(phase) {
    const sun = Math.cos(mod(phase, 1) * Math.PI * 2);
    const light = clamp(0.5 + 0.5 * sun, 0, 1);
    const darkness = 1 - light;
    const night = clamp((darkness - 0.16) / 0.62, 0, 1);
    const dusk = clamp(1 - Math.abs(sun) / 0.6, 0, 1);
    let top;
    let mid;
    let bottom;
    if (sun >= 0) {
      const t = smoothstep(0, 0.82, sun);
      top = mixHex(PALETTE.sky.duskTop, PALETTE.sky.dayTop, t);
      mid = mixHex(PALETTE.sky.duskMid, '#5fa8c8', t);
      bottom = mixHex(PALETTE.sky.duskBottom, PALETTE.sky.dayBottom, t);
    } else {
      const t = smoothstep(0, 0.8, -sun);
      top = mixHex(PALETTE.sky.duskTop, PALETTE.sky.nightTop, t);
      mid = mixHex(PALETTE.sky.duskMid, '#232145', t);
      bottom = mixHex(PALETTE.sky.duskBottom, PALETTE.sky.nightBottom, t);
    }
    const warm = dusk * (1 - night * 0.55);
    return { sun, light, darkness, night, dusk, warm, top, mid, bottom };
  }

  drawSky(sky) {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, VIEW.height);
    gradient.addColorStop(0, sky.top);
    gradient.addColorStop(0.55, sky.mid);
    gradient.addColorStop(1, sky.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  visible(x, y, pad = 100) {
    const zoom = this.camera.zoom;
    const hw = VIEW.width / (2 * zoom) + pad;
    const hh = VIEW.height / (2 * zoom) + pad;
    return Math.abs(x - this.camera.x) < hw && Math.abs(y - this.camera.y) < hh;
  }

  render(game, dt) {
    this.time += dt;
    const sky = this.skyFor(game.dayPhase ?? 0.18);
    if (game.state === 'menu') this.updateMenuCamera(dt, game.city);
    else this.updateCamera(game, dt);

    const combat = game.combat;
    const shake = combat ? combat.shake : 0;
    this.shakeX = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    this.shakeY = shake > 0 ? (Math.random() - 0.5) * shake : 0;

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, VIEW.width, VIEW.height);
    if (game.state === 'menu') this.drawSky(sky);

    ctx.save();
    ctx.translate(VIEW.width / 2 + this.shakeX, VIEW.height / 2 + this.shakeY);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);

    this.drawWater(game.city);
    this.drawCity(game.city, game);
    this.drawGroundMarks(combat);
    this.drawBuildings(game.city, sky);
    this.drawPalms(game.city);
    this.drawRamps(game.city);
    this.drawNightOverlay(sky);
    this.drawLighting(game, sky);
    if (game.state !== 'menu') this.drawMissionMarker(game);
    this.drawEntities(game);
    this.drawParticles(combat);

    ctx.restore();

    this.drawAtmosphere(sky, game);
    this.drawVignette();
    if (game.state === 'playing' || game.state === 'paused') this.drawReticle(game);
  }

  drawWater(city) {
    const ctx = this.ctx;
    const zoom = this.camera.zoom;
    const w = VIEW.width / zoom + 240;
    const h = VIEW.height / zoom + 240;
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(this.camera.x - w / 2, this.camera.y - h / 2, w, h);
    // Shoreline foam.
    ctx.strokeStyle = 'rgba(120,200,210,0.3)';
    ctx.lineWidth = 8;
    ctx.strokeRect(-6, -6, city.size + 12, city.size + 12);
    ctx.strokeStyle = 'rgba(20,60,72,0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, city.size - 4, city.size - 4);
  }

  drawCity(city, game) {
    const ctx = this.ctx;
    // Asphalt fills the whole landmass; blocks are laid on top.
    ctx.fillStyle = PALETTE.asphalt;
    ctx.fillRect(0, 0, city.size, city.size);

    for (const block of city.blocks) {
      if (!this.visible(block.x + block.w / 2, block.y + block.h / 2, 500)) continue;
      this.drawBlock(city, block);
    }
    this.drawRoads(city);
    // Lamp posts (their light is drawn after dark).
    for (const lamp of city.lamps) {
      if (!this.visible(lamp.x, lamp.y, 60)) continue;
      ctx.fillStyle = 'rgba(8,8,12,0.28)';
      ctx.beginPath();
      ctx.arc(lamp.x + 2, lamp.y + 3, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a3540';
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f4e3b6';
      ctx.beginPath();
      ctx.arc(lamp.x - 0.5, lamp.y - 0.5, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    void game;
  }

  drawBlock(city, block) {
    const ctx = this.ctx;
    const pad = CITY.sidewalk;
    ctx.save();
    roundedBlock(ctx, block.x, block.y, block.w, block.h, 10);
    ctx.fillStyle = PALETTE.sidewalk;
    ctx.fill();
    ctx.strokeStyle = PALETTE.sidewalkEdge;
    ctx.lineWidth = 3;
    ctx.stroke();

    const inner = {
      x: block.x + pad,
      y: block.y + pad,
      w: block.w - pad * 2,
      h: block.h - pad * 2,
    };
    if (block.type === 'park') {
      roundedBlock(ctx, inner.x, inner.y, inner.w, inner.h, 6);
      ctx.fillStyle = PALETTE.grass;
      ctx.fill();
      for (let i = 0; i < 16; i += 1) {
        const gx = inner.x + hash01(block.index * 17 + i * 3.1) * (inner.w - 20) + 10;
        const gy = inner.y + hash01(block.index * 29 + i * 7.3) * (inner.h - 20) + 10;
        ctx.fillStyle = i % 2 ? 'rgba(112,150,100,0.4)' : 'rgba(52,86,58,0.4)';
        ctx.fillRect(gx, gy, 3, 5);
      }
      ctx.strokeStyle = 'rgba(220,210,180,0.5)';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(inner.x, inner.y + inner.h / 2);
      ctx.lineTo(inner.x + inner.w, inner.y + inner.h / 2);
      ctx.moveTo(inner.x + inner.w / 2, inner.y);
      ctx.lineTo(inner.x + inner.w / 2, inner.y + inner.h);
      ctx.stroke();
    } else if (block.type === 'parking') {
      roundedBlock(ctx, inner.x, inner.y, inner.w, inner.h, 6);
      ctx.fillStyle = '#34323c';
      ctx.fill();
      ctx.strokeStyle = 'rgba(230,220,190,0.25)';
      ctx.lineWidth = 2;
      const count = 10;
      for (let i = 1; i < count; i += 1) {
        const x = inner.x + (inner.w / count) * i;
        ctx.beginPath();
        ctx.moveTo(x, inner.y + 10);
        ctx.lineTo(x, inner.y + 50);
        ctx.moveTo(x, inner.y + inner.h - 10);
        ctx.lineTo(x, inner.y + inner.h - 50);
        ctx.stroke();
      }
    } else {
      roundedBlock(ctx, inner.x, inner.y, inner.w, inner.h, 6);
      ctx.fillStyle = PALETTE.lot;
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,18,24,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
    void city;
  }

  drawRoads(city) {
    const ctx = this.ctx;
    const half = city.roadWidth / 2;
    // Centre lines: a double broken yellow stripe.
    ctx.save();
    ctx.strokeStyle = 'rgba(228,197,126,0.42)';
    ctx.lineWidth = 2;
    ctx.setLineDash([22, 30]);
    for (const rx of city.roadXs) {
      ctx.beginPath();
      ctx.moveTo(rx - 3, 0);
      ctx.lineTo(rx - 3, city.size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rx + 3, 0);
      ctx.lineTo(rx + 3, city.size);
      ctx.stroke();
    }
    for (const ry of city.roadYs) {
      ctx.beginPath();
      ctx.moveTo(0, ry - 3);
      ctx.lineTo(city.size, ry - 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, ry + 3);
      ctx.lineTo(city.size, ry + 3);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Crosswalks and stop lines around each intersection in view.
    ctx.fillStyle = 'rgba(213,205,186,0.5)';
    for (const rx of city.roadXs) {
      for (const ry of city.roadYs) {
        if (!this.visible(rx, ry, 260)) continue;
        const band = 22;
        const gap = 11;
        const span = half - 6;
        // North and south crossing bands.
        for (const dir of [-1, 1]) {
          const y = ry + dir * (half + 12);
          for (let x = rx - span; x < rx + span; x += gap * 2) {
            ctx.fillRect(x, y - band / 2, gap, band);
          }
          ctx.fillStyle = 'rgba(235,225,205,0.35)';
          ctx.fillRect(rx - span, ry + dir * (half + 28), span * 2, 4);
          ctx.fillStyle = 'rgba(213,205,186,0.5)';
        }
        // East and west crossing bands.
        for (const dir of [-1, 1]) {
          const x = rx + dir * (half + 12);
          for (let y = ry - span; y < ry + span; y += gap * 2) {
            ctx.fillRect(x - band / 2, y, band, gap);
          }
          ctx.fillStyle = 'rgba(235,225,205,0.35)';
          ctx.fillRect(rx + dir * (half + 28), ry - span, 4, span * 2);
          ctx.fillStyle = 'rgba(213,205,186,0.5)';
        }
      }
    }
    ctx.restore();
  }

  drawGroundMarks(combat) {
    if (!combat) return;
    const ctx = this.ctx;
    ctx.save();
    for (const blood of combat.blood) {
      if (!this.visible(blood.x, blood.y, 40)) continue;
      const a = (blood.life / blood.maxLife) * 0.42;
      ctx.fillStyle = `rgba(90,14,26,${a})`;
      ctx.beginPath();
      ctx.ellipse(blood.x, blood.y, blood.r * 1.5, blood.r, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const skid of combat.skids) {
      if (!this.visible(skid.x, skid.y, 30)) continue;
      const a = (skid.life / skid.maxLife) * skid.strength * 0.42;
      ctx.save();
      ctx.translate(skid.x, skid.y);
      ctx.rotate(skid.angle);
      ctx.fillStyle = `rgba(14,12,16,${a})`;
      ctx.fillRect(-5, -12, 10, 3.4);
      ctx.fillRect(-5, 9, 10, 3.4);
      ctx.restore();
    }
    ctx.restore();
  }

  drawBuildings(city, sky) {
    const ctx = this.ctx;
    for (const b of city.buildings) {
      if (!this.visible(b.x + b.w / 2, b.y + b.h / 2, 260)) continue;
      const depth = 8 + b.floors * 2.2;
      // Long sunset shadow.
      ctx.fillStyle = 'rgba(8,8,16,0.34)';
      roundRect(ctx, b.x + depth * 0.8, b.y + depth, b.w, b.h, 4);
      ctx.fill();

      ctx.fillStyle = b.color;
      roundRect(ctx, b.x, b.y, b.w, b.h, 4);
      ctx.fill();

      // A lighter strip along the top edge fakes the roof catching the light.
      const roof = shade(b.color, 0.09);
      roundRect(ctx, b.x + 6, b.y + 6, b.w - 12, b.h - 12, 3);
      ctx.fillStyle = roof;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Roof panel seams.
      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 1;
      const seams = Math.min(4, 1 + Math.floor(b.w / 130));
      for (let i = 1; i <= seams; i += 1) {
        const sy = b.y + 10 + ((b.h - 20) / (seams + 1)) * i;
        ctx.beginPath();
        ctx.moveTo(b.x + 10, sy);
        ctx.lineTo(b.x + b.w - 10, sy);
        ctx.stroke();
      }
      if (b.w > 230 && b.h > 190 && hash01(b.seed * 3.3) > 0.5) {
        const hx = b.x + b.w * 0.68;
        const hy = b.y + b.h * 0.62;
        ctx.strokeStyle = 'rgba(240,230,210,0.22)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hx, hy, 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(240,230,210,0.2)';
        ctx.font = `700 18px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('H', hx, hy + 1);
      }

      // Rooftop clutter, deterministic per building.
      const count = 1 + Math.floor(hash01(b.seed) * 3);
      for (let i = 0; i < count; i += 1) {
        const rx = b.x + 16 + hash01(b.seed + i * 3.7) * Math.max(8, b.w - 44);
        const ry = b.y + 16 + hash01(b.seed + i * 9.1) * Math.max(8, b.h - 44);
        const rw = 8 + hash01(b.seed + i * 5.3) * 16;
        const rh = 8 + hash01(b.seed + i * 2.2) * 14;
        ctx.fillStyle = 'rgba(20,18,26,0.42)';
        ctx.fillRect(rx + 3, ry + 4, rw, rh);
        ctx.fillStyle = shade(b.color, -0.16);
        ctx.fillRect(rx, ry, rw, rh);
      }
      // Water tank silhouette on some towers.
      if (b.floors > 6 && hash01(b.seed * 1.7) > 0.56) {
        const rx = b.x + b.w * 0.68;
        const ry = b.y + b.h * 0.44;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.arc(rx + 4, ry + 5, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3a3036';
        ctx.beginPath();
        ctx.arc(rx, ry, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,200,140,0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      // Parapet highlight.
      ctx.strokeStyle = 'rgba(255,220,180,0.12)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3, 4);
      ctx.stroke();

      if (b.neon) {
        this.drawNeonSign(b, sky);
      }
    }
  }

  drawNeonSign(b, sky) {
    const ctx = this.ctx;
    const horizontal = b.neonSide === 'n' || b.neonSide === 's';
    const x = horizontal ? b.x + 12 : b.neonSide === 'w' ? b.x + 6 : b.x + b.w - 8;
    const y = b.neonSide === 'n' ? b.y + 8 : b.neonSide === 's' ? b.y + b.h - 10 : b.y + b.h * 0.35;
    const w = horizontal ? Math.min(b.w - 24, 80) : 4;
    const h = horizontal ? 4 : Math.min(b.h * 0.34, 62);
    const glow = 0.34 + sky.night * 0.62;
    ctx.save();
    ctx.globalAlpha = glow;
    ctx.fillStyle = b.neon;
    roundRect(ctx, x, y, w, h, 2);
    ctx.fill();
    ctx.restore();
    void sky;
  }

  drawPalms(city) {
    const ctx = this.ctx;
    const time = this.time;
    for (const p of city.palms) {
      if (!this.visible(p.x, p.y, 90)) continue;
      const sway = Math.sin(time * 0.9 + p.phase) * 0.08 + p.lean;
      const size = p.size;
      const topX = p.x + Math.sin(sway) * size * 0.5;
      const topY = p.y - size;
      ell(ctx, p.x + 12, p.y + 6, size * 0.5, size * 0.2, 'rgba(8,8,14,0.3)');
      ctx.strokeStyle = PALETTE.palmTrunk;
      ctx.lineWidth = Math.max(2, size * 0.11);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo(p.x + Math.sin(sway) * size * 0.25, p.y - size * 0.55, topX, topY);
      ctx.stroke();
      // Fronds.
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2 + Math.sin(time * 1.1 + p.phase) * 0.07;
        const len = size * (0.55 + hash01(p.seed + i) * 0.3);
        const ex = topX + Math.cos(a) * len;
        const ey = topY + Math.sin(a) * len * 0.62 + 6;
        ctx.strokeStyle = i % 2 === 0 ? PALETTE.palmLight : PALETTE.palm;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(topX, topY);
        ctx.quadraticCurveTo(topX + Math.cos(a) * len * 0.55, topY + Math.sin(a) * len * 0.4 - 6, ex, ey);
        ctx.stroke();
      }
      ctx.fillStyle = '#3d2d24';
      ctx.beginPath();
      ctx.arc(topX, topY, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineCap = 'butt';
  }

  drawRamps(city) {
    const ctx = this.ctx;
    for (const ramp of city.ramps) {
      if (!this.visible(ramp.x, ramp.y, 150)) continue;
      ctx.save();
      ctx.translate(ramp.x, ramp.y);
      ctx.rotate(ramp.angle);
      const l = ramp.length / 2;
      const w = ramp.width / 2;
      // Support shadow.
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      roundRect(ctx, -l + 8, -w + 8, ramp.length, ramp.width, 4);
      ctx.fill();
      // Wedge shape, brighter at the lip.
      const grad = ctx.createLinearGradient(-l, 0, l, 0);
      grad.addColorStop(0, '#4b4145');
      grad.addColorStop(0.6, '#8e7856');
      grad.addColorStop(1, '#d6b45c');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-l, -w);
      ctx.lineTo(-l, w);
      ctx.lineTo(l, w * 0.78);
      ctx.lineTo(l, -w * 0.78);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,235,180,0.65)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Yellow chevrons.
      ctx.strokeStyle = 'rgba(255,210,80,0.8)';
      ctx.lineWidth = 4;
      for (let i = -1; i <= 1; i += 1) {
        const x = i * ramp.length * 0.26;
        ctx.beginPath();
        ctx.moveTo(x - 16, -w * 0.55);
        ctx.lineTo(x + 8, 0);
        ctx.lineTo(x - 16, w * 0.55);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = `bold 9px ${FONT_MONO}`;
      ctx.textAlign = 'center';
      ctx.fillText('JUMP', 0, 3);
      ctx.restore();
    }
  }

  drawNightOverlay(sky) {
    if (sky.darkness < 0.02) return;
    const ctx = this.ctx;
    const zoom = this.camera.zoom;
    const w = VIEW.width / zoom + 40;
    const h = VIEW.height / zoom + 40;
    ctx.save();
    ctx.fillStyle = `rgba(9,12,30,${sky.darkness * 0.56})`;
    ctx.fillRect(this.camera.x - w / 2, this.camera.y - h / 2, w, h);
    ctx.restore();
  }

  drawLighting(game, sky) {
    if (sky.night < 0.03) return;
    const ctx = this.ctx;
    const n = sky.night;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Streetlight pools.
    for (const lamp of game.city.lamps) {
      if (!this.visible(lamp.x, lamp.y, 170)) continue;
      drawGlow(ctx, this.glows.warm, lamp.x, lamp.y, 150, 0.34 * n);
      ctx.fillStyle = `rgba(255,238,196,${0.8 * n})`;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Lit windows around building edges.
    for (const b of game.city.buildings) {
      if (!this.visible(b.x + b.w / 2, b.y + b.h / 2, 180)) continue;
      const cols = Math.max(2, Math.floor(b.w / 34));
      const rows = Math.max(2, Math.floor(b.h / 34));
      for (let i = 0; i < cols; i += 1) {
        const t = (i + 0.5) / cols;
        const x = b.x + 8 + t * (b.w - 20);
        if (hash01(b.seed + i * 1.3) > 0.42) {
          const a = (0.34 + hash01(b.seed + i * 7) * 0.5) * n;
          ctx.fillStyle = `rgba(255,214,138,${a})`;
          ctx.fillRect(x, b.y + 4, 6, 3.2);
          ctx.fillRect(x + 1, b.y + b.h - 8, 6, 3.2);
        }
      }
      for (let i = 0; i < rows; i += 1) {
        const t = (i + 0.5) / rows;
        const y = b.y + 10 + t * (b.h - 22);
        if (hash01(b.seed + i * 2.7 + 11) > 0.48) {
          const a = (0.3 + hash01(b.seed + i * 4.4) * 0.5) * n;
          ctx.fillStyle = `rgba(255,214,138,${a})`;
          ctx.fillRect(b.x + 4, y, 3.2, 6);
          ctx.fillRect(b.x + b.w - 8, y + 1, 3.2, 6);
        }
      }
      if (b.neon) {
        ctx.globalAlpha = 0.7 * n;
        ctx.fillStyle = b.neon;
        const horizontal = b.neonSide === 'n' || b.neonSide === 's';
        if (horizontal) ctx.fillRect(b.x + 12, b.neonSide === 'n' ? b.y + 8 : b.y + b.h - 10, Math.min(b.w - 24, 80), 4);
        else ctx.fillRect(b.neonSide === 'w' ? b.x + 6 : b.x + b.w - 8, b.y + b.h * 0.35, 4, Math.min(b.h * 0.34, 62));
        ctx.globalAlpha = 1;
      }
    }

    // Headlights and sirens.
    const cars = [...game.vehicles, ...game.police];
    for (const v of cars) {
      if (!this.visible(v.x, v.y, 260) || v.destroyed) continue;
      if (v.speed > 8 || v.police) {
        const c = Math.cos(v.angle);
        const s = Math.sin(v.angle);
        for (const side of [-1, 1]) {
          const hx = v.x + c * 24 - s * side * 7;
          const hy = v.y + s * 24 + c * side * 7;
          const gx = hx + c * 78;
          const gy = hy + s * 78;
          drawGlow(ctx, this.glows.warm, gx, gy, 104, 0.2 * n);
        }
      }
      if (v.police && v.sirenOn) {
        const phase = Math.sin(v.sirenPhase);
        drawGlow(ctx, phase > 0 ? this.glows.red : this.glows.blue, v.x, v.y - 16, 118, 0.4 * n);
      }
    }

    // A warm halo around the mission beacon so it stays readable at night.
    const target = game.missions?.target;
    if (target && this.visible(target.x, target.y, 200)) {
      drawGlow(ctx, this.glows.gold, target.x, target.y, 110, 0.32 * n);
    }
    ctx.restore();
  }

  drawMissionMarker(game) {
    const target = game.missions?.target;
    if (!target) return;
    if (game.missions.phase === 'complete' || game.missions.phase === 'failed') return;
    const ctx = this.ctx;
    const t = this.time;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
    ctx.save();
    ctx.translate(target.x, target.y);
    // Rotating dashed ring on the asphalt.
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = PALETTE.mission;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 9]);
    ctx.lineDashOffset = -t * 24;
    ctx.beginPath();
    ctx.arc(0, 0, 38 + pulse * 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.22 + pulse * 0.16;
    ctx.fillStyle = PALETTE.mission;
    ctx.beginPath();
    ctx.arc(0, 0, 32, 0, Math.PI * 2);
    ctx.fill();

    // Beam and floating diamond.
    const beam = ctx.createLinearGradient(0, -140, 0, 0);
    beam.addColorStop(0, 'rgba(255,209,102,0)');
    beam.addColorStop(0.7, 'rgba(255,209,102,0.12)');
    beam.addColorStop(1, 'rgba(255,209,102,0.2)');
    ctx.globalAlpha = 0.55 + pulse * 0.2;
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(-20, -140);
    ctx.lineTo(20, -140);
    ctx.lineTo(8, 0);
    ctx.lineTo(-8, 0);
    ctx.closePath();
    ctx.fill();

    const bob = Math.sin(t * 2.1) * 5;
    ctx.save();
    ctx.translate(0, -72 + bob);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, this.glows.gold, 0, 0, 34, 0.55);
    ctx.globalCompositeOperation = 'source-over';
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = PALETTE.mission;
    ctx.fillRect(-9, -9, 18, 18);
    ctx.fillStyle = '#6a4a12';
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();

    if (target.label) {
      ctx.font = `600 12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const width = ctx.measureText(target.label).width + 18;
      roundRect(ctx, -width / 2, -110, width, 20, 6);
      ctx.fillStyle = 'rgba(12,12,20,0.72)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,209,102,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = PALETTE.mission;
      ctx.fillText(target.label, 0, -100);
    }
    ctx.restore();
  }

  drawEntities(game) {
    const renderables = [];
    for (const p of game.peds) {
      if (this.visible(p.x, p.y, 80)) renderables.push({ y: p.y, kind: 'ped', obj: p });
    }
    for (const v of game.vehicles) {
      if (this.visible(v.x, v.y, 150)) renderables.push({ y: v.y, kind: v.police ? 'police' : 'vehicle', obj: v });
    }
    for (const v of game.police) {
      if (this.visible(v.x, v.y, 150)) renderables.push({ y: v.y, kind: 'police', obj: v });
    }
    if (game.player.onFoot && this.visible(game.player.x, game.player.y, 80)) {
      renderables.push({ y: game.player.y, kind: 'player', obj: game.player });
    }
    renderables.sort((a, b) => a.y - b.y);

    for (const item of renderables) {
      if (item.kind === 'ped') this.drawPedestrian(item.obj);
      else if (item.kind === 'vehicle') this.drawVehicle(item.obj, game);
      else if (item.kind === 'police') this.drawPoliceCar(item.obj, game);
      else this.drawPlayer(item.obj, game);
    }
    if (game.enterPrompt && this.visible(game.enterPrompt.x, game.enterPrompt.y, 140)) {
      this.drawEnterPrompt(game.enterPrompt);
    }
  }

  drawVehicle(v, game) {
    const ctx = this.ctx;
    const z = v.z || 0;
    ctx.save();
    ctx.translate(v.x, v.y);
    // Ground shadow shrinks as the car leaves the ramp.
    ctx.globalAlpha = 0.32 * clamp(1 - z / 140, 0.35, 1);
    ctx.fillStyle = '#05050a';
    ctx.beginPath();
    ctx.ellipse(3, 5, 28, 14, v.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.rotate(v.angle);
    ctx.translate(0, -z * 0.55);
    const length = v.type === 'coupe' ? 50 : 55;
    const width = v.type === 'coupe' ? 24 : 27;

    // Wheels.
    ctx.fillStyle = '#101015';
    for (const wx of [-17, 15]) {
      for (const wy of [-width / 2 - 1, width / 2 - 3]) {
        roundRect(ctx, wx - 6, wy, 13, 4.2, 2);
        ctx.fill();
      }
    }
    if (v.destroyed) {
      ctx.fillStyle = '#241f22';
      roundRect(ctx, -length / 2, -width / 2, length, width, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,120,40,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(15,12,14,0.75)';
      roundRect(ctx, -length * 0.2, -width * 0.28, length * 0.36, width * 0.56, 4);
      ctx.fill();
      ctx.restore();
      return;
    }

    // Body.
    const grad = ctx.createLinearGradient(-length / 2, 0, length / 2, 0);
    grad.addColorStop(0, shade(v.color, -0.22));
    grad.addColorStop(0.45, v.color);
    grad.addColorStop(1, shade(v.color, 0.18));
    ctx.fillStyle = grad;
    roundRect(ctx, -length / 2, -width / 2, length, width, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,10,16,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Cabin glass and roof.
    ctx.fillStyle = 'rgba(22,30,42,0.88)';
    roundRect(ctx, -length * 0.19, -width * 0.36, length * 0.36, width * 0.72, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,220,255,0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = shade(v.color, -0.12);
    roundRect(ctx, -length * 0.1, -width * 0.24, length * 0.2, width * 0.48, 4);
    ctx.fill();

    // Bonnet crease.
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(length * 0.2, -width * 0.3);
    ctx.lineTo(length * 0.42, -width * 0.24);
    ctx.moveTo(length * 0.2, width * 0.3);
    ctx.lineTo(length * 0.42, width * 0.24);
    ctx.stroke();

    // Headlights and tail lights.
    ctx.fillStyle = '#ffe9ae';
    ctx.fillRect(length / 2 - 4, -width * 0.34, 3, 5);
    ctx.fillRect(length / 2 - 4, width * 0.34 - 5, 3, 5);
    ctx.fillStyle = '#ff5a58';
    ctx.fillRect(-length / 2 + 1, -width * 0.34, 2.5, 5);
    ctx.fillRect(-length / 2 + 1, width * 0.34 - 5, 2.5, 5);

    // The lime mission car gets a tag so it is easy to spot.
    if (v.missionTag) {
      ctx.strokeStyle = 'rgba(255,209,102,0.6)';
      ctx.lineWidth = 1.4;
      roundRect(ctx, -length / 2 - 3, -width / 2 - 3, length + 6, width + 6, 10);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPoliceCar(v, game) {
    const ctx = this.ctx;
    const z = v.z || 0;
    ctx.save();
    ctx.translate(v.x, v.y);
    ctx.globalAlpha = 0.32 * clamp(1 - z / 140, 0.35, 1);
    ctx.fillStyle = '#05050a';
    ctx.beginPath();
    ctx.ellipse(3, 5, 29, 14, v.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.rotate(v.angle);
    ctx.translate(0, -z * 0.55);
    const length = 57;
    const width = 28;

    ctx.fillStyle = '#101015';
    for (const wx of [-18, 16]) {
      for (const wy of [-width / 2 - 1, width / 2 - 3]) {
        roundRect(ctx, wx - 6, wy, 13, 4.2, 2);
        ctx.fill();
      }
    }
    if (v.destroyed) {
      ctx.fillStyle = '#262126';
      roundRect(ctx, -length / 2, -width / 2, length, width, 8);
      ctx.fill();
      ctx.restore();
      return;
    }

    const grad = ctx.createLinearGradient(-length / 2, 0, length / 2, 0);
    grad.addColorStop(0, '#b9c2ce');
    grad.addColorStop(0.4, PALETTE.policeBody);
    grad.addColorStop(1, '#ffffff');
    ctx.fillStyle = grad;
    roundRect(ctx, -length / 2, -width / 2, length, width, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,10,16,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Blue stripe along the doors.
    ctx.fillStyle = PALETTE.policeStripe;
    ctx.fillRect(-length * 0.38, -width / 2 + 2, length * 0.62, 5);
    ctx.fillRect(-length * 0.38, width / 2 - 7, length * 0.62, 5);

    ctx.fillStyle = 'rgba(22,30,42,0.9)';
    roundRect(ctx, -length * 0.16, -width * 0.36, length * 0.32, width * 0.72, 5);
    ctx.fill();
    ctx.fillStyle = shade(PALETTE.policeBody, -0.12);
    roundRect(ctx, -length * 0.08, -width * 0.24, length * 0.16, width * 0.48, 4);
    ctx.fill();

    ctx.fillStyle = '#ffe9ae';
    ctx.fillRect(length / 2 - 4, -width * 0.34, 3, 5);
    ctx.fillRect(length / 2 - 4, width * 0.34 - 5, 3, 5);
    ctx.fillStyle = '#ff5a58';
    ctx.fillRect(-length / 2 + 1, -width * 0.34, 2.5, 5);
    ctx.fillRect(-length / 2 + 1, width * 0.34 - 5, 2.5, 5);

    // Light bar flashes red/blue.
    const flash = Math.sin(v.sirenPhase);
    ctx.fillStyle = '#171a24';
    roundRect(ctx, -5, -11, 10, 22, 3);
    ctx.fill();
    if (flash > 0) {
      ctx.fillStyle = PALETTE.policeLightRed;
      ctx.fillRect(-4, -10, 8, 8);
    } else {
      ctx.fillStyle = PALETTE.policeLightBlue;
      ctx.fillRect(-4, 2, 8, 8);
    }

    if (v.missionTag) {
      ctx.strokeStyle = 'rgba(255,209,102,0.65)';
      ctx.lineWidth = 1.4;
      roundRect(ctx, -length / 2 - 3, -width / 2 - 3, length + 6, width + 6, 10);
      ctx.stroke();
    }
    ctx.restore();
    void game;
  }

  drawPedestrian(p) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (!p.alive) {
      ctx.globalAlpha = Math.max(0.25, 1 - p.deathTimer / 9);
      ctx.rotate(p.angle + Math.PI / 2);
      ell(ctx, 0, 0, 13, 7, 'rgba(10,8,12,0.35)');
      ctx.fillStyle = p.shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.skin;
      ctx.beginPath();
      ctx.arc(9, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ell(ctx, 5, 7, 9, 4, 'rgba(10,8,12,0.35)');
    ctx.rotate(p.angle + Math.PI / 2);
    const swing = Math.sin(p.walkPhase) * (p.fleeing ? 4 : 2.4);
    ctx.strokeStyle = '#22202b';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-3, 5);
    ctx.lineTo(-3 + swing, 12);
    ctx.moveTo(3, 5);
    ctx.lineTo(3 - swing, 12);
    ctx.stroke();
    ctx.fillStyle = p.shirt;
    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    if (p.fleeing) {
      ctx.strokeStyle = p.shirt;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-5, -2);
      ctx.lineTo(-9, -10 - Math.abs(swing));
      ctx.moveTo(5, -2);
      ctx.lineTo(9, -10 - Math.abs(swing));
      ctx.stroke();
    }
    ctx.fillStyle = p.skin;
    ctx.beginPath();
    ctx.arc(0, -3, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a2024';
    ctx.beginPath();
    ctx.arc(0, -5, 4.4, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawPlayer(player, game) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(player.x, player.y);
    ell(ctx, 5, 7, 11, 5, 'rgba(8,8,14,0.38)');
    ctx.rotate(player.aimAngle);
    const swing = player.moving ? Math.sin(player.walkPhase) * 4 : 0;
    ctx.strokeStyle = PALETTE.playerPants;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, 3);
    ctx.lineTo(-2 + swing, 13);
    ctx.moveTo(4, 3);
    ctx.lineTo(4 - swing, 13);
    ctx.stroke();
    // Torso.
    const bodyColor = player.hurtFlash > 0.2 ? '#ffffff' : PALETTE.playerShirt;
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.playerBody;
    ctx.beginPath();
    ctx.arc(3, 0, 4.6, 0, Math.PI * 2);
    ctx.fill();
    // Hair.
    ctx.fillStyle = '#1d1a20';
    ctx.beginPath();
    ctx.arc(2, -1.4, 4.4, Math.PI * 0.8, Math.PI * 2.05);
    ctx.fill();
    // Arms and the pistol.
    ctx.strokeStyle = PALETTE.playerBody;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(4, -4);
    ctx.lineTo(13, -2);
    ctx.moveTo(4, 4);
    ctx.lineTo(13, 2);
    ctx.stroke();
    ctx.fillStyle = '#16141a';
    ctx.fillRect(13, -2.4, 9, 3.4);
    ctx.fillRect(10, -1.5, 4, 5);
    // Aim hint.
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = PALETTE.mission;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(150, 0);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    void game;
  }

  drawEnterPrompt(v) {
    const ctx = this.ctx;
    const bob = Math.sin(this.time * 3) * 2;
    const x = v.x;
    const y = v.y - 58 + bob;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 12px ${FONT_MONO}`;
    roundRect(ctx, x - 58, y - 13, 116, 26, 8);
    ctx.fillStyle = 'rgba(12,12,20,0.8)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.fillText('[E]  DRIVE', x, y);
    ctx.restore();
  }

  drawParticles(combat) {
    if (!combat) return;
    const ctx = this.ctx;
    ctx.save();
    // Tracers.
    for (const b of combat.bullets) {
      ctx.strokeStyle = 'rgba(255,236,168,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.px, b.py);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = '#fff8d8';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    // Muzzle flashes.
    for (const f of combat.flashes) {
      const a = f.life / f.maxLife;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);
      ctx.globalAlpha = a;
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 26);
      g.addColorStop(0, 'rgba(255,255,220,0.95)');
      g.addColorStop(0.4, 'rgba(255,200,90,0.5)');
      g.addColorStop(1, 'rgba(255,150,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff6cf';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(20, 0);
      ctx.lineTo(0, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // Generic particles.
    for (const p of combat.particles) {
      const life = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = p.fade ? life : 1;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + life * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Explosion rings.
    for (const e of combat.explosions) {
      const t = 1 - e.life / e.maxLife;
      const r = e.radius * (0.35 + t * 0.9);
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(e.x, e.y, 1, e.x, e.y, r);
      g.addColorStop(0, `rgba(255,240,190,${0.55 * (1 - t)})`);
      g.addColorStop(0.45, `rgba(255,150,60,${0.32 * (1 - t)})`);
      g.addColorStop(1, 'rgba(120,40,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = `rgba(255,230,170,${0.6 * (1 - t)})`;
      ctx.lineWidth = 3 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawAtmosphere(sky, game) {
    const ctx = this.ctx;
    // A faint colour grade so the time of day reads even from above.
    if (sky.warm > 0.02) {
      ctx.fillStyle = `rgba(255,156,104,${0.055 * sky.warm})`;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
    if (game.state === 'menu') {
      ctx.fillStyle = 'rgba(9,9,18,0.34)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    }
  }

  drawVignette() {
    this.ctx.drawImage(this.vignette, 0, 0);
  }

  drawReticle(game) {
    if (!game.pointer || !game.player.onFoot) return;
    const ctx = this.ctx;
    const x = game.pointer.x;
    const y = game.pointer.y;
    const color = game.wanted > 0 ? 'rgba(255,110,110,0.9)' : 'rgba(245,238,226,0.9)';
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0.35, Math.PI / 2 - 0.35);
    ctx.arc(x, y, 8, Math.PI / 2 + 0.35, Math.PI - 0.35);
    ctx.arc(x, y, 8, Math.PI + 0.35, Math.PI * 1.5 - 0.35);
    ctx.arc(x, y, 8, Math.PI * 1.5 + 0.35, Math.PI * 2 - 0.35);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 1.4, 0, Math.PI * 2);
    ctx.fill();
    for (const [dx, dy] of [[0, -13], [0, 13], [-13, 0], [13, 0]]) {
      ctx.beginPath();
      ctx.moveTo(x + dx * 0.55, y + dy * 0.55);
      ctx.lineTo(x + dx, y + dy);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function roundedBlock(ctx, x, y, w, h, r) {
  roundRect(ctx, x, y, w, h, r);
}