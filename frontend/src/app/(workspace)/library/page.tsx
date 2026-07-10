"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Search, Plus, FileText, Network, X } from "lucide-react";
import { SelectedItemPanel } from "@/components/library/SelectedItemPanel";
import {
  buildLibraryUrl,
  backToPrepHref,
  LIBRARY_SELECTION_PARAMS,
  type LibraryItemKind,
} from "@/lib/prepModel";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import type {
  LibrarySearchResult,
  LibrarySearchResponse,
  Resolution,
  Blockfile,
  Frontline,
  Side,
} from "@/types/library";
import { BlockfileEditor } from "@/components/library/BlockfileEditor";

// ── Side selector chip ─────────────────────────────────────────────────────

const SIDE_COLORS: Record<Side, string> = {
  pro: "bg-sky-100 text-sky-800 border-sky-200",
  con: "bg-rose-100 text-rose-800 border-rose-200",
  neutral: "bg-surface-muted text-ink-subtle border-border",
};

// ── Library card row ───────────────────────────────────────────────────────

function LibraryCardRow({
  result,
  onSelect,
  highlighted = false,
}: {
  result: LibrarySearchResult;
  onSelect: () => void;
  highlighted?: boolean;
}) {
  const verdictColor =
    result.support_verdict === "supported"
      ? "text-ok"
      : result.support_verdict === "partially_supported"
        ? "text-amber-600"
        : result.support_verdict
          ? "text-danger"
          : "text-ink-subtle";

  return (
    <button
      onClick={onSelect}
      aria-current={highlighted ? "true" : undefined}
      className={`w-full text-left rounded-xl border hover:border-lav/30 hover:bg-surface-muted/60 transition-all px-4 py-3 space-y-1.5 ${
        highlighted ? "border-lav/50 ring-2 ring-lav/30 bg-lav/5" : "border-border"
      }`}
    >
      {highlighted && (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-lav">Selected</p>
      )}
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-ink truncate">
            {result.tag || "Untitled card"}
          </p>
          <p className="text-[11px] text-ink-subtle truncate">{result.cite}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {result.side && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border capitalize ${SIDE_COLORS[result.side as Side] ?? "bg-surface-muted"}`}>
              {result.side}
            </span>
          )}
          {result.support_verdict && (
            <span className={`text-[10px] font-medium ${verdictColor}`}>
              {result.support_verdict.replace("_", " ")}
            </span>
          )}
        </div>
      </div>
      {result.body_preview && (
        <p className="text-[11px] text-ink-subtle line-clamp-2 leading-relaxed">
          {result.body_preview}
        </p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {result.argument_title && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-lav/10 text-lav border border-lav/20">
            {result.argument_title}
          </span>
        )}
        {result.tags.map((t) => (
          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-muted border border-border text-ink-subtle">
            {t}
          </span>
        ))}
        <span className="text-[10px] text-ink-faint ml-auto">
          {new Date(result.saved_at).toLocaleDateString()}
        </span>
      </div>
    </button>
  );
}

// ── Create blockfile mini-form ─────────────────────────────────────────────

function NewBlockfileForm({
  userId,
  resolutions,
  onCreated,
  onCancel,
}: {
  userId: string;
  resolutions: Resolution[];
  onCreated: (bf: Blockfile) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [resolutionId, setResolutionId] = useState("");
  const [side, setSide] = useState<Side>("pro");
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const bf = await apiFetch("/library/blockfiles", {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          title: title.trim(),
          resolution_id: resolutionId || undefined,
          side,
        }),
      }) as Blockfile;
      onCreated(bf);
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-muted p-4 space-y-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Blockfile name (e.g., Neg frontlines on Economy)"
        className="w-full text-[13px] border border-border rounded-md px-2.5 py-1.5 bg-surface-1 text-ink"
        autoFocus
      />
      <div className="flex gap-2">
        <select
          value={resolutionId}
          onChange={(e) => setResolutionId(e.target.value)}
          className="flex-1 text-[12px] border border-border rounded-md px-2 py-1.5 bg-surface-1 text-ink"
        >
          <option value="">No resolution</option>
          {resolutions.map((r) => (
            <option key={r.id} value={r.id}>{r.title}</option>
          ))}
        </select>
        <select
          value={side}
          onChange={(e) => setSide(e.target.value as Side)}
          className="text-[12px] border border-border rounded-md px-2 py-1.5 bg-surface-1 text-ink"
        >
          <option value="pro">Pro</option>
          <option value="con">Con</option>
          <option value="neutral">Neutral</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button
          onClick={create}
          disabled={saving || !title.trim()}
          className="flex-1 text-[12px] py-1.5 rounded-md bg-ink text-canvas disabled:opacity-40"
        >
          {saving ? "Creating…" : "Create"}
        </button>
        <button
          onClick={onCancel}
          className="text-[12px] px-3 py-1.5 rounded-md border border-border text-ink-subtle"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

type Tab = "cards" | "blockfiles" | "frontlines";

function LibraryPageContent() {
  const [userId, setUserId] = useState<string>("");

  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!data.user) { router.replace("/login"); return; }
        setUserId(data.user.id ?? "");
      });
  }, [router]);

  // Selected item: the URL params (?card= / ?argument= / ?frontline=) are the
  // single source of truth — deep links and in-page clicks go through the same
  // path. IDs live in the URL only; the panel shows human labels.
  let selectedItem: { kind: LibraryItemKind; id: string } | null = null;
  for (const kind of LIBRARY_SELECTION_PARAMS) {
    const id = searchParams.get(kind);
    if (id) { selectedItem = { kind, id }; break; }
  }

  // Return context from Tournament Prep (from=prep&workspace=…) — preserved
  // across in-page selections so "Back to Tournament Prep" keeps working.
  const backHref = backToPrepHref(searchParams.get("from"), searchParams.get("workspace"));

  const [tab, setTab] = useState<Tab>("cards");
  const [query, setQuery] = useState("");
  const [resolutionId, setResolutionId] = useState(searchParams.get("resolution") ?? "");

  function selectItem(kind: LibraryItemKind, id: string) {
    router.replace(
      buildLibraryUrl({
        [kind]: id,
        resolution: resolutionId || null,
        from: searchParams.get("from"),
        workspace: searchParams.get("workspace"),
      }),
      { scroll: false },
    );
  }

  function dismissSelected() {
    // Selection + return context are cleared; normal filters survive.
    router.replace(buildLibraryUrl({ resolution: resolutionId || null }), { scroll: false });
  }
  const [sideFilter, setSideFilter] = useState<Side | "">("");
  const [verdictFilter, setVerdictFilter] = useState("");

  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [blockfiles, setBlockfiles] = useState<Blockfile[]>([]);
  const [selectedBlockfile, setSelectedBlockfile] = useState<Blockfile | null>(null);
  const [showNewBlockfile, setShowNewBlockfile] = useState(false);

  const [results, setResults] = useState<LibrarySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [frontlines, setFrontlines] = useState<Frontline[] | null>(null);

  const loadResolutions = useCallback(async () => {
    if (!userId) return;
    const data = await apiFetch(`/library/resolutions?user_id=${userId}&active_only=true`);
    setResolutions(data as Resolution[]);
  }, [userId]);

  const loadBlockfiles = useCallback(async () => {
    if (!userId) return;
    const data = await apiFetch(
      `/library/blockfiles?user_id=${userId}${resolutionId ? `&resolution_id=${resolutionId}` : ""}`,
    );
    setBlockfiles(data as Blockfile[]);
  }, [userId, resolutionId]);

  const loadFrontlines = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await apiFetch<Frontline[]>(`/library/frontlines?user_id=${userId}`);
      // The endpoint has no resolution filter; each row carries resolution_id.
      setFrontlines(resolutionId ? data.filter((f) => f.resolution_id === resolutionId) : data);
    } catch {
      setFrontlines([]);
    }
  }, [userId, resolutionId]);

  const search = useCallback(async () => {
    if (!userId) return;
    setSearching(true);
    try {
      const data = await apiFetch("/library/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          query: query || undefined,
          resolution_id: resolutionId || undefined,
          side: sideFilter || undefined,
          support_verdict: verdictFilter || undefined,
          limit: 40,
        }),
      }) as LibrarySearchResponse;
      setResults(data.results);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [userId, query, resolutionId, sideFilter, verdictFilter]);

  // Loaders are deferred a tick so effects never set state synchronously; the
  // cards timer also debounces typing in the search box.
  useEffect(() => {
    const t = setTimeout(() => { loadResolutions(); }, 0);
    return () => clearTimeout(t);
  }, [loadResolutions]);

  useEffect(() => {
    if (tab !== "cards") return;
    const t = setTimeout(() => { search(); }, 250);
    return () => clearTimeout(t);
  }, [tab, search]);

  useEffect(() => {
    if (tab !== "blockfiles") return;
    const t = setTimeout(() => { loadBlockfiles(); }, 0);
    return () => clearTimeout(t);
  }, [tab, loadBlockfiles]);

  useEffect(() => {
    if (tab !== "frontlines") return;
    const t = setTimeout(() => { loadFrontlines(); }, 0);
    return () => clearTimeout(t);
  }, [tab, loadFrontlines]);

  if (!userId) {
    return (
      <div className="flex items-center justify-center h-64 text-ink-subtle text-[13px]">
        <p>Sign in to access your evidence library.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen size={22} className="text-lav" />
          <div>
            <h1 className="text-[20px] font-bold text-ink">Evidence Library</h1>
            <p className="text-[12px] text-ink-subtle">Organized, reusable research by argument</p>
          </div>
        </div>
      </div>

      {/* Deep-linked item (from Tournament Prep or a shared link) */}
      {selectedItem && (
        <SelectedItemPanel
          key={`${selectedItem.kind}:${selectedItem.id}`}
          kind={selectedItem.kind}
          id={selectedItem.id}
          userId={userId}
          onDismiss={dismissSelected}
          backHref={backHref}
          searchRows={results}
          resolutionHint={resolutionId || null}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-hairline">
        {(["cards", "blockfiles", "frontlines"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-[13px] font-medium transition-colors border-b-2 -mb-px capitalize ${
              tab === t
                ? "border-lav text-lav"
                : "border-transparent text-ink-subtle hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Cards tab ──────────────────────────────────────────────────── */}
      {tab === "cards" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search cards by tag, source, notes…"
                className="w-full pl-8 pr-3 py-1.5 text-[13px] border border-border rounded-lg bg-surface-1 text-ink focus:outline-none focus:ring-2 focus:ring-lav/40"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <select
              value={resolutionId}
              onChange={(e) => setResolutionId(e.target.value)}
              className="text-[12px] border border-border rounded-lg px-2 py-1.5 bg-surface-1 text-ink"
            >
              <option value="">All resolutions</option>
              {resolutions.map((r) => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
            <select
              value={sideFilter}
              onChange={(e) => setSideFilter(e.target.value as Side | "")}
              className="text-[12px] border border-border rounded-lg px-2 py-1.5 bg-surface-1 text-ink"
            >
              <option value="">All sides</option>
              <option value="pro">Pro</option>
              <option value="con">Con</option>
              <option value="neutral">Neutral</option>
            </select>
            <select
              value={verdictFilter}
              onChange={(e) => setVerdictFilter(e.target.value)}
              className="text-[12px] border border-border rounded-lg px-2 py-1.5 bg-surface-1 text-ink"
            >
              <option value="">Any verdict</option>
              <option value="supported">Supported</option>
              <option value="partially_supported">Partially supported</option>
              <option value="unsupported">Unsupported</option>
              <option value="contradicted">Contradicted</option>
            </select>
          </div>

          {searching && (
            <p className="text-[12px] text-ink-subtle">Searching…</p>
          )}

          {!searching && results.length === 0 && (
            <div className="py-12 text-center">
              <BookOpen size={28} className="mx-auto mb-3 text-ink-faint" />
              <p className="text-[13px] text-ink-subtle">
                No cards saved yet. Save evidence cards from the Evidence Studio.
              </p>
            </div>
          )}

          <div className="space-y-2">
            {results.map((r) => (
              <LibraryCardRow
                key={r.card_id}
                result={r}
                highlighted={selectedItem?.kind === "card" && selectedItem.id === r.card_id}
                onSelect={() => selectItem("card", r.card_id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Blockfiles tab ────────────────────────────────────────────── */}
      {tab === "blockfiles" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-ink-subtle">
              {blockfiles.length} blockfile{blockfiles.length !== 1 ? "s" : ""}
            </p>
            <button
              onClick={() => setShowNewBlockfile(true)}
              className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border border-border text-ink hover:bg-surface-muted transition-colors"
            >
              <Plus size={13} />
              New Blockfile
            </button>
          </div>

          {showNewBlockfile && (
            <NewBlockfileForm
              userId={userId}
              resolutions={resolutions}
              onCreated={(bf) => {
                setBlockfiles((prev) => [bf, ...prev]);
                setSelectedBlockfile(bf);
                setShowNewBlockfile(false);
              }}
              onCancel={() => setShowNewBlockfile(false)}
            />
          )}

          {selectedBlockfile ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedBlockfile(null)}
                  className="text-[11px] text-ink-subtle hover:text-ink"
                >
                  ← All blockfiles
                </button>
              </div>
              <BlockfileEditor blockfile={selectedBlockfile} userId={userId} />
            </div>
          ) : (
            <div className="space-y-2">
              {blockfiles.length === 0 && !showNewBlockfile && (
                <div className="py-12 text-center">
                  <FileText size={28} className="mx-auto mb-3 text-ink-faint" />
                  <p className="text-[13px] text-ink-subtle">
                    No blockfiles yet. Create one to organize your evidence.
                  </p>
                </div>
              )}
              {blockfiles.map((bf) => (
                <button
                  key={bf.id}
                  onClick={() => setSelectedBlockfile(bf)}
                  className="w-full text-left rounded-xl border border-border hover:border-lav/30 hover:bg-surface-muted/60 transition-all px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <FileText size={15} className="text-ink-subtle shrink-0" />
                    <p className="text-[13px] font-semibold text-ink">{bf.title}</p>
                    {bf.side && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border capitalize ${SIDE_COLORS[bf.side as Side] ?? ""}`}>
                        {bf.side}
                      </span>
                    )}
                  </div>
                  {bf.description && (
                    <p className="text-[11px] text-ink-subtle mt-1 ml-6">{bf.description}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Frontlines tab ────────────────────────────────────────────── */}
      {tab === "frontlines" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[13px] text-ink-subtle">
              {frontlines === null
                ? "Loading frontlines…"
                : `${frontlines.length} frontline${frontlines.length !== 1 ? "s" : ""}`}
              {resolutionId && resolutions.find((r) => r.id === resolutionId) && (
                <span className="text-ink-faint">
                  {" "}· {resolutions.find((r) => r.id === resolutionId)!.title}
                </span>
              )}
            </p>
            <select
              value={resolutionId}
              onChange={(e) => setResolutionId(e.target.value)}
              aria-label="Filter frontlines by resolution"
              className="text-[12px] border border-border rounded-lg px-2 py-1.5 bg-surface-1 text-ink"
            >
              <option value="">All resolutions</option>
              {resolutions.map((r) => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
          </div>

          {frontlines !== null && frontlines.length === 0 && (
            <div className="py-12 text-center">
              <Network size={28} className="mx-auto mb-3 text-ink-faint" />
              <p className="text-[13px] text-ink-subtle">
                No frontlines saved yet. Frontlines answer the responses you expect
                against your case — build them inside a blockfile.
              </p>
              <button
                onClick={() => setTab("blockfiles")}
                className="mt-3 text-[12px] px-3 py-1.5 rounded-lg border border-border text-ink hover:bg-surface-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/40"
              >
                Open blockfiles
              </button>
            </div>
          )}

          {frontlines !== null && frontlines.length > 0 && (
            <div className="space-y-2">
              {(["pro", "con", "neutral"] as const).map((side) => {
                const list = frontlines.filter((f) =>
                  side === "neutral" ? !f.side || f.side === "neutral" : f.side === side,
                );
                if (list.length === 0) return null;
                return (
                  <div key={side} className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                      {side === "neutral" ? "General" : side} ({list.length})
                    </p>
                    {list.map((f) => (
                      <div
                        key={f.id}
                        className={`rounded-xl border px-4 py-3 transition-all ${
                          selectedItem?.kind === "frontline" && selectedItem.id === f.id
                            ? "border-lav/50 ring-2 ring-lav/30 bg-lav/5"
                            : "border-border"
                        }`}
                      >
                        {selectedItem?.kind === "frontline" && selectedItem.id === f.id && (
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-lav">Selected</p>
                        )}
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-ink">{f.title}</p>
                            {f.opponent_claim && (
                              <p className="text-[11px] text-ink-subtle mt-0.5">
                                Answers: <span className="italic">&ldquo;{f.opponent_claim}&rdquo;</span>
                              </p>
                            )}
                            {(f.opponent_warrant || f.opponent_impact) && (
                              <p className="text-[10px] text-ink-faint mt-0.5 line-clamp-1">
                                {f.opponent_warrant && `Warrant: ${f.opponent_warrant}`}
                                {f.opponent_warrant && f.opponent_impact && " · "}
                                {f.opponent_impact && `Impact: ${f.opponent_impact}`}
                              </p>
                            )}
                          </div>
                          {f.side && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border capitalize shrink-0 ${SIDE_COLORS[f.side as Side] ?? ""}`}>
                              {f.side}
                            </span>
                          )}
                          <button
                            onClick={() => selectItem("frontline", f.id)}
                            className="shrink-0 text-[12px] px-2.5 py-1 rounded-md border border-border text-ink hover:bg-surface-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/40"
                          >
                            Open
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function LibraryPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-[20px] font-bold text-ink">Evidence Library</h1>
          <p role="status" className="mt-2 text-[13px] text-ink-subtle">Loading…</p>
        </div>
      }
    >
      <LibraryPageContent />
    </Suspense>
  );
}
