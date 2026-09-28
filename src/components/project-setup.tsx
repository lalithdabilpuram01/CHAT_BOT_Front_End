"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Download, Plug, X } from "lucide-react";
import {
  buildRequestBody,
  defaultConnection,
  parseProfile,
  queryConnection,
  editableConnection,
} from "@/lib/project-profiles";
import { createProjectAdapter } from "@/lib/project-adapter";
import type { ConnectionConfig, ProjectProfile } from "@/lib/types";

export function ProjectSetup({
  initial,
  onSave,
  onRemove,
  onClose,
}: {
  initial?: ProjectProfile;
  onSave: (profile: ProjectProfile) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<ProjectProfile>(() =>
    initial
      ? { ...initial, connection: editableConnection(initial.connection) }
      : {
          version: 1,
          id: `custom-${crypto.randomUUID()}`,
          name: "",
          description: "Ask questions across your own knowledge base.",
          prompts: [],
          connection: { ...queryConnection, backendUrl: "" },
        },
  );
  const [prompts, setPrompts] = useState(initial?.prompts.join("\n") ?? "");
  const [importText, setImportText] = useState("");
  const [question, setQuestion] = useState(
    "What information can you help me find?",
  );
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef<AbortController | null>(null);
  const connection = profile.connection;
  useEffect(() => {
    dialog.current?.showModal();
    return () => pending.current?.abort();
  }, []);
  function config(patch: Partial<ConnectionConfig>) {
    setProfile((p) => ({ ...p, connection: { ...p.connection, ...patch } }));
    setTestResult("");
    setError("");
  }
  function validated() {
    return parseProfile({
      ...profile,
      prompts: prompts
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }
  const request = {
    projectId: profile.id,
    conversationId: "preview-conversation-id",
    documentIds: [],
    messages: [{ role: "user" as const, content: question }],
  };
  async function testConnection() {
    setError("");
    setTestResult("");
    let current: ProjectProfile;
    try {
      current = validated();
      if (!question.trim()) throw new Error("Enter a test question.");
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const abort = new AbortController();
    pending.current = abort;
    setTesting(true);
    let answer = "";
    let count = 0;
    try {
      for await (const event of createProjectAdapter(current.connection).stream(
        { ...request, conversationId: crypto.randomUUID() },
        AbortSignal.any([abort.signal, AbortSignal.timeout(120_000)]),
      )) {
        if (event.type === "delta") answer += event.text;
        if (event.type === "sources") count = event.sources.length;
      }
      if (!answer.trim())
        throw new Error(
          "The API completed without an answer. Check its response format.",
        );
      setTestResult(
        `Connection verified · ${count} supporting sources\n\n${answer.slice(0, 1500)}`,
      );
    } catch (e) {
      if (!abort.signal.aborted)
        setError(
          (e as Error).name === "TimeoutError"
            ? "The test timed out after two minutes. Check your backend and try again."
            : (e as Error).message,
        );
    } finally {
      setTesting(false);
      pending.current = null;
    }
  }
  function exportProfile() {
    try {
      const current = validated();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(current, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${current.id}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="help-dialog setup-dialog"
      onCancel={onClose}
    >
      <div className="dialog-title">
        <span className="brand-mark">
          <Plug size={20} />
        </span>
        <h2>{initial ? "Project settings" : "Connect your RAG project"}</h2>
        <button
          className="icon-button"
          aria-label="Close project settings"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <p>
        Enter your backend server address, choose its settings, and start
        chatting.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onSave(validated());
          } catch (error) {
            setError((error as Error).message);
          }
        }}
      >
        <fieldset disabled={testing}>
          <label>
            Connection preset
            <select
              value=""
              onChange={(e) =>
                config({
                  ...(e.target.value === "query"
                    ? queryConnection
                    : {
                        ...defaultConnection,
                        conversationIdField: "",
                        queryPath: "/chat",
                      }),
                  backendUrl: connection.backendUrl ?? "",
                  endpoint: "/api/rag",
                })
              }
            >
              <option value="" disabled>
                Choose a preset to fill connection fields
              </option>
              <option value="query">RAG query — q + thread_id</option>
              <option value="generic">
                Custom backend — question + answer
              </option>
            </select>
          </label>
          <div className="setup-grid">
            <label>
              Project name
              <input
                required
                maxLength={80}
                value={profile.name}
                placeholder="My research assistant"
                onChange={(e) =>
                  setProfile({ ...profile, name: e.target.value })
                }
              />
            </label>
            <label>
              Response format
              <select
                value={connection.protocol}
                onChange={(e) =>
                  config({
                    protocol: e.target.value as ConnectionConfig["protocol"],
                    ...(e.target.value === "ndjson"
                      ? { requestMode: "folio" as const }
                      : {}),
                  })
                }
              >
                <option value="json">JSON — one complete answer</option>
                <option value="ndjson">NDJSON — streaming events</option>
              </select>
            </label>
          </div>
          <label>
            Backend server URL
            <input
              required
              value={connection.backendUrl ?? ""}
              placeholder="https://my-rag-server.example.com"
              onChange={(e) =>
                config({
                  backendUrl: e.target.value.trim(),
                  queryPath: connection.queryPath ?? "/query",
                })
              }
            />
          </label>
          <label>
            Question path
            <input
              required
              value={connection.queryPath ?? "/query"}
              placeholder="/query"
              onChange={(e) => config({ queryPath: e.target.value.trim() })}
            />
          </label>
          <p className="field-hint">
            Paste your server address above. The question path is usually /query
            or /chat. Folio handles the connection; save a different server for
            each project.
          </p>
          <div className="setup-grid">
            <label>
              Request format
              <select
                value={connection.requestMode}
                onChange={(e) =>
                  config({
                    requestMode: e.target
                      .value as ConnectionConfig["requestMode"],
                  })
                }
              >
                <option value="question">Question field</option>
                <option value="messages">Messages array</option>
                <option value="folio">Folio conversation envelope</option>
              </select>
            </label>
            {connection.requestMode === "question" ? (
              <label>
                Question field name
                <input
                  required
                  value={connection.questionField}
                  onChange={(e) => config({ questionField: e.target.value })}
                  placeholder="question, query, or input"
                />
              </label>
            ) : connection.requestMode === "messages" ? (
              <label>
                Model (if your API requires it)
                <input
                  value={connection.model}
                  onChange={(e) => config({ model: e.target.value })}
                  placeholder="Optional model name"
                />
              </label>
            ) : (
              <p className="field-hint">
                Sends projectId, conversationId, messages, and documentIds.
              </p>
            )}
            {connection.protocol === "json" && (
              <>
                <label>
                  Answer field path
                  <input
                    required
                    value={connection.answerPath}
                    placeholder="answer or data.answer"
                    onChange={(e) => config({ answerPath: e.target.value })}
                  />
                </label>
                <label>
                  Sources field path (optional)
                  <input
                    value={connection.sourcesPath}
                    placeholder="sources"
                    onChange={(e) => config({ sourcesPath: e.target.value })}
                  />
                </label>
              </>
            )}
          </div>
          {connection.requestMode !== "folio" && (
            <label>
              Conversation ID field (optional)
              <input
                value={connection.conversationIdField ?? ""}
                placeholder="thread_id or session_id"
                onChange={(e) =>
                  config({ conversationIdField: e.target.value })
                }
              />
              <span className="field-hint">
                Reuses the same ID for follow-ups. New conversations get a new
                ID.
              </span>
            </label>
          )}
          {connection.requestMode === "question" && (
            <label className="setup-checkbox">
              <input
                type="checkbox"
                checked={connection.includeHistory}
                onChange={(e) => config({ includeHistory: e.target.checked })}
              />{" "}
              Include previous messages in a history field
            </label>
          )}
          {connection.protocol === "ndjson" && (
            <p className="field-hint">
              Streaming expects Folio status, sources, delta, and done JSON
              events, one per line. An existing SSE API needs a transport
              adapter.
            </p>
          )}
          <details>
            <summary>Personalize this project</summary>
            <label>
              Description
              <input
                maxLength={300}
                value={profile.description}
                onChange={(e) =>
                  setProfile({ ...profile, description: e.target.value })
                }
              />
            </label>
            <label>
              Starter questions — one per line, up to six
              <textarea
                rows={3}
                value={prompts}
                onChange={(e) => setPrompts(e.target.value)}
                placeholder="What can I learn from these documents?"
              />
            </label>
          </details>
          <details>
            <summary>Preview the request</summary>
            <pre>
              {JSON.stringify(buildRequestBody(connection, request), null, 2)}
            </pre>
            <p className="field-hint">
              A JSON response should contain text at your answer field path. A
              sources array can contain objects with title and excerpt fields.
            </p>
          </details>
          <details>
            <summary>Import settings from another installation</summary>
            <label>
              Project JSON
              <textarea
                rows={4}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="setup-secondary"
              onClick={() => {
                try {
                  if (importText.length > 20_000)
                    throw new Error("Settings must be smaller than 20 KB.");
                  const loaded = parseProfile(JSON.parse(importText));
                  setProfile({
                    ...loaded,
                    connection: editableConnection(loaded.connection),
                    id: initial?.id ?? profile.id,
                  });
                  setPrompts(loaded.prompts.join("\n"));
                  setError("");
                  setTestResult("");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Load settings
            </button>
          </details>
          <div className="connection-test">
            <label>
              Test question
              <input
                value={question}
                maxLength={8000}
                onChange={(e) => {
                  setQuestion(e.target.value);
                  setTestResult("");
                }}
              />
            </label>
            <button
              className="setup-secondary"
              type="button"
              onClick={() => void testConnection()}
            >
              Send test question <ArrowRight size={14} />
            </button>
            <p className="field-hint">
              This sends one real request to your API and may use model credits.
            </p>
          </div>
        </fieldset>
        {testing && (
          <p role="status">
            Waiting for your API…{" "}
            <button
              type="button"
              className="setup-secondary"
              onClick={() => {
                pending.current?.abort();
                setTestResult("Test stopped.");
              }}
            >
              Cancel test
            </button>
          </p>
        )}
        {testResult && (
          <pre className="test-result" role="status">
            {testResult}
          </pre>
        )}
        {error && (
          <p className="setup-error" role="alert">
            {error}
          </p>
        )}
        <p className="field-hint">
          Connection settings are saved in this browser. Keep API keys and
          passwords on your backend; they do not belong in the endpoint or
          project settings.
        </p>
        <div className="setup-actions">
          <button
            type="button"
            className="setup-secondary"
            disabled={testing}
            onClick={exportProfile}
          >
            <Download size={14} /> Export settings
          </button>
          <button type="submit" className="setup-primary" disabled={testing}>
            Save project <ArrowRight size={15} />
          </button>
        </div>
        {initial && (
          <button
            className="remove-project"
            type="button"
            disabled={testing}
            onClick={() => {
              if (
                window.confirm(
                  "Remove this local connection and its session conversations? Backend data will not be changed.",
                )
              )
                onRemove(initial.id);
            }}
          >
            Remove local connection
          </button>
        )}
      </form>
    </dialog>
  );
}
