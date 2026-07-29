"use client";

import { useEffect, useState } from "react";
import type { OpponentBriefing, RoundSimulationConfig } from "@/types/round";
import {
  matchRecapLines,
  opponentBriefingArgumentNote,
  opponentBriefingHeadline,
} from "@/lib/roundModel";

interface Props {
  config: RoundSimulationConfig;
  briefing: OpponentBriefing | null;
  onDone: () => void;
  onSkip: () => void;
}

/** Solo-only prep screen shown after the round + opponent plan already
 * exist, so it can recap the real match card and (when available) the
 * opponent's actual prepared thesis instead of a bare countdown. */
export function MatchPrepScreen({ config, briefing, onDone, onSkip }: Props) {
  const [remaining, setRemaining] = useState(config.prep_time);

  useEffect(() => {
    if (remaining <= 0) {
      onDone();
      return;
    }
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const minutes = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const headline = opponentBriefingHeadline(briefing);
  const argumentNote = opponentBriefingArgumentNote(briefing);

  return (
    <div className="max-w-md mx-auto space-y-6 p-6">
      <div className="text-center space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prep Time</p>
        <p className="text-5xl font-mono font-semibold tabular-nums">
          {minutes}:{String(secs).padStart(2, "0")}
        </p>
        <p className="text-sm text-muted-foreground">Review the match before it starts.</p>
      </div>

      <div className="rounded-lg border p-4 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Match Card</h3>
        <dl className="space-y-1.5">
          {matchRecapLines(config).map((line) => (
            <div key={line.label} className="flex items-start justify-between gap-3 text-sm">
              <dt className="text-muted-foreground shrink-0">{line.label}</dt>
              <dd className="text-right font-medium">{line.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {headline && (
        <div className="rounded-lg border p-4 space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Opponent Briefing
          </h3>
          <p className="text-sm">{headline}</p>
          {argumentNote && <p className="text-xs text-muted-foreground">{argumentNote}</p>}
        </div>
      )}

      <button
        type="button"
        onClick={onSkip}
        className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
      >
        Skip Prep &amp; Start
      </button>
    </div>
  );
}
