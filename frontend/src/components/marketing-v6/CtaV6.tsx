"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { FINAL_CTA_V6, HOME_V6_SECTION_IDS } from "@/lib/marketingV6";

export default function CtaV6() {
  return (
    <section
      id={HOME_V6_SECTION_IDS.cta}
      aria-labelledby="v6-cta-heading"
      className="relative overflow-hidden"
      style={{
        background: "#080A10",
        paddingTop: "clamp(6rem, 12vh, 10rem)",
        paddingBottom: "clamp(6rem, 12vh, 10rem)",
      }}
    >
      {/* Soft converging light */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{ background: "radial-gradient(ellipse 60% 50% at 50% 100%, rgba(107,92,231,0.14) 0%, transparent 70%)" }}
      />

      <div className="relative flex flex-col items-center text-center max-w-2xl mx-auto px-6">
        <h2
          id="v6-cta-heading"
          className="font-bold leading-[1.08] tracking-tight mb-8"
          style={{ fontSize: "clamp(2.25rem, 5vw, 4rem)", color: "#F5F4F8", fontFamily: "var(--font-space-grotesk)" }}
        >
          {FINAL_CTA_V6.headlineA}
          <br />
          <span style={{ color: "#45C3E0" }}>{FINAL_CTA_V6.headlineB}</span>
        </h2>

        {/* One subtle signal pulse */}
        <motion.div
          className="w-1.5 h-1.5 rounded-full mb-8"
          style={{ background: "#45C3E0" }}
          animate={{ scale: [1, 1.8, 1], opacity: [0.8, 0, 0.8] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden="true"
        />

        <div className="flex flex-wrap gap-4 justify-center">
          <Link
            href={FINAL_CTA_V6.ctaPrimaryHref}
            className="group inline-flex items-center gap-2 font-semibold rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            style={{ background: "#6B5CE7", color: "#F5F4F8", fontSize: "clamp(0.9375rem, 1.2vw, 1.0625rem)", padding: "0.875rem 2rem", fontFamily: "var(--font-space-grotesk)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#7B6CF7"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#6B5CE7"; }}
          >
            {FINAL_CTA_V6.ctaPrimary}
            <span className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true">→</span>
          </Link>

          <Link
            href={FINAL_CTA_V6.ctaSecondaryHref}
            className="inline-flex items-center gap-2 font-medium rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            style={{ color: "rgba(245,244,248,0.75)", border: "1px solid rgba(255,255,255,0.18)", fontSize: "clamp(0.9375rem, 1.2vw, 1.0625rem)", padding: "0.875rem 2rem", fontFamily: "var(--font-space-grotesk)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#F5F4F8";
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.35)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = "rgba(245,244,248,0.75)";
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.18)";
            }}
          >
            {FINAL_CTA_V6.ctaSecondary}
          </Link>
        </div>

        <p className="mt-6 text-[11px]" style={{ color: "rgba(245,244,248,0.45)", fontFamily: "var(--font-jetbrains-mono)" }}>
          {FINAL_CTA_V6.supportLine}
        </p>
      </div>
    </section>
  );
}
