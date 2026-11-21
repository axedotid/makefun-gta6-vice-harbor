// Three fictional radio stations for the drive. No audio, just the panel and
// the fiction of a city that still listens to the airwaves.

import { VIEW, PALETTE, FONT, FONT_MONO } from './config.js';

const STATIONS = [
  {
    name: 'The Tide',
    frequency: '91.7 FM',
    tagline: 'Sunset synth, all night',
    color: '#ff4d9d',
    tracks: ['Chrome Sunset', 'Saltwater Static', 'Harbor Lights', 'Every Light Is Lying'],
  },
  {
    name: 'Coral FM',
    frequency: '104.2 FM',
    tagline: 'Soft rock for hard people',
    color: '#37e6ff',
    tracks: ['Slow Cab to Nowhere', 'Palm Reading', 'Low Tide Radio', 'Dashboard Saints'],
  },
  {
    name: 'Night Shift',
    frequency: '88.1 FM',
    tagline: 'Darkwave from the docks',
    color: '#b46bff',
    tracks: ['Static Gospel', 'Six Stars', 'Bad Weather Friend', 'No Exit on the Causeway'],
  },
];

const TRACK_SECONDS = 96;

export class Radio {
  constructor() {
    this.stationIndex = 0;
    this.trackIndex = 0;
    this.trackTime = 0;
    this.trackDuration = TRACK_SECONDS;
    this.time = 0;
    this.staticPulse = 0;
  }

  station() {
    return STATIONS[this.stationIndex];
  }

  current() {
    const station = this.station();
    return {
      ...station,
      track: station.tracks[this.trackIndex],
      trackIndex: this.trackIndex,
    };
  }

  cycle() {
    this.stationIndex = (this.stationIndex + 1) % STATIONS.length;
    this.trackIndex = 0;
    this.trackTime = 0;
    this.staticPulse = 1;
    return this.current();
  }

  switchTo(index) {
    if (index >= 0 && index < STATIONS.length && index !== this.stationIndex) {
      this.stationIndex = index;
      this.trackIndex = 0;
      this.trackTime = 0;
      this.staticPulse = 1;
    }
    return this.current();
  }

  nextTrack() {
    const station = this.station();
    this.trackIndex = (this.trackIndex + 1) % station.tracks.length;
    this.trackTime = 0;
  }

  update(dt) {
    this.time += dt;
    this.trackTime += dt;
    this.staticPulse = Math.max(0, this.staticPulse - dt * 2.5);
    if (this.trackTime >= this.trackDuration) this.nextTrack();
  }

  draw(ctx, x = VIEW.width / 2, y = VIEW.height - 126) {
    const station = this.station();
    const w = 372;
    const h = 78;
    const left = x - w / 2;
    const top = y - h / 2;
    const now = this.time;

    ctx.save();
    ctx.globalAlpha = 0.96;
    roundedRect(ctx, left, top, w, h, 12);
    ctx.fillStyle = 'rgba(13,14,24,0.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // A thin station-coloured strip along the top.
    ctx.fillStyle = station.color;
    ctx.globalAlpha = 0.85;
    roundedRect(ctx, left + 1, top + 1, w - 2, 3, 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Frequency + station.
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `600 11px ${FONT_MONO}`;
    ctx.fillStyle = PALETTE.textDim;
    ctx.fillText('RADIO', left + 16, top + 19);
    ctx.fillStyle = station.color;
    ctx.font = `700 16px ${FONT}`;
    ctx.fillText(station.frequency, left + 58, top + 19);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 14px ${FONT}`;
    ctx.fillText(station.name, left + 148, top + 19);
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = `10px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(station.tagline, left + w - 16, top + 19);

    // Now playing.
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = `9px ${FONT_MONO}`;
    ctx.fillText('NOW PLAYING', left + 16, top + 44);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText(`“${station.tracks[this.trackIndex]}”`, left + 16, top + 61);

    // Animated equaliser on the right.
    const bars = 6;
    const barX = left + w - 82;
    const baseY = top + h - 16;
    for (let i = 0; i < bars; i += 1) {
      const phase = now * (3.1 + i * 0.6) + i * 1.7;
      const amp = 6 + Math.abs(Math.sin(phase)) * 17 + (this.staticPulse > 0 ? 8 : 0);
      ctx.fillStyle = station.color;
      ctx.globalAlpha = 0.5 + (i / bars) * 0.4;
      roundedRect(ctx, barX + i * 9, baseY - amp, 5, amp, 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Little dial dots.
    for (let i = 0; i < STATIONS.length; i += 1) {
      ctx.beginPath();
      ctx.arc(left + w - 26 - (STATIONS.length - 1 - i) * 12, top + 25, 3, 0, Math.PI * 2);
      ctx.fillStyle = i === this.stationIndex ? station.color : 'rgba(255,255,255,0.22)';
      ctx.fill();
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.textDim;
    ctx.font = `9px ${FONT_MONO}`;
    ctx.fillText('R  ·  TUNE', left + 16, top + h - 6);
    ctx.restore();
  }
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}