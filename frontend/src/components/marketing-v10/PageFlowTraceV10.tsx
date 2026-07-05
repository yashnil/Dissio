"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useScroll } from "motion/react";
import { HOME_V10_SECTION_IDS } from "@/lib/marketingV10";

/**
 * PageFlowTraceV10 — a thin vertical progress trace pinned to the right edge.
 * Each major section has a node that illuminates in its semantic color while active.
 * The hero uses the fresh v10-hero id; every lower section keeps its reused v6-* id.
 * Hidden on mobile.
 */

const SECTIONS: { id: string; color: string }[] = [
  { id: HOME_V10_SECTION_IDS.hero,     color: "#8B7CF8" },
  { id: HOME_V10_SECTION_IDS.pipeline, color: "#45C3E0" },
  { id: HOME_V10_SECTION_IDS.ballot,   color: "#E8A822" },
  { id: HOME_V10_SECTION_IDS.judges,   color: "#8B7CF8" },
  { id: HOME_V10_SECTION_IDS.drill,    color: "#42C478" },
  { id: HOME_V10_SECTION_IDS.evidence, color: "#45C3E0" },
  { id: HOME_V10_SECTION_IDS.paths,    color: "#E8A822" },
  { id: HOME_V10_SECTION_IDS.cta,      color: "#8B7CF8" },
];

export default function PageFlowTraceV10() {
  const { scrollYProgress } = useScroll();
  const [active, setActive] = useState<string>(HOME_V10_SECTION_IDS.hero);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(() => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setActive(entry.target.id);
              break;
            }
          }
        }, 60);
      },
      { threshold: 0.4, rootMargin: "-60px 0px 0px 0px" }
    );
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => {
      observer.disconnect();
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, []);

  const activeColor = SECTIONS.find((s) => s.id === active)?.color ?? SECTIONS[0].color;

  return (
    <div aria-hidden="true" className="hidden md:block fixed right-5 z-40 pointer-events-none" style={{ top: 70, bottom: 0 }}>
      <div className="relative h-full w-px" style={{ background: "rgba(255,255,255,0.10)" }}>
        <motion.div
          className="absolute top-0 left-0 w-px origin-top"
          style={{ height: "100%", background: activeColor, scaleY: scrollYProgress, opacity: 0.7 }}
        />
        {SECTIONS.map((s, i) => {
          const pct = SECTIONS.length > 1 ? (i / (SECTIONS.length - 1)) * 100 : 0;
          const isActive = s.id === active;
          return (
            <span
              key={s.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-300"
              style={{
                left: "50%",
                top: `${pct}%`,
                width: isActive ? 8 : 5,
                height: isActive ? 8 : 5,
                background: isActive ? s.color : "rgba(255,255,255,0.25)",
                boxShadow: isActive ? `0 0 10px ${s.color}` : "none",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
