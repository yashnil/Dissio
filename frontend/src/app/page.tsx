"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import NavV10 from "@/components/marketing-v10/NavV10";
import HeroV10 from "@/components/marketing-v10/HeroV10";
import PageFlowTraceV10 from "@/components/marketing-v10/PageFlowTraceV10";
// Reused V6 lower sections (imported, never edited).
import PipelineV6 from "@/components/marketing-v6/PipelineV6";
import BallotV6 from "@/components/marketing-v6/BallotV6";
import JudgeLensV6 from "@/components/marketing-v6/JudgeLensV6";
import DrillV6 from "@/components/marketing-v6/DrillV6";
import EvidenceV6 from "@/components/marketing-v6/EvidenceV6";
import PathsV6 from "@/components/marketing-v6/PathsV6";
import CtaV6 from "@/components/marketing-v6/CtaV6";
import FooterV6 from "@/components/marketing-v6/FooterV6";

/**
 * / — the Dissio homepage: "The Glass Loupe" (promoted from /home-v10).
 *
 * The nav and main content render unconditionally from the initial HTML — no
 * React state gates the page's existence and there is NO intro overlay/veil.
 * HeroV10 renders its final composed state in SSR and runs its own entrance
 * choreography as GSAP enhancement only. The lower sections are reused
 * verbatim from V6 (they keep their own v6-* ids).
 *
 * The original homepage this replaced is archived at /home-v2;
 * /home-v10 now redirects here for compatibility with old links.
 */
export default function HomePage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const router = useRouter();

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setIsLoggedIn(!!data?.user))
      .catch(() => {});
  }, []);

  const handleSignOut = useCallback(async () => {
    await createClient().auth.signOut();
    setIsLoggedIn(false);
    router.refresh();
  }, [router]);

  return (
    <div className="relative" style={{ background: "#080A10" }}>
      <NavV10 isLoggedIn={isLoggedIn} onSignOut={handleSignOut} />

      <main id="v10-main-content">
        <HeroV10 />
        <PipelineV6 />
        <BallotV6 />
        <JudgeLensV6 />
        <DrillV6 />
        <EvidenceV6 />
        <PathsV6 />
        <CtaV6 />
      </main>

      <PageFlowTraceV10 />
      <FooterV6 />
    </div>
  );
}
