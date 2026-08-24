/* HablaYa · Avatar animado (SVG + CSS) con estados: idle, listen, talk, happy, sad */
window.Avatar = (function () {
  let root = null;
  let bubble = null;
  let bubbleText = null;
  let mouthSmile = null;
  let mouthTalk = null;
  let bubbleTimer = null;
  let talkTimer = null;

  const MOUTHS = {
    idle: 'M46 80 Q60 88 74 80',
    listen: 'M50 82 Q60 85 70 82',
    happy: 'M42 78 Q60 95 78 78',
    sad: 'M47 86 Q60 76 73 86'
  };

  const SVG = `
    <div class="avatar-wrap" data-state="idle" aria-hidden="true">
      <div class="avatar-ring r1"></div>
      <div class="avatar-ring r2"></div>
      <svg class="avatar-svg" viewBox="0 0 120 120">
        <defs>
          <linearGradient id="av-head-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#6366f1"></stop>
            <stop offset="1" stop-color="#a855f7"></stop>
          </linearGradient>
          <radialGradient id="av-tip-grad" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stop-color="#67e8f9"></stop>
            <stop offset="1" stop-color="#22d3ee"></stop>
          </radialGradient>
        </defs>
        <g class="av-float">
          <line class="antenna" x1="60" y1="26" x2="60" y2="14"></line>
          <circle class="antenna-tip" cx="60" cy="11" r="5"></circle>
          <rect class="head" x="16" y="24" width="88" height="76" rx="26"></rect>
          <rect class="visor" x="25" y="40" width="70" height="48" rx="18"></rect>
          <g class="eye eye-l"><circle class="pupil" cx="45" cy="58" r="6"></circle></g>
          <g class="eye eye-r"><circle class="pupil" cx="75" cy="58" r="6"></circle></g>
          <path class="mouth-smile" d="${MOUTHS.idle}"></path>
          <ellipse class="mouth-talk" cx="60" cy="82" rx="9" ry="7"></ellipse>
          <circle class="cheek cheek-l" cx="33" cy="72" r="4.5"></circle>
          <circle class="cheek cheek-r" cx="87" cy="72" r="4.5"></circle>
        </g>
      </svg>
      <div class="bubble"><span></span></div>
    </div>`;

  function mount(container) {
    container.innerHTML = SVG;
    root = container.querySelector('.avatar-wrap');
    bubble = container.querySelector('.bubble');
    bubbleText = container.querySelector('.bubble span');
    mouthSmile = container.querySelector('.mouth-smile');
    mouthTalk = container.querySelector('.mouth-talk');
    setState('idle');
    say('¡Hola! Soy Lingo. Toca el micrófono y habla en inglés.', 5000);
  }

  function destroy() {
    clearInterval(talkTimer);
    clearTimeout(bubbleTimer);
    root = null;
  }

  function setState(state) {
    if (!root) return;
    root.dataset.state = state;
    if (state === 'talk') {
      mouthSmile.style.display = 'none';
      mouthTalk.style.display = '';
      startTalking();
    } else {
      stopTalking();
      mouthSmile.style.display = '';
      mouthTalk.style.display = 'none';
      mouthSmile.setAttribute('d', MOUTHS[state] || MOUTHS.idle);
    }
    root.classList.toggle('shake', state === 'sad');
    if (state !== 'sad') root.classList.remove('shake');
  }

  function startTalking() {
    stopTalking();
    let open = false;
    talkTimer = setInterval(() => {
      open = !open;
      if (root) root.classList.toggle('talking', open);
    }, 140);
  }

  function stopTalking() {
    if (talkTimer) clearInterval(talkTimer);
    talkTimer = null;
    if (root) root.classList.remove('talking');
  }

  function say(message, ms) {
    if (!bubble) return;
    bubbleText.textContent = message;
    bubble.classList.add('show');
    clearTimeout(bubbleTimer);
    if (ms !== 0) {
      bubbleTimer = setTimeout(() => bubble.classList.remove('show'), ms || 4200);
    }
  }

  function hideBubble() {
    if (bubble) bubble.classList.remove('show');
  }

  return { mount, destroy, setState, say, hideBubble };
})();
