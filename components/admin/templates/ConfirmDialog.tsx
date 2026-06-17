"use client";

import { useState } from "react";

/**
 * A WR-branded confirmation modal that replaces blocking `window.confirm` in the
 * templates admin. The parent holds a `ConfirmConfig | null` and renders
 * <ConfirmDialog> when it's set; `onConfirm` may be async, and the dialog shows
 * a busy state until it resolves, then closes. Reusable for any confirm-then-act
 * flow (SL dispatch, rebuilds, destructive actions).
 */
export interface ConfirmConfig {
  title: string;
  message?: string;
  /** Secondary monospace line for counts/figures (e.g. "12 of 50 selected"). */
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" tints the confirm button red; default uses the WR accent. */
  tone?: "default" | "danger";
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({ config, onClose }: { config: ConfirmConfig; onClose: () => void }) {
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      await config.onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const accent = config.tone === "danger" ? "#b3300a" : "#ff3d00";

  return (
    <div role="dialog" aria-modal="true" style={overlay} onClick={busy ? undefined : onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "1.25rem", fontWeight: 700, margin: "0 0 8px" }}>
          {config.title}
        </h2>
        {config.message && (
          <p style={{ fontSize: 13.5, color: "#555553", lineHeight: 1.5, margin: "0 0 12px" }}>{config.message}</p>
        )}
        {config.detail && (
          <div style={detailBox}>{config.detail}</div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button onClick={onClose} disabled={busy} style={ghostBtn}>{config.cancelLabel ?? "Cancel"}</button>
          <button
            onClick={go}
            disabled={busy}
            style={{ ...confirmBtn, background: accent, border: `1.5px solid ${accent}`, opacity: busy ? 0.6 : 1, cursor: busy ? "wait" : "pointer" }}
          >
            {busy ? "Working…" : (config.confirmLabel ?? "Confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(17,17,16,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 };
const modal: React.CSSProperties = { background: "#fff", border: "1.5px solid #e8e6df", borderRadius: 8, padding: 24, width: "100%", maxWidth: 440, boxShadow: "0 12px 40px rgba(0,0,0,0.18)" };
const detailBox: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 12, color: "#333", background: "#f5f4ef", border: "1px solid #e8e6df", borderRadius: 4, padding: "8px 10px", wordBreak: "break-word" };
const ghostBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "#555553", background: "#fff", border: "1.5px solid #d8d6cf", borderRadius: 4, padding: "7px 14px", cursor: "pointer" };
const confirmBtn: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "#fff", borderRadius: 4, padding: "7px 16px" };
