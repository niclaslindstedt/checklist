// Small pure string helpers over item/title text. Lives in `domain/` so it
// stays DOM- and I/O-free and is trivially unit-testable.

// Uppercase the first character of `text`, leaving the rest exactly as typed.
// Operates on the first Unicode code point (so a leading astral character —
// an emoji — isn't split), and is a no-op on an empty string or a first
// character with no uppercase form. Used by the "Capitalise items" setting to
// turn a freshly typed "buy milk" into "Buy milk" without touching the tail
// (so an intentional "iPad" further along the title survives).
export function capitalizeFirst(text: string): string {
  const chars = Array.from(text);
  const [first] = chars;
  if (!first) return text;
  return first.toLocaleUpperCase() + chars.slice(1).join("");
}
