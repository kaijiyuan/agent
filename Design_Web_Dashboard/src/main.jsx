import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  BookOpen,
  BrainCircuit,
  Check,
  CirclePlus,
  FileText,
  History,
  Loader2,
  MessageSquareText,
  Network,
  RefreshCcw,
  Save,
  Search,
  Send,
  Settings,
  Square,
  Trash2,
} from "lucide-react";
import "katex/dist/katex.min.css";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.detail || data?.message || `HTTP ${response.status}`);
  }
  return data;
}

function uid(prefix = "task") {
  return `${prefix}_${Date.now().toString(36)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function App() {
  const [activeView, setActiveView] = useState("chat");
  const [tasks, setTasks] = useState([]);
  const [taskId, setTaskId] = useState("task_default");
  const [notice, setNotice] = useState("");
  const [loadingTasks, setLoadingTasks] = useState(false);

  const currentTask = useMemo(
    () => tasks.find((task) => task.id === taskId) || { id: taskId, title: "默认学习任务", icon: "✓" },
    [tasks, taskId]
  );

  async function loadTasks() {
    setLoadingTasks(true);
    try {
      const data = await api("/api/v1/tasks");
      const nextTasks = data.tasks || [];
      setTasks(nextTasks);
      if (nextTasks.length && !nextTasks.some((task) => task.id === taskId)) {
        setTaskId(nextTasks[0].id);
      }
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoadingTasks(false);
    }
  }

  async function createTask() {
    const title = window.prompt("任务名称", "新的学习任务");
    if (!title) return;
    const id = uid();
    try {
      const task = await api("/api/v1/tasks", {
        method: "POST",
        body: JSON.stringify({ task_id: id, title, icon: "✓", status: "active" }),
      });
      setTasks((items) => [task, ...items]);
      setTaskId(task.id);
      setActiveView("chat");
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function deleteTask(id) {
    if (!window.confirm(`删除任务 ${id}？`)) return;
    try {
      await api(`/api/v1/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
      setTasks((items) => items.filter((item) => item.id !== id));
      if (id === taskId) setTaskId("task_default");
    } catch (error) {
      setNotice(error.message);
    }
  }

  useEffect(() => {
    loadTasks();
  }, []);

  const views = [
    ["chat", MessageSquareText, "对话"],
    ["plan", Check, "计划"],
    ["notes", FileText, "笔记"],
    ["history", History, "历史"],
    ["kg", Network, "图谱"],
    ["settings", Settings, "设置"],
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <BrainCircuit size={24} />
          <div>
            <strong>ChatTutor</strong>
            <span>多智能体学习台</span>
          </div>
        </div>

        <div className="task-header">
          <span>学习任务</span>
          <button className="icon-button" onClick={createTask} title="新建任务">
            <CirclePlus size={18} />
          </button>
        </div>

        <div className="task-list">
          {loadingTasks ? <span className="muted">加载中...</span> : null}
          {tasks.map((task) => (
            <button
              key={task.id}
              className={`task-item ${task.id === taskId ? "active" : ""}`}
              onClick={() => setTaskId(task.id)}
            >
              <span className="task-icon">{task.icon || "✓"}</span>
              <span>{task.title}</span>
              <Trash2
                size={14}
                onClick={(event) => {
                  event.stopPropagation();
                  deleteTask(task.id);
                }}
              />
            </button>
          ))}
          {!tasks.length ? (
            <button className="task-item active" onClick={() => setTaskId("task_default")}>
              <span className="task-icon">✓</span>
              <span>默认学习任务</span>
            </button>
          ) : null}
        </div>

        <nav className="nav">
          {views.map(([key, Icon, label]) => (
            <button key={key} className={activeView === key ? "active" : ""} onClick={() => setActiveView(key)}>
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{currentTask.title}</h1>
            <p>{currentTask.id}</p>
          </div>
          <button className="secondary" onClick={loadTasks}>
            <RefreshCcw size={16} />
            刷新
          </button>
        </header>

        {notice ? (
          <div className="notice">
            <span>{notice}</span>
            <button onClick={() => setNotice("")}>关闭</button>
          </div>
        ) : null}

        {activeView === "chat" && <ChatView taskId={taskId} onNotice={setNotice} />}
        {activeView === "plan" && <PlanView taskId={taskId} onNotice={setNotice} />}
        {activeView === "notes" && <NotesView taskId={taskId} onNotice={setNotice} />}
        {activeView === "history" && <HistoryView taskId={taskId} onNotice={setNotice} />}
        {activeView === "kg" && <KnowledgeGraphView taskId={taskId} onNotice={setNotice} />}
        {activeView === "settings" && <SettingsView />}
      </main>
    </div>
  );
}

function Markdown({ children }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
      {children || ""}
    </ReactMarkdown>
  );
}

function ChatView({ taskId, onNotice }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [topic, setTopic] = useState("General Knowledge");
  const [sessionId, setSessionId] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    setMessages([]);
    setSessionId("");
  }, [taskId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || isSending) return;
    setInput("");
    setMessages((items) => [...items, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setIsSending(true);

    try {
      const response = await fetch(`${API_BASE}/api/v1/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId, session_id: sessionId || null, message: text, topic }),
      });
      if (!response.ok || !response.body) throw new Error(`聊天请求失败：HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.event === "start" || event.event === "done") {
            if (event.data?.session_id) setSessionId(event.data.session_id);
          }
          if (event.event === "delta") {
            setMessages((items) => {
              const copy = [...items];
              copy[copy.length - 1] = {
                ...copy[copy.length - 1],
                content: `${copy[copy.length - 1].content}${event.data.text}`,
              };
              return copy;
            });
          }
          if (event.event === "error") throw new Error(event.data.message);
        }
      }
    } catch (error) {
      onNotice(error.message);
      setMessages((items) => {
        const copy = [...items];
        copy[copy.length - 1] = { role: "assistant", content: `请求失败：${error.message}` };
        return copy;
      });
    } finally {
      setIsSending(false);
    }
  }

  async function interrupt() {
    if (!sessionId) return;
    try {
      await api("/api/v1/chat/interrupt", { method: "POST", body: JSON.stringify({ session_id: sessionId }) });
    } catch (error) {
      onNotice(error.message);
    }
  }

  return (
    <section className="workspace chat-workspace">
      <div className="chat-toolbar">
        <label>
          主题
          <input value={topic} onChange={(event) => setTopic(event.target.value)} />
        </label>
        <label>
          会话
          <input value={sessionId} readOnly placeholder="发送后自动生成" />
        </label>
      </div>

      <div className="messages" ref={scrollRef}>
        {!messages.length ? (
          <div className="empty-state">
            <BookOpen size={42} />
            <h2>开始一次学习对话</h2>
            <p>输入问题、目标或资料摘要，后端会按当前任务保存会话。</p>
          </div>
        ) : null}
        {messages.map((message, index) => (
          <article key={index} className={`message ${message.role}`}>
            <div className="message-role">{message.role === "user" ? "你" : "导师"}</div>
            <div className="message-body">
              <Markdown>{message.content}</Markdown>
            </div>
          </article>
        ))}
      </div>

      <div className="composer">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="输入你的学习问题..."
        />
        <button className="secondary" onClick={interrupt} disabled={!isSending || !sessionId} title="中断生成">
          <Square size={16} />
        </button>
        <button onClick={send} disabled={isSending || !input.trim()}>
          {isSending ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
          发送
        </button>
      </div>
    </section>
  );
}

function PlanView({ taskId, onNotice }) {
  const [form, setForm] = useState({
    user_goal: "",
    current_level: "",
    constraints: "",
    target_days: 14,
    daily_hours: 1,
    focus_topics: "",
  });
  const [plan, setPlan] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  async function loadPlan() {
    try {
      const data = await api(`/api/v1/notes/task?task_id=${encodeURIComponent(taskId)}`);
      setPlan(data);
    } catch {
      setPlan(null);
    }
  }

  useEffect(() => {
    loadPlan();
  }, [taskId]);

  async function generatePlan() {
    setIsLoading(true);
    try {
      const data = await api("/api/v1/agent/task-plan", {
        method: "POST",
        body: JSON.stringify({
          task_id: taskId,
          ...form,
          focus_topics: form.focus_topics.split(",").map((item) => item.trim()).filter(Boolean),
        }),
      });
      setPlan(data);
    } catch (error) {
      onNotice(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function saveChecklist(key, checked) {
    const checklist = { ...(plan?.planChecklist || {}), [key]: checked };
    setPlan((current) => ({ ...current, planChecklist: checklist }));
    try {
      await api("/api/v1/notes/task/plan-checklist", {
        method: "PUT",
        body: JSON.stringify({ task_id: taskId, checklist }),
      });
    } catch (error) {
      onNotice(error.message);
    }
  }

  const steps = Array.isArray(plan?.plan) ? plan.plan : [];

  return (
    <section className="workspace grid-2">
      <div className="panel">
        <h2>生成学习计划</h2>
        <label>学习目标<textarea value={form.user_goal} onChange={(e) => setForm({ ...form, user_goal: e.target.value })} /></label>
        <label>当前水平<input value={form.current_level} onChange={(e) => setForm({ ...form, current_level: e.target.value })} /></label>
        <label>约束条件<input value={form.constraints} onChange={(e) => setForm({ ...form, constraints: e.target.value })} /></label>
        <div className="inline-fields">
          <label>天数<input type="number" value={form.target_days} onChange={(e) => setForm({ ...form, target_days: Number(e.target.value) })} /></label>
          <label>每日小时<input type="number" step="0.5" value={form.daily_hours} onChange={(e) => setForm({ ...form, daily_hours: Number(e.target.value) })} /></label>
        </div>
        <label>重点主题<input value={form.focus_topics} onChange={(e) => setForm({ ...form, focus_topics: e.target.value })} placeholder="逗号分隔" /></label>
        <button onClick={generatePlan} disabled={isLoading}>
          {isLoading ? <Loader2 className="spin" size={18} /> : <BrainCircuit size={18} />}
          生成计划
        </button>
      </div>

      <div className="panel">
        <h2>{plan?.taskTitle || "当前计划"}</h2>
        {plan?.overallSummary ? <p className="summary">{plan.overallSummary}</p> : null}
        <div className="stat-row">
          <span>{plan?.totalDays || 0} 天</span>
          <span>{plan?.totalHours || 0} 小时</span>
          <span>{plan?.progress || 0}%</span>
        </div>
        <div className="checklist">
          {steps.map((step, index) => {
            const key = String(index);
            return (
              <label key={key} className="check-item">
                <input
                  type="checkbox"
                  checked={Boolean(plan?.planChecklist?.[key])}
                  onChange={(event) => saveChecklist(key, event.target.checked)}
                />
                <span>{step}</span>
              </label>
            );
          })}
          {!steps.length ? <p className="muted">还没有计划。</p> : null}
        </div>
      </div>
    </section>
  );
}

function NotesView({ taskId, onNotice }) {
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today());
  const [dailyNote, setDailyNote] = useState("");

  async function loadTaskNote() {
    try {
      const data = await api(`/api/v1/notes/task?task_id=${encodeURIComponent(taskId)}`);
      setNote(data.content || data.userNotes || "");
    } catch (error) {
      onNotice(error.message);
    }
  }

  async function saveTaskNote() {
    try {
      await api("/api/v1/notes/task", { method: "PUT", body: JSON.stringify({ task_id: taskId, content: note }) });
      onNotice("任务笔记已保存");
    } catch (error) {
      onNotice(error.message);
    }
  }

  async function loadDailyNote() {
    try {
      const data = await api(`/api/v1/notes/daily?task_id=${encodeURIComponent(taskId)}&date=${date}`);
      setDailyNote(data.content || "");
    } catch {
      setDailyNote("");
    }
  }

  async function saveDailyNote() {
    try {
      await api("/api/v1/notes/daily", { method: "PUT", body: JSON.stringify({ task_id: taskId, date, content: dailyNote }) });
      onNotice("每日笔记已保存");
    } catch (error) {
      onNotice(error.message);
    }
  }

  useEffect(() => {
    loadTaskNote();
    loadDailyNote();
  }, [taskId, date]);

  return (
    <section className="workspace grid-2">
      <div className="panel editor-panel">
        <div className="panel-header"><h2>任务笔记</h2><button onClick={saveTaskNote}><Save size={16} />保存</button></div>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} />
      </div>
      <div className="panel editor-panel">
        <div className="panel-header">
          <h2>每日笔记</h2>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <button onClick={saveDailyNote}><Save size={16} />保存</button>
        </div>
        <textarea value={dailyNote} onChange={(event) => setDailyNote(event.target.value)} />
      </div>
    </section>
  );
}

function HistoryView({ taskId, onNotice }) {
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState("");
  const [messages, setMessages] = useState([]);

  async function loadSessions() {
    try {
      const data = await api(`/api/v1/history/tasks/${encodeURIComponent(taskId)}/sessions`);
      setSessions(data.sessions || []);
    } catch (error) {
      onNotice(error.message);
    }
  }

  async function loadMessages(sessionId) {
    setSelected(sessionId);
    try {
      const data = await api(`/api/v1/history/sessions/${encodeURIComponent(sessionId)}/messages`);
      setMessages(data.messages || []);
    } catch (error) {
      onNotice(error.message);
    }
  }

  useEffect(() => {
    loadSessions();
    setMessages([]);
    setSelected("");
  }, [taskId]);

  return (
    <section className="workspace history-layout">
      <div className="panel session-list">
        <div className="panel-header"><h2>会话历史</h2><button className="secondary" onClick={loadSessions}><RefreshCcw size={16} />刷新</button></div>
        {sessions.map((session) => (
          <button key={session.session_id} className={selected === session.session_id ? "active" : ""} onClick={() => loadMessages(session.session_id)}>
            <strong>{session.topic || "General"}</strong>
            <span>{session.last_updated}</span>
            <small>{session.message_count} 条消息</small>
          </button>
        ))}
      </div>
      <div className="panel history-messages">
        {messages.map((message) => (
          <article key={message.message_id} className={`message ${message.role}`}>
            <div className="message-role">{message.role}</div>
            <div className="message-body"><Markdown>{message.content}</Markdown></div>
          </article>
        ))}
        {!messages.length ? <p className="muted">选择一个会话查看内容。</p> : null}
      </div>
    </section>
  );
}

function KnowledgeGraphView({ taskId, onNotice }) {
  const [kg, setKg] = useState(null);
  const [isBuilding, setIsBuilding] = useState(false);

  async function loadKg() {
    try {
      const data = await api(`/api/v1/kg/get-task-kg?task_id=${encodeURIComponent(taskId)}`);
      setKg(data);
    } catch (error) {
      onNotice(error.message);
    }
  }

  async function buildKg() {
    setIsBuilding(true);
    try {
      await api("/api/v1/kg/build-from-task", {
        method: "POST",
        body: JSON.stringify({ task_id: taskId, output_dir: "kg_output", force_rebuild: true, use_deepseek: true }),
      });
      await loadKg();
    } catch (error) {
      onNotice(error.message);
    } finally {
      setIsBuilding(false);
    }
  }

  useEffect(() => {
    loadKg();
  }, [taskId]);

  const nodes = kg?.data?.nodes || [];
  const edges = kg?.data?.edges || kg?.data?.links || [];

  return (
    <section className="workspace kg-layout">
      <div className="panel">
        <div className="panel-header">
          <h2>知识图谱</h2>
          <button onClick={buildKg} disabled={isBuilding}>{isBuilding ? <Loader2 className="spin" size={16} /> : <Network size={16} />}生成</button>
        </div>
        <p className="muted">{kg?.exists ? kg.path : "还没有生成图谱。"}</p>
        <div className="kg-canvas">
          {nodes.slice(0, 80).map((node, index) => (
            <span key={node.id || node.label || index} style={{ "--i": index }}>{node.label || node.id || String(node)}</span>
          ))}
          {!nodes.length ? <p>生成后会在这里展示节点摘要。</p> : null}
        </div>
      </div>
      <div className="panel">
        <h2>关系</h2>
        <div className="edge-list">
          {edges.slice(0, 120).map((edge, index) => (
            <div key={index}>{edge.source || edge.from} <span>→</span> {edge.target || edge.to}</div>
          ))}
          {!edges.length ? <p className="muted">暂无关系数据。</p> : null}
        </div>
      </div>
    </section>
  );
}

function SettingsView() {
  return (
    <section className="workspace">
      <div className="panel settings-panel">
        <h2>运行配置</h2>
        <div className="setting-row"><span>后端地址</span><code>{API_BASE}</code></div>
        <div className="setting-row"><span>前端环境变量</span><code>VITE_API_BASE</code></div>
        <div className="setting-row"><span>必需模型 Key</span><code>DEEPSEEK_API_KEY</code></div>
        <div className="setting-row"><span>兼容 Key</span><code>OPENAI_API_KEY</code></div>
        <div className="setting-row"><span>可选 Key</span><code>BAIDU_API_KEY</code></div>
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
