/**
 * speechTone.test.ts — a sentence's tone on the face (doc 180 §24): punctuation
 * first, then a few words, in the app's languages; never the jaw or the lips.
 */
import { describe, it, expect } from 'vitest';
import { speechExpression, toneOf } from './speechTone';

describe('toneOf', () => {
  it('reads a question by its mark, whatever the words', () => {
    expect(toneOf('Tu veux que je le fasse ?')).toBe('question');
    expect(toneOf('Do you want it now?')).toBe('question');
    expect(toneOf('你好吗？')).toBe('question');
  });
  it('reads thanks, an apology, a doubt, a warning, in several languages', () => {
    expect(toneOf('Merci beaucoup, c’est parfait.')).toBe('happy');
    expect(toneOf('Спасибо, это отлично.')).toBe('happy');
    expect(toneOf('Désolée, je ne trouve pas ce fichier.')).toBe('sorry');
    expect(toneOf('К сожалению, файл не найден.')).toBe('sorry');
    expect(toneOf('Peut-être que demain ce sera mieux.')).toBe('doubt');
    expect(toneOf('Hmm… let me see.')).toBe('doubt');
    expect(toneOf('Attention, ne supprime jamais ce dossier.')).toBe('warn');
    expect(toneOf('C’est fait !')).toBe('exclaim');
    expect(toneOf('Le fichier est dans le dossier Documents.')).toBe('plain');
  });
  it('a word inside another word is not that word', () => {
    expect(toneOf('Supermarché ouvert jusqu’à vingt heures.')).toBe('plain');
    expect(toneOf('Le contentieux est clos.')).toBe('plain');
    expect(toneOf('谢谢你的帮助。')).toBe('happy');
  });
});

describe('speechExpression', () => {
  const rnd = () => 0.7;
  it('never moves the jaw or the lips: the voice owns them', () => {
    for (const text of ['Une question ?', 'Merci !', 'Désolé.', 'Peut-être.', 'Attention.', 'Bien.', 'Super !']) {
      const g = speechExpression(text, rnd);
      if (!g) continue;
      for (const k of ['jawOpen', 'lipsWide', 'lipsRound', 'lipPress']) expect(g.weights[k as keyof typeof g.weights], `${text} ${k}`).toBeUndefined();
      expect(g.mouth).toBeUndefined();
    }
  });
  it('a question lifts the brows, thanks smile, an apology saddens the brows', () => {
    expect(speechExpression('Ça te va ?', rnd)!.weights.browUpL).toBeGreaterThan(0.3);
    expect(speechExpression('Merci !', rnd)!.weights.smileL).toBeGreaterThan(0.4);
    expect(speechExpression('Désolée.', rnd)!.weights.browInnerUp).toBeGreaterThan(0.4);
  });
});
