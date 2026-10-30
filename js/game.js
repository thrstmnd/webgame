/* =========================================================
   ТРАКТ — игровой цикл, меню, сохранения

   Цикл построен на requestAnimationFrame и считает dt — время
   между кадрами. Вся логика умножается на dt, поэтому скорость
   игры не зависит от частоты экрана.

   Состояния игры:
     menu   — открыто меню, мир заморожен
     prep   — пауза между волнами, можно строить
     wave   — волна идёт
     paused — пауза по пробелу
     over   — поражение
     won    — победа
   ========================================================= */

'use strict';

/* ---------- уровни сложности ----------
   money и lives — стартовые, остальное — множители.         */
const DIFFICULTIES = {
  easy:   { key: 'easy',   name: 'тихая ночь',  money: 190, lives: 16, hp: 0.85, speed: 0.92, reward: 1.15 },
  normal: { key: 'normal', name: 'тракт',       money: 145, lives: 12, hp: 1.00, speed: 1.00, reward: 1.00 },
  hard:   { key: 'hard',   name: 'глухая чаща', money: 110, lives: 8,  hp: 1.25, speed: 1.10, reward: 0.90 }
};

/* ---------- состав волн ----------
   Правится вручную: это самый частый предмет настройки баланса.
   gap — пауза между существами внутри группы, delay — задержка
   перед началом самой группы.                                  */
/* Волны больше не выписаны руками: их собирает js/levels.js
   по номеру уровня. Там же лежат состав тварей, боссы и поправки
   на сложность. */

const PREP_TIME = 14;                     // секунд между волнами
const RECORD_KEY = 'trakt_records';       // рекорды по каждой сложности
const SAVE_KEY = 'trakt_save';            // незаконченная партия
const PROGRESS_KEY = 'trakt_progress';    // открытые уровни и лучшие счёты


/* =========================================================
   Небольшая обёртка над хранилищем браузера.
   В приватном режиме оно может быть заблокировано, и обращение
   к нему бросает ошибку — поэтому всё обёрнуто, а игра в таком
   случае просто работает без сохранений.
   ========================================================= */
const Store = {
  read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }
};


class Game {

  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;   // без сглаживания — иначе пиксели поплывут

    this.mouse = { x: -99, y: -99 };
    this.diff = DIFFICULTIES.normal;
    this.records = Store.read(RECORD_KEY, {});
    this.progress = Store.read(PROGRESS_KEY, { unlocked: 1, best: {} });
    this.level = 1;

    this.bindEvents();
    this.reset(this.diff.key, 1);
    this.state = 'menu';

    this.last = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }


  /* =======================================================
     Начальное состояние партии
     ======================================================= */
  reset(diffKey, level) {
    this.diff = DIFFICULTIES[diffKey] || DIFFICULTIES.normal;
    this.level = Math.min(Math.max(level || 1, 1), Levels.COUNT);

    /* состав волн собирается под номер уровня */
    this.waves = Levels.buildWaves(this.level);

    /* на поздних уровнях нужно больше башен, поэтому стартовый
       капитал подрастает вместе с номером */
    this.money = this.diff.money + (this.level - 1) * 25;
    this.lives = this.diff.lives;
    this.score = 0;
    this.waveIndex = -1;         // -1 = первая волна ещё не началась
    this.prep = PREP_TIME;

    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.towers = [];

    /* стрелки копируем, чтобы рестарт возвращал их в исходное положение */
    this.switches = GameMap.SWITCHES.map(function (s) {
      return { id: s.id, x: s.x, y: s.y, dir: 'a' };
    });

    this.spots = GameMap.SPOTS.map(function (s) {
      return { x: s.x, y: s.y, tower: null };
    });

    this.spawnQueue = [];
    this.waveTime = 0;

    this.selectedKind = 'archer';
    this.selectedTower = null;
    this.hoveredSpot = -1;

    this.state = 'prep';
    this.message = '';

    this.syncHud();
  }


  /* =======================================================
     РЕКОРДЫ — у каждой сложности свой
     ======================================================= */
  get record() {
    return this.records[this.diff.key] || { score: 0, wave: 0 };
  }

  saveRecord() {
    const prev = this.record;
    if (this.score <= prev.score) return false;

    this.records[this.diff.key] = {
      score: this.score,
      wave: Math.max(0, this.waveIndex + 1)
    };
    Store.write(RECORD_KEY, this.records);
    return true;
  }


  /* =======================================================
     СОХРАНЕНИЕ ПАРТИИ

     Пишем не весь мир, а только то, из чего его можно собрать
     заново: сложность, счётчики, какие башни где стоят и куда
     смотрят стрелки. Врагов и снаряды не сохраняем — партия
     продолжается с начала подготовки к следующей волне.
     ======================================================= */
  save() {
    if (this.state === 'over' || this.state === 'won') return;

    Store.write(SAVE_KEY, {
      diff: this.diff.key,
      level: this.level,
      waveIndex: this.waveIndex,
      money: this.money,
      lives: this.lives,
      score: this.score,
      switches: this.switches.map(function (s) { return s.dir; }),
      towers: this.spots.map(function (s) {
        return s.tower ? { kind: s.tower.kind, level: s.tower.level } : null;
      }),
      at: Date.now()
    });
  }

  hasSave() {
    const s = Store.read(SAVE_KEY, null);
    return Boolean(s && typeof s.waveIndex === 'number');
  }

  loadSave() {
    const s = Store.read(SAVE_KEY, null);
    if (!s) return false;

    this.reset(s.diff, s.level || 1);

    this.waveIndex = s.waveIndex;
    this.money = s.money;
    this.lives = s.lives;
    this.score = s.score;

    (s.switches || []).forEach(function (dir, i) {
      if (this.switches[i]) this.switches[i].dir = dir;
    }, this);

    (s.towers || []).forEach(function (t, i) {
      if (!t || !this.spots[i]) return;
      const tower = new Tower(t.kind, this.spots[i]);
      tower.level = Math.min(t.level, tower.def.levels.length - 1);
      this.spots[i].tower = tower;
      this.towers.push(tower);
    }, this);

    this.state = 'prep';
    this.prep = PREP_TIME;
    this.message = 'партия восстановлена';
    this.syncHud();
    return true;
  }

  clearSave() { Store.remove(SAVE_KEY); }

  /* ---------- пройденные уровни ---------- */
  completeLevel() {
    const p = this.progress;
    p.unlocked = Math.max(p.unlocked, Math.min(this.level + 1, Levels.COUNT));
    if (this.score > (p.best[this.level] || 0)) p.best[this.level] = this.score;
    Store.write(PROGRESS_KEY, p);
  }

  levelUnlocked(level) { return level <= this.progress.unlocked; }


  /* =======================================================
     ВОЛНЫ
     ======================================================= */
  startWave() {
    this.waveIndex++;

    if (this.waveIndex >= this.waves.length) {
      this.win();
      return;
    }

    /* Разворачиваем описание волны в плоский список:
       «кого и на какой секунде выпустить». Так спавн потом
       сводится к одному сравнению времени. */
    /* Обычные твари крепчают и внутри уровня, и между уровнями.
       Боссы — только между уровнями, иначе финальный стал бы
       неубиваемым. */
    const m = Levels.mods(this.level, this.waveIndex, this.diff);
    this.waveMods = m.normal;      // пригодится мелочи из роя и выводку

    this.spawnQueue = [];

    this.waves[this.waveIndex].forEach(function (group) {
      const delay = group.delay || 0;
      const isBoss = ENEMY_KINDS[group.kind] && ENEMY_KINDS[group.kind].boss;
      for (let i = 0; i < group.count; i++) {
        this.spawnQueue.push({
          at: delay + i * group.gap,
          kind: group.kind,
          mods: isBoss ? m.boss : m.normal
        });
      }
    }, this);

    this.spawnQueue.sort(function (a, b) { return a.at - b.at; });
    this.waveTime = 0;
    this.state = 'wave';
    this.message = '';
    Sfx.play('wave');
    this.syncHud();
  }

  waveFinished() {
    return this.state === 'wave' && !this.spawnQueue.length && !this.enemies.length;
  }

  /* Мелочь из роя появляется не у входа, а на месте гибели родителя
     и наследует его положение на маршруте — иначе она побежала бы
     по дороге заново. */
  /* Родить тварь на месте родителя, с его положением на маршруте */
  spawnBeside(parent, kind) {
    const child = new Enemy(kind, this.switches, this.waveMods);
    child.x = parent.x + (Math.random() * 10 - 5);
    child.y = parent.y + (Math.random() * 8 - 4);
    child.node = parent.node;
    child.pendingNode = parent.pendingNode;
    child.points = parent.points.map(function (p) { return { x: p.x, y: p.y }; });
    return child;
  }

  spawnSplit(parent, index) {
    const child = new Enemy(parent.split.kind, this.switches, this.waveMods);

    child.x = parent.x + (index - 1) * 5;
    child.y = parent.y + (index % 2 ? 3 : -3);
    child.node = parent.node;
    child.pendingNode = parent.pendingNode;
    child.points = parent.points.map(function (p) { return { x: p.x, y: p.y }; });

    return child;
  }

  win() {
    this.state = 'won';
    const fresh = this.saveRecord();
    this.completeLevel();
    this.clearSave();
    this.message = fresh ? 'Убежище выстояло. Новый рекорд.' : 'Убежище выстояло.';
    Sfx.play('win');
    this.showResult();
    this.syncHud();
  }

  lose() {
    this.state = 'over';
    const fresh = this.saveRecord();
    this.clearSave();
    this.message = fresh ? 'Убежище пало. Но рекорд новый.' : 'Убежище пало.';
    Sfx.play('lose');
    this.showResult();
    this.syncHud();
  }


  /* =======================================================
     ОБНОВЛЕНИЕ
     ======================================================= */
  update(dt) {
    if (this.state === 'menu' || this.state === 'paused'
        || this.state === 'over' || this.state === 'won') return;

    /* Осколки живут своей жизнью в любом состоянии, где идёт игра.
       Раньше они обновлялись только во время волны — из-за этого
       в паузе между волнами осколок не исчезал из списка и по нему
       можно было щёлкать сколько угодно. */
    this.pickups.forEach(function (p) { p.update(dt); });
    this.pickups = this.pickups.filter(function (p) { return !p.dead; });

    /* подготовка между волнами */
    if (this.state === 'prep') {
      this.prep -= dt;
      if (this.prep <= 0) this.startWave();
      this.syncHud();
      return;
    }

    this.waveTime += dt;

    /* выпускаем тех, чьё время пришло */
    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.waveTime) {
      const s = this.spawnQueue.shift();
      this.enemies.push(new Enemy(s.kind, this.switches, s.mods));
    }

    /* Глушители растягивают паузы между выстрелами у башен,
       которые оказались в их радиусе. Считаем поле заново каждый
       кадр: башен и глушителей мало, это дёшево. */
    this.towers.forEach(function (t) { t.dampFactor = 1; });
    this.enemies.forEach(function (e) {
      if (!e.damp || e.dead || e.arrived) return;
      this.towers.forEach(function (t) {
        if (Math.hypot(t.x - e.x, t.y - e.y) <= e.damp.range) {
          t.dampFactor = Math.max(t.dampFactor, e.damp.factor);
        }
      });
    }, this);

    this.towers.forEach(function (t) {
      t.update(dt, this.enemies, this.projectiles);
    }, this);

    this.projectiles.forEach(function (p) { p.update(dt, this.enemies); }, this);
    this.projectiles = this.projectiles.filter(function (p) { return !p.dead; });

    this.enemies.forEach(function (e) { e.update(dt, this.switches); }, this);

    /* плакальщицы чинят соседей: пока их не выбьешь,
       остальные в круге почти не умирают */
    this.enemies.forEach(function (healer) {
      if (healer.dead || !healer.heal) return;
      this.enemies.forEach(function (e) {
        if (e === healer || e.dead || e.arrived) return;
        if (Math.hypot(e.x - healer.x, e.y - healer.y) > healer.healRange) return;
        e.mend(healer.heal * dt);
      });
    }, this);

    /* боссы-матки роняют выводок прямо на ходу */
    const spawned = [];
    this.enemies.forEach(function (e) {
      if (!e.spawner || e.dead || e.arrived) return;
      if (e.spawnTimer < e.spawner.every) return;
      e.spawnTimer = 0;
      spawned.push(this.spawnBeside(e, e.spawner.kind));
    }, this);

    /* разбор последствий: кто умер, кто дошёл */
    const left = [];
    const born = spawned;

    this.enemies.forEach(function (e) {
      if (e.dead) {
        const gain = Math.round(e.reward * this.diff.reward);
        Sfx.play('death');
        this.money += gain;
        this.score += gain;

        if (Math.random() < 0.26) {
          this.pickups.push(new Pickup(e.x, e.y, Math.round(gain * 1.5)));
        }

        /* рой распадается на мелочь прямо там, где погиб */
        if (e.split) {
          for (let i = 0; i < e.split.count; i++) born.push(this.spawnSplit(e, i));
        }
        return;
      }
      if (e.arrived) { this.lives--; Sfx.play('leak'); return; }
      left.push(e);
    }, this);

    this.enemies = left.concat(born);

    if (this.lives <= 0) { this.lose(); return; }

    if (this.waveFinished()) {
      if (this.waveIndex >= this.waves.length - 1) { this.win(); return; }
      this.state = 'prep';
      this.prep = PREP_TIME;
      this.money += 25;                   // премия за чистую волну

      /* пауза на то и дана: к следующей волне все магазины полные */
      this.towers.forEach(function (t) { t.refill(); });

      this.message = 'Волна отбита. +25 · магазины полны';
      Sfx.play('clear');
      this.save();                        // прогресс пишем между волнами
    }

    this.syncHud();
  }


  /* =======================================================
     ОТРИСОВКА
     ======================================================= */
  draw() {
    const ctx = this.ctx;

    GameMap.drawGround(ctx);

    const shelter = GameMap.toPx(GameMap.NODES[GameMap.NODES.length - 1]);

    /* тёплое пятно света вокруг убежища — единственный источник
       тепла на карте, сразу понятно, что именно защищаем */
    const glow = ctx.createRadialGradient(shelter.x, shelter.y, 2, shelter.x, shelter.y, 34);
    glow.addColorStop(0, 'rgba(217,128,32,.22)');
    glow.addColorStop(1, 'rgba(217,128,32,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(shelter.x - 34, shelter.y - 34, 68, 68);

    Sprites.drawCentered(ctx, Sprites.SHELTER, shelter.x + 2, shelter.y - 2);

    ctx.fillStyle = 'rgba(109,79,122,.25)';
    ctx.fillRect(0, 16, 10, 32);

    GameMap.drawSpots(ctx, this.spots, this.hoveredSpot);

    if (this.selectedTower) this.selectedTower.drawRange(ctx);

    this.drawSwitches(ctx);

    this.towers.forEach(function (t) { t.draw(ctx); });
    this.pickups.forEach(function (p) { p.draw(ctx); });
    this.enemies.forEach(function (e) { e.draw(ctx); });
    this.projectiles.forEach(function (p) { p.draw(ctx); });

    /* призрак башни под курсором при строительстве */
    if (this.state !== 'menu' && this.hoveredSpot >= 0
        && this.selectedKind && !this.spots[this.hoveredSpot].tower) {
      const spot = this.spots[this.hoveredSpot];
      const p = GameMap.toPx(spot);
      const def = TOWER_KINDS[this.selectedKind];
      const ok = this.money >= def.cost;

      ctx.globalAlpha = ok ? 0.55 : 0.25;
      Sprites.drawCentered(ctx, def.sprite, p.x, p.y + 1);
      ctx.globalAlpha = 1;

      ctx.strokeStyle = ok ? 'rgba(201,162,39,.5)' : 'rgba(142,43,43,.6)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, def.levels[0].range, 0, Math.PI * 2);
      ctx.stroke();
    }

    this.drawFog(ctx);
    this.drawOverlay(ctx);
  }

  /* Стрелки на развилках — главный орган управления в игре,
     поэтому рисуем их заметно и показываем, куда они смотрят. */
  drawSwitches(ctx) {
    this.switches.forEach(function (sw) {
      const p = GameMap.toPx(sw);

      const node = GameMap.NODES.find(function (n) {
        return n.fork && n.fork.id === sw.id;
      });
      const targetIndex = sw.dir === 'b' ? node.fork.b : node.fork.a;
      const target = GameMap.NODES[targetIndex];

      const dx = Math.sign(target.x - sw.x);
      const dy = Math.sign(target.y - sw.y);

      const near = Math.hypot(this.mouse.x - p.x, this.mouse.y - p.y) < 11;

      ctx.fillStyle = near ? '#3a3524' : '#1b1f24';
      ctx.fillRect(p.x - 7, p.y - 7, 14, 14);
      ctx.strokeStyle = near ? '#e8dfae' : '#c9a227';
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x - 6.5, p.y - 6.5, 13, 13);

      ctx.fillStyle = near ? '#e8dfae' : '#c9a227';
      ctx.beginPath();
      ctx.moveTo(p.x + dx * 5, p.y + dy * 5);
      ctx.lineTo(p.x - dx * 3 + dy * 4, p.y - dy * 3 + dx * 4);
      ctx.lineTo(p.x - dx * 3 - dy * 4, p.y - dy * 3 - dx * 4);
      ctx.closePath();
      ctx.fill();
    }, this);
  }

  /* Лёгкое затемнение по краям: дешёвый способ добавить тревоги */
  drawFog(ctx) {
    const g = ctx.createRadialGradient(
      GameMap.WIDTH / 2, GameMap.HEIGHT / 2, 70,
      GameMap.WIDTH / 2, GameMap.HEIGHT / 2, 230
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.38)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, GameMap.WIDTH, GameMap.HEIGHT);
  }

  /* На холсте остаётся только затемнение. Сам текст — обычная
     разметка поверх: так буквы не растягиваются вместе с пикселями
     и читаются при любом размере окна. */
  drawOverlay(ctx) {
    if (this.state !== 'paused' && this.state !== 'over' && this.state !== 'won') return;
    ctx.fillStyle = 'rgba(8,9,11,.78)';
    ctx.fillRect(0, 0, GameMap.WIDTH, GameMap.HEIGHT);
  }

  showResult() {
    const box = document.getElementById('result');
    if (!box) return;

    const title = document.getElementById('res-title');
    title.textContent = this.state === 'paused' ? 'ПАУЗА'
                      : this.state === 'won' ? 'ВЫСТОЯЛ' : 'КОНЕЦ';
    title.className = 'result__title' + (this.state === 'over' ? ' bad' : '');

    document.getElementById('res-sub').textContent =
      this.state === 'paused'
        ? 'партия сохранена, можно закрыть вкладку'
        : 'уровень ' + this.level + ' · счёт ' + this.score +
          ' · волна ' + Math.max(0, this.waveIndex + 1) + ' · ' + this.diff.name;

    document.getElementById('res-resume').hidden = this.state !== 'paused';
    document.getElementById('res-again').hidden = this.state === 'paused';
    document.getElementById('res-next').hidden =
      !(this.state === 'won' && this.level < Levels.COUNT);

    box.classList.add('open');
  }

  hideResult() {
    const box = document.getElementById('result');
    if (box) box.classList.remove('open');
  }


  /* =======================================================
     ЦИКЛ
     ======================================================= */
  loop(now) {
    /* ограничиваем dt: если вкладка была свёрнута, иначе за один
       кадр всё разом пробежит полкарты */
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;

    this.update(dt);
    this.draw();

    requestAnimationFrame(this.loop);
  }


  /* =======================================================
     МЕНЮ
     ======================================================= */
  openMenu() {
    /* Запоминаем, куда возвращаться по Esc. Если партия кончилась,
       возвращаться некуда — меню закроется только новой игрой. */
    if (this.state === 'prep' || this.state === 'wave' || this.state === 'paused') {
      this.menuReturn = (this.state === 'paused') ? (this.resumeTo || 'prep') : this.state;
      this.save();
    } else {
      this.menuReturn = null;
    }

    this.state = 'menu';
    this.hideResult();
    this.hideBrief();
    this.showScreen('main');
    document.getElementById('menu').classList.add('open');
    this.syncMenu();
    this.syncHud();
  }

  closeMenu() {
    document.getElementById('menu').classList.remove('open');
  }

  showScreen(which) {
    ['main', 'levels', 'settings', 'help'].forEach(function (name) {
      document.getElementById('screen-' + name).hidden = (which !== name);
    });
  }

  startNew(diffKey, level) {
    this.clearSave();
    this.reset(diffKey, level || this.level);
    this.menuReturn = null;
    this.hideResult();
    this.hideBrief();
    this.closeMenu();
    this.syncHud();
  }

  /* перейти на следующий уровень после победы */
  nextLevel() {
    if (this.level >= Levels.COUNT) { this.openMenu(); return; }
    this.hideResult();
    this.showBrief(this.level + 1);
  }

  continueGame() {
    if (!this.loadSave()) return;
    this.menuReturn = null;
    this.hideResult();
    this.hideBrief();
    this.closeMenu();
  }

  /* ---------- разбор перед уровнем ----------
     Рисует карточку на каждую тварь, которая появится впервые,
     и на босса. Спрайт берём тот же, что в игре: рисуем его
     в маленький холст и растягиваем без сглаживания. */
  showBrief(level) {
    this.briefLevel = level;

    document.getElementById('brief-k').textContent = 'уровень ' + level;
    document.getElementById('brief-title').textContent = Levels.nameFor(level);

    const list = document.getElementById('brief-new');
    list.innerHTML = '';
    Levels.newcomersFor(level).forEach(function (kind) {
      list.appendChild(this.foeCard(kind, false));
    }, this);

    const boss = Levels.bossFor(level);
    const bossBox = document.getElementById('brief-boss');
    const bossList = document.getElementById('brief-boss-list');
    bossList.innerHTML = '';

    if (boss) {
      bossBox.hidden = false;
      bossList.appendChild(this.foeCard(boss, true));
    } else {
      bossBox.hidden = true;
    }

    this.closeMenu();
    document.getElementById('brief').classList.add('open');
  }

  hideBrief() {
    document.getElementById('brief').classList.remove('open');
  }

  foeCard(kind, isBoss) {
    const def = ENEMY_KINDS[kind];
    const card = document.createElement('div');
    card.className = 'foe' + (isBoss ? ' foe--boss' : '');

    /* спрайт рисуем в отдельный маленький холст */
    const size = Sprites.size(def.sprite);
    const cv = document.createElement('canvas');
    cv.width = size.w;
    cv.height = size.h;
    Sprites.draw(cv.getContext('2d'), def.sprite, 0, 0);

    const text = document.createElement('div');
    text.innerHTML = '<p class="foe__n"></p><p class="foe__d"></p>';
    text.querySelector('.foe__n').textContent = def.name;
    text.querySelector('.foe__d').textContent = def.about || Levels.aboutFor(kind);

    card.appendChild(cv);
    card.appendChild(text);
    return card;
  }

  /* ---------- список уровней ---------- */
  syncLevels() {
    const box = document.getElementById('levels');
    box.innerHTML = '';

    for (let i = 1; i <= Levels.COUNT; i++) {
      const open = this.levelUnlocked(i);
      const best = this.progress.best[i];

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lvl' + (open ? '' : ' lock');
      btn.innerHTML = '<b></b><span></span><span class="num"></span>';
      btn.querySelector('b').textContent = Levels.nameFor(i);
      btn.querySelector('.num').textContent = open ? i : '×';
      btn.querySelector('span:not(.num)').textContent =
        open ? (best ? 'лучший счёт ' + best : 'не пройден') : 'закрыт';

      if (open) {
        btn.addEventListener('click', function () {
          Sfx.play('ui');
          this.showBrief(i);
        }.bind(this));
      }

      box.appendChild(btn);
    }
  }

  syncMenu() {
    /* кнопка «продолжить» и подпись к ней */
    const cont = document.getElementById('menu-continue');
    const saved = Store.read(SAVE_KEY, null);

    if (saved) {
      const d = DIFFICULTIES[saved.diff] || DIFFICULTIES.normal;
      cont.hidden = false;
      cont.textContent = 'продолжить · уровень ' + (saved.level || 1) +
        ' · волна ' + Math.max(1, saved.waveIndex + 1);
    } else {
      cont.hidden = true;
    }

    /* выбранная сложность */
    document.querySelectorAll('.diff').forEach(function (b) {
      b.classList.toggle('on', b.dataset.diff === this.diff.key);
    }, this);

    /* таблица рекордов */
    const box = document.getElementById('menu-records');
    const rows = Object.keys(DIFFICULTIES).map(function (key) {
      const d = DIFFICULTIES[key];
      const r = this.records[key];
      return '<div class="rec"><span>' + d.name + '</span><b>' +
        (r ? r.score + ' · волна ' + r.wave : '—') + '</b></div>';
    }, this).join('');

    box.innerHTML = '<p class="menu__label">рекорды</p>' + rows;
  }

  wipe() {
    Store.remove(SAVE_KEY);
    Store.remove(RECORD_KEY);
    Store.remove(PROGRESS_KEY);
    this.records = {};
    this.progress = { unlocked: 1, best: {} };
    this.syncMenu();
    this.syncHud();
  }


  /* =======================================================
     ВВОД
     ======================================================= */
  bindEvents() {
    const canvas = this.canvas;

    const toLocal = function (e) {
      const r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (GameMap.WIDTH / r.width),
        y: (e.clientY - r.top) * (GameMap.HEIGHT / r.height)
      };
    };

    canvas.addEventListener('mousemove', function (e) {
      this.mouse = toLocal(e);
      this.hoveredSpot = this.state === 'menu' ? -1 : this.spotAt(this.mouse.x, this.mouse.y);
    }.bind(this));

    canvas.addEventListener('mouseleave', function () {
      this.mouse = { x: -99, y: -99 };
      this.hoveredSpot = -1;
    }.bind(this));

    canvas.addEventListener('click', function (e) {
      this.onClick(toLocal(e));
    }.bind(this));

    /* Браузер не даёт запускать звук до первого действия на странице,
       поэтому включаем его на первом же клике или нажатии клавиши. */
    const wake = function () { Sfx.wake(); };
    document.addEventListener('pointerdown', wake);
    document.addEventListener('keydown', wake);

    document.addEventListener('keydown', function (e) {
      if (e.code === 'Escape') { this.state === 'menu' ? this.closeMenuIfPossible() : this.openMenu(); return; }
      if (this.state === 'menu') return;

      if (e.code === 'Space') { e.preventDefault(); this.togglePause(); }
      if (e.code === 'KeyR') { this.clearSave(); this.reset(this.diff.key, this.level); }
      if (e.code === 'Digit1') this.selectKind('archer');
      if (e.code === 'Digit2') this.selectKind('fire');
      if (e.code === 'Digit3') this.selectKind('cannon');
      if (e.code === 'Digit4') this.selectKind('frost');
    }.bind(this));

    /* успеваем записать прогресс, если вкладку закрывают или прячут */
    window.addEventListener('beforeunload', function () { this.save(); }.bind(this));
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) this.save();
    }.bind(this));
  }

  /* Esc в меню возвращает в игру, но только если партия не кончилась */
  closeMenuIfPossible() {
    if (!this.menuReturn) return;
    this.state = this.menuReturn;
    this.menuReturn = null;
    this.closeMenu();
    this.syncHud();
  }

  /* Развилку можно переключить двумя путями: щелчком по стрелке
     на поле и кнопкой под ним. Логика одна, поэтому вынесена сюда. */
  toggleSwitch(id) {
    if (this.state !== 'prep' && this.state !== 'wave') return;
    const sw = this.switches.find(function (s) { return s.id === id; });
    if (!sw) return;
    sw.dir = sw.dir === 'a' ? 'b' : 'a';
    Sfx.play('switch');
    this.syncHud();
  }

  spotAt(x, y) {
    for (let i = 0; i < this.spots.length; i++) {
      const p = GameMap.toPx(this.spots[i]);
      if (Math.abs(x - p.x) <= 8 && Math.abs(y - p.y) <= 8) return i;
    }
    return -1;
  }

  /* Порядок проверок важен: сначала то, что исчезает (осколки),
     потом управление (стрелки), и только потом строительство. */
  onClick(pos) {
    if (this.state === 'menu') return;

    if (this.state === 'over' || this.state === 'won' || this.state === 'paused') return;

    /* осколок: вынимаем из списка сразу, а не помечаем мёртвым —
       иначе по нему можно щёлкнуть второй раз до ближайшей чистки */
    for (let i = 0; i < this.pickups.length; i++) {
      if (!this.pickups[i].isHit(pos.x, pos.y)) continue;

      const p = this.pickups.splice(i, 1)[0];
      Sfx.play('pickup');
      this.money += p.value;
      this.score += p.value;
      this.syncHud();
      return;
    }

    /* стрелка на развилке */
    for (let i = 0; i < this.switches.length; i++) {
      const p = GameMap.toPx(this.switches[i]);
      if (Math.hypot(pos.x - p.x, pos.y - p.y) <= 11) {
        this.toggleSwitch(this.switches[i].id);
        return;
      }
    }

    /* площадка: пустая — строим, занятая — выбираем башню */
    const idx = this.spotAt(pos.x, pos.y);
    if (idx >= 0) {
      const spot = this.spots[idx];

      if (spot.tower) {
        this.selectedTower = (this.selectedTower === spot.tower) ? null : spot.tower;
        this.syncHud();
        return;
      }

      this.build(idx);
      return;
    }

    this.selectedTower = null;
    this.syncHud();
  }

  build(idx) {
    const def = TOWER_KINDS[this.selectedKind];
    if (this.money < def.cost) { this.flashMoney(); return; }

    const tower = new Tower(this.selectedKind, this.spots[idx]);
    Sfx.play('build');
    this.spots[idx].tower = tower;
    this.towers.push(tower);
    this.money -= def.cost;
    this.selectedTower = tower;
    this.syncHud();
  }

  upgradeSelected() {
    const t = this.selectedTower;
    if (!t || !t.canUpgrade()) return;
    const cost = t.upgradeCost();
    if (this.money < cost) { this.flashMoney(); return; }

    this.money -= cost;
    t.upgrade();
    Sfx.play('upgrade');
    this.syncHud();
  }

  sellSelected() {
    const t = this.selectedTower;
    if (!t) return;

    let spent = t.def.cost;
    for (let i = 1; i <= t.level; i++) spent += t.def.levels[i].up;

    this.money += Math.floor(spent * 0.5);
    this.towers = this.towers.filter(function (x) { return x !== t; });
    this.spots.forEach(function (s) { if (s.tower === t) s.tower = null; });
    this.selectedTower = null;
    this.syncHud();
  }

  selectKind(kind) {
    this.selectedKind = kind;
    this.selectedTower = null;
    this.syncHud();
  }

  togglePause() {
    if (this.state === 'paused') {
      this.state = this.resumeTo || 'prep';
      this.hideResult();
    } else if (this.state === 'prep' || this.state === 'wave') {
      this.resumeTo = this.state;
      this.state = 'paused';
      this.save();
      this.showResult();
    }
    this.syncHud();
  }

  skipPrep() {
    if (this.state !== 'prep') return;
    /* досрочный вызов волны — награда за риск */
    this.money += Math.max(0, Math.floor(this.prep));
    this.startWave();
  }

  flashMoney() {
    Sfx.play('deny');
    const el = document.getElementById('hud-money');
    if (!el) return;
    el.classList.remove('flash');
    void el.offsetWidth;        // перезапуск анимации
    el.classList.add('flash');
  }


  /* =======================================================
     ПАНЕЛЬ — обычные элементы страницы, не холст
     ======================================================= */
  syncHud() {
    const set = function (id, value) {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    set('hud-money', this.money);
    set('hud-lives', this.lives);
    set('hud-score', this.score);
    set('hud-wave', Math.max(0, this.waveIndex + 1) + ' / ' + Levels.WAVES_PER_LEVEL);
    set('hud-level', this.level + ' · ' + Levels.nameFor(this.level));
    set('hud-record', this.record.score);

    const stateEl = document.getElementById('hud-state');
    if (stateEl) {
      stateEl.textContent =
        this.state === 'menu' ? 'меню'
        : this.state === 'prep' ? 'подготовка · ' + Math.ceil(Math.max(0, this.prep)) + ' с'
        : this.state === 'wave' ? 'волна · ' + this.diff.name
        : this.state === 'paused' ? 'пауза'
        : this.state === 'won' ? 'победа'
        : 'поражение';
    }

    const msg = document.getElementById('hud-msg');
    if (msg) msg.textContent = this.message;

    /* какие ветки выбраны сейчас */
    this.switches.forEach(function (sw) {
      const el = document.getElementById('fk-' + sw.id);
      if (el) el.textContent = GameMap.BRANCH_NAMES[sw.id][sw.dir];
    });

    document.querySelectorAll('.pick').forEach(function (btn) {
      btn.classList.toggle('on', btn.dataset.kind === this.selectedKind);
      const def = TOWER_KINDS[btn.dataset.kind];
      btn.classList.toggle('poor', this.money < def.cost);
    }, this);

    const panel = document.getElementById('tower-panel');
    if (!panel) return;

    if (!this.selectedTower) { panel.hidden = true; return; }

    const t = this.selectedTower;
    panel.hidden = false;
    set('tp-name', t.title);
    set('tp-hint', t.spec ? t.def.specs[t.spec].desc : t.def.hint);
    set('tp-dmg', (t.kind === 'fire' || t.kind === 'frost')
      ? t.stats.damage + ' / сек' : t.stats.damage);
    set('tp-range', Math.round(t.stats.range));
    set('tp-ammo', (t.kind === 'fire' || t.kind === 'frost')
      ? t.stats.ammo + ' с · ' + t.stats.reload + ' с'
      : t.stats.ammo + ' · ' + t.stats.reload + ' с');

    const up = document.getElementById('tp-up');
    const specs = document.getElementById('tp-specs');

    /* на последнем обычном уровне вместо кнопки «улучшить»
       показываем выбор одной из двух веток */
    if (t.canSpecialize()) {
      up.hidden = true;
      specs.hidden = false;

      ['a', 'b'].forEach(function (which) {
        const def = t.def.specs[which];
        const btn = document.getElementById('tp-spec-' + which);
        btn.querySelector('b').textContent = def.name;
        btn.querySelector('.spec__d').textContent = def.desc;
        btn.querySelector('.spec__c').textContent = def.cost;
        btn.classList.toggle('poor', this.money < def.cost);
      }, this);

    } else {
      specs.hidden = true;
      up.hidden = !t.canUpgrade();
      if (t.canUpgrade()) {
        up.textContent = 'улучшить · ' + t.upgradeCost();
        up.classList.toggle('poor', this.money < t.upgradeCost());
      }
    }
  }

  /* Выбор специализации: обратного хода нет, поэтому отдельный метод */
  specializeSelected(which) {
    const t = this.selectedTower;
    if (!t || !t.canSpecialize()) return;

    const cost = t.def.specs[which].cost;
    if (this.money < cost) { this.flashMoney(); return; }

    this.money -= cost;
    t.specialize(which);
    Sfx.play('spec');
    this.syncHud();
  }
}


/* ---------- запуск ---------- */
window.addEventListener('DOMContentLoaded', function () {
  const canvas = document.getElementById('screen');
  canvas.width = GameMap.WIDTH;
  canvas.height = GameMap.HEIGHT;

  const game = new Game(canvas);

  /* Ссылка на игру в консоли — удобно для отладки и для показа:
     можно выдать себе денег (game.money = 999) или перескочить волну. */
  window.game = game;

  /* Сначала заставка. Первое нажатие на ней будит звук —
     браузер не разрешает включать его раньше. */
  const splash = document.getElementById('splash');
  splash.classList.add('open');

  function leaveSplash() {
    if (!splash.classList.contains('open')) return;
    Sfx.init();
    Sfx.wake();
    splash.classList.remove('open');
    game.openMenu();
  }

  splash.addEventListener('pointerdown', leaveSplash);
  document.addEventListener('keydown', leaveSplash);

  document.querySelectorAll('.diff').forEach(function (btn) {
    btn.addEventListener('click', function () {
      game.diff = DIFFICULTIES[btn.dataset.diff];
      game.syncMenu();
      game.syncHud();
    });
  });

  document.getElementById('menu-levels').addEventListener('click', function () {
    game.syncLevels();
    game.showScreen('levels');
  });
  document.getElementById('levels-back').addEventListener('click', function () {
    game.showScreen('main');
  });
  document.getElementById('brief-go').addEventListener('click', function () {
    game.startNew(game.diff.key, game.briefLevel);
  });
  document.getElementById('brief-back').addEventListener('click', function () {
    game.hideBrief();
    game.openMenu();
  });
  document.getElementById('menu-continue').addEventListener('click', function () {
    game.continueGame();
  });
  document.getElementById('menu-help').addEventListener('click', function () {
    game.showScreen('help');
  });
  document.getElementById('menu-settings').addEventListener('click', function () {
    game.showScreen('settings');
  });
  document.getElementById('help-back').addEventListener('click', function () {
    game.showScreen('main');
  });
  document.getElementById('settings-back').addEventListener('click', function () {
    game.showScreen('main');
  });
  document.getElementById('menu-wipe').addEventListener('click', function () {
    game.wipe();
  });

  document.querySelectorAll('.pick').forEach(function (btn) {
    btn.addEventListener('click', function () { Sfx.play('ui'); game.selectKind(btn.dataset.kind); });
  });

  /* щелчок на любой кнопке интерфейса */
  document.querySelectorAll('.btn, .mbtn, .diff, .fork, .lvl').forEach(function (btn) {
    btn.addEventListener('click', function () { Sfx.play('ui'); });
  });

  document.getElementById('btn-skip').addEventListener('click', function () { game.skipPrep(); });
  document.getElementById('btn-pause').addEventListener('click', function () { game.togglePause(); });
  document.getElementById('btn-menu').addEventListener('click', function () { game.openMenu(); });

  /* громкость переключается из двух мест, подпись держим в обоих */
  const soundBtn = document.getElementById('btn-sound');
  const soundSet = document.getElementById('set-sound');

  function refreshSound() {
    soundBtn.textContent = Sfx.label();
    soundSet.textContent = Sfx.label();
  }
  function cycleSound() {
    Sfx.wake();
    Sfx.cycle();
    refreshSound();
  }
  refreshSound();
  soundBtn.addEventListener('click', cycleSound);
  soundSet.addEventListener('click', cycleSound);

  /* кнопки развилок под полем */
  document.querySelectorAll('.fork').forEach(function (btn) {
    btn.addEventListener('click', function () {
      game.toggleSwitch(parseInt(btn.dataset.sw, 10));
    });
  });
  document.getElementById('tp-up').addEventListener('click', function () { game.upgradeSelected(); });
  document.getElementById('tp-spec-a').addEventListener('click', function () { game.specializeSelected('a'); });
  document.getElementById('tp-spec-b').addEventListener('click', function () { game.specializeSelected('b'); });
  document.getElementById('res-resume').addEventListener('click', function () { game.togglePause(); });
  document.getElementById('res-again').addEventListener('click', function () { game.startNew(game.diff.key, game.level); });
  document.getElementById('res-next').addEventListener('click', function () { game.nextLevel(); });
  document.getElementById('res-menu').addEventListener('click', function () { game.openMenu(); });
  document.getElementById('tp-sell').addEventListener('click', function () { game.sellSelected(); });
});
