"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { PIPELINE_V6, HOME_V6_SECTION_IDS } from "@/lib/marketingV6";

const STEP_ICONS: Record<string, React.ReactNode> = {
  speech: (
    <svg width={18} height={18} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="10" width="2" height="6" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="6" y="7" width="2" height="9" rx="1" fill="currentColor" opacity="0.9" />
      <rect x="9" y="4" width="2" height="12" rx="1" fill="currentColor" />
      <rect x="12" y="8" width="2" height="8" rx="1" fill="currentColor" opacity="0.9" />
      <rect x="15" y="11" width="2" height="5" rx="1" fill="currentColor" opacity="0.6" />
    </svg>
  ),
  flow: (
    <svg width={18} height={18} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="6" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="12" width="6" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="12" y="7.5" width="6" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 5.5h2l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M8 14.5h2l2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  ballot: (
    <svg width={18} height={18} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  drill: (
    <svg width={18} height={18} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};

const STEP_COLORS = ["#8B7CF8", "#45C3E0", "#E8A822", "#42C478"] as const;

export default function PipelineV6() {
  const [activeStep, setActiveStep] = useState(0);
  const stage = PIPELINE_V6.stages[activeStep];
  const accentColor = STEP_COLORS[activeStep];

  const prefersReduced =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  return (
    <section
      id={HOME_V6_SECTION_IDS.pipeline}
      aria-labelledby="v6-pipeline-heading"
      style={{
        background: "#F6F2E8",
        paddingTop: "clamp(5rem, 10vh, 8rem)",
        paddingBottom: "clamp(5rem, 10vh, 8rem)",
      }}
    >
      <motion.div
        className="max-w-6xl mx-auto px-6 md:px-12"
        initial={prefersReduced ? false : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: prefersReduced ? 0 : 0.55, ease: "easeOut" }}
      >
        {/* Header */}
        <div className="mb-14">
          <p
            className="text-[10px] tracking-[0.22em] uppercase mb-4"
            style={{ color: "#5A5650", fontFamily: "var(--font-jetbrains-mono)" }}
          >
            {PIPELINE_V6.eyebrow}
          </p>
          <h2
            id="v6-pipeline-heading"
            className="font-bold leading-[1.1] tracking-tight"
            style={{
              fontSize: "clamp(2rem, 4vw, 3.25rem)",
              color: "#1A1814",
              fontFamily: "var(--font-space-grotesk)",
            }}
          >
            {PIPELINE_V6.headline}
          </h2>
        </div>

        {/* Bento: stage controls (left) + dominant preview (right) */}
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-8 md:gap-10 items-stretch">
          {/* Stage controls with signal trace */}
          <div className="relative pl-10" role="tablist" aria-label="Pipeline stages">
            {/* Signal trace SVG */}
            <svg width={24} height="100%" aria-hidden="true" className="absolute left-0 top-0 h-full" preserveAspectRatio="none">
              <line x1="12" y1="0" x2="12" y2="100%" stroke="rgba(0,0,0,0.10)" strokeWidth="1" />
              <motion.line
                x1="12"
                y1="0"
                x2="12"
                y2={`${((activeStep + 1) / 4) * 100}%`}
                stroke="#45C3E0"
                strokeWidth="1.5"
                transition={{ duration: 0.35, ease: "easeOut" }}
              />
              {[0, 1, 2, 3].map((i) => (
                <circle
                  key={i}
                  cx="12"
                  cy={`${(i / 3) * 100}%`}
                  r={activeStep === i ? 5 : 3.5}
                  fill={activeStep === i ? "#45C3E0" : "#C4BEB2"}
                  stroke={activeStep === i ? "#45C3E0" : "none"}
                />
              ))}
            </svg>

            <div className="flex flex-col justify-between h-full gap-2">
              {PIPELINE_V6.stages.map((s, i) => {
                const isActive = i === activeStep;
                return (
                  <button
                    key={s.id}
                    role="tab"
                    aria-selected={isActive}
                    aria-controls="v6-pipeline-panel"
                    id={`v6-pipeline-tab-${s.id}`}
                    onClick={() => setActiveStep(i)}
                    onMouseEnter={() => setActiveStep(i)}
                    className="group text-left flex items-start gap-4 py-4 px-4 rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2"
                    style={{
                      background: isActive ? "#FFFFFF" : "transparent",
                      border: isActive ? `1px solid ${STEP_COLORS[i]}55` : "1px solid transparent",
                      boxShadow: isActive ? "0 2px 16px rgba(0,0,0,0.06)" : "none",
                    }}
                  >
                    <span
                      className="shrink-0 text-[11px] mt-0.5"
                      style={{ color: isActive ? STEP_COLORS[i] : "#B8B0A5", fontFamily: "var(--font-jetbrains-mono)" }}
                    >
                      {s.step}
                    </span>
                    <div className="flex flex-col gap-1">
                      <div
                        className="flex items-center gap-2.5"
                        style={{ color: isActive ? "#1A1814" : "#5A5650" }}
                      >
                        <span style={{ color: isActive ? STEP_COLORS[i] : "#B8B0A5" }}>{STEP_ICONS[s.id]}</span>
                        <span className="text-[15px] font-semibold" style={{ fontFamily: "var(--font-space-grotesk)" }}>
                          {s.label}
                        </span>
                      </div>
                      {isActive && (
                        <motion.p
                          className="text-[13px] leading-relaxed"
                          style={{ color: "#4A4640", fontFamily: "var(--font-space-grotesk)" }}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          transition={{ duration: 0.22 }}
                        >
                          {s.caption}
                        </motion.p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dominant preview */}
          <div id="v6-pipeline-panel" role="tabpanel" aria-labelledby={`v6-pipeline-tab-${stage.id}`}>
            <AnimatePresence mode="wait">
              <motion.div
                key={stage.id}
                className="rounded-2xl overflow-hidden h-full"
                style={{
                  background: "#0E1018",
                  border: `1px solid ${accentColor}4D`,
                  minHeight: 340,
                }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22 }}
              >
                <div
                  className="flex items-center gap-2 px-6 py-4"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div className="w-2 h-2 rounded-full" style={{ background: accentColor }} aria-hidden="true" />
                  <span
                    className="text-[11px] font-semibold tracking-wider"
                    style={{ color: accentColor, fontFamily: "var(--font-jetbrains-mono)" }}
                  >
                    {stage.label.toUpperCase()} · {stage.previewLabel}
                  </span>
                </div>

                <div className="p-6 flex flex-col gap-4">
                  {stage.id === "speech" && (
                    <>
                      <p className="text-[11px]" style={{ color: "rgba(245,244,248,0.5)", fontFamily: "var(--font-jetbrains-mono)" }}>
                        PRO · First Affirmative Constructive · 4:00
                      </p>
                      <div className="flex items-center gap-0.5 h-14" aria-hidden="true">
                        {Array.from({ length: 48 }).map((_, i) => (
                          <div
                            key={i}
                            className="flex-1 rounded-sm"
                            style={{
                              height: `${Math.round(15 + Math.abs(Math.sin(i * 0.65)) * 75)}%`,
                              backgroundColor: `${accentColor}8C`,
                            }}
                          />
                        ))}
                      </div>
                      <p className="text-[13px] leading-relaxed" style={{ color: "rgba(245,244,248,0.7)" }}>
                        &ldquo;Federal infrastructure investment generates long-run GDP growth. The CBO puts the return at 1.5 to 2.2 percent&hellip;&rdquo;
                      </p>
                    </>
                  )}

                  {stage.id === "flow" && (
                    <div className="space-y-2.5">
                      {[
                        { tag: "C", text: "Federal investment → long-run growth", color: "#8B7CF8" },
                        { tag: "W", text: "CBO: +1.5–2.2% GDP per 1% invested", color: "#45C3E0" },
                        { tag: "E", text: "CBO Infrastructure Report 2023", color: "#42C478" },
                        { tag: "I", text: "Outweighs short-run municipal cost", color: "#E8A822" },
                      ].map((n) => (
                        <div key={n.tag} className="flex items-start gap-2.5">
                          <div
                            className="shrink-0 w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold"
                            style={{ background: `${n.color}1F`, color: n.color, fontFamily: "var(--font-jetbrains-mono)" }}
                          >
                            {n.tag}
                          </div>
                          <p className="text-[13px] leading-snug" style={{ color: "rgba(245,244,248,0.7)" }}>{n.text}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {stage.id === "ballot" && (
                    <>
                      <p className="text-[11px]" style={{ color: "rgba(245,244,248,0.5)", fontFamily: "var(--font-jetbrains-mono)" }}>
                        REASON FOR DECISION
                      </p>
                      <p className="text-[13px] leading-relaxed" style={{ color: "rgba(245,244,248,0.7)" }}>
                        PRO&apos;s infrastructure argument is well-constructed but the weighing mechanism is
                        incomplete. CON&apos;s short-run fiscal concern stands unanswered in summary.
                        An explicit timeframe comparison would be decisive.
                      </p>
                      <div
                        className="rounded-lg p-3 flex gap-2"
                        style={{ background: "rgba(242,107,78,0.08)", border: "1px solid rgba(242,107,78,0.20)" }}
                      >
                        <span className="text-[9px] font-bold" style={{ color: "#F26B4E", fontFamily: "var(--font-jetbrains-mono)" }}>DROP</span>
                        <p className="text-[11px]" style={{ color: "rgba(245,244,248,0.6)" }}>Timeframe comparison — CON&apos;s year-one cost vs. PRO&apos;s 10-year return.</p>
                      </div>
                    </>
                  )}

                  {stage.id === "drill" && (
                    <>
                      <p className="text-[11px]" style={{ color: "rgba(245,244,248,0.5)", fontFamily: "var(--font-jetbrains-mono)" }}>
                        TARGETED DRILL · 90 seconds
                      </p>
                      <p className="text-[13px] leading-relaxed" style={{ color: "rgba(245,244,248,0.7)" }}>
                        Restate PRO&apos;s impact with an explicit 10-year return frame against CON&apos;s year-one
                        cost. Name the comparison directly.
                      </p>
                      <div className="flex items-center gap-3 text-[12px] mt-2">
                        <span style={{ color: "rgba(245,244,248,0.5)", fontFamily: "var(--font-jetbrains-mono)" }}>45</span>
                        <span style={{ color: "rgba(245,244,248,0.4)" }}>→</span>
                        <span className="font-semibold" style={{ color: "#42C478", fontFamily: "var(--font-jetbrains-mono)" }}>74</span>
                        <span style={{ color: "rgba(245,244,248,0.6)" }}>weighing score after one rep</span>
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
