"use client";

import React, { useState } from "react";
import ModalPortal from "@/components/ModalPortal";
import {
  exportDecisionReport,
  saveDecisionReportExport,
  downloadDecisionExportBlob,
  ReportExportResponse,
  SaveReportResponse,
} from "@/lib/api";
import {
  Download,
  Copy,
  Check,
  Save,
  FileText,
  AlertCircle,
  RefreshCw,
  X,
  CheckCircle2,
  FileDown,
  FileCode,
} from "lucide-react";

interface ReportExportModalProps {
  decisionId: number;
  decisionTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onReportSaved?: () => void;
}

type ViewMode = "preview" | "latex" | "raw";

export default function ReportExportModal({
  decisionId,
  decisionTitle,
  isOpen,
  onClose,
  onReportSaved,
}: ReportExportModalProps) {
  const [report, setReport] = useState<ReportExportResponse | null>(null);
  const [latexContent, setLatexContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLatex, setLoadingLatex] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingLatex, setDownloadingLatex] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("preview");

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

  async function loadLatexContent() {
    if (latexContent) return;
    setLoadingLatex(true);
    try {
      const data = await exportDecisionReport(decisionId, "latex");
      setLatexContent(data.content);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load LaTeX source");
    } finally {
      setLoadingLatex(false);
    }
  }

  function handleViewModeChange(mode: ViewMode) {
    setViewMode(mode);
    if (mode === "latex") {
      loadLatexContent();
    }
  }

  function handleCopy() {
    const textToCopy = viewMode === "latex" ? latexContent : report?.content;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    setError(null);
    try {
      const blob = await downloadDecisionExportBlob(decisionId, "pdf");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const slug = decisionTitle.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 35) || "decision";
      link.href = url;
      link.download = `${slug}_Executive_Dossier.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "PDF download failed");
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function handleDownloadLatex() {
    setDownloadingLatex(true);
    setError(null);
    try {
      const blob = await downloadDecisionExportBlob(decisionId, "latex");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const slug = decisionTitle.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 35) || "decision";
      link.href = url;
      link.download = `${slug}_Executive_Dossier.tex`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "LaTeX download failed");
    } finally {
      setDownloadingLatex(false);
    }
  }

  function handleDownloadMarkdown() {
    if (!report?.content) return;
    const blob = new Blob([report.content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const slug = decisionTitle.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 35) || "decision";
    link.href = url;
    link.download = `${slug}_Executive_Brief.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleDownloadJson() {
    try {
      const blob = await downloadDecisionExportBlob(decisionId, "json");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const slug = decisionTitle.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 35) || "decision";
      link.href = url;
      link.download = `${slug}_Decision_Lifecycle.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "JSON download failed");
    }
  }

  async function handleSaveToAttachments() {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res: SaveReportResponse = await saveDecisionReportExport(decisionId);
      setSuccessMsg(`${res.message} (${res.filename})`);
      if (onReportSaved) {
        onReportSaved();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save dossier to documents");
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[9999] bg-[#161E33]/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
        <div className="bg-[#FCFBF8] rounded-xl border border-[#D9D2C3] shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden my-auto">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-[#D9D2C3] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#EFEADF]/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded bg-white text-[#2F5D8F] border border-[#D9D2C3]">
                <FileText className="w-5 h-5" />
              </span>
              <h3 className="text-lg font-bold text-[#161E33] tracking-tight">
                Executive Decision Brief &amp; Interactive LaTeX PDF Dossier
              </h3>
            </div>
            <p className="text-xs text-[#5A6275] mt-1">
              Export all 10 intelligence phases: Problem framing, cognitive structuring, verified research citations, multi-criteria frameworks, recommendation, and execution roadmap.
            </p>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            {/* View Mode Switcher */}
            <div className="inline-flex rounded-lg border border-[#D9D2C3] bg-white p-0.5 text-xs font-medium">
              <button
                onClick={() => handleViewModeChange("preview")}
                className={`px-2.5 py-1 rounded transition ${
                  viewMode === "preview"
                    ? "bg-[#161E33] text-[#FCFBF8] font-bold"
                    : "text-[#5A6275] hover:text-[#161E33]"
                }`}
              >
                Preview
              </button>
              <button
                onClick={() => handleViewModeChange("latex")}
                className={`px-2.5 py-1 rounded transition ${
                  viewMode === "latex"
                    ? "bg-[#2F5D8F] text-[#FCFBF8] font-bold"
                    : "text-[#5A6275] hover:text-[#161E33]"
                }`}
              >
                LaTeX Source
              </button>
              <button
                onClick={() => handleViewModeChange("raw")}
                className={`px-2.5 py-1 rounded transition ${
                  viewMode === "raw"
                    ? "bg-[#161E33] text-[#FCFBF8] font-bold"
                    : "text-[#5A6275] hover:text-[#161E33]"
                }`}
              >
                Raw Markdown
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[#EFEADF] hover:bg-[#D9D2C3] text-[#161E33] flex items-center justify-center transition border border-[#D9D2C3]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="px-5 sm:px-6 py-3 bg-[#FCFBF8] border-b border-[#D9D2C3] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Primary Action: Interactive PDF */}
            <button
              onClick={handleDownloadPdf}
              disabled={loading || downloadingPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-[#161E33] hover:bg-[#2F5D8F] text-[#FCFBF8] font-bold transition shadow-xs disabled:opacity-50"
            >
              <FileDown className="w-3.5 h-3.5" />
              {downloadingPdf ? "Generating PDF..." : "Download Interactive PDF (.pdf)"}
            </button>

            {/* LaTeX Source */}
            <button
              onClick={handleDownloadLatex}
              disabled={loading || downloadingLatex}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#2F5D8F] bg-white text-[#2F5D8F] hover:bg-[#2F5D8F]/10 font-semibold transition disabled:opacity-50"
            >
              <FileCode className="w-3.5 h-3.5" />
              {downloadingLatex ? "Exporting .tex..." : "Download LaTeX (.tex)"}
            </button>

            {/* Markdown */}
            <button
              onClick={handleDownloadMarkdown}
              disabled={loading || !report}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#D9D2C3] bg-white hover:bg-[#EFEADF]/50 text-[#161E33] font-medium transition disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-[#5A6275]" />
              Markdown (.md)
            </button>

            {/* JSON */}
            <button
              onClick={handleDownloadJson}
              disabled={loading || !report}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#D9D2C3] bg-white hover:bg-[#EFEADF]/50 text-[#161E33] font-medium transition disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-[#5A6275]" />
              JSON
            </button>

            {/* Copy button */}
            <button
              onClick={handleCopy}
              disabled={loading || (!report && !latexContent)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#D9D2C3] bg-white hover:bg-[#EFEADF]/50 text-[#161E33] font-medium transition disabled:opacity-50"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-600 font-semibold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#5A6275]" />
                  <span>Copy {viewMode === "latex" ? "LaTeX" : "Markdown"}</span>
                </>
              )}
            </button>
          </div>

          {/* Permanent Save to Documents Library */}
          <button
            onClick={handleSaveToAttachments}
            disabled={saving || loading || !report}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-[#2F5D8F] hover:bg-[#161E33] text-[#FCFBF8] font-semibold shadow-xs transition disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "Saving Dossier Bundle..." : "Save Dossier to Documents"}
          </button>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
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
          <div className="mx-6 mt-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900 ml-3">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Content Viewer */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 bg-[#F5F1E8]">
          {loading || (viewMode === "latex" && loadingLatex) ? (
            <div className="py-20 text-center space-y-3">
              <div className="animate-spin w-8 h-8 border-3 border-[#2F5D8F] border-t-transparent rounded-full mx-auto" />
              <p className="text-xs text-[#5A6275] font-medium">
                {viewMode === "latex" ? "Compiling publication-grade LaTeX brief..." : "Compiling Executive Decision Brief across all 10 intelligence phases..."}
              </p>
            </div>
          ) : viewMode === "latex" ? (
            latexContent ? (
              <div className="space-y-3">
                <div className="p-3 bg-white rounded border border-[#D9D2C3] flex items-center justify-between text-xs text-[#5A6275]">
                  <span className="font-mono text-[11px]">
                    Standard Article &bull; Geometry (1.8cm) &bull; Hyperref Bookmarks &bull; Tcolorbox &bull; Booktabs &bull; Tabularx
                  </span>
                  <button
                    onClick={handleDownloadLatex}
                    className="text-[#2F5D8F] font-bold hover:underline flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> Download .tex
                  </button>
                </div>
                <pre className="font-mono text-xs bg-[#161E33] text-[#FCFBF8] p-5 sm:p-6 rounded-lg overflow-x-auto whitespace-pre leading-relaxed shadow-inner border border-[#D9D2C3]">
                  {latexContent}
                </pre>
              </div>
            ) : (
              <div className="py-16 text-center text-[#5A6275] text-xs">
                Click above to load LaTeX source code.
              </div>
            )
          ) : report ? (
            viewMode === "preview" ? (
              <div className="prose prose-slate max-w-none text-xs sm:text-sm bg-white p-6 sm:p-8 rounded-lg border border-[#D9D2C3] shadow-xs leading-relaxed whitespace-pre-wrap font-sans text-[#161E33]">
                {report.content}
              </div>
            ) : (
              <pre className="font-mono text-xs bg-[#161E33] text-[#FCFBF8] p-5 sm:p-6 rounded-lg overflow-x-auto whitespace-pre leading-relaxed shadow-inner border border-[#D9D2C3]">
                {report.content}
              </pre>
            )
          ) : (
            <div className="py-16 text-center text-[#5A6275] text-xs">
              No report content generated. Click Retry to compile.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#EFEADF]/60 border-t border-[#D9D2C3] flex items-center justify-between text-xs text-[#5A6275]">
          <span className="font-mono text-[11px]">
            DecisionLens Dossier &bull; Grounded Evidence &bull; Interactive Outline &amp; Form Fields Enabled
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white hover:bg-[#EFEADF] text-[#161E33] font-semibold rounded border border-[#D9D2C3] transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </ModalPortal>
  );
}
