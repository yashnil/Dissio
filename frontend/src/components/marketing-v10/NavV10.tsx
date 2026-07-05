"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence, useMotionValue, useSpring } from "motion/react";
import { Menu, X } from "lucide-react";
import { NAV_V10, HOME_V10_SECTION_IDS } from "@/lib/marketingV10";

interface NavV10Props {
  isLoggedIn?: boolean;
  onSignOut?: () => void;
}

function MagneticCTA({ href, label }: { href: string; label: string }) {
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
    x.set((e.clientX - rect.left - rect.width / 2) * 0.25);
    y.set((e.clientY - rect.top - rect.height / 2) * 0.25);
  }
  function onLeave() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.a
      ref={ref}
      href={href}
      style={{ x: sx, y: sy, background: "#6B5CE7", color: "#F5F4F8" }}
      className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-lg transition-all duration-180 focus-visible:outline-none focus-visible:ring-2 group"
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      whileHover={{ background: "#7B6CF7" }}
      whileTap={{ scale: 0.97, y: 1 }}
    >
      {label}
      <span className="transition-transform duration-180 group-hover:translate-x-[3px]" aria-hidden="true">
        →
      </span>
    </motion.a>
  );
}

export default function NavV10({ isLoggedIn = false, onSignOut }: NavV10Props) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>(HOME_V10_SECTION_IDS.hero);
  const [warmBg, setWarmBg] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const ioDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scroll listener — passive.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 100);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Active-section tracking + warm-background detection.
  useEffect(() => {
    const ids = Object.values(HOME_V10_SECTION_IDS);
    const warmIds = new Set<string>([
      HOME_V10_SECTION_IDS.pipeline,
      HOME_V10_SECTION_IDS.ballot,
      HOME_V10_SECTION_IDS.evidence,
      HOME_V10_SECTION_IDS.judges,
      HOME_V10_SECTION_IDS.paths,
    ]);
    const observer = new IntersectionObserver(
      (entries) => {
        if (ioDebounceRef.current) clearTimeout(ioDebounceRef.current);
        ioDebounceRef.current = setTimeout(() => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setActiveSection(entry.target.id);
              setWarmBg(warmIds.has(entry.target.id));
              break;
            }
          }
        }, 60);
      },
      { threshold: 0.35, rootMargin: "-60px 0px 0px 0px" }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => {
      observer.disconnect();
      if (ioDebounceRef.current) clearTimeout(ioDebounceRef.current);
    };
  }, []);

  // Outside click closes mobile menu.
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mobileOpen]);

  const islandBg = warmBg
    ? scrolled
      ? "rgba(243,240,232,0.88)"
      : "rgba(243,240,232,0.70)"
    : scrolled
      ? "rgba(10,12,20,0.82)"
      : "rgba(10,12,20,0.72)";

  const islandStyle: React.CSSProperties = {
    background: islandBg,
    backdropFilter: "blur(14px) saturate(125%)",
    WebkitBackdropFilter: "blur(14px) saturate(125%)",
    border: warmBg ? "1px solid rgba(0,0,0,0.10)" : "1px solid rgba(255,255,255,0.09)",
    boxShadow: warmBg ? "0 2px 24px rgba(0,0,0,0.08)" : "0 2px 24px rgba(0,0,0,0.40)",
    borderRadius: "22px",
    transition: "background 220ms ease, border-color 220ms ease, box-shadow 220ms ease",
  };

  return (
    <header
      id="v10-nav"
      className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
      style={{ paddingTop: scrolled ? "10px" : "14px", transition: "padding 220ms ease" }}
    >
      <a
        href="#v10-main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-[70px] focus:left-4 focus:z-[200] focus:px-4 focus:py-2 focus:rounded-md focus:text-sm focus:font-medium focus:pointer-events-auto"
        style={{ background: "#0E1018", color: "#F5F4F8" }}
      >
        Skip to main content
      </a>

      <div className="pointer-events-auto w-full" style={{ maxWidth: "min(92vw, 1180px)" }}>
        <nav
          aria-label="Main navigation"
          className="flex items-center justify-between px-5 md:px-7"
          style={{
            ...islandStyle,
            height: scrolled ? "54px" : "64px",
            transition:
              "height 220ms ease, background 220ms ease, border-color 220ms ease, box-shadow 220ms ease",
          }}
        >
          {/* LEFT: Brand */}
          <Link
            href="/"
            aria-label={NAV_V10.brandAriaLabel}
            className="flex items-center gap-2 shrink-0 focus-visible:outline-none focus-visible:ring-2 rounded-sm"
          >
            <svg width={20} height={20} viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <circle cx="4" cy="11" r="3" fill="#8B7CF8" />
              <circle cx="11" cy="11" r="3.5" fill="#B4A9FB" />
              <circle cx="18" cy="11" r="3" fill="#E8A822" />
            </svg>
            <span
              className="text-[15px] font-semibold tracking-tight"
              style={{ color: warmBg ? "#1A1814" : "#F5F4F8", fontFamily: "var(--font-space-grotesk)" }}
            >
              {NAV_V10.brand}
            </span>
          </Link>

          {/* CENTER: nav links */}
          <div
            className="hidden md:flex items-center gap-1"
            role="list"
            aria-label="Page sections"
          >
            {NAV_V10.sections.map((section) => {
              const slug = section.href.startsWith("#") ? section.href.slice(1) : section.id;
              const isActive = activeSection === slug;
              return (
                <div key={section.id} role="listitem" className="relative">
                  <Link
                    href={section.href}
                    className="relative px-3.5 py-2 text-[13.5px] font-medium rounded-lg transition-colors duration-180 focus-visible:outline-none focus-visible:ring-2 group"
                    style={{
                      color: isActive
                        ? warmBg
                          ? "#1A1814"
                          : "#F5F4F8"
                        : warmBg
                          ? "#5A5650"
                          : "rgba(245,244,248,0.60)",
                    }}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {section.label}
                    {isActive && (
                      <motion.span
                        layoutId="v10-nav-underline"
                        className="absolute bottom-0.5 left-3 right-3 h-[1.5px] rounded-full"
                        style={{ background: "#45C3E0" }}
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      />
                    )}
                  </Link>
                </div>
              );
            })}
          </div>

          {/* RIGHT: Account */}
          <div className="hidden md:flex items-center gap-2.5 shrink-0">
            {isLoggedIn && onSignOut ? (
              <button
                onClick={onSignOut}
                className="text-[13px] font-medium px-3 py-1.5 rounded-lg transition-colors duration-180 focus-visible:outline-none focus-visible:ring-2"
                style={{ color: warmBg ? "#5A5650" : "rgba(245,244,248,0.65)" }}
              >
                {NAV_V10.ctaLoggedIn.signOut}
              </button>
            ) : (
              <Link
                href={NAV_V10.ctaLoggedOut.signInHref}
                className="text-[13px] font-medium px-3 py-1.5 rounded-lg transition-colors duration-180 focus-visible:outline-none focus-visible:ring-2"
                style={{ color: warmBg ? "#5A5650" : "rgba(245,244,248,0.65)" }}
              >
                {NAV_V10.ctaLoggedOut.signIn}
              </Link>
            )}
            <MagneticCTA
              href={isLoggedIn ? NAV_V10.ctaLoggedIn.primaryHref : NAV_V10.ctaLoggedOut.primaryHref}
              label={isLoggedIn ? NAV_V10.ctaLoggedIn.primary : NAV_V10.ctaLoggedOut.primary}
            />
          </div>

          {/* MOBILE: hamburger only */}
          <button
            className="flex md:hidden items-center justify-center w-9 h-9 rounded-lg focus-visible:outline-none focus-visible:ring-2"
            onClick={() => setMobileOpen((o) => !o)}
            aria-expanded={mobileOpen}
            aria-controls="nav-v10-mobile"
            aria-label="Open navigation"
            style={{ color: warmBg ? "#1A1814" : "#F5F4F8" }}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </nav>

        {/* Mobile drawer */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              id="nav-v10-mobile"
              ref={menuRef}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
              className="md:hidden mt-2 rounded-[20px] overflow-hidden"
              style={{
                background: "rgba(8,10,16,0.97)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              <nav className="flex flex-col px-4 py-4 gap-0.5">
                {NAV_V10.sections.map((section) => (
                  <Link
                    key={section.id}
                    href={section.href}
                    className="py-3.5 px-3 text-[15px] font-medium rounded-xl border-b transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2"
                    style={{ color: "rgba(245,244,248,0.75)", borderColor: "rgba(255,255,255,0.06)" }}
                    onClick={() => setMobileOpen(false)}
                  >
                    {section.label}
                  </Link>
                ))}
                <div className="pt-4 pb-2 flex flex-col gap-2.5">
                  <Link
                    href={isLoggedIn ? NAV_V10.ctaLoggedIn.primaryHref : NAV_V10.ctaLoggedOut.primaryHref}
                    className="flex items-center justify-center py-3.5 rounded-xl text-[14px] font-semibold focus-visible:outline-none focus-visible:ring-2"
                    style={{ background: "#6B5CE7", color: "#F5F4F8" }}
                    onClick={() => setMobileOpen(false)}
                  >
                    {isLoggedIn ? NAV_V10.ctaLoggedIn.primary : NAV_V10.ctaLoggedOut.primary}
                  </Link>
                  <Link
                    href={NAV_V10.ctaLoggedOut.signInHref}
                    className="flex items-center justify-center py-3.5 rounded-xl text-[14px] font-medium border focus-visible:outline-none focus-visible:ring-2"
                    style={{ color: "rgba(245,244,248,0.65)", borderColor: "rgba(255,255,255,0.12)" }}
                    onClick={() => setMobileOpen(false)}
                  >
                    {NAV_V10.ctaLoggedOut.signIn}
                  </Link>
                </div>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
