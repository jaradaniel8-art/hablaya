/* HablaYa · Reconocimiento de voz (Web Speech API), síntesis y evaluación de pronunciación */
window.SpeechEngine = (function () {
  const SRClass = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SRClass;

  function normalize(s) {
    return String(s)
      .toLowerCase()
      .replace(/[’`]/g, "'")
      .replace(/[^a-z0-9'\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function similarity(expected, heard) {
    const a = normalize(expected);
    const b = normalize(heard);
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    return Math.max(0, 1 - levenshtein(a, b) / Math.max(a.length, b.length));
  }

  /* Evalúa lo escuchado contra la frase esperada.
     Devuelve { score (0..1), tier: perfect|close|fail, words:[{word,score}] } */
  function evaluate(expected, heard) {
    const eWords = normalize(expected).split(' ').filter(Boolean);
    const hWords = normalize(heard).split(' ').filter(Boolean);
    const words = eWords.map((w) => {
      let best = 0;
      hWords.forEach((x) => {
        const s = similarity(w, x);
        if (s > best) best = s;
      });
      return { word: w, score: best };
    });
    const score = similarity(expected, heard);
    const tier = score >= 0.85 ? 'perfect' : score >= 0.55 ? 'close' : 'fail';
    return { score, tier, words };
  }

  /* Texto a voz en inglés */
  function speak(text, onEnd) {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.92;
      const voices = window.speechSynthesis.getVoices();
      const enVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('en-us'))
        || voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('en'));
      if (enVoice) u.voice = enVoice;
      if (onEnd) u.onend = onEnd;
      window.speechSynthesis.speak(u);
      return true;
    } catch (err) {
      if (onEnd) setTimeout(onEnd, 600);
      return false;
    }
  }

  /* Escucha al usuario; elige la alternativa cuyo texto más se parece a `expected`.
     onResult({text}) o ({error}) — errores: denied | no-speech | unsupported | otros */
  function listen(options) {
    const expected = options.expected || '';
    const onResult = options.onResult || function () {};
    const onInterim = options.onInterim || null;

    if (!supported) {
      onResult({ error: 'unsupported' });
      return function stop() {};
    }

    let rec;
    try {
      rec = new SRClass();
    } catch (err) {
      onResult({ error: 'unsupported' });
      return function stop() {};
    }

    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    rec.continuous = false;

    let emitted = false;
    let finalText = '';

    const finish = (payload) => {
      if (emitted) return;
      emitted = true;
      clearTimeout(guard);
      onResult(payload);
    };

    const guard = setTimeout(() => {
      try { rec.stop(); } catch (err) { finish({ error: 'no-speech' }); }
    }, 9000);

    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        let bestText = '';
        let bestScore = -1;
        for (let j = 0; j < result.length; j++) {
          const t = result[j].transcript || '';
          const s = similarity(expected, t) - j * 0.001;
          if (s > bestScore) {
            bestScore = s;
            bestText = t;
          }
        }
        if (result.isFinal) {
          finalText += (finalText ? ' ' : '') + bestText;
        } else {
          interim += (interim ? ' ' : '') + bestText;
        }
      }
      if (onInterim) onInterim((finalText + ' ' + interim).trim());
    };

    rec.onerror = (event) => {
      const map = { 'not-allowed': 'denied', 'service-not-allowed': 'denied', 'no-speech': 'no-speech', aborted: 'aborted' };
      finish({ error: map[event.error] || event.error });
    };

    rec.onend = () => {
      finish(finalText.trim() ? { text: finalText.trim() } : { error: 'no-speech' });
    };

    try {
      rec.start();
    } catch (err) {
      finish({ error: 'busy' });
    }

    return function stop() {
      clearTimeout(guard);
      try { rec.stop(); } catch (err) { /* ya detenido */ }
    };
  }

  return { supported, evaluate, speak, listen, normalize };
})();
