/* HablaYa · Medidor de nivel de micrófono (diagnóstico visual de entrada de audio) */
window.MicTest = (function () {
  let stream = null;
  let ctx = null;
  let rafId = 0;

  /* Devuelve una función stop(); llama onLevel(0..1) continuamente,
     o onLevel(-1) si no hay permiso/dispositivo. */
  function start(onLevel) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (onLevel) setTimeout(() => onLevel(-1), 50);
      return function stop() {};
    }

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function (s) {
        stream = s;
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        const src = ctx.createMediaStreamSource(s);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src.connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);

        const tick = function () {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / buf.length);
          if (onLevel) onLevel(Math.min(1, rms * 4));
          rafId = requestAnimationFrame(tick);
        };
        tick();
      })
      .catch(function () {
        if (onLevel) onLevel(-1);
      });

    return function stop() {
      cancelAnimationFrame(rafId);
      rafId = 0;
      if (ctx) { try { ctx.close(); } catch (err) { /* noop */ } }
      ctx = null;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null;
    };
  }

  return { start };
})();
