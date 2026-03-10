"use client";

import { useState, useMemo, useCallback, DragEvent } from "react";
import type {
  TaskWithClient,
  TaskStatus,
  TaskPriority,
} from "@/lib/types/client-tasks";
import { TASK_STATUSES, PREDEFINED_TAGS } from "@/lib/types/client-tasks";
import type { Client } from "@/lib/types/client-tasks";

interface TasksPanelProps {
  initialTasks: TaskWithClient[];
  clients: Client[];
  onSelectTask: (task: TaskWithClient) => void;
  onAddTask: () => void;
}

type ViewMode = "board" | "list";
type SortKey =
  | "title"
  | "client"
  | "status"
  | "priority"
  | "due_date"
  | "time_estimate_minutes"
  | "time_tracked_minutes";
type SortDir = "asc" | "desc";

const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  in_progress: "In Progress",
  blocked: "Blocked",
  complete: "Complete",
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog: "#888886",
  in_progress: "#2196f3",
  blocked: "#ff6b35",
  complete: "#4caf50",
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "#888886",
  medium: "#2196f3",
  high: "#ff6b35",
  urgent: "#ff3d00",
};

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatMinutes(mins: number | null): string {
  if (mins === null || mins === 0) return "—";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function clientName(task: TaskWithClient): string {
  if (task.client.company_name) return task.client.company_name;
  return `${task.client.first_name} ${task.client.last_name}`.trim();
}

export function TasksPanel({
  initialTasks,
  clients,
  onSelectTask,
  onAddTask,
}: TasksPanelProps) {
  const [tasks, setTasks] = useState<TaskWithClient[]>(initialTasks);
  const [view, setView] = useState<ViewMode>("board");
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("due_date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [statusNotesModal, setStatusNotesModal] = useState<{
    taskId: string;
    newStatus: TaskStatus;
  } | null>(null);
  const [statusNotes, setStatusNotes] = useState("");
  const [updating, setUpdating] = useState(false);

  const filtered = useMemo(() => {
    let result = [...tasks];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((t) => t.title.toLowerCase().includes(q));
    }

    if (clientFilter !== "all") {
      result = result.filter((t) => t.client_id === clientFilter);
    }

    if (priorityFilter !== "all") {
      result = result.filter((t) => t.priority === priorityFilter);
    }

    if (tagFilter !== "all") {
      result = result.filter((t) => t.tags.includes(tagFilter));
    }

    return result;
  }, [tasks, search, clientFilter, priorityFilter, tagFilter]);

  // Board view: group by status
  const columns = useMemo(() => {
    const map: Record<TaskStatus, TaskWithClient[]> = {
      backlog: [],
      in_progress: [],
      blocked: [],
      complete: [],
    };
    for (const task of filtered) {
      map[task.status].push(task);
    }
    // Sort each column by priority then sort_order
    for (const status of TASK_STATUSES) {
      map[status].sort(
        (a, b) =>
          PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
          a.sort_order - b.sort_order
      );
    }
    return map;
  }, [filtered]);

  // List view: sorted
  const sortedList = useMemo(() => {
    const result = [...filtered];
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "title":
          cmp = a.title.localeCompare(b.title);
          break;
        case "client":
          cmp = clientName(a).localeCompare(clientName(b));
          break;
        case "status":
          cmp =
            TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status);
          break;
        case "priority":
          cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
          break;
        case "due_date": {
          const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
          const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
          cmp = da - db;
          break;
        }
        case "time_estimate_minutes":
          cmp = (a.time_estimate_minutes ?? 0) - (b.time_estimate_minutes ?? 0);
          break;
        case "time_tracked_minutes":
          cmp = a.time_tracked_minutes - b.time_tracked_minutes;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [filtered, sortKey, sortDir]);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey]
  );

  // Drag and drop handlers
  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>, task: TaskWithClient) => {
      e.dataTransfer.setData("taskId", task.id);
      e.dataTransfer.setData("fromStatus", task.status);
      e.dataTransfer.effectAllowed = "move";
    },
    []
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>, status: TaskStatus) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverColumn(status);
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>, newStatus: TaskStatus) => {
      e.preventDefault();
      setDragOverColumn(null);
      const taskId = e.dataTransfer.getData("taskId");
      const fromStatus = e.dataTransfer.getData("fromStatus");
      if (!taskId || fromStatus === newStatus) return;
      setStatusNotesModal({ taskId, newStatus });
      setStatusNotes("");
    },
    []
  );

  const modalTask = useMemo(() => {
    if (!statusNotesModal) return null;
    return tasks.find((t) => t.id === statusNotesModal.taskId) ?? null;
  }, [statusNotesModal, tasks]);

  const confirmStatusChange = useCallback(async () => {
    if (!statusNotesModal) return;
    setUpdating(true);
    try {
      const res = await fetch(
        `/api/admin/tasks/${statusNotesModal.taskId}/status`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: statusNotesModal.newStatus,
            notes: statusNotes || undefined,
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to update status");

      // Update local state
      setTasks((prev) =>
        prev.map((t) =>
          t.id === statusNotesModal.taskId
            ? {
                ...t,
                status: statusNotesModal.newStatus,
                completed_at:
                  statusNotesModal.newStatus === "complete"
                    ? new Date().toISOString()
                    : t.completed_at,
              }
            : t
        )
      );
      setStatusNotesModal(null);
      setStatusNotes("");
    } catch (err) {
      console.error("Status update failed:", err);
    } finally {
      setUpdating(false);
    }
  }, [statusNotesModal, statusNotes]);

  const cancelStatusChange = useCallback(() => {
    setStatusNotesModal(null);
    setStatusNotes("");
  }, []);

  // Count of subtasks for a given task
  const subtaskInfo = useCallback(
    (task: TaskWithClient) => {
      const subtasks = tasks.filter((t) => t.parent_task_id === task.id);
      if (subtasks.length === 0) return null;
      const done = subtasks.filter((t) => t.status === "complete").length;
      return { total: subtasks.length, done };
    },
    [tasks]
  );

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " \u2191" : " \u2193";
  };

  return (
    <div style={{ fontFamily: "var(--font-sans)" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 600,
              margin: 0,
              color: "#1a1a18",
            }}
          >
            Tasks
          </h2>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              background: "#f0efea",
              padding: "2px 8px",
              borderRadius: 2,
              color: "#888886",
            }}
          >
            {filtered.length}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              display: "flex",
              border: "1px solid #e8e6df",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <button
              onClick={() => setView("board")}
              style={{
                padding: "6px 12px",
                fontSize: 13,
                fontFamily: "var(--font-mono)",
                border: "none",
                cursor: "pointer",
                background: view === "board" ? "#1a1a18" : "#fff",
                color: view === "board" ? "#fff" : "#1a1a18",
              }}
            >
              Board
            </button>
            <button
              onClick={() => setView("list")}
              style={{
                padding: "6px 12px",
                fontSize: 13,
                fontFamily: "var(--font-mono)",
                border: "none",
                borderLeft: "1px solid #e8e6df",
                cursor: "pointer",
                background: view === "list" ? "#1a1a18" : "#fff",
                color: view === "list" ? "#fff" : "#1a1a18",
              }}
            >
              List
            </button>
          </div>

          <button
            onClick={onAddTask}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              fontFamily: "var(--font-mono)",
              background: "#1a1a18",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            + Add Task
          </button>
        </div>
      </div>

      {/* Filters row */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          placeholder="Search by title..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            padding: "6px 10px",
            fontSize: 13,
            border: "1px solid #e8e6df",
            borderRadius: 4,
            outline: "none",
            fontFamily: "var(--font-sans)",
            minWidth: 180,
          }}
        />
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          style={{
            padding: "6px 10px",
            fontSize: 13,
            border: "1px solid #e8e6df",
            borderRadius: 4,
            background: "#fff",
            fontFamily: "var(--font-sans)",
            cursor: "pointer",
          }}
        >
          <option value="all">All Clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.company_name || `${c.first_name} ${c.last_name}`}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          style={{
            padding: "6px 10px",
            fontSize: 13,
            border: "1px solid #e8e6df",
            borderRadius: 4,
            background: "#fff",
            fontFamily: "var(--font-sans)",
            cursor: "pointer",
          }}
        >
          <option value="all">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          style={{
            padding: "6px 10px",
            fontSize: 13,
            border: "1px solid #e8e6df",
            borderRadius: 4,
            background: "#fff",
            fontFamily: "var(--font-sans)",
            cursor: "pointer",
          }}
        >
          <option value="all">All Tags</option>
          {PREDEFINED_TAGS.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </div>

      {/* Board View */}
      {view === "board" && (
        <div
          style={{
            display: "flex",
            gap: 12,
            overflowX: "auto",
            paddingBottom: 8,
          }}
        >
          {TASK_STATUSES.map((status) => (
            <div
              key={status}
              onDragOver={(e) => handleDragOver(e, status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, status)}
              style={{
                minWidth: 250,
                flex: "1 1 0",
                padding: 8,
                background:
                  dragOverColumn === status ? "#eceae3" : "#f5f4ef",
                borderRadius: 6,
                transition: "background 0.15s ease",
              }}
            >
              {/* Column header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 10,
                  padding: "4px 4px",
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: STATUS_COLORS[status],
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#1a1a18",
                  }}
                >
                  {STATUS_LABELS[status]}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    background: STATUS_COLORS[status] + "18",
                    color: STATUS_COLORS[status],
                    padding: "1px 6px",
                    borderRadius: 2,
                    fontWeight: 600,
                  }}
                >
                  {columns[status].length}
                </span>
              </div>

              {/* Cards */}
              {columns[status].map((task) => {
                const sub = subtaskInfo(task);
                return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task)}
                    onClick={() => onSelectTask(task)}
                    style={{
                      background: "#fff",
                      border: "1px solid #e8e6df",
                      borderRadius: 4,
                      padding: 12,
                      marginBottom: 8,
                      cursor: "pointer",
                      transition: "border-color 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.borderColor =
                        "#d8d6cf";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.borderColor =
                        "#e8e6df";
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: "#1a1a18",
                        marginBottom: 4,
                        lineHeight: 1.3,
                      }}
                    >
                      {task.title}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#888886",
                        marginBottom: 8,
                      }}
                    >
                      {clientName(task)}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        flexWrap: "wrap",
                        marginBottom: task.tags.length > 0 || task.due_date || sub ? 6 : 0,
                      }}
                    >
                      {/* Priority badge */}
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          fontWeight: 600,
                          color: PRIORITY_COLORS[task.priority],
                          background: PRIORITY_COLORS[task.priority] + "14",
                          padding: "2px 6px",
                          borderRadius: 2,
                          textTransform: "uppercase",
                          letterSpacing: "0.02em",
                        }}
                      >
                        {task.priority}
                      </span>

                      {/* Tags */}
                      {task.tags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            fontSize: 10,
                            background: "#f0efea",
                            borderRadius: 2,
                            padding: "2px 6px",
                            color: "#666",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    {/* Bottom row: due date + subtask info */}
                    {(task.due_date || sub) && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginTop: 4,
                        }}
                      >
                        {task.due_date && (
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 10,
                              color:
                                new Date(task.due_date) < new Date() &&
                                task.status !== "complete"
                                  ? "#ff3d00"
                                  : "#888886",
                            }}
                          >
                            {formatDate(task.due_date)}
                          </span>
                        )}
                        {sub && (
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 10,
                              color: "#888886",
                            }}
                          >
                            {sub.done}/{sub.total} subtasks
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {columns[status].length === 0 && (
                <div
                  style={{
                    fontSize: 12,
                    color: "#bbb",
                    textAlign: "center",
                    padding: "20px 8px",
                  }}
                >
                  No tasks
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* List View */}
      {view === "list" && (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr>
                {[
                  { key: "title" as SortKey, label: "Title" },
                  { key: "client" as SortKey, label: "Client" },
                  { key: "status" as SortKey, label: "Status" },
                  { key: "priority" as SortKey, label: "Priority" },
                  { key: null, label: "Tags" },
                  { key: "due_date" as SortKey, label: "Due Date" },
                  {
                    key: "time_estimate_minutes" as SortKey,
                    label: "Estimate",
                  },
                  {
                    key: "time_tracked_minutes" as SortKey,
                    label: "Tracked",
                  },
                ].map(({ key, label }) => (
                  <th
                    key={label}
                    onClick={() => key && handleSort(key)}
                    style={{
                      textAlign: "left",
                      padding: "8px 10px",
                      borderBottom: "1px solid #e8e6df",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#888886",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      cursor: key ? "pointer" : "default",
                      whiteSpace: "nowrap",
                      userSelect: "none",
                    }}
                  >
                    {label}
                    {key && sortArrow(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedList.map((task) => (
                <tr
                  key={task.id}
                  onClick={() => onSelectTask(task)}
                  style={{
                    cursor: "pointer",
                    transition: "background 0.1s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background =
                      "#fafaf7";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background =
                      "transparent";
                  }}
                >
                  <td
                    style={{
                      padding: "10px 10px",
                      borderBottom: "1px solid #f0efea",
                      fontWeight: 500,
                      color: "#1a1a18",
                    }}
                  >
                    {task.title}
                  </td>
                  <td
                    style={{
                      padding: "10px 10px",
                      borderBottom: "1px solid #f0efea",
                      color: "#888886",
                      fontSize: 12,
                    }}
                  >
                    {clientName(task)}
                  </td>
                  <td
                    style={{
                      padding: "10px 10px",
                      borderBottom: "1px solid #f0efea",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        fontWeight: 600,
                        color: STATUS_COLORS[task.status],
                        background: STATUS_COLORS[task.status] + "18",
                        padding: "2px 8px",
                        borderRadius: 2,
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {STATUS_LABELS[task.status]}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "10px 10px",
                      borderBottom: "1px solid #f0efea",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        fontWeight: 600,
                        color: PRIORITY_COLORS[task.priority],
                        background: PRIORITY_COLORS[task.priority] + "14",
                        padding: "2px 6px",
                        borderRadius: 2,
                        textTransform: "uppercase",
                      }}
                    >
                      {task.priority}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "10px 10px",
                      borderBottom: "1px solid #f0efea",
                    }}
                  >
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {task.tags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            fontSize: 10,
                            background: "#f0efea",
                            borderRadius: 2,
                            padding: "2px 6px",
                            color: "#666",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td
                    style={{
                      padding: "10px 10px",
                      borderBottom: "1px solid #f0efea",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color:
                        task.due_date &&
                        new Date(task.due_date) < new Date() &&
                        task.status !== "complete"
                          ? "#ff3d00"
                          : "#888886",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatDate(task.due_date)}
                  </td>
                  <td
                    style={{
                      padding: "10px 10px",
                      borderBottom: "1px solid #f0efea",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "#888886",
                    }}
                  >
                    {formatMinutes(task.time_estimate_minutes)}
                  </td>
                  <td
                    style={{
                      padding: "10px 10px",
                      borderBottom: "1px solid #f0efea",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "#888886",
                    }}
                  >
                    {formatMinutes(task.time_tracked_minutes)}
                  </td>
                </tr>
              ))}
              {sortedList.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      padding: 32,
                      textAlign: "center",
                      color: "#bbb",
                      fontSize: 13,
                    }}
                  >
                    No tasks match your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Status Notes Modal */}
      {statusNotesModal && modalTask && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={cancelStatusChange}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 6,
              padding: 24,
              width: 400,
              maxWidth: "90vw",
              boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
            }}
          >
            <h3
              style={{
                fontSize: 15,
                fontWeight: 600,
                margin: "0 0 4px",
                color: "#1a1a18",
              }}
            >
              Move Task
            </h3>
            <p
              style={{
                fontSize: 13,
                color: "#888886",
                margin: "0 0 16px",
              }}
            >
              Moving{" "}
              <strong style={{ color: "#1a1a18" }}>{modalTask.title}</strong> to{" "}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  color: STATUS_COLORS[statusNotesModal.newStatus],
                  fontWeight: 600,
                }}
              >
                {STATUS_LABELS[statusNotesModal.newStatus]}
              </span>
            </p>
            <textarea
              placeholder="Notes (optional)"
              value={statusNotes}
              onChange={(e) => setStatusNotes(e.target.value)}
              rows={3}
              style={{
                width: "100%",
                padding: "8px 10px",
                fontSize: 13,
                border: "1px solid #e8e6df",
                borderRadius: 4,
                outline: "none",
                fontFamily: "var(--font-sans)",
                resize: "vertical",
                marginBottom: 16,
                boxSizing: "border-box",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                onClick={cancelStatusChange}
                disabled={updating}
                style={{
                  padding: "6px 14px",
                  fontSize: 13,
                  fontFamily: "var(--font-mono)",
                  background: "#fff",
                  color: "#1a1a18",
                  border: "1px solid #e8e6df",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmStatusChange}
                disabled={updating}
                style={{
                  padding: "6px 14px",
                  fontSize: 13,
                  fontFamily: "var(--font-mono)",
                  background: "#1a1a18",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  cursor: updating ? "not-allowed" : "pointer",
                  opacity: updating ? 0.6 : 1,
                }}
              >
                {updating ? "Updating..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
