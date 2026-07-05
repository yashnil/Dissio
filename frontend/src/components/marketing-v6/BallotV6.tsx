"use client";

import { useEffect, useRef } from "react";
import { BALLOT_V6, HOME_V6_SECTION_IDS } from "@/lib/marketingV6";

export default function BallotV6() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    let cancelled = false;
    let ctx: ReturnType<typeof import("gsap")["gsap"]["context"]> | null = null;

    (async () => {
      try {
        const { gsap } = await import("gsap");
        const { ScrollTrigger } = await import("gsap/ScrollTrigger");
        if (cancelled || !sectionRef.current) return;
        gsap.registerPlugin(ScrollTrigger);

        ctx = gsap.context(() => {
          const tl = gsap.timeline({
            scrollTrigger: {
              trigger: sectionRef.current,
              start: "top 70%",
              once: true,
            },
          });
          tl.fromTo(".ballot-paper", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, 0);
          tl.fromTo(".ballot-highlight", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.5 }, 0.3);
          tl.fromTo(".ballot-margin-line", { scaleX: 0 }, { scaleX: 1, duration: 0.3, transformOrigin: "left" }, 0.7);
          tl.fromTo(".ballot-judge-note", { opacity: 0, x: 16 }, { opacity: 1, x: 0, duration: 0.4 }, 0.85);
        }, sectionRef);
      } catch {
        /* GSAP failed — content is already visible via default styles */
      }
    })();

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id={HOME_V6_SECTION_IDS.ballot}
      aria-labelledby="v6-ballot-heading"
      style={{
        background: "#080A10",
        paddingTop: "clamp(5rem, 10vh, 8rem)",
        paddingBottom: "clamp(5rem, 10vh, 8rem)",
      }}
    >
      <div className="max-w-6xl mx-auto px-6 md:px-12">
        {/* Header */}
        <div className="mb-12 max-w-2xl">
          <p
            className="text-[10px] tracking-[0.22em] uppercase mb-4"
            style={{ color: "#F26B4E", fontFamily: "var(--font-jetbrains-mono)" }}
          >
            {BALLOT_V6.eyebrow}
          </p>
          <h2
            id="v6-ballot-heading"
            className="font-bold leading-[1.1] tracking-tight mb-4"
            style={{
              fontSize: "clamp(2rem, 4vw, 3.25rem)",
              color: "#F5F4F8",
              fontFamily: "var(--font-space-grotesk)",
            }}
          >
            {BALLOT_V6.headline}
          </h2>
          <p
            className="text-[1rem] leading-relaxed"
            style={{ color: "rgba(245,244,248,0.7)", fontFamily: "var(--font-space-grotesk)" }}
          >
            {BALLOT_V6.subhead}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-10 md:gap-14 items-start">
          {/* Transcript excerpt — ballot paper style */}
          <div
            className="ballot-paper rounded-2xl overflow-hidden"
            style={{
              background: "#F6F2E8",
              border: "1px solid #D7D1C6",
              boxShadow: "0 4px 32px rgba(0,0,0,0.22)",
            }}
          >
            <div
              className="flex items-center justify-between px-5 py-3.5"
              style={{ borderBottom: "1px solid #D7D1C6", background: "#EAE6DA" }}
            >
              <span className="text-[10px] tracking-wider uppercase" style={{ color: "#5A5650", fontFamily: "var(--font-jetbrains-mono)" }}>
                {BALLOT_V6.excerpt.speaker}
              </span>
              <span className="text-[10px]" style={{ color: "#B8B0A5", fontFamily: "var(--font-jetbrains-mono)" }}>
                {BALLOT_V6.sampleLabel}
              </span>
            </div>

            <div className="p-6 space-y-3.5">
              {BALLOT_V6.excerpt.lines.map((line, i) => (
                <div key={i} className={`relative ${line.highlight ? "ballot-highlight" : ""}`}>
                  <p
                    className="text-[15px] leading-[1.7]"
                    style={{
                      color: line.highlight ? "#1A1814" : "#4A4640",
                      fontFamily: "var(--font-space-grotesk)",
                      background: line.highlight ? "rgba(242,107,78,0.10)" : "transparent",
                      borderRadius: "4px",
                      paddingLeft: line.highlight ? "0.5rem" : 0,
                      paddingRight: line.highlight ? "0.5rem" : 0,
                      paddingTop: line.highlight ? "0.2rem" : 0,
                      paddingBottom: line.highlight ? "0.2rem" : 0,
                      borderLeft: line.highlight ? "3px solid #F26B4E" : "3px solid transparent",
                    }}
                  >
                    {line.text}
                  </p>
                  {"note" in line && line.note && (
                    <p className="mt-1 text-[10px] pl-3" style={{ color: "#F26B4E", fontFamily: "var(--font-jetbrains-mono)" }}>
                      ⚠ {line.note}
                    </p>
                  )}
                </div>
              ))}
            </div>

            <div
              className="ballot-margin-line px-5 py-3 text-[10px] tracking-wider"
              style={{
                borderTop: "1px solid #D7D1C6",
                color: "#B8B0A5",
                fontFamily: "var(--font-jetbrains-mono)",
                background: "#EAE6DA",
              }}
            >
              {BALLOT_V6.connection}
            </div>
          </div>

          {/* Judge annotation card */}
          <div className="flex flex-col gap-5">
            <div
              className="ballot-judge-note rounded-xl p-5"
              style={{ background: "#0E1018", border: "1px solid rgba(242,107,78,0.28)" }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full" style={{ background: "#F26B4E" }} aria-hidden="true" />
                <span className="text-[10px] tracking-wider font-semibold" style={{ color: "#F26B4E", fontFamily: "var(--font-jetbrains-mono)" }}>
                  JUDGE NOTE
                </span>
              </div>
              <p className="text-[13px] leading-relaxed" style={{ color: "rgba(245,244,248,0.72)", fontFamily: "var(--font-space-grotesk)" }}>
                {BALLOT_V6.judgeNote}
              </p>
            </div>

            <div className="rounded-xl p-5" style={{ background: "#0E1018", border: "1px solid #1A1A2E" }}>
              <p className="text-[10px] tracking-wider uppercase mb-3" style={{ color: "rgba(245,244,248,0.55)", fontFamily: "var(--font-jetbrains-mono)" }}>
                What Dissio shows you
              </p>
              <ul className="space-y-2.5">
                {[
                  "The exact line that shifted the ballot",
                  "Why it didn't work for the judge",
                  "The one drill that rebuilds the argument",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-[13px]" style={{ color: "rgba(245,244,248,0.7)", fontFamily: "var(--font-space-grotesk)" }}>
                    <span style={{ color: "#45C3E0", flexShrink: 0 }}>→</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
