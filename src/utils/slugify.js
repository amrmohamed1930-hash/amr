/**
 * Arabic-aware slug generator.
 * Keeps Arabic letters/digits, strips diacritics and punctuation,
 * lowercases latin, and collapses whitespace to single dashes.
 */
const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const TATWEEL = /\u0640/g;

export const slugify = (input) =>
  String(input ?? '')
    .replace(ARABIC_DIACRITICS, '')
    .replace(TATWEEL, '')
    .trim()
    .toLowerCase()
    .replace(/[آأإ]/g, 'ا') // آ أ إ -> ا
    .replace(/ى/g, 'ي') // ى -> ي
    .replace(/ة/g, 'ه') // ة -> ه
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);

/**
 * Appends -2, -3, ... until `exists(slug)` returns false.
 * Keeps slugs unique without failing on collision.
 */
export const uniqueSlug = async (base, exists) => {
  const root = slugify(base) || 'item';
  let candidate = root;
  let n = 1;
  while (await exists(candidate)) {
    n += 1;
    candidate = `${root}-${n}`;
  }
  return candidate;
};
