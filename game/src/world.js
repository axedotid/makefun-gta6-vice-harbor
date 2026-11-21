// Procedural generation of Vice Harbor and the collision helpers the
// simulation uses. The city is a square grid of blocks between two-lane
// roads, with buildings, palms, streetlights, stunt ramps and named spots.

import { CITY, PALETTE } from './config.js';
import { createRandom, randRange, randInt, pick, clamp, dist } from './random.js';

const BUILDING_GAP = 22;

function makePalms(rng, x, y, w, h, margin, out) {
  const sides = [
    { x0: x + margin, y0: y + margin, x1: x + w - margin, y1: y + margin, angle: 0 },
    { x0: x + w - margin, y0: y + margin, x1: x + w - margin, y1: y + h - margin, angle: Math.PI / 2 },
    { x0: x + margin, y0: y + h - margin, x1: x + w - margin, y1: y + h - margin, angle: Math.PI },
    { x0: x + margin, y0: y + margin, x1: x + margin, y1: y + h - margin, angle: -Math.PI / 2 },
  ];
  for (const side of sides) {
    const count = rng() < 0.55 ? 1 : 0;
    for (let i = 0; i < count; i += 1) {
      const t = randRange(rng, 0.15, 0.85);
      out.push({
        x: side.x0 + (side.x1 - side.x0) * t,
        y: side.y0 + (side.y1 - side.y0) * t,
        size: randRange(rng, 22, 34),
        lean: randRange(rng, -0.28, 0.28),
        phase: rng() * Math.PI * 2,
        seed: Math.floor(rng() * 10000),
      });
    }
  }
}

function buildUrbanBlock(rng, block, city, district) {
  const usable = {
    x: block.x + CITY.sidewalk + 6,
    y: block.y + CITY.sidewalk + 6,
    w: block.w - (CITY.sidewalk + 6) * 2,
    h: block.h - (CITY.sidewalk + 6) * 2,
  };
  // Split the block into 1–4 lots with alleys between them.
  const cols = rng() < 0.55 ? 2 : 1;
  const rows = rng() < 0.55 ? 2 : 1;
  const lotW = (usable.w - BUILDING_GAP * (cols - 1)) / cols;
  const lotH = (usable.h - BUILDING_GAP * (rows - 1)) / rows;

  for (let ry = 0; ry < rows; ry += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      if (rng() < 0.14) continue; // empty lot / pocket plaza
      const lot = {
        x: usable.x + cx * (lotW + BUILDING_GAP),
        y: usable.y + ry * (lotH + BUILDING_GAP),
        w: lotW,
        h: lotH,
      };
      const w = Math.max(60, lot.w * randRange(rng, 0.62, 0.97));
      const h = Math.max(60, lot.h * randRange(rng, 0.62, 0.97));
      const bx = lot.x + randRange(rng, 0, lot.w - w);
      const by = lot.y + randRange(rng, 0, lot.h - h);
      const floors = randInt(rng, 2, 10);
      const neon = rng() < 0.62 ? pick(rng, PALETTE.neon) : null;
      city.buildings.push({
        x: bx,
        y: by,
        w,
        h,
        color: pick(rng, PALETTE.building),
        height: 28 + floors * 9,
        floors,
        seed: Math.floor(rng() * 100000),
        neon,
        neonSide: pick(rng, ['n', 's', 'e', 'w']),
        district,
        blockIndex: block.index,
      });
      block.buildings += 1;
      // A chance of a low annex hugging the main building.
      if (rng() < 0.22 && w > 150 && h > 150) {
        const aw = Math.min(w * 0.5, randRange(rng, 50, 90));
        const ah = Math.min(h * 0.5, randRange(rng, 50, 90));
        city.buildings.push({
          x: bx + (rng() < 0.5 ? w - aw - 8 : 8),
          y: by + (rng() < 0.5 ? h - ah - 8 : 8),
          w: aw,
          h: ah,
          color: pick(rng, PALETTE.building),
          height: 18 + rng() * 26,
          floors: 1,
          seed: Math.floor(rng() * 100000),
          neon: null,
          neonSide: 'n',
          district,
          blockIndex: block.index,
        });
        block.buildings += 1;
      }
    }
  }
  makePalms(rng, block.x, block.y, block.w, block.h, CITY.sidewalk + 8, city.palms);
}

function buildParkBlock(rng, block, city, district) {
  block.type = 'park';
  const pad = CITY.sidewalk + 10;
  city.parks.push({
    x: block.x + pad,
    y: block.y + pad,
    w: block.w - pad * 2,
    h: block.h - pad * 2,
    seed: Math.floor(rng() * 10000),
  });
  // Palms ring the lawn.
  const lawn = city.parks[city.parks.length - 1];
  for (let i = 0; i < 8; i += 1) {
    const edge = i % 4;
    const t = randRange(rng, 0.15, 0.85);
    let x = lawn.x + lawn.w * t;
    let y = lawn.y + 6;
    if (edge === 1) {
      x = lawn.x + lawn.w - 6;
      y = lawn.y + lawn.h * t;
    } else if (edge === 2) {
      x = lawn.x + lawn.w * t;
      y = lawn.y + lawn.h - 6;
    } else if (edge === 3) {
      x = lawn.x + 6;
      y = lawn.y + lawn.h * t;
    }
    city.palms.push({
      x,
      y,
      size: randRange(rng, 26, 40),
      lean: randRange(rng, -0.3, 0.3),
      phase: rng() * Math.PI * 2,
      seed: Math.floor(rng() * 10000),
    });
  }
  void district;
}

function buildParkingBlock(rng, block, city, district) {
  block.type = 'parking';
  const pad = CITY.sidewalk + 12;
  const lot = {
    x: block.x + pad,
    y: block.y + pad,
    w: block.w - pad * 2,
    h: block.h - pad * 2,
  };
  city.parkingLots.push(lot);
  // Parked cars nose-in along the top and bottom of the lot.
  const count = randInt(rng, 4, 8);
  for (let i = 0; i < count; i += 1) {
    const along = (i + 0.5) / count;
    const top = i % 2 === 0;
    city.parkedCars.push({
      x: lot.x + lot.w * along,
      y: top ? lot.y + 24 : lot.y + lot.h - 24,
      angle: top ? Math.PI / 2 : -Math.PI / 2,
      color: pick(rng, PALETTE.building),
      name: 'sedan',
      police: false,
    });
  }
  makePalms(rng, block.x, block.y, block.w, block.h, CITY.sidewalk + 8, city.palms);
  void district;
}

export function generateCity(config = CITY) {
  const rng = createRandom(config.seed || 1977);
  const tile = config.blockSize + config.roadWidth;
  const size = config.grid * tile + config.roadWidth;

  const roadXs = [];
  const roadYs = [];
  for (let i = 0; i <= config.grid; i += 1) {
    const c = config.roadWidth / 2 + i * tile;
    roadXs.push(c);
    roadYs.push(c);
  }

  const city = {
    name: config.name,
    grid: config.grid,
    blockSize: config.blockSize,
    roadWidth: config.roadWidth,
    laneOffset: config.laneOffset ?? 32,
    sidewalk: config.sidewalk ?? 26,
    tile,
    size,
    roadXs,
    roadYs,
    blocks: [],
    buildings: [],
    palms: [],
    lamps: [],
    ramps: [],
    parks: [],
    parkingLots: [],
    parkedCars: [],
    spawnPoints: { cars: [], pedestrians: [], parked: [] },
    locations: {},
    districtNames: config.districtNames,
  };

  const districts = config.districtNames || ['Vice Harbor'];
  let districtIndex = 0;
  for (let gy = 0; gy < config.grid; gy += 1) {
    for (let gx = 0; gx < config.grid; gx += 1) {
      const index = gy * config.grid + gx;
      const block = {
        index,
        gx,
        gy,
        x: config.roadWidth + gx * tile,
        y: config.roadWidth + gy * tile,
        w: config.blockSize,
        h: config.blockSize,
        type: 'urban',
        buildings: 0,
      };
      const roll = rng();
      if (roll < 0.1) {
        buildParkBlock(rng, block, city, districts[districtIndex % districts.length]);
      } else if (roll < 0.2) {
        buildParkingBlock(rng, block, city, districts[districtIndex % districts.length]);
      } else {
        buildUrbanBlock(rng, block, city, districts[districtIndex % districts.length]);
      }
      // Streetlights sit on the sidewalk at the midpoints of each edge.
      const inset = config.roadWidth / 2 + 10;
      const midX = block.x + block.w / 2;
      const midY = block.y + block.h / 2;
      city.lamps.push(
        { x: block.x + 6, y: midY, side: 'w' },
        { x: block.x + block.w - 6, y: midY, side: 'e' },
        { x: midX, y: block.y + 6, side: 'n' },
        { x: midX, y: block.y + block.h - 6, side: 's' },
      );
      void inset;
      city.blocks.push(block);
      if ((gx + gy) % 2 === 0) districtIndex += 1;
    }
  }

  // Sidewalk spawn points for pedestrians.
  for (let i = 0; i < 180; i += 1) {
    const block = pick(rng, city.blocks);
    const side = randInt(rng, 0, 3);
    const t = rng();
    const edge = config.sidewalk * 0.4;
    let x = block.x + edge;
    let y = block.y + edge;
    if (side === 0) {
      x = block.x + edge;
      y = block.y + edge + (block.h - edge * 2) * t;
    } else if (side === 1) {
      x = block.x + block.w - edge;
      y = block.y + edge + (block.h - edge * 2) * t;
    } else if (side === 2) {
      x = block.x + edge + (block.w - edge * 2) * t;
      y = block.y + edge;
    } else {
      x = block.x + edge + (block.w - edge * 2) * t;
      y = block.y + block.h - edge;
    }
    city.spawnPoints.pedestrians.push({ x, y });
  }

  // Road spawn points: pick a road and put the car in a lane.
  for (let i = 0; i < 220; i += 1) {
    const vertical = rng() < 0.5;
    const road = vertical ? pick(rng, roadXs) : pick(rng, roadYs);
    const along = randRange(rng, config.roadWidth, size - config.roadWidth);
    const lane = (rng() < 0.5 ? -1 : 1) * config.laneOffset;
    const x = vertical ? road + lane : along;
    const y = vertical ? along : road + lane;
    city.spawnPoints.cars.push({
      x,
      y,
      angle: vertical ? (lane > 0 ? Math.PI / 2 : -Math.PI / 2) : lane > 0 ? 0 : Math.PI,
    });
  }

  // Parked cars offered by the city generator.
  for (let i = 0; i < 18; i += 1) {
    const block = pick(rng, city.blocks);
    const side = randInt(rng, 0, 3);
    const off = config.roadWidth / 2 + 24;
    let x = block.x - off;
    let y = block.y + rng() * block.h;
    let angle = 0;
    if (side === 1) {
      x = block.x + block.w + off;
      y = block.y + rng() * block.h;
      angle = Math.PI;
    } else if (side === 2) {
      x = block.x + rng() * block.w;
      y = block.y - off;
      angle = Math.PI / 2;
    } else if (side === 3) {
      x = block.x + rng() * block.w;
      y = block.y + block.h + off;
      angle = -Math.PI / 2;
    }
    city.parkedCars.push({
      x,
      y,
      angle,
      color: pick(rng, PALETTE.building),
      name: 'sedan',
      police: false,
    });
  }

  // Five stunt ramps at fixed intersections, each pointing down a road.
  const rampSpecs = [
    { gx: 2, gy: 2, angle: 0 },
    { gx: 1, gy: 3, angle: Math.PI / 2 },
    { gx: 3, gy: 1, angle: Math.PI },
    { gx: 0, gy: 4, angle: -Math.PI / 2 },
    { gx: 4, gy: 0, angle: 0 },
  ];
  for (const spec of rampSpecs) {
    const cx = roadXs[spec.gx];
    const cy = roadYs[spec.gy];
    city.ramps.push({
      x: cx + Math.cos(spec.angle) * 96,
      y: cy + Math.sin(spec.angle) * 96,
      angle: spec.angle,
      width: 78,
      length: 124,
      height: 36,
      seed: city.ramps.length,
    });
  }

  // Named places give missions somewhere to point.
  const mid = Math.floor(config.grid / 2);
  const outer = config.grid;
  const at = (gx, gy) => ({ x: roadXs[clamp(gx, 0, outer)], y: roadYs[clamp(gy, 0, outer)] });
  city.locations = {
    docks: { ...at(outer, outer - 1), angle: -Math.PI / 2, label: 'The Docks' },
    precinct: { ...at(1, 1), angle: Math.PI / 2, label: 'Harbor Precinct' },
    club: { ...at(mid, mid), angle: 0, label: 'Club Neón' },
    garage: { ...at(0, outer - 1), angle: 0, label: 'Rook’s Garage' },
    overlook: { ...at(outer, 0), angle: Math.PI / 2, label: 'Overlook Pier' },
    market: { ...at(0, 0), angle: 0, label: 'Sunset Market' },
  };
  for (const key of Object.keys(city.locations)) {
    const loc = city.locations[key];
    loc.marker = { x: loc.x, y: loc.y };
  }

  const spawnRoad = Math.min(config.grid, Math.floor(config.grid / 2));
  city.spawn = {
    player: {
      x: roadXs[spawnRoad] + config.laneOffset,
      y: (roadYs[spawnRoad] + roadYs[spawnRoad + 1]) / 2,
      angle: -Math.PI / 2,
    },
  };
  return city;
}

export function clampToWorld(x, y, city, margin = 28) {
  return {
    x: clamp(x, margin, city.size - margin),
    y: clamp(y, margin, city.size - margin),
  };
}

export function nearestRoadCoord(v, city) {
  let best = city.roadXs[0];
  let bestDist = Math.abs(v - best);
  for (const c of city.roadXs) {
    const d = Math.abs(v - c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  for (const c of city.roadYs) {
    const d = Math.abs(v - c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

export function isOnRoad(x, y, city, tolerance = 0) {
  const half = city.roadWidth / 2 + tolerance;
  for (const rx of city.roadXs) if (Math.abs(x - rx) <= half) return true;
  for (const ry of city.roadYs) if (Math.abs(y - ry) <= half) return true;
  return false;
}

export function circleIntersectsRect(x, y, r, rect) {
  const nx = clamp(x, rect.x, rect.x + rect.w);
  const ny = clamp(y, rect.y, rect.y + rect.h);
  const dx = x - nx;
  const dy = y - ny;
  return dx * dx + dy * dy < r * r;
}

export function circleHitsBuilding(x, y, r, city) {
  for (const b of city.buildings) {
    if (circleIntersectsRect(x, y, r, b)) return b;
  }
  return null;
}

// Resolve a circle out of a rectangle. Returns the corrected centre and normal,
// or null when there was no overlap.
export function resolveCircleRect(x, y, r, rect) {
  const nx = clamp(x, rect.x, rect.x + rect.w);
  const ny = clamp(y, rect.y, rect.y + rect.h);
  let dx = x - nx;
  let dy = y - ny;
  let d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;

  if (d2 > 0.00001) {
    const d = Math.sqrt(d2);
    const push = r - d + 0.01;
    return { x: x + (dx / d) * push, y: y + (dy / d) * push, nx: dx / d, ny: dy / d, depth: push };
  }

  // Centre is inside the rectangle: push out through the nearest edge.
  const left = x - rect.x;
  const right = rect.x + rect.w - x;
  const top = y - rect.y;
  const bottom = rect.y + rect.h - y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: rect.x - r, y, nx: -1, ny: 0, depth: left + r };
  if (m === right) return { x: rect.x + rect.w + r, y, nx: 1, ny: 0, depth: right + r };
  if (m === top) return { x, y: rect.y - r, nx: 0, ny: -1, depth: top + r };
  return { x, y: rect.y + rect.h + r, nx: 0, ny: 1, depth: bottom + r };
}

// Is (x, y) over one of the five stunt ramps? Returns the ramp and the
// 0..1 progress along it (0 at the foot, 1 at the lip).
export function rampAt(x, y, city) {
  for (const ramp of city.ramps) {
    const c = Math.cos(ramp.angle);
    const s = Math.sin(ramp.angle);
    const dx = x - ramp.x;
    const dy = y - ramp.y;
    const along = dx * c + dy * s;
    const across = -dx * s + dy * c;
    if (along >= -ramp.length / 2 && along <= ramp.length / 2 && Math.abs(across) <= ramp.width / 2) {
      return { ramp, progress: (along + ramp.length / 2) / ramp.length };
    }
  }
  return null;
}

// A random point on a road lane, useful for traffic, police and missions.
export function randomRoadPoint(rng, city, options = {}) {
  const vertical = options.vertical ?? rng() < 0.5;
  const roads = vertical ? city.roadXs : city.roadYs;
  const road = pick(rng, roads);
  const lane = (options.lane ?? (rng() < 0.5 ? -1 : 1)) * city.laneOffset;
  const min = options.min ?? city.roadWidth;
  const max = options.max ?? city.size - city.roadWidth;
  const along = randRange(rng, min, Math.max(min + 1, max));
  return {
    x: vertical ? road + lane : along,
    y: vertical ? along : road + lane,
    angle: vertical ? (lane > 0 ? Math.PI / 2 : -Math.PI / 2) : lane > 0 ? 0 : Math.PI,
    vertical,
  };
}

// Nearest point on the road network, used to keep spawned AI on asphalt.
export function snapToRoad(x, y, city, laneBias = 1) {
  const dx = nearestRoadCoord(x, city);
  const dy = nearestRoadCoord(y, city);
  if (Math.abs(x - dx) < Math.abs(y - dy)) {
    return { x: dx + city.laneOffset * laneBias, y };
  }
  return { x, y: dy + city.laneOffset * laneBias };
}

export function nearestVehicle(x, y, vehicles, maxDistance = 70, filter = null) {
  let best = null;
  let bestDist = maxDistance;
  for (const v of vehicles) {
    if (filter && !filter(v)) continue;
    const d = dist(x, y, v.x, v.y);
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  return best;
}