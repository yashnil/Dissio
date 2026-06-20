"use client";

import { useEffect, useRef } from "react";
import type { CardDraft } from "@/types";
import EvidenceStudioCard from "./EvidenceStudioCard";

/**
 * Large, focused Evidence Studio modal overlay.
 * Takes up most of the viewport so the card editor feels like a real workspace.
 *
 * Accessibility:
 * - role="dialog" aria-modal="true" aria-label
 * - Focus moves into modal on open; returns to trigger on close
 * - Tab/Shift+Tab trapped within focusable elements
 * - Escape closes; backdrop click closes
 * - Scroll locked while open
 */
export function EvidenceStudioModal({
  card,
  claimGoal,
  onSave,
  onDiscard,
  onClose,
}: {
  card: CardDraft;
  claimGoal?: string | null;
  onSave: (card: CardDraft) => void;
  onDiscard: (id: string) => void;
  onClose: () => void;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Capture the previously-focused element so we can restore it on close
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    return () => {
      previousFocusRef.current?.focus();
    };
  }, []);

  // Scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Focus the modal panel on open so screen readers announce the dialog
  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  // Keyboard: Escape closes; Tab/Shift+Tab trapped
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const el = modalRef.current;
      if (!el) return;
      const focusable = Array.from(
        el.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function handleDiscard(id: string) {
    onDiscard(id);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
      aria-label="Evidence Studio"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative z-10 flex flex-col bg-surface-1 rounded-2xl shadow-2xl overflow-hidden focus:outline-none"
        style={{
          width: "min(900px, 96vw)",
          height: "min(940px, 92vh)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <EvidenceStudioCard
            card={card}
            claimGoal={claimGoal}
            onSave={onSave}
            onDiscard={handleDiscard}
            onClose={onClose}
            forceExpanded
          />
        </div>
      </div>
    </div>
  );
}

export default EvidenceStudioModal;
