"use client";

const tabs = [
  { key: "submissions", label: "Submissions" },
  { key: "clients", label: "Clients" },
  { key: "tasks", label: "Tasks" },
];

export default function AdminNav({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  return (
    <nav
      style={{
        display: "flex",
        gap: 4,
        borderBottom: "1px solid #e8e6df",
        marginBottom: 24,
        fontFamily: "var(--font-sans)",
      }}
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            style={{
              padding: "8px 16px",
              background: "transparent",
              border: "none",
              borderBottom: active ? "2px solid #ff3d00" : "2px solid transparent",
              color: active ? "#ff3d00" : "#888886",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              cursor: "pointer",
              outline: "none",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
