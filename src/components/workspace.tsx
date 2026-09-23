"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  FileText,
  Layers3,
  Menu,
  MessageSquare,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Search,
  Sparkles,
  Square,
  Sun,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { projects as demoProjects } from "@/lib/projects";
import { ProjectSetup } from "./project-setup";
import { createProjectAdapter } from "@/lib/project-adapter";
import {
  parseProfile,
  PROFILE_STORAGE_KEY,
  toProject,
} from "@/lib/project-profiles";
import { demoAdapter } from "@/lib/demo-adapter";
import type {
  Conversation,
  Message,
  Source,
  ProjectProfile,
} from "@/lib/types";

const makeConversation = (projectId: string): Conversation => ({
  id: crypto.randomUUID(),
  projectId,
  title: "New conversation",
  messages: [],
});

export function Workspace() {
  const [profiles, setProfiles] = useState<ProjectProfile[]>([]);
  const [setup, setSetup] = useState<{ initial?: ProjectProfile } | null>(null);
  const projects = [...profiles.map(toProject), ...demoProjects];
  const [projectId, setProjectId] = useState(demoProjects[0].id);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [light, setLight] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [view, setView] = useState<"chat" | "library">("chat");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const help = useRef<HTMLDialogElement>(null);
  const project = projects.find((p) => p.id === projectId) ?? demoProjects[0];
  const isDemo = !project.connection;
  const active = conversations.find((c) => c.id === activeId);
  const messages = active?.messages ?? [];
  const availableSources = isDemo
    ? project.sources
    : [
        ...new Map(
          messages.flatMap((m) => m.sources ?? []).map((s) => [s.id, s]),
        ).values(),
      ];
  const projectChats = conversations.filter(
    (c) =>
      c.projectId === projectId &&
      c.title.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    setEvidenceOpen(window.innerWidth > 1050);
    try {
      const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (raw) {
        const data: unknown = JSON.parse(raw);
        if (!Array.isArray(data) || data.length > 50)
          throw new Error("Invalid saved projects.");
        const loaded = data.map(parseProfile);
        if (new Set(loaded.map((p) => p.id)).size !== loaded.length)
          throw new Error("Duplicate project IDs.");
        setProfiles(loaded);
        if (loaded[0]) setProjectId(loaded[0].id);
      }
    } catch {
      setNotice(
        "Saved project settings could not be loaded. You can import a settings backup.",
      );
    }
    try {
      setLight(localStorage.getItem("folio-theme") === "light");
    } catch {
      /* Theme preference is optional. */
    }
  }, []);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "instant", block: "nearest" });
  }, [messages.length, busy]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  function saveProfile(profile: ProjectProfile) {
    const next = profiles.some((p) => p.id === profile.id)
      ? profiles.map((p) => (p.id === profile.id ? profile : p))
      : [...profiles, profile];
    if (next.length > 50)
      throw new Error("You can save up to 50 project connections.");
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      throw new Error(
        "Browser storage is unavailable or full. Export these settings before closing.",
      );
    }
    setProfiles(next);
    setConversations((all) => all.filter((c) => c.projectId !== profile.id));
    newChat(profile.id);
    setSetup(null);
    setNotice("Project saved. Ask a question to use your API.");
  }
  function removeProfile(id: string) {
    const next = profiles.filter((p) => p.id !== id);
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      setNotice("Could not remove the saved connection from browser storage.");
      return;
    }
    setProfiles(next);
    setConversations((all) => all.filter((c) => c.projectId !== id));
    newChat(next[0]?.id ?? demoProjects[0].id);
    setSetup(null);
  }
  function updateMessage(
    conversationId: string,
    messageId: string,
    update: (message: Message) => Message,
  ) {
    setConversations((all) =>
      all.map((c) =>
        c.id !== conversationId
          ? c
          : {
              ...c,
              messages: c.messages.map((m) =>
                m.id === messageId ? update(m) : m,
              ),
            },
      ),
    );
  }
  function stop() {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setStatus("");
  }
  function newChat(nextProjectId = projectId) {
    stop();
    setProjectId(nextProjectId);
    setSearch("");
    setActiveId(null);
    setInput("");
    setSource(null);
    setView("chat");
    setMobileNav(false);
  }
  function selectChat(conversation: Conversation) {
    stop();
    setActiveId(conversation.id);
    setInput("");
    setSource(null);
    setView("chat");
    setMobileNav(false);
  }
  function toggleTheme() {
    setLight(!light);
    try {
      localStorage.setItem("folio-theme", light ? "dark" : "light");
    } catch {
      /* Storage may be disabled. */
    }
  }
  async function send(text = input) {
    const question = text.trim();
    if (!question || controller.current || question.length > 8000) return;
    const conversation = active ?? makeConversation(projectId);
    const user: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
    };
    const answer: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      state: "streaming",
      sources: [],
    };
    const abort = new AbortController();
    controller.current = abort;
    setActiveId(conversation.id);
    setInput("");
    setBusy(true);
    setView("chat");
    setSource(null);
    setConversations((all) => {
      const next = {
        ...conversation,
        title: conversation.messages.length ? conversation.title : question,
        messages: [...conversation.messages, user, answer],
      };
      return all.some((c) => c.id === conversation.id)
        ? all.map((c) => (c.id === conversation.id ? next : c))
        : [next, ...all];
    });
    try {
      const adapter = project.connection
        ? createProjectAdapter(project.connection)
        : demoAdapter;
      const stream = adapter.stream(
        {
          projectId,
          conversationId: conversation.id,
          documentIds: isDemo ? project.sources.map((s) => s.id) : [],
          messages: [
            ...conversation.messages.filter(
              (m) => m.role === "user" || m.state === "complete",
            ),
            user,
          ].map(({ role, content }) => ({ role, content })),
        },
        abort.signal,
      );
      for await (const event of stream) {
        abort.signal.throwIfAborted();
        if (event.type === "status") setStatus(event.text);
        if (event.type === "delta")
          updateMessage(conversation.id, answer.id, (m) => ({
            ...m,
            content: m.content + event.text,
          }));
        if (event.type === "sources")
          updateMessage(conversation.id, answer.id, (m) => ({
            ...m,
            sources: event.sources,
          }));
        if (event.type === "done")
          updateMessage(conversation.id, answer.id, (m) => ({
            ...m,
            state: "complete",
          }));
      }
    } catch (error) {
      updateMessage(conversation.id, answer.id, (m) => ({
        ...m,
        state: abort.signal.aborted ? "stopped" : "error",
        content:
          m.content ||
          (abort.signal.aborted
            ? "Response stopped."
            : error instanceof Error
              ? error.message
              : "The response could not be completed. Please try again."),
      }));
      if (!abort.signal.aborted)
        setNotice(
          error instanceof Error ? error.message : "Connection failed.",
        );
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setBusy(false);
        setStatus("");
        composer.current?.focus();
      }
    }
  }
  function inspect(item: Source) {
    setSource(item);
    setEvidenceOpen(true);
  }
  async function copy(message: Message) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      setNotice("Answer copied to clipboard.");
    } catch {
      setNotice(
        "Clipboard unavailable. You can select and copy the answer text.",
      );
    }
  }

  return (
    <div className={`workspace ${light ? "light" : ""}`}>
      {mobileNav && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <a href="/" className="brand" aria-label="Folio home">
          <span className="brand-mark">
            <Layers3 size={23} strokeWidth={1.6} />
          </span>
          folio<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">
          YOUR WORKSPACE <span>{isDemo ? "DEMO" : "API"}</span>
        </div>
        <div className="project-select">
          <span className="project-avatar">{project.initials}</span>
          <div>
            <label htmlFor="project">Knowledge space</label>
            <select
              id="project"
              value={projectId}
              onChange={(e) => newChat(e.target.value)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <ChevronDown size={14} />
        </div>
        <div className="project-tools">
          <button
            onClick={() => {
              setSetup({});
              setMobileNav(false);
            }}
          >
            <Plus size={13} /> Add project
          </button>
          {!isDemo && (
            <button
              onClick={() => {
                setSetup({
                  initial: profiles.find((p) => p.id === project.id),
                });
                setMobileNav(false);
              }}
            >
              Settings
            </button>
          )}
        </div>
        <button className="new-chat" onClick={() => newChat()}>
          <Plus size={17} /> New conversation <span>↗</span>
        </button>
        <nav aria-label="Workspace">
          <button
            className={view === "chat" ? "nav-item selected" : "nav-item"}
            onClick={() => setView("chat")}
          >
            <MessageSquare size={17} /> Conversations{" "}
            <span>
              {conversations.filter((c) => c.projectId === projectId).length}
            </span>
          </button>
          <button
            className={view === "library" ? "nav-item selected" : "nav-item"}
            onClick={() => {
              setView("library");
              setMobileNav(false);
            }}
          >
            <BookOpen size={17} /> Knowledge library{" "}
            <span>{availableSources.length}</span>
          </button>
        </nav>
        <div className="history-heading">THIS SESSION</div>
        <div className="history-search">
          <Search size={14} />
          <input
            aria-label="Search conversations"
            placeholder="Find a conversation"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="history">
          {projectChats.length ? (
            projectChats.map((c) => (
              <button
                key={c.id}
                className={`history-item ${c.id === activeId ? "active" : ""}`}
                onClick={() => selectChat(c)}
              >
                <MessageSquare size={14} />
                <span>{c.title}</span>
              </button>
            ))
          ) : (
            <p className="history-empty">
              {search
                ? "No matching conversations."
                : "A fresh space for your next good question."}
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="mini-note">
            <span className="small-spark">
              <Sparkles size={15} />
            </span>
            <div>
              <strong>Your knowledge. Connected.</strong>
              <p>Every answer starts with a source.</p>
            </div>
          </div>
          <div className="sidebar-footer">
            <div className="user-avatar">L</div>
            <div>
              <strong>Personal workspace</strong>
              <small>
                {isDemo ? "Sample workspace" : "Your RAG connection"}
              </small>
            </div>
            <button
              className="icon-button"
              aria-label={
                light ? "Switch to dark theme" : "Switch to light theme"
              }
              onClick={toggleTheme}
            >
              {light ? <Moon size={17} /> : <Sun size={17} />}
            </button>
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb-icon">
              <Layers3 size={16} />
            </span>
            <span>{project.name}</span>
            <ChevronRight size={13} />
            <strong>{view === "library" ? "Library" : "Ask anything"}</strong>
          </div>
          <div className="topbar-actions">
            <span className="demo-badge">
              <span /> {isDemo ? "Demo mode" : "API mode"}
            </span>
            <button
              className="icon-button"
              aria-label="About this prototype"
              onClick={() => help.current?.showModal()}
            >
              <CircleHelp size={18} />
            </button>
            <div className="divider" />
            <button
              className="icon-button"
              aria-label={
                evidenceOpen ? "Hide evidence panel" : "Show evidence panel"
              }
              onClick={() => setEvidenceOpen(!evidenceOpen)}
            >
              {evidenceOpen ? (
                <PanelRightClose size={19} />
              ) : (
                <PanelRightOpen size={19} />
              )}
            </button>
          </div>
        </header>
        <div className={`content-grid ${evidenceOpen ? "" : "panel-hidden"}`}>
          <main className="chat-area">
            {view === "library" ? (
              <section className="library">
                <div className="eyebrow">THE KNOWLEDGE BEHIND THE ANSWERS</div>
                <h1>
                  A little context.
                  <br />
                  <em>A lot of possibility.</em>
                </h1>
                <p className="hero-description">
                  {isDemo
                    ? `Explore the fictional documents in ${project.name.toLowerCase()}.`
                    : "Supporting sources returned in this conversation appear here. Ask a question to begin."}
                </p>
                <div className="library-list">
                  {availableSources.map((s) => (
                    <button key={s.id} onClick={() => inspect(s)}>
                      <span className="file-icon">
                        <FileText size={20} />
                      </span>
                      <div>
                        <strong>{s.title}</strong>
                        <p>
                          {s.kind}
                          {s.updated ? ` · Updated ${s.updated}` : ""}
                        </p>
                      </div>
                      <span className="sample-pill">
                        {isDemo ? "Sample" : "Retrieved"}
                      </span>
                      <ArrowRight size={17} />
                    </button>
                  ))}
                </div>
                <p className="library-footnote">
                  Manage document uploads and indexing in your RAG backend. This
                  library shows{" "}
                  {isDemo
                    ? "sample documents"
                    : "sources returned by your API, not a complete document inventory"}
                  .
                </p>
              </section>
            ) : (
              <>
                <div
                  className={`chat-scroll ${messages.length ? "has-messages" : ""}`}
                >
                  {!messages.length ? (
                    <section className="welcome">
                      <div className="hero-topline">
                        <span className="section-index">01 / EXPLORE</span>
                        <span className="hero-rule" />
                        <span className="tiny-stars">✧</span>
                      </div>
                      <div className="orbital" aria-hidden="true">
                        <span className="orbit orbit-one" />
                        <span className="orbit orbit-two" />
                        <span className="orbit orbit-three" />
                        <span className="orbit-center">
                          <Sparkles size={30} strokeWidth={1.1} />
                        </span>
                        <span className="orbit-dot dot-one" />
                        <span className="orbit-dot dot-two" />
                      </div>
                      <div className="eyebrow">A SPACE FOR CURIOUS MINDS</div>
                      <h1>
                        Your knowledge,
                        <br />
                        <em>in a new light.</em>
                      </h1>
                      <p className="hero-description">
                        {project.description}
                        <br />
                        Ask a question. Follow the evidence. Find your next
                        idea.
                      </p>
                      <div className="suggestion-heading">
                        <span>A FEW PLACES TO START</span>
                        <ArrowDown size={13} />
                      </div>
                      <div className="suggestions">
                        {project.prompts.map((prompt, i) => (
                          <button
                            key={prompt}
                            disabled={busy}
                            onClick={() => void send(prompt)}
                          >
                            <span className="suggestion-number">0{i + 1}</span>
                            <span>{prompt}</span>
                            <ArrowUp className="diagonal-arrow" size={17} />
                          </button>
                        ))}
                      </div>
                      <div className="welcome-footer">
                        <span className="status-dot" />{" "}
                        {availableSources.length}{" "}
                        {isDemo
                          ? "sample sources to explore"
                          : "sources in this conversation"}{" "}
                        <span className="dot-separator">·</span> Built for
                        answers you can inspect
                      </div>
                    </section>
                  ) : (
                    <div className="messages">
                      {messages.map((m) => (
                        <article key={m.id} className={`message ${m.role}`}>
                          <div
                            className={`message-avatar ${m.role === "assistant" ? "assistant-avatar" : ""}`}
                          >
                            {m.role === "assistant" ? (
                              <Layers3 size={19} />
                            ) : (
                              "L"
                            )}
                          </div>
                          <div className="message-content">
                            <div className="message-label">
                              {m.role === "assistant" ? "Folio" : "You"}
                              {m.role === "assistant" && (
                                <span>{isDemo ? "DEMO" : "API"}</span>
                              )}
                            </div>
                            <div className="prose">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {m.content}
                              </ReactMarkdown>
                            </div>
                            {m.state === "streaming" && (
                              <div className="stream-status" role="status">
                                <span className="pulse-dot" />
                                {status || "Preparing response…"}
                              </div>
                            )}
                            {m.sources && m.sources.length > 0 && (
                              <div className="answer-sources">
                                {m.sources.map((s, i) => (
                                  <button key={s.id} onClick={() => inspect(s)}>
                                    <span>{i + 1}</span>
                                    {s.title}
                                    <ChevronRight size={12} />
                                  </button>
                                ))}
                              </div>
                            )}
                            {m.state === "stopped" && (
                              <div className="incomplete">
                                Stopped · This answer may be incomplete.
                              </div>
                            )}
                            {m.state === "error" && (
                              <div className="incomplete">
                                Connection interrupted · This answer may be
                                incomplete.
                              </div>
                            )}
                            {m.role === "assistant" &&
                              m.state !== "streaming" && (
                                <div className="answer-actions">
                                  <button
                                    onClick={() => void copy(m)}
                                    aria-label="Copy answer"
                                  >
                                    {copiedId === m.id ? (
                                      <Check size={14} />
                                    ) : (
                                      <Copy size={14} />
                                    )}{" "}
                                    {copiedId === m.id ? "Copied" : "Copy"}
                                  </button>
                                  {(m.state === "error" ||
                                    m.state === "stopped") && (
                                    <button
                                      disabled={busy}
                                      onClick={() =>
                                        void send(
                                          messages
                                            .slice(0, messages.indexOf(m))
                                            .filter((x) => x.role === "user")
                                            .at(-1)?.content ?? "",
                                        )
                                      }
                                    >
                                      Try again <ArrowRight size={13} />
                                    </button>
                                  )}
                                </div>
                              )}
                          </div>
                        </article>
                      ))}
                      <div ref={bottom} />
                    </div>
                  )}
                </div>
                <div className="composer-region">
                  <form
                    className="composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void send();
                    }}
                  >
                    <label className="sr-only" htmlFor="question">
                      Ask your knowledge base
                    </label>
                    <textarea
                      id="question"
                      ref={composer}
                      placeholder={`Ask ${project.name.toLowerCase()} anything…`}
                      value={input}
                      maxLength={8000}
                      rows={2}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                    />
                    <div className="composer-toolbar">
                      <span className="context-chip">
                        <BookOpen size={13} />
                        {project.name}
                        <span>{availableSources.length} sources</span>
                      </span>
                      <div className="send-controls">
                        <span>
                          {input.length > 7500
                            ? `${input.length}/8000`
                            : "↵ to send"}
                        </span>
                        {busy ? (
                          <button
                            type="button"
                            className="send-button stop-button"
                            aria-label="Stop response"
                            onClick={stop}
                          >
                            <Square size={15} fill="currentColor" />
                          </button>
                        ) : (
                          <button
                            type="submit"
                            className="send-button"
                            aria-label="Send message"
                            disabled={!input.trim()}
                          >
                            <ArrowUp size={20} />
                          </button>
                        )}
                      </div>
                    </div>
                  </form>
                  <p className="composer-caption">
                    <span>
                      <Sparkles size={11} />{" "}
                      {isDemo
                        ? "Sample answers, real possibilities."
                        : "Answers from your RAG service. Check the sources."}
                    </span>
                    <span>Shift + Enter for a new line</span>
                  </p>
                </div>
              </>
            )}
          </main>

          {evidenceOpen && (
            <aside className="evidence-panel" aria-label="Evidence panel">
              <div className="evidence-title">
                <span>
                  <BookOpen size={17} /> Your context
                </span>
                <button
                  className="icon-button evidence-close"
                  aria-label="Close evidence panel"
                  onClick={() => setEvidenceOpen(false)}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="context-banner">
                <div className="context-symbol">
                  <Layers3 size={25} strokeWidth={1.3} />
                </div>
                <div className="eyebrow">KNOWLEDGE SPACE</div>
                <h2>{project.name}</h2>
                <p>{project.description}</p>
                <div className="context-stats">
                  <span>
                    <strong>
                      {availableSources.length.toString().padStart(2, "0")}
                    </strong>
                    {isDemo ? "sample sources" : "returned sources"}
                  </span>
                  <span>
                    <strong>
                      {new Set(availableSources.map((s) => s.kind)).size
                        .toString()
                        .padStart(2, "0")}
                    </strong>
                    source formats
                  </span>
                </div>
              </div>
              <div className="sources-heading">
                <span>
                  {isDemo ? "AVAILABLE SOURCES" : "CONVERSATION SOURCES"}
                </span>
                <span>{availableSources.length}</span>
              </div>
              <div className="source-list">
                {availableSources.map((s) => (
                  <button
                    key={s.id}
                    className={`source-row ${source?.id === s.id ? "source-active" : ""}`}
                    onClick={() => inspect(s)}
                  >
                    <span className="file-icon">
                      <FileText size={17} />
                    </span>
                    <span>
                      <strong>{s.title}</strong>
                      <small>
                        {s.kind} <span>·</span>{" "}
                        {isDemo ? "Sample document" : "Returned by your API"}
                      </small>
                    </span>
                    <ChevronRight size={14} />
                  </button>
                ))}
              </div>
              {source ? (
                <section className="source-detail" aria-live="polite">
                  <div className="excerpt-heading">
                    <span>SOURCE PREVIEW</span>
                    <button
                      className="icon-button"
                      aria-label="Close source preview"
                      onClick={() => setSource(null)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <h3>{source.title}</h3>
                  <span className="page-label">
                    {source.page ? `Page ${source.page} · ` : ""}
                    {isDemo ? "Fictional sample" : "Source excerpt"}
                  </span>
                  <blockquote>{source.excerpt}</blockquote>
                  {source.updated && <p>Updated {source.updated}</p>}
                </section>
              ) : (
                <div className="evidence-note">
                  <span className="quote-mark">“</span>
                  <h3>Good answers have roots.</h3>
                  <p>
                    Open a source to see the context. When you ask a question,
                    supporting sources appear with the answer.
                  </p>
                  <span>
                    <span className="status-dot" /> Evidence, always within
                    reach
                  </span>
                </div>
              )}
              <div className="panel-bottom">
                <span className="status-dot" />
                <span>{isDemo ? "Demo workspace" : "API workspace"}</span>
                <span>v0.1</span>
              </div>
            </aside>
          )}
        </div>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
      {setup && (
        <ProjectSetup
          initial={setup.initial}
          onSave={saveProfile}
          onRemove={removeProfile}
          onClose={() => setSetup(null)}
        />
      )}
      <dialog ref={help} className="help-dialog">
        <div className="dialog-title">
          <span className="brand-mark">
            <Layers3 size={20} />
          </span>
          <h2>A first look at Folio</h2>
          <button
            className="icon-button"
            aria-label="Close about dialog"
            onClick={() => help.current?.close()}
          >
            <X size={18} />
          </button>
        </div>
        <p>
          Add a project, enter its API endpoint, map its request and answer
          fields, then send a test question. Saved projects use your API; the
          three sample projects use fictional documents and fixed answers.
        </p>
        <ul>
          <li>
            Switch between your saved projects and the example knowledge spaces.
          </li>
          <li>Try starter questions, stop a response, and inspect sources.</li>
          <li>
            Conversations stay in memory for this browser session and disappear
            on refresh.
          </li>
          <li>
            Your connection profiles and theme preference are saved locally.
            Export profiles to reuse them elsewhere.
          </li>
        </ul>
        <p>
          Customer authentication, authorized document access, persistent
          history, and ingestion are backend integration work.
        </p>
        <button className="new-chat" onClick={() => help.current?.close()}>
          Back to exploring <ArrowRight size={16} />
        </button>
      </dialog>
    </div>
  );
}
