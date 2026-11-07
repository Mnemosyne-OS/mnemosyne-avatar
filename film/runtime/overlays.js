/**
 * overlays.js — motion design over the avatar (avatar-film): HUD cards that
 * illustrate what she says, drawn above the particles and driven by the film
 * time only (no CSS transition, no clock), so a frame is the same on every
 * render and a seek lands exactly.
 *
 * film.json `overlays[]`, each { kind, at, end, y?, ... }:
 *   title   { text, sub? }                 a title card that slides in
 *   badge   { text }                       a pill that pops
 *   engine  { text, sub? }                 one block, a ring that turns, then a ✓
 *   bubble  { text }                       a speech bubble that types itself
 *   mic     { text? }                      a microphone whose bars follow her voice
 *   choice  { options: [a, b], pickAt? }   two buttons; at pickAt the first turns green
 * `y` is the vertical centre as a fraction of the height (default by kind).
 * film.json `subtitles: true` adds the spoken line at the bottom.
 *
 * Style: a HUD of night glass, cyan light,
 * corner brackets, mono labels, green for what is chosen.
 */
(() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const back = (t) => { t = clamp(t, 0, 1); const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const ramp = (t, at, len) => (len <= 0 ? (t >= at ? 1 : 0) : clamp((t - at) / len, 0, 1));

  const CSS = `
  #ov { position: absolute; inset: 0; pointer-events: none; font-family: -apple-system, 'Segoe UI', Inter, Roboto, sans-serif; color: #e6f4fb; }
  #ov .o { position: absolute; left: 50%; transform-origin: 50% 50%; will-change: transform, opacity; }
  #ov .hud { --c: rgba(95,227,255,.55); border: 2px solid rgba(95,227,255,.22); background:
    linear-gradient(var(--c),var(--c)) 0 0/26px 2px no-repeat, linear-gradient(var(--c),var(--c)) 0 0/2px 26px no-repeat,
    linear-gradient(var(--c),var(--c)) 100% 0/26px 2px no-repeat, linear-gradient(var(--c),var(--c)) 100% 0/2px 26px no-repeat,
    linear-gradient(var(--c),var(--c)) 0 100%/26px 2px no-repeat, linear-gradient(var(--c),var(--c)) 0 100%/2px 26px no-repeat,
    linear-gradient(var(--c),var(--c)) 100% 100%/26px 2px no-repeat, linear-gradient(var(--c),var(--c)) 100% 100%/2px 26px no-repeat,
    rgba(10,20,32,.62); box-shadow: 0 0 60px -20px rgba(95,227,255,.55); }
  #ov .lab { font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; letter-spacing: .28em; text-transform: uppercase; color: #8fa8ba; }
  #ov .title { padding: 34px 56px; text-align: center; white-space: nowrap; }
  #ov .title .t { font-size: 88px; font-weight: 700; letter-spacing: -.01em; }
  #ov .title .s { font-size: 30px; margin-top: 10px; }
  #ov .badge { padding: 20px 46px; font-size: 54px; font-weight: 800; letter-spacing: .22em; color: #5fe3ff; text-shadow: 0 0 24px rgba(95,227,255,.7); }
  #ov .engine { width: 640px; padding: 34px 40px; display: flex; align-items: center; gap: 34px; }
  #ov .engine svg { flex: none; }
  #ov .engine .t { font-size: 46px; font-weight: 700; }
  #ov .engine .s { font-size: 26px; margin-top: 8px; }
  #ov .bubble { max-width: 820px; padding: 30px 40px; font-size: 48px; line-height: 1.25; border-radius: 0; }
  #ov .bubble::after { content: ''; position: absolute; left: 90px; bottom: -28px; border: 14px solid transparent; border-top: 16px solid rgba(95,227,255,.4); }
  #ov .bubble .cur { display: inline-block; width: .5em; border-bottom: 4px solid #5fe3ff; margin-left: 4px; }
  #ov .mic { padding: 26px 40px; display: flex; align-items: center; gap: 28px; }
  #ov .mic .bars { display: flex; align-items: center; gap: 10px; height: 90px; }
  #ov .mic .bars i { display: block; width: 14px; background: #5fe3ff; box-shadow: 0 0 14px rgba(95,227,255,.8); }
  #ov .mic .t { font-size: 30px; white-space: nowrap; }
  #ov .choice { display: flex; gap: 40px; }
  #ov .choice .b { padding: 28px 54px; font-size: 50px; font-weight: 700; }
  #ov .choice .b.chosen { --c: #3fd68a; border-color: rgba(63,214,138,.75); background-color: rgba(63,214,138,.16); color: #c9f7de; box-shadow: 0 0 70px -14px #3fd68a; }
  #ov .sub { left: 50%; bottom: 3.5%; transform: translateX(-50%); max-width: 82%; text-align: center; font-size: 40px; line-height: 1.2; font-weight: 600;
    text-shadow: 0 2px 0 #000, 0 0 18px rgba(0,0,0,.9); padding: 10px 24px; background: rgba(3,6,12,.45); position: absolute; }
  `;

  // Above the face or between the face and the subtitles: never on the subtitles.
  const DEFAULT_Y = { title: 0.12, badge: 0.13, engine: 0.13, bubble: 0.13, mic: 0.13, choice: 0.80 };
  const MIC_SVG = '<svg width="70" height="90" viewBox="0 0 70 90" fill="none" stroke="#5fe3ff" stroke-width="5" stroke-linecap="round"><rect x="20" y="4" width="30" height="52" rx="15"/><path d="M8 42a27 27 0 0 0 54 0M35 69v17M20 86h30"/></svg>';
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function build(o) {
    const el = document.createElement('div');
    el.className = `o hud ${o.kind}`;
    if (o.kind === 'title') el.innerHTML = `<div class="t">${esc(o.text)}</div>${o.sub ? `<div class="s lab">${esc(o.sub)}</div>` : ''}`;
    else if (o.kind === 'badge') el.textContent = o.text ?? '';
    else if (o.kind === 'engine') {
      el.innerHTML = `<svg width="150" height="150" viewBox="0 0 150 150"><circle cx="75" cy="75" r="62" stroke="rgba(95,227,255,.18)" stroke-width="8" fill="none"/>`
        + `<circle class="ring" cx="75" cy="75" r="62" stroke="#5fe3ff" stroke-width="8" fill="none" stroke-linecap="round" stroke-dasharray="390" stroke-dashoffset="390" transform="rotate(-90 75 75)"/>`
        + `<rect x="47" y="47" width="56" height="56" fill="none" stroke="#5fe3ff" stroke-width="5"/><path class="tick" d="M52 78l15 15 30-34" stroke="#3fd68a" stroke-width="9" fill="none" stroke-linecap="round" stroke-dasharray="80" stroke-dashoffset="80"/></svg>`
        + `<div><div class="t">${esc(o.text)}</div>${o.sub ? `<div class="s lab">${esc(o.sub)}</div>` : ''}</div>`;
    } else if (o.kind === 'bubble') el.innerHTML = '<span class="txt"></span><span class="cur"></span>';
    else if (o.kind === 'mic') el.innerHTML = `${MIC_SVG}<div class="bars">${'<i></i>'.repeat(7)}</div>${o.text ? `<div class="t lab">${esc(o.text)}</div>` : ''}`;
    else if (o.kind === 'choice') {
      el.className = 'o choice';
      el.innerHTML = (o.options || ['Oui', 'Non']).slice(0, 3).map((x) => `<div class="b hud">${esc(x)}</div>`).join('');
    }
    return el;
  }

  window.FilmOverlays = {
    create(host, film, W, H) {
      const style = document.createElement('style');
      style.textContent = CSS;
      document.head.appendChild(style);
      const root = document.createElement('div');
      root.id = 'ov';
      host.appendChild(root);
      const items = (film.overlays || []).filter((o) => DEFAULT_Y[o.kind] !== undefined && o.end > o.at).map((o) => {
        const el = build(o);
        el.style.opacity = '0';
        root.appendChild(el);
        return { o, el, y: (o.y ?? DEFAULT_Y[o.kind]) * H };
      });
      const sub = film.subtitles ? Object.assign(document.createElement('div'), { className: 'sub' }) : null;
      if (sub) {
        sub.style.opacity = '0';
        // A vertical film for a phone app lifts its subtitles above the app's own buttons.
        if (typeof film.subtitlesBottom === 'number') sub.style.bottom = `${(film.subtitlesBottom * 100).toFixed(1)}%`;
        root.appendChild(sub);
      }
      return { items, sub, lines: film.lines || [] };
    },

    /** Draws every overlay for time t; `level` is the voice loudness (0..1) for the mic. */
    draw(state, t, level) {
      for (const { o, el, y } of state.items) {
        const inP = ramp(t, o.at, 0.45);
        const outP = ramp(t, o.end - 0.35, 0.35);
        const vis = inP * (1 - smooth(outP));
        if (vis <= 0.001) { el.style.opacity = '0'; continue; }
        const pop = o.kind === 'badge' ? back(inP) : smooth(inP);
        const scale = o.kind === 'badge' ? 0.6 + 0.4 * pop : 0.94 + 0.06 * pop;
        const lift = (1 - smooth(inP)) * 40 + smooth(outP) * -20;
        el.style.opacity = vis.toFixed(3);
        el.style.top = `${y}px`;
        el.style.transform = `translate(-50%, calc(-50% + ${lift.toFixed(1)}px)) scale(${scale.toFixed(4)})`;
        const local = t - o.at;
        if (o.kind === 'engine') {
          const ring = clamp(local / 1.6, 0, 1);
          el.querySelector('.ring').setAttribute('stroke-dashoffset', String(390 * (1 - smooth(ring))));
          el.querySelector('.tick').setAttribute('stroke-dashoffset', String(80 * (1 - smooth(ramp(local, 1.6, 0.4)))));
        } else if (o.kind === 'bubble') {
          const text = String(o.text ?? '');
          const n = Math.round(text.length * clamp(local / Math.min(1.6, text.length * 0.04 + 0.2), 0, 1));
          el.querySelector('.txt').textContent = text.slice(0, n);
          el.querySelector('.cur').style.opacity = n < text.length || Math.floor(local * 2) % 2 === 0 ? '1' : '0';
        } else if (o.kind === 'mic') {
          const bars = el.querySelectorAll('.bars i');
          bars.forEach((b, i) => {
            const wobble = 0.55 + 0.45 * Math.abs(Math.sin(t * 9 + i * 1.3));
            b.style.height = `${Math.round(10 + 80 * clamp(level * 1.6, 0, 1) * wobble)}px`;
          });
        } else if (o.kind === 'choice' && typeof o.pickAt === 'number') {
          const bs = el.querySelectorAll('.b');
          bs.forEach((b, i) => b.classList.toggle('chosen', i === 0 && t >= o.pickAt));
        }
      }
      if (state.sub) {
        const line = state.lines.find((l) => t >= l.at && t < l.end);
        if (line) {
          const vis = smooth(ramp(t, line.at, 0.15)) * (1 - smooth(ramp(t, line.end - 0.15, 0.15)));
          state.sub.textContent = line.text;
          state.sub.style.opacity = vis.toFixed(3);
        } else state.sub.style.opacity = '0';
      }
    },
  };
})();
