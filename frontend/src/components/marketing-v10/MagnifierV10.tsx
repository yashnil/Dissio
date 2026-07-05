"use client";

import { motion, useTransform, type MotionValue } from "motion/react";
import { LENS_V10, FIELD_V10, V10_COLORS } from "@/lib/marketingV10";

const C = V10_COLORS;

/**
 * MagnifierV10 — the hero's single designed object: "The Glass Loupe".
 *
 * A premium glass loupe passing over the hidden layer of the round. The lens
 * is genuinely glass-like: a translucent body (backdrop-filter blurs whatever
 * sits behind the rim), a warm paper illumination that lives only in the
 * reveal area and falls off toward the edge, a masked metal bezel ring, a
 * subtle cyan/violet chromatic split just inside the rim, a specular blob
 * that counter-tracks the pointer tilt, and a slim graphite handle carrying
 * a hanging next-move swing tag. Pure DOM/CSS/SVG — no canvas/3D.
 *
 * Single-instance rule: exactly one revealed sentence (inside the lens), one
 * judge rim-label, one swing tag. On desktop the note/tag dock to the rim and
 * handle (absolute); on mobile/tablet they reflow into the column below.
 *
 * Everything renders in its FINAL composed state here; HeroV10's GSAP snaps
 * the pieces hidden and replays them as enhancement only.
 */

/** Split the sentence into [before][marked][after] around the weak phrase. */
function splitSentence() {
  const { sentence, markedPhrase } = LENS_V10;
  const idx = sentence.indexOf(markedPhrase);
  if (idx < 0) return { before: sentence, marked: "", after: "" };
  return {
    before: sentence.slice(0, idx),
    marked: sentence.slice(idx, idx + markedPhrase.length),
    after: sentence.slice(idx + markedPhrase.length),
  };
}

interface MagnifierV10Props {
  sRotX: MotionValue<number>;
  sRotY: MotionValue<number>;
  sTx: MotionValue<number>;
  sTy: MotionValue<number>;
}

/** The revealed sentence, marked the way a judge marks it. */
function RevealedSentence() {
  const { before, marked, after } = splitSentence();
  return (
    <p
      className="text-center leading-snug"
      style={{ fontSize: 19, fontWeight: 500, color: C.paperInk, fontFamily: "var(--font-space-grotesk)" }}
    >
      {before}
      <span
        className="v10-marked relative inline-block rounded-[3px]"
        style={{ background: "rgba(69,195,224,0.26)", padding: "0 3px", color: C.paperInk }}
      >
        {/* Highlighter sweep — overlay scaling in from the left. */}
        <span
          className="v10-sweep pointer-events-none absolute inset-0 rounded-[3px]"
          aria-hidden="true"
          style={{ background: "rgba(69,195,224,0.32)", transformOrigin: "left center" }}
        />
        {/* Red fracture — a delicate squiggle beneath the mark only. */}
        <svg
          className="pointer-events-none absolute -bottom-[4px] left-0 w-full"
          height="5"
          viewBox="0 0 100 5"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            className="v10-fracture"
            d="M1 2.5 Q 13 4.5, 25 2.5 T 51 2.5 T 76 2.5 T 99 2.5"
            stroke={C.fracture}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            pathLength={1}
          />
        </svg>
        <span className="relative">{marked}</span>
      </span>
      {after}
    </p>
  );
}

export default function MagnifierV10({ sRotX, sRotY, sTx, sTy }: MagnifierV10Props) {
  // The specular highlight tracks light: it counter-translates opposite the tilt.
  const specX = useTransform(sTx, (v) => -v * 0.8);
  const specY = useTransform(sTy, (v) => -v * 0.8);

  return (
    <div className="v10-lens-root relative flex flex-col items-center lg:block">
      {/* ── The debate artifact under the glass: a faint judge-flow sheet.
          The loupe inspects a real object — a marked transcript page with a
          header, ruled text lines, a margin-note rail, and the actual source
          sentence running under the rim. Everything on it is decorative
          context (aria-hidden); dimness comes from ink alpha so the sheet
          stays quiet against the dark room while remaining readable.
          Wide desktop only (below xl the copy column runs too close). ── */}
      <div
        aria-hidden="true"
        className="v10-field v10-sheet pointer-events-none absolute hidden select-none overflow-hidden xl:block"
        style={{
          left: -100,
          top: -80,
          width: 500,
          height: 580,
          transform: "rotate(-1.5deg)",
          background:
            "linear-gradient(168deg, rgba(243,238,225,0.075) 0%, rgba(243,238,225,0.055) 55%, rgba(243,238,225,0.04) 100%)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 6,
          boxShadow: "0 30px 70px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)",
          fontFamily: "var(--font-jetbrains-mono)",
          zIndex: 0,
        }}
      >
        {/* margin rule — the classic flow-sheet column line */}
        <div
          className="absolute"
          style={{ left: 132, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.07)" }}
        />
        {/* sheet header: two fragments serve as the page's label + timestamp */}
        <span className="v10-fragment absolute" style={{ left: 20, top: 20, fontSize: 10.5, letterSpacing: "0.2em", color: "rgba(245,244,248,0.48)" }}>
          {FIELD_V10.fragments[3] /* JUDGE FLOW */}
        </span>
        <span className="v10-fragment absolute" style={{ left: 152, top: 20, fontSize: 10.5, letterSpacing: "0.08em", color: "rgba(245,244,248,0.42)" }}>
          PRO · SUMMARY · {FIELD_V10.fragments[4] /* 2:41 */}
        </span>
        {/* ruled transcript lines (bars — read as text from a distance) */}
        {[
          { top: 78,  left: 152, width: 300, o: 0.10 },
          { top: 108, left: 152, width: 262, o: 0.09 },
          { top: 138, left: 152, width: 318, o: 0.08 },
          { top: 168, left: 152, width: 236, o: 0.08 },
          { top: 468, left: 152, width: 308, o: 0.10 },
          { top: 498, left: 152, width: 224, o: 0.09 },
          { top: 528, left: 152, width: 284, o: 0.08 },
        ].map((b, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              top: b.top,
              left: b.left,
              width: b.width,
              height: 7,
              background: `linear-gradient(90deg, rgba(245,244,248,${b.o}), rgba(245,244,248,${b.o * 0.55}))`,
            }}
          />
        ))}
        {/* the margin-note rail (the remaining hidden-layer fragments) */}
        <span className="v10-fragment absolute" style={{ left: 20, top: 130, fontSize: 11, color: "rgba(245,244,248,0.36)" }}>
          {FIELD_V10.fragments[0] /* impact calculus */}
        </span>
        <span className="v10-fragment absolute" style={{ left: 20, top: 236, fontSize: 11, color: "rgba(245,244,248,0.34)" }}>
          {FIELD_V10.fragments[5] /* weighing */}
        </span>
        <span
          className="v10-fragment absolute"
          style={{ left: 20, top: 356, fontSize: 12, fontStyle: "italic", fontFamily: "var(--font-space-grotesk)", color: "rgba(232,168,34,0.55)" }}
        >
          {FIELD_V10.fragments[1] /* warrant? */}
        </span>
        <span className="v10-fragment absolute" style={{ left: 20, top: 452, fontSize: 11, color: "rgba(245,244,248,0.34)" }}>
          {FIELD_V10.fragments[6] /* drop */}
        </span>
        <span className="v10-fragment absolute" style={{ left: 20, top: 506, fontSize: 11, color: "rgba(245,244,248,0.32)" }}>
          {FIELD_V10.fragments[2] /* extend defense */}
        </span>
        {/* the actual source sentence — the transcript row the loupe rests on */}
        <p
          className="v10-source absolute whitespace-nowrap"
          style={{
            left: 20,
            top: 372,
            width: 470,
            fontSize: 13.5,
            lineHeight: 1.5,
            color: "rgba(245,244,248,0.46)",
            fontFamily: "var(--font-space-grotesk)",
          }}
        >
          {LENS_V10.sentence}
        </p>
      </div>

      {/* ── The loupe assembly (pointer-tilt) ─────────────────────────────── */}
      <motion.div
        className="v10-lens-assembly relative"
        style={{
          rotateX: sRotX,
          rotateY: sRotY,
          x: sTx,
          y: sTy,
          transformPerspective: 1100,
          width: 360,
          height: 360,
          zIndex: 2,
        }}
      >
        {/* Accessible description of the whole artifact. */}
        <span className="sr-only">{LENS_V10.lensAriaLabel}</span>

        {/* 1 — Contact shadow: tight under the lower rim so the loupe reads as
            pressed onto the page, not floating in a void. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full"
          style={{
            inset: 0,
            transform: "translate(14px, 24px) scale(0.97)",
            background: "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 62%)",
            filter: "blur(16px)",
            zIndex: 0,
          }}
        />

        {/* 2 — Slim graphite handle (lower-right, 42°) + collar. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            left: 300,
            top: 290,
            width: 185,
            height: 22,
            borderRadius: 11,
            transformOrigin: "left center",
            transform: "rotate(42deg)",
            background: "linear-gradient(168deg, #383E4E 0%, #20242F 42%, #0E1118 100%)",
            borderTop: "1px solid rgba(255,255,255,0.26)",
            borderBottom: "1px solid rgba(0,0,0,0.55)",
            boxShadow: "0 14px 30px rgba(0,0,0,0.5)",
            zIndex: 1,
          }}
        >
          {/* bevel light running along the top edge */}
          <div
            className="absolute rounded-full"
            style={{
              left: 14,
              top: 4,
              right: 20,
              height: 2.5,
              background: "linear-gradient(90deg, rgba(255,255,255,0.4), rgba(255,255,255,0))",
            }}
          />
          {/* ferrule — the bright metal band where handle meets collar */}
          <div
            className="absolute"
            style={{
              left: 4,
              top: 0,
              bottom: 0,
              width: 9,
              borderRadius: 5,
              background: "linear-gradient(168deg, #5A6478 0%, #2A2F3E 55%, #14171F 100%)",
              borderTop: "1px solid rgba(255,255,255,0.35)",
            }}
          />
          {/* smoked end cap */}
          <div
            className="absolute rounded-full"
            style={{
              right: 2,
              top: 3,
              width: 14,
              height: 14,
              background: "linear-gradient(160deg, #2A2F3E, #0B0E14)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          />
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full"
          style={{
            left: 290,
            top: 282,
            width: 32,
            height: 32,
            background: `linear-gradient(160deg, ${C.metalLight}, ${C.metalDark})`,
            border: "1px solid rgba(255,255,255,0.16)",
            boxShadow: "0 6px 16px rgba(0,0,0,0.5)",
            zIndex: 1,
          }}
        />

        {/* 3 — Machined bezel: a true ring (masked) with a 1px bright outer
            lip, dark body, 1px lighter inner line, and one angular glint at
            ~10 o'clock. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full"
          style={{
            inset: -7,
            background: `conic-gradient(from 215deg, #3E4556, #14171F 22%, #2C3140 48%, #10131C 72%, #AEB9CC 77.5%, #2C3140 81%, #3E4556)`,
            WebkitMask:
              "radial-gradient(farthest-side, transparent calc(100% - 13px), #000 calc(100% - 12px))",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 13px), #000 calc(100% - 12px))",
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.26), 0 0 0 3px rgba(16,20,30,0.9), 0 0 0 4px rgba(255,255,255,0.08), 0 4px 18px rgba(0,0,0,0.55)",
            zIndex: 1,
          }}
        />
        {/* bezel inner line — a fine bright ring where metal meets glass */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full"
          style={{
            inset: 5,
            boxShadow: "0 0 0 1px rgba(255,255,255,0.14)",
            zIndex: 1,
          }}
        />

        {/* 4 — The glass body over lit paper: a near-flat plane with one
            directional hotspot (upper-left, matching the room light) and only
            a whisper of edge falloff — flat glass, not a shaded sphere. The
            backdrop blur is the glass itself where anything crosses the rim. */}
        <div
          className="v10-lens absolute overflow-hidden rounded-full"
          style={{
            inset: 0,
            background:
              "radial-gradient(circle at 36% 30%, rgba(252,249,242,0.98) 0%, rgba(248,244,235,0.96) 48%, rgba(244,239,228,0.94) 80%, rgba(238,232,219,0.92) 100%)",
            backdropFilter: "blur(5px) saturate(115%)",
            WebkitBackdropFilter: "blur(5px) saturate(115%)",
            border: "1px solid rgba(255,255,255,0.18)",
            boxShadow:
              "0 22px 60px rgba(0,0,0,0.45), inset 0 0 10px rgba(60,70,90,0.10)",
            zIndex: 2,
          }}
        >
          {/* paper grain — the surface under the glass is paper, not plastic */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E\")",
              zIndex: 1,
            }}
          />

          {/* Refraction receipt — where the dim source line crosses under the
              rim (lower-left), its words reappear enlarged and softened just
              inside the glass edge. */}
          <p
            aria-hidden="true"
            className="v10-refract pointer-events-none absolute hidden select-none xl:block"
            style={{
              left: "-2%",
              top: "79%",
              width: 320,
              whiteSpace: "nowrap",
              fontSize: 17,
              color: "rgba(26,24,20,0.17)",
              fontFamily: "var(--font-space-grotesk)",
              filter: "blur(0.8px)",
              // Local to the rim crossing: fade out well before the lens
              // center so it never competes with the revealed sentence.
              WebkitMaskImage:
                "linear-gradient(to right, #000 0%, #000 30%, transparent 62%)",
              maskImage: "linear-gradient(to right, #000 0%, #000 30%, transparent 62%)",
              zIndex: 2,
            }}
          >
            {LENS_V10.sentence}
          </p>

          {/* Revealed sentence — magnified over the warm illuminated area. */}
          <div
            className="v10-reveal absolute flex items-center justify-center"
            style={{
              left: "47%",
              top: "50%",
              width: 262,
              transform: "translate(-50%, -50%) scale(1.06)",
              zIndex: 3,
            }}
          >
            <RevealedSentence />
          </div>

          {/* Glass reflection: two straight diagonal streak bands (flat glass
              reflects the room as streaks, not concentric arcs); they
              counter-track the pointer tilt like a real reflection. */}
          <motion.div
            aria-hidden="true"
            className="v10-specular pointer-events-none absolute"
            style={{
              inset: "-20%",
              x: specX,
              y: specY,
              background:
                "linear-gradient(118deg, transparent 24%, rgba(255,255,255,0.16) 31%, rgba(255,255,255,0.03) 39%, transparent 45%, transparent 54%, rgba(255,255,255,0.09) 59%, transparent 65%)",
              mixBlendMode: "screen",
              zIndex: 4,
            }}
          />
        </div>
      </motion.div>

      {/* Leader from the rim label down onto the glass: a two-segment elbow
          ending in an anchor dot placed directly above the marked phrase —
          the annotation points at its evidence, drawn ON the glass like a
          lab callout (desktop). */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute hidden lg:block"
        style={{ left: 205, top: 24, zIndex: 6 }}
        width="145"
        height="95"
        viewBox="0 0 145 95"
        fill="none"
      >
        <path
          className="v10-leader"
          d="M139 7 L 65 7 L 7 86"
          stroke={C.cyan}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          fill="none"
          style={{ opacity: 0.8 }}
        />
        <circle className="v10-leader-dot" cx="7" cy="86" r="3" fill={C.cyan} />
      </svg>

      {/* ── The judge rim-label — a small etched dark-glass annotation docked
          to the rim on lg; reflows below the lens on mobile. ── */}
      <div
        className="v10-note relative mt-5 w-full max-w-[300px] self-start lg:absolute lg:left-[344px] lg:top-[4px] lg:mt-0 lg:w-[192px] lg:max-w-none"
        style={{ zIndex: 7 }}
        data-dock="note"
      >
        <div
          style={{
            background: "rgba(13,17,27,0.85)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderLeft: "2px solid rgba(69,195,224,0.85)",
            borderRadius: 4,
            padding: "6px 9px",
            boxShadow: "0 3px 10px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.07)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        >
          <p
            className="font-bold"
            style={{
              fontFamily: "var(--font-jetbrains-mono)",
              fontSize: 11,
              letterSpacing: "0.03em",
              color: C.cyan,
            }}
          >
            {LENS_V10.note}
          </p>
          <p
            className="mt-0.5"
            style={{ fontSize: 11.5, color: "rgba(245,244,248,0.92)", fontFamily: "var(--font-space-grotesk)" }}
          >
            {LENS_V10.noteSub}
          </p>
        </div>
      </div>

      {/* The string: a fine sagging line from the handle tip down through the
          tag's eyelet — an actual hanging string, not a connector (desktop). */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute hidden lg:block"
        style={{ left: 413, top: 422, zIndex: 2 }}
        width="30"
        height="52"
        viewBox="0 0 30 52"
        fill="none"
      >
        <path
          className="v10-tab-leader"
          d="M24 3 Q 17 30, 6 48"
          stroke="rgba(96,196,138,0.65)"
          strokeWidth={1.5}
          strokeLinecap="round"
          pathLength={1}
          fill="none"
        />
      </svg>

      {/* ── The next-move swing tag — hangs off the handle by an eyelet, with
          a slight tilt; reflows below the lens on mobile. ── */}
      <div
        className="v10-tab relative mt-3 w-full max-w-[300px] self-start lg:absolute lg:left-[340px] lg:top-[468px] lg:mt-0 lg:w-[208px] lg:max-w-none"
        style={{ zIndex: 3, transformOrigin: "38% 0%" }}
        data-dock="tab"
      >
        {/* Inner wrapper holds the constant hanging tilt (desktop only — the
            eyelet is offset from center, so the tag physically hangs tilted);
            GSAP swings the outer element so rotations never compose. On
            mobile the tag stacks untilted and unattached. */}
        <div className="lg:rotate-[-2.5deg]" style={{ transformOrigin: "38% 0%" }}>
        {/* punched eyelet the string passes through — offset left of center,
            which is what justifies the hang angle (desktop) */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute hidden lg:block"
          style={{ left: 71, top: -5, zIndex: 3 }}
          width="16"
          height="12"
          viewBox="0 0 16 12"
          fill="none"
        >
          <circle cx="8" cy="6" r="3.5" stroke={C.green} strokeWidth={1.5} fill="#080A10" />
        </svg>
        <div
          style={{
            background: "rgba(13,17,27,0.88)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderLeft: "2px solid rgba(66,196,120,0.85)",
            borderRadius: 8,
            padding: "9px 12px",
            boxShadow: "0 8px 20px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.07)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        >
          <p
            className="font-bold"
            style={{
              fontFamily: "var(--font-jetbrains-mono)",
              fontSize: 10.5,
              letterSpacing: "0.06em",
              color: C.green,
            }}
          >
            {LENS_V10.tabTitle}
          </p>
          <p
            className="mt-0.5"
            style={{ fontSize: 12, color: C.greenText, fontFamily: "var(--font-space-grotesk)" }}
          >
            {LENS_V10.tabSub}
          </p>
        </div>
        </div>
      </div>
    </div>
  );
}
