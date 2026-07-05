"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "motion/react";
import { PATHS_V6, HOME_V6_SECTION_IDS } from "@/lib/marketingV6";

export default function PathsV6() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <section
      id={HOME_V6_SECTION_IDS.paths}
      aria-labelledby="v6-paths-heading"
      style={{ background: "#080A10" }}
    >
      {/* Header */}
      <div style={{ background: "#080A10", paddingTop: "clamp(5rem, 10vh, 8rem)", paddingBottom: "clamp(3rem, 5vh, 5rem)" }}>
        <div className="max-w-6xl mx-auto px-6 md:px-12 text-center">
          <p className="text-[10px] tracking-[0.22em] uppercase mb-4" style={{ color: "rgba(245,244,248,0.55)", fontFamily: "var(--font-jetbrains-mono)" }}>
            {PATHS_V6.eyebrow}
          </p>
          <h2
            id="v6-paths-heading"
            className="font-bold leading-[1.1] tracking-tight"
            style={{ fontSize: "clamp(2rem, 4vw, 3.25rem)", color: "#F5F4F8", fontFamily: "var(--font-space-grotesk)" }}
          >
            {PATHS_V6.headline}
          </h2>
        </div>
      </div>

      {/* Split layout */}
      <div ref={ref} className="relative grid grid-cols-1 md:grid-cols-2">
        {/* Connecting cyan line across the two columns */}
        <div className="absolute inset-0 pointer-events-none hidden md:block" aria-hidden="true">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <motion.path
              d="M 35 42 Q 50 50 65 58"
              stroke="#45C3E0"
              strokeWidth="0.4"
              fill="none"
              vectorEffect="non-scaling-stroke"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={inView ? { pathLength: 1, opacity: 0.6 } : { pathLength: 0, opacity: 0 }}
              transition={{ duration: 0.8, delay: 0.3, ease: "easeInOut" }}
            />
          </svg>
        </div>

        {/* Student — dark */}
        <div
          className="relative flex flex-col justify-between px-8 md:px-12 py-12 md:py-16 border-b md:border-b-0 md:border-r"
          style={{ background: "#0B0D14", borderColor: "#1A1A2E" }}
        >
          <div>
            <p className="text-[10px] tracking-wider uppercase mb-6" style={{ color: "#8B7CF8", fontFamily: "var(--font-jetbrains-mono)" }}>
              {PATHS_V6.student.label}
            </p>
            <h3 className="font-bold mb-6 leading-[1.15]" style={{ fontSize: "clamp(1.5rem, 3vw, 2.25rem)", color: "#F5F4F8", fontFamily: "var(--font-space-grotesk)" }}>
              {PATHS_V6.student.heading}
            </h3>
            <ul className="space-y-4 mb-10">
              {PATHS_V6.student.points.map((point) => (
                <li key={point} className="flex items-start gap-3 text-[14px] leading-relaxed" style={{ color: "rgba(245,244,248,0.7)", fontFamily: "var(--font-space-grotesk)" }}>
                  <span style={{ color: "#8B7CF8", flexShrink: 0, marginTop: "0.1rem" }}>→</span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <Link
            href={PATHS_V6.student.ctaHref}
            className="inline-flex items-center gap-2 font-semibold rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 self-start"
            style={{ background: "#6B5CE7", color: "#F5F4F8", fontSize: "0.9375rem", padding: "0.75rem 1.5rem", fontFamily: "var(--font-space-grotesk)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#7B6CF7"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#6B5CE7"; }}
          >
            {PATHS_V6.student.cta}
          </Link>
        </div>

        {/* Coach — warm */}
        <div className="relative flex flex-col justify-between px-8 md:px-12 py-12 md:py-16" style={{ background: "#F6F2E8" }}>
          <div>
            <p className="text-[10px] tracking-wider uppercase mb-6" style={{ color: "#5A5650", fontFamily: "var(--font-jetbrains-mono)" }}>
              {PATHS_V6.coach.label}
            </p>
            <h3 className="font-bold mb-6 leading-[1.15]" style={{ fontSize: "clamp(1.5rem, 3vw, 2.25rem)", color: "#1A1814", fontFamily: "var(--font-space-grotesk)" }}>
              {PATHS_V6.coach.heading}
            </h3>
            <ul className="space-y-4 mb-10">
              {PATHS_V6.coach.points.map((point) => (
                <li key={point} className="flex items-start gap-3 text-[14px] leading-relaxed" style={{ color: "#4A4640", fontFamily: "var(--font-space-grotesk)" }}>
                  <span style={{ color: "#5A5650", flexShrink: 0, marginTop: "0.1rem" }}>→</span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <Link
            href={PATHS_V6.coach.ctaHref}
            className="inline-flex items-center gap-2 font-medium rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 self-start"
            style={{ color: "#1A1814", border: "1.5px solid #4A4640", fontSize: "0.9375rem", padding: "0.75rem 1.5rem", fontFamily: "var(--font-space-grotesk)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#EAE6DA"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          >
            {PATHS_V6.coach.cta}
          </Link>
        </div>
      </div>
    </section>
  );
}
