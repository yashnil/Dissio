import NavV10 from "@/components/marketing-v10/NavV10";
import HeroV10 from "@/components/marketing-v10/HeroV10";
import PageFlowTraceV10Loader from "@/components/marketing-v10/PageFlowTraceV10Loader";
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
 * Server Component: the nav's auth-label check now lives inside NavV10
 * (dynamically importing the Supabase SDK after mount) and the decorative
 * PageFlowTraceV10 strip is loaded client-only via PageFlowTraceV10Loader,
 * so this shell itself ships no client JS of its own. The nav and main
 * content still render unconditionally from the initial HTML — no state
 * gates the page's existence and there is NO intro overlay/veil. HeroV10
 * renders its final composed state in SSR and runs its own entrance
 * choreography as GSAP enhancement only. The lower sections are reused
 * verbatim from V6 (they keep their own v6-* ids).
 *
 * The original homepage this replaced is archived at /home-v2;
 * /home-v10 now redirects here for compatibility with old links.
 */
export default function HomePage() {
  return (
    <div className="relative" style={{ background: "#080A10" }}>
      <NavV10 />

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

      <PageFlowTraceV10Loader />
      <FooterV6 />
    </div>
  );
}
