(() => {
  "use strict";

  // ───────── helpers ─────────
  const $ = (sel, el = document) => el.querySelector(sel);
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const GREEK = /[Ͱ-Ͽἀ-῿]/;
  const CYR = /[Ѐ-ӿ]/;
  const isGreek = (t) => typeof t === "string" && GREEK.test(t) && !CYR.test(t) && !t.includes("___");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ───────── storage ─────────
  const STORE_KEY = "irina-greek-v1";
  const store = (() => {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { /* private mode */ }
    s = s || {};
    s.done = s.done || {};        // {"1": [true, false, false]}
    s.pos = s.pos || {};          // {"1": {block: 1, task: 3}}
    s.settings = Object.assign({ sfx: true, timer: true, kb: true }, s.settings || {});
    return s;
  })();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
  }
  const blockDone = (day, b) => !!(store.done[day] && store.done[day][b]);
  const dayDone = (d) => d.blocks.every((_, i) => blockDone(d.id, i));

  // ───────── audio ─────────
  // Должна совпадать с audioKey() в scripts/make_audio.mjs
  function audioKey(text) {
    const s = text.normalize("NFC").trim();
    let x = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      x ^= s.charCodeAt(i);
      x = Math.imul(x, 0x01000193) >>> 0;
    }
    return x.toString(16).padStart(8, "0");
  }
  const player = new Audio();
  player.preload = "auto";
  let lastSpoken = "";
  function tts(text, slow) {
    try {
      if (!("speechSynthesis" in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "el-GR";
      u.rate = slow ? 0.6 : 0.85;
      const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.toLowerCase().startsWith("el"));
      if (v) u.voice = v;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  }
  function play(text, slow = false) {
    if (!isGreek(text)) return Promise.resolve();
    text = text.trim();
    lastSpoken = text;
    player.pause();
    player.src = `audio/${audioKey(text)}.m4a`;
    player.playbackRate = slow ? 0.7 : 1;
    try { player.preservesPitch = true; } catch (e) { /* old Safari */ }
    return new Promise((resolve) => {
      const done = () => { player.onended = player.onerror = null; resolve(); };
      player.onended = done;
      player.onerror = () => { tts(text, slow); setTimeout(done, 1200); };
      player.play().catch(() => done());
    });
  }
  function speakBtns(text, opts = {}) {
    if (!isGreek(text)) return null;
    return h("span", { class: "speak" + (opts.big ? " big" : "") },
      h("button", { class: "icon-btn", title: "Послушать", "aria-label": "Послушать", onclick: (e) => { e.stopPropagation(); play(text); } }, "🔊"),
      h("button", { class: "icon-btn", title: "Медленно", "aria-label": "Медленно", onclick: (e) => { e.stopPropagation(); play(text, true); } }, "🐢"));
  }

  // короткие звуки «верно / мимо»
  let actx = null;
  function sfx(kind) {
    if (!store.settings.sfx) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const notes = kind === "ok" ? [660, 880] : kind === "win" ? [523, 659, 784, 1047] : [220];
      notes.forEach((f, i) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = kind === "bad" ? "triangle" : "sine";
        o.frequency.value = f;
        const t = actx.currentTime + i * 0.11;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        o.connect(g).connect(actx.destination);
        o.start(t); o.stop(t + 0.3);
      });
    } catch (e) { /* ignore */ }
  }

  // ───────── images ─────────
  // где на фото лица — чтобы кадрирование их не обрезало
  const FOCUS = {
    "irina-flowers": "45% 22%", "irina-timur": "50% 45%", "irina-vlad": "50% 52%", "rodnik-35": "50% 30%",
    "antonina": "50% 35%", "larisa": "50% 25%", "lena-irina": "50% 50%", "katya-sasha": "50% 35%",
    "masha-armenia": "50% 70%", "masha-jump": "40% 50%", "bella": "50% 55%", "chaika": "50% 35%", "kuzya": "50% 40%",
  };
  function pic(img, cls = "pic") {
    if (!img) return null;
    if (img.startsWith("@")) {
      const name = img.slice(1);
      const el = h("img", { class: cls + " photo", src: `photos/${name}.jpg`, alt: "", loading: "lazy", style: `object-position:${FOCUS[name] || "50% 30%"}` });
      el.onerror = () => el.replaceWith(h("div", { class: cls + " emoji" }, "🐾"));
      return el;
    }
    return h("div", { class: cls + " emoji" }, img);
  }

  // ───────── answer checking ─────────
  const stripAcc = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC");
  const clean = (s) => s.toLowerCase().normalize("NFC")
    .replace(/[.,!?;:«»"'·…—–\-()]/g, " ").replace(/ς/g, "σ").replace(/\s+/g, " ").trim();
  function lev(a, b) {
    const m = a.length, n = b.length;
    const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function compare(input, target) {
    const a = clean(input), b = clean(target);
    if (!a) return "empty";
    if (a === b) return "exact";
    if (stripAcc(a) === stripAcc(b)) return "accent";
    if (b.length >= 5 && lev(stripAcc(a), stripAcc(b)) <= 1) return "typo";
    return "wrong";
  }

  // ───────── greek on-screen keyboard ─────────
  const ACC = { "α": "ά", "ε": "έ", "η": "ή", "ι": "ί", "ο": "ό", "υ": "ύ", "ω": "ώ", "Α": "Ά", "Ε": "Έ", "Η": "Ή", "Ι": "Ί", "Ο": "Ό", "Υ": "Ύ", "Ω": "Ώ" };
  const isTouch = matchMedia("(pointer: coarse)").matches;
  function insertAt(input, text) {
    const s = input.selectionStart ?? input.value.length, e = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, s) + text + input.value.slice(e);
    const p = s + text.length;
    try { input.setSelectionRange(p, p); } catch (er) { /* ignore */ }
    input.dispatchEvent(new Event("input"));
  }
  function keyboard(input) {
    const rows = ["ς ε ρ τ υ θ ι ο π", "α σ δ φ γ η ξ κ λ", "ζ χ ψ ω β ν μ"];
    const kb = h("div", { class: "kb" });
    const press = (k) => {
      if (k === "⌫") {
        const s = input.selectionStart ?? input.value.length, e = input.selectionEnd ?? s;
        if (s !== e) insertAt(input, "");
        else if (s > 0) {
          input.value = input.value.slice(0, s - 1) + input.value.slice(s);
          try { input.setSelectionRange(s - 1, s - 1); } catch (er) { /* ignore */ }
          input.dispatchEvent(new Event("input"));
        }
      } else if (k === "´") {
        const s = input.selectionStart ?? input.value.length;
        const prev = input.value[s - 1];
        if (prev && ACC[prev]) {
          input.value = input.value.slice(0, s - 1) + ACC[prev] + input.value.slice(s);
          try { input.setSelectionRange(s, s); } catch (er) { /* ignore */ }
          input.dispatchEvent(new Event("input"));
        }
      } else insertAt(input, k === "␣" ? " " : k);
      if (!isTouch) input.focus();
    };
    rows.forEach((r) => kb.append(h("div", { class: "kb-row" },
      r.split(" ").map((k) => h("button", { class: "key", type: "button", onclick: () => press(k) }, k)))));
    kb.append(h("div", { class: "kb-row" },
      h("button", { class: "key wide", type: "button", title: "Ударение: нажми после гласной", onclick: () => press("´") }, "´ ударение"),
      h("button", { class: "key space", type: "button", onclick: () => press("␣") }, "пробел"),
      h("button", { class: "key wide", type: "button", onclick: () => press("⌫") }, "⌫")));
    return kb;
  }
  function textField(multi = false) {
    const input = h(multi ? "textarea" : "input", {
      class: "answer-input", autocapitalize: "off", autocomplete: "off", autocorrect: "off", spellcheck: "false",
      lang: "el", rows: multi ? 4 : null, placeholder: "Пиши здесь по-гречески…",
    });
    const wrap = h("div", { class: "field" }, input);
    const kb = keyboard(input);
    const toggle = h("button", { class: "link-btn", type: "button" });
    const apply = () => {
      kb.hidden = !store.settings.kb;
      toggle.textContent = store.settings.kb ? "Скрыть греческие буквы" : "⌨️ Показать греческие буквы";
      // на телефоне прячем системную клавиатуру, когда открыта своя
      if (isTouch) input.inputMode = store.settings.kb ? "none" : "text";
    };
    toggle.onclick = () => { store.settings.kb = !store.settings.kb; save(); apply(); };
    apply();
    wrap.append(kb, toggle);
    return { wrap, input };
  }

  // ───────── session / flow ─────────
  const app = $("#app");
  let S = null; // текущая сессия блока

  function startBlock(dayId, blockIdx, taskIdx = 0) {
    const day = LESSONS.find((d) => d.id === dayId);
    const block = day.blocks[blockIdx];
    S = { day, blockIdx, block, queue: block.tasks.slice(), i: Math.min(taskIdx, block.tasks.length - 1), retried: new Set(), good: 0, total: 0 };
    store.pos[dayId] = { block: blockIdx, task: S.i };
    save();
    renderTask();
  }

  function renderTask() {
    window.scrollTo(0, 0);
    const t = S.queue[S.i];
    const pct = Math.round((S.i / S.queue.length) * 100);
    const stage = h("main", { class: "stage" });
    const footer = h("footer", { class: "footer" });
    const top = h("header", { class: "topbar" },
      h("button", { class: "icon-btn", "aria-label": "Домой", title: "Домой", onclick: goHome }, "✕"),
      h("div", { class: "progress" }, h("div", { class: "bar", style: `width:${pct}%` })),
      h("span", { class: "counter" }, `${S.i + 1}/${S.queue.length}`));
    const meta = h("div", { class: "meta" }, `День ${S.day.id} · Блок ${S.blockIdx + 1} из ${S.day.blocks.length} · ${S.block.title}`);
    app.replaceChildren(h("div", { class: "screen" }, top, meta, stage, footer));

    let answered = false;
    const api = {
      stage, footer,
      // показать кнопку «Дальше» без оценки
      ready(label = "Дальше") {
        footer.replaceChildren(h("button", { class: "btn primary", onclick: next }, label));
      },
      // ok: true / false / null (без оценки)
      finish({ ok = null, title, gr, ru, msg } = {}) {
        if (answered) return;
        answered = true;
        if (ok === true) { S.good++; S.total++; sfx("ok"); }
        if (ok === false) {
          S.total++; sfx("bad");
          if (!S.retried.has(t) && t.type !== "quiz") { S.retried.add(t); S.queue.push(t); }
        }
        const cls = ok === true ? "good" : ok === false ? "bad" : "neutral";
        const head = title || (ok === true ? pick(PRAISE) : ok === false ? "Не страшно! Правильно так:" : "Готово!");
        footer.replaceChildren(h("div", { class: "feedback " + cls },
          h("div", { class: "fb-title" }, head),
          gr ? h("div", { class: "fb-gr" }, gr, " ", speakBtns(gr)) : null,
          ru ? h("div", { class: "fb-ru" }, ru) : null,
          msg ? h("div", { class: "fb-msg" }, msg) : null,
          ok === false ? h("div", { class: "fb-msg small" }, "Это задание вернётся в конце блока.") : null,
          h("button", { class: "btn primary", onclick: next }, "Дальше")));
        if (gr) play(gr);
        footer.scrollIntoView({ behavior: "smooth", block: "end" });
      },
    };
    footer.append(h("button", { class: "btn ghost", onclick: next }, "Пропустить"));
    (R[t.type] || R.unknown)(t, api);
  }

  const PRAISE = ["Μπράβο! 🎉", "Σωστά! ✨", "Τέλεια! 🌟", "Πολύ καλά! 👏", "Υπέροχα! 💫"];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  function next() {
    player.pause();
    S.i++;
    if (S.i < S.queue.length) {
      store.pos[S.day.id] = { block: S.blockIdx, task: Math.min(S.i, S.block.tasks.length - 1) };
      save();
      renderTask();
    } else blockComplete();
  }

  function blockComplete() {
    const id = S.day.id;
    store.done[id] = store.done[id] || [];
    store.done[id][S.blockIdx] = true;
    const nextIdx = S.day.blocks.findIndex((_, i) => !blockDone(id, i));
    store.pos[id] = { block: nextIdx < 0 ? 0 : nextIdx, task: 0 };
    save();
    if (nextIdx < 0) return dayComplete();
    sfx("ok");
    const nb = S.day.blocks[nextIdx];
    app.replaceChildren(h("div", { class: "screen center" },
      h("div", { class: "big-emoji pop" }, "⭐"),
      h("h1", {}, `Блок ${S.blockIdx + 1} готов!`),
      S.total ? h("p", { class: "lead" }, `Верных ответов: ${S.good} из ${S.total}`) : null,
      h("p", {}, "Можно отдохнуть или сразу продолжить. Прогресс сохранён."),
      h("div", { class: "stack" },
        h("button", { class: "btn primary", onclick: () => startBlock(id, nextIdx) }, `Дальше: ${nb.title} →`),
        h("button", { class: "btn ghost", onclick: goHome }, "На сегодня хватит 🌿"))));
  }

  function dayComplete() {
    sfx("win");
    const d = S.day;
    const nd = LESSONS.find((x) => x.id === d.id + 1);
    app.replaceChildren(h("div", { class: "screen center" },
      h("div", { class: "dancer" }, pic("@chaika", "dance-pic")),
      h("h1", {}, `День ${d.id} пройден! 🎉`),
      h("p", { class: "lead gr" }, "Μπράβο, Ιρίνα!", " ", speakBtns("Μπράβο, Ιρίνα!")),
      h("p", {}, "Чайка танцует в твою честь."),
      nd ? h("p", { class: "muted" }, `Завтра: ${nd.ru} · ${nd.gr}`) : h("p", { class: "lead" }, "Это была вся неделя. Ты огромная молодец! 💙"),
      h("button", { class: "btn primary", onclick: goHome }, "На главную")));
    confetti();
    play("Μπράβο, Ιρίνα!");
  }

  // ───────── renderers ─────────
  const R = {};

  R.unknown = (t, api) => { api.stage.append(h("p", {}, "?")); api.ready(); };

  R.card = (t, api) => {
    api.stage.append(h("div", { class: "card word-card" },
      pic(t.img, "pic hero"),
      h("div", { class: "gr big" }, t.gr),
      speakBtns(t.gr, { big: true }),
      h("div", { class: "ru" }, t.ru),
      t.extra ? h("div", { class: "extra" }, t.extra) : null));
    api.ready();
    play(t.gr);
  };

  R.note = (t, api) => {
    api.stage.append(h("div", { class: "card note" },
      h("div", { class: "note-title" }, "💡 ", t.title),
      h("div", { class: "note-body", html: t.html })));
    api.ready("Понятно →");
  };

  R.listen = (t, api) => {
    api.stage.append(h("p", { class: "task-title" }, t.ru || "Послушай и выбери"));
    api.stage.append(h("div", { class: "center" },
      h("button", { class: "play-big", onclick: () => play(t.say) }, "🔊"),
      h("button", { class: "link-btn", onclick: () => play(t.say, true) }, "🐢 медленно")));
    const right = t.opts[0];
    const grid = h("div", { class: "tiles" });
    shuffle(t.opts).forEach((o) => {
      const b = h("button", { class: "tile", onclick: () => {
        if (b.disabled) return;
        grid.querySelectorAll("button").forEach((x) => (x.disabled = true));
        const ok = o === right;
        b.classList.add(ok ? "right" : "wrong");
        if (!ok) [...grid.children].find((x) => x.dataset.right)?.classList.add("right");
        api.finish({ ok, gr: t.say, ru: right.label });
      } }, pic(o.img, "pic tile-pic"), h("span", {}, o.label));
      if (o === right) b.dataset.right = "1";
      grid.append(b);
    });
    api.stage.append(grid);
    setTimeout(() => play(t.say), 300);
  };

  function choiceList(opts, onPick) {
    const right = opts[0];
    const list = h("div", { class: "choices" });
    shuffle(opts).forEach((o) => {
      const b = h("button", { class: "choice" + (isGreek(o) ? " gr" : ""), onclick: () => {
        list.querySelectorAll("button").forEach((x) => (x.disabled = true));
        const ok = o === right;
        b.classList.add(ok ? "right" : "wrong");
        if (!ok) [...list.children].find((x) => x.textContent === right)?.classList.add("right");
        onPick(ok, right);
      } }, o);
      list.append(b);
    });
    return list;
  }

  R.pick = (t, api) => {
    api.stage.append(pic(t.img, "pic mid"));
    api.stage.append(h("p", { class: "task-title" }, t.ru, " ", t.say ? speakBtns(t.say) : null));
    api.stage.append(choiceList(t.opts, (ok, right) =>
      api.finish({ ok, gr: isGreek(right) ? right : t.say, ru: isGreek(right) ? null : right })));
    if (t.say) play(t.say);
  };

  R.tf = (t, api) => {
    const ru = h("div", { class: "ru hidden-ru" }, t.ru);
    api.stage.append(h("p", { class: "task-title" }, "Правда или нет?"));
    api.stage.append(h("div", { class: "card" },
      pic(t.img, "pic mid"),
      h("div", { class: "gr big" }, t.gr), speakBtns(t.gr),
      t.ru ? h("button", { class: "link-btn", onclick: (e) => { ru.classList.remove("hidden-ru"); e.target.remove(); } }, "👁 перевод") : null,
      ru));
    const row = h("div", { class: "tf-row" });
    const answer = (val, btn) => {
      row.querySelectorAll("button").forEach((x) => (x.disabled = true));
      const ok = val === t.ok;
      btn.classList.add(ok ? "right" : "wrong");
      api.finish({ ok, title: ok ? pick(PRAISE) : "Не совсем!", msg: t.why });
      if (isGreek(t.why)) play(t.why);
    };
    const yes = h("button", { class: "choice tf", onclick: () => answer(true, yes) }, "✓ Ναι — правда");
    const no = h("button", { class: "choice tf", onclick: () => answer(false, no) }, "✗ Όχι — неправда");
    row.append(yes, no);
    api.stage.append(row);
    play(t.gr);
  };

  R.gap = (t, api) => {
    const [before, after] = t.text.split("___");
    const slot = h("span", { class: "slot" }, "    ");
    api.stage.append(h("p", { class: "task-title" }, "Вставь слово"));
    api.stage.append(h("div", { class: "card" },
      pic(t.img, "pic mid"),
      h("div", { class: "gr big sentence" }, before, slot, after),
      h("div", { class: "ru" }, t.ru)));
    const right = t.opts[0];
    const chips = h("div", { class: "chips" });
    shuffle(t.opts).forEach((o) => {
      const c = h("button", { class: "chip gr", onclick: () => {
        chips.querySelectorAll("button").forEach((x) => (x.disabled = true));
        const ok = o === right;
        slot.textContent = right;
        slot.classList.add(ok ? "right" : "fixed");
        c.classList.add(ok ? "right" : "wrong");
        api.finish({ ok, gr: t.gr, ru: t.ru });
      } }, o);
      chips.append(c);
    });
    api.stage.append(chips);
  };

  R.build = (t, api) => {
    const target = t.gr.split(" ");
    const words = shuffle([...target, ...(t.extra || [])]);
    const line = h("div", { class: "build-line" });
    const bank = h("div", { class: "chips bank" });
    const check = h("button", { class: "btn primary", disabled: true }, "Проверить");
    const sync = () => { check.disabled = line.children.length === 0; };
    words.forEach((w) => {
      const chip = h("button", { class: "chip gr" }, w);
      chip.onclick = () => {
        if (chip.disabled) return;
        (chip.parentNode === bank ? line : bank).append(chip);
        sync();
      };
      bank.append(chip);
    });
    api.stage.append(h("p", { class: "task-title" }, "Собери предложение"));
    api.stage.append(h("div", { class: "ru prompt" }, t.ru));
    api.stage.append(line, bank);
    check.onclick = () => {
      const got = [...line.children].map((c) => c.textContent);
      const ok = got.join(" ") === target.join(" ");
      [...line.children, ...bank.children].forEach((c) => (c.disabled = true));
      line.classList.add(ok ? "right" : "wrong");
      api.finish({ ok, gr: t.gr, ru: t.ru });
    };
    api.footer.prepend(check);
  };

  R.type = (t, api) => {
    api.stage.append(h("p", { class: "task-title" }, t.ru));
    if (t.listen) {
      api.stage.append(h("div", { class: "center" },
        h("button", { class: "play-big", onclick: () => play(t.gr) }, "🔊"),
        h("button", { class: "link-btn", onclick: () => play(t.gr, true) }, "🐢 медленно")));
      setTimeout(() => play(t.gr), 300);
    } else api.stage.append(pic(t.img, "pic mid"));
    const { wrap, input } = textField(false);
    const hint = h("div", { class: "hint" });
    let hints = 0;
    const hintBtn = h("button", { class: "link-btn", onclick: () => {
      hints = Math.min(hints + 1, t.gr.length);
      hint.textContent = "Подсказка: " + t.gr.slice(0, hints) + "…";
    } }, "💡 подсказка");
    api.stage.append(wrap, h("div", { class: "row" }, hintBtn), hint);
    const check = h("button", { class: "btn primary" }, "Проверить");
    const doCheck = () => {
      const res = compare(input.value, t.gr);
      if (res === "empty") { input.focus(); return; }
      input.disabled = true;
      if (res === "exact") api.finish({ ok: true, gr: t.gr });
      else if (res === "accent") api.finish({ ok: true, title: "Почти идеально! 👍", gr: t.gr, msg: "Проверь ударение (τόνος): оно стоит вот так." });
      else if (res === "typo") api.finish({ ok: true, title: "Засчитано! Одна буква мимо 😉", gr: t.gr, msg: "Сравни со своим вариантом: " + input.value });
      else api.finish({ ok: false, gr: t.gr, msg: "Твой вариант: " + input.value });
    };
    check.onclick = doCheck;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doCheck(); } });
    api.footer.prepend(check);
    if (!isTouch) setTimeout(() => input.focus(), 50);
  };

  R.write = (t, api) => {
    api.stage.append(h("p", { class: "task-title" }, "✍️ ", t.ru));
    const { wrap, input } = textField(true);
    const sample = h("div", { class: "card sample", hidden: true },
      h("div", { class: "muted small" }, "Например:"),
      t.sample.split("\n").map((l) => h("div", { class: "gr" }, l, " ", speakBtns(l))),
      h("div", { class: "ru" }, t.sampleRu));
    const show = h("button", { class: "link-btn", onclick: () => { sample.hidden = false; show.remove(); } }, "👀 показать пример");
    api.stage.append(wrap, show, sample);
    const done = h("button", { class: "btn primary" }, "Готово ✓");
    done.onclick = () => {
      sample.hidden = false; show.remove();
      const typed = input.value.trim();
      api.finish({ ok: null, title: typed ? "Μπράβο! Писать — самое трудное ✍️" : "Хорошо! Прочитай пример вслух 🗣️",
        msg: typed ? "Сравни свой текст с примером. Отличия — это нормально: вариантов много." : null });
    };
    api.footer.prepend(done);
  };

  R.repeat = (t, api) => {
    api.stage.append(h("p", { class: "task-title" }, "🎧 Послушай и повтори вслух"));
    api.stage.append(h("div", { class: "card word-card" },
      pic(t.img, "pic mid"),
      h("div", { class: "gr big" }, t.gr), speakBtns(t.gr, { big: true }),
      h("div", { class: "ru" }, t.ru)));
    const area = h("div", { class: "rec-area" });
    api.stage.append(area);
    const canRec = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (canRec) {
      let rec = null, chunks = [], url = null;
      const recBtn = h("button", { class: "btn rec" }, "🎙️ Записать себя");
      const mine = h("div", { class: "row" });
      recBtn.onclick = async () => {
        if (rec && rec.state === "recording") { rec.stop(); return; }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          chunks = [];
          rec = new MediaRecorder(stream);
          rec.ondataavailable = (e) => chunks.push(e.data);
          rec.onstop = () => {
            stream.getTracks().forEach((x) => x.stop());
            if (url) URL.revokeObjectURL(url);
            url = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || "audio/mp4" }));
            recBtn.textContent = "🎙️ Записать ещё раз";
            recBtn.classList.remove("on");
            const me = new Audio(url);
            mine.replaceChildren(
              h("button", { class: "btn small", onclick: () => me.play() }, "▶️ Я"),
              h("button", { class: "btn small", onclick: () => play(t.gr) }, "🔊 Мелина"));
            me.play();
          };
          rec.start();
          recBtn.textContent = "⏹ Стоп";
          recBtn.classList.add("on");
          setTimeout(() => rec && rec.state === "recording" && rec.stop(), 8000);
        } catch (e) {
          area.replaceChildren(h("p", { class: "muted" }, "Микрофон недоступен — просто скажи фразу вслух 2–3 раза."));
        }
      };
      area.append(recBtn, mine, h("p", { class: "muted small" }, "Запиши себя и сравни с Мелиной."));
    } else {
      area.append(h("p", { class: "muted" }, "Скажи фразу вслух 2–3 раза, глядя на текст."));
    }

    if (SR) {
      const out = h("div", { class: "sr-out" });
      const srBtn = h("button", { class: "link-btn" }, "🗣️ Проверить, как тебя понял телефон");
      srBtn.onclick = () => {
        try {
          const r = new SR();
          r.lang = "el-GR"; r.interimResults = false; r.maxAlternatives = 3;
          out.textContent = "Слушаю… говори!";
          r.onresult = (e) => {
            const alts = [...e.results[0]].map((x) => x.transcript);
            const best = alts.find((a) => compare(a, t.gr) !== "wrong");
            out.replaceChildren(h("span", {}, "Услышано: "), h("b", { class: "gr" }, alts[0] || "—"),
              h("div", { class: best ? "good-text" : "muted" }, best ? "Отлично, тебя поняли! 🎉" : "Похоже, но попробуй ещё раз — медленнее."));
            if (best) sfx("ok");
          };
          r.onerror = () => { out.textContent = "Не получилось распознать. Ничего страшного!"; };
          r.start();
        } catch (e) { out.textContent = "Распознавание недоступно в этом браузере."; }
      };
      area.append(srBtn, out);
    }

    api.footer.replaceChildren(
      h("button", { class: "btn ghost", onclick: () => play(t.gr) }, "🔁 Ещё раз"),
      h("button", { class: "btn primary", onclick: () => api.finish({ ok: true, title: "Μπράβο! 🗣️", msg: "Говорить вслух — лучший способ запомнить." }) }, "✅ Получилось"));
    play(t.gr);
  };

  R.pairs = (t, api) => {
    api.stage.append(h("p", { class: "task-title" }, t.ru || "Соедини пары"));
    const left = h("div", { class: "col" }), right = h("div", { class: "col" });
    let selL = null, selR = null, left_n = t.pairs.length, mistakes = 0;
    const tryMatch = () => {
      if (!selL || !selR) return;
      const a = selL, b = selR;
      selL = selR = null;
      if (a.dataset.k === b.dataset.k) {
        [a, b].forEach((x) => { x.classList.remove("sel"); x.classList.add("matched"); x.disabled = true; });
        sfx("ok");
        if (--left_n === 0) api.finish({ ok: true, title: mistakes ? "Все пары найдены! 🎉" : "Без единой ошибки! 🎉" });
      } else {
        mistakes++;
        sfx("bad");
        [a, b].forEach((x) => { x.classList.add("shake"); setTimeout(() => x.classList.remove("shake", "sel"), 450); });
      }
    };
    shuffle(t.pairs.map((p, i) => [p[0], i])).forEach(([w, i]) => {
      const b = h("button", { class: "pair gr", "data-k": i }, w);
      b.onclick = () => { left.querySelectorAll(".sel").forEach((x) => x.classList.remove("sel")); b.classList.add("sel"); selL = b; play(w); tryMatch(); };
      left.append(b);
    });
    shuffle(t.pairs.map((p, i) => [p[1], i])).forEach(([w, i]) => {
      const b = h("button", { class: "pair", "data-k": i }, w);
      b.onclick = () => { right.querySelectorAll(".sel").forEach((x) => x.classList.remove("sel")); b.classList.add("sel"); selR = b; tryMatch(); };
      right.append(b);
    });
    api.stage.append(h("div", { class: "pairs" }, left, right));
  };

  R.mood = (t, api) => {
    api.stage.append(h("p", { class: "task-title" }, t.ru));
    const grid = h("div", { class: "tiles" });
    t.opts.forEach((o) => grid.append(h("button", { class: "tile", onclick: () => {
      grid.querySelectorAll("button").forEach((x) => (x.disabled = true));
      api.finish({ ok: null, title: o.img + " " + o.gr, gr: o.gr, msg: o.reply });
    } }, pic(o.img, "pic tile-pic"), h("span", { class: "gr" }, o.gr), h("span", { class: "muted small" }, o.ru))));
    api.stage.append(grid);
  };

  R.dialog = (t, api) => {
    api.stage.append(h("p", { class: "task-title" }, "💬 ", t.title));
    const chat = h("div", { class: "chat" });
    const opts = h("div", { class: "choices" });
    api.stage.append(chat, opts);
    let i = 0, errors = 0;
    const bubble = (who, gr, ru) => {
      const b = h("div", { class: "bubble " + who },
        h("div", { class: "gr" }, gr, " ", speakBtns(gr)),
        h("div", { class: "ru small" }, ru));
      chat.append(b);
      b.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };
    const step = async () => {
      if (i >= t.lines.length) {
        opts.replaceChildren();
        api.finish({ ok: errors === 0 ? true : null, title: errors === 0 ? "Диалог без ошибок! 🎉" : "Диалог пройден! 👏" });
        return;
      }
      const line = t.lines[i];
      if (line.them) {
        bubble("them", line.them, line.ru);
        await play(line.them);
        await wait(250);
        i++; step();
      } else {
        const right = line.me[0];
        opts.replaceChildren(h("div", { class: "muted small" }, "Что ты ответишь?"));
        shuffle(line.me).forEach((o) => {
          const b = h("button", { class: "choice gr", onclick: () => {
            if (o === right) {
              sfx("ok");
              opts.replaceChildren();
              bubble("me", right, line.ru);
              play(right).then(() => { i++; step(); });
            } else {
              errors++;
              sfx("bad");
              b.classList.add("wrong", "shake");
              b.disabled = true;
            }
          } }, o);
          opts.append(b);
        });
      }
    };
    api.footer.replaceChildren(h("button", { class: "btn ghost", onclick: next }, "Пропустить"));
    step();
  };

  R.story = (t, api) => {
    api.stage.append(h("p", { class: "task-title" }, "📖 ", t.title));
    api.stage.append(h("p", { class: "muted small" }, "Слушай по одной фразе. Нажми на фразу, чтобы увидеть перевод."));
    const list = h("div", { class: "story" });
    api.stage.append(list);
    let i = 0;
    const more = h("button", { class: "btn primary" }, "Следующая фраза ▸");
    const show = () => {
      const [gr, ru] = t.lines[i];
      const ruEl = h("div", { class: "ru small hidden-ru" }, ru);
      const line = h("div", { class: "story-line", onclick: () => ruEl.classList.toggle("hidden-ru") },
        h("div", { class: "gr" }, gr, " ", speakBtns(gr)), ruEl);
      list.append(line);
      line.scrollIntoView({ behavior: "smooth", block: "nearest" });
      play(gr);
      i++;
      if (i >= t.lines.length) api.ready("Дальше →");
    };
    more.onclick = show;
    api.footer.replaceChildren(more);
    show();
  };

  R.quiz = (t, api) => {
    let qi = 0, score = 0, timer = null;
    const qs = t.qs;
    const box = h("div", { class: "quiz" });
    const timerToggle = h("label", { class: "toggle small" },
      h("input", { type: "checkbox", ...(store.settings.timer ? { checked: true } : {}), onchange: (e) => { store.settings.timer = e.target.checked; save(); } }),
      " таймер");
    api.stage.append(h("div", { class: "row between" }, h("p", { class: "task-title" }, "🏆 ", t.title), timerToggle), box);
    api.footer.replaceChildren(h("button", { class: "btn ghost", onclick: next }, "Пропустить квиз"));
    const showQ = () => {
      clearInterval(timer);
      if (qi >= qs.length) return end();
      const q = qs[qi];
      const bar = h("div", { class: "tbar" });
      box.replaceChildren(
        h("div", { class: "muted small" }, `Вопрос ${qi + 1} из ${qs.length} · очков: ${score}`),
        store.settings.timer ? h("div", { class: "timer" }, bar) : null,
        pic(q.img, "pic mid"),
        h("div", { class: "q gr-mixed" }, q.q, " ", q.say ? speakBtns(q.say) : null),
        choiceList(q.opts, (ok, right) => {
          clearInterval(timer);
          if (ok) { score++; sfx("ok"); } else sfx("bad");
          if (isGreek(right)) play(right);
          setTimeout(() => { qi++; showQ(); }, ok ? 900 : 1700);
        }));
      if (q.say) play(q.say);
      if (store.settings.timer) {
        const T = 15000, t0 = Date.now();
        timer = setInterval(() => {
          const left = 1 - (Date.now() - t0) / T;
          bar.style.width = Math.max(0, left * 100) + "%";
          if (left <= 0) {
            clearInterval(timer);
            const list = box.querySelector(".choices");
            list.querySelectorAll("button").forEach((x) => (x.disabled = true));
            [...list.children].find((x) => x.textContent === q.opts[0])?.classList.add("right");
            setTimeout(() => { qi++; showQ(); }, 1500);
          }
        }, 100);
      }
    };
    const end = () => {
      const stars = score === qs.length ? "🌟🌟🌟" : score >= qs.length * 0.6 ? "🌟🌟" : "🌟";
      box.replaceChildren(h("div", { class: "center" },
        h("div", { class: "big-emoji pop" }, stars),
        h("h2", {}, `${score} из ${qs.length}`)));
      if (score === qs.length) confetti();
      api.finish({ ok: null, title: score === qs.length ? "Идеально! Ты чемпион квизов 🏆" : "Квиз пройден! 👏",
        msg: score === qs.length ? null : "Ошибки — это просто слова, которые скоро запомнятся." });
    };
    showQ();
  };

  // ───────── home ─────────
  function nextTarget() {
    for (const d of LESSONS) {
      const b = d.blocks.findIndex((_, i) => !blockDone(d.id, i));
      if (b >= 0) {
        const p = store.pos[d.id];
        const task = p && p.block === b ? p.task : 0;
        return { day: d, block: b, task };
      }
    }
    return null;
  }

  function goHome() {
    player.pause();
    S = null;
    const doneDays = LESSONS.filter(dayDone).length;
    const tgt = nextTarget();
    const cont = tgt
      ? h("button", { class: "btn primary big-btn", onclick: () => startBlock(tgt.day.id, tgt.block, tgt.task) },
          tgt.task > 0 ? "▶ Продолжить" : "▶ Начать", h("span", { class: "btn-sub" }, `День ${tgt.day.id} · ${tgt.day.blocks[tgt.block].title}`))
      : h("div", { class: "card center" }, h("div", { class: "big-emoji" }, "🏆"), h("p", {}, "Неделя пройдена! Можно повторять любой день."));

    const days = h("div", { class: "days" });
    LESSONS.forEach((d) => {
      const done = dayDone(d);
      const started = d.blocks.some((_, i) => blockDone(d.id, i));
      const card = h("div", { class: "day-card" + (done ? " done" : "") },
        pic(d.img, "day-pic"),
        h("div", { class: "day-info" },
          h("div", { class: "day-num" }, `День ${d.id}`, done ? " ✓" : started ? " · в процессе" : ""),
          h("div", { class: "gr day-gr" }, d.gr),
          h("div", { class: "muted small" }, d.ru),
          h("div", { class: "block-pills" }, d.blocks.map((b, i) =>
            h("button", { class: "pill" + (blockDone(d.id, i) ? " on" : ""), title: b.title, onclick: () => startBlock(d.id, i) },
              blockDone(d.id, i) ? "✓ " : "", `${i + 1}. ${b.title}`)))));
      days.append(card);
    });

    const settings = h("details", { class: "card settings" },
      h("summary", {}, "⚙️ Настройки и помощь"),
      h("div", { class: "help" },
        h("p", {}, "Каждый день — 3 блока по 5 минут. Можно сделать один блок и вернуться позже: место сохранится."),
        h("p", {}, "🔊 — послушать, 🐢 — медленно. Любое задание можно пропустить. Ошибки не наказываются: задание просто вернётся в конце блока."),
        h("p", {}, "Прогресс хранится в этом браузере на этом устройстве.")),
      h("label", { class: "toggle" }, h("input", { type: "checkbox", ...(store.settings.sfx ? { checked: true } : {}), onchange: (e) => { store.settings.sfx = e.target.checked; save(); } }), " Звуки «верно/неверно»"),
      h("label", { class: "toggle" }, h("input", { type: "checkbox", ...(store.settings.timer ? { checked: true } : {}), onchange: (e) => { store.settings.timer = e.target.checked; save(); } }), " Таймер в квизах"),
      h("button", { class: "link-btn danger", onclick: () => {
        if (confirm("Сбросить весь прогресс?")) { store.done = {}; store.pos = {}; save(); goHome(); }
      } }, "Сбросить прогресс"));

    app.replaceChildren(h("div", { class: "screen home" },
      h("div", { class: "hello" },
        h("img", { class: "avatar", src: "photos/irina-flowers.jpg", alt: "" }),
        h("div", {},
          h("h1", { class: "gr" }, "Γεια σου, Ιρίνα! 👋"),
          h("p", { class: "muted" }, "Греческий о твоей жизни — 15 минут в день"))),
      h("div", { class: "week" }, LESSONS.map((d) => h("span", { class: "dot" + (dayDone(d) ? " on" : ""), title: `День ${d.id}` }, dayDone(d) ? "✓" : d.id)),
        h("span", { class: "muted small" }, ` ${doneDays} из 7 дней`)),
      cont, days, settings));
  }

  // ───────── confetti ─────────
  function confetti() {
    const c = h("canvas", { class: "confetti" });
    document.body.append(c);
    const ctx = c.getContext("2d");
    const W = (c.width = innerWidth), H = (c.height = innerHeight);
    const colors = ["#2f6fdb", "#f2b134", "#e4572e", "#29a36a", "#9b5de5", "#ffffff"];
    const ps = Array.from({ length: 140 }, () => ({
      x: Math.random() * W, y: -20 - Math.random() * H * 0.5, r: 4 + Math.random() * 5,
      vx: -1.5 + Math.random() * 3, vy: 2 + Math.random() * 3, a: Math.random() * 6, c: pick(colors),
    }));
    const t0 = performance.now();
    (function frame(now) {
      ctx.clearRect(0, 0, W, H);
      ps.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.a += 0.1;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
        ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        ctx.restore();
      });
      if (now - t0 < 3500) requestAnimationFrame(frame); else c.remove();
    })(t0);
  }

  // iOS: «разблокировать» звук первым касанием
  document.addEventListener("touchstart", function unlock() {
    try { player.play().catch(() => {}); player.pause(); } catch (e) { /* ignore */ }
    document.removeEventListener("touchstart", unlock);
  }, { once: true });
  if ("speechSynthesis" in window) speechSynthesis.getVoices();

  goHome();
})();
