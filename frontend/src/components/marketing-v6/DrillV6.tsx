"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useInView,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";
import { DRILL_V6, HOME_V6_SECTION_IDS } from "@/lib/marketingV6";

const NEUTRAL_SCORE = 60;

function ScoreCounter({
  to,
  start,
  color,
  emphasise,
}: {
  to: number;
  start: boolean;
  color: string;
  emphasise?: boolean;
}) {
  const mv = useMotionValue(NEUTRAL_SCORE);
  const spring = useSpring(mv, { stiffness: 90, damping: 20 });
  const rounded = useTransform(spring, (v) => Math.round(v));
  const [display, setDisplay] = useState(NEUTRAL_SCORE);

  useEffect(() => {
    const unsub = rounded.on("change", (v) => setDisplay(v));
    return () => unsub();
  }, [rounded]);

  useEffect(() => {
    if (start) mv.set(to);
  }, [start, to, mv]);

  return (
    <span
      className={`text-[12px] ${emphasise ? "font-semibold" : ""}`}
      style={{ color, fontFamily: "var(--font-jetbrains-mono)" }}
      aria-label={String(to)}
    >
      {display}
    </span>
  );
}

export default function DrillV6() {
  const sectionRef = useRef<HTMLElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });
  const [hasAnimated, setHasAnimated] = useState(false);

  const prefersReduced =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  useEffect(() => {
    if (isInView && !hasAnimated) setHasAnimated(true);
  }, [isInView, hasAnimated]);

  const started = hasAnimated || prefersReduced;

  return (
    <section
      ref={sectionRef}
      id={HOME_V6_SECTION_IDS.drill}
      aria-labelledby="v6-drill-heading"
      style={{
        background: "#080A10",
        paddingTop: "clamp(5rem, 10vh, 8rem)",
        paddingBottom: "clamp(5rem, 10vh, 8rem)",
      }}
    >
      <div ref={ref} className="max-w-6xl mx-auto px-6 md:px-12">
        {/* Header */}
        <div className="mb-12">
          <p className="text-[10px] tracking-[0.22em] uppercase mb-4" style={{ color: "#42C478", fontFamily: "var(--font-jetbrains-mono)" }}>
            {DRILL_V6.eyebrow}
          </p>
          <h2
            id="v6-drill-heading"
            className="font-bold leading-[1.1] tracking-tight"
            style={{ fontSize: "clamp(2rem, 4vw, 3.25rem)", color: "#F5F4F8", fontFamily: "var(--font-space-grotesk)" }}
          >
            {DRILL_V6.headline}
          </h2>
        </div>

        {/* Drill trace SVG */}
        <div className="mb-8 max-w-md" aria-hidden="true">
          <svg width="100%" height="60" viewBox="0 0 300 100" preserveAspectRatio="none">
            <motion.path
              d="M0,50 C100,20 200,80 300,50"
              fill="none"
              stroke="#42C478"
              strokeWidth="2"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={started ? { pathLength: 1 } : { pathLength: 0 }}
              transition={{ duration: prefersReduced ? 0 : 0.9, ease: "easeInOut" }}
            />
          </svg>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {/* Before */}
          <div className="rounded-2xl p-6 flex flex-col gap-4" style={{ background: "#0E1018", border: "1px solid #1A1A2E" }}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider" style={{ color: "rgba(245,244,248,0.5)", fontFamily: "var(--font-jetbrains-mono)" }}>
                {DRILL_V6.before.label}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(245,244,248,0.5)", fontFamily: "var(--font-jetbrains-mono)" }}>
                {DRILL_V6.before.tag}
              </span>
            </div>
            <blockquote className="text-[13px] leading-relaxed italic" style={{ color: "rgba(245,244,248,0.7)", fontFamily: "var(--font-space-grotesk)" }}>
              {DRILL_V6.before.excerpt}
            </blockquote>
            <p className="text-[11px]" style={{ color: "#F26B4E", fontFamily: "var(--font-jetbrains-mono)" }}>
              ⚠ {DRILL_V6.before.note}
            </p>
            <div className="flex items-center gap-3 mt-auto pt-2">
              <span className="text-[11px]" style={{ color: "rgba(245,244,248,0.5)", fontFamily: "var(--font-jetbrains-mono)" }}>
                {DRILL_V6.before.dim}
              </span>
              <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "rgba(245,244,248,0.5)" }}
                  initial={{ width: `${NEUTRAL_SCORE}%` }}
                  animate={started ? { width: `${DRILL_V6.before.score}%` } : { width: `${NEUTRAL_SCORE}%` }}
                  transition={{ duration: prefersReduced ? 0 : 0.9, ease: "easeOut" }}
                />
              </div>
              <ScoreCounter to={DRILL_V6.before.score} start={started} color="rgba(245,244,248,0.55)" />
            </div>
          </div>

          {/* Drill card */}
          <div
            className="rounded-2xl p-6 flex flex-col gap-4"
            style={{ background: "#0E1018", border: "1px solid rgba(66,196,120,0.38)", boxShadow: "0 0 28px rgba(66,196,120,0.08)" }}
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: "#42C478" }} aria-hidden="true" />
              <span className="text-[11px] font-semibold tracking-wider" style={{ color: "#42C478", fontFamily: "var(--font-jetbrains-mono)" }}>
                {DRILL_V6.drill.label}
              </span>
            </div>
            <h3 className="font-semibold" style={{ fontSize: "1rem", color: "#EDEBF3", fontFamily: "var(--font-space-grotesk)" }}>
              {DRILL_V6.drill.title}
            </h3>
            <p className="text-[13px] leading-relaxed flex-1" style={{ color: "rgba(245,244,248,0.7)", fontFamily: "var(--font-space-grotesk)" }}>
              {DRILL_V6.drill.instruction}
            </p>
            <div
              className="rounded-xl flex items-center justify-center"
              style={{ height: 80, background: "rgba(66,196,120,0.08)", border: "1px dashed rgba(66,196,120,0.30)" }}
              aria-hidden="true"
            >
              <svg width={32} height={32} viewBox="0 0 24 24" fill="none">
                <rect x="9" y="2" width="6" height="11" rx="3" stroke="#42C478" strokeWidth="1.5" />
                <path d="M5 10a7 7 0 0 0 14 0" stroke="#42C478" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="12" y1="17" x2="12" y2="21" stroke="#42C478" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="9" y1="21" x2="15" y2="21" stroke="#42C478" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="px-2 py-0.5 rounded" style={{ background: "rgba(66,196,120,0.12)", color: "#42C478", fontFamily: "var(--font-jetbrains-mono)" }}>
                {DRILL_V6.drill.duration}
              </span>
              <span style={{ color: "rgba(245,244,248,0.55)", fontFamily: "var(--font-space-grotesk)" }}>{DRILL_V6.drill.rep}</span>
            </div>
          </div>

          {/* After */}
          <div className="rounded-2xl p-6 flex flex-col gap-4" style={{ background: "#0E1018", border: "1px solid rgba(66,196,120,0.32)" }}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider" style={{ color: "#42C478", fontFamily: "var(--font-jetbrains-mono)" }}>
                {DRILL_V6.after.label}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded" style={{ background: "rgba(66,196,120,0.12)", color: "#42C478", fontFamily: "var(--font-jetbrains-mono)" }}>
                {DRILL_V6.after.tag}
              </span>
            </div>
            <blockquote className="text-[13px] leading-relaxed italic" style={{ color: "rgba(245,244,248,0.74)", fontFamily: "var(--font-space-grotesk)" }}>
              {DRILL_V6.after.excerpt}
            </blockquote>
            <p className="text-[11px]" style={{ color: "#42C478", fontFamily: "var(--font-jetbrains-mono)" }}>
              ✓ {DRILL_V6.after.note}
            </p>
            <div className="flex items-center gap-3 mt-auto pt-2">
              <span className="text-[11px]" style={{ color: "rgba(245,244,248,0.7)", fontFamily: "var(--font-jetbrains-mono)" }}>
                {DRILL_V6.after.dim}
              </span>
              <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "#42C478" }}
                  initial={{ width: `${NEUTRAL_SCORE}%` }}
                  animate={started ? { width: `${DRILL_V6.after.score}%` } : { width: `${NEUTRAL_SCORE}%` }}
                  transition={{ duration: prefersReduced ? 0 : 0.9, ease: "easeOut" }}
                />
              </div>
              <ScoreCounter to={DRILL_V6.after.score} start={started} color="#42C478" emphasise />
            </div>
          </div>
        </div>

        <p className="mt-8 text-[10px]" style={{ color: "rgba(245,244,248,0.4)", fontFamily: "var(--font-jetbrains-mono)" }}>
          {DRILL_V6.sampleLabel}
        </p>
      </div>
    </section>
  );
}
