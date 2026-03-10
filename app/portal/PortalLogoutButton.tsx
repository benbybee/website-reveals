"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

export function PortalLogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = useCallback(async () => {
    setLoading(true);
    try {
      await fetch("/api/portal/logout", { method: "POST" });
      router.push("/portal/login");
      router.refresh();
    } catch {
      setLoading(false);
    }
  }, [router]);

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      style={{
        background: "transparent",
        border: "1px solid #555",
        color: "#888886",
        fontSize: "12px",
        padding: "5px 12px",
        borderRadius: "4px",
        cursor: loading ? "not-allowed" : "pointer",
        fontFamily:
          "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
        textTransform: "uppercase" as const,
        letterSpacing: "0.04em",
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? "..." : "Sign Out"}
    </button>
  );
}
