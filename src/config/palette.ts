/**
 * World colours. Mirrors the CSS tokens in src/styles/main.css (--paper, --ink, --ultra …)
 * so the 3D model and the DOM read as one drawing.
 */
export const PALETTE = {
  paper: 0xece6da,
  paperDeep: 0xdcd3c2,
  card: 0xf3efe7, // brightest white-card surfaces
  cardWarm: 0xe7dfd0,
  cardShade: 0xd3c9b6,
  ink: 0x16181d,
  graphite: 0x5c616c,
  ultra: 0x2d3bff,
  ultraSoft: 0x9aa2ff,
  navy: 0x1d2350,
  night: 0x0e1120,
  lamp: 0xffd7a1,
  /** Head and hands of the scale figure: unpainted card, as on a real maquette figure. */
  skin: 0xf1ebe0,
} as const;
