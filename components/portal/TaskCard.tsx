"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TaskComment, TaskAttachment } from "@/lib/types/client-tasks";

interface TaskCardProps {
  task: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    tags: string[];
    due_date: string | null;
    estimated_completion_date: string | null;
    attachments: TaskAttachment[];
    created_at: string;
    completed_at: string | null;
    subtask_count: number;
    subtasks_completed: number;
  };
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  low: { bg: "#c8c6be", text: "#111110" },
  medium: { bg: "#2196f3", text: "#fff" },
  high: { bg: "#ff6b35", text: "#fff" },
  urgent: { bg: "#ff3d00", text: "#fff" },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  backlog: { bg: "#c8c6be", text: "#111110" },
  in_progress: { bg: "#2196f3", text: "#fff" },
  blocked: { bg: "#ff6b35", text: "#fff" },
  complete: { bg: "#4caf50", text: "#fff" },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ");
}

export default function TaskCard({ task }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentContent, setCommentContent] = useState("");
  const [isRequest, setIsRequest] = useState(false);
  const [posting, setPosting] = useState(false);

  const fetchComments = useCallback(async () => {
    setLoadingComments(true);
    try {
      const res = await fetch(`/api/portal/tasks/${task.id}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingComments(false);
    }
  }, [task.id]);

  const handleToggle = () => {
    const willExpand = !expanded;
    setExpanded(willExpand);
    if (willExpand) {
      fetchComments();
    }
  };

  const handlePost = async () => {
    if (!commentContent.trim() || posting) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/portal/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentContent.trim(), is_request: isRequest }),
      });
      if (res.ok) {
        setCommentContent("");
        setIsRequest(false);
        await fetchComments();
      }
    } catch {
      // silently fail
    } finally {
      setPosting(false);
    }
  };

  const priorityStyle = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.low;
  const statusStyle = STATUS_COLORS[task.status] ?? STATUS_COLORS.backlog;

  const commentBorderColor = (authorType: string) => {
    if (authorType === "admin") return "#ff3d00";
    if (authorType === "client") return "#2196f3";
    return "#888886";
  };

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e8e6df",
        borderRadius: 6,
        padding: 16,
        marginBottom: 8,
        cursor: "pointer",
        transition: "border-color 0.15s ease",
      }}
      onClick={handleToggle}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "#c8c6be";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "#e8e6df";
      }}
    >
      {/* Collapsed: top row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 16, color: "#111110", fontWeight: 500 }}>{task.title}</span>
        <span
          style={{
            fontSize: 10,
            fontFamily: "monospace",
            textTransform: "uppercase",
            padding: "2px 8px",
            borderRadius: 2,
            background: priorityStyle.bg,
            color: priorityStyle.text,
            flexShrink: 0,
            marginLeft: 12,
          }}
        >
          {task.priority}
        </span>
      </div>

      {/* Collapsed: bottom row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 8,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontFamily: "monospace",
            textTransform: "uppercase",
            padding: "2px 8px",
            borderRadius: 2,
            background: statusStyle.bg,
            color: statusStyle.text,
          }}
        >
          {formatStatus(task.status)}
        </span>

        {task.tags.map((tag) => (
          <span
            key={tag}
            style={{
              fontSize: 10,
              background: "#f4f3ee",
              color: "#888886",
              padding: "2px 6px",
              borderRadius: 2,
            }}
          >
            {tag}
          </span>
        ))}

        {task.due_date && (
          <span style={{ fontSize: 12, fontFamily: "monospace", color: "#888886" }}>
            Due {formatDate(task.due_date)}
          </span>
        )}

        {task.subtask_count > 0 && (
          <span style={{ fontSize: 12, fontFamily: "monospace", color: "#888886" }}>
            {task.subtasks_completed}/{task.subtask_count}
          </span>
        )}
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ paddingTop: 16, marginTop: 16, borderTop: "1px solid #e8e6df" }}>
              {/* Description */}
              {task.description && (
                <p
                  style={{
                    fontSize: 14,
                    color: "#888886",
                    lineHeight: 1.6,
                    margin: "0 0 12px 0",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {task.description}
                </p>
              )}

              {/* Estimated completion */}
              {task.estimated_completion_date && (
                <p style={{ fontSize: 13, color: "#888886", margin: "0 0 12px 0" }}>
                  Estimated completion: {formatDate(task.estimated_completion_date)}
                </p>
              )}

              {/* Subtask list */}
              {task.subtask_count > 0 && (
                <div style={{ margin: "0 0 12px 0" }}>
                  <p style={{ fontSize: 13, color: "#888886", margin: 0 }}>
                    Subtasks: {task.subtasks_completed} of {task.subtask_count} complete
                  </p>
                </div>
              )}

              {/* Attachments */}
              {task.attachments.length > 0 && (
                <div style={{ margin: "0 0 16px 0" }}>
                  <p
                    style={{
                      fontSize: 13,
                      color: "#888886",
                      margin: "0 0 6px 0",
                      fontWeight: 500,
                    }}
                  >
                    Attachments
                  </p>
                  <ul style={{ margin: 0, padding: "0 0 0 16px", listStyle: "none" }}>
                    {task.attachments.map((att, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            fontSize: 13,
                            color: "#ff3d00",
                            textDecoration: "none",
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLAnchorElement).style.textDecoration =
                              "underline";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLAnchorElement).style.textDecoration = "none";
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {att.name}
                        </a>
                        <span style={{ fontSize: 11, color: "#c8c6be", marginLeft: 6 }}>
                          ({att.type})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Comments section */}
              <div style={{ marginTop: 16 }}>
                <p
                  style={{
                    fontSize: 13,
                    color: "#888886",
                    margin: "0 0 8px 0",
                    fontWeight: 500,
                  }}
                >
                  Comments
                </p>

                {loadingComments ? (
                  <p style={{ fontSize: 13, color: "#c8c6be" }}>Loading comments...</p>
                ) : comments.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#c8c6be" }}>No comments yet.</p>
                ) : (
                  <div
                    style={{
                      maxHeight: 300,
                      overflowY: "auto",
                      marginBottom: 12,
                    }}
                  >
                    {comments.map((comment) => (
                      <div
                        key={comment.id}
                        style={{
                          borderLeft: `3px solid ${commentBorderColor(comment.author_type)}`,
                          paddingLeft: 12,
                          marginBottom: 12,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "baseline",
                            gap: 8,
                            marginBottom: 4,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              fontFamily: "monospace",
                              fontWeight: 700,
                              color: "#111110",
                            }}
                          >
                            {comment.author_name}
                          </span>
                          <span style={{ fontSize: 12, color: "#c8c6be" }}>
                            {formatTimestamp(comment.created_at)}
                          </span>
                        </div>
                        <p
                          style={{
                            fontSize: 14,
                            color: "#111110",
                            margin: 0,
                            lineHeight: 1.5,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {comment.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Comment input */}
                <textarea
                  value={commentContent}
                  onChange={(e) => setCommentContent(e.target.value)}
                  placeholder="Add a comment or question..."
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: "100%",
                    minHeight: 80,
                    background: "#f4f3ee",
                    border: "1px solid #e8e6df",
                    borderRadius: 4,
                    padding: 12,
                    color: "#111110",
                    fontSize: 14,
                    resize: "vertical",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                  onFocus={(e) => {
                    (e.currentTarget as HTMLTextAreaElement).style.borderColor = "#c8c6be";
                  }}
                  onBlur={(e) => {
                    (e.currentTarget as HTMLTextAreaElement).style.borderColor = "#e8e6df";
                  }}
                />

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: 8,
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 13,
                      color: "#888886",
                      cursor: "pointer",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isRequest}
                      onChange={(e) => setIsRequest(e.target.checked)}
                      style={{ accentColor: "#ff3d00" }}
                    />
                    Submit as request
                  </label>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePost();
                    }}
                    disabled={posting || !commentContent.trim()}
                    style={{
                      background: posting || !commentContent.trim() ? "#ffb399" : "#ff3d00",
                      color: "#fff",
                      border: "none",
                      borderRadius: 4,
                      padding: "8px 16px",
                      fontSize: 13,
                      cursor: posting || !commentContent.trim() ? "not-allowed" : "pointer",
                      fontWeight: 500,
                      transition: "background 0.15s ease",
                    }}
                  >
                    {posting ? "Posting..." : "Post"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
