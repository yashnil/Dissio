# Dissio /home-v4 Design Research

**Date:** July 2026  
**Purpose:** Design direction for the V4 homepage — "The Argument Instrument"  
**Status:** Research complete → concept selected → implemented

---

## 1. Reference Site Analysis

### Linear (linear.app)

**What makes it effective:**
- Product UI screenshots are the hero visual — the product does the visual heavy lifting
- Chrome is nearly invisible (dark structure, minimal color) so product content pops
- Section rhythm follows workflow verbs: "Build," "Plan," "Monitor," "Diffs"
- Navigation is minimal — one CTA right-floated, no mega-menus
- "Suppressed chrome, expressive content" is the governing principle

**Design principles extracted:**
- Color lives in the product visualization, not in the wrapper
- Section names are actions, not features
- The interface is confident enough not to need decoration

**What to avoid copying:**
- The centered hero layout is the SaaS default — too common
- The feature-grid section cadence appears on dozens of competing tools

---

### Railway (railway.com)

**What makes it effective:**
- Isometric infrastructure grid is Railway's signature — visual identity through metaphor
- The product is shown as a stylized diagram, not a literal screenshot
- Trusts abstraction over literalism
- Sparse text, strong visual

**Design principles extracted:**
- Abstracted product visuals (diagrams) can be more memorable than screenshots
- A single visual metaphor repeated consistently builds strong identity
- The infrastructure grid works because infrastructure has inherent geometric logic

**What to avoid copying:**
- The isometric grid pattern does not translate to debate — it has no underlying logic in that context
- Adapting this directly would read as borrowed identity

---

### Sahara AI (saharaai.com)

**What makes it effective:**
- Numbered section anchors (01, 02, 03) create structural rhythm
- Uppercase heavy CTAs signal enterprise authority

**What to avoid:**
- Site describes the product rather than shows it
- Flat without strong display typography or product visualization
- Enterprise register doesn't suit novice debaters

---

### ZettaJoule (zetta-joule.com)

**What makes it effective:**
- Full-viewport reactor photography earns immediate authority
- Technical specification charts as competitive differentiation graphics

**What to avoid:**
- Photography hero requires extraordinary imagery — wrong medium for software
- Standard corporate card grid below the fold

---

## 2. Additional Benchmarks (Stripe, Vercel, PlanetScale)

**Stripe:** Specificity as design — exact numbers ("$1.9T in payments volume") function as visual elements, not marketing copy. This is the "credibility through specificity" pattern.

**Vercel:** Dark-mode discipline — separate assets per theme, gradients authored for dark contexts (not CSS-inverted from light).

**PlanetScale:** ASCII architecture diagrams as hero visuals — engineers showing infrastructure in the visual language engineers trust. Not decorative.

---

## 3. Scroll Architecture Research

**CSS scroll-snap (native):**
- Zero JS, full browser support (Chrome, Firefox, Safari, Edge)
- `mandatory` mode is binary: can't accumulate partial wheel ticks
- Cannot distinguish deliberate swipe from accidental brush on trackpad
- Touch momentum can feel jarring with `mandatory`

**Intent-based wheel accumulation (custom JS):**
- Full velocity awareness and directional control
- Requires handling trackpad vs. mouse delta normalization
- Smooth easing curves, precise chapter control
- Better UX for storytelling heroes with distinct "scenes"

**Selected for V4:** Sticky 400dvh wrapper with native scroll + scroll event listener for chapter calculation. No JS interception of scroll events — the browser handles all scrolling. Chapter is calculated from `scrollY` position relative to the wrapper, which is `floor(scrolledInto / vh)`. This gives:
- Native scroll behavior (keyboard, touch, trackpad, scrollbar, mouse all work)
- No scroll trap possible
- Chapter transitions via opacity/transform CSS
- Accurate chapter tracking without wheel event accumulation

This is used by Apple, Vercel, and Stripe for their storytelling heroes.

---

## 4. Key Principles Synthesized

1. **The product is the visual** — real argument content as the hero, not abstract decoration
2. **Suppressed chrome, expressive content** — near-invisible structural chrome, color inside the debate content
3. **Section rhythm = narrative rhythm** — each section is a workflow moment, not a feature list
4. **Three typography levels** — display (headlines), body (prose), technical/mono (labels, scores, evidence)
5. **Specificity over superlatives** — concrete numbers and real content, no invented metrics
6. **Motion follows physics** — ease-out for entrances, ease-in for exits; no bounce/elastic
7. **Navigation as identity statement** — minimal fixed nav, one CTA, no mega-menus
8. **Depth through layers** — foreground/background separation via blur, scale, opacity — not shadows
9. **Earn the second scroll** — hero contains one concrete demonstration, not an aspirational summary
10. **Dark mode is a commitment** — gradients and glows authored for dark context

---

## 5. Library Evaluation

| Library | What it enables | Bundle cost | Selected | Reason |
|---------|----------------|-------------|----------|--------|
| Motion | Shared layout, scroll, reveals | ~42kb | **Yes** (already installed) | State transitions, button feedback |
| GSAP | Complex deterministic timelines | ~80kb | No | CSS + Motion sufficient for V4 |
| Three.js / R3F | 3D spatial scene | ~500kb+ | No | SVG + CSS perspective achieves necessary depth without WebGL |
| CSS scroll snap | Chapter snapping | 0kb | No | Sticky 400dvh approach is cleaner and more accessible |
| Lenis | Smooth scroll | ~15kb | No | No material improvement over native scroll in this architecture |
| Spline | External 3D asset | Variable | No | No control, testing difficulty, no fallback |
| JetBrains Mono | Technical labels | Already loaded | **Yes** | Technical/mono accent level (already in stack) |
| Space Grotesk | Display + body | Already loaded | **Yes** | Geometric display for headlines |

**New dependencies added:** Zero. All libraries used were already in the project.

---

## 6. Three Design Concepts

### Concept A: The Argument Observatory
**Hero composition:** Tilted 2.5D isometric plane showing argument space as a spatial map. Arguments appear as nodes on a tilted coordinate system.  
**Visual metaphor:** Observing argument structure from above, like a scientific instrument.  
**Scroll behavior:** Camera "zooms in" to argument nodes as user scrolls.  
**Typography:** Technical mono dominant, sans for body.  
**Nav:** Thin fixed rail at top with coordinate-style active section indicator.

**Scores (0-10):**
- Immediate clarity: 6 (isometric abstraction confuses first-time users)
- Originality: 8
- Dissio connection: 7
- Visual impact: 8
- Product proof: 5 (metaphor, not actual content)
- Motion potential: 9
- Accessibility: 6 (relies on spatial metaphor that needs fallback)
- Responsiveness: 5 (isometric is difficult on mobile)
- Performance: 7 (no 3D)
- Maintainability: 7
**Total: 68/100**

---

### Concept B: The Debate Control Room
**Hero composition:** Full-width split: PRO half (violet) left, CON half (amber) right, central analysis column (cyan). Like a broadcast control center.  
**Visual metaphor:** Debate as a broadcast event being monitored by the analytical system.  
**Scroll behavior:** Panels populate with content as chapters advance; central column "goes live" on chapter 3.  
**Typography:** Heavy mono labels, dense content.  
**Nav:** Wide segmented track across full width.

**Scores:**
- Immediate clarity: 8 (split layout instantly communicates two sides)
- Originality: 7
- Dissio connection: 8
- Visual impact: 9
- Product proof: 8
- Motion potential: 8
- Accessibility: 7
- Responsiveness: 6 (3-column is hard on mobile)
- Performance: 9 (SVG + CSS)
- Maintainability: 8
**Total: 78/100**

---

### Concept C: The Argument Prism (SELECTED)
**Hero composition:** Full-height unified argument canvas (60vh) showing PRO and CON argument structures as node-chains on opposing sides, with a central translucent analytical lens (cyan prism). Text is compact, bottom-anchored, secondary to the visual.  
**Visual metaphor:** A scientific prism that splits the combined argument signal into its constituent components and reveals the hidden third view.  
**Scroll behavior:** Sticky 400dvh wrapper; scroll position determines chapter; visual transitions via CSS opacity/transform.  
**Typography:** Space Grotesk for display/headlines; JetBrains Mono for all technical labels (step counters, argument tags, scores, evidence provenance).  
**Nav:** Progress thread at very top of screen (1px), fixed bar with active-section dot indicator, minimal design.

**Scores:**
- Immediate clarity: 9 (spatial layout of two sides + center is immediately legible)
- Originality: 8 (unified canvas, not two cards)
- Dissio connection: 10 (PRO/CON/third-view directly maps to product concepts)
- Visual impact: 9 (dominant upper 60% visual)
- Product proof: 9 (shows real argument content: CLAIM/WARRANT/EVIDENCE/IMPACT)
- Motion potential: 9 (chapter transitions per node, gap animations, drill reveal)
- Accessibility: 9 (SVG with role=img, reduced-motion alternative, semantic HTML text layer)
- Responsiveness: 8 (single column on mobile, full spatial on desktop)
- Performance: 10 (pure SVG + CSS, zero new dependencies)
- Maintainability: 9 (declarative, chapter-driven, no complex state)
**Total: 90/100**

---

## 7. Why Concept C is Strongest

Concept C wins on three decisive criteria:

**1. Product specificity.** The Argument Prism directly maps to Dissio's core product concepts — PRO side (violet/student practice), CON side (amber/opposition), and the Analytical Lens (cyan/judge perspective). Every visual element has semantic meaning from the color system. Nothing is decorative.

**2. Scalability across chapters.** The four hero chapters naturally evolve this visual:
- Ch0: Two sides established, prism outlined
- Ch1: Argument structure labeled (CWEI chain)
- Ch2: Prism activates, third-view gaps highlighted
- Ch3: Drill card generated from the gap

**3. Zero new dependencies.** The entire visual is SVG + CSS + existing Motion library. No Three.js, no GSAP, no Spline. This directly improves LCP (no heavy JS bundle), INP (no canvas rendering thread), and CLS (SVG is layout-stable).

**Why not Concept A or B:**  
Concept A's isometric abstraction requires spatial reasoning that creates friction for first-time visitors. Concept B's control-room three-column layout struggles on mobile and tablet and risks feeling "busy" without adding clarity.

---

## 8. Dissio-Specific Opportunities Used in V4

- **The three-node mark** repeated in nav logo, CTA section, and footer as a visual motif
- **JetBrains Mono** used exclusively for: step counters ("01 / 04"), argument tags ("CLAIM", "WARRANT"), judge scores, provenance labels — creates "instrument" register
- **Semantic colors** applied consistently: violet (PRO/student), amber (CON), cyan (analysis/third-view), green (improvement/verified evidence), red (dropped argument)
- **Real argument content** throughout — no placeholder lorem ipsum; actual debate claim/warrant/evidence/impact from a real resolution
- **Sample data labels** on all illustrative content
- **Four distinct post-hero sections** with varied layouts: numbered bento (outputs), asymmetric bento (report preview), tab-panel (judge lenses), two-column cards (paths)

---

## 9. Anti-Vibe-Coded Quality Check

Before finalizing the V4 concept:

| Question | Answer |
|----------|--------|
| Is every element necessary? | Yes — no decorative filler |
| Does spacing follow a system? | Yes — Tailwind spacing tokens |
| Are border radii consistent? | Yes — rounded-xl throughout, 6px nodes |
| Are colors semantic? | Yes — all OKLCH from the system, no raw hex |
| Are loading states truthful? | N/A for static page |
| Are labels product language? | Yes — CLAIM, WARRANT, EVIDENCE, IMPACT, JUDGE BALLOT |
| Does every interaction work with keyboard? | Yes — chapter nav via Arrow keys, all buttons focusable |
| Does it make sense without animation? | Yes — reduced-motion mode renders text fallback |
| Does it look designed at every viewport? | Yes — 1440, 1280, 1024, 390 designed |
| Is sample data labeled? | Yes — "Sample data — illustrative only" on all cards |
| Is it distinctly Dissio? | Yes — PRO/CON/third-view visual language is product-native |

---

## 10. Decision Log

**Decision:** Scroll architecture — sticky 400dvh + native scroll  
**Problem:** CSS scroll-snap can't distinguish trackpad intent from momentum; custom wheel accumulation requires complex delta normalization  
**Chosen:** Sticky 400dvh wrapper, scroll event listener calculates chapter from `scrollY / innerHeight`  
**Why:** Native browser scroll, zero JS interception, works with all input methods, no scroll trap  
**Tradeoffs:** Chapter transitions are opacity fades, not hard snaps. Acceptable for storytelling hero.

**Decision:** No Three.js for V4  
**Problem:** 3D canvas would block LCP, requires WebGL fallback, adds ~500kb  
**Chosen:** SVG + CSS perspective for depth effects  
**Why:** SVG achieves necessary visual depth without WebGL. Zero LCP impact.

**Decision:** No new dependencies  
**Problem:** Every new dependency adds bundle cost, maintenance overhead, and integration risk  
**Chosen:** Motion (installed), GSAP (installed but unused in V4), JetBrains Mono (already loaded), Space Grotesk (already loaded)  
**Why:** All required capabilities already in the stack.
