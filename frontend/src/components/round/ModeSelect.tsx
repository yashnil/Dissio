"use client";

import { useState } from "react";
import { isValidInviteCodeInput } from "@/lib/roomModel";

interface Props {
  onChooseSolo: () => void;
  onChooseCreateRoom: () => void;
  onJoinRoom: (inviteCode: string, displayName?: string) => void;
  loading?: boolean;
  error?: string | null;
}

type Step = "choice" | "multiplayer" | "join";

export function ModeSelect({ onChooseSolo, onChooseCreateRoom, onJoinRoom, loading, error }: Props) {
  const [step, setStep] = useState<Step>("choice");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");

  if (step === "choice") {
    return (
      <div className="max-w-2xl mx-auto space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Full Round</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Practice a complete Public Forum round against an AI opponent.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={onChooseSolo}
            className="rounded-lg border p-5 text-left space-y-1.5 hover:bg-accent transition-colors"
          >
            <p className="text-sm font-semibold">Practice Solo</p>
            <p className="text-xs text-muted-foreground">
              Just you and the AI opponent. Turn-based, at your own pace.
            </p>
          </button>
          <button
            onClick={() => setStep("multiplayer")}
            className="rounded-lg border p-5 text-left space-y-1.5 hover:bg-accent transition-colors"
          >
            <p className="text-sm font-semibold">Practice with a Partner</p>
            <p className="text-xs text-muted-foreground">
              Create or join a shared room. Still turn-based — no live audio yet.
            </p>
          </button>
        </div>
      </div>
    );
  }

  if (step === "multiplayer") {
    return (
      <div className="max-w-md mx-auto space-y-6 p-6">
        <button
          onClick={() => setStep("choice")}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back
        </button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Multiplayer Room</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create a new room, or join one with an invite code.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <button
            onClick={onChooseCreateRoom}
            disabled={loading}
            className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Create a Room
          </button>
          <button
            onClick={() => setStep("join")}
            disabled={loading}
            className="rounded-md border px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Join with a Code
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6 p-6">
      <button
        onClick={() => setStep("multiplayer")}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        ← Back
      </button>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Join a Room</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enter the invite code your partner shared with you.
        </p>
      </div>
      <div className="space-y-3">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground mb-1 block">Invite code</span>
          <input
            className="w-full rounded-md border bg-background px-3 py-2 text-sm tracking-widest uppercase"
            placeholder="XXXXXXXX"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && isValidInviteCodeInput(code) && onJoinRoom(code, displayName)}
            maxLength={12}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground mb-1 block">
            Display name (optional)
          </span>
          <input
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="How your partner sees you"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
          />
        </label>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          onClick={() => onJoinRoom(code, displayName || undefined)}
          disabled={loading || !isValidInviteCodeInput(code)}
          className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Joining..." : "Join Room"}
        </button>
      </div>
    </div>
  );
}
