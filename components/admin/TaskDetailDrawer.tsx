"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import type {
  Task,
  TaskComment,
  TaskStatusHistory,
  TaskStatus,
  TaskPriority,
  TaskAttachment,
} from "@/lib/types/client-tasks";
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  PREDEFINED_TAGS,
} from "@/lib/types/client-tasks";

interface TaskDetailDrawerProps {
  taskId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}

interface TaskDetail {
  task: Task;
  subtasks: Task[];
  comments: TaskComment[];
  history: TaskStatusHistory[];
}

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
}

const sectionHeaderStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  fontWeight: 500,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "#888886",
  marginBottom: "10px",
};

const sectionStyle: React.CSSProperties = {
  borderBottom: "1px solid #e8e6df",
  padding: "16px 0",
};

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "13px",
  fontWeight: 500,
  color: "#888886",
  minWidth: "100px",
  flexShrink: 0,
};

const valueTextStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "14px",
  color: "#111110",
  lineHeight: 1.5,
};

const inputStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "14px",
  color: "#111110",
  border: "1px solid #e8e6df",
  borderRadius: "4px",
  padding: "6px 10px",
  outline: "none",
  width: "100%",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  width: "auto",
  cursor: "pointer",
  background: "#fff",
};

const smallBtnStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.04em",
  padding: "5px 12px",
  borderRadius: "4px",
  border: "none",
  cursor: "pointer",
  background: "#ff3d00",
  color: "#fff",
};

const statusColors: Record<TaskStatus, string> = {
  backlog: "#888886",
  in_progress: "#2196f3",
  blocked: "#e53935",
  complete: "#43a047",
};

const priorityColors: Record<TaskPriority, string> = {
  low: "#888886",
  medium: "#fb8c00",
  high: "#e53935",
  urgent: "#d50000",
};

export function TaskDetailDrawer({
  taskId,
  onClose,
  onUpdated,
}: TaskDetailDrawerProps) {
  const [data, setData] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);

  // Editable states
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [statusNotes, setStatusNotes] = useState("");
  const [showStatusNotes, setShowStatusNotes] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<TaskStatus | null>(null);
  const [descDraft, setDescDraft] = useState("");

  // Tags
  const [tagInput, setTagInput] = useState("");
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);

  // Time tracking
  const [showAddTime, setShowAddTime] = useState(false);
  const [addTimeMinutes, setAddTimeMinutes] = useState("");

  // Subtask
  const [subtaskInput, setSubtaskInput] = useState("");

  // Comment
  const [commentInput, setCommentInput] = useState("");

  // History
  const [historyOpen, setHistoryOpen] = useState(false);

  // Delete
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchTask = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/tasks/${id}`);
      if (res.ok) {
        const detail: TaskDetail = await res.json();
        setData(detail);
        setTitleDraft(detail.task.title);
        setDescDraft(detail.task.description || "");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (taskId) {
      fetchTask(taskId);
      setShowStatusNotes(false);
      setPendingStatus(null);
      setHistoryOpen(false);
      setShowAddTime(false);
      setEditingTitle(false);
      setConfirmingDelete(false);
      setDeleting(false);
    } else {
      setData(null);
    }
  }, [taskId, fetchTask]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const patchTask = async (updates: Partial<Task>) => {
    if (!taskId) return;
    await fetch(`/api/admin/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    await fetchTask(taskId);
    onUpdated();
  };

  if (!taskId) return null;

  const task = data?.task;
  const subtasks = data?.subtasks || [];
  const comments = data?.comments || [];
  const history = data?.history || [];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(17,17,16,0.3)",
          zIndex: 50,
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(520px, 90vw)",
          background: "#fff",
          borderLeft: "1.5px solid #e8e6df",
          zIndex: 51,
          overflowY: "auto",
          padding: "32px 28px 60px",
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            background: "transparent",
            border: "none",
            fontSize: "20px",
            color: "#888886",
            cursor: "pointer",
            padding: "4px 8px",
          }}
        >
          ✕
        </button>

        {loading && !task && (
          <p style={{ ...valueTextStyle, color: "#888886" }}>Loading...</p>
        )}

        {task && (
          <>
            {/* ─── Title ─── */}
            <div style={{ marginBottom: "24px" }}>
              {editingTitle ? (
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={async () => {
                    setEditingTitle(false);
                    if (titleDraft.trim() && titleDraft !== task.title) {
                      await patchTask({ title: titleDraft.trim() });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    color: "#111110",
                    border: "1px solid #e8e6df",
                    borderRadius: "4px",
                    padding: "4px 8px",
                    width: "100%",
                    outline: "none",
                  }}
                />
              ) : (
                <h2
                  onClick={() => setEditingTitle(true)}
                  style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    color: "#111110",
                    cursor: "pointer",
                  }}
                  title="Click to edit"
                >
                  {task.title}
                </h2>
              )}
              <p
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                  color: "#888886",
                  marginTop: "4px",
                }}
              >
                Created{" "}
                {new Date(task.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>

            {/* ─── Status ─── */}
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>Status</div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <select
                  value={pendingStatus ?? task.status}
                  onChange={(e) => {
                    const next = e.target.value as TaskStatus;
                    setPendingStatus(next);
                    setShowStatusNotes(true);
                    setStatusNotes("");
                  }}
                  style={{
                    ...selectStyle,
                    color: statusColors[pendingStatus ?? task.status],
                    fontWeight: 600,
                  }}
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>

                {showStatusNotes && pendingStatus && (
                  <div style={{ display: "flex", gap: "6px", alignItems: "center", width: "100%", marginTop: "8px" }}>
                    <input
                      placeholder="Notes (optional)"
                      value={statusNotes}
                      onChange={(e) => setStatusNotes(e.target.value)}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button
                      onClick={async () => {
                        await fetch(`/api/admin/tasks/${taskId}/status`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            status: pendingStatus,
                            notes: statusNotes || null,
                          }),
                        });
                        setShowStatusNotes(false);
                        setPendingStatus(null);
                        setStatusNotes("");
                        await fetchTask(taskId);
                        onUpdated();
                      }}
                      style={smallBtnStyle}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setShowStatusNotes(false);
                        setPendingStatus(null);
                      }}
                      style={{ ...smallBtnStyle, background: "#e8e6df", color: "#111110" }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ─── Priority ─── */}
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>Priority</div>
              <select
                value={task.priority}
                onChange={async (e) => {
                  await patchTask({ priority: e.target.value as TaskPriority });
                }}
                style={{
                  ...selectStyle,
                  color: priorityColors[task.priority],
                  fontWeight: 600,
                }}
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* ─── Tags ─── */}
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>Tags</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "8px" }}>
                {task.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                      fontWeight: 600,
                      background: "#f5f4f0",
                      color: "#111110",
                      padding: "3px 10px",
                      borderRadius: "12px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    {tag}
                    <button
                      onClick={async () => {
                        await patchTask({ tags: task.tags.filter((t) => t !== tag) } as Partial<Task>);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#888886",
                        fontSize: "12px",
                        padding: 0,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div style={{ position: "relative" }}>
                <input
                  placeholder="Add tag..."
                  value={tagInput}
                  onChange={(e) => {
                    setTagInput(e.target.value);
                    setShowTagSuggestions(true);
                  }}
                  onFocus={() => setShowTagSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowTagSuggestions(false), 150)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && tagInput.trim()) {
                      const newTag = tagInput.trim();
                      if (!task.tags.includes(newTag)) {
                        await patchTask({ tags: [...task.tags, newTag] } as Partial<Task>);
                      }
                      setTagInput("");
                      setShowTagSuggestions(false);
                    }
                  }}
                  style={{ ...inputStyle, width: "200px" }}
                />
                {showTagSuggestions && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      background: "#fff",
                      border: "1px solid #e8e6df",
                      borderRadius: "4px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                      zIndex: 10,
                      maxHeight: "160px",
                      overflowY: "auto",
                      width: "200px",
                    }}
                  >
                    {PREDEFINED_TAGS.filter(
                      (t) =>
                        !task.tags.includes(t) &&
                        t.toLowerCase().includes(tagInput.toLowerCase())
                    ).map((t) => (
                      <div
                        key={t}
                        onMouseDown={async () => {
                          await patchTask({ tags: [...task.tags, t] } as Partial<Task>);
                          setTagInput("");
                          setShowTagSuggestions(false);
                        }}
                        style={{
                          padding: "6px 12px",
                          cursor: "pointer",
                          fontSize: "13px",
                          fontFamily: "var(--font-sans)",
                          color: "#111110",
                        }}
                        onMouseEnter={(e) => {
                          (e.target as HTMLDivElement).style.background = "#f5f4f0";
                        }}
                        onMouseLeave={(e) => {
                          (e.target as HTMLDivElement).style.background = "#fff";
                        }}
                      >
                        {t}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ─── Due Date ─── */}
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>Due Date</div>
              <input
                type="date"
                value={task.due_date ? task.due_date.slice(0, 10) : ""}
                onChange={async (e) => {
                  await patchTask({ due_date: e.target.value || null } as Partial<Task>);
                }}
                style={{ ...inputStyle, width: "180px" }}
              />
            </div>

            {/* ─── Time Estimate ─── */}
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>Time Estimate</div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <input
                  type="number"
                  min={0}
                  placeholder="Minutes"
                  value={task.time_estimate_minutes ?? ""}
                  onChange={async (e) => {
                    const val = e.target.value ? parseInt(e.target.value, 10) : null;
                    await patchTask({ time_estimate_minutes: val } as Partial<Task>);
                  }}
                  style={{ ...inputStyle, width: "100px" }}
                />
                {task.time_estimate_minutes != null && (
                  <span style={{ ...valueTextStyle, color: "#888886" }}>
                    {formatMinutes(task.time_estimate_minutes)}
                  </span>
                )}
              </div>
            </div>

            {/* ─── Time Tracker ─── */}
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>Time Tracked</div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <span style={valueTextStyle}>
                  Tracked: {formatMinutes(task.time_tracked_minutes)}
                </span>
                {!showAddTime ? (
                  <button
                    onClick={() => setShowAddTime(true)}
                    style={{ ...smallBtnStyle, background: "#f5f4f0", color: "#111110" }}
                  >
                    + Add Time
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <input
                      type="number"
                      min={1}
                      placeholder="min"
                      value={addTimeMinutes}
                      onChange={(e) => setAddTimeMinutes(e.target.value)}
                      autoFocus
                      style={{ ...inputStyle, width: "80px" }}
                    />
                    <button
                      onClick={async () => {
                        const mins = parseInt(addTimeMinutes, 10);
                        if (!mins || mins <= 0) return;
                        await fetch(`/api/admin/tasks/${taskId}/time`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ minutes: mins }),
                        });
                        setAddTimeMinutes("");
                        setShowAddTime(false);
                        await fetchTask(taskId);
                        onUpdated();
                      }}
                      style={smallBtnStyle}
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setShowAddTime(false);
                        setAddTimeMinutes("");
                      }}
                      style={{ ...smallBtnStyle, background: "#e8e6df", color: "#111110" }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ─── Description ─── */}
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>Description</div>
              <textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                onBlur={async () => {
                  const val = descDraft.trim() || null;
                  if (val !== (task.description || null)) {
                    await patchTask({ description: val } as Partial<Task>);
                  }
                }}
                placeholder="Add a description..."
                rows={4}
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  minHeight: "80px",
                  lineHeight: 1.5,
                }}
              />
            </div>

            {/* ─── Subtasks ─── */}
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>
                Subtasks{subtasks.length > 0 ? ` (${subtasks.length})` : ""}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {subtasks.map((sub) => (
                  <label
                    key={sub.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={sub.status === "complete"}
                      onChange={async () => {
                        const newStatus: TaskStatus =
                          sub.status === "complete" ? "backlog" : "complete";
                        await fetch(`/api/admin/tasks/${sub.id}/status`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: newStatus, notes: null }),
                        });
                        await fetchTask(taskId);
                        onUpdated();
                      }}
                      style={{ accentColor: "#ff3d00" }}
                    />
                    <span
                      style={{
                        ...valueTextStyle,
                        textDecoration:
                          sub.status === "complete" ? "line-through" : "none",
                        color:
                          sub.status === "complete" ? "#888886" : "#111110",
                      }}
                    >
                      {sub.title}
                    </span>
                  </label>
                ))}
                <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                  <input
                    placeholder="Add subtask..."
                    value={subtaskInput}
                    onChange={(e) => setSubtaskInput(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter" && subtaskInput.trim()) {
                        await fetch("/api/admin/tasks", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            client_id: task.client_id,
                            title: subtaskInput.trim(),
                            parent_task_id: taskId,
                          }),
                        });
                        setSubtaskInput("");
                        await fetchTask(taskId);
                        onUpdated();
                      }
                    }}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </div>
              </div>
            </div>

            {/* ─── Attachments ─── */}
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>
                Attachments{task.attachments.length > 0 ? ` (${task.attachments.length})` : ""}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {task.attachments.map((att: TaskAttachment, i: number) => (
                  <a
                    key={i}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      ...valueTextStyle,
                      color: "#2196f3",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span style={{ fontSize: "14px" }}>📎</span>
                    {att.name}
                  </a>
                ))}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const formData = new FormData();
                  formData.append("file", file);
                  formData.append("token", taskId);
                  const res = await fetch("/api/upload", {
                    method: "POST",
                    body: formData,
                  });
                  if (res.ok) {
                    const { url } = await res.json();
                    const newAttachment: TaskAttachment = {
                      name: file.name,
                      url,
                      type: file.type,
                    };
                    await patchTask({
                      attachments: [...task.attachments, newAttachment],
                    } as Partial<Task>);
                  }
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  ...smallBtnStyle,
                  background: "#f5f4f0",
                  color: "#111110",
                  marginTop: "8px",
                }}
              >
                + Upload
              </button>
            </div>

            {/* ─── Comments ─── */}
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>
                Comments{comments.length > 0 ? ` (${comments.length})` : ""}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {comments.map((c) => {
                  const badgeColor =
                    c.author_type === "admin"
                      ? "#ff3d00"
                      : c.author_type === "client"
                      ? "#2196f3"
                      : "#888886";
                  return (
                    <div
                      key={c.id}
                      style={{
                        borderLeft: c.is_request
                          ? "3px solid #fb8c00"
                          : "3px solid transparent",
                        paddingLeft: "12px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "4px",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-sans)",
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "#111110",
                          }}
                        >
                          {c.author_name}
                        </span>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "10px",
                            fontWeight: 700,
                            color: "#fff",
                            background: badgeColor,
                            padding: "1px 6px",
                            borderRadius: "3px",
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                          }}
                        >
                          {c.author_type}
                        </span>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "11px",
                            color: "#888886",
                          }}
                        >
                          {new Date(c.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p style={{ ...valueTextStyle, margin: 0 }}>{c.content}</p>
                    </div>
                  );
                })}
              </div>

              {/* New comment */}
              <div style={{ display: "flex", gap: "6px", marginTop: "12px" }}>
                <input
                  placeholder="Write a comment..."
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && commentInput.trim()) {
                      await fetch(`/api/admin/tasks/${taskId}/comments`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ content: commentInput.trim() }),
                      });
                      setCommentInput("");
                      await fetchTask(taskId);
                    }
                  }}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  onClick={async () => {
                    if (!commentInput.trim()) return;
                    await fetch(`/api/admin/tasks/${taskId}/comments`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ content: commentInput.trim() }),
                    });
                    setCommentInput("");
                    await fetchTask(taskId);
                  }}
                  style={smallBtnStyle}
                >
                  Post
                </button>
              </div>
            </div>

            {/* ─── Status History ─── */}
            <div style={{ padding: "16px 0" }}>
              <button
                onClick={() => setHistoryOpen(!historyOpen)}
                style={{
                  ...sectionHeaderStyle,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: 0,
                }}
              >
                <span
                  style={{
                    transform: historyOpen ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 0.15s",
                    display: "inline-block",
                    fontSize: "10px",
                  }}
                >
                  ▶
                </span>
                Status History{history.length > 0 ? ` (${history.length})` : ""}
              </button>

              {historyOpen && (
                <div style={{ marginTop: "12px", paddingLeft: "8px" }}>
                  {history.length === 0 && (
                    <p style={{ ...valueTextStyle, color: "#888886", fontSize: "13px" }}>
                      No history yet.
                    </p>
                  )}
                  {history.map((h, i) => (
                    <div
                      key={h.id}
                      style={{
                        display: "flex",
                        gap: "12px",
                        position: "relative",
                        paddingBottom: i < history.length - 1 ? "16px" : "0",
                      }}
                    >
                      {/* Timeline dot + line */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          width: "12px",
                          flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            background:
                              statusColors[h.new_status as TaskStatus] || "#888886",
                            marginTop: "4px",
                          }}
                        />
                        {i < history.length - 1 && (
                          <div
                            style={{
                              width: "1px",
                              flex: 1,
                              background: "#e8e6df",
                              marginTop: "4px",
                            }}
                          />
                        )}
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "11px",
                              fontWeight: 700,
                              color:
                                statusColors[h.new_status as TaskStatus] ||
                                "#888886",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                            }}
                          >
                            {h.new_status.replace(/_/g, " ")}
                          </span>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "11px",
                              color: "#888886",
                            }}
                          >
                            by {h.changed_by}
                          </span>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "11px",
                              color: "#aaa",
                            }}
                          >
                            {new Date(h.created_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        {h.notes && (
                          <p
                            style={{
                              ...valueTextStyle,
                              fontSize: "13px",
                              color: "#555",
                              marginTop: "2px",
                            }}
                          >
                            {h.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ─── Delete Task ─── */}
            <div style={{ padding: "24px 0 0" }}>
              {!confirmingDelete ? (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                    padding: "8px 16px",
                    borderRadius: "4px",
                    border: "1px solid #e8e6df",
                    cursor: "pointer",
                    background: "#fff",
                    color: "#e53935",
                    width: "100%",
                  }}
                >
                  Delete Task
                </button>
              ) : (
                <div
                  style={{
                    border: "1px solid #e53935",
                    borderRadius: "6px",
                    padding: "14px",
                    background: "#fef2f2",
                  }}
                >
                  <p
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "#111110",
                      margin: "0 0 10px",
                    }}
                  >
                    Are you sure? This will permanently delete this task
                    {subtasks.length > 0
                      ? ` and its ${subtasks.length} subtask${subtasks.length > 1 ? "s" : ""}`
                      : ""}
                    .
                  </p>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      disabled={deleting}
                      onClick={async () => {
                        setDeleting(true);
                        try {
                          const res = await fetch(`/api/admin/tasks/${taskId}`, {
                            method: "DELETE",
                          });
                          if (!res.ok) throw new Error("Failed to delete task");
                          onUpdated();
                          onClose();
                        } catch {
                          alert("Failed to delete task. Please try again.");
                          setDeleting(false);
                        }
                      }}
                      style={{
                        ...smallBtnStyle,
                        background: "#e53935",
                        opacity: deleting ? 0.6 : 1,
                      }}
                    >
                      {deleting ? "Deleting..." : "Yes, Delete"}
                    </button>
                    <button
                      onClick={() => setConfirmingDelete(false)}
                      style={{
                        ...smallBtnStyle,
                        background: "#e8e6df",
                        color: "#111110",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
