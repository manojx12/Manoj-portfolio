# Manoj — Section A–A

An interactive portfolio you walk through: a cut-away architectural model of the full stack, from the foundations to the roof. Manoj is the scale figure every model needs. Scroll, and he takes the lift up through his work while the day turns to night.

- **3D:** procedural three.js (no downloaded models), one render loop, 49–102 draw calls, 60 fps on an Intel HD 620.
- **Content:** semantic HTML (crawlable, works without JS or WebGL), with a persistent "Plain view" toggle.
- **Runtime dependencies:** `three`.

## Run

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run build
```

Add `?debug` to the URL for the performance HUD, and `?quality=ultra|high|medium|low|mobile-high|mobile-medium|mobile-low` to pin a tier.

## Before publishing

Search for `data-todo` in `index.html` and replace the placeholder links (project repositories, GitHub, LinkedIn). Review the project descriptions, set an absolute `og:image` URL, and add a canonical link once the domain is known.

## Documents

| # | Document | Covers |
|---|---|---|
| 01 | [Reference observation](docs/01_REFERENCE_OBSERVATION.md) | what the reference feels like, stage by stage |
| 02 | [Reference reverse engineering](docs/02_REFERENCE_REVERSE_ENGINEERING.md) | evidence vs. inference; principles taken and left |
| 03 | [Creative direction](docs/03_MANOJ_CREATIVE_DIRECTION.md) | 5 concepts, scoring, selection; visual language, type, cursor |
| 04 | [Experience spec](docs/04_MANOJ_EXPERIENCE_SPEC.md) | architecture, chapters, character, environment, transitions, loading, responsive, a11y |
| 05 | [Technical architecture](docs/05_MANOJ_TECHNICAL_ARCHITECTURE.md) | stack decisions, folders, state, loop, scene graph, lighting, materials, shaders |
| 06 | [Camera choreography](docs/06_MANOJ_CAMERA_CHOREOGRAPHY.md) | every shot, with values and reasons |
| 07 | [Scroll timeline](docs/07_MANOJ_SCROLL_TIMELINE.md) | story time, bands, holds, global timeline |
| 08 | [3D asset pipeline](docs/08_MANOJ_3D_ASSET_PIPELINE.md) | budgets; GLB/Meshopt/KTX2 path for a future sculpted figure |
| 09 | [Performance plan](docs/09_MANOJ_PERFORMANCE_PLAN.md) | budgets vs. measurements, tiers, governor |
| 10 | [Implementation plan](docs/10_MANOJ_IMPLEMENTATION_PLAN.md) | the 25-section spec index, phases, dependencies, deployment |
| 11 | [QA checklist](docs/11_MANOJ_QA_CHECKLIST.md) | results, open items, originality audit, review log |
