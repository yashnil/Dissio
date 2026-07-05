"use client";

import { Suspense, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, useMotionValue, useSpring } from "motion/react";
import { HERO_V10, HOME_V10_SECTION_IDS, V10_COLORS } from "@/lib/marketingV10";
import MagnifierV10 from "./MagnifierV10";

const C = V10_COLORS;

/**
 * HeroV10 — "The Decision Magnifier".
 *
 * The headline and the magnifying glass are ONE composition: the lens sits in
 * document flow directly after the h1 and is pulled up/left with font-scaled
 * margins so its rim overlaps the tail of the focal phrase "what decided it."
 * at every lg+ width (both offsets derive from the same clamp() the font uses,
 * so the overlap can't drift). Inside the lens, the deciding sentence is
 * revealed as if it lived beneath the page surface all along.
 *
 * Reliability contract (V9 baseline): everything renders in its FINAL composed
 * state in the initial HTML. GSAP loads as enhancement only and uses fromTo —
 * if it never arrives, the finished hero was never disturbed. No veil, no
 * intro state, no sessionStorage. `?replayIntro=1` just re-keys the effect.
 */

/** The focal-phrase font size — shared by the headline and the lens offsets. */
const FOCAL = "clamp(3.5rem, 6vw, 5.5rem)";

/** Split a line into word spans (class v10-word) for the GSAP reveal.
 *  `joinLastTwo` keeps the final two words in one span so a mid-width viewport
 *  can never orphan "it." onto its own line. */
function Words({ text, joinLastTwo = false }: { text: string; joinLastTwo?: boolean }) {
  let words = text.split(" ");
  if (joinLastTwo && words.length > 2) {
    words = [...words.slice(0, -2), words.slice(-2).join(" ")];
  }
  return (
    <>
      {words.map((w, i) => (
        <span key={i}>
          <span className="v10-word inline-block">{w}</span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

/** Magnetic primary CTA — V9 pattern, sized for the hero. */
function MagneticPrimary() {
  const ref = useRef<HTMLAnchorElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 22 });
  const sy = useSpring(y, { stiffness: 220, damping: 22 });

  const prefersReduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion:reduce)").matches;
  const isTouchDevice =
    typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;

  function onMove(e: React.PointerEvent) {
    if (prefersReduced || isTouchDevice || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set((e.clientX - rect.left - rect.width / 2) * 0.22);
    y.set((e.clientY - rect.top - rect.height / 2) * 0.22);
  }
  function onLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.a
      ref={ref}
      href={HERO_V10.ctaPrimaryHref}
      style={{ x: sx, y: sy, background: C.violetDark, color: C.inkBright }}
      className="group inline-flex items-center gap-2 font-semibold rounded-lg px-6 py-3 text-[15px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      whileHover={{ background: "#7B6CF7" }}
      whileTap={{ scale: 0.97, y: 1 }}
    >
      {HERO_V10.ctaPrimary}
      <span className="transition-transform duration-200 group-hover:translate-x-[3px]" aria-hidden="true">
        →
      </span>
    </motion.a>
  );
}

function HeroV10Inner({ replayKey }: { replayKey: number }) {
  const rootRef = useRef<HTMLElement>(null);

  // ── Pointer-depth on the lens assembly — "glass under light" ────────────────
  // Subtle rotateX/rotateY (max ±2°) + translate (max 5px); springs; disabled on
  // touch / reduced-motion. The specular highlight counter-translates inside
  // MagnifierV10 so the light appears fixed while the glass moves.
  const rotX = useMotionValue(0);
  const rotY = useMotionValue(0);
  const tx = useMotionValue(0);
  const ty = useMotionValue(0);
  const springCfg = { stiffness: 140, damping: 18 };
  const sRotX = useSpring(rotX, springCfg);
  const sRotY = useSpring(rotY, springCfg);
  const sTx = useSpring(tx, springCfg);
  const sTy = useSpring(ty, springCfg);

  // ── Entrance choreography — SSR-final-state; GSAP is enhancement only ───────
  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return; // final composed state already in the HTML

    const root = rootRef.current;
    if (!root) return;

    let ctx: { revert: () => void } | null = null;
    let cancelled = false;

    import("gsap")
      .then(({ gsap }) => {
        if (cancelled || !root) return;
        ctx = gsap.context(() => {
          const tl = gsap.timeline({ defaults: { ease: "power2.out" } });

          // A calm, cinematic ~3s story: environment → headline → the loupe
          // finds the line → the mark → the diagnosis → the next move.

          // Beat 1 (0–0.6) — the environment first: the judge-flow sheet
          // surfaces on the desk with a soft drift.
          tl.fromTo(
            ".v10-sheet",
            { opacity: 0, y: 10 },
            { opacity: 1, y: 0, duration: 0.6, ease: "power1.out" },
            0
          );

          // Beat 2 (0.35–1.05) — the headline settles into place.
          tl.fromTo(
            ".v10-word",
            { opacity: 0, filter: "blur(8px)", y: 12 },
            { opacity: 1, filter: "blur(0px)", y: 0, duration: 0.5, stagger: 0.045 },
            0.35
          );

          // Beat 3 (0.95–1.65) — the loupe glides across the focal phrase and
          // settles over the deciding line on the sheet.
          tl.fromTo(
            ".v10-lens-assembly",
            { opacity: 0.2, x: -170, y: -26, scale: 1.045 },
            { opacity: 1, x: 0, y: 0, scale: 1, duration: 0.7, ease: "power3.out" },
            0.95
          );

          // Beat 4 (1.4–1.9) — the revealed sentence sharpens under the glass.
          tl.fromTo(
            ".v10-reveal",
            { opacity: 0.4, filter: "blur(5px)" },
            { opacity: 1, filter: "blur(0px)", duration: 0.5 },
            1.4
          );

          // Beat 5 (1.85–2.3) — the cyan highlight sweeps across the weak phrase…
          tl.fromTo(
            ".v10-sweep",
            { scaleX: 0 },
            { scaleX: 1, duration: 0.45, ease: "power1.inOut" },
            1.85
          );

          // Beat 6 (2.2–2.55) — …and the red fracture draws beneath it.
          gsap.set(".v10-fracture", { strokeDasharray: 1, strokeDashoffset: 1 });
          tl.to(".v10-fracture", { strokeDashoffset: 0, duration: 0.35 }, 2.2);

          // Beat 7 (2.35–2.85) — the leader draws; the diagnosis docks.
          gsap.set(".v10-leader", { strokeDasharray: 1, strokeDashoffset: 1 });
          tl.to(".v10-leader", { strokeDashoffset: 0, duration: 0.32 }, 2.35);
          tl.fromTo(".v10-leader-dot", { opacity: 0 }, { opacity: 1, duration: 0.25 }, 2.42);
          tl.fromTo(".v10-note", { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: 0.4 }, 2.45);

          // Beat 8 (2.6–3.1) — the next-move swing tag drops from the handle.
          gsap.set(".v10-tab-leader", { strokeDasharray: 1, strokeDashoffset: 1 });
          tl.to(".v10-tab-leader", { strokeDashoffset: 0, duration: 0.28 }, 2.6);
          tl.fromTo(
            ".v10-tab",
            { opacity: 0, y: -14, rotation: -8, transformOrigin: "50% 0%" },
            { opacity: 1, y: 0, rotation: 0, duration: 0.45, ease: "back.out(1.6)" },
            2.65
          );

          // Beat 9 (1.6–2.2) — supporting copy and CTAs settle early enough
          // that the page is actionable while the annotations finish.
          tl.fromTo(
            ".v10-copy, .v10-cta-row, .v10-trust, .v10-eyebrow",
            { opacity: 0, y: 8 },
            { opacity: 1, y: 0, duration: 0.45, stagger: 0.07 },
            1.6
          );
        }, root);
      })
      .catch(() => {
        /* GSAP unavailable — the SSR final state stays untouched. */
      });

    return () => {
      cancelled = true;
      if (ctx) ctx.revert();
    };
  }, [replayKey]);

  // ── Pointer-depth handlers ───────────────────────────────────────────────────
  function onPointerMove(e: React.PointerEvent) {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
    if (prefersReduced || isTouch || !rootRef.current) return;
    const r = rootRef.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5; // -0.5 .. 0.5
    const py = (e.clientY - r.top) / r.height - 0.5;
    rotY.set(px * 4); // max ±2°
    rotX.set(-py * 4); // max ±2°
    tx.set(px * 10); // max ±5px
    ty.set(py * 10); // max ±5px
  }
  function onPointerLeave() {
    rotX.set(0);
    rotY.set(0);
    tx.set(0);
    ty.set(0);
  }

  return (
    <section
      ref={rootRef}
      id={HOME_V10_SECTION_IDS.hero}
      aria-labelledby="v10-hero-headline"
      className="relative overflow-hidden"
      style={{ minHeight: "100svh", background: C.bgDark }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {/* ── Background: a dark room lit by the object ─────────────────────── */}
      {/* Faint violet ambience, upper-left (brand whisper, not a light source). */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 42% 44% at 22% 24%, rgba(139,124,248,0.10) 0%, transparent 70%)",
        }}
      />
      {/* The motivated light: warm spill cast by the lens paper itself… */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 34% 40% at 62% 46%, rgba(245,240,224,0.085) 0%, transparent 70%)",
        }}
      />
      {/* …with a soft warm pool on the “table” below the glass. */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 26% 18% at 62% 74%, rgba(245,236,214,0.05) 0%, transparent 72%)",
        }}
      />
      {/* Cool cyan edge glow hugging the glass. */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 24% 28% at 63% 48%, rgba(69,195,224,0.10) 0%, transparent 70%)",
        }}
      />
      {/* Grain */}
      <div
        className="pointer-events-none absolute inset-0 z-[1] opacity-[0.025]"
        aria-hidden="true"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      {/* Vignette */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 92% 82% at 50% 45%, transparent 58%, rgba(4,5,9,0.5) 100%)",
        }}
      />

      {/* The hidden debate layer now lives ON the judge-flow sheet inside
          MagnifierV10, so the loupe inspects a real artifact. */}

      {/* ── Content layer ─────────────────────────────────────────────────── */}
      <div
        className="relative z-10 mx-auto flex w-full max-w-[1440px] flex-col justify-center px-6 md:px-16"
        style={{ minHeight: "100svh", paddingTop: "6.5rem", paddingBottom: "4.5rem" }}
      >
        {/* Eyebrow */}
        <p
          className="v10-eyebrow mb-6 text-[10px] uppercase"
          style={{ color: C.cyan, fontFamily: "var(--font-jetbrains-mono)", letterSpacing: "0.22em" }}
        >
          {HERO_V10.eyebrow}
        </p>

        {/* Headline — one sentence to screen readers, three visual lines */}
        <h1
          id="v10-hero-headline"
          className="tracking-tight"
          style={{ fontFamily: "var(--font-space-grotesk)", lineHeight: 1.02 }}
        >
          <span
            className="v10-hl-1 block font-semibold"
            style={{ fontSize: "clamp(1.75rem, 3vw, 2.75rem)", color: "rgba(245,244,248,0.82)" }}
          >
            <Words text={HERO_V10.headlineA} />
          </span>
          <span
            className="v10-hl-2 block font-bold"
            style={{ fontSize: FOCAL, color: C.inkBright, marginTop: "0.4rem" }}
          >
            <Words text={HERO_V10.headlineB1} />
          </span>
          <span
            className="v10-hl-3 block font-bold"
            style={{ fontSize: FOCAL, color: C.cyan, marginTop: "0.5rem" }}
          >
            <Words text={HERO_V10.headlineB2} joinLastTwo />
          </span>
        </h1>

        {/* ── The Decision Magnifier — in flow, pulled up over the focal phrase.
            Both offsets scale with the same clamp() as the phrase's font, so the
            rim/phrase overlap holds from 1024 to 1440+. ─────────────────────── */}
        <div
          className="v10-lens-slot relative mt-10 self-center lg:mt-0 lg:self-start"
          style={
            {
              // Rest the bezel tangent to the phrase's period (measured: the phrase
              // is 7.77em of FOCAL wide; the bezel extends 8px past the lens box) —
              // readable text, interlocked composition.
              "--v10-lens-ml": `calc(${FOCAL} * 7.77 + 20px)`,
              // Raise the lens so its center rides the focal-phrase line.
              "--v10-lens-mt": `calc(-170px - ${FOCAL} * 0.62)`,
            } as React.CSSProperties
          }
        >
          {/* Scaled 0.84 at lg so the rim-docked note clears a 1024 viewport;
              full size from xl. origin left-center keeps the tangent + line-ride. */}
          <div className="lg:ml-[var(--v10-lens-ml)] lg:mt-[var(--v10-lens-mt)] lg:scale-[0.84] lg:origin-[left_center] xl:scale-100">
            <MagnifierV10 sRotX={sRotX} sRotY={sRotY} sTx={sTx} sTy={sTy} />
          </div>
        </div>

        {/* Supporting copy — calm and readable; on desktop it rises into the
            left column's open room beside the glass (the tab owns the right). */}
        <p
          className="v10-copy mt-10 max-w-[46ch] leading-relaxed lg:mt-[-4.5rem]"
          style={{
            fontSize: "clamp(1rem, 1.35vw, 1.175rem)",
            color: "rgba(245,244,248,0.74)",
            fontFamily: "var(--font-space-grotesk)",
          }}
        >
          {HERO_V10.body}
        </p>

        {/* CTAs */}
        <div className="v10-cta-row mt-7 flex flex-wrap gap-3">
          <MagneticPrimary />
          <Link
            href={HERO_V10.ctaSecondaryHref}
            className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-[15px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            style={{
              color: "rgba(245,244,248,0.8)",
              border: "1px solid rgba(255,255,255,0.30)",
              fontFamily: "var(--font-space-grotesk)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = C.inkBright;
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.5)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = "rgba(245,244,248,0.8)";
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.3)";
            }}
          >
            {HERO_V10.ctaSecondary}
          </Link>
        </div>

        {/* Trust line */}
        <p
          className="v10-trust mt-4 text-[11px]"
          style={{ color: "rgba(245,244,248,0.62)", fontFamily: "var(--font-jetbrains-mono)" }}
        >
          {HERO_V10.trustLine}
        </p>
      </div>

      {/* ── Hero → warm section handoff — compact dark→warm gradient ─────────── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[1]"
        style={{
          height: "90px",
          background:
            "linear-gradient(to bottom, rgba(8,10,16,0) 0%, rgba(8,10,16,0.6) 55%, #F3F0E8 100%)",
        }}
      />
    </section>
  );
}

function HeroV10WithParams() {
  const params = useSearchParams();
  return <HeroV10Inner replayKey={params.get("replayIntro") === "1" ? 1 : 0} />;
}

export default function HeroV10() {
  return (
    <Suspense fallback={<HeroV10Inner replayKey={0} />}>
      <HeroV10WithParams />
    </Suspense>
  );
}
