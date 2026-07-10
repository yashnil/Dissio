"use client";

/**
 * MaterialPicker + SelectedMaterialPreview (Phase 7A).
 *
 * Users pick REAL saved material — evidence cards, arguments, frontlines —
 * by title, with search and resolution/side/type filters. No source types,
 * no raw IDs. The preview keeps evidence integrity visible: exact source
 * text is a labeled quote, user notes are labeled as the student's own,
 * and unsupported/contradicted verdicts carry warnings.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Loader2, Quote, Search, Shield, Swords, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { libraryItemHref } from "@/lib/prepModel";
import {
  filterMaterials,
  sortMaterialsByRecency,
  normalizeCardMaterial,
  normalizeArgumentMaterial,
  normalizeFrontlineMaterial,
  deriveMaterialWarnings,
  isMaterialSafeToAdapt,
  ADAPTATION_INTEGRITY_RULES,
  MATERIAL_KIND_LABELS,
  type AdaptableMaterialKind,
  type SelectedMaterial,
} from "@/lib/judgeAdaptationModel";
import type {
  Argument, Frontline, LibrarySearchResponse, Resolution,
} from "@/types/library";

const KIND_ICONS: Record<AdaptableMaterialKind, React.ReactNode> = {
  card: <Shield size={12} aria-hidden="true" />,
  argument: <Swords size={12} aria-hidden="true" />,
  frontline: <FileText size={12} aria-hidden="true" />,
};

const KIND_FILTERS: { value: AdaptableMaterialKind | "all"; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "card", label: "Evidence cards" },
  { value: "argument", label: "Arguments" },
  { value: "frontline", label: "Frontlines" },
];

// ── Picker ────────────────────────────────────────────────────────────────────

export function MaterialPicker({
  userId, onSelect, selectedId,
}: {
  userId: string;
  onSelect: (m: SelectedMaterial) => void;
  selectedId: string | null;
}) {
  const [materials, setMaterials] = useState<SelectedMaterial[] | null>(null);
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [loadErr, setLoadErr] = useState(false);

  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<AdaptableMaterialKind | "all">("all");
  const [side, setSide] = useState<"pro" | "con" | "all">("all");
  const [resolutionId, setResolutionId] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [cardsRes, args, frontlines, res] = await Promise.all([
          apiFetch<LibrarySearchResponse>("/library/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId, limit: 100 }),
          }).catch(() => ({ results: [] } as unknown as LibrarySearchResponse)),
          apiFetch<Argument[]>(`/library/arguments?user_id=${userId}`).catch(() => [] as Argument[]),
          apiFetch<Frontline[]>(`/library/frontlines?user_id=${userId}`).catch(() => [] as Frontline[]),
          apiFetch<Resolution[]>(`/library/resolutions?user_id=${userId}`).catch(() => [] as Resolution[]),
        ]);
        if (cancelled) return;
        setResolutions(res);
        setMaterials(sortMaterialsByRecency([
          ...cardsRes.results.map(normalizeCardMaterial),
          ...args.map(normalizeArgumentMaterial),
          ...frontlines.map(normalizeFrontlineMaterial),
        ]));
      } catch {
        if (!cancelled) { setLoadErr(true); setMaterials([]); }
      }
    }
    const t = setTimeout(() => { load(); }, 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [userId]);

  const filtered = materials
    ? filterMaterials(materials, { query, kind, side, resolutionId }).slice(0, 30)
    : [];

  return (
    <div className="flex flex-col gap-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
          <label htmlFor="material-search" className="sr-only">Search saved materials</label>
          <input
            id="material-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your saved materials…"
            className="w-full rounded-lg border border-hairline bg-surface-1 py-1.5 pl-8 pr-3 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
          />
        </div>
        <label htmlFor="material-kind" className="sr-only">Material type</label>
        <select
          id="material-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as AdaptableMaterialKind | "all")}
          className="rounded-lg border border-hairline bg-surface-1 px-2 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
        >
          {KIND_FILTERS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
        <label htmlFor="material-side" className="sr-only">Side</label>
        <select
          id="material-side"
          value={side}
          onChange={(e) => setSide(e.target.value as "pro" | "con" | "all")}
          className="rounded-lg border border-hairline bg-surface-1 px-2 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
        >
          <option value="all">All sides</option>
          <option value="pro">PRO</option>
          <option value="con">CON</option>
        </select>
        {resolutions.length > 0 && (
          <>
            <label htmlFor="material-resolution" className="sr-only">Resolution</label>
            <select
              id="material-resolution"
              value={resolutionId}
              onChange={(e) => setResolutionId(e.target.value)}
              className="max-w-[220px] rounded-lg border border-hairline bg-surface-1 px-2 py-1.5 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
            >
              <option value="all">All resolutions</option>
              {resolutions.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </>
        )}
      </div>

      {/* Results */}
      {materials === null && (
        <p role="status" className="flex items-center gap-2 py-4 text-sm text-ink-subtle">
          <Loader2 size={13} className="motion-safe:animate-spin" aria-hidden="true" />
          Loading your saved materials…
        </p>
      )}

      {materials !== null && materials.length === 0 && (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-hairline px-4 py-4">
          <p className="text-sm text-ink-subtle">
            {loadErr
              ? "Couldn't load your saved materials. Retry in a moment."
              : "Nothing saved yet. Adaptation works on your real prep — save evidence, arguments, or frontlines first."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/evidence" className="rounded-md border border-hairline bg-surface-1 px-2.5 py-1.5 text-xs font-medium text-lav hover:text-lav-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50">
              Search Evidence Studio
            </Link>
            <Link href="/library" className="rounded-md border border-hairline bg-surface-1 px-2.5 py-1.5 text-xs font-medium text-lav hover:text-lav-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50">
              Open Library
            </Link>
          </div>
        </div>
      )}

      {materials !== null && materials.length > 0 && (
        <>
          {filtered.length === 0 ? (
            <p className="py-3 text-sm text-ink-subtle">No materials match those filters.</p>
          ) : (
            <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
              {filtered.map((m) => {
                const isSelected = m.id === selectedId;
                const unsafe = !isMaterialSafeToAdapt(m);
                return (
                  <li key={`${m.kind}:${m.id}`}>
                    <button
                      type="button"
                      onClick={() => onSelect(m)}
                      aria-pressed={isSelected}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50 ${
                        isSelected
                          ? "border-lav/50 bg-lav/5 ring-1 ring-lav/30"
                          : "border-hairline bg-surface-1 hover:border-hairline-strong"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="flex items-center gap-1 rounded-full border border-hairline bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-ink-subtle">
                          {KIND_ICONS[m.kind]} {MATERIAL_KIND_LABELS[m.kind]}
                        </span>
                        {m.side && (
                          <span className="rounded-full border border-hairline bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase text-ink-subtle">
                            {m.side}
                          </span>
                        )}
                        {isSelected && <span className="text-[10px] font-semibold text-lav">Selected</span>}
                        {unsafe && (
                          <span className="rounded-full border border-danger/30 bg-danger/5 px-1.5 py-0.5 text-[10px] font-medium text-danger">
                            Not safe to adapt
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-medium text-ink">{m.title}</p>
                      {m.contextText && (
                        <p className="mt-0.5 truncate text-xs text-ink-faint">{m.contextText}</p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// ── Selected material preview ─────────────────────────────────────────────────

export function SelectedMaterialPreview({
  material, onChange,
}: {
  material: SelectedMaterial;
  onChange: () => void;
}) {
  const warnings = deriveMaterialWarnings(material);
  return (
    <section
      aria-label={`Selected material: ${material.title}`}
      className="flex flex-col gap-2.5 rounded-xl border border-lav/25 bg-lav/5 px-4 py-3.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-eyebrow text-lav-hi">Adapting this material</p>
          <h3 className="mt-0.5 text-sm font-semibold text-ink">{material.title}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-subtle">
            <span>{material.typeLabel}</span>
            {material.side && <span className="uppercase">{material.side}</span>}
            {material.cite && <span>{material.cite}</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={onChange}
          aria-label="Change selected material"
          className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-hairline bg-surface-1 px-2 text-xs font-medium text-ink-subtle transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
        >
          <X size={11} aria-hidden="true" /> Change
        </button>
      </div>

      {material.exactText && (
        <blockquote className="flex gap-2 rounded-lg border border-hairline bg-surface-1 px-3 py-2.5">
          <Quote size={11} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
              Exact source text — never changed by adaptation
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-subtle">{material.exactText}</p>
          </div>
        </blockquote>
      )}

      {material.contextText && !material.exactText && (
        <p className="text-xs leading-relaxed text-ink-subtle">{material.contextText}</p>
      )}

      {material.userNotes && (
        <p className="text-xs italic leading-relaxed text-ink-faint">
          Your note: {material.userNotes}
        </p>
      )}

      {warnings.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {warnings.map((w) => (
            <span key={w} className="rounded-full border border-warn/30 bg-warn/5 px-1.5 py-0.5 text-[10px] font-medium text-warn">
              {w}
            </span>
          ))}
          <Link
            href={libraryItemHref(material.kind === "card" ? "card" : material.kind, material.id)}
            className="rounded text-[10px] font-medium text-lav hover:text-lav-hi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lav/50"
          >
            Review in Library →
          </Link>
        </div>
      )}

      {/* What adaptation may and may not change */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-ok/20 bg-ok/5 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ok">Can adapt (delivery advice)</p>
          <p className="mt-0.5 text-xs text-ink-subtle">
            {ADAPTATION_INTEGRITY_RULES.canChange.join(" · ")}
          </p>
        </div>
        <div className="rounded-lg border border-danger/20 bg-danger/5 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-danger">Never changes</p>
          <p className="mt-0.5 text-xs text-ink-subtle">
            {ADAPTATION_INTEGRITY_RULES.mustNotChange.join(" · ")}
          </p>
        </div>
      </div>
    </section>
  );
}
