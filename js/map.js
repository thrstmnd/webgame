/* =========================================================
   ТРАКТ — карта и дорога

   Дорога здесь не одна линия, а граф: цепочка точек, в которой
   две точки — развилки. У развилки два продолжения, и какое из
   них выберет тварь, решает стрелка. Стрелку переключает игрок
   мышью прямо во время волны.

   Карта спроектирована вокруг этой механики, и у неё два правила.

   1. Ветки развилки одинаковой длины. Если бы одна была короче,
      игрок просто выбрал бы длинную и забыл про стрелку. Раз
      ветки равны, выбор идёт не про время, а про то, чьи башни
      сейчас заряжены.

   2. Площадки под башни разведены по веткам. Ни одна площадка
      не простреливает обе ветви развилки — иначе ветки сливаются
      в одну и переключать опять незачем. Исключение только у
      снайпера: он бьёт так далеко, что достаёт обе, но это
      дорогая и редкая награда за прокачку.

   Координаты задаются в клетках, а не в пикселях: так карту
   проще читать и править. Перевод в пиксели делает toPx().
   ========================================================= */

'use strict';

const GameMap = (function () {

  const TILE = 16;            // размер клетки в логических пикселях
  const COLS = 24;
  const ROWS = 14;

  /* ---------- узлы дороги ----------
     next  — куда идти дальше (индекс узла)
     fork  — развилка: два продолжения и номер стрелки,
             которая выбирает между ними                      */
  const NODES = [
    { x: -1, y: 7,  next: 1 },                                  //  0 вход из тумана

    { x: 3,  y: 7,  fork: { id: 0, a: 2, b: 4 } },              //  1 ПЕРВАЯ РАЗВИЛКА

    { x: 3,  y: 2,  next: 3 },                                  //  2 гребень: вверх
    { x: 11, y: 2,  next: 6 },                                  //  3 гребень: вправо

    { x: 3,  y: 12, next: 5 },                                  //  4 низина: вниз
    { x: 11, y: 12, next: 6 },                                  //  5 низина: вправо

    { x: 11, y: 7,  next: 7 },                                  //  6 схождение

    { x: 13, y: 7,  fork: { id: 1, a: 8, b: 10 } },             //  7 ВТОРАЯ РАЗВИЛКА

    { x: 13, y: 4,  next: 9 },                                  //  8 верхний обход
    { x: 20, y: 4,  next: 12 },                                 //  9 верхний обход

    { x: 13, y: 10, next: 11 },                                 // 10 нижний обход
    { x: 20, y: 10, next: 12 },                                 // 11 нижний обход

    { x: 20, y: 7,  next: 13 },                                 // 12 схождение
    { x: 22, y: 7,  next: null }                                // 13 убежище
  ];

  /* промежуточные изгибы между узлами, если путь идёт уголком */
  const BENDS = {};

  /* ---------- стрелки на развилках ---------- */
  const SWITCHES = [
    { id: 0, x: 3,  y: 7, dir: 'a' },   // dir: какая ветка выбрана сейчас
    { id: 1, x: 13, y: 7, dir: 'a' }
  ];

  /* ---------- названия веток ----------
     Показываются рядом со стрелкой, чтобы игрок понимал,
     куда он сейчас направляет поток.                      */
  const BRANCH_NAMES = {
    0: { a: 'гребень', b: 'низина' },
    1: { a: 'верхом',  b: 'низом' }
  };

  /* ---------- площадки под башни ----------
     Сгруппированы по веткам. Площадки одной группы не достают
     до чужой ветки — в этом весь смысл расстановки.            */
  const SPOTS = [
    /* у входа — бьёт по всем, кто ещё не свернул */
    { x: 1,  y: 5 },

    /* гребень: верхняя ветка первой развилки */
    { x: 5,  y: 0 }, { x: 9,  y: 0 },
    { x: 6,  y: 4 }, { x: 9,  y: 4 },

    /* низина: нижняя ветка первой развилки */
    { x: 5,  y: 13 }, { x: 9,  y: 13 },
    { x: 6,  y: 10 }, { x: 9,  y: 10 },

    /* верхний обход: верхняя ветка второй развилки */
    { x: 15, y: 2 }, { x: 18, y: 2 },

    /* нижний обход: нижняя ветка второй развилки */
    { x: 15, y: 12 }, { x: 18, y: 12 },

    /* у убежища — последний рубеж, достаёт схождение */
    { x: 22, y: 4 }, { x: 22, y: 10 }
  ];

  /* Центр клетки в пикселях */
  function toPx(tile) {
    return { x: tile.x * TILE + TILE / 2, y: tile.y * TILE + TILE / 2 };
  }

  /* ---------- построение маршрута ----------
     Тварь не ищет дорогу сама: дойдя до узла, она спрашивает
     у карты следующий отрезок. Поэтому переключение стрелки
     действует на тех, кто ещё не дошёл до развилки, и не
     телепортирует тех, кто уже свернул.                        */
  function nextPoints(nodeIndex, switches, forceBranch) {
    const node = NODES[nodeIndex];
    if (!node) return { points: [], next: null };

    let nextIndex;

    if (node.fork) {
      /* forceBranch нужен вожакам: они не смотрят на стрелки
         и всегда идут своей веткой */
      let dir;
      if (forceBranch) {
        dir = forceBranch;
      } else {
        const sw = switches.find(function (s) { return s.id === node.fork.id; });
        dir = sw ? sw.dir : 'a';
      }
      nextIndex = (dir === 'b') ? node.fork.b : node.fork.a;
    } else {
      nextIndex = node.next;
    }

    if (nextIndex === null || nextIndex === undefined) {
      return { points: [], next: null };
    }

    const points = [];
    const bend = BENDS[nodeIndex + '-' + nextIndex];
    if (bend) bend.forEach(function (b) { points.push(toPx(b)); });
    points.push(toPx(NODES[nextIndex]));

    return { points: points, next: nextIndex };
  }

  /* ---------- отрисовка ---------- */

  /* Собираем все отрезки дороги один раз, чтобы рисовать фон
     без пересчётов каждый кадр. */
  function allSegments() {
    const segs = [];

    NODES.forEach(function (node, i) {
      const targets = node.fork ? [node.fork.a, node.fork.b]
                    : (node.next !== null && node.next !== undefined ? [node.next] : []);

      targets.forEach(function (t) {
        const from = toPx(node);
        const bend = BENDS[i + '-' + t];
        let prev = from;

        if (bend) {
          bend.forEach(function (b) {
            segs.push({ a: prev, b: toPx(b) });
            prev = toPx(b);
          });
        }
        segs.push({ a: prev, b: toPx(NODES[t]) });
      });
    });

    return segs;
  }

  const SEGMENTS = allSegments();

  function drawGround(ctx) {
    /* фон — тёмная земля с еле заметной сеткой */
    ctx.fillStyle = '#0f1216';
    ctx.fillRect(0, 0, COLS * TILE, ROWS * TILE);

    ctx.fillStyle = '#12161b';
    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < ROWS; y++) {
        if ((x + y) % 2 === 0) ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }

    /* дорога: широкая тёмная полоса и светлая кромка */
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = '#1e242b';
    ctx.lineWidth = 11;
    SEGMENTS.forEach(function (s) {
      ctx.beginPath();
      ctx.moveTo(s.a.x, s.a.y);
      ctx.lineTo(s.b.x, s.b.y);
      ctx.stroke();
    });

    ctx.strokeStyle = '#2b333c';
    ctx.lineWidth = 7;
    SEGMENTS.forEach(function (s) {
      ctx.beginPath();
      ctx.moveTo(s.a.x, s.a.y);
      ctx.lineTo(s.b.x, s.b.y);
      ctx.stroke();
    });
  }

  function drawSpots(ctx, spots, hovered) {
    spots.forEach(function (spot, i) {
      if (spot.tower) return;

      const p = toPx(spot);
      const on = (i === hovered);

      ctx.strokeStyle = on ? '#c9a227' : '#2f3a3f';
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x - 5.5, p.y - 5.5, 11, 11);

      ctx.fillStyle = on ? 'rgba(201,162,39,.18)' : 'rgba(85,100,107,.10)';
      ctx.fillRect(p.x - 5, p.y - 5, 10, 10);
    });
  }

  return {
    TILE: TILE, COLS: COLS, ROWS: ROWS,
    WIDTH: COLS * TILE, HEIGHT: ROWS * TILE,
    NODES: NODES,
    SWITCHES: SWITCHES,
    SPOTS: SPOTS,
    BRANCH_NAMES: BRANCH_NAMES,
    toPx: toPx,
    nextPoints: nextPoints,
    drawGround: drawGround,
    drawSpots: drawSpots
  };

})();
