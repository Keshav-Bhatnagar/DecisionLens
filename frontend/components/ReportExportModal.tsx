"use client";

import React, { useState } from "react";
import {
  exportDecisionReport,
  saveDecisionReportExport,
  ReportExportResponse,
  SaveReportResponse,
} from "@/lib/api";
import { Download, Copy, Check, Save, FileText, AlertCircle, RefreshCw } from "lucide-react";

interface ReportExportModalProps {
  decisionId: number;
  decisionTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onReportSaved?: () => void;
}

export default function ReportExportModal({
  decisionId,
  decisionTitle,
  isOpen,
  onClose,
  onReportSaved,
}: ReportExportModalProps) {
  const [report, setReport] = useState<ReportExportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"preview" | "raw">("preview");

  React.useEffect(() => {
    if (isOpen) {
      loadReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, decisionId]);

  async function loadReport() {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const data = await exportDecisionReport(decisionId, "markdown");
      setReport(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate report export");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!report?.content) return;
    navigator.clipboard.writeText(report.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function handleDownloadMarkdown() {
    if (!report?.content) return;
    const blob = new Blob([report.content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const slug = decisionTitle.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 30) || "decision";
    link.href = url;
    link.download = `${slug}_Executive_Brief.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleDownloadJson() {
    try {
      const jsonRes = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/decisions/${decisionId}/export?format=json`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
          },
        }
      );
      if (!jsonRes.ok) throw new Error("Failed to export JSON");
      const jsonData = await jsonRes.json();
      const blob = new Blob([JSON.stringify(jsonData, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const slug = decisionTitle.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 30) || "decision";
      link.href = url;
      link.download = `${slug}_Decision_Lifecycle.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "JSON download failed");
    }
  }

  async function handleSaveToAttachments() {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res: SaveReportResponse = await saveDecisionReportExport(decisionId);
      setSuccessMsg(`✓ ${res.message} (${res.filename})`);
      if (onReportSaved) {
        onReportSaved();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save report to attachments");
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden my-auto">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/70">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                <FileText className="w-5 h-5" />
              </span>
              <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                Executive Decision Brief & Report Export
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Complete synthesized brief summarizing problem definition, cognitive points,
              research citations, multi-criteria frameworks, recommendation, and execution roadmap.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === "preview" ? "raw" : "preview")}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition"
            >
              {viewMode === "preview" ? "View Raw Markdown" : "Formatted Preview"}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-200/70 hover:bg-slate-300 text-slate-600 flex items-center justify-center font-bold text-sm transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="px-6 py-3 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadMarkdown}
              disabled={loading || !report}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              Download .md
            </button>
            <button
              onClick={handleDownloadJson}
              disabled={loading || !report}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              Download .json
            </button>
            <button
              onClick={handleCopy}
              disabled={loading || !report}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium transition disabled:opacity-50"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-600 font-semibold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copy Markdown</span>
                </>
              )}
            </button>
          </div>

          <button
            onClick={handleSaveToAttachments}
            disabled={saving || loading || !report}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm transition disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "Saving to Attachments..." : "Save to Documents Library"}
          </button>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
            <button
              onClick={loadReport}
              className="text-xs font-bold underline hover:text-red-900 ml-3 flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Retry
            </button>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
            <span>{successMsg}</span>
            <button onClick={() => setSuccessMsg(null)} className="font-bold text-emerald-600 ml-3">
              ✕
            </button>
          </div>
        )}

        {/* Content Viewer */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/40">
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <div className="animate-spin w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full mx-auto" />
              <p className="text-xs text-slate-500 font-medium">
                Compiling Executive Decision Brief across all 10 intelligence phases...
              </p>
            </div>
          ) : report ? (
            viewMode === "preview" ? (
              <div className="prose prose-slate max-w-none text-xs sm:text-sm bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-sm leading-relaxed whitespace-pre-wrap font-sans">
                {report.content}
              </div>
            ) : (
              <pre className="font-mono text-xs bg-slate-900 text-slate-100 p-6 rounded-2xl overflow-x-auto whitespace-pre leading-relaxed shadow-inner">
                {report.content}
              </pre>
            )
          ) : (
            <div className="py-16 text-center text-slate-400 text-xs">
              No report content generated. Click Retry to compile.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>DecisionLens Intelligence Platform • Confidential & Grounded</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-xl transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
