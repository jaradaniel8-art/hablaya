/* HablaYa · Motor de conversación libre (offline, basado en reglas e intenciones) */
window.ChatEngine = (function () {
  const mem = {
    name: null,
    age: null,
    from: null,
    likes: [],
    lastBotLine: '',
    fallbackCount: 0,
    topicIdx: -1
  };

  function reset() {
    mem.name = null; mem.age = null; mem.from = null; mem.likes = [];
    mem.lastBotLine = ''; mem.fallbackCount = 0; mem.topicIdx = -1;
  }

  /* ---------- utilidades ---------- */
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function cleanCapture(s) {
    return String(s || '').replace(/\s+/g, ' ').replace(/[.,!?;]+$/, '').trim();
  }

  function capName(s) {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }

  const STOP_ADJ = new Set([
    'good', 'fine', 'great', 'ok', 'okay', 'happy', 'sad', 'tired', 'hungry',
    'thirsty', 'sleepy', 'bored', 'boring', 'sick', 'cold', 'hot', 'angry',
    'excited', 'busy', 'ready', 'here', 'sorry', 'sure', 'not', 'so', 'very',
    'really', 'just', 'also', 'too', 'now', 'today', 'a', 'an', 'the', 'and',
    'from', 'in', 'at', 'on', 'with', 'about', 'out', 'up', 'down', 'going',
    'doing', 'feeling', 'my', 'your', 'his', 'her', 'their', 'trying'
  ]);

  function nameOf() {
    return mem.name ? ', ' + mem.name : '';
  }

  /* ---------- banco de temas y reacciones ---------- */
  const TOPICS = [
    { en: 'What do you usually do on weekends?', es: '¿Qué sueles hacer los fines de semana?' },
    { en: 'What kind of music do you like?', es: '¿Qué tipo de música te gusta?' },
    { en: 'Do you have any pets?', es: '¿Tienes mascotas?' },
    { en: "What's your favorite food?", es: '¿Cuál es tu comida favorita?' },
    { en: 'If you could travel anywhere, where would you go?', es: 'Si pudieras viajar a cualquier sitio, ¿adónde irías?' },
    { en: 'What did you do yesterday?', es: '¿Qué hiciste ayer?' },
    { en: 'What are your plans for tomorrow?', es: '¿Qué planes tienes para mañana?' },
    { en: 'Do you prefer coffee or tea?', es: '¿Prefieres café o té?' }
  ];

  const REACTIONS = [
    { en: 'Interesting! Tell me more.', es: '¡Interesante! Cuéntame más.' },
    { en: 'Really? Why do you think so?', es: '¿En serio? ¿Por qué crees eso?' },
    { en: "That's cool! And then what happened?", es: '¡Qué bien! Y entonces, ¿qué pasó?' },
    { en: 'I see! How did that make you feel?', es: '¡Ya veo! ¿Cómo te hizo sentir?' },
    { en: 'Wow! Can you explain more?', es: '¡Vaya! ¿Puedes explicar más?' }
  ];

  function nextTopic() {
    mem.topicIdx = (mem.topicIdx + 1) % TOPICS.length;
    return TOPICS[mem.topicIdx];
  }

  function fallbackReply() {
    mem.fallbackCount++;
    if (mem.name && mem.fallbackCount % 4 === 0) {
      return {
        en: `So${nameOf()}, tell me more about yourself.`,
        es: `Y dime${nameOf()}, cuéntame más sobre ti.`
      };
    }
    return (mem.fallbackCount % 2 === 0) ? nextTopic() : pick(REACTIONS);
  }

  /* ---------- correcciones comunes (español → inglés) ---------- */
  const RULES = [
    { re: /\bi have (\d+|one|two|three|four|five|six|seven|eight|nine|ten) years?( old)?\b/i, to: 'I am $1 years old', why: 'La edad va con «to be»: I am X years old.' },
    { re: /\bi am agree\b/i, to: 'I agree', why: '«Agree» es verbo, no necesita «am».' },
    { re: /\bpeoples\b/i, to: 'people', why: '«People» ya es plural.' },
    { re: /\binformations\b/i, to: 'information', why: '«Information» es incontable.' },
    { re: /\bmore better\b/i, to: 'better', why: '«Better» ya es comparativo.' },
    { re: /\bshe don't\b/i, to: "she doesn't", why: '3ª persona singular: «doesn’t».' },
    { re: /\bhe don't\b/i, to: "he doesn't", why: '3ª persona singular: «doesn’t».' },
    { re: /\bexplain me\b/i, to: 'explain to me', why: 'Se usa «explain TO me».' },
    { re: /\bdepend of\b/i, to: 'depend on', why: 'El verbo es «depend ON».' },
    { re: /\bi want (go|eat|drink|sleep|buy|see|learn|travel)\b/i, to: 'I want to $1', why: 'Después de «want» se usa «to».' },
    { re: /\bfor to\b/i, to: 'to', why: 'No se dice «for to», solo «to».' },
    { re: /\btake a decision\b/i, to: 'make a decision', why: 'Se dice «make a decision».' },
    { re: /\bdo a mistake\b/i, to: 'make a mistake', why: 'Se dice «make a mistake».' },
    { re: /\bpeople is\b/i, to: 'people are', why: '«People» es plural: people are.' },
    { re: /\bmuch people\b/i, to: 'many people', why: 'Con «people» se usa «many».' },
    { re: /\bthe (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, to: '$1', why: 'Los días no llevan artículo.' },
    { re: /\bassist to\b/i, to: 'attend', why: '«Assist» significa ayudar; asistir = attend.' },
    { re: /\bi'?m boring\b/i, to: "I'm bored", why: '«Bored» = aburrido (tú); «boring» = aburrido (la cosa).' },
    { re: /\bmake a photo\b/i, to: 'take a photo', why: 'Las fotos se «take».' },
    { re: /\bi like very much\b/i, to: 'I like it very much', why: 'Necesita el objeto: «like IT».' }
  ];

  const VERBS3 = {
    go: 'goes', do: 'does', have: 'has', want: 'wants', need: 'needs',
    like: 'likes', work: 'works', live: 'lives', play: 'plays', eat: 'eats',
    drink: 'drinks', speak: 'speaks', watch: 'watches'
  };
  const AUX_SKIP = new Set(['does', 'did', 'can', "can't", 'will', 'would', 'to', 'let', "doesn't", "don't"]);

  function thirdPersonFix(text) {
    const tokens = text.split(/(\s+)/);
    let changed = null;
    for (let i = 0; i < tokens.length - 2; i += 2) {
      const pronoun = (tokens[i] || '').toLowerCase().replace(/[.,!?]/g, '');
      const prevWord = i > 0 ? (tokens[i - 1] || '').toLowerCase() : '';
      if ((pronoun === 'he' || pronoun === 'she') && !AUX_SKIP.has(prevWord.replace(/[.,!?]/g, ''))) {
        const verb = (tokens[i + 2] || '').toLowerCase().replace(/[.,!?]/g, '');
        if (VERBS3[verb]) {
          tokens[i + 2] = tokens[i + 2].toLowerCase().replace(verb, VERBS3[verb]);
          changed = { wrong: pronoun + ' ' + verb, right: pronoun + ' ' + VERBS3[verb], why: '3ª persona singular lleva -s: ' + pronoun + ' ' + VERBS3[verb] + '.' };
          break;
        }
      }
    }
    return changed;
  }

  function correct(raw) {
    const out = [];
    for (const rule of RULES) {
      if (out.length >= 2) break;
      if (rule.re.test(raw)) {
        out.push({ wrong: raw.match(rule.re)[0], right: raw.replace(rule.re, rule.to), why: rule.why });
      }
    }
    if (out.length < 2) {
      const tp = thirdPersonFix(raw);
      if (tp && !out.some((o) => o.wrong.toLowerCase() === tp.wrong.toLowerCase())) out.push(tp);
    }
    return out;
  }

  /* ---------- intenciones ---------- */
  function respond(raw) {
    const text = String(raw || '');
    const lower = text.toLowerCase().trim();
    const corrections = correct(text);

    if (/\b(repeat|again|otra vez|repetir|one more time)\b/.test(lower) && mem.lastBotLine) {
      return { en: mem.lastBotLine, es: '(Repetición)', corrections };
    }

    if (/\b(bye|goodbye|see you|good night|bye bye)\b/.test(lower)) {
      return { en: `Goodbye${nameOf()}! Great practice today. See you soon! 👋`, es: `¡Adiós${nameOf()}! Gran práctica hoy. ¡Hasta pronto!`, corrections };
    }

    if (/\b(thank you|thanks|thx)\b/.test(lower)) {
      return { en: pick(["You're welcome!", 'No problem!', 'Anytime!']), es: pick(['¡De nada!', '¡Sin problema!', '¡Cuando quieras!']), corrections };
    }

    if (/\bhelp\b|\bdon'?t understand\b|\bwhat can i (say|do)\b/.test(lower)) {
      return {
        en: "Talk to me about anything: your day, your hobbies, your plans… Say 'repeat' to hear me again.",
        es: 'Háblame de lo que quieras: tu día, tus aficiones, tus planes… Di «repeat» para escucharme otra vez.',
        corrections
      };
    }

    if (/how are you|how'?s it going|what'?s up|how do you feel/.test(lower)) {
      return { en: pick(["I'm great, thanks for asking! And you?", 'Pretty good today! How about you?']), es: pick(['¡Estupendo, gracias por preguntar! ¿Y tú?', '¡Muy bien hoy! ¿Y tú cómo estás?']), corrections };
    }

    if (/\byour name\b|who are you\b/.test(lower)) {
      return { en: "I'm Lingo, your English speaking buddy! 🤖", es: '¡Soy Lingo, tu compañero para hablar inglés!', corrections };
    }

    if (/\bwhat time\b|\bthe time\b/.test(lower)) {
      const d = new Date();
      const h = d.getHours(), m = d.getMinutes();
      const h12 = h % 12 === 0 ? 12 : h % 12;
      const ampm = h < 12 ? 'AM' : 'PM';
      return { en: `It's ${h12}:${String(m).padStart(2, '0')} ${ampm}.`, es: `Son las ${h}:${String(m).padStart(2, '0')}.`, corrections };
    }

    if (/\b(hi|hello|hey|good morning|good afternoon|good evening|yo)\b/.test(lower)) {
      return {
        en: pick([`Hello${nameOf()}! How's your day going?`, `Hey${nameOf()}! Nice to hear you. What's new?`, `Hi there! Tell me something about your day.`]),
        es: pick([`¡Hola${nameOf()}! ¿Cómo va tu día?`, `¡Ey${nameOf()}! Qué gusto oírte. ¿Qué hay de nuevo?`]),
        corrections
      };
    }

    const mName = lower.match(/(?:my name is|i am|i'm|call me)\s+([a-zàáéíóúñ]{2,})\b/);
    if (mName && !STOP_ADJ.has(mName[1])) {
      mem.name = capName(mName[1]);
      return { en: `Nice to meet you, ${mem.name}! Where are you from?`, es: `¡Encantado de conocerte, ${mem.name}! ¿De dónde eres?`, corrections };
    }

    const mAge = lower.match(/(?:i am|i'm|i have)\s+(\d{1,2})(?:\s+years?)?\b/);
    if (mAge) {
      const n = parseInt(mAge[1], 10);
      if (n > 0 && n < 100) {
        mem.age = n;
        return { en: `${n}, awesome! What do you enjoy doing at your age?`, es: `¡${n}, genial! ¿Qué disfrutas hacer?`, corrections };
      }
    }

    const mFrom = lower.match(/i(?:'m| am)?\s+from\s+([a-z\s]{3,30})/) || lower.match(/i live in\s+([a-z\s]{3,30})/);
    if (mFrom) {
      mem.from = cleanCapture(mFrom[1]);
      return { en: `${capName(mem.from)} sounds like a nice place! What do you like most about it?`, es: `¡${capName(mem.from)} debe ser un buen lugar! ¿Qué es lo que más te gusta?`, corrections };
    }

    const mWork = lower.match(/i work(?:\s+(?:as|at|in|for))?\s+([^.!?]+)?/);
    if (mWork && /\bwork/.test(lower)) {
      const job = mWork[1] ? cleanCapture(mWork[1]) : '';
      return {
        en: job ? `Working as ${job} sounds interesting! Is it stressful?` : 'What do you do for a living?',
        es: job ? `Trabajar de ${job} suena interesante. ¿Es estresante?` : '¿A qué te dedicas?',
        corrections
      };
    }

    const mStudy = lower.match(/i study\s+([^.!?]+)/);
    if (mStudy) {
      const subj = cleanCapture(mStudy[1]);
      return { en: `${capName(subj)} is a great subject! Why did you choose it?`, es: `¡${subj} es un gran tema! ¿Por qué lo elegiste?`, corrections };
    }
    if (/\bstudent|university|college|school\b/.test(lower)) {
      return { en: "Are you studying something interesting right now?", es: '¿Estás estudiando algo interesante ahora mismo?', corrections };
    }

    const mLike = lower.match(/i (?:really |just )?(love|like|enjoy)\s+([^.!?]{2,60})/);
    if (mLike) {
      const thing = cleanCapture(mLike[2]);
      if (!STOP_ADJ.has(thing.split(' ')[0])) {
        if (mem.likes.length < 5 && !mem.likes.includes(thing)) mem.likes.push(thing);
        return { en: `${thing} sounds great! How long have you been into it?`, es: `¡${thing} suena genial! ¿Desde hace tiempo te gusta?`, corrections };
      }
    }

    const mDislike = lower.match(/i (?:really )?(hate|don'?t like|dislike)\s+([^.!?]{2,60})/);
    if (mDislike) {
      const thing = cleanCapture(mDislike[2]);
      return { en: `Oh, ${thing}? I understand! What do you prefer instead?`, es: `Ah, ¿${thing}? ¡Lo entiendo! ¿Qué prefieres en su lugar?`, corrections };
    }

    const mMood = lower.match(/i(?:'m| am)\s+(happy|great|good|fine|okay|ok|sad|tired|angry|sick|excited|hungry|thirsty|sleepy|bored|nervous)\b/);
    if (mMood) {
      const mood = mMood[1];
      const positive = ['happy', 'great', 'good', 'fine', 'okay', 'ok', 'excited'].includes(mood);
      if (positive) {
        return { en: pick([`That's wonderful to hear${nameOf()}! What made you feel ${mood}?`, `Love that energy! Why are you feeling ${mood}?`]), es: pick(['¡Qué bueno saberlo! ¿Por qué te sientes así?', '¡Me encanta esa energía! ¿A qué se debe?']), corrections };
      }
      return { en: pick([`Sorry to hear that. Want to talk about it?`, `I hope you feel better soon. What happened?`]), es: pick(['Lo siento. ¿Quieres hablar de ello?', 'Espero que te mejores pronto. ¿Qué pasó?']), corrections };
    }

    if (/\brain|raining|sunny|cloudy|snow|weather\b/.test(lower)) {
      return { en: "What's the weather like there today? Perfect for anything fun?", es: '¿Qué tiempo hace ahí hoy? ¿Perfecto para hacer algo divertido?', corrections };
    }

    if (/\bmother|father|mom|dad|brother|sister|wife|husband|son|daughter|kids|children|family\b/.test(lower)) {
      return { en: 'Family is important! Do you see them often?', es: '¡La familia es importante! ¿Los ves a menudo?', corrections };
    }

    if (/\bhungry|breakfast|lunch|dinner|pizza|burger|coffee|tea|food|eat|cook\b/.test(lower)) {
      return { en: "Mmm, food talk! What's the best dish you've tried recently?", es: '¡Mmm, comida! ¿Cuál es el mejor plato que has probado últimamente?', corrections };
    }

    if (/\bfootball|soccer|basketball|tennis|music|guitar|piano|games|video ?games|reading|books|running|swim|dance|movies|series|travel\b/.test(lower)) {
      return { en: pick(['Nice! How often do you do that?', "That's a fun hobby! Who got you into it?"]), es: pick(['¡Bien! ¿Con qué frecuencia lo haces?', '¡Qué afición tan divertida! ¿Quién te animó a empezar?']), corrections };
    }

    if (/^(yes|yeah|yep|sure|of course|ok|okay)\b/.test(lower)) {
      return Object.assign({ corrections }, nextTopic());
    }
    if (/^(no|nope|not really)\b/.test(lower)) {
      return { en: "Okay, no problem. Let me ask you something else.", es: 'Vale, sin problema. Te pregunto otra cosa.', corrections };
    }

    return Object.assign({ corrections }, fallbackReply());
  }

  return { respond, reset };
})();
