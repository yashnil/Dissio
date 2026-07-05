"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence, useInView } from "motion/react";
import { EVIDENCE_V6, HOME_V6_SECTION_IDS } from "@/lib/marketingV6";

const LAYER_COLORS = {
  quote: "#8B7CF8",
  citation: "#45C3E0",
  ai: "#E8A822",
} as const;

export default function EvidenceV6() {
  const [activeLayers, setActiveLayers] = useState<Set<string>>(
    new Set(["quote", "citation", "ai"])
  );
  const [focusedIndex, setFocusedIndex] = useState(0);
  const sectionRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { once: true, amount: 0.3 });

  function toggleLayer(id: string) {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Ordered visible layers, used for the fan-out effect.
  const visibleLayers = EVIDENCE_V6.layers.filter((l) => activeLayers.has(l.id));
  const clampedFocus = Math.min(focusedIndex, Math.max(0, visibleLayers.length - 1));

  return (
    <section
      id={HOME_V6_SECTION_IDS.evidence}
      aria-labelledby="v6-evidence-heading"
      style={{
        background: "#F6F2E8",
        paddingTop: "clamp(5rem, 10vh, 8rem)",
        paddingBottom: "clamp(5rem, 10vh, 8rem)",
      }}
    >
      <div ref={sectionRef} className="max-w-6xl mx-auto px-6 md:px-12">
        {/* Header */}
        <div className="mb-12 max-w-2xl">
          <p className="text-[10px] tracking-[0.22em] uppercase mb-4" style={{ color: "#5A5650", fontFamily: "var(--font-jetbrains-mono)" }}>
            {EVIDENCE_V6.eyebrow}
          </p>
          <h2
            id="v6-evidence-heading"
            className="font-bold leading-[1.1] tracking-tight mb-4"
            style={{ fontSize: "clamp(2rem, 4vw, 3.25rem)", color: "#1A1814", fontFamily: "var(--font-space-grotesk)" }}
          >
            {EVIDENCE_V6.headline}
          </h2>
          <p className="text-[1rem] leading-relaxed" style={{ color: "#4A4640", fontFamily: "var(--font-space-grotesk)" }}>
            {EVIDENCE_V6.subhead}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-10 items-start">
          {/* Source card */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "#0E1018", border: "1px solid #1A1A2E", boxShadow: "0 4px 32px rgba(0,0,0,0.20)" }}
          >
            <div
              className="flex items-start justify-between px-5 py-4"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "#0B0D14" }}
            >
              <div>
                <p className="text-[12px] font-semibold" style={{ color: "#EDEBF3", fontFamily: "var(--font-space-grotesk)" }}>
                  {EVIDENCE_V6.source.title}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: "rgba(245,244,248,0.5)", fontFamily: "var(--font-jetbrains-mono)" }}>
                  {EVIDENCE_V6.source.detail}
                </p>
              </div>
              <span className="text-[9px] px-2 py-1 rounded mt-0.5" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(245,244,248,0.5)", fontFamily: "var(--font-jetbrains-mono)" }}>
                {EVIDENCE_V6.source.type}
              </span>
            </div>

            <div className="p-5 space-y-4">
              <AnimatePresence initial={false}>
                {visibleLayers.map((layer, i) => {
                  const accentColor = LAYER_COLORS[layer.id as keyof typeof LAYER_COLORS];
                  const isFocused = i === clampedFocus;
                  const fanY = isFocused ? 0 : i < clampedFocus ? -10 : 10;
                  return (
                    <motion.div
                      key={layer.id}
                      className="relative rounded-xl overflow-hidden"
                      style={{ padding: "1.5px", background: isFocused ? "transparent" : `${accentColor}38` }}
                      initial={{ opacity: 0, y: 0 }}
                      animate={{ opacity: 1, y: inView ? fanY : 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.35, ease: "easeOut" }}
                      onMouseEnter={() => setFocusedIndex(i)}
                      onFocus={() => setFocusedIndex(i)}
                      tabIndex={-1}
                    >
                      {/* Animated conic gradient border for the focused card */}
                      {isFocused && (
                        <motion.div
                          aria-hidden="true"
                          className="absolute inset-[-60%] pointer-events-none"
                          style={{
                            background: `conic-gradient(from 0deg, ${accentColor}00, ${accentColor}, ${accentColor}00 40%)`,
                          }}
                          animate={{ rotate: 360 }}
                          transition={{ duration: 6, ease: "linear", repeat: Infinity }}
                        />
                      )}
                      <div className="relative rounded-[10px] p-4" style={{ background: "#0E1018" }}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ background: accentColor }} aria-hidden="true" />
                          <span className="text-[10px] font-semibold tracking-wider" style={{ color: accentColor, fontFamily: "var(--font-jetbrains-mono)" }}>
                            {layer.label.toUpperCase()}
                          </span>
                        </div>

                        {"content" in layer && (
                          <p className="text-[13px] leading-relaxed" style={{ color: "rgba(245,244,248,0.72)", fontFamily: "var(--font-space-grotesk)" }}>
                            {layer.content}
                          </p>
                        )}
                        {"citation" in layer && (
                          <>
                            <p className="text-[13px] leading-relaxed mb-2" style={{ color: "rgba(245,244,248,0.7)", fontFamily: "var(--font-space-grotesk)" }}>
                              {layer.citation}
                            </p>
                            <p className="text-[10px]" style={{ color: "#42C478", fontFamily: "var(--font-jetbrains-mono)" }}>
                              {layer.provenance}
                            </p>
                          </>
                        )}
                        {"tag" in layer && (
                          <>
                            <p className="text-[13px] leading-relaxed mb-2" style={{ color: "rgba(245,244,248,0.7)", fontFamily: "var(--font-space-grotesk)" }}>
                              {layer.tag}
                            </p>
                            <p className="text-[10px] italic" style={{ color: "rgba(232,168,34,0.7)", fontFamily: "var(--font-jetbrains-mono)" }}>
                              {layer.note}
                            </p>
                          </>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

          {/* Layer toggles */}
          <div className="flex flex-col gap-3">
            <p className="text-[10px] tracking-[0.18em] uppercase mb-2" style={{ color: "#B8B0A5", fontFamily: "var(--font-jetbrains-mono)" }}>
              Toggle layers
            </p>
            {EVIDENCE_V6.layers.map((layer) => {
              const isActive = activeLayers.has(layer.id);
              const accentColor = LAYER_COLORS[layer.id as keyof typeof LAYER_COLORS];
              return (
                <button
                  key={layer.id}
                  onClick={() => toggleLayer(layer.id)}
                  aria-pressed={isActive}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2"
                  style={{
                    background: isActive ? "#0E1018" : "#EAE6DA",
                    border: isActive ? `1px solid ${accentColor}59` : "1px solid #D7D1C6",
                  }}
                >
                  <div
                    className="w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors duration-200"
                    style={{ background: isActive ? accentColor : "#D7D1C6" }}
                    aria-hidden="true"
                  >
                    {isActive && (
                      <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2 2 4-4" stroke="#080A10" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <p
                    className="text-[13px] font-medium"
                    style={{ color: isActive ? "#EDEBF3" : "#4A4640", fontFamily: "var(--font-space-grotesk)" }}
                  >
                    {layer.label}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
