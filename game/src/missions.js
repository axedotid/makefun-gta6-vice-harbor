// The story: six chained jobs that take Rook Calder from a borrowed car to
// the last boat out of Vice Harbor. Missions are pure data plus small checks;
// the manager owns briefing banners, timers, rewards and the chain.

import { dist, clamp } from './random.js';
import { Vehicle, PoliceCar } from './entities.js';
import { randomRoadPoint as worldRoadPoint } from './world.js';

export const STORY_INTRO = [
  'Vice Harbor never cools down. The sun hangs over the water and the whole city pretends it is not burning.',
  'Rook Calder walked out of Harbor Pen with a duffel, a debt, and one favour left to call in.',
  'Vega says six jobs, then the boat to Lisbon is yours. Six jobs in a town that eats its own.',
  'Take the wheel. The harbour belongs to you until the tide turns.',
];

function roadTarget(city, locationKey, label = null) {
  const loc = city.locations[locationKey];
  return { x: loc.x, y: loc.y, label: label ?? loc.label, kind: 'road' };
}

function roadsideSpawn(city, key, offset = 130) {
  const loc = city.locations[key];
  return {
    x: clamp(loc.x + Math.cos(loc.angle) * offset, 80, city.size - 80),
    y: clamp(loc.y + Math.sin(loc.angle) * offset, 80, city.size - 80),
    angle: loc.angle,
  };
}

function findTaggedVehicle(game, tag) {
  return game.vehicles.find((v) => v.missionTag === tag && !v.destroyed) ?? null;
}

function ensureMissionVehicle(game, tag, factory) {
  let car = findTaggedVehicle(game, tag);
  if (!car) {
    car = factory();
    game.vehicles.push(car);
  }
  return car;
}

export const MISSIONS = [
  {
    id: 'pickup',
    title: 'The Pickup',
    objective: 'Drive to the Sunset Market and collect Vega’s package.',
    reward: 900,
    setup(manager, game) {
      manager.target = roadTarget(game.city, 'market');
    },
    complete(manager, game) {
      if (!game.player.vehicle) return false;
      return dist(game.player.x, game.player.y, manager.target.x, manager.target.y) < 95;
    },
  },
  {
    id: 'test-drive',
    title: 'Test Drive',
    objective: 'Steal the lime Vice GT parked behind Rook’s Garage.',
    reward: 1600,
    setup(manager, game) {
      const spot = roadsideSpawn(game.city, 'garage', 150);
      manager.car = ensureMissionVehicle(game, 'vice-gt', () => new Vehicle({
        x: spot.x,
        y: spot.y,
        angle: spot.angle,
        color: '#75e39a',
        name: 'Vice GT',
        type: 'coupe',
        missionTag: 'vice-gt',
        parked: true,
        ai: false,
        health: 220,
      }));
      manager.target = { x: manager.car.x, y: manager.car.y, label: 'The Vice GT', kind: 'vehicle' };
    },
    update(manager, game) {
      if (manager.car && !manager.car.destroyed) {
        manager.target.x = manager.car.x;
        manager.target.y = manager.car.y;
      } else if (manager.car && manager.car.destroyed) {
        manager.fail('The Vice GT is scrap. Find another set of wheels.', game);
      }
    },
    complete(manager, game) {
      return Boolean(manager.car && game.player.vehicle === manager.car);
    },
  },
  {
    id: 'hot-cargo',
    title: 'Hot Cargo',
    objective: 'Deliver the cargo to the Overlook Pier. Beat the clock.',
    reward: 2200,
    timeLimit: 100,
    setup(manager, game) {
      manager.target = roadTarget(game.city, 'overlook');
    },
    complete(manager, game) {
      if (!game.player.vehicle) return false;
      return dist(game.player.x, game.player.y, manager.target.x, manager.target.y) < 100;
    },
  },
  {
    id: 'blue-light',
    title: 'Blue Light Special',
    objective: 'Steal the HCPD cruiser parked outside Harbor Precinct.',
    reward: 3000,
    setup(manager, game) {
      const spot = roadsideSpawn(game.city, 'precinct', 175);
      manager.car = ensureMissionVehicle(game, 'police-cruiser', () => {
        const cruiser = new PoliceCar(spot.x, spot.y, spot.angle);
        cruiser.missionTag = 'police-cruiser';
        cruiser.parked = true;
        cruiser.ai = false;
        cruiser.driver = null;
        cruiser.occupied = false;
        return cruiser;
      });
      manager.target = { x: manager.car.x, y: manager.car.y, label: 'HCPD Cruiser', kind: 'vehicle' };
    },
    update(manager, game) {
      if (manager.car && !manager.car.destroyed) {
        manager.target.x = manager.car.x;
        manager.target.y = manager.car.y;
      } else if (manager.car && manager.car.destroyed) {
        manager.fail('The cruiser is burning. Steal another one.', game);
      }
    },
    complete(manager, game) {
      return Boolean(manager.car && game.player.vehicle === manager.car);
    },
  },
  {
    id: 'heat-wave',
    title: 'Heat Wave',
    objective: 'Shake the HCPD. Stay unseen until the stars go dark.',
    reward: 3800,
    setup(manager, game) {
      game.setWanted(Math.max(3, game.wanted));
      manager.target = roadTarget(game.city, 'garage', 'Rook’s Garage');
    },
    complete(manager, game) {
      return game.wanted === 0;
    },
  },
  {
    id: 'last-ferry',
    title: 'The Last Ferry',
    objective: 'Reach the Docks before the ferry leaves. Do not stop.',
    reward: 15000,
    timeLimit: 120,
    setup(manager, game) {
      game.setWanted(Math.max(4, game.wanted));
      manager.target = roadTarget(game.city, 'docks', 'The Ferry');
    },
    complete(manager, game) {
      if (!game.player.vehicle) return false;
      return dist(game.player.x, game.player.y, manager.target.x, manager.target.y) < 110;
    },
  },
];

export class MissionManager {
  constructor() {
    this.index = -1;
    this.phase = 'idle'; // idle | active | complete | failed | done
    this.finished = false;
    this.target = null;
    this.car = null;
    this.timeLimit = 0;
    this.timeLeft = 0;
    this.missionTime = 0;
    this.phaseTimer = 0;
    this.banner = null;
    this.bannerTimer = 0;
    this.hintCooldown = 0;
    this.failReason = '';
    this.completedCount = 0;
    this.lastReward = 0;
  }

  get current() {
    return this.index >= 0 && this.index < MISSIONS.length ? MISSIONS[this.index] : null;
  }

  get activeMission() {
    return this.phase === 'active' ? this.current : null;
  }

  start(game) {
    this.begin(0, game);
  }

  begin(index, game) {
    this.index = index;
    this.phase = 'active';
    this.finished = false;
    this.phaseTimer = 0;
    this.missionTime = 0;
    this.completedCount = Math.max(this.completedCount, index);
    const mission = this.current;
    if (!mission) {
      this.finished = true;
      this.phase = 'done';
      this.target = null;
      this.banner = null;
      return;
    }
    this.timeLimit = mission.timeLimit ?? 0;
    this.timeLeft = this.timeLimit;
    this.car = null;
    this.target = null;
    this.failReason = '';
    mission.setup?.(this, game);
    this.showBanner(mission.title, mission.objective, 5.5, 'mission');
    game.radio?.switchTo?.(0);
  }

  showBanner(title, text, seconds = 4, kind = 'info') {
    this.banner = { title, text, kind };
    this.bannerTimer = seconds;
  }

  completeMission(game) {
    const mission = this.current;
    if (!mission) return;
    const reward = mission.reward ?? 0;
    this.lastReward = reward;
    game.player.cash += reward;
    game.stats.missionsDone += 1;
    game.stats.cashEarned += reward;
    this.completedCount += 1;
    this.phase = 'complete';
    this.phaseTimer = 3.2;
    this.target = null;
    this.failReason = '';
    this.showBanner(
      mission.id === 'last-ferry' ? 'THE LAST FERRY' : 'JOB COMPLETE',
      `${mission.title} — $${reward.toLocaleString('en-US')} wired to your pocket.`,
      3.2,
      'success',
    );
    game.onMissionComplete?.(mission, reward);
  }

  fail(reason, game) {
    if (this.phase !== 'active') return;
    this.phase = 'failed';
    this.phaseTimer = 3.4;
    this.failReason = reason;
    this.timeLeft = 0;
    this.showBanner('JOB BLOWN', reason, 3.4, 'fail');
    game.player.cash = Math.max(0, game.player.cash - 150);
  }

  restart(game) {
    this.begin(this.index, game);
  }

  objectiveText(game) {
    const mission = this.current;
    if (!mission) return '';
    if (this.phase === 'failed') return 'Job blown — regrouping…';
    if (this.phase === 'complete') return 'Job complete.';
    if (this.timeLimit > 0) {
      const t = Math.max(0, this.timeLeft);
      const mm = Math.floor(t / 60);
      const ss = Math.floor(t % 60).toString().padStart(2, '0');
      return `${mission.objective}  ·  ${mm}:${ss}`;
    }
    if (mission.id === 'heat-wave') {
      const d = Math.ceil(Math.max(0, game.evade?.countdown ?? 0));
      return `${mission.objective}${game.wanted > 0 ? `  ·  unseen for ${d}s` : ''}`;
    }
    return mission.objective;
  }

  update(dt, game) {
    this.bannerTimer = Math.max(0, this.bannerTimer - dt);
    if (this.bannerTimer <= 0) this.banner = null;
    this.hintCooldown = Math.max(0, this.hintCooldown - dt);

    if (this.phase === 'active') {
      const mission = this.current;
      if (!mission) return;
      this.missionTime += dt;
      mission.update?.(this, game);
      if (this.timeLimit > 0) {
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
          this.fail('The clock ran out. The cargo is lost.', game);
          return;
        }
      }
      if (mission.complete(this, game)) {
        this.completeMission(game);
        return;
      }
      if (mission.id === 'pickup' && this.target) {
        const onMarker = dist(game.player.x, game.player.y, this.target.x, this.target.y) < 110;
        if (onMarker && !game.player.vehicle && this.hintCooldown <= 0) {
          this.hintCooldown = 6;
          this.showBanner('NEED A RIDE', 'Get in a car and roll up to the marker.', 3, 'info');
        }
      }
    } else if (this.phase === 'complete' || this.phase === 'failed') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        if (this.phase === 'failed') {
          this.restart(game);
        } else if (this.index + 1 >= MISSIONS.length) {
          this.phase = 'done';
          this.finished = true;
          this.banner = null;
        } else {
          this.begin(this.index + 1, game);
        }
      }
    }
  }

  // Pick a random destination away from the player, for variety on replay.
  randomTarget(game, minDistance = 1100) {
    for (let i = 0; i < 16; i += 1) {
      const p = worldRoadPoint(Math.random, game.city);
      if (dist(p.x, p.y, game.player.x, game.player.y) > minDistance) {
        return { x: p.x, y: p.y, label: 'Drop Point', kind: 'road' };
      }
    }
    return { x: game.city.size / 2, y: game.city.size / 2, label: 'Drop Point', kind: 'road' };
  }
}
