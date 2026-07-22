"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { ApiError } from "@/lib/api";
import * as roundApi from "@/lib/roundApi";
import * as roomApi from "@/lib/roomApi";
import { RoundSetupForm } from "@/components/round/RoundSetupForm";
import { RoundPhaseHeader } from "@/components/round/RoundPhaseHeader";
import { RoundFlow } from "@/components/round/RoundFlow";
import { RoundSpeechCapture } from "@/components/round/RoundSpeechCapture";
import { CrossfireCapture } from "@/components/round/CrossfireCapture";
import { RoundBallotView } from "@/components/round/RoundBallotView";
import { RoundDrillsView } from "@/components/round/RoundDrillsView";
import { ModeSelect } from "@/components/round/ModeSelect";
import { RoomLobby } from "@/components/round/RoomLobby";
import { isCrossfire, upsertCrossfireExchange } from "@/lib/roundModel";
import { canSubmitCurrentTurn, disabledSubmitReason, myParticipant } from "@/lib/roomModel";
import type {
  CrossfireExchange,
  RoomRole,
  RoundArgument,
  RoundDecision,
  RoundDrill,
  RoundRoom,
  RoundRoomParticipant,
  RoundSide,
  RoundSimulation,
  RoundSimulationConfig,
  RoundSpeech,
  RoundStateResponse,
} from "@/types/round";

type View =
  | "mode-select"
  | "setup"
  | "room-setup"
  | "lobby"
  | "round"
  | "flow"
  | "evidence"
  | "ballot"
  | "drills";
type AuthState = "loading" | "signed-in" | "signed-out";
type Mode = "solo" | "multiplayer" | null;

const ACTIVE_ROUND_KEY = "dissio_active_round";
const ACTIVE_ROOM_KEY = "dissio_active_multiplayer_room";

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 px-3 py-2 flex items-start justify-between gap-2">
      <p className="text-xs text-red-700 dark:text-red-400">{message}</p>
      <button onClick={onDismiss} className="text-red-400 hover:text-red-600 text-xs shrink-0">✕</button>
    </div>
  );
}

export default function RoundSimulationPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [userId, setUserId] = useState<string | null>(null);

  const [view, setView] = useState<View>("mode-select");
  const [mode, setMode] = useState<Mode>(null);
  const [simulation, setSimulation] = useState<RoundSimulation | null>(null);
  const [roundState, setRoundState] = useState<RoundStateResponse | null>(null);
  const [speeches, setSpeeches] = useState<RoundSpeech[]>([]);
  const [flowArgs, setFlowArgs] = useState<RoundArgument[]>([]);
  const [decision, setDecision] = useState<RoundDecision | null>(null);
  const [drills, setDrills] = useState<RoundDrill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Multiplayer-only state — unused, and never read, in solo mode.
  const [room, setRoom] = useState<RoundRoom | null>(null);
  const [participants, setParticipants] = useState<RoundRoomParticipant[]>([]);

  // ── Auth check ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const sb = createClient();
    sb.auth.getSession().then(({ data }) => {
      setAuthState(data.session ? "signed-in" : "signed-out");
      setUserId(data.session?.user.id ?? null);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      setAuthState(session ? "signed-in" : "signed-out");
      setUserId(session?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // ── Recover round/room from localStorage ───────────────────────────────────

  useEffect(() => {
    if (authState !== "signed-in") return;

    const savedRoomId = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_ROOM_KEY) : null;
    if (savedRoomId) {
      setMode("multiplayer");
      roomApi.getRoom(savedRoomId).then((state) => {
        setRoom(state.room);
        setParticipants(state.participants);
        const rs = state.round_state;
        if (rs && rs.simulation.status !== "completed" && rs.simulation.status !== "abandoned") {
          setRoundState(rs);
          setSimulation(rs.simulation);
          setSpeeches(rs.speeches);
          setFlowArgs(rs.flow_arguments);
          if (rs.decision) setDecision(rs.decision);
        }
        setView(state.room.status === "waiting" ? "lobby" : "round");
      }).catch(() => {
        localStorage.removeItem(ACTIVE_ROOM_KEY);
      });
      return;
    }

    // Read from new key, fall back to legacy key and migrate
    const saved = typeof window !== "undefined"
      ? localStorage.getItem(ACTIVE_ROUND_KEY) ??
        (() => { const v = localStorage.getItem("roundlab_active_round"); if (v) { localStorage.setItem(ACTIVE_ROUND_KEY, v); localStorage.removeItem("roundlab_active_round"); } return v; })()
      : null;
    if (!saved) return;
    setMode("solo");
    // Silently try to recover; clear if not found
    roundApi.getRoundState(saved).then((state) => {
      if (state.simulation.status !== "completed" && state.simulation.status !== "abandoned") {
        setRoundState(state);
        setSimulation(state.simulation);
        setSpeeches(state.speeches);
        setFlowArgs(state.flow_arguments);
        if (state.decision) setDecision(state.decision);
        setView("round");
      } else {
        localStorage.removeItem(ACTIVE_ROUND_KEY);
      }
    }).catch(() => {
      localStorage.removeItem(ACTIVE_ROUND_KEY);
    });
  }, [authState]);

  // ── State refresh ───────────────────────────────────────────────────────────

  const refreshState = useCallback(async (roundId: string) => {
    try {
      const state = await roundApi.getRoundState(roundId);
      setRoundState(state);
      setSimulation(state.simulation);
      setSpeeches(state.speeches);
      setFlowArgs(state.flow_arguments);
      if (state.decision) setDecision(state.decision);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        localStorage.removeItem(ACTIVE_ROUND_KEY);
        localStorage.removeItem(ACTIVE_ROOM_KEY);
        setView("mode-select");
        setSimulation(null);
      }
    }
  }, []);

  const refreshRoom = useCallback(async (roomId: string) => {
    try {
      const state = await roomApi.getRoom(roomId);
      setRoom(state.room);
      setParticipants(state.participants);
      if (state.round_state) {
        setRoundState(state.round_state);
        setSimulation(state.round_state.simulation);
        setSpeeches(state.round_state.speeches);
        setFlowArgs(state.round_state.flow_arguments);
        if (state.round_state.decision) setDecision(state.round_state.decision);
      }
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    }
  }, []);

  // ── Solo handlers ────────────────────────────────────────────────────────────

  async function handleCreateRound(config: RoundSimulationConfig) {
    setLoading(true);
    setError(null);
    try {
      const sim = await roundApi.createRound(config);
      setMode("solo");
      localStorage.setItem(ACTIVE_ROUND_KEY, sim.id);
      // Build the AI opponent's plan before the round becomes active — the
      // opponent speech endpoint requires this row to exist, even when no
      // prep material was selected (it falls back to resolutional analysis).
      await roundApi.loadPreparation(sim.id, {
        cardIds: config.approved_card_ids,
        blockfileIds: config.approved_blockfile_ids,
        frontlineIds: config.approved_frontline_ids,
        prepWorkspaceId: config.prep_workspace_id,
      });
      const started = await roundApi.startRound(sim.id);
      setSimulation(started);
      await refreshState(sim.id);
      setView("round");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to create round.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // ── Multiplayer handlers ─────────────────────────────────────────────────────

  async function handleCreateRoom(config: RoundSimulationConfig) {
    setLoading(true);
    setError(null);
    try {
      const state = await roomApi.createRoom({ config });
      setMode("multiplayer");
      localStorage.setItem(ACTIVE_ROOM_KEY, state.room.id);
      setRoom(state.room);
      setParticipants(state.participants);
      if (state.round_state) {
        setRoundState(state.round_state);
        setSimulation(state.round_state.simulation);
      }
      setView("lobby");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to create room.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinRoom(inviteCode: string, displayName?: string) {
    setLoading(true);
    setError(null);
    try {
      const state = await roomApi.joinRoom(inviteCode, displayName);
      setMode("multiplayer");
      localStorage.setItem(ACTIVE_ROOM_KEY, state.room.id);
      setRoom(state.room);
      setParticipants(state.participants);
      if (state.round_state) {
        setRoundState(state.round_state);
        setSimulation(state.round_state.simulation);
        setSpeeches(state.round_state.speeches);
        setFlowArgs(state.round_state.flow_arguments);
        if (state.round_state.decision) setDecision(state.round_state.decision);
      }
      setView("lobby");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Couldn't join that room — check the code and try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignParticipant(
    participantId: string,
    opts: { role?: RoomRole; side?: RoundSide },
  ) {
    if (!room) return;
    setError(null);
    try {
      await roomApi.updateRoomParticipant(room.id, participantId, opts);
      await refreshRoom(room.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't update that participant.");
    }
  }

  async function handleEnterRoom() {
    if (!room) return;
    setLoading(true);
    setError(null);
    try {
      const isOwner = room.owner_user_id === userId;
      if (isOwner && room.status === "waiting" && simulation) {
        await roundApi.loadPreparation(simulation.id, {
          cardIds: simulation.config.approved_card_ids,
          blockfileIds: simulation.config.approved_blockfile_ids,
          frontlineIds: simulation.config.approved_frontline_ids,
          prepWorkspaceId: simulation.config.prep_workspace_id,
        });
        await roundApi.startRound(simulation.id);
      }
      await refreshRoom(room.id);
      setView("round");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't enter the round.");
    } finally {
      setLoading(false);
    }
  }

  // ── Shared round handlers (solo + multiplayer) ──────────────────────────────

  async function handleSpeechSubmitted(speech: RoundSpeech) {
    setSpeeches((s) => [...s, speech]);
    if (simulation) await refreshState(simulation.id);
  }

  async function handleCrossfireExchangeSaved(exchange: CrossfireExchange) {
    setRoundState((prev) =>
      prev ? { ...prev, active_crossfire: upsertCrossfireExchange(prev.active_crossfire, exchange) } : prev,
    );
    if (simulation) await refreshState(simulation.id);
  }

  async function handleOpponentSpeechRequested() {
    if (!simulation || !roundState) return;
    setLoading(true);
    setError(null);
    try {
      const idempotencyKey = `opponent-${simulation.id}-${roundState.current_phase}`;
      const speech = await roundApi.generateOpponentSpeech(
        simulation.id,
        roundState.current_phase,
        idempotencyKey,
      );
      setSpeeches((s) => {
        const exists = s.some((x) => x.id === speech.id);
        return exists ? s : [...s, speech];
      });
      await refreshState(simulation.id);
      await handleAdvancePhase();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to generate opponent speech.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdvancePhase() {
    if (!simulation || !roundState) return;
    setLoading(true);
    try {
      const updated = await roundApi.advancePhase(simulation.id);
      setSimulation(updated);
      await refreshState(simulation.id);
    } catch (e) {
      // Phase advance can fail if already at final phase — not an error to surface
      if (e instanceof ApiError && e.status !== 400) {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateDecision() {
    if (!simulation) return;
    setLoading(true);
    setError(null);
    try {
      const d = await roundApi.generateDecision(simulation.id);
      setDecision(d);
      setView("ballot");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to generate decision.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleRejudge(judgeType: string) {
    if (!simulation) return;
    setLoading(true);
    setError(null);
    try {
      const d = await roundApi.rejudgeRound(simulation.id, judgeType);
      setDecision(d);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Rejudge failed.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateDrills() {
    if (!simulation) return;
    setLoading(true);
    try {
      const d = await roundApi.generateDrills(simulation.id);
      setDrills(d);
      setView("drills");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to generate drills.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleExit() {
    localStorage.removeItem(ACTIVE_ROUND_KEY);
    localStorage.removeItem(ACTIVE_ROOM_KEY);
    setSimulation(null);
    setRoundState(null);
    setSpeeches([]);
    setFlowArgs([]);
    setDecision(null);
    setDrills([]);
    setRoom(null);
    setParticipants([]);
    setMode(null);
    setView("mode-select");
    setError(null);
  }

  // ── Loading / auth states ───────────────────────────────────────────────────

  if (authState === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (authState === "signed-out") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center px-4 py-20">
        <h1 className="text-xl font-semibold">Sign in to practice a full round</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          Full-round simulation uses your saved evidence cards. Sign in to get started.
        </p>
        <button
          onClick={() => router.push("/login")}
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
        >
          Sign in
        </button>
      </div>
    );
  }

  const isCompleted =
    simulation?.status === "completed" ||
    simulation?.current_phase === "completed";

  // ── Mode select / setup / lobby views ───────────────────────────────────────

  if (view === "mode-select") {
    return (
      <ModeSelect
        onChooseSolo={() => setView("setup")}
        onChooseCreateRoom={() => setView("room-setup")}
        onJoinRoom={handleJoinRoom}
        loading={loading}
        error={error}
      />
    );
  }

  if (view === "setup") {
    return (
      <div className="flex flex-col">
        <div className="py-8">
          <RoundSetupForm onStart={handleCreateRound} loading={loading} />
          {error && (
            <p className="text-xs text-red-600 text-center mt-4">{error}</p>
          )}
        </div>
      </div>
    );
  }

  if (view === "room-setup") {
    return (
      <div className="flex flex-col">
        <div className="py-8">
          <RoundSetupForm onStart={handleCreateRoom} loading={loading} />
          {error && (
            <p className="text-xs text-red-600 text-center mt-4">{error}</p>
          )}
        </div>
      </div>
    );
  }

  if (view === "lobby") {
    if (!room) {
      return (
        <div className="flex flex-1 items-center justify-center py-20">
          <p className="text-sm text-muted-foreground">Loading room...</p>
        </div>
      );
    }
    const viewer = myParticipant(participants, userId) ?? participants.find((p) => p.user_id === room.owner_user_id);
    if (!viewer) {
      return (
        <div className="flex flex-1 items-center justify-center py-20">
          <p className="text-sm text-muted-foreground">Loading room...</p>
        </div>
      );
    }
    return (
      <RoomLobby
        room={room}
        participants={participants}
        viewerParticipant={viewer}
        viewerUserId={userId ?? ""}
        studentSide={simulation?.config.student_side ?? "pro"}
        onAssignParticipant={handleAssignParticipant}
        onEnterRound={handleEnterRoom}
        onRefresh={() => refreshRoom(room.id)}
        loading={loading}
        error={error}
      />
    );
  }

  if (!simulation || !roundState) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">Loading round...</p>
      </div>
    );
  }

  // ── Round view (shared by solo + multiplayer) ───────────────────────────────

  const viewerParticipant = mode === "multiplayer" ? myParticipant(participants, userId) : undefined;
  const studentSide = simulation.config.student_side;
  const turnGate =
    mode === "multiplayer"
      ? {
          allowed: canSubmitCurrentTurn(viewerParticipant, studentSide),
          reason: disabledSubmitReason(viewerParticipant, studentSide),
        }
      : undefined;

  return (
    <div className="flex flex-col">
      <RoundPhaseHeader
        phase={roundState.current_phase}
        phaseLabel={roundState.phase_label}
        studentSpeaksNow={roundState.student_speaks_now}
        studentSide={simulation.config.student_side}
        timeLimitSeconds={roundState.time_limit_seconds}
        phaseStartedAt={roundState.phase_started_at}
        status={simulation.status}
        coachingHint={
          simulation.config.coaching_hints_enabled
            ? roundState.coaching_hint
            : undefined
        }
      />

      {/* View tabs */}
      <div className="border-b px-4">
        <div className="flex gap-1 -mb-px">
          {(["round", "flow", "ballot", "drills"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-2.5 text-sm border-b-2 transition-colors capitalize ${
                view === v
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {v}
            </button>
          ))}
          <button
            onClick={handleExit}
            className="ml-auto px-3 py-2.5 text-xs text-muted-foreground hover:text-red-500 transition-colors"
          >
            Exit round
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {turnGate && !turnGate.allowed && (
        <div className="mx-4 mt-3 rounded-md border bg-muted/20 px-3 py-2">
          <p className="text-xs text-muted-foreground">{turnGate.reason}</p>
        </div>
      )}

      <div className="flex-1 p-4">
        {view === "round" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
            <div className="space-y-4">
              <h2 className="text-sm font-semibold">{roundState.phase_label}</h2>
              {isCompleted ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Round complete. Generate the final decision and post-round drills.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={handleGenerateDecision}
                      disabled={loading}
                      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    >
                      {loading ? "Generating..." : "Generate Decision"}
                    </button>
                    {decision && (
                      <button
                        onClick={handleGenerateDrills}
                        disabled={loading}
                        className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
                      >
                        Generate Drills
                      </button>
                    )}
                  </div>
                </div>
              ) : isCrossfire(roundState.current_phase) ? (
                <CrossfireCapture
                  roundId={simulation.id}
                  phase={roundState.current_phase}
                  studentSide={simulation.config.student_side}
                  exchanges={roundState.active_crossfire ?? []}
                  crossfireEffects={roundState.crossfire_effects ?? []}
                  onExchangeSaved={handleCrossfireExchangeSaved}
                  onAdvancePhase={handleAdvancePhase}
                  isLoading={loading}
                  turnGate={turnGate}
                />
              ) : (
                <RoundSpeechCapture
                  roundId={simulation.id}
                  phase={roundState.current_phase}
                  studentSide={simulation.config.student_side}
                  isStudentTurn={roundState.student_speaks_now}
                  onSpeechSubmitted={handleSpeechSubmitted}
                  onOpponentSpeechRequested={handleOpponentSpeechRequested}
                  onAdvancePhase={handleAdvancePhase}
                  isLoading={loading}
                  turnGate={turnGate}
                />
              )}

              {speeches.length > 0 && (
                <div className="space-y-2 pt-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Speeches
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {speeches.slice(-3).map((s) => (
                      <div
                        key={s.id}
                        className="rounded-md border px-3 py-2 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium capitalize">
                            {s.phase.replace(/_/g, " ")}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${
                              s.is_ai
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            }`}
                          >
                            {s.is_ai ? "AI" : "You"}
                          </span>
                        </div>
                        {s.is_ai && s.is_fallback && (
                          <p className="text-amber-600 dark:text-amber-400">
                            ⚠ Template response — the AI opponent service wasn&#39;t available, so this
                            is a deterministic fallback, not a generated argument.
                          </p>
                        )}
                        {s.transcript && (
                          <p className="text-muted-foreground line-clamp-2">
                            {s.transcript.slice(0, 120)}...
                          </p>
                        )}
                        {s.legality_violations.length > 0 && (
                          <p className="text-amber-600 dark:text-amber-400">
                            ⚠ {s.legality_violations.length} legality issue(s)
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="hidden lg:block">
              <RoundFlow arguments={flowArgs} crossfireEffects={roundState.crossfire_effects} />
            </div>
          </div>
        )}

        {view === "flow" && (
          <RoundFlow arguments={flowArgs} crossfireEffects={roundState.crossfire_effects} />
        )}

        {view === "ballot" && (
          decision ? (
            <RoundBallotView
              decision={decision}
              allArguments={flowArgs}
              onRejudge={handleRejudge}
              isLoading={loading}
            />
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                No decision yet. Complete the round first.
              </p>
              {isCompleted && (
                <button
                  onClick={handleGenerateDecision}
                  disabled={loading}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {loading ? "Generating..." : "Generate Decision"}
                </button>
              )}
            </div>
          )
        )}

        {view === "drills" && (
          <RoundDrillsView
            roundId={simulation.id}
            drills={drills}
            onGenerateDrills={handleGenerateDrills}
            isLoading={loading}
          />
        )}
      </div>
    </div>
  );
}
