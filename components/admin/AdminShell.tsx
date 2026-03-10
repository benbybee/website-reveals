"use client";

import { useState } from "react";
import type { FormSession } from "@/lib/supabase/types";
import type { Client, TaskWithClient } from "@/lib/types/client-tasks";
import { SubmissionsTable } from "./SubmissionsTable";
import { ClientsPanel } from "./ClientsPanel";
import { ClientDetailDrawer } from "./ClientDetailDrawer";
import { TasksPanel } from "./TasksPanel";
import { TaskDetailDrawer } from "./TaskDetailDrawer";
import AddTaskModal from "./AddTaskModal";

type Tab = "submissions" | "clients" | "tasks";

const TABS: { key: Tab; label: string }[] = [
  { key: "submissions", label: "Submissions" },
  { key: "clients", label: "Clients" },
  { key: "tasks", label: "Tasks" },
];

export function AdminShell({
  sessions,
  clients: initialClients,
  tasks: initialTasks,
  userEmail,
}: {
  sessions: FormSession[];
  clients: Client[];
  tasks: TaskWithClient[];
  userEmail: string;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("submissions");
  const [clients, setClients] = useState(initialClients);
  const [tasks, setTasks] = useState(initialTasks);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskDefaultClient, setAddTaskDefaultClient] = useState<
    string | undefined
  >();

  const refreshTasks = async () => {
    try {
      const res = await fetch("/api/admin/tasks");
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks);
      }
    } catch {}
  };

  const refreshClients = async () => {
    try {
      const res = await fetch("/api/admin/clients");
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients);
      }
    } catch {}
  };

  return (
    <>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#888886",
              marginBottom: "6px",
            }}
          >
            Admin
          </p>
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "clamp(1.5rem, 4vw, 2rem)",
              fontWeight: 700,
              color: "#111110",
            }}
          >
            Dashboard
          </h1>
        </div>
        <div
          style={{ display: "flex", alignItems: "center", gap: "16px" }}
        >
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "13px",
              color: "#888886",
            }}
          >
            {userEmail}
          </span>
          <form action="/admin/logout" method="POST">
            <button
              type="submit"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: "13px",
                fontWeight: 500,
                color: "#888886",
                background: "transparent",
                border: "1.5px solid #d8d6cf",
                borderRadius: "3px",
                padding: "6px 16px",
                cursor: "pointer",
              }}
            >
              Sign Out
            </button>
          </form>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: "4px",
          borderBottom: "1px solid #e8e6df",
          marginBottom: "24px",
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 600,
              color: activeTab === tab.key ? "#ff3d00" : "#888886",
              background: "transparent",
              border: "none",
              borderBottom:
                activeTab === tab.key
                  ? "2px solid #ff3d00"
                  : "2px solid transparent",
              padding: "8px 16px",
              cursor: "pointer",
              transition: "color 0.15s, border-color 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "submissions" && (
        <SubmissionsTable sessions={sessions} />
      )}

      {activeTab === "clients" && (
        <ClientsPanel
          clients={clients}
          onSelect={(client: Client) => setSelectedClient(client)}
        />
      )}

      {activeTab === "tasks" && (
        <TasksPanel
          initialTasks={tasks}
          clients={clients}
          onSelectTask={(task) => setSelectedTaskId(task.id)}
          onAddTask={() => {
            setAddTaskDefaultClient(undefined);
            setShowAddTask(true);
          }}
        />
      )}

      {/* Drawers */}
      <ClientDetailDrawer
        client={selectedClient}
        onClose={() => setSelectedClient(null)}
        onUpdated={(updated) => {
          setClients((prev) =>
            prev.map((c) => (c.id === updated.id ? updated : c))
          );
          setSelectedClient(updated);
        }}
      />

      <TaskDetailDrawer
        taskId={selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        onUpdated={() => refreshTasks()}
      />

      {showAddTask && (
        <AddTaskModal
          clients={clients}
          defaultClientId={addTaskDefaultClient}
          onClose={() => setShowAddTask(false)}
          onCreated={() => {
            setShowAddTask(false);
            refreshTasks();
          }}
        />
      )}
    </>
  );
}
