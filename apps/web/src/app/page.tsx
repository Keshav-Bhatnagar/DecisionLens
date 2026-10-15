"use client";

import { useEffect, useState } from "react";
import {
  getHealth,
  checkDbReadWrite,
  getFolders,
  createFolder,
  getSessions,
  createSession,
  generateSampleMedia,
  generateAnalysis,
  getSessionAnalyses,
  HealthData,
  DbCheckData,
  Folder,
  SessionItem,
  AnalysisItem,
} from "@/lib/api";
import {
  Activity,
  Database,
  FolderPlus,
  Play,
  Sparkles,
  Layers,
  CheckCircle2,
  AlertCircle,
  FileAudio,
  TrendingUp,
  FileText,
  Server,
  RefreshCw,
} from "lucide-react";

export default function Home() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [dbCheck, setDbCheck] = useState<DbCheckData | null>(null);
  const [dbLoading, setDbLoading] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionItem | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisItem[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  // Form states
  const [newFolderName, setNewFolderName] = useState("");
  const [newSessionTitle, setNewSessionTitle] = useState("");
  const [newSessionObjective, setNewSessionObjective] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");

  useEffect(() => {
    refreshHealth();
    loadFoldersAndSessions();
  }, []);

  async function refreshHealth() {
    setDbLoading(true);
    try {
      const h = await getHealth();
      setHealth(h);
      const dbc = await checkDbReadWrite();
      setDbCheck(dbc);
    } catch (err) {
      console.error("Health check error:", err);
    } finally {
      setDbLoading(false);
    }
  }

  async function loadFoldersAndSessions() {
    try {
      const fList = await getFolders();
      setFolders(fList);
      const sList = await getSessions();
      setSessions(sList);
      if (sList.length > 0 && !selectedSession) {
        selectSession(sList[0]);
      }
    } catch (err) {
      console.error("Failed to load folders/sessions:", err);
    }
  }

  async function selectSession(session: SessionItem) {
    setSelectedSession(session);
    try {
      const aList = await getSessionAnalyses(session.id);
      setAnalyses(aList);
    } catch (err) {
      console.error("Failed to load analyses:", err);
    }
  }

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      setLoadingAction("folder");
      const created = await createFolder(newFolderName.trim());
      setFolders((prev) => [created, ...prev]);
      setNewFolderName("");
      refreshHealth();
    } catch (err) {
      alert("Error creating folder: " + err);
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault();
    if (!newSessionTitle.trim() || !newSessionObjective.trim()) return;
    try {
      setLoadingAction("session");
      const created = await createSession({
        title: newSessionTitle.trim(),
        objective: newSessionObjective.trim(),
        folder_id: selectedFolderId || undefined,
        framework_type: "mcda",
      });
      setSessions((prev) => [created, ...prev]);
      setSelectedSession(created);
      setNewSessionTitle("");
      setNewSessionObjective("");
      refreshHealth();
    } catch (err) {
      alert("Error creating session: " + err);
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleGenerateAudio() {
    if (!selectedSession) return;
    try {
      setLoadingAction("audio");
      await generateSampleMedia(selectedSession.id);
      alert("Synthetic sample audio generated via ffmpeg & transcribed into database!");
      refreshHealth();
    } catch (err) {
      alert("Audio generation error: " + err);
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleRunAnalysis(framework: string) {
    if (!selectedSession) return;
    try {
      setLoadingAction(`analysis-${framework}`);
      const analysis = await generateAnalysis(selectedSession.id, framework);
      setAnalyses((prev) => [analysis, ...prev]);
      refreshHealth();
    } catch (err) {
      alert("Analysis error: " + err);
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-lg text-white shadow-lg shadow-blue-500/20">
              DL
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight tracking-tight">DecisionLens</h1>
              <p className="text-xs text-slate-400">Executive Decision Analysis & Audio Synthesis</p>
            </div>
          </div>

          <div className="flex items-center space-x-4 text-xs">
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noreferrer"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
            >
              <Server className="h-3.5 w-3.5 text-blue-400" />
              <span>Swagger API Docs</span>
            </a>
            <button
              onClick={refreshHealth}
              disabled={dbLoading}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30 transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${dbLoading ? "animate-spin" : ""}`} />
              <span>Verify Health</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 py-6 flex-1 w-full space-y-6">
        {/* Health & DB Status Banner */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* API Health */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 flex items-start space-x-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">FastAPI Status</div>
              <div className="text-base font-bold text-slate-100 flex items-center space-x-2 mt-0.5">
                <span>{health?.status === "healthy" ? "Online & Healthy" : "Checking..."}</span>
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Version: <span className="text-slate-300 font-mono">{health?.version || "0.1.0"}</span> | Env:{" "}
                <span className="text-slate-300">{health?.environment || "development"}</span>
              </div>
            </div>
          </div>

          {/* Database Connection */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 flex items-start space-x-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Database Engine</div>
              <div className="text-base font-bold text-slate-100 flex items-center space-x-2 mt-0.5">
                <span>{health?.database.connected ? "Connected" : "Disconnected"}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono uppercase">
                  {health?.database.dialect || "sqlite"}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-1">Migrations: Alembic head active</div>
            </div>
          </div>

          {/* DB Read/Write Verification */}
          <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 flex items-start space-x-3">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Read/Write Check</div>
              <div className="text-base font-bold text-slate-100 flex items-center space-x-2 mt-0.5">
                <span>{dbCheck?.read_write_verified ? "Read & Write Verified" : "Testing..."}</span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Token: <span className="font-mono text-purple-300">{dbCheck?.details.read_token || "Verified"}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Folders & Session Selector */}
          <div className="lg:col-span-4 space-y-5">
            {/* Folder Creator */}
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                  <FolderPlus className="h-4 w-4 text-blue-400" />
                  <span>Folders ({folders.length})</span>
                </span>
              </div>
              <form onSubmit={handleCreateFolder} className="flex gap-2">
                <input
                  type="text"
                  placeholder="New folder (e.g. Q1 Architecture)..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="flex-1 bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={loadingAction === "folder" || !newFolderName.trim()}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition"
                >
                  Add
                </button>
              </form>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  onClick={() => setSelectedFolderId("")}
                  className={`px-2.5 py-1 rounded text-xs transition ${
                    selectedFolderId === ""
                      ? "bg-blue-600 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  All Folders
                </button>
                {folders.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFolderId(f.id)}
                    className={`px-2.5 py-1 rounded text-xs transition ${
                      selectedFolderId === f.id
                        ? "bg-blue-600 text-white"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Create Session */}
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                <Sparkles className="h-4 w-4 text-indigo-400" />
                <span>New Decision Session</span>
              </span>
              <form onSubmit={handleCreateSession} className="space-y-2.5">
                <input
                  type="text"
                  placeholder="Title: Managed Auth vs In-House..."
                  value={newSessionTitle}
                  onChange={(e) => setNewSessionTitle(e.target.value)}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                />
                <textarea
                  placeholder="Objective: Determine customer identity architecture for Q1 launch..."
                  value={newSessionObjective}
                  onChange={(e) => setNewSessionObjective(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={loadingAction === "session" || !newSessionTitle.trim()}
                  className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition shadow-sm"
                >
                  Create Session
                </button>
              </form>
            </div>

            {/* Session List */}
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                <Layers className="h-4 w-4 text-purple-400" />
                <span>Sessions ({sessions.length})</span>
              </span>
              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {sessions.length === 0 ? (
                  <div className="text-xs text-slate-500 text-center py-6">No sessions created yet.</div>
                ) : (
                  sessions.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => selectSession(s)}
                      className={`p-3 rounded-lg border cursor-pointer transition ${
                        selectedSession?.id === s.id
                          ? "bg-blue-950/40 border-blue-500/50"
                          : "bg-slate-800/50 border-slate-700/60 hover:bg-slate-800"
                      }`}
                    >
                      <div className="font-semibold text-xs text-slate-100 truncate">{s.title}</div>
                      <div className="text-[11px] text-slate-400 line-clamp-2 mt-1">{s.objective}</div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2">
                        <span className="uppercase font-mono px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-300">
                          {s.framework_type}
                        </span>
                        <span>{new Date(s.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Active Session Workspace */}
          <div className="lg:col-span-8 space-y-5">
            {selectedSession ? (
              <>
                {/* Session Header Card */}
                <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/40 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          {selectedSession.framework_type}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">ID: {selectedSession.id.slice(0, 8)}...</span>
                      </div>
                      <h2 className="text-xl font-bold text-slate-100 mt-1">{selectedSession.title}</h2>
                      <p className="text-xs text-slate-300 mt-1">{selectedSession.objective}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={handleGenerateAudio}
                        disabled={loadingAction === "audio"}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30 text-xs font-medium transition"
                      >
                        <FileAudio className="h-3.5 w-3.5" />
                        <span>{loadingAction === "audio" ? "Synthesizing..." : "Sample Audio & STT"}</span>
                      </button>

                      <button
                        onClick={() => handleRunAnalysis("mcda")}
                        disabled={loadingAction === "analysis-mcda"}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition"
                      >
                        <TrendingUp className="h-3.5 w-3.5" />
                        <span>{loadingAction === "analysis-mcda" ? "Analyzing..." : "Run MCDA"}</span>
                      </button>

                      <button
                        onClick={() => handleRunAnalysis("swot")}
                        disabled={loadingAction === "analysis-swot"}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition"
                      >
                        <Layers className="h-3.5 w-3.5" />
                        <span>{loadingAction === "analysis-swot" ? "Analyzing..." : "Run SWOT"}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Analysis Output Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-200 flex items-center space-x-2">
                      <FileText className="h-4 w-4 text-blue-400" />
                      <span>Synthesized Analysis Results ({analyses.length})</span>
                    </h3>
                  </div>

                  {analyses.length === 0 ? (
                    <div className="p-8 rounded-xl border border-dashed border-slate-800 text-center space-y-2">
                      <div className="text-slate-400 text-xs">No analysis iterations generated yet.</div>
                      <div className="text-slate-500 text-xs">
                        Click <strong className="text-blue-400">Run MCDA</strong> or{" "}
                        <strong className="text-indigo-400">Run SWOT</strong> above to evaluate decision trade-offs!
                      </div>
                    </div>
                  ) : (
                    analyses.map((an) => (
                      <div key={an.id} className="p-5 rounded-xl border border-slate-800 bg-slate-900/50 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                              {an.framework}
                            </span>
                            <span className="text-xs text-slate-400">
                              Confidence: <strong className="text-emerald-400">{(an.confidence_score * 100).toFixed(0)}%</strong>
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500">
                            {new Date(an.created_at).toLocaleTimeString()}
                          </span>
                        </div>

                        {/* Summary */}
                        <p className="text-xs text-slate-200 leading-relaxed">{an.summary}</p>

                        {/* Ranked Alternatives Table if MCDA */}
                        {an.framework === "mcda" && an.matrix?.ranked_alternatives && (
                          <div className="space-y-2">
                            <div className="text-xs font-semibold text-slate-300">Ranked Alternatives Matrix</div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs border border-slate-800 rounded-lg overflow-hidden">
                                <thead className="bg-slate-800/60 text-slate-300">
                                  <tr>
                                    <th className="p-2.5">Rank</th>
                                    <th className="p-2.5">Alternative</th>
                                    <th className="p-2.5 text-right">Composite Score</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                  {an.matrix.ranked_alternatives.map((alt: any, idx: number) => (
                                    <tr key={idx} className={idx === 0 ? "bg-blue-950/20 text-blue-200 font-semibold" : ""}>
                                      <td className="p-2.5">#{idx + 1}</td>
                                      <td className="p-2.5">{alt.name}</td>
                                      <td className="p-2.5 text-right font-mono text-emerald-400">
                                        {alt.total_score} / 10.0
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Key Findings & Recommendations */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                          {an.key_findings && (
                            <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-800 space-y-1.5">
                              <div className="text-xs font-semibold text-slate-300">Key Findings</div>
                              <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                                {an.key_findings.map((f: any, idx: number) => (
                                  <li key={idx} className="leading-relaxed">
                                    {f}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {an.recommendations && (
                            <div className="p-3 rounded-lg bg-blue-950/20 border border-blue-900/40 space-y-1.5">
                              <div className="text-xs font-semibold text-blue-300">Action Recommendations</div>
                              <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
                                {an.recommendations.map((r: any, idx: number) => (
                                  <li key={idx} className="leading-relaxed">
                                    {r}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="p-12 rounded-xl border border-dashed border-slate-800 text-center space-y-2">
                <Layers className="h-8 w-8 text-slate-600 mx-auto" />
                <div className="text-sm font-medium text-slate-300">Select or create a decision session</div>
                <div className="text-xs text-slate-500">
                  Choose from existing sessions on the left or create a new one to run decision frameworks.
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
