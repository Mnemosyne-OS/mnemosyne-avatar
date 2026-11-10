/**
 * scene.js — the one film scene (avatar-film): film.json shots → particle
 * layers, one face animator per face, voice-driven mouth from voice.json,
 * scripted moves, and a brain → face hand-off. Frame by frame through
 * `window.__filmSeek(t)`; `?preview` plays it live in a browser.
 *
 * Generalised from the first films made with it. Options a film may set in film.json:
 *   gestures (false)   idle gestures (yawn, laugh…) between scripted moves
 *   allowMoves         the moves a film may express (default: DEFAULT_ALLOWED)
 *   blockMoves         moves never expressed, even when scripted
 *   trueColor, arcs    passed to the particle scene
 *   overlays, subtitles motion design above the avatar (runtime/overlays.js)
 *   look               where a face looks, so its eyes do not stare (runtime/gaze.js)
 *   still              [{ at, end, shape? }]: the face is frozen (no blink, gaze or breath), only the mouth speaks
 *
 * Reads film.json (and voice.json when present) from the film folder; the
 * engine is `Face`, bundled from the avatar package's source.
 */
(async () => {
  const q = new URLSearchParams(location.search);
  const FPS = Number(q.get('fps') || 30);
  // A host that is not a web server (the Mnemosyne OS app renders in a hidden
  // window, doc 205) hands the film over through `window.FilmData`; the CLI's
  // page server is fetched as before.
  const handed = typeof window.FilmData === 'function' ? await window.FilmData() : null;
  const film = handed?.film ?? await (await fetch('film.json')).json();
  const voice = handed ? (handed.voice ?? null) : await fetch('voice.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const W = film.width || 1920, H = film.height || 1080;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const easeInOut = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const ramp = (t, at, len, ease = smooth) => (len <= 0 ? (t >= at ? 1 : 0) : ease(clamp((t - at) / len, 0, 1)));

  // Emotion yes, idle gag no: the moves that read well on a film, while she speaks and between sentences.
  const DEFAULT_ALLOWED = [
    'nod', 'emphasis', 'browRaiseOne', 'browRaise', 'glance', 'curious', 'listen', 'lookAround', 'squint', 'smirk', 'smile', 'wink', 'tender',
    'ideaComes', 'surprise', 'joy', 'amused', 'sigh', 'ponder', 'relief', 'skeptical', 'awe', 'shyGlance',
    'lookUpLeft', 'lookUpRight', 'thinkUpLeft', 'thinkUpRight',
  ];
  const ALLOWED = new Set(Array.isArray(film.allowMoves) ? film.allowMoves : DEFAULT_ALLOWED);
  const BLOCKED = new Set(Array.isArray(film.blockMoves) ? film.blockMoves : ['yawn', 'yawnLong', 'bored', 'daydream']);
  const GESTURES = film.gestures === true;
  // A frozen face: the animator's reduced-motion switch, so the mouth still follows the voice.
  const STILL = Array.isArray(film.still) ? film.still : [];
  const stillAt = (shape, t) => STILL.some((w) => t >= w.at && t < w.end && (!w.shape || w.shape === shape));

  const host = document.getElementById('faces');
  const overlays = window.FilmOverlays ? window.FilmOverlays.create(document.getElementById('stage'), film, W, H) : null;
  const PORTRAITS = new Set(Face.PORTRAIT_SHAPES || ['woman']);
  const needed = new Set();
  for (const shot of film.shots) if (PORTRAITS.has(shot.shape)) needed.add(shot.shape);
  await Promise.all([...needed].map((s) => Face.loadPortraitMap(s)));

  const moves = (film.moves || [])
    .filter((m) => ALLOWED.has(m.id) && !BLOCKED.has(m.id))
    .slice()
    .sort((a, b) => a.at - b.at);

  // A robot is drawn in code, not from a photo: the woman's frame and rig with the robot's own figure.
  const ROBOTS = new Set(Face.ROBOT_IDS || []);
  const portraitFor = (shape) => (ROBOTS.has(shape) ? Face.robotFigure(shape) : shape === 'woman' && Face.WOMAN ? Face.WOMAN : undefined);

  function createLayer(shape) {
    const wrap = document.createElement('div');
    wrap.className = 'faceLayer';
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    wrap.appendChild(canvas);
    host.appendChild(wrap);
    const drawn = ROBOTS.has(shape) ? 'woman' : shape;
    const scene = Face.createBrainScene(canvas, {
      shape: drawn,
      portrait: portraitFor(shape),
      pickTier: () => (q.get('tier') || 'full'),
      colors: film.colors,
      motion: true,
      width: W,
      height: H,
      pixelRatio: 1,
      trueColor: film.trueColor === true,
      arcs: film.arcs === true,
    });
    if (!scene) throw new Error(`no WebGL for shape ${shape}`);
    const rng = Face.createRng((film.seed ?? 11) + shape.length * 17);
    const views = shape === 'brain' ? { front: { ry: 0, rx: 0.08, cam: 5.2 } } : Face.SHAPE_VIEWS[drawn];
    if (!views) throw new Error(`unknown shape ${shape}`);
    const face = views.face;
    const animator = face
      ? Face.createFaceAnimator(() => rng.rand(), {
          ears: face.ears === true,
          ...(face.species ? { species: face.species } : {}),
          ...(face.earRange ? { earRange: face.earRange } : {}),
        })
      : null;
    const lookKeys = window.FilmGaze ? window.FilmGaze.keysFor(film.look, shape) : [];
    return { shape, wrap, canvas, scene, rng, animator, views, lookKeys, faceT: 0, nextMove: 0, lastFrame: null, bornAt: 0 };
  }

  const slotA = { layer: null };
  const slotB = { layer: null };
  let currentShape = null;
  let prevShape = null;
  let morphAt = -1;
  let seekCursor = 0;

  function disposeSlot(slot) {
    if (!slot.layer) return;
    try { slot.layer.scene.dispose(); } catch (err) { console.warn('dispose', err); }
    slot.layer.wrap.remove();
    slot.layer = null;
  }

  // An implode ending: every point pulled into one ball of light that goes out (lib/render.mjs implodeDur).
  const implodeAt = (t) => film.ending?.kind === 'implode'
    ? clamp((t - film.ending.at) / (Number(film.ending.dur) > 0 ? Number(film.ending.dur) : 1.8), 0, 1)
    : 0;

  const shotAt = (t) => {
    let cur = film.shots[0];
    for (const s of film.shots) if (t >= s.at) cur = s;
    return cur;
  };
  const shotStart = (shape) => film.shots.find((x) => x.shape === shape)?.at ?? 0;

  function ensureShape(shape, t, slot) {
    if (slot.layer && slot.layer.shape === shape) return slot.layer;
    disposeSlot(slot);
    const layer = createLayer(shape);
    const FORM = Face.FORM_SECONDS || 1.8;
    // A face gathers from its shot's start; joined later (a seek), it is already formed.
    // A shot marked `formed` cuts from face to face: it arrives whole, eyes open, where gathering
    // again at every cut reads as a dead reload.
    const gatherAt = shotStart(shape);
    const arrivesFormed = shotAt(t)?.shape === shape && shotAt(t)?.formed === true;
    // Formed is formed even on the film's first frame: born FORM ago, so a cold open on a face shows it whole.
    layer.bornAt = shape === 'brain' ? 0 : arrivesFormed ? t - FORM : (t < gatherAt + FORM + 0.05 ? gatherAt : Math.max(0, t - FORM));
    layer.faceT = t;
    layer.nextMove = 0;
    while (layer.nextMove < moves.length && moves[layer.nextMove].at < t - 1e-6) layer.nextMove++;
    // film.wake === false: she is awake as she forms (eyes open, no lid flutter).
    if (layer.animator && film.wake !== false) layer.animator.wake(!arrivesFormed && t <= gatherAt + 0.05 ? FORM : 0.02);
    slot.layer = layer;
    return layer;
  }

  function rebuildFrom(fromT) {
    disposeSlot(slotA);
    disposeSlot(slotB);
    prevShape = null;
    morphAt = -1;
    seekCursor = fromT;
    const shot = shotAt(fromT);
    ensureShape(shot.shape, fromT, slotA);
    currentShape = shot.shape;
  }

  const spectrum = new Uint8Array(128);
  let voiceBytes = null;
  if (voice && voice.spectrum) {
    const bin = atob(voice.spectrum);
    voiceBytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) voiceBytes[i] = bin.charCodeAt(i);
  }
  const voiceAt = (t) => {
    if (!voice) return { level: 0, bins: null };
    const i = clamp(Math.round(t * voice.fps), 0, voice.frames - 1);
    const level = voice.level[i] ?? 0;
    if (!voiceBytes || level <= 0) return { level, bins: null };
    spectrum.set(voiceBytes.subarray(i * 128, i * 128 + 128));
    return { level, bins: spectrum };
  };
  const lineAt = (t) => (film.lines || []).find((l) => t >= l.at && t < l.end) ?? null;

  function formFor(layer, t, shot) {
    const FORM = Face.FORM_SECONDS || 1.8;
    let form = ramp(t - layer.bornAt, 0, FORM, Face.easeOutCubic);
    const fadeOut = shot.fadeOut ?? 0.28;
    if (fadeOut > 0 && layer.shape === 'brain' && t > shot.until - fadeOut) {
      form *= 1 - ramp(t, shot.until - fadeOut, fadeOut, easeInOut);
    }
    return clamp(form, 0, 1);
  }

  function brainAct(t) {
    if (t < 1.6) return [0, 0, 0, 0, 0];
    const lit = Math.floor((t - 1.6) / 0.65) % 5;
    const pulse = Math.max(0, Math.sin(((t - 1.6) / 0.65) * Math.PI));
    const all = ramp(t, 3.2, 0.9) * 0.55;
    const a = [all, all, all, all, all];
    a[lit] = Math.max(a[lit], 0.45 + 0.5 * pulse);
    return a;
  }

  function brainView(t, front) {
    const tumble = Math.min(t, 4.2);
    return {
      ry: front.ry + tumble * 0.52 + 0.28 * Math.sin(tumble * 0.85),
      rx: front.rx + 0.06 * Math.sin(tumble * 0.5),
      cam: lerp(5.5, 5.2, ramp(t, 0, 2)),
    };
  }

  function stepLayer(layer, target, speaking) {
    if (!layer.animator) { layer.faceT = target; return; }
    const dt = 1 / FPS;
    while (layer.faceT < target - 1e-6) {
      layer.faceT += dt;
      while (layer.nextMove < moves.length && moves[layer.nextMove].at <= layer.faceT) {
        const m = moves[layer.nextMove++];
        if ((!m.shape || m.shape === layer.shape) && Face.isMoveId(m.id)) {
          try { layer.animator.express(m.id); } catch (err) { console.warn('express', m.id, err); }
        }
      }
      const v = speaking ? voiceAt(layer.faceT) : { level: 0, bins: null };
      const l = speaking ? lineAt(layer.faceT) : null;
      const still = stillAt(layer.shape, layer.faceT);
      const aim = !still && layer.lookKeys.length ? window.FilmGaze.lookAim(layer.lookKeys, layer.faceT) : null;
      layer.lastFrame = layer.animator.step(dt, {
        voice: v.level,
        spectrum: v.bins,
        lookGoal: aim ?? { x: 0, y: 0 },
        motion: !still,
        gestures: GESTURES,
        gaze: true,
        sentence: l ? { text: l.text, at: l.at } : null,
      });
      if (aim) window.FilmGaze.steer(layer.lastFrame, aim);
    }
  }

  function drawLayer(layer, t, opacity, shot, speaking) {
    if (!layer) return;
    layer.wrap.style.opacity = opacity.toFixed(3);
    if (opacity < 0.01) return;
    stepLayer(layer, t, speaking);
    const front = layer.views.front;
    const view = layer.shape === 'brain' ? brainView(t, front) : { ry: front.ry, rx: front.rx, cam: front.cam };
    const act = layer.shape === 'brain' ? brainAct(t) : [0, 0, 0, 0, 0];
    layer.scene.render({
      ry: view.ry,
      rx: view.rx,
      cam: view.cam,
      act,
      form: formFor(layer, t, shot),
      all: layer.shape === 'brain' ? Math.max(Face.AMBIENT_ALL, act.reduce((m, x) => Math.max(m, x), 0) * 0.35) : Face.AMBIENT_ALL,
      face: layer.lastFrame ?? undefined,
      implode: implodeAt(t),
    }, t);
  }

  window.__filmSeek = async (t) => {
    // Forward only: a step back rebuilds the layers from t.
    if (t + 1e-4 < seekCursor) rebuildFrom(t);
    seekCursor = t;

    const shot = shotAt(t);
    if (shot.shape !== currentShape) {
      morphAt = t;
      if (slotA.layer) {
        disposeSlot(slotB);
        slotB.layer = slotA.layer;
        slotA.layer = null;
      }
      ensureShape(shot.shape, t, slotA);
      currentShape = shot.shape;
      prevShape = slotB.layer ? slotB.layer.shape : null;
    } else if (!slotA.layer) {
      ensureShape(shot.shape, Math.max(0, shot.at), slotA);
      currentShape = shot.shape;
    }

    const fade = shot.fadeIn ?? 0.28;
    let inOp = 1, outOp = 0;
    if (prevShape && morphAt >= 0 && t - morphAt < fade) {
      const u = easeInOut((t - morphAt) / fade);
      inOp = clamp(0.35 + 0.65 * u, 0, 1);
      outOp = clamp(1 - 0.55 * u, 0, 1);
    } else if (prevShape && morphAt >= 0) {
      disposeSlot(slotB);
      prevShape = null;
    }

    const line = lineAt(t);
    const speakingShape = line?.shape || (slotA.layer?.animator ? shot.shape : null);
    drawLayer(slotA.layer, t, inOp, shot, speakingShape === slotA.layer?.shape);
    if (slotB.layer) {
      drawLayer(slotB.layer, t, outOp, { ...shot, shape: slotB.layer.shape, until: morphAt + fade, fadeOut: fade }, false);
    }
    if (overlays) window.FilmOverlays.draw(overlays, t, voiceAt(t).level);
    return slotA.layer ? slotA.layer.faceT : t;
  };

  window.filmInfo = { tier: 'pending', total: film.total, shapes: [...needed], moves: moves.map((m) => m.id) };

  ensureShape(film.shots[0].shape, 0, slotA);
  currentShape = film.shots[0].shape;
  seekCursor = 0;
  window.filmInfo.tier = slotA.layer.scene.tier;
  window.filmInfo.gpu = slotA.layer.scene.gpu;
  window.sceneReady = true;

  if (q.has('preview')) {
    let t0 = performance.now();
    const tick = (now) => {
      let t = (now - t0) / 1000;
      if (t >= film.total) { t = 0; t0 = now; rebuildFrom(0); }
      window.__filmSeek(t);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
})().catch((e) => { window.sceneError = String((e && e.stack) || e); });
