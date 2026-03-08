"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface SaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (email: string) => Promise<void>;
}

export function SaveModal({ isOpen, onClose, onSave }: SaveModalProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");

  async function handleSave() {
    if (!email.includes("@")) return;
    setStatus("loading");
    await onSave(email);
    setStatus("done");
  }

  function handleClose() {
    setStatus("idle");
    setEmail("");
    onClose();
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            background: "rgba(17,17,16,0.55)",
            backdropFilter: "blur(4px)",
          }}
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.97, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              width: "100%",
              maxWidth: "440px",
              background: "#ffffff",
              border: "1px solid #e8e6df",
              borderRadius: "6px",
              padding: "36px",
              boxShadow: "0 20px 60px rgba(17,17,16,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {status === "done" ? (
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "50%",
                    border: "1.5px solid #e8e6df",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 20px",
                    fontSize: "20px",
                    color: "#ff3d00",
                  }}
                >
                  ✓
                </div>
                <h2
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontWeight: 700,
                    fontSize: "1.4rem",
                    color: "#111110",
                    marginBottom: "8px",
                  }}
                >
                  Resume link sent
                </h2>
                <p
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "14px",
                    color: "#888886",
                    lineHeight: 1.6,
                    marginBottom: "24px",
                  }}
                >
                  Check your inbox. The link is valid for 30 days.
                </p>
                <button
                  onClick={handleClose}
                  className="btn-outline"
                  style={{ fontSize: "13px", padding: "9px 24px" }}
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <h2
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontWeight: 700,
                    fontSize: "1.4rem",
                    color: "#111110",
                    marginBottom: "6px",
                  }}
                >
                  Save your progress
                </h2>
                <p
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "14px",
                    color: "#888886",
                    lineHeight: 1.6,
                    marginBottom: "20px",
                  }}
                >
                  We&apos;ll email you a link to continue right where you left off. No account needed.
                </p>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  className="field"
                  style={{ width: "100%", marginBottom: "10px" }}
                  autoFocus
                />
                <button
                  onClick={handleSave}
                  disabled={!email.includes("@") || status === "loading"}
                  className="btn-orange"
                  style={{
                    width: "100%",
                    fontSize: "14px",
                    padding: "12px",
                    opacity: !email.includes("@") || status === "loading" ? 0.45 : 1,
                    cursor: !email.includes("@") || status === "loading" ? "not-allowed" : "pointer",
                  }}
                >
                  {status === "loading" ? "Sending…" : "Send Resume Link →"}
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
