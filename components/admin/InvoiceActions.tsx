"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InvoiceActions({
  invoiceId,
  initiallyPaid,
  paidAt,
}: {
  invoiceId: string;
  initiallyPaid: boolean;
  paidAt: string | null;
}) {
  const router = useRouter();
  const [paid, setPaid] = useState(initiallyPaid);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !paid;
    setBusy(true);
    setPaid(next); // optimistic
    const res = await fetch(`/api/admin/billing/invoices/${invoiceId}/paid`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid: next }),
    });
    setBusy(false);
    if (!res.ok) {
      setPaid(!next);
      alert("Failed to update paid status.");
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#555553", cursor: "pointer" }}>
        <input type="checkbox" checked={paid} onChange={toggle} disabled={busy} />
        Paid
        {paid && paidAt && (
          <span style={{ fontSize: "11px", color: "#888886" }}>
            ({new Date(paidAt).toLocaleDateString()})
          </span>
        )}
      </label>
      <button
        onClick={() => window.print()}
        className="btn-orange"
        style={{ fontSize: "13px", padding: "8px 18px" }}
      >
        Print / PDF
      </button>
    </div>
  );
}
