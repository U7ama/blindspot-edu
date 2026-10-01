export type WordHighlight = { charIndex: number; charLength: number };

/** Estimated highlights until the browser supplies real speech boundaries. */
export function createReadAlong(text: string, highlight: (word: WordHighlight) => void) {
  const tokens = Array.from(text.matchAll(/[\p{L}\p{N}'’_-]+/gu), match => ({
    charIndex: match.index!, charLength: match[0].length,
  }));
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }
  function advance(index: number) {
    timer = null;
    if (stopped || index >= tokens.length) return;
    const word = tokens[index];
    highlight(word);
    const punctuation = text[word.charIndex + word.charLength];
    const pause = /[.!?]/.test(punctuation || " ") ? 250 : /[,;:]/.test(punctuation || " ") ? 130 : 0;
    const duration = Math.max(260, Math.min(520, 260 + (word.charLength - 3) * 25)) + pause;
    // Finishing the estimate must never stop actual speech.
    if (index + 1 < tokens.length) timer = setTimeout(() => advance(index + 1), duration);
  }
  advance(0);
  return {
    boundary(event: { charIndex: number; charLength?: number; name?: string }) {
      if (stopped || (event.name && event.name !== "word")) return;
      // Once real boundaries arrive, they alone control highlighting.
      clearTimer();
      let index = event.charIndex;
      while (index < text.length && /\s/.test(text[index])) index++;
      if (index < 0 || index >= text.length) return;
      const word = text.slice(index).match(/^[\p{L}\p{N}'’_-]+/u);
      highlight({ charIndex: index, charLength: word?.[0].length || event.charLength || 1 });
    },
    stop() {
      stopped = true;
      clearTimer();
    },
  };
}
