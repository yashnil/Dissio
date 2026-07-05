"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { JUDGES_V6, HOME_V6_SECTION_IDS } from "@/lib/marketingV6";

// Phrase within the stationary fragment each judge draws attention to.
const HIGHLIGHT_PHRASE: Record<string, string> = {
  lay: "a year-one cost",
  flow: "CON's concern",
  tech: "ten-year window",
  coach: "warrant resolves",
};

function FragmentWithHighlight({ text, phrase, color }: { text: string; phrase: string; color: string }) {
  const idx = text.indexOf(phrase);
  if (idx === -1) {
    return <>{text}</>;
  }
  const before = text.slice(0, idx);
  const after = text.slice(idx + phrase.length);
  return (
    <>
      {before}
      <motion.span
        key={phrase}
        initial={{ backgroundColor: "rgba(0,0,0,0)" }}
        animate={{ backgroundColor: `${color}26` }}
        transition={{ duration: 0.3 }}
        style={{ color, fontWeight: 600, borderRadius: "3px", padding: "0 2px" }}
      >
        {phrase}
      </motion.span>
      {after}
    </>
  );
}

export default function JudgeLensV6() {
  const [activeId, setActiveId] = useState<string>(JUDGES_V6.judges[0].id);
  const activeJudge = JUDGES_V6.judges.find((j) => j.id === activeId) ?? JUDGES_V6.judges[0];

  return (
    <section
      id={HOME_V6_SECTION_IDS.judges}
      aria-labelledby="v6-judges-heading"
      style={{
        background: "#F6F2E8",
        paddingTop: "clamp(5rem, 10vh, 8rem)",
        paddingBottom: "clamp(5rem, 10vh, 8rem)",
        transition: "background 0.4s ease",
      }}
    >
      <div className="max-w-6xl mx-auto px-6 md:px-12">
        {/* Header */}
        <div className="mb-12 max-w-2xl">
          <p className="text-[10px] tracking-[0.22em] uppercase mb-4" style={{ color: "#5A5650", fontFamily: "var(--font-jetbrains-mono)" }}>
            {JUDGES_V6.eyebrow}
          </p>
          <h2
            id="v6-judges-heading"
            className="font-bold leading-[1.1] tracking-tight mb-4"
            style={{ fontSize: "clamp(2rem, 4vw, 3.25rem)", color: "#1A1814", fontFamily: "var(--font-space-grotesk)" }}
          >
            {JUDGES_V6.headline}
          </h2>
          <p className="text-[1rem] leading-relaxed" style={{ color: "#4A4640", fontFamily: "var(--font-space-grotesk)" }}>
            {JUDGES_V6.subhead}
          </p>
        </div>

        {/* Stationary speech fragment — only the highlight changes */}
        <div
          className="mb-10 rounded-xl p-4 max-w-2xl"
          style={{ background: "#EAE6DA", border: "1px solid #D7D1C6" }}
        >
          <p className="text-[10px] tracking-wider uppercase mb-2" style={{ color: "#B8B0A5", fontFamily: "var(--font-jetbrains-mono)" }}>
            {JUDGES_V6.fragment.speaker} · {JUDGES_V6.fragment.sampleLabel}
          </p>
          <p className="text-[14px] leading-relaxed" style={{ color: "#4A4640", fontFamily: "var(--font-space-grotesk)" }}>
            <FragmentWithHighlight
              text={JUDGES_V6.fragment.text}
              phrase={HIGHLIGHT_PHRASE[activeId] ?? ""}
              color={activeJudge.accentColor}
            />
          </p>
        </div>

        {/* Judge tabs */}
        <div className="flex flex-col gap-6">
          <div className="flex gap-2 flex-wrap" role="tablist" aria-label="Judge perspectives">
            {JUDGES_V6.judges.map((judge) => {
              const isActive = activeId === judge.id;
              return (
                <button
                  key={judge.id}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls="v6-judge-panel"
                  id={`v6-judge-tab-${judge.id}`}
                  onClick={() => setActiveId(judge.id)}
                  className="relative px-4 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2"
                  style={{
                    background: isActive ? "#080A10" : "#EAE6DA",
                    color: isActive ? "#F5F4F8" : "#5A5650",
                    border: isActive ? `1px solid ${judge.accentColor}66` : "1px solid #D7D1C6",
                    fontFamily: "var(--font-space-grotesk)",
                  }}
                >
                  {isActive && (
                    <motion.span
                      layoutId="v6-judge-lens"
                      className="absolute inset-0 rounded-lg"
                      style={{ background: "#080A10", border: `1px solid ${judge.accentColor}66` }}
                      transition={{ type: "spring", stiffness: 380, damping: 35 }}
                    />
                  )}
                  <span className="relative">{judge.label}</span>
                </button>
              );
            })}
          </div>

          {/* Panel — fragment stays put; only these cards crossfade */}
          <div id="v6-judge-panel" role="tabpanel" aria-labelledby={`v6-judge-tab-${activeId}`}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeJudge.id}
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
              >
                {/* Lens description */}
                <div
                  className="rounded-2xl p-6 flex flex-col gap-4"
                  style={{ background: "#0E1018", border: `1px solid ${activeJudge.accentColor}47` }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: activeJudge.accentColor }} aria-hidden="true" />
                    <span className="text-[11px] font-semibold tracking-wider" style={{ color: activeJudge.accentColor, fontFamily: "var(--font-jetbrains-mono)" }}>
                      {activeJudge.label.toUpperCase()} LENS
                    </span>
                  </div>
                  <p className="text-[13px] leading-relaxed" style={{ color: "rgba(245,244,248,0.7)", fontFamily: "var(--font-space-grotesk)" }}>
                    {activeJudge.lens}
                  </p>
                  <div className="rounded-lg px-3 py-2 text-[11px]" style={{ background: `${activeJudge.accentColor}14`, color: activeJudge.accentColor, fontFamily: "var(--font-jetbrains-mono)" }}>
                    Focus: {activeJudge.highlight}
                  </div>
                  <div className="flex items-center gap-3 mt-auto pt-2">
                    <span className="text-[11px]" style={{ color: "rgba(245,244,248,0.55)", fontFamily: "var(--font-jetbrains-mono)" }}>Score</span>
                    <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${activeJudge.score}%`, background: activeJudge.accentColor }} />
                    </div>
                    <span className="text-[12px]" style={{ color: activeJudge.accentColor, fontFamily: "var(--font-jetbrains-mono)" }}>{activeJudge.score}</span>
                  </div>
                </div>

                {/* RFD + drill */}
                <div className="flex flex-col gap-4">
                  <div className="rounded-xl p-5 flex-1" style={{ background: "#0E1018", border: "1px solid #1A1A2E" }}>
                    <p className="text-[10px] tracking-wider uppercase mb-2" style={{ color: "rgba(245,244,248,0.55)", fontFamily: "var(--font-jetbrains-mono)" }}>
                      Reason for decision
                    </p>
                    <p className="text-[13px] leading-relaxed" style={{ color: "rgba(245,244,248,0.7)", fontFamily: "var(--font-space-grotesk)" }}>
                      {activeJudge.rfd}
                    </p>
                  </div>
                  <div className="rounded-xl p-5" style={{ background: "#0E1018", border: `1px solid ${activeJudge.accentColor}38` }}>
                    <p className="text-[10px] tracking-wider uppercase mb-2" style={{ color: activeJudge.accentColor, fontFamily: "var(--font-jetbrains-mono)" }}>
                      Drill
                    </p>
                    <p className="text-[13px] leading-relaxed" style={{ color: "rgba(245,244,248,0.68)", fontFamily: "var(--font-space-grotesk)" }}>
                      {activeJudge.drill}
                    </p>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <p className="mt-6 text-[10px]" style={{ color: "#B8B0A5", fontFamily: "var(--font-jetbrains-mono)" }}>
          {JUDGES_V6.sampleLabel}
        </p>
      </div>
    </section>
  );
}
