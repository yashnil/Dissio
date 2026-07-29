"use client";

import dynamic from "next/dynamic";

// PageFlowTraceV10 is purely decorative (aria-hidden, hidden on mobile) and
// contributes no SEO-visible content, so it's safe to skip SSR for it
// entirely and defer its IntersectionObserver/useScroll setup out of the
// critical hydration path -- it mounts as its own small chunk after first
// paint instead of competing with the hero for hydration time.
// (ssr: false only works inside a Client Component, hence this wrapper --
// page.tsx itself is a Server Component.)
const PageFlowTraceV10 = dynamic(() => import("./PageFlowTraceV10"), { ssr: false });

export default function PageFlowTraceV10Loader() {
  return <PageFlowTraceV10 />;
}
