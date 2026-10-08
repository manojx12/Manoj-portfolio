/**
 * The seven sheets of the drawing set. Story time `s` runs 0 → CHAPTERS.length;
 * chapter i spans [i, i+1). `len` is the chapter's scroll length in viewport heights.
 *
 * Every chapter's DOM panel is `position: sticky` for the first (len − 1) viewports of its section,
 * so the copy band, the camera hold and the character's station are all derived here from the same
 * numbers. Change a `len` and copy, camera and figure stay in sync.
 */

export interface Chapter {
  id: string;
  name: string;
  level: string;
}

export const CHAPTERS = [
  { id: 'site', name: 'Site', level: '+00.00', len: 1.6 },
  { id: 'lobby', name: 'Lobby', level: '+00.00', len: 2 },
  { id: 'foundations', name: 'Foundations', level: '+04.00', len: 2 },
  { id: 'engine-room', name: 'Engine room', level: '+08.00', len: 2.2 },
  { id: 'studio', name: 'Studio', level: '+12.00', len: 5.4 },
  { id: 'lab', name: 'Lab', level: '+16.00', len: 2 },
  { id: 'roof', name: 'Roof', level: '+20.00', len: 2.8 },
] as const;

export const LAST = CHAPTERS.length - 1;
export const STUDIO = 4;
export const PROJECT_COUNT = 4;

type Range = [number, number];

/** Fraction of chapter i during which its panel is pinned (the last chapter pins to the end). */
function pinned(i: number): number {
  if (i === LAST) return 1;
  const L = CHAPTERS[i].len;
  return (L - 1) / L;
}

/** Story-time range in which chapter i's copy is revealed. */
export function copyBand(i: number): Range {
  const L = CHAPTERS[i].len;
  if (i === 0) return [-1, pinned(0) - 0.08];
  if (i === LAST) return [i + 0.04, i + 1.5];
  return [i + 0.1 / L, i + pinned(i) - 0.06 / L];
}

/** Story-time range in which the camera and the figure rest for chapter i. */
export function holdOf(i: number): Range {
  if (i === 0) return [0, 0.015];
  if (i === LAST) return [i + 0.1, i + 0.42];
  const L = CHAPTERS[i].len;
  return [i + 0.28 / L, i + pinned(i)];
}

/** The closing night establishing shot. */
export const END_HOLD: Range = [LAST + 0.88, LAST + 1];

export function projectBand(j: number): Range {
  const a = STUDIO + 0.05;
  const b = STUDIO + pinned(STUDIO) - 0.01;
  const w = (b - a) / PROJECT_COUNT;
  return [a + j * w, a + (j + 1) * w];
}

export function projectHold(j: number): Range {
  const [a, b] = projectBand(j);
  const w = b - a;
  return [a + w * 0.24, b - w * 0.1];
}
