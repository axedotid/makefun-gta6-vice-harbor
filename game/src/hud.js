// Heads-up display and every full-screen menu. The HUD is deliberately
// diegetic: a seawall of information in the corners, city in the middle.

import { VIEW, PALETTE, FONT, FONT_MONO, CITY } from './config.js';
import { clamp, dist } from './random.js';
import { roundRect } from './render.js';

const STAR_COUNT = 6;

export class Hud {
  constructor() {
    this.time = 0;
    this.mapCache = null;
  }

  ensureMapCache(city) {
    const size = 172;
    if (this.mapCache && this.mapCache.city === city) return this.mapCache;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const c = canvas.getContext('2d');
    const scale = size / city.size;
    c.fillStyle = '#15141d';
    c.fillRect(0, 0, size, size);
    c.fillStyle = 'rgba(90,80,95,0.32)';
    for (const b of city.blocks) {
      c.fillRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale);
    }
    c.strokeStyle = 'rgba(232,220,196,0.5)';
    c.lineWidth = Math.max(2, city.roadWidth * scale);
    c.beginPath();
    for (const rx of city.roadXs) {
      c.moveTo(rx * scale, 0);
      c.lineTo(rx * scale, size);
    }
    for (const ry of city.roadYs) {
      c.moveTo(0, ry * scale);
      c.lineTo(size, ry * scale);
    }
    c.stroke();
    this.mapCache = { city, canvas, size, scale };
    return this.mapCache;
  }

  update(dt) {
    this.time += dt;
  }

  draw(ctx, game) {
    this.update(1 / 60);
    ctx.save();
    ctx.textBaseline = 'middle';
    this.drawMissionPanel(ctx, game);
    this.drawCash(ctx, game);
    this.drawHealth(ctx, game);
    this.drawMinimap(ctx, game);
    this.drawWanted(ctx, game);
    const driving = Boolean(game.player.vehicle);
    if (driving) {
      this.drawSpeedometer(ctx, game);
      if (game.radio) game.radio.draw(ctx, VIEW.width / 2 - 40, VIEW.height - 78);
    }
    this.drawBanner(ctx, game);
    this.drawToast(ctx, game);
    if (!driving && game.player.onFoot) this.drawOnFootHint(ctx, game);
    ctx.restore();
  }

  panel(ctx, x, y, w, h, radius = 10, alpha = 0.78) {
    roundRect(ctx, x, y, w, h, radius);
    ctx.fillStyle = `rgba(12,12,22,${alpha})`;
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  drawMissionPanel(ctx, game) {
    const manager = game.missions;
    const mission = manager?.current;
    if (!mission || game.state === 'menu') return;
    const w = 540;
    const h = 76;
    const x = (VIEW.width - w) / 2;
    const y = 16;
    ctx.save();
    this.panel(ctx, x, y, w, h, 12, 0.72);
    // Gold spine.
    ctx.fillStyle = PALETTE.mission;
    ctx.globalAlpha = 0.85;
    roundRect(ctx, x + 1, y + 12, 3, h - 24, 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = `10px ${FONT_MONO}`;
    const jobNo = Math.min(manager.index + 1, 6);
    ctx.fillText(`JOB ${jobNo} / 6`, x + 18, y + 18);
    ctx.fillStyle = PALETTE.mission;
    ctx.font = `700 18px ${FONT}`;
    ctx.fillText(mission.title, x + 90, y + 18);

    const objective = manager.objectiveText(game);
    ctx.font = `12.5px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    const maxWidth = w - 38;
    const trimmed = this.fitText(ctx, objective, maxWidth);
    ctx.fillText(trimmed, x + 18, y + 46);

    if (manager.target) {
      const d = dist(game.player.x, game.player.y, manager.target.x, manager.target.y);
      ctx.textAlign = 'right';
      ctx.fillStyle = PALETTE.textDim;
      ctx.font = `11px ${FONT_MONO}`;
      ctx.fillText(`${Math.round(d / 10)} M`, x + w - 16, y + 18);
    }

    // Timer bar for timed jobs.
    if (manager.timeLimit > 0 && manager.phase === 'active') {
      const ratio = clamp(manager.timeLeft / manager.timeLimit, 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      roundRect(ctx, x + 18, y + h - 12, w - 36, 4, 2);
      ctx.fill();
      ctx.fillStyle = ratio < 0.2 ? '#ff5b6e' : ratio < 0.45 ? '#ffb43e' : PALETTE.mission;
      roundRect(ctx, x + 18, y + h - 12, (w - 36) * ratio, 4, 2);
      ctx.fill();
    }
    ctx.restore();
  }

  fitText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let cut = text;
    while (cut.length > 4 && ctx.measureText(`${cut}…`).width > maxWidth) {
      cut = cut.slice(0, -1);
    }
    return `${cut}…`;
  }

  drawCash(ctx, game) {
    const x = 20;
    const y = 20;
    const w = 198;
    const h = 54;
    ctx.save();
    this.panel(ctx, x, y, w, h, 11, 0.76);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = `10px ${FONT_MONO}`;
    ctx.fillText('CASH', x + 16, y + 16);
    ctx.fillStyle = game.cashFlash > 0 ? '#ffffff' : PALETTE.money;
    ctx.font = `700 25px ${FONT}`;
    ctx.fillText(`$${Math.round(game.player.cash).toLocaleString('en-US')}`, x + 16, y + 35);
    // Tiny coin.
    ctx.beginPath();
    ctx.arc(x + w - 26, y + 28, 10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(143,226,122,0.14)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(143,226,122,0.5)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = PALETTE.money;
    ctx.font = `700 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('$', x + w - 26, y + 28);
    ctx.restore();
  }

  drawHealth(ctx, game) {
    const x = 20;
    const y = VIEW.height - 78;
    const w = 262;
    const h = 54;
    const pct = clamp(game.player.health / game.player.maxHealth, 0, 1);
    ctx.save();
    this.panel(ctx, x, y, w, h, 11, 0.76);
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = `10px ${FONT_MONO}`;
    ctx.fillText('VITALS', x + 16, y + 15);

    // Cross icon.
    ctx.fillStyle = pct < 0.3 ? '#ff5b6e' : 'rgba(255,255,255,0.6)';
    ctx.fillRect(x + w - 34, y + 10, 3, 11);
    ctx.fillRect(x + w - 38, y + 14, 11, 3);

    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    roundRect(ctx, x + 16, y + 27, w - 32, 12, 6);
    ctx.fill();
    const grad = ctx.createLinearGradient(x + 16, 0, x + 16 + w - 32, 0);
    grad.addColorStop(0, pct < 0.3 ? '#ff2f4a' : '#ff6a55');
    grad.addColorStop(1, pct < 0.3 ? '#ff6a7a' : '#8fe27a');
    ctx.fillStyle = grad;
    roundRect(ctx, x + 16, y + 27, Math.max(4, (w - 32) * pct), 12, 6);
    ctx.fill();
    const pulse = pct < 0.3 ? 0.55 + 0.45 * Math.sin(this.time * 7) : 0;
    if (pulse > 0) {
      ctx.globalAlpha = pulse * 0.35;
      ctx.fillStyle = '#ff2f4a';
      roundRect(ctx, x + 16, y + 27, Math.max(4, (w - 32) * pct), 12, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 10px ${FONT_MONO}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.ceil(game.player.health)}`, x + w - 16, y + 40);
    ctx.restore();
  }

  drawMinimap(ctx, game) {
    const size = 196;
    const x = VIEW.width - size - 22;
    const y = 20;
    const pad = 12;
    const inner = size - pad * 2;
    const city = game.city;
    const scale = inner / city.size;
    ctx.save();
    this.panel(ctx, x, y, size, size + 22, 12, 0.82);

    // Cached map background.
    const cache = this.ensureMapCache(city);
    roundRect(ctx, x + pad, y + pad, inner, inner, 7);
    ctx.fill();
    ctx.save();
    roundRect(ctx, x + pad, y + pad, inner, inner, 7);
    ctx.clip();
    ctx.drawImage(cache.canvas, x + pad, y + pad, inner, inner);

    // Camera viewport.
    const zoom = game.renderer?.camera.zoom ?? 1;
    const vw = (VIEW.width / zoom) * scale;
    const vh = (VIEW.height / zoom) * scale;
    const cam = game.renderer?.camera ?? { x: game.player.x, y: game.player.y };
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + pad + (cam.x - VIEW.width / (2 * zoom)) * scale, y + pad + (cam.y - VIEW.height / (2 * zoom)) * scale, vw, vh);

    // Mission marker.
    if (game.missions?.target) {
      const t = game.missions.target;
      const mx = x + pad + t.x * scale;
      const my = y + pad + t.y * scale;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
      ctx.fillStyle = PALETTE.mission;
      ctx.globalAlpha = 0.7 + pulse * 0.3;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-3.5, -3.5, 7, 7);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // Police.
    for (const cop of game.police) {
      if (cop.destroyed) continue;
      const px = x + pad + cop.x * scale;
      const py = y + pad + cop.y * scale;
      ctx.fillStyle = Math.sin(cop.sirenPhase) > 0 ? '#ff4d5e' : '#4f8dff';
      ctx.beginPath();
      ctx.arc(px, py, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player.
    const px = x + pad + game.player.x * scale;
    const py = y + pad + game.player.y * scale;
    const angle = game.player.vehicle ? game.player.vehicle.angle : game.player.aimAngle;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.4, 5);
    ctx.lineTo(0, 2.8);
    ctx.lineTo(-4.4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // Label bar.
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = `10px ${FONT_MONO}`;
    ctx.fillText(CITY.name.toUpperCase(), x + pad, y + size + 10);
    ctx.textAlign = 'right';
    const districts = city.districtNames ?? [CITY.name];
    const ratio = ((game.player.x / city.size + game.player.y / city.size) / 2 + 1) % 1;
    const district = districts[Math.min(districts.length - 1, Math.max(0, Math.floor(ratio * districts.length)))];
    ctx.fillText(String(district ?? CITY.name).toUpperCase(), x + size - pad, y + size + 10);
    ctx.restore();
  }

  drawWanted(ctx, game) {
    const wanted = clamp(game.wanted, 0, STAR_COUNT);
    const size = 22;
    const right = VIEW.width - 24;
    const y = 280;
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = `10px ${FONT_MONO}`;
    ctx.fillText('WANTED', right, y - 18);

    for (let i = 0; i < STAR_COUNT; i += 1) {
      const cx = right - 10 - (STAR_COUNT - 1 - i) * size;
      const lit = i < wanted;
      this.drawStar(ctx, cx, y, 8.2, lit);
    }

    // Evading meter: fills while out of sight, then stars begin to drop.
    const evade = game.evade;
    if (wanted > 0 && evade?.active) {
      const w = 176;
      const x = right - w;
      const by = y + 20;
      ctx.textAlign = 'left';
      ctx.fillStyle = evade.decaying ? PALETTE.money : PALETTE.mission;
      ctx.font = `700 10px ${FONT_MONO}`;
      ctx.fillText(evade.decaying ? 'LOSING THEM' : 'EVADING', x, by + 4);
      ctx.textAlign = 'right';
      ctx.fillStyle = PALETTE.textDim;
      ctx.fillText(evade.decaying ? 'STARS DROPPING' : `${Math.ceil(evade.countdown)}S`, right, by + 4);
      ctx.fillStyle = 'rgba(255,255,255,0.11)';
      roundRect(ctx, x, by + 12, w, 6, 3);
      ctx.fill();
      ctx.fillStyle = evade.decaying ? PALETTE.money : PALETTE.mission;
      roundRect(ctx, x, by + 12, w * clamp(evade.progress, 0, 1), 6, 3);
      ctx.fill();
    } else if (wanted > 0) {
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,91,110,0.9)';
      ctx.font = `700 10px ${FONT_MONO}`;
      ctx.fillText('IN PURSUIT', right, y + 24);
    }
    ctx.restore();
  }

  drawStar(ctx, cx, cy, r, lit) {
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const p = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.45;
      const px = cx + Math.cos(p) * rad;
      const py = cy + Math.sin(p) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    if (lit) {
      ctx.fillStyle = PALETTE.mission;
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawSpeedometer(ctx, game) {
    const vehicle = game.player.vehicle;
    if (!vehicle) return;
    const cx = VIEW.width - 104;
    const cy = VIEW.height - 92;
    const r = 58;
    const speed = Math.abs(vehicle.forwardSpeed) * 0.56;
    const maxSpeed = 230;
    const t = clamp(speed / maxSpeed, 0, 1);
    const start = Math.PI * 0.75;
    const end = Math.PI * 2.25;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12,12,22,0.8)';
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Gauge track and ticks.
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, end);
    ctx.stroke();
    const grad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
    grad.addColorStop(0, PALETTE.policeLightBlue);
    grad.addColorStop(0.6, PALETTE.mission);
    grad.addColorStop(1, PALETTE.health);
    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + (end - start) * t);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i <= 10; i += 1) {
      const a = start + (end - start) * (i / 10);
      const x1 = cx + Math.cos(a) * (r - 9);
      const y1 = cy + Math.sin(a) * (r - 9);
      const x2 = cx + Math.cos(a) * (r - 3);
      const y2 = cy + Math.sin(a) * (r - 3);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Needle.
    const needle = start + (end - start) * t;
    ctx.strokeStyle = '#fff3dc';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(needle) * 8, cy - Math.sin(needle) * 8);
    ctx.lineTo(cx + Math.cos(needle) * (r - 14), cy + Math.sin(needle) * (r - 14));
    ctx.stroke();
    ctx.fillStyle = '#fff3dc';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 22px ${FONT_MONO}`;
    ctx.fillText(`${Math.round(speed)}`, cx, cy + 23);
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = `8px ${FONT_MONO}`;
    ctx.fillText('KM/H', cx, cy + 37);

    // Gear and car name.
    ctx.textAlign = 'left';
    ctx.fillStyle = vehicle.forwardSpeed < -4 ? PALETTE.health : PALETTE.money;
    ctx.font = `700 11px ${FONT_MONO}`;
    ctx.fillText(vehicle.forwardSpeed < -4 ? 'R' : 'D', cx - 38, cy + 38);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = `9px ${FONT}`;
    ctx.fillText(vehicle.name.toUpperCase(), cx, cy + 50);

    // Vehicle condition, a thin arc under the dial.
    const hp = clamp(vehicle.health / vehicle.maxHealth, 0, 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 12, Math.PI * 0.68, Math.PI * 1.02);
    ctx.stroke();
    ctx.strokeStyle = hp < 0.3 ? PALETTE.health : hp < 0.6 ? PALETTE.mission : PALETTE.money;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 12, Math.PI * 0.68, Math.PI * (0.68 + 0.34 * hp));
    ctx.stroke();
    ctx.restore();
  }

  drawBanner(ctx, game) {
    const manager = game.missions;
    const banner = manager?.banner;
    if (!banner) return;
    const alpha = clamp(manager.bannerTimer * 1.8, 0, 1);
    const colors = {
      mission: PALETTE.mission,
      success: PALETTE.money,
      fail: '#ff5b6e',
      info: PALETTE.policeLightBlue,
    };
    const color = colors[banner.kind] ?? PALETTE.mission;
    const y = 174;
    const w = 600;
    const h = 78;
    const x = (VIEW.width - w) / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    this.panel(ctx, x, y, w, h, 12, 0.86);
    ctx.fillStyle = color;
    roundRect(ctx, x + 1, y + 1, w - 2, 3, 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.font = `700 19px ${FONT}`;
    ctx.fillText(banner.title, VIEW.width / 2, y + 27);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `13px ${FONT}`;
    ctx.fillText(this.fitText(ctx, banner.text, w - 44), VIEW.width / 2, y + 54);
    ctx.restore();
  }

  drawToast(ctx, game) {
    if (!game.toast || game.toast.timer <= 0) return;
    const alpha = clamp(game.toast.timer * 2, 0, 1);
    const text = game.toast.text;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `600 14px ${FONT}`;
    const w = Math.min(700, ctx.measureText(text).width + 44);
    const x = (VIEW.width - w) / 2;
    const y = VIEW.height * 0.36;
    roundRect(ctx, x, y - 18, w, 36, 9);
    ctx.fillStyle = 'rgba(10,10,18,0.8)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'center';
    ctx.fillText(text, VIEW.width / 2, y + 1);
    ctx.restore();
  }

  drawOnFootHint(ctx, game) {
    // A quiet control nudge for the first few seconds on foot.
    if (game.playTime > 12) return;
    const alpha = clamp((12 - game.playTime) / 3, 0, 1) * 0.8;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `11px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.textDim;
    const text = game.enterPrompt ? 'E · GET IN' : 'WASD MOVE  ·  SHIFT SPRINT  ·  MOUSE AIM / FIRE';
    ctx.fillText(text, VIEW.width / 2, VIEW.height - 28);
    ctx.restore();
  }

  // --- full-screen states ---------------------------------------------------

  drawStart(ctx, options) {
    const { hasSave, summary, intro } = options;
    const now = performance.now() / 1000;
    this.time = now;
    ctx.save();
    ctx.fillStyle = 'rgba(8,8,16,0.3)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    // Procedural sunset sun behind the title.
    ctx.save();
    const sunX = VIEW.width / 2;
    const sunY = 178;
    const sunR = 128;
    const sunGrad = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
    sunGrad.addColorStop(0, '#ffe08a');
    sunGrad.addColorStop(0.55, '#ff8a5c');
    sunGrad.addColorStop(1, '#ff4d9d');
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fillStyle = sunGrad;
    ctx.fill();
    // Horizontal slats cut out of the sun.
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 7; i += 1) {
      const y = sunY + 18 + i * 17;
      const thick = 3 + i * 1.7;
      ctx.fillRect(sunX - sunR - 4, y, sunR * 2 + 8, thick);
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';

    // Title.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const titleGrad = ctx.createLinearGradient(VIEW.width / 2 - 300, 0, VIEW.width / 2 + 300, 0);
    titleGrad.addColorStop(0, '#ffd166');
    titleGrad.addColorStop(0.45, '#ff7a8a');
    titleGrad.addColorStop(1, '#37e6ff');
    ctx.save();
    ctx.font = `900 94px ${FONT}`;
    ctx.shadowColor = 'rgba(255,77,157,0.55)';
    ctx.shadowBlur = 34;
    ctx.fillStyle = titleGrad;
    ctx.fillText('VICE HARBOR', VIEW.width / 2, 190);
    ctx.restore();
    ctx.font = `600 15px ${FONT_MONO}`;
    ctx.fillStyle = 'rgba(246,239,230,0.8)';
    ctx.fillText('A N   O P E N - W O R L D   C R I M E   S T O R Y', VIEW.width / 2, 250);

    // Story copy.
    if (intro && intro.length) {
      ctx.font = `13px ${FONT}`;
      ctx.fillStyle = 'rgba(246,239,230,0.8)';
      const text = intro.slice(0, 3).join('  ');
      this.wrapCentered(ctx, text, VIEW.width / 2, 326, 940, 19, 3);
    }

    // Controls panel.
    const panelW = 820;
    const panelH = 116;
    const px = (VIEW.width - panelW) / 2;
    const py = 392;
    this.panel(ctx, px, py, panelW, panelH, 13, 0.72);
    const controls = [
      ['WASD / ARROWS', 'WALK & DRIVE'],
      ['E', 'ENTER / EXIT CAR'],
      ['MOUSE', 'AIM & SHOOT'],
      ['SPACE', 'FIRE / HANDBRAKE'],
      ['R', 'CHANGE RADIO'],
      ['ESC', 'PAUSE'],
    ];
    const colW = panelW / 2;
    for (let i = 0; i < controls.length; i += 1) {
      const col = Math.floor(i / 3);
      const row = i % 3;
      const x = px + 30 + col * colW;
      const y = py + 28 + row * 31;
      this.keyCap(ctx, x, y, controls[i][0]);
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.text;
      ctx.font = `12px ${FONT_MONO}`;
      ctx.fillText(controls[i][1], x + 122, y + 1);
    }

    // Start prompt.
    const pulse = 0.78 + 0.22 * Math.sin(now * 3.2);
    ctx.textAlign = 'center';
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#fff3dc';
    ctx.shadowColor = 'rgba(255,209,102,0.6)';
    ctx.shadowBlur = 16;
    ctx.font = `700 27px ${FONT}`;
    ctx.fillText('PRESS ENTER TO START', VIEW.width / 2, 556);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    if (hasSave && summary) {
      const boxW = 480;
      const bx = (VIEW.width - boxW) / 2;
      this.panel(ctx, bx, 590, boxW, 46, 10, 0.74);
      ctx.textAlign = 'left';
      ctx.fillStyle = PALETTE.mission;
      ctx.font = `700 18px ${FONT_MONO}`;
      ctx.fillText('C', bx + 18, 613);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `600 14px ${FONT}`;
      ctx.fillText('CONTINUE SAVED GAME', bx + 46, 613);
      ctx.textAlign = 'right';
      ctx.fillStyle = PALETTE.textDim;
      ctx.font = `11px ${FONT_MONO}`;
      ctx.fillText(summary, bx + boxW - 16, 613);
    } else {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(185,177,174,0.6)';
      ctx.font = `11px ${FONT_MONO}`;
      ctx.fillText('NEW GAME  ·  AUTO-SAVES EVERY 15 SECONDS', VIEW.width / 2, 613);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(185,177,174,0.4)';
    ctx.font = `9px ${FONT_MONO}`;
    ctx.fillText('NO DOWNLOADS · NO ASSETS · EVERYTHING DRAWN IN CODE', VIEW.width / 2, VIEW.height - 22);
    ctx.restore();
  }

  wrapCentered(ctx, text, cx, y, maxWidth, lineHeight, maxLines) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
        if (lines.length >= maxLines) break;
      } else {
        line = test;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);
    ctx.textAlign = 'center';
    for (let i = 0; i < lines.length; i += 1) {
      ctx.fillText(lines[i], cx, y + i * lineHeight);
    }
  }

  keyCap(ctx, x, y, label) {
    ctx.font = `700 10px ${FONT_MONO}`;
    const w = Math.max(28, ctx.measureText(label).width + 14);
    roundRect(ctx, x, y - 11, w, 22, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + 1);
    ctx.textAlign = 'left';
    return w;
  }

  drawPause(ctx, game) {
    ctx.save();
    ctx.fillStyle = 'rgba(6,6,12,0.7)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const w = 560;
    const h = 330;
    const x = (VIEW.width - w) / 2;
    const y = (VIEW.height - h) / 2;
    this.panel(ctx, x, y, w, h, 16, 0.94);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.mission;
    ctx.font = `900 54px ${FONT}`;
    ctx.fillText('PAUSED', VIEW.width / 2, y + 72);
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = `10px ${FONT_MONO}`;
    ctx.fillText('VICE HARBOR  ·  THE CITY WAITS', VIEW.width / 2, y + 106);

    if (game.missions?.current) {
      ctx.fillStyle = PALETTE.text;
      ctx.font = `600 16px ${FONT}`;
      ctx.fillText(`${game.missions.current.title}`, VIEW.width / 2, y + 146);
      ctx.fillStyle = PALETTE.textDim;
      ctx.font = `12px ${FONT}`;
      ctx.fillText(this.fitText(ctx, game.missions.objectiveText(game), w - 80), VIEW.width / 2, y + 170);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x + 40, y + 194, w - 80, 1);

    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText('ESC  ·  RESUME', VIEW.width / 2, y + 236);
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = `12px ${FONT_MONO}`;
    ctx.fillText('M  ·  QUIT TO MAIN MENU     ·     CLICK BACK INTO THE CITY TO AIM', VIEW.width / 2, y + 274);
    ctx.restore();
  }

  drawGameOver(ctx, game) {
    ctx.save();
    ctx.fillStyle = 'rgba(20,2,8,0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const g = ctx.createLinearGradient(0, 220, 0, 420);
    g.addColorStop(0, 'rgba(90,0,12,0)');
    g.addColorStop(0.5, 'rgba(120,0,20,0.3)');
    g.addColorStop(1, 'rgba(90,0,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 220, VIEW.width, 200);

    ctx.textAlign = 'center';
    ctx.font = `900 104px ${FONT}`;
    ctx.fillStyle = '#ff2f4a';
    ctx.shadowColor = 'rgba(255,20,50,0.8)';
    ctx.shadowBlur = 40;
    ctx.fillText('WASTED', VIEW.width / 2, 250);
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.text;
    ctx.font = `15px ${FONT}`;
    ctx.fillText('Vice Harbor does not hand out second chances.', VIEW.width / 2, 316);

    this.statsRow(ctx, game, 370);

    ctx.fillStyle = '#fff3dc';
    ctx.font = `700 23px ${FONT}`;
    ctx.fillText('PRESS ENTER TO TRY AGAIN', VIEW.width / 2, 475);
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = `11px ${FONT_MONO}`;
    ctx.fillText('M  ·  MAIN MENU', VIEW.width / 2, 510);
    ctx.restore();
  }

  drawVictory(ctx, game) {
    ctx.save();
    ctx.fillStyle = 'rgba(10,8,4,0.7)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    const sun = ctx.createRadialGradient(VIEW.width / 2, 270, 10, VIEW.width / 2, 270, 380);
    sun.addColorStop(0, 'rgba(255,190,90,0.2)');
    sun.addColorStop(1, 'rgba(255,120,50,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    ctx.textAlign = 'center';
    ctx.font = `900 26px ${FONT_MONO}`;
    ctx.fillStyle = PALETTE.mission;
    ctx.fillText('THE LAST FERRY', VIEW.width / 2, 140);
    ctx.font = `900 84px ${FONT}`;
    const grad = ctx.createLinearGradient(VIEW.width / 2 - 300, 0, VIEW.width / 2 + 300, 0);
    grad.addColorStop(0, '#ffe08a');
    grad.addColorStop(0.5, '#ffd166');
    grad.addColorStop(1, '#ff8a5c');
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(255,209,102,0.5)';
    ctx.shadowBlur = 30;
    ctx.fillText('OUT OF THE HARBOR', VIEW.width / 2, 224);
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.text;
    ctx.font = `15px ${FONT}`;
    ctx.fillText('The ferry pulls away with Vega on deck, two tickets, and no explanation.', VIEW.width / 2, 282);
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = `13px ${FONT}`;
    ctx.fillText('Six jobs. One city behind you. The tide keeps its promises.', VIEW.width / 2, 306);

    this.statsRow(ctx, game, 360);

    ctx.fillStyle = '#fff3dc';
    ctx.font = `700 23px ${FONT}`;
    ctx.fillText('PRESS ENTER TO DRIVE AGAIN', VIEW.width / 2, 468);
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = `11px ${FONT_MONO}`;
    ctx.fillText('M  ·  MAIN MENU', VIEW.width / 2, 503);
    ctx.restore();
  }

  statsRow(ctx, game) {
    const stats = [
      ['CASH', `$${Math.round(game.player?.cash ?? 0).toLocaleString('en-US')}`],
      ['JOBS', `${game.stats?.missionsDone ?? 0} / 6`],
      ['TIME', formatTime(game.playTime ?? 0)],
      ['HEAT', `${game.wanted ?? 0} / 6`],
    ];
    const boxW = 170;
    const gap = 18;
    const total = stats.length * boxW + (stats.length - 1) * gap;
    const x0 = (VIEW.width - total) / 2;
    for (let i = 0; i < stats.length; i += 1) {
      const x = x0 + i * (boxW + gap);
      this.panel(ctx, x, 350, boxW, 66, 9, 0.7);
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.textDim;
      ctx.font = `9px ${FONT_MONO}`;
      ctx.fillText(stats[i][0], x + boxW / 2, 371);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `700 21px ${FONT}`;
      ctx.fillText(stats[i][1], x + boxW / 2, 396);
    }
  }
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}