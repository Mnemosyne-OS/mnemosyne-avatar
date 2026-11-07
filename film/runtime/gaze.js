/**
 * gaze.js — where a face looks (avatar-film), so its eyes do not stare.
 *
 * film.json `look[]`, each { at, x, y?, sway?, shape? }:
 *   x, y    the aim from `at` on, -1..1, as the face animator reads its look
 *           (x < 0 is the side read as "her left" on the played film of 2026-11-02).
 *           Check the direction on the played file, never on a still.
 *   sway    how much of the small drift rides on the aim (1 by default)
 *   shape   the face it is for; none = every face
 * An aim holds until the next key, which it reaches in MOVE seconds.
 *
 * While she speaks the animator parks the eyes at the centre: steer() pulls
 * them back toward the aim after each step and still lets a scripted move
 * shift them.
 *
 * Generalised from the first Mnemosyne OS film where the avatar hosts a video.
 */
(() => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  /** Seconds a change of aim takes. */
  const MOVE = 0.4;

  /** The keys for one face, sorted once. */
  function keysFor(look, shape) {
    if (!Array.isArray(look)) return [];
    return look.filter((k) => Number.isFinite(k.at) && (!k.shape || k.shape === shape)).slice().sort((a, b) => a.at - b.at);
  }

  /** The aim at time t, or null when the film sets none (the eyes stay as the animator puts them). */
  function lookAim(keys, t) {
    if (!keys.length) return null;
    let i = -1;
    while (i + 1 < keys.length && t >= keys[i + 1].at) i++;
    const cur = keys[Math.max(0, i)];
    const prev = i > 0 ? keys[i - 1] : cur;
    const u = i <= 0 ? 1 : smooth((t - cur.at) / MOVE);
    const sway = lerp(prev.sway ?? 1, cur.sway ?? 1, u) * (0.06 * Math.sin(t * 1.15) + 0.035 * Math.sin(t * 2.4));
    return {
      x: clamp(lerp(prev.x ?? 0, cur.x ?? 0, u) + sway, -1, 1),
      y: clamp(lerp(prev.y ?? 0, cur.y ?? 0, u) + 0.02 * Math.sin(t * 0.6), -1, 1),
    };
  }

  /** Bias an animator frame toward the aim: most of it on the eyes, a smaller share on the head. */
  function steer(frame, aim) {
    if (!aim || !frame || !frame.look || !frame.head) return;
    frame.look.x = clamp(frame.look.x * 0.4 + aim.x, -1, 1);
    frame.head.yaw = clamp((frame.head.yaw || 0) * 0.45 + aim.x * 0.3, -0.45, 0.45);
  }

  window.FilmGaze = { keysFor, lookAim, steer, MOVE };
})();
