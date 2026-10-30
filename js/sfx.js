/* =========================================================
   ТРАКТ — звук

   Ни одного звукового файла в проекте нет. Все звуки собираются
   прямо в браузере из простых источников: генератор волны даёт
   тон, генератор шума — шипение и удары, фильтры убирают лишние
   частоты, а огибающая громкости задаёт форму — резкий щелчок
   или мягкое затухание.

   Это тот же приём, что со спрайтами: вместо готового ресурса —
   рецепт в коде. Папка остаётся чистой статикой, грузить нечего.

   Важная тонкость: браузер не даёт играть звук, пока человек
   не сделал что-нибудь на странице. Поэтому всё включается при
   первом клике или нажатии клавиши.
   ========================================================= */

'use strict';

const Sfx = (function () {

  let ctx = null;          // звуковой контекст, создаём по первому действию
  let master = null;       // общая громкость
  let ambientGain = null;  // громкость фонового гула
  let noiseBuffer = null;  // заготовка шума, делается один раз

  /* три положения: громко, тише, выключено */
  const LEVELS = [0.9, 0.35, 0];
  const LABELS = ['звук', 'тише', 'без звука'];
  const KEY = 'trakt_sound';

  let level = 0;
  try {
    const saved = parseInt(localStorage.getItem(KEY), 10);
    if (saved >= 0 && saved < LEVELS.length) level = saved;
  } catch (e) { /* хранилище недоступно — играем с громкостью по умолчанию */ }

  /* Чтобы при частой стрельбе звук не превращался в сплошной треск,
     у каждого вида есть минимальный промежуток между повторами. */
  const COOLDOWN = {
    shot: 0.045, hit: 0.05, cannon: 0.08, death: 0.05,
    pickup: 0.05, ui: 0.03
  };
  const lastPlayed = {};


  /* ---------- включение ---------- */

  function init() {
    if (ctx) return;

    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;                 // очень старый браузер — просто без звука

    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = LEVELS[level];
    master.connect(ctx.destination);

    /* заготовка шума: две секунды случайных значений.
       Из неё потом получаются удары, шипение и фоновый гул. */
    const len = ctx.sampleRate * 2;
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < len; i++) {
      /* слегка сглаживаем: получается не резкий белый шум,
         а более глухой — он приятнее на слух */
      const white = Math.random() * 2 - 1;
      prev = (prev + white * 0.25) * 0.92;
      data[i] = prev;
    }

    startAmbient();
  }

  /* Браузер может держать контекст «на паузе», пока страница
     не получила действия от человека. */
  function wake() {
    if (!ctx) { init(); return; }
    if (ctx.state === 'suspended') ctx.resume();
  }


  /* ---------- кирпичики ---------- */

  /* Тон: одна волна с плавным затуханием. slide — если нужно,
     чтобы высота поехала вверх или вниз. */
  function tone(o) {
    if (!ctx || !LEVELS[level]) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + o.dur);

    /* огибающая: быстрый подъём и затухание до нуля */
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(o.gain, t + (o.attack || 0.005));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);

    osc.connect(gain);
    gain.connect(master);

    osc.start(t + (o.delay || 0));
    osc.stop(t + o.dur + (o.delay || 0) + 0.02);
  }

  /* Шум через фильтр: удары, шипение, взрывы */
  function noise(o) {
    if (!ctx || !LEVELS[level] || !noiseBuffer) return;

    const t = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = o.filter || 'lowpass';
    filter.frequency.setValueAtTime(o.freq, t);
    if (o.slide) filter.frequency.exponentialRampToValueAtTime(Math.max(40, o.slide), t + o.dur);
    filter.Q.value = o.q || 1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(o.gain, t + (o.attack || 0.004));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);

    src.start(t);
    src.stop(t + o.dur + 0.02);
  }


  /* ---------- фоновый гул ----------
     Очень низкий шум на малой громкости. Сам по себе почти
     не слышен, но без него тишина между волнами звучит мёртво. */
  function startAmbient() {
    if (!ctx || !noiseBuffer) return;

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 140;

    ambientGain = ctx.createGain();
    ambientGain.gain.value = 0.16;

    /* медленное дыхание громкости, чтобы гул не был ровным */
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 0.07;
    lfo.connect(lfoGain);
    lfoGain.connect(ambientGain.gain);

    src.connect(filter);
    filter.connect(ambientGain);
    ambientGain.connect(master);

    src.start();
    lfo.start();
  }


  /* ---------- рецепты звуков ---------- */
  const RECIPES = {

    /* стрелок: короткий сухой щелчок тетивы */
    shot() {
      tone({ type: 'square', freq: 900, slide: 500, dur: 0.06, gain: 0.05 });
    },

    /* пушка: низкий удар плюс хлопок */
    cannon() {
      tone({ type: 'sine', freq: 110, slide: 42, dur: 0.26, gain: 0.22 });
      noise({ freq: 900, slide: 160, dur: 0.22, gain: 0.16 });
    },

    /* попадание: сухой тик */
    hit() {
      noise({ freq: 2600, slide: 900, dur: 0.045, gain: 0.07, filter: 'bandpass', q: 2 });
    },

    /* смерть твари: короткий сдавленный хрип */
    death() {
      noise({ freq: 1100, slide: 220, dur: 0.17, gain: 0.12, filter: 'bandpass', q: 1.2 });
      tone({ type: 'sawtooth', freq: 180, slide: 70, dur: 0.16, gain: 0.05 });
    },

    /* стрелка на развилке: механический щелчок рычага.
       Отдельный, узнаваемый — это главное действие игрока. */
    switch() {
      noise({ freq: 3200, dur: 0.03, gain: 0.14, filter: 'highpass' });
      tone({ type: 'square', freq: 220, slide: 160, dur: 0.07, gain: 0.08, delay: 0.02 });
    },

    /* осколок подобран: яркий звон */
    pickup() {
      tone({ type: 'triangle', freq: 1400, dur: 0.07, gain: 0.1 });
      tone({ type: 'triangle', freq: 2100, dur: 0.1, gain: 0.07, delay: 0.05 });
    },

    /* башня построена: два тона вверх */
    build() {
      tone({ type: 'square', freq: 440, dur: 0.08, gain: 0.09 });
      tone({ type: 'square', freq: 660, dur: 0.12, gain: 0.09, delay: 0.07 });
    },

    /* улучшение: короткий подъём */
    upgrade() {
      [523, 659, 784].forEach(function (f, i) {
        tone({ type: 'square', freq: f, dur: 0.1, gain: 0.08, delay: i * 0.06 });
      });
    },

    /* специализация: то же, но длиннее и с верхней нотой */
    spec() {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ type: 'square', freq: f, dur: 0.16, gain: 0.09, delay: i * 0.08 });
      });
    },

    /* тварь дошла до убежища: тревожный низкий удар */
    leak() {
      tone({ type: 'sawtooth', freq: 190, slide: 70, dur: 0.4, gain: 0.2 });
      noise({ freq: 500, slide: 120, dur: 0.35, gain: 0.12 });
    },

    /* начало волны: низкий рог из тумана */
    wave() {
      tone({ type: 'sawtooth', freq: 82, dur: 0.9, gain: 0.14, attack: 0.15 });
      tone({ type: 'sawtooth', freq: 123, dur: 0.8, gain: 0.08, attack: 0.2, delay: 0.1 });
    },

    /* волна отбита: спокойный аккорд */
    clear() {
      [523, 784].forEach(function (f, i) {
        tone({ type: 'triangle', freq: f, dur: 0.35, gain: 0.09, delay: i * 0.08 });
      });
    },

    /* победа */
    win() {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone({ type: 'triangle', freq: f, dur: 0.6, gain: 0.11, delay: i * 0.12 });
      });
    },

    /* поражение: всё валится вниз */
    lose() {
      tone({ type: 'sawtooth', freq: 220, slide: 55, dur: 1.1, gain: 0.18 });
      noise({ freq: 400, slide: 60, dur: 1.0, gain: 0.12 });
    },

    /* нажатие кнопки */
    ui() {
      tone({ type: 'square', freq: 1200, dur: 0.025, gain: 0.04 });
    },

    /* не хватает денег */
    deny() {
      tone({ type: 'square', freq: 200, slide: 140, dur: 0.12, gain: 0.09 });
    }
  };


  /* ---------- проигрывание ---------- */

  function play(name) {
    if (!ctx || !LEVELS[level]) return;

    const recipe = RECIPES[name];
    if (!recipe) return;

    /* не чаще, чем положено этому виду */
    const gap = COOLDOWN[name];
    if (gap) {
      const now = ctx.currentTime;
      if (lastPlayed[name] && now - lastPlayed[name] < gap) return;
      lastPlayed[name] = now;
    }

    recipe();
  }


  /* ---------- громкость ---------- */

  function cycle() {
    level = (level + 1) % LEVELS.length;
    if (master) master.gain.value = LEVELS[level];
    try { localStorage.setItem(KEY, String(level)); } catch (e) {}
    return LABELS[level];
  }

  function label() { return LABELS[level]; }


  return {
    init: init,
    wake: wake,
    play: play,
    cycle: cycle,
    label: label
  };

})();
