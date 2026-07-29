"use client";

import { useEffect, useState } from "react";
import type { RoundSimulationConfig } from "@/types/round";
import {
  OPPONENT_LEVEL_OPTIONS,
  OPPONENT_LEVEL_TO_DIFFICULTY,
  defaultRoundConfig,
  isLobbyConfigValid,
  matchPreviewText,
  matchRecapLines,
  opponentLevelFromDifficulty,
  prepTimeLabel,
  prepTimeOptions,
} from "@/lib/roundModel";

interface Props {
  onStart: (config: RoundSimulationConfig) => void;
  loading?: boolean;
  /** Changes copy only — the same config object is handed to `onStart`
   * either way, and the caller (page.tsx) still owns solo vs. room creation.
   * The one behavioral difference: solo skips this component's own prep
   * step (page.tsx shows prep after the round + opponent plan exist, so it
   * can show a real opponent briefing); multiplayer still preps here,
   * before the room exists, since there's no plan to show yet either way. */
  mode: "solo" | "multiplayer";
}

const JUDGE_TYPES = [
  { value: "flow", label: "Flow Judge" },
  { value: "lay", label: "Lay Judge" },
  { value: "parent", label: "Parent Judge" },
  { value: "technical", label: "Technical Judge" },
  { value: "coach", label: "Coach Judge" },
];

const FORMAT_OPTIONS = [
  { value: "full", label: "Full Round (all 13 phases)" },
  { value: "shortened", label: "Shortened (no grand/final crossfire)" },
  { value: "speech_stage_drill", label: "Speech Stage Drill" },
  { value: "evidence_testing", label: "Evidence Testing" },
];

const SIDE_TILES: Array<{ value: "pro" | "con"; label: string; description: string }> = [
  { value: "pro", label: "Pro", description: "You argue for the resolution." },
  { value: "con", label: "Con", description: "You argue against the resolution." },
];

function TierTile({
  selected,
  label,
  description,
  onClick,
}: {
  selected: boolean;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-lg border p-4 text-left space-y-1 transition-colors ${
        selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent"
      }`}
    >
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  );
}

function PrepCountdown({
  config,
  onDone,
  onSkip,
  onBack,
}: {
  config: RoundSimulationConfig;
  onDone: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
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

  return (
    <div className="max-w-md mx-auto space-y-6 p-6">
      <div className="text-center space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prep Time</p>
        <p className="text-5xl font-mono font-semibold tabular-nums">
          {minutes}:{String(secs).padStart(2, "0")}
        </p>
        <p className="text-sm text-muted-foreground">Review the room setup before your partner joins.</p>
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

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onSkip}
          className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
        >
          Skip Prep &amp; Create Room
        </button>
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back to setup
        </button>
      </div>
    </div>
  );
}

export function MatchLobby({ onStart, loading, mode }: Props) {
  const [config, setConfig] = useState<RoundSimulationConfig>(defaultRoundConfig());
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [step, setStep] = useState<"setup" | "prep">("setup");

  function patch(updates: Partial<RoundSimulationConfig>) {
    setConfig((c) => ({ ...c, ...updates }));
  }

  function handlePrimaryCta() {
    // Solo hands off to page.tsx immediately — it shows its own prep step
    // after the round (and a real opponent briefing) exist. Multiplayer has
    // no round yet at this point, so it still preps here, before creating
    // the room, same as before.
    if (mode === "multiplayer" && config.prep_time > 0) {
      setStep("prep");
    } else {
      onStart(config);
    }
  }

  if (step === "prep") {
    return (
      <PrepCountdown
        config={config}
        onDone={() => onStart(config)}
        onSkip={() => onStart(config)}
        onBack={() => setStep("setup")}
      />
    );
  }

  const selectedLevel = opponentLevelFromDifficulty(config.opponent_difficulty);
  const matchPreview = matchPreviewText(config);

  return (
    <div className="max-w-2xl mx-auto space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === "solo" ? "Set Up Your Match" : "Set Up a Partner Room"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === "solo"
            ? "Pick a side, an opponent, and start — the AI is constrained to your saved preparation."
            : "Configure the room. Your partner joins with an invite code once it's created."}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Resolution</h2>
        <textarea
          className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[64px] resize-none"
          placeholder="Enter the resolution text..."
          value={config.resolution}
          onChange={(e) => patch({ resolution: e.target.value })}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Your Side</h2>
        <div className="grid grid-cols-2 gap-3">
          {SIDE_TILES.map((tile) => (
            <TierTile
              key={tile.value}
              selected={config.student_side === tile.value}
              label={tile.label}
              description={tile.description}
              onClick={() => patch({ student_side: tile.value })}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Choose Your Training Opponent
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {OPPONENT_LEVEL_OPTIONS.map((opt) => (
            <TierTile
              key={opt.value}
              selected={selectedLevel === opt.value}
              label={opt.label}
              description={opt.description}
              onClick={() => patch({ opponent_difficulty: OPPONENT_LEVEL_TO_DIFFICULTY[opt.value] })}
            />
          ))}
        </div>
        {matchPreview && (
          <p className="text-xs text-muted-foreground rounded-md border border-dashed px-3 py-2">
            {matchPreview}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Prep Time</h2>
        <div className="flex flex-wrap gap-2">
          {prepTimeOptions().map((seconds) => (
            <button
              key={seconds}
              type="button"
              onClick={() => patch({ prep_time: seconds })}
              aria-pressed={config.prep_time === seconds}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                config.prep_time === seconds ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"
              }`}
            >
              {prepTimeLabel(seconds)}
            </button>
          ))}
        </div>
      </section>

      <details
        className="rounded-lg border p-4"
        open={advancedOpen}
        onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary className="text-sm font-semibold cursor-pointer select-none">More options</summary>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground mb-1 block">Format</span>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={config.format}
                onChange={(e) => patch({ format: e.target.value as RoundSimulationConfig["format"] })}
              >
                {FORMAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-muted-foreground mb-1 block">Speaking Order</span>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={config.speaking_order}
                onChange={(e) => patch({ speaking_order: e.target.value as "first" | "second" })}
              >
                <option value="first">Speak First</option>
                <option value="second">Speak Second</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-muted-foreground mb-1 block">Speaker Role</span>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={config.speaker_role}
                onChange={(e) => patch({ speaker_role: e.target.value as "first" | "second" })}
              >
                <option value="first">First Speaker</option>
                <option value="second">Second Speaker</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-muted-foreground mb-1 block">Judge Type</span>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={config.judge_type}
                onChange={(e) => patch({ judge_type: e.target.value })}
              >
                {JUDGE_TYPES.map((j) => (
                  <option key={j.value} value={j.value}>{j.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.coaching_hints_enabled}
                onChange={(e) => patch({ coaching_hints_enabled: e.target.checked })}
                className="rounded"
              />
              Show coaching hints between speeches
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={config.pauses_allowed}
                onChange={(e) => patch({ pauses_allowed: e.target.checked })}
                className="rounded"
              />
              Allow pausing the round
            </label>
          </div>
        </div>
      </details>

      <div className="pt-2">
        <p className="text-xs text-muted-foreground mb-4">
          This alpha doesn&#39;t yet let you pick specific evidence for the AI opponent here — it
          argues from resolutional analysis instead of your saved cards.
        </p>
        <button
          onClick={handlePrimaryCta}
          disabled={loading || !isLobbyConfigValid(config)}
          className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50 transition-opacity"
        >
          {loading
            ? mode === "solo" ? "Starting match..." : "Creating room..."
            : mode === "solo" ? "Start Match" : "Create Room"}
        </button>
      </div>
    </div>
  );
}
