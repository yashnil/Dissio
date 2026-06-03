import { Progress } from "@/components/ui/progress";
import type { FeedbackScores } from "@/types";

const DIMS: { key: keyof FeedbackScores; label: string; description: string }[] = [
  { key: "clash",            label: "Clash",        description: "Directly engaging opponent arguments" },
  { key: "weighing",         label: "Weighing",     description: "Comparing impacts and proving yours matter more" },
  { key: "extensions",       label: "Extensions",   description: "Building on your arguments with new analysis" },
  { key: "drops",            label: "Drops",        description: "Covering all relevant arguments without gaps" },
  { key: "judge_adaptation", label: "Judge Adapt.", description: "Tailoring strategy to judge preferences" },
];

function barColor(pct: number): string {
  if (pct >= 70) return "bg-lav";
  if (pct >= 50) return "bg-warn";
  return "bg-danger";
}

function getLowScoreContext(key: keyof FeedbackScores): string {
  const contexts: Record<keyof FeedbackScores, string> = {
    clash: "You may not be directly addressing opponent arguments. Try explicitly refuting their claims.",
    weighing: "Your impacts need clearer comparison. Explain why your harm outweighs theirs on magnitude, probability, or timeframe.",
    extensions: "You need to develop your arguments further. Don't just repeat claims—add new warrants or evidence.",
    drops: "You're missing key arguments. Make sure to cover all contentions and respond to major turns.",
    judge_adaptation: "Your delivery may not match judge preferences. Check judge paradigms and adjust accordingly.",
  };
  return contexts[key];
}

export default function ScoreBreakdown({ scores, speechType }: { scores: FeedbackScores; speechType?: string }) {
  // Find lowest scoring dimension
  const lowestDim = DIMS.reduce((lowest, dim) =>
    scores[dim.key] < scores[lowest.key] ? dim : lowest
  , DIMS[0]);

  return (
    <div className="flex flex-col gap-3">
      {/* Rubric Label */}
      {speechType && (
        <p className="text-xs text-ink-faint">
          Rubric: <span className="font-medium text-ink-subtle capitalize">{speechType}</span> Speech
        </p>
      )}

      {/* Score Bars */}
      {DIMS.map(({ key, label, description }, i) => {
        const value = scores[key];
        const pct   = (value / 20) * 100;
        return (
          <div key={key} className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-sm text-ink-subtle" title={description}>
                {label}
              </span>
              <Progress
                value={value}
                max={20}
                colorClass={barColor(pct)}
                animated
                animationDelay={0.1 + i * 0.08}
                className="h-1"
              />
              <span className="w-10 text-right text-xs font-semibold tabular-nums text-ink-muted">
                {value}/20
              </span>
            </div>
            {/* Show context for lowest scoring dimension */}
            {key === lowestDim.key && pct < 70 && (
              <p className="ml-28 text-xs leading-relaxed text-amber">
                ⚠ {getLowScoreContext(key)}
              </p>
            )}
          </div>
        );
      })}

      {/* Dimension Explanations */}
      <div className="flex flex-col gap-1 border-t border-hairline pt-2 text-xs text-ink-faint">
        <p className="font-medium text-ink-subtle">What these scores measure:</p>
        {DIMS.map(({ label, description }) => (
          <p key={label}>
            <span className="font-medium text-ink">{label}:</span> {description}
          </p>
        ))}
      </div>
    </div>
  );
}
