// Combat: firing guns, swinging melee weapons, and the bullets that fly between them. Bullets stop
// on buildings and the world edge, and hurt whoever they belong to the other side of: the player's
// bullets hit targets and pedestrians, police bullets hit the player. Melee hits what is in front of
// the player. Nothing here knows how to draw or play sound; it only mutates state.
import { PLAYER } from './config.js';
import { addWanted, currentWeapon, damagePlayer, hitsBuilding, toast } from './world.js';

/** Fire the player's current weapon toward the aim point, subject to cooldown and ammo. */
export function playerAttack(game, input, aimX, aimY) {
  const p = game.player;
  if (p.mode !== 'walk' || !p.alive) return;
  const w = currentWeapon(game);
  const wantFire = w.auto ? input.fire : input.firePressed;
  if (!wantFire || p.fireTimer > 0) return;

  const a = Math.atan2(aimY - p.y, aimX - p.x);
  if (w.kind === 'gun') {
    const ammo = p.ammo[p.weapon] ?? 0;
    if (ammo <= 0) {
      toast(game, 'Out of ammo — visit the armory');
      p.fireTimer = 0.5;
      return;
    }
    p.ammo[p.weapon] = ammo - 1;
    p.fireTimer = w.cooldown;
    for (let i = 0; i < w.pellets; i += 1) {
      const ang = a + (game.random() - 0.5) * 2 * w.spread;
      game.bullets.push({
        id: game.nextBulletId++,
        x: p.x + Math.cos(ang) * 18,
        y: p.y + Math.sin(ang) * 18,
        vx: Math.cos(ang) * w.speed,
        vy: Math.sin(ang) * w.speed,
        life: w.range / w.speed,
        hostile: false,
        damage: w.damage,
        color: '#fff3b0',
      });
    }
    muzzle(game, a);
    game.shake = Math.max(game.shake, 0.12);
  } else {
    p.fireTimer = w.cooldown;
    meleeHit(game, a, w);
  }
}

function muzzle(game, a) {
  const p = game.player;
  for (let i = 0; i < 4; i += 1) {
    const s = 120 + game.random() * 120;
    game.particles.push({ x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.12, color: '#ffd166', size: 2 });
  }
}

function meleeHit(game, a, w) {
  const p = game.player;
  const reach = w.range;
  const fx = Math.cos(a);
  const fy = Math.sin(a);

  for (let i = game.targets.length - 1; i >= 0; i -= 1) {
    const t = game.targets[i];
    if (!t.alive) continue;
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < reach + 10 && (dx * fx + dy * fy) / (d || 1) > 0.2) {
      t.hp -= w.damage;
      t.hitT = 0.2;
      hitSpark(game, t.x, t.y);
      if (t.hp <= 0) {
        t.alive = false;
        addWanted(game, 1, 'Homicide');
      }
    }
  }

  for (let i = game.peds.length - 1; i >= 0; i -= 1) {
    const ped = game.peds[i];
    if (!ped.alive) continue;
    const dx = ped.x - p.x;
    const dy = ped.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < reach + 8 && (dx * fx + dy * fy) / (d || 1) > 0.2) {
      ped.alive = false;
      splatter(game, ped.x, ped.y);
      addWanted(game, 1, 'Assault');
      break;
    }
  }
}

function hitSpark(game, x, y) {
  for (let i = 0; i < 5; i += 1) {
    const a = game.random() * Math.PI * 2;
    const s = 40 + game.random() * 120;
    game.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3, color: '#ff6b6b', size: 2 });
  }
}

function splatter(game, x, y) {
  for (let i = 0; i < 8; i += 1) {
    const a = game.random() * Math.PI * 2;
    const s = 30 + game.random() * 90;
    game.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.7, color: '#c0392b', size: 2 + game.random() * 3 });
  }
}

/** Advance bullets and resolve their hits. */
export function stepCombat(game, dt) {
  const city = game.city;
  const p = game.player;

  for (let i = game.bullets.length - 1; i >= 0; i -= 1) {
    const b = game.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0 || b.x < 0 || b.y < 0 || b.x > city.world || b.y > city.world;
    if (!dead && hitsBuilding(city, b.x, b.y, 2)) {
      dead = true;
      puff(game, b.x, b.y);
    }

    if (!dead && b.hostile) {
      if (p.alive && Math.hypot(p.x - b.x, p.y - b.y) < PLAYER.radius + 3) {
        damagePlayer(game, 9);
        dead = true;
      }
    } else if (!dead) {
      let hit = false;
      for (let j = 0; j < game.targets.length; j += 1) {
        const t = game.targets[j];
        if (!t.alive) continue;
        if (Math.hypot(t.x - b.x, t.y - b.y) < 13) {
          t.hp -= b.damage;
          t.hitT = 0.2;
          hitSpark(game, b.x, b.y);
          if (t.hp <= 0) {
            t.alive = false;
            addWanted(game, 1, 'Homicide');
          }
          hit = true;
          break;
        }
      }
      if (!hit) {
        for (let j = 0; j < game.peds.length; j += 1) {
          const ped = game.peds[j];
          if (!ped.alive) continue;
          if (Math.hypot(ped.x - b.x, ped.y - b.y) < 10) {
            ped.alive = false;
            splatter(game, ped.x, ped.y);
            addWanted(game, 1, 'Murder');
            hit = true;
            break;
          }
        }
      }
      if (hit) dead = true;
    }

    if (dead) game.bullets.splice(i, 1);
  }
}

function puff(game, x, y) {
  for (let i = 0; i < 3; i += 1) {
    const a = game.random() * Math.PI * 2;
    game.particles.push({ x, y, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, life: 0.2, color: '#8a7a68', size: 2 });
  }
}
