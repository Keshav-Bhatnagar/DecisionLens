"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getHealthStatus, HealthStatus, API_BASE_URL } from "@/lib/api";
import { CheckCircle2, XCircle, RefreshCw, Server, ArrowRight, Layers } from "lucide-react";

export default function HomePage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const checkBackendHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getHealthStatus();
      setHealth(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to connect to backend");
      }
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkBackendHealth();
  }, []);

  return (
    <main className="max-w-4xl mx-auto px-6 py-16">
      {/* Header */}
      <div className="text-center space-y-4 mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-full text-indigo-700 text-xs font-semibold tracking-wide uppercase">
          Phase 3 Complete: Folders & Decisions
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          DecisionLens
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          AI-Powered Decision Intelligence Platform. Transforming unstructured
          thoughts, meeting audio, and documents into evidence-backed reasoning.
        </p>

        <div className="pt-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all"
          >
            <Layers className="w-5 h-5" />
            Open Workspace Dashboard
            <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </div>
      </div>

      {/* Connectivity & Health Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8">
        <div className="flex items-center justify-between pb-6 border-b border-slate-100 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-100 rounded-xl text-slate-700">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Backend Connectivity
              </h2>
              <p className="text-sm text-slate-500">
                Target:{" "}
                <code className="text-xs bg-slate-100 px-2 py-0.5 rounded font-mono text-slate-700">
                  {API_BASE_URL}
                </code>
              </p>
            </div>
          </div>
          <button
            onClick={checkBackendHealth}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh Check
          </button>
        </div>

        {/* Status Display */}
        {loading ? (
          <div className="flex items-center gap-3 text-slate-600 py-4">
            <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
            <span>Probing backend endpoint at {API_BASE_URL}/api/health...</span>
          </div>
        ) : error ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-amber-900">
                  Backend Offline or Unreachable
                </h3>
                <p className="text-sm text-amber-700 mt-1">{error}</p>
                <p className="text-xs text-amber-600 mt-2">
                  Tip: Start the backend server with{" "}
                  <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono">
                    cd backend && .venv/bin/uvicorn app.main:app --reload
                  </code>
                </p>
              </div>
            </div>
          </div>
        ) : health ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Backend is Online & Healthy</p>
                <p className="text-xs text-emerald-600">
                  FastAPI service is responding correctly to health check queries.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-xs font-medium text-slate-500">Service</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">
                  {health.project}
                </p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-xs font-medium text-slate-500">Environment</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5 capitalize">
                  {health.environment}
                </p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-xs font-medium text-slate-500">Version</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">
                  {health.version}
                </p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-xs font-medium text-slate-500">Storage Dir</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">
                  {health.storage_ready ? "Initialized" : "Missing"}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Architecture Verification Summary */}
      <div className="bg-slate-900 text-slate-100 rounded-2xl p-8">
        <h3 className="text-lg font-semibold mb-2">Phase 3 Architecture Verification</h3>
        <p className="text-sm text-slate-400 mb-6">
          Folders, Decisions, and Meeting Records persistence is active with strict user-level isolation.
        </p>

        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between py-2 border-b border-slate-800">
            <span className="text-slate-300">Folders & Decisions CRUD API</span>
            <span className="text-emerald-400 font-mono text-xs">READY (/api/folders, /api/decisions)</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-slate-800">
            <span className="text-slate-300">User Isolation & 404 Enforcing</span>
            <span className="text-emerald-400 font-mono text-xs">VERIFIED IN PYTEST</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-slate-800">
            <span className="text-slate-300">Workspace Dashboard & Editor Pages</span>
            <span className="text-emerald-400 font-mono text-xs">READY (/dashboard, /folders, /decisions)</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-slate-300">Next Phase</span>
            <span className="text-indigo-400 font-medium inline-flex items-center gap-1">
              Phase 4: Document Uploads & Text Extraction <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
