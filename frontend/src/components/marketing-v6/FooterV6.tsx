import Link from "next/link";
import { HOME_V6_SECTION_IDS } from "@/lib/marketingV6";

const FOOTER_LINKS = [
  { label: "How it works", href: `#${HOME_V6_SECTION_IDS.pipeline}` },
  { label: "For coaches", href: `#${HOME_V6_SECTION_IDS.paths}` },
  { label: "Evidence", href: `#${HOME_V6_SECTION_IDS.evidence}` },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
] as const;

export default function FooterV6() {
  return (
    <footer
      id={HOME_V6_SECTION_IDS.footer}
      className="relative"
      style={{
        background: "#050609",
        borderTop: "1px solid #12141F",
        paddingTop: "2.5rem",
        paddingBottom: "2.5rem",
      }}
    >
      <nav
        className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        aria-label="Footer links"
      >
        {/* Brand */}
        <Link
          href="/"
          className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 rounded-sm"
          aria-label="Dissio home"
        >
          <svg width={18} height={18} viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <circle cx="4" cy="11" r="3" fill="rgba(139,124,248,0.7)" />
            <circle cx="11" cy="11" r="3.5" fill="rgba(180,169,251,0.8)" />
            <circle cx="18" cy="11" r="3" fill="rgba(232,168,34,0.7)" />
          </svg>
          <span className="text-[13px] font-semibold" style={{ color: "rgba(245,244,248,0.7)", fontFamily: "var(--font-space-grotesk)" }}>
            Dissio
          </span>
        </Link>

        {/* Links */}
        <ul className="flex flex-wrap gap-x-5 gap-y-2" role="list">
          {FOOTER_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-[12px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 rounded-sm"
                style={{ color: "rgba(245,244,248,0.6)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(245,244,248,0.85)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(245,244,248,0.6)"; }}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Copyright */}
        <p className="text-[11px] shrink-0" style={{ color: "rgba(245,244,248,0.55)", fontFamily: "var(--font-space-grotesk)" }}>
          © {new Date().getFullYear()} Dissio
        </p>
      </nav>
    </footer>
  );
}
