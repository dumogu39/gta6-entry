// Drawing only: the world's state in, pixels out. It paints the city (asphalt, sidewalks, buildings,
// parks, neon), then the cars, pedestrians, targets, bullets, particles and the player, then the HUD
// on top. The camera follows the player and shakes on impacts; a minimap of the city is rasterised
// once and re-used every frame. No rules live here, only how things look.
import { CAMERA, CITY, DISTRICT_STYLE, FONT, PALETTE, PLAYER, VIEW } from './config.js';
import { currentWeapon } from './world.js';
import { drawHud } from './hud.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** A deterministic [0,1) hash, so decorative details repeat exactly for a given seed. */
function h01(n) {
  const s = Math.sin(n) * 43758.5453123;
  return s - Math.floor(s);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  let minimap = null;
  let dpr = 1;
  let cam = { x: 0, y: 0 };
  const fonts = new Map();
  const ZOOM = CAMERA.zoom;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    view.scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    view.x = (canvas.width - VIEW.width * view.scale) / 2;
    view.y = (canvas.height - VIEW.height * view.scale) / 2;
  }

  /** Map a canvas CSS-pixel pointer coordinate to world coordinates. */
  function toWorld(sx, sy) {
    const s = view.scale * ZOOM;
    const cx = sx * dpr;
    const cy = sy * dpr;
    const lx = (cx - view.x) / s;
    const ly = (cy - view.y) / s;
    return { x: cam.x + lx, y: cam.y + ly };
  }

  function font(size, weight) {
    const key = `${size}-${weight}`;
    if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align = 'left', weight = 'normal') {
    ctx.font = font(size, weight);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
  }

  function rasterMinimap(city) {
    const scale = 200 / city.world;
    const c = document.createElement('canvas');
    c.width = 200;
    c.height = 200;
    const m = c.getContext('2d');
    m.fillStyle = PALETTE.sidewalk;
    m.fillRect(0, 0, 200, 200);
    // roads
    m.fillStyle = PALETTE.asphalt;
    for (let k = 0; k <= city.grid; k += 1) {
      const cc = (CITY.road / 2 + k * CITY.cell) * scale;
      const w = CITY.road * scale;
      m.fillRect(0, cc - w / 2, 200, w);
      m.fillRect(cc - w / 2, 0, w, 200);
    }
    // blocks (buildings tinted, parks green)
    for (const b of city.blocks) {
      if (b.park) {
        m.fillStyle = PALETTE.park;
      } else {
        const style = DISTRICT_STYLE[b.district];
        m.fillStyle = style.roof[0];
      }
      m.fillRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale);
    }
    return c;
  }

  function cameraFor(game) {
    const world = game.city.world;
    const p = game.player;
    const halfW = VIEW.width / (2 * ZOOM);
    const halfH = VIEW.height / (2 * ZOOM);
    let x = clamp(p.x - halfW, 0, Math.max(0, world - VIEW.width / ZOOM));
    let y = clamp(p.y - halfH, 0, Math.max(0, world - VIEW.height / ZOOM));
    if (game.shake > 0) {
      x += (game.random() - 0.5) * game.shake * 14;
      y += (game.random() - 0.5) * game.shake * 14;
    }
    return { x, y };
  }

  function visible(cam, x, y, w, h, pad = 0) {
    return x + w >= cam.x - pad && x <= cam.x + VIEW.width + pad && y + h >= cam.y - pad && y <= cam.y + VIEW.height + pad;
  }

  function drawCity(game, cam) {
    const city = game.city;
    const world = city.world;
    ctx.fillStyle = PALETTE.sidewalk;
    ctx.fillRect(cam.x, cam.y, VIEW.width, VIEW.height);

    // Roads (asphalt strips), culled to the view.
    ctx.fillStyle = PALETTE.asphalt;
    for (let k = 0; k <= city.grid; k += 1) {
      const c = CITY.road / 2 + k * CITY.cell;
      const half = CITY.road / 2;
      const top = c - half;
      if (top < cam.y + VIEW.height && top + CITY.road > cam.y) {
        ctx.fillRect(cam.x, top, VIEW.width, CITY.road);
      }
      if (c - half < cam.x + VIEW.width && c + half > cam.x) {
        ctx.fillRect(c - half, cam.y, CITY.road, VIEW.height);
      }
    }

    // Centre road markings.
    ctx.fillStyle = PALETTE.asphaltLine;
    for (let k = 0; k <= city.grid; k += 1) {
      const c = CITY.road / 2 + k * CITY.cell;
      if (c > cam.y - 6 && c < cam.y + VIEW.height + 6) {
        for (let x = Math.floor(cam.x / 46) * 46; x < cam.x + VIEW.width; x += 46) {
          ctx.fillRect(x, c - 1.5, 22, 3);
        }
      }
      if (c > cam.x - 6 && c < cam.x + VIEW.width + 6) {
        for (let y = Math.floor(cam.y / 46) * 46; y < cam.y + VIEW.height; y += 46) {
          ctx.fillRect(c - 1.5, y, 3, 22);
        }
      }
    }

    drawSkidMarks(city, cam);

    // Parks first (under nothing else), then buildings.
    for (const b of city.blocks) {
      if (!visible(cam, b.x, b.y, b.w, b.h)) continue;
      if (b.park) drawPark(b);
      else for (const bd of b.buildings) drawBuilding(bd, b.district);
    }
  }

  /** Faint hard-brake streaks laid down just before each intersection. */
  function drawSkidMarks(city, cam) {
    ctx.fillStyle = PALETTE.skid;
    const lane = CITY.road / 4;
    for (let k = 0; k <= city.grid; k += 1) {
      const c = CITY.road / 2 + k * CITY.cell;
      if (c < cam.y - 48 || c > cam.y + VIEW.height + 48) continue;
      for (let j = 0; j <= city.grid; j += 1) {
        const jc = CITY.road / 2 + j * CITY.cell;
        if (jc < cam.x - 48 || jc > cam.x + VIEW.width + 48) continue;
        ctx.fillRect(jc - CITY.road / 2 - 28, c - lane - 1.5, 20, 3);
        ctx.fillRect(jc - CITY.road / 2 - 28, c + lane - 1.5, 20, 3);
        ctx.fillRect(jc - lane - 1.5, c - CITY.road / 2 - 28, 3, 20);
        ctx.fillRect(jc + lane - 1.5, c - CITY.road / 2 - 28, 3, 20);
      }
    }
  }

  function drawPark(b) {
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = PALETTE.parkDark;
    const t = b.x + b.w / 2;
    const ty = b.y + b.h / 2;
    const off = Math.min(b.w, b.h) * 0.18;
    for (let i = 0; i < 3; i += 1) {
      const ox = (i - 1) * off;
      ctx.beginPath();
      ctx.arc(t + ox, ty - off * 0.5, Math.min(b.w, b.h) * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBuilding(bd, district) {
    // Long sunset shadow cast toward the lower-right, drawn beneath the building itself.
    ctx.fillStyle = PALETTE.shadowLong;
    ctx.fillRect(bd.x + 12, bd.y + 12, bd.w, bd.h);
    ctx.fillStyle = bd.roof;
    ctx.fillRect(bd.x, bd.y, bd.w, bd.h);
    ctx.fillStyle = bd.color;
    ctx.fillRect(bd.x + 3, bd.y + 3, bd.w - 6, bd.h - 6);
    drawWindows(bd, district);
    if (bd.neon) drawNeon(bd);
    else if (h01(bd.detail * 7) > 0.5) drawNeonSign(bd, district);
    drawRoofDetails(bd, district);
  }

  function drawWindows(bd, district) {
    if (district === 'downtown') {
      const step = 20;
      let wi = 0;
      for (let x = bd.x + 12; x < bd.x + bd.w - 12; x += step) {
        for (let y = bd.y + 12; y < bd.y + bd.h - 12; y += step) {
          wi += 1;
          const lit = h01(bd.detail * 100 + wi) < 0.42;
          ctx.fillStyle = lit ? PALETTE.windowLit : PALETTE.windowDim;
          ctx.fillRect(x, y, 7, 9);
        }
      }
    } else {
      const step = 30;
      let wi = 0;
      for (let x = bd.x + 16; x < bd.x + bd.w - 14; x += step) {
        for (let y = bd.y + 16; y < bd.y + bd.h - 14; y += step) {
          wi += 1;
          if (h01(bd.detail * 40 + wi) < 0.34) {
            ctx.fillStyle = PALETTE.windowLit;
            ctx.fillRect(x, y, 6, 8);
          }
        }
      }
    }
  }

  function drawNeon(bd) {
    const barY = bd.y + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(bd.x + 8, barY - 2, bd.w - 16, 6);
    ctx.save();
    ctx.shadowColor = bd.neon;
    ctx.shadowBlur = 14;
    ctx.fillStyle = bd.neon;
    ctx.fillRect(bd.x + 8, barY, bd.w - 16, 3);
    for (let x = bd.x + 12; x < bd.x + bd.w - 22; x += 16) {
      ctx.fillRect(x, barY - 2, 9, 2);
    }
    ctx.restore();
  }

  function drawNeonSign(bd, district) {
    const colors = DISTRICT_STYLE[district].neon;
    if (!colors || colors.length === 0) return;
    const color = colors[Math.floor(h01(bd.detail * 13) * colors.length) % colors.length];
    const signW = Math.max(26, bd.w * 0.5);
    const sx = bd.x + (bd.w - signW) / 2;
    const sy = bd.y + bd.h * 0.25;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = color;
    ctx.fillRect(sx, sy, signW, 3);
    ctx.restore();
  }

  function drawRoofDetails(bd, district) {
    const d = bd.detail;
    // Rooftop AC units, scattered near the roof edges.
    const n = 1 + Math.floor(h01(d * 31) * 2);
    for (let i = 0; i < n; i += 1) {
      const ax = bd.x + 12 + h01(d * 7 + i) * Math.max(0, bd.w - 44);
      const ay = bd.y + 12 + h01(d * 11 + i) * Math.max(0, bd.h - 34);
      ctx.fillStyle = 'rgba(20,20,30,0.55)';
      ctx.fillRect(ax, ay, 18, 12);
      ctx.fillStyle = 'rgba(90,90,110,0.35)';
      ctx.fillRect(ax + 3, ay + 3, 12, 6);
    }
    // Water tower on larger roofs.
    if ((district === 'industrial' || bd.tower) && d > 0.45) {
      const tx = bd.x + bd.w * (0.3 + h01(d * 17) * 0.4);
      const ty = bd.y + bd.h * (0.3 + h01(d * 19) * 0.4);
      ctx.fillStyle = '#2e2620';
      ctx.beginPath();
      ctx.arc(tx, ty, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1d1813';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(tx, ty, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      ctx.arc(tx, ty, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Skylight panel near the roof centre.
    if (d > 0.5) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(bd.x + bd.w * 0.32, bd.y + bd.h * 0.32, bd.w * 0.36, bd.h * 0.36);
    }
  }

  function drawExhaust(car, time) {
    const sp = Math.abs(car.speed);
    if (sp < 50) return;
    const L = car.vehicle.length;
    const W = car.vehicle.width;
    const puffs = 3;
    for (let i = 0; i < puffs; i += 1) {
      const t = (time * 1.7 + i / puffs + car.id * 0.371) % 1;
      const ex = -L / 2 - 2 - t * 18;
      const ey = (i - (puffs - 1) / 2) * (W * 0.22);
      ctx.fillStyle = `rgba(150,150,168,${(0.22 * (1 - t)).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(ex, ey, 1.8 + t * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCar(car, time) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    const L = car.vehicle.length;
    const W = car.vehicle.width;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-L / 2 + 5, -W / 2 + 5, L, W);
    ctx.fillStyle = car.color;
    ctx.fillRect(-L / 2, -W / 2, L, W);
    // roof/windshield
    ctx.fillStyle = 'rgba(15,18,26,0.75)';
    ctx.fillRect(-L / 2 + L * 0.12, -W / 2 + 2, L * 0.2, W - 4);
    ctx.fillRect(-L / 2 + L * 0.5, -W / 2 + 2, L * 0.3, W - 4);
    // headlights
    ctx.fillStyle = '#fff3b0';
    ctx.fillRect(L / 2 - 2, -W / 2 + 2, 2, 3);
    ctx.fillRect(L / 2 - 2, W / 2 - 5, 2, 3);
    // taillights
    ctx.fillStyle = '#ff4d4d';
    ctx.fillRect(-L / 2, -W / 2 + 2, 2, 3);
    ctx.fillRect(-L / 2, W / 2 - 5, 2, 3);
    if (car.state === 'police' || car.type === 7) {
      const flash = Math.floor(time * 6) % 2 === 0;
      ctx.fillStyle = flash ? '#ff3b30' : '#3b82ff';
      ctx.fillRect(-L / 4, -W / 2 - 2, L / 2, 3);
    }
    if (car.missionCar) {
      ctx.strokeStyle = PALETTE.magenta;
      ctx.lineWidth = 2;
      ctx.strokeRect(-L / 2 - 3, -W / 2 - 3, L + 6, W + 6);
    }
    drawExhaust(car, time);
    ctx.restore();
  }

  function drawPed(ped) {
    if (!ped.alive) return;
    const skin = ['#e0ac69', '#c68642', '#8d5524', '#f1c27d', '#b06a3b', '#7a4a28'];
    const shirt = ['#5a8ec9', '#c95d5d', '#57a06b', '#9c7bd4', '#d9a05b'];
    ctx.fillStyle = shirt[ped.skin % shirt.length];
    ctx.beginPath();
    ctx.arc(ped.x, ped.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin[ped.skin];
    ctx.beginPath();
    ctx.arc(ped.x + Math.cos(ped.angle) * 5, ped.y + Math.sin(ped.angle) * 5, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTarget(t) {
    if (!t.alive) return;
    ctx.fillStyle = t.color;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e0ac69';
    ctx.beginPath();
    ctx.arc(t.x + 4, t.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    if (t.hitT > 0) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawPlayer(game, time) {
    const p = game.player;
    if (p.mode === 'drive') return;
    ctx.fillStyle = '#2b2b33';
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER.radius + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8d5b0';
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER.radius, 0, Math.PI * 2);
    ctx.fill();
    // facing + weapon
    const a = p.angle;
    ctx.strokeStyle = '#2b2b33';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(a) * 6, p.y + Math.sin(a) * 6);
    ctx.lineTo(p.x + Math.cos(a) * (PLAYER.radius + 8), p.y + Math.sin(a) * (PLAYER.radius + 8));
    ctx.stroke();
    const w = currentWeapon(game);
    if (w.kind === 'gun') {
      ctx.fillStyle = '#1c1c22';
      ctx.fillRect(p.x + Math.cos(a) * 10 - 1.5, p.y + Math.sin(a) * 10 - 1.5, 3, 12);
    }
  }

  function drawEffects(game, cam) {
    for (const e of game.effects) {
      if (!visible(cam, e.x - 40, e.y - 20, 80, 40)) continue;
      text(e.text, e.x, e.y - (1.2 - e.t) * 20, 15, e.color, 'center', 'bold');
    }
    for (const pt of game.particles) {
      ctx.globalAlpha = Math.max(0, pt.life);
      ctx.fillStyle = pt.color;
      const hot = pt.color === '#ffd166' || pt.color === '#ff6b3d' || pt.color === '#ff6b6b';
      if (hot) {
        ctx.shadowColor = pt.color;
        ctx.shadowBlur = 6;
      }
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
      if (hot) ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    for (const b of game.bullets) {
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** A warm sunset wash over the whole world, drawn once the scene is composed. */
  function drawSunset(cam) {
    const g = ctx.createLinearGradient(0, cam.y, 0, cam.y + VIEW.height);
    g.addColorStop(0, PALETTE.sunsetTop);
    g.addColorStop(0.5, PALETTE.sunsetMid);
    g.addColorStop(1, PALETTE.sunsetBottom);
    ctx.fillStyle = g;
    ctx.fillRect(cam.x, cam.y, VIEW.width, VIEW.height);
  }

  function drawRoadblocks(game, time) {
    for (const rb of game.roadblocks) {
      ctx.save();
      ctx.translate(rb.x, rb.y);
      ctx.rotate(rb.angle);
      ctx.fillStyle = '#f2c14e';
      for (let i = -1; i <= 1; i += 1) {
        ctx.fillRect(i * 16 - 4, -6, 8, 12);
      }
      ctx.restore();
    }
    void time;
  }

  function drawObjective(game, cam) {
    const o = game.objective;
    if (!o || o.x === undefined) return;
    const sx = o.x - cam.x;
    const sy = o.y - cam.y;
    const onScreen = sx > 20 && sx < VIEW.width - 20 && sy > 20 && sy < VIEW.height - 20;
    if (onScreen) {
      ctx.strokeStyle = PALETTE.magenta;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(o.x, o.y, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = PALETTE.magenta;
      ctx.beginPath();
      ctx.moveTo(o.x, o.y - 26);
      ctx.lineTo(o.x - 8, o.y - 12);
      ctx.lineTo(o.x + 8, o.y - 12);
      ctx.closePath();
      ctx.fill();
    } else {
      // Edge arrow pointing at the objective, drawn in world space at the screen-edge position.
      const px = clamp(sx, 40, VIEW.width - 40);
      const py = clamp(sy, 40, VIEW.height - 40);
      const a = Math.atan2(sy - py, sx - px);
      ctx.save();
      ctx.translate(cam.x + px, cam.y + py);
      ctx.rotate(a);
      ctx.fillStyle = PALETTE.magenta;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-8, -10);
      ctx.lineTo(-8, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawSkyline(baseY) {
    const W = VIEW.width;
    let x = 0;
    let i = 0;
    ctx.fillStyle = '#170f24';
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    while (x < W) {
      const w = 34 + h01(i * 3.7) * 62;
      const h = 70 + h01(i * 5.3) * 150;
      ctx.lineTo(x, baseY - h);
      ctx.lineTo(x + w, baseY - h);
      x += w;
      i += 1;
    }
    ctx.lineTo(W, baseY);
    ctx.closePath();
    ctx.fill();
    // lit windows and an occasional neon crown
    x = 0;
    i = 0;
    while (x < W) {
      const w = 34 + h01(i * 3.7) * 62;
      const h = 70 + h01(i * 5.3) * 150;
      const top = baseY - h;
      for (let wy = top + 10; wy < baseY - 14; wy += 22) {
        for (let wx = x + 8; wx < x + w - 12; wx += 16) {
          if (h01(i * 8.9 + wy + wx) < 0.22) {
            ctx.fillStyle = 'rgba(255,210,122,0.85)';
            ctx.fillRect(wx, wy, 5, 7);
          }
        }
      }
      if (h01(i * 11.1) < 0.18) {
        ctx.fillStyle = '#ff4fd8';
        ctx.fillRect(x + w * 0.2, top + 4, w * 0.6, 3);
      }
      x += w;
      i += 1;
    }
  }

  function drawTitleScreen(hasSave) {
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    const W = VIEW.width;
    const H = VIEW.height;

    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#241736');
    sky.addColorStop(0.42, '#7c3458');
    sky.addColorStop(0.66, '#e86b3e');
    sky.addColorStop(0.84, '#ff9c4e');
    sky.addColorStop(1, '#ffc46b');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const sx = W * 0.5;
    const sy = 300;
    ctx.save();
    const glow = ctx.createRadialGradient(sx, sy, 8, sx, sy, 120);
    glow.addColorStop(0, 'rgba(255,232,170,0.9)');
    glow.addColorStop(1, 'rgba(255,170,90,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffe9ad';
    ctx.beginPath();
    ctx.arc(sx, sy, 38, 0, Math.PI * 2);
    ctx.fill();

    drawSkyline(H);

    // soft top vignette so the title stays legible over the sky
    const vg = ctx.createLinearGradient(0, 0, 0, 260);
    vg.addColorStop(0, 'rgba(16,8,24,0.72)');
    vg.addColorStop(1, 'rgba(16,8,24,0)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, 260);

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(20,10,30,0.7)';
    text('SOLARA CITY', W / 2 + 3, 173, 78, PALETTE.gold, 'center', 'bold');
    ctx.fillStyle = PALETTE.gold;
    text('SOLARA CITY', W / 2, 170, 78, PALETTE.gold, 'center', 'bold');
    ctx.fillStyle = 'rgba(20,10,30,0.7)';
    text('a sun-soaked open world', W / 2 + 1, 207, 24, PALETTE.muted, 'center');
    ctx.fillStyle = PALETTE.muted;
    text('a sun-soaked open world', W / 2, 206, 24, PALETTE.muted, 'center');
    text('Play as Mara Voss: steal cars, run jobs, outrun the heat.', W / 2, 258, 20, PALETTE.text, 'center');

    const panelY = 330;
    ctx.fillStyle = 'rgba(26,18,38,0.86)';
    roundRectPath(W / 2 - 300, panelY, 600, 250, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,209,102,0.25)';
    ctx.lineWidth = 1;
    roundRectPath(W / 2 - 300, panelY, 600, 250, 18);
    ctx.stroke();
    ctx.textAlign = 'left';
    text('W A S D / arrows — move or drive', W / 2 - 240, panelY + 44, 18, PALETTE.text);
    text('Mouse — aim and shoot   Space — shoot   Shift — handbrake', W / 2 - 240, panelY + 72, 18, PALETTE.text);
    text('E — enter / exit car   F — use shops', W / 2 - 240, panelY + 100, 18, PALETTE.text);
    text('P — pause', W / 2 - 240, panelY + 128, 18, PALETTE.text);
    ctx.textAlign = 'center';
    text(hasSave ? 'Press Space or click to Continue' : 'Press Space or click to Start', W / 2, panelY + 190, 26, PALETTE.gold, 'center', 'bold');
    text('Your progress saves automatically', W / 2, panelY + 224, 16, PALETTE.muted, 'center');
  }

  function drawPause() {
    ctx.fillStyle = 'rgba(12,8,16,0.6)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    text('Paused', VIEW.width / 2, 300, 54, PALETTE.text, 'center', 'bold');
    text('Press P to resume', VIEW.width / 2, 350, 22, PALETTE.muted, 'center');
  }

  function draw(game, screen, hasSave) {
    const time = game.time;
    cam = cameraFor(game);
    game.camera = cam;
    const s = view.scale * ZOOM;
    ctx.setTransform(s, 0, 0, s, view.x - cam.x * s, view.y - cam.y * s);

    if (screen === SCREEN_TITLE) {
      drawTitleScreen(hasSave);
      return;
    }

    drawCity(game, cam);
    drawObjective(game, cam);

    // Cars, peds, targets.
    for (const car of game.cars) drawCar(car, time);
    for (const ped of game.peds) drawPed(ped);
    for (const t of game.targets) drawTarget(t);
    drawRoadblocks(game, time);
    drawPlayer(game, time);
    drawEffects(game, cam);
    drawSunset(cam);

    // HUD in logical screen space.
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (!minimap) minimap = rasterMinimap(game.city);
    drawHud(ctx, game, cam, minimap, text, font);

    if (game.deadTimer > 0) {
      ctx.fillStyle = 'rgba(80,0,10,0.55)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      text('WASTED', VIEW.width / 2, VIEW.height / 2, 90, '#ff3b30', 'center', 'bold');
    }

    if (screen === SCREEN_PAUSED) drawPause();
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, resize, toWorld };
}
