/**
 * speechTone — what a spoken sentence says with the face (doc 180 §24): a
 * question lifts the brows, an exclamation opens the eyes, thanks and good
 * news smile, an apology saddens the brows, a doubt looks up and aside, a
 * warning frowns. The voice keeps the jaw and the lips (faceAnimator): a tone
 * moves only the brows, the eyes, the cheeks, the corners of the mouth and the
 * head.
 *
 * Read from the sentence's punctuation and a few words, in the app's seven
 * languages. A sentence with nothing to read gets a quiet variation, so a long
 * answer never wears one face from start to end.
 *
 * @module avatar/speechTone
 */
import type { Gesture } from './faceGesture';

export type Tone = 'question' | 'exclaim' | 'happy' | 'sorry' | 'doubt' | 'warn' | 'plain';

/**
 * Whole words (no letter before or after them, so « supermarché » is not « super »), in six
 * languages; Chinese, written without spaces, as plain characters.
 */
const words = (list: string[], cjk: string[] = [], extra = ''): RegExp =>
  new RegExp(`(?<!\\p{L})(?:${list.join('|')})(?!\\p{L})${cjk.length ? `|${cjk.join('|')}` : ''}${extra}`, 'iu');
const WORDS: Record<Exclude<Tone, 'question' | 'exclaim' | 'plain'>, RegExp> = {
  happy: words(['merci', 'super', 'génial(e|s)?', 'parfait(e|s)?', 'bravo', 'excellent(e|s)?', 'ravie?', 'contente?', 'heureux', 'heureuse', 'cool', 'thanks', 'thank you', 'great', 'perfect', 'awesome', 'glad', 'happy', 'gracias', 'genial', 'perfecto', 'danke', 'toll', 'obrigad[oa]', 'ótimo', 'спасибо', 'отлично', 'haha'], ['谢谢', '太好'], '|😊|🙂|:\\)'),
  sorry: words(['désolée?', 'malheureusement', 'hélas', 'dommage', 'pardon', 'triste', 'sorry', 'unfortunately', 'sadly', 'lo siento', 'lamentablemente', 'leider', 'entschuldigung', 'infelizmente', 'desculp[ea]', 'к сожалению', 'извините', 'извини'], ['抱歉', '遗憾', '可惜']),
  doubt: words(['peut-être', 'je pense', 'je crois', 'il semble', 'probablement', 'sans doute', 'hmm+', 'maybe', 'perhaps', 'i think', 'i guess', 'probably', 'it seems', 'quizás', 'tal vez', 'creo que', 'vielleicht', 'ich glaube', 'talvez', 'acho que', 'возможно', 'наверное'], ['也许', '可能'], '|…|\\.\\.\\.'),
  warn: words(['attention', 'important(e|s)?', 'jamais', 'danger', 'prudence', 'interdit(e|s)?', 'warning', 'careful', 'never', 'must not', 'cuidado', 'nunca', 'achtung', 'vorsicht', 'niemals', 'осторожно', 'никогда'], ['注意', '小心', '绝不']),
};

/** A sentence's tone: its punctuation first (a question stays a question), then its words. */
export function toneOf(text: string): Tone {
  const s = text.trim();
  if (/[?？]\s*["»”']?$/.test(s)) return 'question';
  if (WORDS.sorry.test(s)) return 'sorry';
  if (WORDS.warn.test(s)) return 'warn';
  if (WORDS.happy.test(s)) return 'happy';
  if (WORDS.doubt.test(s)) return 'doubt';
  if (/[!！]\s*["»”']?$/.test(s)) return 'exclaim';
  return 'plain';
}

type Random = () => number;
const pick = (rnd: Random, lo: number, hi: number) => lo + (hi - lo) * rnd();

/**
 * The expression a sentence plays while it is spoken: never the jaw or the lips
 * (the voice's), held a little shorter than a sentence, then let go.
 */
export function speechExpression(text: string, rnd: Random): Gesture | null {
  const s = rnd() < 0.5 ? 1 : -1;
  const hold = pick(rnd, 1, 2);
  switch (toneOf(text)) {
    case 'question':
      return { weights: { browUpL: pick(rnd, 0.5, 0.8), browUpR: pick(rnd, 0.4, 0.75), headTilt: 0.35 * s }, rise: 0.3, hold, fall: 0.6 };
    case 'exclaim':
      return { weights: { browUpL: 0.75, browUpR: 0.75, cheekRaise: 0.2 }, rise: 0.2, hold: hold * 0.8, fall: 0.5 };
    case 'happy':
      return { weights: { smileL: pick(rnd, 0.55, 0.8), smileR: pick(rnd, 0.5, 0.75), cheekRaise: 0.4 }, squint: { left: 0.4, right: 0.4, lag: 0.04 }, rise: 0.35, hold, fall: 0.8 };
    case 'sorry':
      return { weights: { browInnerUp: pick(rnd, 0.55, 0.8), mouthFrown: 0.3, headTilt: 0.2 * s }, rise: 0.5, hold, fall: 0.8 };
    case 'doubt':
      return { weights: { browUpL: s > 0 ? 0.5 : 0.1, browUpR: s > 0 ? 0.1 : 0.5, browFrown: 0.15 }, look: { x: 0.45 * s, y: 0.4 }, head: { yaw: 0.25 * s, pitch: 0.2 }, rise: 0.4, hold, fall: 0.7 };
    case 'warn':
      return { weights: { browFrown: pick(rnd, 0.5, 0.75) }, squint: { left: 0.25, right: 0.25, lag: 0 }, head: { yaw: 0, pitch: -0.3 }, rise: 0.3, hold, fall: 0.6 };
    default: {
      // Nothing to read: a quiet variation, now and then, so the face keeps living.
      const r = rnd();
      if (r < 0.35) return null;
      if (r < 0.6) return { weights: { browUpL: 0.3, browUpR: 0.3 }, rise: 0.25, hold: 0.4, fall: 0.4 };
      if (r < 0.8) return { weights: { headTilt: 0.3 * s }, head: { yaw: 0, pitch: -0.25 }, rise: 0.4, hold: 0.6, fall: 0.6 };
      return { weights: { smileL: 0.3, smileR: 0.25 }, rise: 0.4, hold: 0.8, fall: 0.6 };
    }
  }
}
