/* =========================================================
   ТРАКТ — уровни

   Десять уровней по двенадцать волн. Состав волн не выписан
   руками сто двадцать раз: он собирается по правилу из списка
   тварей, открытых к этому уровню. Так накал растёт ровно,
   без ям и скачков, и правится одним числом, а не таблицей.

   Каждый уровень открывает один новый вид. Перед началом
   игра показывает, кто это и чем опасен, — иначе новая тварь
   выглядит как внезапная несправедливость.
   ========================================================= */

'use strict';

const Levels = (function () {

  const WAVES_PER_LEVEL = 12;

  /* Фон любой волны: эти двое идут всегда */
  const BASE = ['crawler', 'runner'];

  /* Порядок, в котором открываются особые твари.
     Уровень 1 — только фон, дальше по одному виду за уровень. */
  const UNLOCK = ['brute', 'armor', 'flyer', 'swarm', 'weeper', 'leader', 'shade', 'damper'];

  /* Босс на последней волне уровня. На первом его нет —
     там игрок только осваивается. */
  const BOSSES = [
    null,
    'boss_brood',
    'boss_brood',
    'boss_colossus',
    'boss_colossus',
    'boss_weaver',
    'boss_weaver',
    'boss_colossus',
    'boss_weaver',
    'boss_lord'
  ];

  const NAMES = [
    'Первая ночь',
    'Туман гуще',
    'Железные шкуры',
    'Небо не пустое',
    'Они делятся',
    'Чужие молитвы',
    'Своим путём',
    'Мерцание',
    'Глухота',
    'Владыка тракта'
  ];

  /* Короткие объяснения — показываются перед уровнем */
  const ABOUT = {
    crawler: 'Медленный и живучий. Основа любой волны.',
    runner:  'Быстрый и хлипкий. Проскакивает мимо медленных башен.',
    brute:   'Громадина. Идёт медленно, но здоровья столько, что одной башней не взять.',
    armor:   'Срезает 7 урона с каждого попадания. Частые мелкие выстрелы бесполезны — нужна пушка.',
    flyer:   'Летит по прямой к убежищу. Дороги и стрелок не видит. Достаёт его только стрелок.',
    swarm:   'При смерти распадается на троих быстрых. Убивать у самого убежища опасно.',
    weeper:  'Лечит всех вокруг. Пока она жива, соседи почти не умирают — выбивать первой.',
    leader:  'Не подчиняется стрелкам и всегда идёт своей веткой. Главная механика на него не действует.',
    shade:   'Мерцает. Пока в тени, попадания по нему не проходят вовсе — часть выстрелов уходит впустую.',
    damper:  'Пока жив, башни рядом стреляют вдвое медленнее. Глушит оборону с краю.'
  };


  /* ---------- что открыто к уровню ---------- */

  function specialsFor(level) {
    return UNLOCK.slice(0, Math.max(0, level - 1));
  }

  function rosterFor(level) {
    return BASE.concat(specialsFor(level));
  }

  /* Кто появляется впервые именно на этом уровне */
  function newcomersFor(level) {
    if (level === 1) return BASE.slice();
    const kind = UNLOCK[level - 2];
    return kind ? [kind] : [];
  }

  function bossFor(level) {
    return BOSSES[level - 1] || null;
  }

  function nameFor(level) {
    return NAMES[level - 1] || ('Уровень ' + level);
  }

  function aboutFor(kind) {
    return ABOUT[kind] || '';
  }


  /* ---------- сборка волн ----------
     heat — общий накал: растёт и внутри уровня, и от уровня
     к уровню. Все количества считаются от него, поэтому
     кривая сложности получается гладкой.                      */
  function buildWaves(level) {
    const specials = specialsFor(level);
    const boss = bossFor(level);
    const waves = [];

    for (let w = 0; w < WAVES_PER_LEVEL; w++) {
      const heat = w + (level - 1) * 1.5;
      const groups = [];

      /* фон: ползуны и бегуны чередуются по волнам */
      groups.push({
        kind: BASE[w % 2],
        count: Math.round(5 + heat * 0.7),
        gap: Math.max(0.28, 0.95 - heat * 0.028)
      });

      /* с четвёртой волны к фону добавляется второй вид фона */
      if (w >= 3) {
        groups.push({
          kind: BASE[(w + 1) % 2],
          count: Math.round(3 + heat * 0.45),
          gap: Math.max(0.3, 0.9 - heat * 0.022),
          delay: 5
        });
      }

      /* особые виды: чередуются, чтобы в каждой волне было
         не больше двух — иначе читать происходящее невозможно */
      if (specials.length) {
        const first = specials[w % specials.length];
        groups.push({
          kind: first,
          count: Math.max(1, Math.round(1 + heat * 0.26)),
          gap: 1.8,
          delay: 3
        });

        if (w >= 4 && specials.length > 1) {
          const second = specials[(w + 2) % specials.length];
          if (second !== first) {
            groups.push({
              kind: second,
              count: Math.max(1, Math.round(0.5 + heat * 0.18)),
              gap: 2.1,
              delay: 8
            });
          }
        }
      }

      /* последняя волна уровня — босс */
      if (w === WAVES_PER_LEVEL - 1 && boss) {
        groups.push({ kind: boss, count: 1, gap: 1, delay: 5 });
      }

      waves.push(groups);
    }

    return waves;
  }


  /* ---------- поправки на сложность ----------
     Обычные твари крепчают и внутри уровня, и между уровнями.
     Боссы — только между уровнями: иначе на десятом уровне
     финальный босс стал бы неубиваемым.                        */
  function mods(level, waveIndex, diff) {
    return {
      normal: {
        hp: diff.hp * (1 + waveIndex * 0.10) * (1 + (level - 1) * 0.20),
        speed: diff.speed * (1 + (level - 1) * 0.02)
      },
      boss: {
        hp: diff.hp * (1 + (level - 1) * 0.18),
        speed: diff.speed
      }
    };
  }


  return {
    COUNT: NAMES.length,
    WAVES_PER_LEVEL: WAVES_PER_LEVEL,
    rosterFor: rosterFor,
    newcomersFor: newcomersFor,
    bossFor: bossFor,
    nameFor: nameFor,
    aboutFor: aboutFor,
    buildWaves: buildWaves,
    mods: mods
  };

})();
