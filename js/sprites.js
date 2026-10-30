/* =========================================================
   ТРАКТ — спрайты

   Внешних картинок у игры нет вообще: каждый спрайт записан
   прямо в коде как сетка символов, где символ — это цвет из
   палитры. Такой приём называется пиксель-артом в коде: он
   занимает мало места, не требует загрузки файлов и его легко
   править прямо здесь, строка за строкой.

   Точка '.' означает прозрачный пиксель.
   ========================================================= */

'use strict';

const Sprites = (function () {

  /* ---------- палитра ----------
     Один символ — один цвет. Держим её общей для всех спрайтов,
     чтобы картинка выглядела как одно целое. */
  const PALETTE = {
    '.': null,          // прозрачно
    'k': '#0d0d10',     // почти чёрный, обводка
    'd': '#1b1f24',     // тёмный серый
    'g': '#2f3a3f',     // серый
    'l': '#55646b',     // светлый серый
    'w': '#b9c6c9',     // белёсый
    'f': '#e8dfae',     // свет, огонь
    'o': '#d98020',     // оранжевый, пламя
    'r': '#8e2b2b',     // кровь, красный
    'p': '#6d4f7a',     // фиолетовый, нежить
    'm': '#3f6b4a',     // болотный
    'y': '#c9a227',     // латунь, метка
    'b': '#2a4a6b',     // холодный синий
    'c': '#9fd8e8',     // лёд
    's': '#6b737a'      // сталь, броня
  };

  /* ---------- враги ---------- */

  /* Ползун — медленный, живучий. Горбатая тварь на четырёх точках опоры. */
  const CRAWLER = [
    '..kkkk..',
    '.kmmmmk.',
    'kmgmmgmk',
    'kmmkkmmk',
    'kmmmmmmk',
    '.kmmmmk.',
    '.k.kk.k.',
    '..k..k..'
  ];

  /* Бегун — быстрый и хлипкий. Вытянутый силуэт. */
  const RUNNER = [
    '...kk...',
    '..kppk..',
    '..kpkk..',
    '.kpppk..',
    'kpkppk..',
    '.k.kpk..',
    '...k.k..',
    '..k...k.'
  ];

  /* Туша — медленная громадина, появляется в поздних волнах. */
  const BRUTE = [
    '...kkkkkk...',
    '..kddddddk..',
    '.kdrddddrdk.',
    'kdddkddkdddk',
    'kddddddddddk',
    'kdkddddddkdk',
    'kdddddddddk.',
    '.kddddddddk.',
    '.kdddddddk..',
    '..kdk..kdk..',
    '..kdk..kdk..',
    '..kk....kk..'
  ];

  /* Летун — крылатая тварь. Идёт по прямой, дороги не видит. */
  const FLYER = [
    '..k....k..',
    '.kwk..kwk.',
    'kwpwkkwpwk',
    '.kwppppwk.',
    '..kpkkpk..',
    '...kppk...',
    '....kk....',
    '..........'
  ];

  /* Панцирь — закован в пластины. Срезает часть каждого попадания. */
  const ARMOR = [
    '..kkkkkk..',
    '.ksssssk..',
    'ksslllssk.',
    'kssssssssk',
    'kslskkslsk',
    'kssssssssk',
    '.kssssssk.',
    '.kskkkksk.',
    '..kk..kk..',
    '..........'
  ];

  /* Рой — при смерти распадается на мелочь. */
  const SWARM = [
    '...kkkk...',
    '..kmmmmk..',
    '.kmmmmmmk.',
    'kmmkmmkmmk',
    'kmmmmmmmmk',
    'kmmmmmmmmk',
    '.kmmmmmmk.',
    '..kmmmmk..',
    '...kkkk...',
    '..........'
  ];

  const SWARMLING = [
    '..kk..',
    '.kmmk.',
    'kmkkmk',
    'kmmmmk',
    '.kmmk.',
    '..kk..'
  ];

  /* Плакальщица — лечит соседей, сама почти безобидна. */
  const WEEPER = [
    '..kkkk..',
    '.kwwwwk.',
    'kwkwwkwk',
    'kwwwwwwk',
    '.kwwwwk.',
    '..kwwk..',
    '.kwwwwk.',
    'kwwkkwwk',
    '.kwwwwk.',
    '..kwwk..',
    '..k..k..',
    '.k....k.'
  ];

  /* Вожак — рогатый. Стрелки на него не действуют. */
  const LEADER = [
    'k........k',
    '.k......k.',
    '..kkrrkk..',
    '.krrrrrrk.',
    'krryrryrrk',
    'krrrkkrrrk',
    '.krrrrrrk.',
    '..krrrrk..',
    '..k.rr.k..',
    '...k..k...'
  ];


  /* Теневик — мерцает и на миг становится неуязвимым. */
  const SHADE = [
    '...kkkk...',
    '..kppppk..',
    '.kppkkppk.',
    'kppppppppk',
    'kppkppkppk',
    '.kppppppppk'.slice(0, 10),
    '..kppppk..',
    '.k.kppk.k.',
    '..k.kk.k..',
    '..........'
  ];

  /* Глушитель — пока жив, башни рядом стреляют вяло. */
  const DAMPER = [
    '..k....k..',
    '...k..k...',
    '....kk....',
    '..kkbbkk..',
    '.kbbbbbbk.',
    'kbbkbbkbbk',
    'kbbbbbbbbk',
    '.kbbbbbbk.',
    '..kbbbbk..',
    '..kb..bk..',
    '..k....k..',
    '..........'
  ];

  /* ---------- боссы ----------
     Втрое крупнее обычных тварей — это и есть главный сигнал,
     что идёт кто-то, кого надо встречать всем, что есть. */

  /* Матка — на ходу роняет выводок. */
  const BOSS_BROOD = [
    '.....kkkkkk.....',
    '...kkmmmmmmkk...',
    '..kmmmmmmmmmmk..',
    '.kmmrmmmmmmrmmk.',
    'kmmmmmmmmmmmmmmk',
    'kmmkmmmmmmmmkmmk',
    'kmmmmmkkkkmmmmmk',
    'kmmmmkrrrrkmmmmk',
    'kmmmmkrrrrkmmmmk',
    'kmmmmmkkkkmmmmmk',
    '.kmmmmmmmmmmmmk.',
    '..kmmmmmmmmmmk..',
    '..k.kk.kk.kk.k..',
    '....k...k...k...'
  ];

  /* Исполин — закован в броню, медленный, почти неубиваемый в лоб. */
  const BOSS_COLOSSUS = [
    '....kkkkkkkk....',
    '..kksssssssskk..',
    '.kssssssssssssk.',
    'ksslllssssslllsk',
    'kssssssssssssssk',
    'kssksssssssskssk',
    'kssssssssssssssk',
    'kssskkkkkkkksssk',
    'ksskrrrrrrkksssk',
    'ksskrrrrrrkksssk',
    'kssskkkkkkkksssk',
    'kssssssssssssssk',
    '.kssssssssssssk.',
    '..kksssssssskk..',
    '...kk.kk.kk.kk..',
    '....k...k...k...'
  ];

  /* Ткач — лечит всё вокруг и сам временами уходит в тень. */
  const BOSS_WEAVER = [
    '.....kkkk.....',
    '...kkwwwwkk...',
    '..kwwwwwwwwk..',
    '.kwwkwwwwkwwk.',
    'kwwwwwwwwwwwwk',
    'kwwwkwwwwkwwwk',
    'kwwwwwkkwwwwwk',
    '.kwwwwwwwwwwk.',
    '..kwwwwwwwwk..',
    '..kwwkwwkwwk..',
    '..kwwwwwwwwk..',
    '...kwwwwwwk...',
    '...kwwkkwwk...',
    '..k..kwwk..k..',
    '.k...k..k...k.',
    'k....k..k....k'
  ];

  /* Владыка тракта — последний. Всё сразу. */
  const BOSS_LORD = [
    '..k...kkkk...k..',
    '..kk.kddddk.kk..',
    '...kkkddddkkk...',
    '..kddddddddddk..',
    '.kddyddddddyddk.',
    'kddddddddddddddk',
    'kddkddddddddkddk',
    'kddddkkkkkkddddk',
    'kdddkrrrrrrkdddk',
    'kdddkrrrrrrkdddk',
    'kddddkkkkkkddddk',
    'kddddddddddddddk',
    '.kddddddddddddk.',
    '..kddddddddddk..',
    '...kk.kk.kk.k...',
    '....k..k..k.....'
  ];

  /* ---------- башни ---------- */

  /* Стрелок — вышка с арбалетчиком. Бьёт часто, по одной цели. */
  const TOWER_ARCHER = [
    '....kk......',
    '...kwwk.....',
    '...kwwk.....',
    '..kkllkk....',
    '.klllllllk..',
    'kllgggglllk.',
    'kllgggglllk.',
    '.kggggggk...',
    '..kggggk....',
    '..kggggk....',
    '..kdddddk...',
    '..kkkkkkk...'
  ];

  /* Костёр — жжёт всех рядом и освещает. Медленный, но по площади. */
  const TOWER_FIRE = [
    '.....f......',
    '....fof.....',
    '...ffoff....',
    '...foooof...',
    '..ffoorof...',
    '..foorrof...',
    '...fooof....',
    '....kkk.....',
    '..kkdddkk...',
    '.kdddddddk..',
    '.kdglllgdk..',
    '..kkkkkkk...'
  ];

  /* Пушка — редко, но с разлётом по площади. */
  const TOWER_CANNON = [
    '............',
    '......kkk...',
    '....kkggkk..',
    '...kgggggk..',
    '..kggggggk..',
    '..kgglllgk..',
    '..kggggggk..',
    '...kgggk....',
    '..kkdddkk...',
    '.kdddddddk..',
    '.kdglllgdk..',
    '..kkkkkkk...'
  ];

  /* Морозник — ледяной столб. Урона почти нет, зато всё вокруг стынет. */
  const TOWER_FROST = [
    '.....c......',
    '....ccc.....',
    '...ccbcc....',
    '...cbbbc....',
    '..ccbbbcc...',
    '..cbbbbbc...',
    '...cbbbc....',
    '....kkk.....',
    '..kkdddkk...',
    '.kdddddddk..',
    '.kdglllgdk..',
    '..kkkkkkk...'
  ];

  /* ---------- прочее ---------- */

  /* Убежище — то, что защищаем. Горящее окно в темноте. */
  const SHELTER = [
    '.......kk.......',
    '......kddk......',
    '.....kddddk.....',
    '....kddddddk....',
    '...kddddddddk...',
    '..kddddddddddk..',
    '.kddddddddddddk.',
    'kddddddddddddddk',
    '..kggggggggggk..',
    '..kggffggffggk..',
    '..kggffggffggk..',
    '..kggggggggggk..',
    '..kgggkffkgggk..',
    '..kgggkffkgggk..',
    '..kkkkkkkkkkkk..',
    '................'
  ];

  /* Осколок — выпадает из врага, его надо успеть подобрать. */
  const SHARD = [
    '..ff..',
    '.foof.',
    'fooyof',
    'fooyof',
    '.foof.',
    '..ff..'
  ];

  /* ---------- рисование ---------- */

  /* Рисует спрайт по сетке символов. x и y — левый верхний угол
     в логических пикселях. Прозрачные точки просто пропускаются. */
  function draw(ctx, sprite, x, y) {
    for (let row = 0; row < sprite.length; row++) {
      const line = sprite[row];
      for (let col = 0; col < line.length; col++) {
        const color = PALETTE[line[col]];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x + col, y + row, 1, 1);
      }
    }
  }

  /* То же самое, но спрайт ставится по центру точки —
     так удобнее рисовать движущиеся объекты. */
  function drawCentered(ctx, sprite, cx, cy) {
    const w = sprite[0].length;
    const h = sprite.length;
    draw(ctx, sprite, Math.round(cx - w / 2), Math.round(cy - h / 2));
  }

  /* Перекрашивает спрайт: нужен, чтобы из одного рисунка получить
     несколько вариантов врага, не рисуя каждый заново. */
  function recolor(sprite, from, to) {
    return sprite.map(function (line) {
      return line.split('').map(function (ch) { return ch === from ? to : ch; }).join('');
    });
  }

  function size(sprite) {
    return { w: sprite[0].length, h: sprite.length };
  }

  return {
    PALETTE: PALETTE,
    CRAWLER: CRAWLER,
    RUNNER: RUNNER,
    BRUTE: BRUTE,
    FLYER: FLYER,
    ARMOR: ARMOR,
    SWARM: SWARM,
    SWARMLING: SWARMLING,
    WEEPER: WEEPER,
    LEADER: LEADER,
    SHADE: SHADE,
    DAMPER: DAMPER,
    BOSS_BROOD: BOSS_BROOD,
    BOSS_COLOSSUS: BOSS_COLOSSUS,
    BOSS_WEAVER: BOSS_WEAVER,
    BOSS_LORD: BOSS_LORD,
    TOWER_ARCHER: TOWER_ARCHER,
    TOWER_FIRE: TOWER_FIRE,
    TOWER_CANNON: TOWER_CANNON,
    TOWER_FROST: TOWER_FROST,
    SHELTER: SHELTER,
    SHARD: SHARD,
    draw: draw,
    drawCentered: drawCentered,
    recolor: recolor,
    size: size
  };

})();
