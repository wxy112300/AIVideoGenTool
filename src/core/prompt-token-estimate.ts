/** Editor-only heuristic, not an exact tokenizer, context limit or output budget. */
export function estimatePromptTextTokens(text: string): number {
  let tokens = 0;
  let run = 0;
  const flush = () => { tokens += Math.ceil(run / 4); run = 0; };
  for (const character of text.trim()) {
    if (/\s/u.test(character)) { flush(); continue; }
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(character)) {
      flush(); tokens += 1;
    } else if (/[\p{Letter}\p{Number}]/u.test(character)) run += 1;
    else { flush(); tokens += 1; }
  }
  flush();
  return tokens;
}
