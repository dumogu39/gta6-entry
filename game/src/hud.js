// The HUD: health, money, wanted stars, the minimap (with entity dots), the mission objective and a
// distance readout, the weapon and ammo, dialogue and toasts, and shop prompts. It is drawn in the
// 1280x720 logical screen space after the world, so it stays fixed while the camera moves.
import { PALETTE, PLAYER, VIEW, WEAPONS, WANTED } from './config.js';
import { nearShop } from './shops.js';

function panel(ctx, x, y, w, h, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

function strokePanel(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.stroke();
}

export function drawHud(ctx, game, cam, minimap, text) {
  const p = game.player;

  // Health panel + bar.
  panel(ctx, 14, 14, 236, 42, 12, 'rgba(0,0,0,0.5)');
  text('❤', 28, 40, 18, PALETTE.health, 'left');
  ctx.fillStyle = '#3a1216';
  ctx.fillRect(54, 20, 180, 24);
  const hpFrac = Math.max(0, p.health / PLAYER.maxHealth);
  ctx.fillStyle = PALETTE.health;
  ctx.fillRect(54, 20, 180 * hpFrac, 24);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(54, 20, 180, 24);
  text(`HP ${Math.max(0, Math.round(p.health))}`, 144, 38, 15, PALETTE.text, 'center', 'bold');

  // Money.
  panel(ctx, 14, 62, 150, 30, 10, 'rgba(0,0,0,0.45)');
  text('💰', 26, 84, 17, PALETTE.gold, 'left');
  text(`$${p.money}`, 46, 84, 22, PALETTE.gold, 'left', 'bold');

  // Wanted stars.
  panel(ctx, VIEW.width - 196, 14, 182, 44, 12, 'rgba(0,0,0,0.45)');
  for (let i = 0; i < WANTED.maxStars; i += 1) {
    drawStar(ctx, VIEW.width - 164 + i * 30, 30, 12, i < p.wanted ? PALETTE.wanted : 'rgba(255,255,255,0.12)');
  }
  text('⭐ WANTED', VIEW.width - 24, 48, 13, p.wanted > 0 ? PALETTE.wanted : PALETTE.muted, 'right', 'bold');

  // Minimap with border and view frustum.
  const mm = 200;
  const mx = 18;
  const my = VIEW.height - mm - 18;
  ctx.drawImage(minimap, mx, my, mm, mm);
  const ms = mm / game.city.world;

  // camera view frustum clipped inside the minimap
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, mm, mm);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  const px = mx + p.x * ms;
  const py = my + p.y * ms;
  const a = p.angle || 0;
  const coneLen = 58;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + Math.cos(a - 0.42) * coneLen, py + Math.sin(a - 0.42) * coneLen);
  ctx.lineTo(px + Math.cos(a + 0.42) * coneLen, py + Math.sin(a + 0.42) * coneLen);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // objective
  if (game.objective) {
    ctx.fillStyle = PALETTE.magenta;
    dot(ctx, mx + game.objective.x * ms, my + game.objective.y * ms, 4);
  }
  // shops
  for (const s of game.shops) {
    ctx.fillStyle = s.type === 'armory' ? PALETTE.cyan : PALETTE.gold;
    dot(ctx, mx + s.x * ms, my + s.y * ms, 3);
  }
  // police
  ctx.fillStyle = '#ff3b30';
  for (const c of game.cars) {
    if (c.state === 'police') dot(ctx, mx + c.x * ms, my + c.y * ms, 2.5);
  }
  // player
  ctx.fillStyle = '#ffffff';
  dot(ctx, mx + p.x * ms, my + p.y * ms, 4);

  // minimap border
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.lineWidth = 3;
  ctx.strokeRect(mx, my, mm, mm);
  ctx.strokeStyle = 'rgba(255,209,102,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx, my, mm, mm);

  // Objective.
  if (game.objective) {
    if (game.objective.x !== undefined) {
      const d = Math.hypot(p.x - game.objective.x, p.y - game.objective.y);
      text(game.objective.label, VIEW.width / 2, VIEW.height - 46, 20, PALETTE.text, 'center', 'bold');
      text(`${Math.round(d / 10)} m`, VIEW.width / 2, VIEW.height - 26, 14, PALETTE.muted, 'center');
    } else {
      text(game.objective.label, VIEW.width / 2, VIEW.height - 40, 20, PALETTE.text, 'center', 'bold');
    }
  }

  // Weapon and ammo.
  const w = WEAPONS[p.weapon];
  const ammo = w.kind === 'gun' ? `  ${p.ammo[p.weapon] ?? 0}` : '';
  panel(ctx, VIEW.width - 220, VIEW.height - 46, 200, 30, 10, 'rgba(0,0,0,0.45)');
  text(`${w.name}${ammo}`, VIEW.width - 24, VIEW.height - 24, 18, PALETTE.text, 'right', 'bold');

  // Shop prompt.
  const shop = nearShop(game);
  if (shop) {
    text(`Press F — ${shop.prompt}`, VIEW.width / 2, VIEW.height - 80, 16, PALETTE.cyan, 'center', 'bold');
  }

  // Toast.
  if (game.toast) {
    text(game.toast.text, VIEW.width / 2, 110, 20, PALETTE.gold, 'center', 'bold');
  }
  if (game.moneyFlash) {
    text(game.moneyFlash.text, 20, 108, 18, '#7ee787', 'left', 'bold');
  }

  // Mission dialogue.
  if (game.dialogue) {
    const boxW = 620;
    const boxX = (VIEW.width - boxW) / 2;
    const boxY = 120;
    panel(ctx, boxX, boxY, boxW, 118, 14, 'rgba(20,14,28,0.92)');
    ctx.strokeStyle = PALETTE.magenta;
    ctx.lineWidth = 1.5;
    strokePanel(ctx, boxX, boxY, boxW, 118, 14);
    text(game.dialogue.title, VIEW.width / 2, boxY + 26, 22, PALETTE.gold, 'center', 'bold');
    text(`— ${game.dialogue.giver}`, VIEW.width / 2, boxY + 48, 15, PALETTE.muted, 'center');
    let lineY = boxY + 74;
    for (const line of game.dialogue.lines) {
      text(line, VIEW.width / 2, lineY, 16, PALETTE.text, 'center');
      lineY += 22;
    }
  }
}

function drawStar(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function dot(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
