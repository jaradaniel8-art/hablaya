/* HablaYa · Lógica principal: pantallas, sesiones, XP, racha y progreso */
(function () {
  'use strict';

  const $app = document.getElementById('app');
  const CATS = window.HY_VOCAB.categories;
  const KEY = 'hablaya_progress_v1';

  /* ---------- Persistencia ---------- */
  function defaultStore() {
    return { xp: 0, streak: 0, lastDay: null, items: {} };
  }

  let store = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return Object.assign(defaultStore(), JSON.parse(raw));
    } catch (err) { /* almacenamiento no disponible */ }
    return defaultStore();
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (err) { /* noop */ }
  }

  function dayString(offset) {
    const d = new Date();
    d.setDate(d.getDate() + (offset || 0));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function bumpStreak() {
    const today = dayString(0);
    if (store.lastDay === today) return;
    store.streak = store.lastDay === dayString(-1) ? (store.streak || 0) + 1 : 1;
    store.lastDay = today;
  }

  function itemProgress(id) {
    if (!store.items[id]) store.items[id] = { attempts: 0, best: 0, learned: false };
    return store.items[id];
  }

  function levelInfo(xp) {
    const level = Math.floor(xp / 120) + 1;
    const into = xp % 120;
    return { level, pct: Math.round((into / 120) * 100), missing: 120 - into };
  }

  /* ---------- Utilidades ---------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- Sesión actual ---------- */
  let current = null;   // { cat, idx, results:[], xpGained }
  let listening = false;
  let stopFn = null;

  /* ---------- Estado del chat libre ---------- */
  let chatActive = false;
  let chatStop = null;
  let botSpeaking = false;
  let chatFailStreak = 0;
  let chatMicStop = null;

  function startMicMeter() {
    const bar = document.getElementById('chatMicLevel');
    if (!bar || !window.MicTest) return;
    stopMicMeter();
    bar.hidden = false;
    const fill = bar.querySelector('i');
    chatMicStop = window.MicTest.start(function (lvl) {
      if (!fill) return;
      if (lvl < 0) {
        fill.style.width = '0%';
        bar.classList.add('error');
        return;
      }
      bar.classList.remove('error');
      fill.style.width = Math.round(lvl * 100) + '%';
    });
  }

  function stopMicMeter() {
    if (chatMicStop) { try { chatMicStop(); } catch (err) { /* noop */ } }
    chatMicStop = null;
    const bar = document.getElementById('chatMicLevel');
    if (bar) bar.hidden = true;
  }

  function setChatStatus(msg) {
    const el = document.getElementById('chatStatus');
    if (el) el.textContent = msg || '';
  }

  const STT_ERROR_MSG = {
    denied: '🚫 Permiso de micrófono denegado. Permite el acceso en el candado de la barra de direcciones y pulsa 🎤.',
    network: '🌐 El reconocimiento de voz necesita conexión a internet.',
    'audio-capture': '🎧 No se detecta ningún micrófono. Conecta uno o revisa los dispositivos de Windows.',
    'service-not-allowed': '🚫 El navegador bloqueó el servicio de voz.',
    'not-allowed': '🚫 Permiso de micrófono denegado.'
  };

  function stopVoiceSession() {
    chatActive = false;
    botSpeaking = false;
    if (chatStop) { try { chatStop(); } catch (err) { /* noop */ } }
    chatStop = null;
    stopMicMeter();
    if ('speechSynthesis' in window) { try { window.speechSynthesis.cancel(); } catch (err) { /* noop */ } }
  }

  /* ================= Pantalla: Inicio ================= */
  function renderHome() {
    stopVoiceSession();
    current = null;
    window.Avatar.destroy();
    const lvl = levelInfo(store.xp);
    const totalLearned = CATS.reduce((n, c) => n + c.items.filter((it) => itemProgress(it.id).learned).length, 0);
    const totalItems = CATS.reduce((n, c) => n + c.items.length, 0);

    const cards = CATS.map((cat) => {
      const done = cat.items.filter((it) => itemProgress(it.id).learned).length;
      const pct = Math.round((done / cat.items.length) * 100);
      return `
        <button class="cat-card" data-cat="${cat.id}">
          <span class="cat-icon">${cat.icon}</span>
          <span class="cat-name">${escapeHtml(cat.name)}</span>
          <span class="cat-count">${done}/${cat.items.length} dominadas</span>
          <span class="mini-bar"><i style="width:${pct}%"></i></span>
        </button>`;
    }).join('');

    $app.innerHTML = `
      <div class="screen home">
        <header class="home-header">
          <div class="brand">
            <span class="brand-logo">H</span>
            <span class="brand-name">Habla<b>Ya</b></span>
          </div>
          <div class="stats-row">
            <span class="stat-pill" title="Racha de días">🔥 ${store.streak || 0}</span>
            <span class="stat-pill" title="Experiencia">⭐ ${store.xp} XP</span>
            <span class="stat-pill" title="Nivel">Nv. ${lvl.level}</span>
          </div>
          <div class="level-bar"><i style="width:${lvl.pct}%"></i></div>
          <p class="level-hint">${lvl.missing} XP para el nivel ${lvl.level + 1} · ${totalLearned}/${totalItems} frases dominadas</p>
        </header>

        <section class="hero-avatar"><div id="homeAvatar"></div></section>

        <button class="free-chat-btn" id="btnFreeChat">
          <span class="fc-icon">💬</span>
          <span class="fc-text"><b>Charla libre con Lingo</b><small>Habla fluido en inglés · te corrige al momento</small></span>
          <span class="fc-arrow">→</span>
        </button>

        <h2 class="section-title">Elige una lección</h2>
        <div class="grid-cats">${cards}</div>

        <footer class="note">
          🎙️ Usa Chrome o Edge y permite el micrófono para que Lingo escuche tu pronunciación.
        </footer>
      </div>`;

    window.Avatar.mount(document.getElementById('homeAvatar'));
    window.Avatar.say(`¡Bienvenido de nuevo! Racha de 🔥 ${store.streak || 0} día(s).`, 3600);

    $app.querySelectorAll('.cat-card').forEach((cardEl) => {
      cardEl.addEventListener('click', () => {
        const catId = cardEl.dataset.cat;
        startCategory(CATS.find((c) => c.id === catId));
      });
    });

    document.getElementById('btnFreeChat').addEventListener('click', renderChat);
  }

  /* ================= Pantalla: Lección ================= */
  function startCategory(cat) {
    stopVoiceSession();
    current = { cat, idx: 0, results: [], xpGained: 0 };
    renderItem();
  }

  function renderItem() {
    const item = current.cat.items[current.idx];
    const prog = itemProgress(item.id);

    $app.innerHTML = `
      <div class="screen session">
        <div class="session-top">
          <button class="back-btn" id="btnBack" aria-label="Volver">←</button>
          <span class="session-title">${current.cat.icon} ${escapeHtml(current.cat.name)}</span>
          <span class="xp-gained">+${current.xpGained} XP</span>
        </div>
        <div class="dots">
          ${current.cat.items.map((it, i) =>
            `<span class="dot${i === current.idx ? ' active' : ''}${itemProgress(it.id).learned ? ' done' : ''}"></span>`
          ).join('')}
        </div>

        <div class="phrase-card" id="phraseCard" role="button" tabindex="0"
             aria-label="Toca para ver la traducción">
          ${prog.learned ? '<span class="badge-learned">✔ Dominada</span>' : ''}
          <p class="phrase-label">Di esto en inglés</p>
          <h1 class="phrase-es">${escapeHtml(item.es)}</h1>
          <div class="phrase-reveal" hidden>
            <p class="phrase-en">${escapeHtml(item.en)}</p>
            ${item.tip ? `<p class="tip">💡 ${escapeHtml(item.tip)}</p>` : ''}
          </div>
          <p class="reveal-hint">👆 Toca para ver la respuesta</p>
        </div>

        <div class="avatar-zone"><div id="sessionAvatar"></div></div>

        <div class="live-heard" id="liveHeard" hidden></div>

        <div class="controls">
          <button class="ctrl-btn listen" id="btnListen" title="Escuchar pronunciación">🔊</button>
          <button class="mic-btn" id="btnMic" title="Mantén pulsado no hace falta: toca y habla">
            <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor" aria-hidden="true">
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"/>
              <path d="M18.5 11a6.5 6.5 0 0 1-13 0H4a8 8 0 0 0 7 7.93V21h2v-2.07A8 8 0 0 0 20 11h-1.5Z"/>
            </svg>
          </button>
          <button class="ctrl-btn type" id="btnType" title="Responder escribiendo">⌨️</button>
        </div>
        <p class="mic-status" id="micStatus"></p>

        <div class="typed-row" id="typedRow" hidden>
          <input id="typedInput" type="text" placeholder="Escribe la frase en inglés…" autocomplete="off" autocapitalize="off" spellcheck="false" />
          <button class="check-typed" id="btnCheckTyped">Comprobar</button>
        </div>

        <div class="feedback" id="feedback" hidden></div>

        <div class="session-actions">
          <button class="ghost-btn" id="btnSkip">Saltar</button>
          <button class="primary-btn" id="btnNext" disabled>Siguiente →</button>
        </div>
      </div>`;

    window.Avatar.mount(document.getElementById('sessionAvatar'));
    wireSession(item);
  }

  function wireSession(item) {
    const card = document.getElementById('phraseCard');
    const btnMic = document.getElementById('btnMic');
    const btnListen = document.getElementById('btnListen');
    const btnType = document.getElementById('btnType');
    const typedRow = document.getElementById('typedRow');
    const typedInput = document.getElementById('typedInput');

    const toggleReveal = () => {
      const rev = card.querySelector('.phrase-reveal');
      const hint = card.querySelector('.reveal-hint');
      const shown = !rev.hidden;
      rev.hidden = shown;
      hint.textContent = shown ? '👆 Toca para ver la respuesta' : '🙈 Toca para ocultar';
      if (!shown && current) window.SpeechEngine.speak(item.en);
    };
    card.addEventListener('click', toggleReveal);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleReveal(); } });

    btnListen.addEventListener('click', () => {
      card.querySelector('.phrase-reveal').hidden = false;
      card.querySelector('.reveal-hint').textContent = '🙈 Toca para ocultar';
      window.Avatar.setState('talk');
      window.SpeechEngine.speak(item.en, () => window.Avatar.setState('idle'));
    });

    btnMic.addEventListener('click', () => (listening ? cancelListen() : beginListen(item)));

    btnType.addEventListener('click', () => {
      typedRow.hidden = !typedRow.hidden;
      if (!typedRow.hidden) typedInput.focus();
    });

    document.getElementById('btnCheckTyped').addEventListener('click', () => {
      const val = typedInput.value.trim();
      if (val) resolveAttempt(item, val, false);
    });
    typedInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && typedInput.value.trim()) resolveAttempt(item, typedInput.value.trim(), false);
    });

    document.getElementById('btnBack').addEventListener('click', renderHome);
    document.getElementById('btnSkip').addEventListener('click', () => nextItem(false));
    document.getElementById('btnNext').addEventListener('click', () => nextItem(true));
  }

  function beginListen(item) {
    if (!window.SpeechEngine.supported) {
      toast('Tu navegador no soporta reconocimiento de voz. Prueba Chrome/Edge o usa ⌨️.');
      showFeedback({ kind: 'error', title: 'Reconocimiento no disponible', detail: 'Usa Chrome o Edge, o escribe tu respuesta con ⌨️.' });
      return;
    }
    if (listening) return;
    listening = true;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    window.Avatar.setState('listen');
    window.Avatar.hideBubble();

    const micBtn = document.getElementById('btnMic');
    const status = document.getElementById('micStatus');
    const live = document.getElementById('liveHeard');
    micBtn.classList.add('listening');
    status.textContent = '🎙️ Escuchando… di la frase en inglés';
    live.hidden = false;
    live.textContent = '';

    stopFn = window.SpeechEngine.listen({
      expected: item.en,
      onInterim: (text) => { live.textContent = text ? `“${text}”` : ''; },
      onResult: (res) => {
        endListeningUI();
        if (res.error === 'denied') {
          showFeedback({ kind: 'error', title: 'Micrófono bloqueado', detail: 'Permite el acceso al micrófono en el candado de la barra de direcciones.' });
          window.Avatar.setState('sad');
          window.Avatar.say('No puedo escuchar… revisa los permisos del micrófono.', 4500);
          setTimeout(() => window.Avatar.setState('idle'), 2600);
        } else if (res.error === 'no-speech' || res.error === 'aborted') {
          window.Avatar.setState('idle');
          window.Avatar.say('No te escuché. ¡Inténtalo otra vez!', 3000);
          status.textContent = 'No se detectó voz. Verifica que el micro no esté silenciado y habla más cerca.';
        } else if (res.text) {
          resolveAttempt(item, res.text, true);
        } else {
          console.warn('[HablaYa] STT error:', res.error);
          const msg = STT_ERROR_MSG[res.error] || ('⚠️ Error de voz (' + res.error + '). Comprueba micrófono e internet.');
          status.textContent = msg;
          toast(msg);
        }
      }
    });
  }

  function cancelListen() {
    if (stopFn) stopFn();
    endListeningUI();
    window.Avatar.setState('idle');
  }

  function endListeningUI() {
    listening = false;
    stopFn = null;
    const micBtn = document.getElementById('btnMic');
    const status = document.getElementById('micStatus');
    const live = document.getElementById('liveHeard');
    if (micBtn) micBtn.classList.remove('listening');
    if (status) status.textContent = '';
    if (live) live.hidden = true;
  }

  /* ---------- Evaluación del intento ---------- */
  function resolveAttempt(item, saidText, byVoice) {
    const result = window.SpeechEngine.evaluate(item.en, saidText);
    const prog = itemProgress(item.id);
    prog.attempts += 1;

    let gained = 0;
    if (result.tier === 'perfect') gained = 12;
    else if (result.tier === 'close') gained = 6;
    if (result.score > prog.best) prog.best = Math.round(result.score * 100) / 100;
    if (result.tier === 'perfect' || (result.tier === 'close' && prog.attempts >= 2)) {
      if (!prog.learned) { prog.learned = true; gained += 15; toast('🎉 ¡Frase dominada! +15 XP extra'); }
    }
    if (gained > 0) {
      store.xp += gained;
      current.xpGained += gained;
      bumpStreak();
    }
    save();
    refreshXpBadge();

    const messages = {
      perfect: ['¡Perfecto! Suena nativo. 🌟', '¡Excelente pronunciación! 👏', '¡Impecable! Sigue así. 💪'],
      close: ['¡Casi lo tienes! Fíjate en las palabras marcadas. 🎯', 'Buen intento, pero hay detalles por pulir. ✨', 'Muy cerca. Escucha y repite. 🔁'],
      fail: ['Mmm… no lo entendí bien. Escucha y prueba otra vez. 🔁', 'Inténtalo de nuevo, tú puedes. 🙂']
    };
    const msgSet = messages[result.tier];
    const msg = msgSet[Math.floor(Math.random() * msgSet.length)];

    showFeedback({
      kind: result.tier,
      title: result.tier === 'perfect' ? '¡Correcto!' : result.tier === 'close' ? 'Casi…' : 'Otra vez',
      score: Math.round(result.score * 100),
      words: result.words,
      heard: saidText,
      byVoice
    });

    window.Avatar.setState('talk');
    window.Avatar.say(msg, 5000);
    const reactionState = result.tier === 'fail' ? 'sad' : 'happy';
    window.SpeechEngine.speak(item.en, () => window.Avatar.setState(reactionState));
    setTimeout(() => {
      if (!window.speechSynthesis || !window.speechSynthesis.speaking) {
        window.Avatar.setState(reactionState);
      }
    }, 700);
    setTimeout(() => { if (window.Avatar) window.Avatar.setState('idle'); }, 4500);

    document.getElementById('btnNext').disabled = false;
    const dots = $app.querySelectorAll('.dot');
    if (dots[current.idx]) dots[current.idx].classList.add('attempted');
  }

  function refreshXpBadge() {
    const pill = $app.querySelector('.xp-gained');
    if (pill) pill.textContent = '+' + current.xpGained + ' XP';
  }

  function showFeedback(f) {
    const box = document.getElementById('feedback');
    box.hidden = false;
    box.className = 'feedback ' + f.kind;

    if (f.kind === 'error') {
      box.innerHTML = `<p class="fb-title">⚠️ ${f.title}</p><p class="fb-detail">${f.detail}</p>`;
      return;
    }

    const chips = f.words.map((w) => {
      const ok = w.score >= 0.75;
      const mid = !ok && w.score >= 0.45;
      return `<span class="chip ${ok ? 'good' : mid ? 'mid' : 'bad'}">${escapeHtml(w.word)}${byVoiceTag(f.byVoice, w)}</span>`;
    }).join('');

    box.innerHTML = `
      <div class="fb-head">
        <p class="fb-title">${f.title}</p>
        <span class="score-pill ${f.kind}">${f.score}%</span>
      </div>
      <div class="score-track"><i style="width:${f.score}%"></i></div>
      <div class="chips">${chips}</div>
      <p class="heard">🎧 Escuché: “${escapeHtml(f.heard)}”</p>`;

    function byVoiceTag(byVoice, w) {
      if (!byVoice) return '';
      const ok = w.score >= 0.75;
      return `<small>${ok ? ' ✓' : ' ✗'}</small>`;
    }
  }

  function nextItem(counted) {
    if (counted) current.results.push(current.idx);
    current.idx += 1;
    if (current.idx >= current.cat.items.length) {
      showSummary();
    } else {
      renderItem();
    }
  }

  /* ================= Pantalla: Resumen ================= */
  function showSummary() {
    window.Avatar.destroy();
    const practiced = current.results.length;
    const scores = current.results.map((i) => itemProgress(current.cat.items[i].id).best);
    const avgBest = scores.length
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100)
      : 0;
    const learnedCount = current.cat.items.filter((it) => itemProgress(it.id).learned).length;
    const lvl = levelInfo(store.xp);
    const trophy = practiced >= Math.ceil(current.cat.items.length / 2) ? '🏆' : '📈';

    $app.innerHTML = `
      <div class="screen summary">
        <div class="summary-card">
          <div class="trophy">${trophy}</div>
          <h1>Lección completada</h1>
          <p class="sub">${current.cat.icon} ${escapeHtml(current.cat.name)}</p>
          <div class="summary-grid">
            <div class="s-box"><b>+${current.xpGained}</b><span>XP ganados</span></div>
            <div class="s-box"><b>${avgBest}%</b><span>precisión media</span></div>
            <div class="s-box"><b>${learnedCount}/${current.cat.items.length}</b><span>dominadas</span></div>
            <div class="s-box"><b>🔥 ${store.streak || 0}</b><span>racha (días)</span></div>
          </div>
          <div class="level-bar big"><i style="width:${lvl.pct}%"></i></div>
          <p class="level-hint">Nivel ${lvl.level} · ${lvl.missing} XP para el nivel ${lvl.level + 1}</p>
          <div class="session-actions center">
            <button class="ghost-btn" id="btnAgain">Repetir lección</button>
            <button class="primary-btn" id="btnHome">Inicio</button>
          </div>
        </div>
      </div>`;

    document.getElementById('btnAgain').addEventListener('click', () => startCategory(current.cat));
    document.getElementById('btnHome').addEventListener('click', renderHome);
  }

  /* ================= Pantalla: Charla libre ================= */
  function renderChat() {
    stopVoiceSession();

    $app.innerHTML = `
      <div class="screen chat">
        <div class="session-top">
          <button class="back-btn" id="chatBack" aria-label="Volver">←</button>
          <span class="session-title">💬 Charla libre</span>
          <button class="back-btn" id="chatReset" title="Reiniciar conversación">🗑️</button>
        </div>

        <div class="chat-head">
          <div class="avatar-mini" id="chatAvatar"></div>
          <div class="chat-id">
            <b>Lingo</b>
            <span>Habla o escribe en inglés · di «repeat» para repetir</span>
          </div>
        </div>

        <div class="chat-log" id="chatLog"></div>

        <div class="live-heard chat-live" id="chatLive" hidden></div>
        <div class="mic-level" id="chatMicLevel" hidden><i></i></div>
        <p class="chat-status" id="chatStatus"></p>

        <div class="chat-bar">
          <input id="chatInput" type="text" placeholder="Escribe en inglés…" autocomplete="off" autocapitalize="off" spellcheck="false" />
          <button class="send-btn" id="btnChatSend" aria-label="Enviar">➤</button>
          <button class="mic-btn small" id="btnChatMic" aria-label="Hablar">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"/>
              <path d="M18.5 11a6.5 6.5 0 0 1-13 0H4a8 8 0 0 0 7 7.93V21h2v-2.07A8 8 0 0 0 20 11h-1.5Z"/>
            </svg>
          </button>
        </div>
      </div>`;

    window.Avatar.mount(document.getElementById('chatAvatar'));
    window.Avatar.hideBubble();

    const log = document.getElementById('chatLog');
    const input = document.getElementById('chatInput');
    const micBtn = document.getElementById('btnChatMic');

    document.getElementById('chatBack').addEventListener('click', renderHome);
    document.getElementById('chatReset').addEventListener('click', () => {
      window.ChatEngine.reset();
      log.innerHTML = '';
      greet(true);
    });
    document.getElementById('btnChatSend').addEventListener('click', () => {
      const val = input.value.trim();
      if (val) { input.value = ''; handleUserUtterance(val); }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        const val = input.value.trim();
        input.value = '';
        handleUserUtterance(val);
      }
    });
    micBtn.addEventListener('click', () => (chatActive ? pauseVoice() : resumeVoice()));

    greet(false);
    if (window.SpeechEngine.supported) {
      chatActive = true;
      micBtn.classList.add('listening');
      startMicMeter();
      setTimeout(chatLoopTick, 800);
    } else {
      toast('Reconocimiento de voz no disponible: usa Chrome/Edge o escribe.');
    }

    function greet(alone) {
      botReply(
        alone ? "Fresh start! Talk to me in English about anything." : "Hi! I'm Lingo. Talk to me in English about anything — your day, hobbies, plans…",
        alone ? '¡Empezamos de nuevo! Háblame en inglés de lo que quieras.' : "¡Hola! Soy Lingo. Háblame en inglés de lo que quieras: tu día, aficiones, planes…",
        true
      );
    }
  }

  function chatLoopTick() {
    if (!chatActive || botSpeaking) return;
    setChatStatus('🎙️ Escuchando… habla en inglés');
    const live = document.getElementById('chatLive');
    chatStop = window.SpeechEngine.listen({
      expected: '',
      onInterim: (text) => {
        if (!live) return;
        live.hidden = false;
        live.textContent = text ? `“${text}”` : '';
        if (text) setChatStatus('');
      },
      onResult: (res) => {
        chatStop = null;
        if (!chatActive) return;
        if (live) live.hidden = true;

        if (res.error === 'denied') {
          pauseVoice();
          setChatStatus(STT_ERROR_MSG.denied);
          toast('Micrófono bloqueado: revisa permisos o escribe tu mensaje.');
          return;
        }
        if (res.error) {
          chatFailStreak++;
          console.warn('[HablaYa] STT error:', res.error);
          setChatStatus(STT_ERROR_MSG[res.error] || ('⚠️ Error de voz (' + res.error + '). Reintentando…'));
          if (chatFailStreak >= 4) {
            chatFailStreak = 0;
            pauseVoice();
            return;
          }
          setTimeout(chatLoopTick, 400);
          return;
        }
        chatFailStreak = 0;
        if (res.text) {
          setChatStatus('');
          handleUserUtterance(res.text);
        } else {
          setTimeout(chatLoopTick, 250);
        }
      }
    });
  }

  function pauseVoice() {
    chatActive = false;
    if (chatStop) { try { chatStop(); } catch (err) { /* noop */ } }
    chatStop = null;
    stopMicMeter();
    const live = document.getElementById('chatLive');
    if (live) live.hidden = true;
    const micBtn = document.getElementById('btnChatMic');
    if (micBtn) micBtn.classList.remove('listening');
    window.Avatar.setState('idle');
    setChatStatus('⏸️ Micrófono en pausa · púlsalo 🎤 para volver a hablar');
  }

  function resumeVoice() {
    if (!window.SpeechEngine.supported) { toast('Tu navegador no soporta voz. Usa Chrome/Edge.'); return; }
    chatFailStreak = 0;
    chatActive = true;
    const micBtn = document.getElementById('btnChatMic');
    if (micBtn) micBtn.classList.add('listening');
    startMicMeter();
    chatLoopTick();
  }

  function handleUserUtterance(text) {
    addMsg('user', text);
    const r = window.ChatEngine.respond(text);
    r.corrections.forEach((c) => addCorrection(c));
    botReply(r.en, r.es, false);
  }

  function botReply(en, es, silentTts) {
    botSpeaking = true;
    addMsg('bot', en, es);
    window.Avatar.setState('talk');

    const done = () => {
      botSpeaking = false;
      window.Avatar.setState('idle');
      if (chatActive) setTimeout(chatLoopTick, 350);
    };

    if (silentTts || !('speechSynthesis' in window)) {
      setTimeout(done, 500);
    } else {
      window.SpeechEngine.speak(en, done);
    }
  }

  function addMsg(role, text, esTranslation) {
    const log = document.getElementById('chatLog');
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    div.textContent = text;
    log.appendChild(div);

    if (role === 'bot' && esTranslation && esTranslation !== '(Repetición)') {
      const det = document.createElement('details');
      det.className = 'es-details';
      const sum = document.createElement('summary');
      sum.textContent = 'ES';
      const body = document.createElement('div');
      body.className = 'msg-es';
      body.textContent = esTranslation;
      det.appendChild(sum);
      det.appendChild(body);
      log.appendChild(det);
    }

    log.scrollTop = log.scrollHeight;
  }

  function addCorrection(c) {
    const log = document.getElementById('chatLog');
    const div = document.createElement('div');
    div.className = 'correction';
    div.innerHTML = `<b>${escapeHtml(c.right)}</b> — ${escapeHtml(c.why)}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  /* ================= Arranque ================= */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }

  renderHome();
})();
