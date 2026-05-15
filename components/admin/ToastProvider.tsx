"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type ToastKind = "error" | "success" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

interface ToastContextValue {
  toast: (kind: ToastKind, title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback when not wrapped — log to console so we don't crash
    return {
      toast: (kind, title, message) => console.log(`[toast:${kind}] ${title}${message ? " — " + message : ""}`),
      error: (title, message) => console.error(`[toast:error] ${title}${message ? " — " + message : ""}`),
      success: (title, message) => console.log(`[toast:success] ${title}${message ? " — " + message : ""}`),
    };
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (kind: ToastKind, title: string, message?: string) => {
      const id = ++counter.current;
      setToasts((prev) => [...prev, { id, kind, title, message }]);
      // Auto-dismiss after 8s (errors stay 12s)
      setTimeout(() => remove(id), kind === "error" ? 12000 : 8000);
    },
    [remove],
  );

  const value: ToastContextValue = {
    toast,
    error: (title, message) => toast("error", title, message),
    success: (title, message) => toast("success", title, message),
  };

  // Install a global fetch wrapper that emits toasts on non-2xx responses.
  // Only active in components that use this provider (i.e. /admin/*).
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      const res = await original.apply(window, args);
      if (!res.ok && (res.status >= 400)) {
        // Clone so the caller can still read the body
        const clone = res.clone();
        let detail = "";
        try {
          const body = await clone.json();
          detail = body?.error || body?.message || JSON.stringify(body).slice(0, 200);
        } catch {
          try {
            detail = (await clone.text()).slice(0, 200);
          } catch {
            /* ignore */
          }
        }
        const url = typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url || "request";
        // Only show toasts for our own API routes; skip third-party (e.g. analytics)
        if (url.startsWith("/api/")) {
          value.error(`Request failed (${res.status})`, `${shortPath(url)} — ${detail || "no details"}`);
        }
      }
      return res;
    };
    return () => {
      window.fetch = original;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        style={{
          position: "fixed",
          top: "16px",
          right: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          zIndex: 9999,
          maxWidth: "440px",
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              pointerEvents: "auto",
              background: "#fff",
              border: `1.5px solid ${kindBorder(t.kind)}`,
              borderLeft: `4px solid ${kindAccent(t.kind)}`,
              borderRadius: "4px",
              padding: "12px 16px 12px 14px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              fontFamily: "var(--font-sans)",
              animation: "slideIn 0.18s ease-out",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#111110", marginBottom: t.message ? "4px" : 0 }}>
                  {t.title}
                </div>
                {t.message && (
                  <div style={{ fontSize: "12px", color: "#555553", lineHeight: 1.4, fontFamily: "var(--font-mono)", wordBreak: "break-word" }}>
                    {t.message}
                  </div>
                )}
              </div>
              <button
                onClick={() => remove(t.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#888886",
                  cursor: "pointer",
                  fontSize: "16px",
                  padding: "0 4px",
                  flexShrink: 0,
                }}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

function shortPath(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, "").slice(0, 60);
}

function kindBorder(k: ToastKind): string {
  if (k === "error") return "#ffcdc0";
  if (k === "success") return "#c5e8c5";
  return "#e8e6df";
}

function kindAccent(k: ToastKind): string {
  if (k === "error") return "#b3300a";
  if (k === "success") return "#2e7d32";
  return "#ff3d00";
}
