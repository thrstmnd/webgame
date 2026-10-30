/* =========================================================
   ТРАКТ — существа, башни, снаряды, осколки

   Каждый вид объекта описан классом. У всех одинаковый договор:
   метод update(dt) двигает объект, метод draw(ctx) его рисует.
   Благодаря этому игровой цикл не знает, с чем именно работает,
   и просто обходит списки.

   dt — время, прошедшее с прошлого кадра, в секундах. Все
   скорости заданы в пикселях в секунду, поэтому игра идёт
   одинаково и на 60, и на 144 кадрах.
   ========================================================= */

'use strict';

/* ---------- характеристики тварей ----------
   Вынесены в таблицу, чтобы баланс правился в одном месте.

   air     — летит по прямой, дороги и стрелок не видит
   armor   — срезает столько урона с каждого попадания
   ignore  — не подчиняется стрелкам, всегда идёт веткой A
   heal    — лечит соседей, столько здоровья в секунду
   split   — при смерти распадается: {kind, count}            */
const ENEMY_KINDS = {
  crawler: {
    name: 'ползун', hp: 34, speed: 26, reward: 8,
    sprite: Sprites.CRAWLER, radius: 4
  },
  runner: {
    name: 'бегун', hp: 18, speed: 62, reward: 7,
    sprite: Sprites.RUNNER, radius: 4
  },
  brute: {
    name: 'туша', hp: 180, speed: 17, reward: 32,
    sprite: Sprites.BRUTE, radius: 6
  },
  flyer: {
    name: 'летун', hp: 40, speed: 38, reward: 14,
    sprite: Sprites.FLYER, radius: 5, air: true
  },
  armor: {
    name: 'панцирь', hp: 90, speed: 21, reward: 22,
    sprite: Sprites.ARMOR, radius: 5, armor: 7
  },
  swarm: {
    name: 'рой', hp: 70, speed: 24, reward: 16,
    sprite: Sprites.SWARM, radius: 5, split: { kind: 'swarmling', count: 3 }
  },
  swarmling: {
    name: 'мелочь', hp: 12, speed: 70, reward: 3,
    sprite: Sprites.SWARMLING, radius: 3
  },
  weeper: {
    name: 'плакальщица', hp: 64, speed: 19, reward: 20,
    sprite: Sprites.WEEPER, radius: 4, heal: 16, healRange: 34
  },
  leader: {
    name: 'вожак', hp: 120, speed: 30, reward: 26,
    sprite: Sprites.LEADER, radius: 5, ignore: true
  },
  shade: {
    name: 'теневик', hp: 76, speed: 30, reward: 24,
    sprite: Sprites.SHADE, radius: 5,
    phase: { period: 3.2, dur: 1.3 }
  },
  damper: {
    name: 'глушитель', hp: 100, speed: 23, reward: 28,
    sprite: Sprites.DAMPER, radius: 5,
    damp: { range: 74, factor: 2.1 }
  },

  /* ---------- боссы ----------
     Втрое крупнее, на порядок живучее и каждый со своей подлостью. */
  boss_brood: {
    name: 'Матка', hp: 1500, speed: 12, reward: 170, boss: true,
    sprite: Sprites.BOSS_BROOD, radius: 8,
    spawner: { kind: 'swarmling', every: 2.4 },
    about: 'На ходу роняет выводок. Чем дольше живёт, тем больше мелочи на тракте.'
  },
  boss_colossus: {
    name: 'Исполин', hp: 2700, speed: 9, reward: 210, boss: true,
    sprite: Sprites.BOSS_COLOSSUS, radius: 8, armor: 18,
    about: 'Срезает 18 урона с каждого попадания. Мелкие выстрелы бесполезны — нужны пушки.'
  },
  boss_weaver: {
    name: 'Ткач', hp: 1900, speed: 14, reward: 200, boss: true,
    sprite: Sprites.BOSS_WEAVER, radius: 7,
    heal: 45, healRange: 64,
    phase: { period: 4.0, dur: 1.2 },
    about: 'Лечит всех вокруг и сам временами уходит в тень, где его не достать.'
  },
  boss_lord: {
    name: 'Владыка тракта', hp: 4400, speed: 11, reward: 340, boss: true,
    sprite: Sprites.BOSS_LORD, radius: 8, armor: 12, ignore: true,
    heal: 26, healRange: 56,
    spawner: { kind: 'crawler', every: 3.2 },
    about: 'Броня, лечение, выводок и полное безразличие к стрелкам. Последний.'
  }
};


/* ---------- характеристики башен ----------
   levels — три обычных уровня.
   specs  — четвёртый: выбор одной из двух специализаций,
            обратно уже не поменять.
   air    — может ли башня доставать летунов.                */
const TOWER_KINDS = {

  archer: {
    name: 'стрелок', cost: 40, sprite: Sprites.TOWER_ARCHER, air: true,
    hint: 'бьёт часто и по одной цели · достаёт летунов',
    levels: [
      { range: 68, damage: 7,  rate: 0.55, ammo: 8,  reload: 2.2 },
      { range: 76, damage: 11, rate: 0.48, ammo: 10, reload: 2.0, up: 35 },
      { range: 84, damage: 16, rate: 0.40, ammo: 12, reload: 1.8, up: 60 }
    ],
    specs: {
      a: { name: 'снайпер', cost: 110, range: 136, damage: 52, rate: 1.15, ammo: 4, reload: 3.2,
           desc: 'бьёт через полкарты и очень больно, но редко' },
      b: { name: 'шквал', cost: 110, range: 66, damage: 11, rate: 0.13, ammo: 24, reload: 3.4,
           desc: 'почти без пауз, но только вблизи' }
    }
  },

  /* Костёр не столько жжёт сам, сколько поджигает: огонь держится
     на твари и после выхода из круга. Поэтому важен не размер круга,
     а сам факт касания — хорош против толпы, слаб против одиночки. */
  fire: {
    name: 'костёр', cost: 55, sprite: Sprites.TOWER_FIRE, air: false,
    hint: 'поджигает всех, кто прошёл рядом · огонь держится и после',
    levels: [
      { range: 48, damage: 4, rate: 0, burn: 9,  burnTime: 3.0, ammo: 4, reload: 2.6 },
      { range: 56, damage: 6, rate: 0, burn: 14, burnTime: 3.5, ammo: 5, reload: 2.4, up: 45 },
      { range: 64, damage: 8, rate: 0, burn: 20, burnTime: 4.0, ammo: 6, reload: 2.2, up: 75 }
    ],
    specs: {
      a: { name: 'маяк', cost: 120, range: 92, damage: 6, rate: 0, burn: 24, burnTime: 5.0,
           ammo: 7, reload: 2.6,
           desc: 'огромный круг, горят долго — выжигает целую волну' },
      b: { name: 'горн', cost: 120, range: 52, damage: 30, rate: 0, burn: 58, burnTime: 3.0,
           ammo: 3, reload: 3.0,
           desc: 'узкий круг, зато испепеляет всё, что подошло' }
    }
  },

  cannon: {
    name: 'пушка', cost: 70, sprite: Sprites.TOWER_CANNON, air: false,
    hint: 'редко, но накрывает площадь · пробивает броню',
    levels: [
      { range: 86,  damage: 26, rate: 1.7, splash: 22, ammo: 3, reload: 3.0 },
      { range: 94,  damage: 38, rate: 1.5, splash: 26, ammo: 4, reload: 2.8, up: 60 },
      { range: 104, damage: 54, rate: 1.3, splash: 30, ammo: 5, reload: 2.6, up: 95 }
    ],
    specs: {
      a: { name: 'мортира', cost: 150, range: 136, damage: 78, rate: 1.5, splash: 44,
           ammo: 3, reload: 3.4,
           desc: 'дальше и накрывает вдвое больше' },
      b: { name: 'картечь', cost: 150, range: 82, damage: 46, rate: 0.75, splash: 20, chain: 3,
           ammo: 7, reload: 2.6,
           desc: 'чаще, и каждый выстрел задевает до трёх тварей' }
    }
  },

  /* Морозник ничего не ранит и не перезаряжается: он не оружие,
     а инструмент. Держит поток на месте, пока работают остальные. */
  frost: {
    name: 'морозник', cost: 45, sprite: Sprites.TOWER_FROST, air: false,
    endless: true,
    hint: 'не ранит и не перезаряжается · держит поток на месте',
    levels: [
      { range: 46, damage: 0, rate: 0, slow: 0.60, slowTime: 1.2 },
      { range: 54, damage: 0, rate: 0, slow: 0.52, slowTime: 1.4, up: 40 },
      { range: 62, damage: 0, rate: 0, slow: 0.45, slowTime: 1.6, up: 65 }
    ],
    specs: {
      a: { name: 'стужа', cost: 100, range: 66, damage: 0, rate: 0, slow: 0.26, slowTime: 2.2,
           desc: 'замедляет почти вчетверо' },
      b: { name: 'наледь', cost: 100, range: 118, damage: 0, rate: 0, slow: 0.62, slowTime: 1.8,
           desc: 'слабее, зато стынет вся ветка разом' }
    }
  }
};


/* =========================================================
   ТВАРЬ
   ========================================================= */
class Enemy {

  /* mods — поправки от сложности и номера волны:
     { hp: во сколько раз живучее, speed: во сколько раз быстрее } */
  constructor(kind, switches, mods) {
    const base = ENEMY_KINDS[kind];
    const m = mods || {};

    this.kind = kind;
    this.name = base.name;
    this.sprite = base.sprite;
    this.radius = base.radius;
    this.baseSpeed = base.speed * (m.speed || 1);
    this.reward = base.reward;

    /* особенности вида */
    this.air = Boolean(base.air);
    this.armor = base.armor || 0;
    this.ignore = Boolean(base.ignore);
    this.heal = base.heal || 0;
    this.healRange = base.healRange || 0;
    this.split = base.split || null;
    this.phase = base.phase || null;      // уходит в тень и становится неуязвим
    this.damp = base.damp || null;        // глушит башни вокруг
    this.spawner = base.spawner || null;  // роняет выводок на ходу
    this.boss = Boolean(base.boss);

    this.phaseTimer = 0;
    this.hidden = false;
    this.spawnTimer = 0;

    this.maxHp = Math.round(base.hp * (m.hp || 1));
    this.hp = this.maxHp;

    this.dead = false;
    this.arrived = false;
    this.hurtTimer = 0;

    /* наложенные состояния */
    this.slowFactor = 1;
    this.slowTimer = 0;
    this.burnDps = 0;
    this.burnTimer = 0;
    this.healedTimer = 0;

    const start = GameMap.toPx(GameMap.NODES[0]);
    this.x = start.x;
    this.y = start.y;
    this.node = 0;
    this.points = [];
    this.pendingNode = null;
    this.bob = Math.random() * Math.PI * 2;

    if (this.air) {
      /* летун не идёт по дороге: ему сразу ставится одна точка —
         убежище, и он летит к ней по прямой */
      this.points = [GameMap.toPx(GameMap.NODES[GameMap.NODES.length - 1])];
      this.y = start.y - 10;
    } else {
      this.advance(switches);
    }
  }

  get speed() { return this.baseSpeed * this.slowFactor; }

  /* Спрашивает у карты, куда идти от текущего узла.
     Вызывается каждый раз, когда дошёл до очередного узла, —
     поэтому переключённая стрелка влияет только на тех,
     кто ещё не свернул. */
  advance(switches) {
    const step = GameMap.nextPoints(this.node, switches, this.ignore ? 'a' : null);

    if (step.next === null) {
      this.arrived = true;
      return;
    }

    this.points = step.points;
    this.pendingNode = step.next;
  }

  update(dt, switches) {
    if (this.dead || this.arrived) return;

    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    if (this.healedTimer > 0) this.healedTimer -= dt;

    /* теневик и ткач периодически уходят в тень: пока там,
       попадания по ним не проходят вовсе */
    if (this.phase) {
      this.phaseTimer += dt;
      const inCycle = this.phaseTimer % this.phase.period;
      this.hidden = inCycle < this.phase.dur;
    }

    if (this.spawner) this.spawnTimer += dt;

    /* замедление спадает со временем */
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) this.slowFactor = 1;
    }

    /* горение тикает само, даже когда тварь вышла из круга */
    if (this.burnTimer > 0) {
      this.burnTimer -= dt;
      this.hit(this.burnDps * dt, true);
      if (this.burnTimer <= 0) this.burnDps = 0;
      if (this.dead) return;
    }

    this.bob += dt * 5;

    let move = this.speed * dt;

    /* за один кадр тварь может пройти несколько точек подряд,
       если кадр оказался длинным — поэтому цикл, а не if */
    while (move > 0) {

      if (!this.points.length) {
        if (this.air) { this.arrived = true; return; }
        this.node = this.pendingNode;
        this.advance(switches);
        if (this.arrived) return;
        continue;
      }

      const target = this.points[0];
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= move) {
        this.x = target.x;
        this.y = target.y;
        move -= dist;
        this.points.shift();
      } else {
        this.x += (dx / dist) * move;
        this.y += (dy / dist) * move;
        move = 0;
      }
    }
  }

  /* Броня срезает фиксированную часть каждого попадания, но не
     весь урон: иначе слабая башня стала бы совсем бесполезной.
     Горение и лечение броню игнорируют. */
  hit(damage, ignoreArmor) {
    if (this.hidden) return;          // в тени попадания не проходят
    const real = ignoreArmor ? damage : Math.max(1, damage - this.armor);
    this.hp -= real;
    this.hurtTimer = 0.08;
    if (this.hp <= 0) this.dead = true;
  }

  mend(amount) {
    if (this.hp >= this.maxHp) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.healedTimer = 0.2;
  }

  applySlow(factor, time) {
    /* берём самое сильное из действующих замедлений */
    if (factor < this.slowFactor || this.slowTimer <= 0) this.slowFactor = factor;
    this.slowTimer = Math.max(this.slowTimer, time);
  }

  applyBurn(dps, time) {
    this.burnDps = Math.max(this.burnDps, dps);
    this.burnTimer = Math.max(this.burnTimer, time);
  }

  draw(ctx) {
    let sprite = this.sprite;

    /* вспышка при попадании: силуэт белым */
    if (this.hurtTimer > 0) {
      sprite = Sprites.recolor(Sprites.recolor(Sprites.recolor(
        sprite, 'm', 'w'), 'p', 'w'), 's', 'w');
    } else if (this.burnTimer > 0) {
      sprite = Sprites.recolor(Sprites.recolor(sprite, 'm', 'o'), 'p', 'o');
    } else if (this.slowTimer > 0) {
      sprite = Sprites.recolor(Sprites.recolor(sprite, 'm', 'b'), 'p', 'b');
    }

    /* летун покачивается в воздухе — сразу видно, что он не на дороге */
    const y = this.air ? this.y + Math.sin(this.bob) * 2 : this.y;

    /* тень под летуном, чтобы читалась высота */
    if (this.air) {
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(Math.round(this.x) - 3, Math.round(this.y) + 8, 6, 2);
    }

    if (this.hidden) ctx.globalAlpha = 0.3;
    Sprites.drawCentered(ctx, sprite, this.x, y);
    ctx.globalAlpha = 1;

    /* отметка лечения */
    if (this.healedTimer > 0) {
      ctx.fillStyle = '#b9c6c9';
      ctx.fillRect(Math.round(this.x) + 4, Math.round(y) - 7, 2, 2);
    }

    /* полоска здоровья — только если уже ранен,
       иначе карта превращается в кашу из полосок */
    if (this.hp < this.maxHp || this.boss) {
      const w = this.boss ? Sprites.size(this.sprite).w + 6 : Sprites.size(this.sprite).w;
      const top = y - Sprites.size(this.sprite).h / 2 - 3;
      const left = Math.round(this.x - w / 2);

      ctx.fillStyle = '#0d0d10';
      ctx.fillRect(left, top, w, 2);
      ctx.fillStyle = this.hp / this.maxHp > 0.4 ? '#7ab87a' : '#8e2b2b';
      ctx.fillRect(left, top, Math.max(1, Math.round(w * this.hp / this.maxHp)), 2);
    }
  }
}


/* =========================================================
   СНАРЯД
   ========================================================= */
class Projectile {

  constructor(x, y, target, stats, air) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.damage = stats.damage;
    this.splash = stats.splash || 0;
    this.chain = stats.chain || 0;      // сколько целей задевает картечь
    this.air = air;
    this.speed = this.splash ? 125 : 195;
    this.dead = false;
  }

  update(dt, enemies) {
    if (this.dead) return;

    /* цель могла умереть до прилёта — летим в её последнюю точку */
    if (this.target && (this.target.dead || this.target.arrived)) {
      this.aimX = this.target.x;
      this.aimY = this.target.y;
      this.target = null;
    }

    const tx = this.target ? this.target.x : this.aimX;
    const ty = this.target ? this.target.y : this.aimY;

    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    const move = this.speed * dt;

    if (dist <= move) {
      this.explode(tx, ty, enemies);
      return;
    }

    this.x += (dx / dist) * move;
    this.y += (dy / dist) * move;
  }

  explode(x, y, enemies) {
    this.dead = true;
    Sfx.play('hit');

    /* картечь: основная цель плюс ещё несколько ближайших */
    if (this.chain) {
      const near = enemies
        .filter(function (e) {
          return !e.dead && !e.arrived && (this.air || !e.air)
            && Math.hypot(e.x - x, e.y - y) <= this.splash + 18;
        }, this)
        .sort(function (a, b) {
          return Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y);
        })
        .slice(0, this.chain);

      near.forEach(function (e) { e.hit(this.damage); }, this);
      return;
    }

    if (!this.splash) {
      if (this.target && !this.target.dead) this.target.hit(this.damage);
      return;
    }

    /* накрытие по площади: достаётся всем в радиусе */
    enemies.forEach(function (e) {
      if (e.dead || e.arrived) return;
      if (!this.air && e.air) return;
      if (Math.hypot(e.x - x, e.y - y) <= this.splash) e.hit(this.damage);
    }, this);
  }

  draw(ctx) {
    ctx.fillStyle = this.splash ? '#d98020' : '#e8dfae';
    const r = this.splash ? 2 : 1;
    ctx.fillRect(Math.round(this.x) - r, Math.round(this.y) - r, r * 2, r * 2);
  }
}


/* =========================================================
   БАШНЯ
   ========================================================= */
class Tower {

  constructor(kind, tile) {
    this.kind = kind;
    this.def = TOWER_KINDS[kind];
    this.level = 0;          // 0, 1, 2 — обычные уровни
    this.spec = null;        // 'a' или 'b' после специализации
    this.tile = tile;

    const p = GameMap.toPx(tile);
    this.x = p.x;
    this.y = p.y;

    this.cooldown = 0;
    this.flash = 0;

    /* Боезапас. У стреляющих башен это выстрелы, у костра и
       морозника — секунды работы. Когда кончается, башня молчит
       и набивает магазин. Из-за этого ветка, по которой долго
       идёт поток, постепенно глохнет — ради этого всё и затеяно. */
    this.charge = this.stats.ammo;
    this.reloading = 0;
    this.dampFactor = 1;      // ставится игрой, если рядом глушитель
  }

  /* у морозника магазина нет вовсе — он работает всегда */
  get endless() { return Boolean(this.def.endless); }

  get ammoMax() { return this.stats.ammo; }
  get isReloading() { return this.reloading > 0; }

  /* доля заполнения: для полоски под башней */
  get ammoPart() {
    if (this.endless) return 1;
    if (this.isReloading) return 1 - this.reloading / this.stats.reload;
    return this.charge / this.stats.ammo;
  }

  startReload() {
    if (this.endless) return;
    this.reloading = this.stats.reload;
    this.charge = 0;
  }

  /* Между волнами магазины набиваются сами: пауза на то и дана,
     чтобы к следующей волне все были готовы. */
  refill() {
    this.charge = this.stats.ammo || 0;
    this.reloading = 0;
  }

  /* Пока нет специализации — характеристики берутся из обычных
     уровней, после неё — из выбранной ветки. */
  get stats() {
    return this.spec ? this.def.specs[this.spec] : this.def.levels[this.level];
  }

  get title() {
    if (this.spec) return this.def.specs[this.spec].name;
    return this.def.name + ' ' + 'I'.repeat(this.level + 1);
  }

  canUpgrade() { return !this.spec && this.level < this.def.levels.length - 1; }
  upgradeCost() { return this.canUpgrade() ? this.def.levels[this.level + 1].up : 0; }
  upgrade() {
    if (!this.canUpgrade()) return;
    this.level++;
    this.refill();   // свежая башня — полный магазин
  }

  /* Специализация доступна только с последнего обычного уровня */
  canSpecialize() { return !this.spec && this.level === this.def.levels.length - 1; }
  specialize(which) {
    if (!this.canSpecialize()) return;
    this.spec = which;
    this.refill();
  }

  /* Ищет цель в радиусе. Приоритет — тот, кто ближе к прорыву.
     Летунов видят только башни с пометкой air. */
  findTarget(enemies) {
    let best = null;
    let bestProgress = -1;
    const range = this.stats.range;

    enemies.forEach(function (e) {
      if (e.dead || e.arrived) return;
      if (e.air && !this.def.air) return;
      if (Math.hypot(e.x - this.x, e.y - this.y) > range) return;

      /* у летуна узлов нет, поэтому меряем близость к убежищу */
      const home = GameMap.toPx(GameMap.NODES[GameMap.NODES.length - 1]);
      const progress = e.air ? 100 - Math.hypot(e.x - home.x, e.y - home.y) / 10 : e.node;
      if (progress > bestProgress) {
        bestProgress = progress;
        best = e;
      }
    }, this);

    return best;
  }

  update(dt, enemies, projectiles) {
    if (this.flash > 0) this.flash -= dt;

    const s = this.stats;

    /* идёт перезарядка — башня не работает вообще */
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.reloading = 0;
        this.charge = s.ammo;
      }
      return;
    }

    /* костёр и морозник не стреляют: они действуют по площади,
       и боезапас у них тратится по секунде за секунду работы */
    if (this.kind === 'fire' || this.kind === 'frost') {
      let worked = false;

      enemies.forEach(function (e) {
        if (e.dead || e.arrived) return;
        if (e.air && !this.def.air) return;
        if (Math.hypot(e.x - this.x, e.y - this.y) > s.range) return;

        worked = true;
        if (s.damage) e.hit(s.damage * dt, true);
        /* в тени тварь неуязвима, но замедление и поджиг на неё
           всё равно не действуют — hit() сам это отсекает */
        if (s.slow) e.applySlow(s.slow, s.slowTime);
        if (s.burn) e.applyBurn(s.burn, s.burnTime);
      }, this);

      /* топливо жжётся, только пока есть кого греть;
         у морозника топлива нет вовсе */
      if (worked && !this.endless) {
        this.charge -= dt;
        if (this.charge <= 0) this.startReload();
      }
      return;
    }

    this.cooldown -= dt;
    if (this.cooldown > 0) return;

    const target = this.findTarget(enemies);
    if (!target) return;

    projectiles.push(new Projectile(this.x, this.y - 4, target, s, this.def.air));
    Sfx.play(this.kind === 'cannon' ? 'cannon' : 'shot');

    /* глушитель рядом растягивает паузу между выстрелами */
    this.cooldown = s.rate * (this.dampFactor || 1);
    this.flash = 0.08;

    this.charge -= 1;
    if (this.charge <= 0) this.startReload();
  }

  draw(ctx) {
    let sprite = this.def.sprite;

    /* специализация видна по цвету: ветка A золотится, ветка B краснеет */
    if (this.spec === 'a') sprite = Sprites.recolor(sprite, 'l', 'y');
    if (this.spec === 'b') sprite = Sprites.recolor(sprite, 'l', 'r');

    /* пока перезаряжается — башня притушена, видно издалека */
    if (this.isReloading) ctx.globalAlpha = 0.45;
    Sprites.drawCentered(ctx, sprite, this.x, this.y + 1);
    ctx.globalAlpha = 1;

    /* полоска боезапаса над башней */
    const w = 12;
    const left = Math.round(this.x - w / 2);
    const top = Math.round(this.y) - 9;

    ctx.fillStyle = '#0d0d10';
    ctx.fillRect(left, top, w, 2);
    ctx.fillStyle = this.endless ? '#9fd8e8'
                  : this.isReloading ? '#2a4a6b' : '#2e9e60';
    ctx.fillRect(left, top, Math.max(1, Math.round(w * this.ammoPart)), 2);

    /* рядом глушитель — отмечаем точкой */
    if (this.dampFactor > 1) {
      ctx.fillStyle = '#2a4a6b';
      ctx.fillRect(left + w + 2, top, 2, 2);
    }

    /* уровень отмечаем точками под башней — коротко и читаемо */
    const dots = this.spec ? 4 : this.level + 1;
    for (let i = 0; i < dots; i++) {
      ctx.fillStyle = this.spec ? (this.spec === 'a' ? '#c9a227' : '#8e2b2b') : '#c9a227';
      ctx.fillRect(this.x - 5 + i * 3, this.y + 7, 2, 2);
    }
  }

  drawRange(ctx) {
    ctx.strokeStyle = 'rgba(201,162,39,.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.stats.range, 0, Math.PI * 2);
    ctx.stroke();
  }
}


/* =========================================================
   ОСКОЛОК — выпадает из твари, его надо успеть подобрать
   ========================================================= */
class Pickup {

  constructor(x, y, value) {
    this.x = x;
    this.y = y;
    this.value = value;
    this.life = 6;            // секунд до исчезновения
    this.dead = false;
    this.bob = Math.random() * Math.PI * 2;
  }

  update(dt) {
    this.life -= dt;
    this.bob += dt * 4;
    if (this.life <= 0) this.dead = true;
  }

  /* попадание клика: небольшой запас, чтобы не надо было целиться пиксель в пиксель */
  isHit(mx, my) {
    return Math.hypot(mx - this.x, my - this.y) <= 7;
  }

  draw(ctx) {
    /* перед исчезновением мигает — видно, что пора забирать */
    if (this.life < 2 && Math.floor(this.life * 8) % 2 === 0) return;

    const y = this.y + Math.sin(this.bob) * 1.5;
    Sprites.drawCentered(ctx, Sprites.SHARD, this.x, y);
  }
}
