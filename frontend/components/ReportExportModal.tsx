"use client";

import React, { useState, useEffect, useRef } from "react";
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
  ExternalLink,
  Eye,
  FileCheck2,
} from "lucide-react";

interface ReportExportModalProps {
  decisionId: number;
  decisionTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onReportSaved?: () => void;
}

type ViewMode = "pdf" | "brief" | "latex" | "raw";

export default function ReportExportModal({
  decisionId,
  decisionTitle,
  isOpen,
  onClose,
  onReportSaved,
}: ReportExportModalProps) {
  const [report, setReport] = useState<ReportExportResponse | null>(null);
  const [latexContent, setLatexContent] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [loadingLatex, setLoadingLatex] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingLatex, setDownloadingLatex] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("pdf");

  const pdfUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadCompiledPdf();
      loadReport();
    }
    return () => {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, decisionId]);

  async function loadCompiledPdf() {
    setLoadingPdf(true);
    setError(null);
    try {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
      const blob = await downloadDecisionExportBlob(decisionId, "pdf");
      const url = URL.createObjectURL(blob);
      pdfUrlRef.current = url;
      setPdfBlobUrl(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load compiled PDF dossier");
    } finally {
      setLoadingPdf(false);
    }
  }

  async function loadReport() {
    setLoading(true);
    try {
      const data = await exportDecisionReport(decisionId, "markdown");
      setReport(data);
    } catch {
      // Non-critical if markdown fails while PDF is loading
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
    if (mode === "pdf" && !pdfBlobUrl) {
      loadCompiledPdf();
    } else if (mode === "latex") {
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

  function handleOpenOverleaf() {
    if (!latexContent) return;
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "https://www.overleaf.com/docs";
    form.target = "_blank";
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "snip";
    input.value = latexContent;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
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
      <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fadeIn">
        <div className="bg-[var(--bg-surface)] text-[var(--ink)] rounded-2xl border border-[var(--border)] shadow-2xl max-w-5xl w-full max-h-[94vh] flex flex-col overflow-hidden my-auto transition-colors duration-200">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--bg-page)]/60">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="p-1.5 rounded-lg bg-[var(--bg-surface)] text-[var(--accent)] border border-[var(--border)] shadow-2xs">
                  <FileCheck2 className="w-5 h-5" />
                </span>
                <h3 className="text-base sm:text-lg font-serif font-bold text-[var(--ink)] tracking-tight">
                  Executive Decision Brief &amp; Compiled Dossier
                </h3>
              </div>
              <p className="text-xs text-[var(--ink-secondary)] mt-1">
                Full 10-phase intelligence synthesis with verified citations, multi-criteria trade-offs, and board roadmap.
              </p>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              {/* View Mode Switcher */}
              <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-0.5 text-xs font-medium shadow-2xs">
                <button
                  onClick={() => handleViewModeChange("pdf")}
                  className={`px-3 py-1 rounded-md transition inline-flex items-center gap-1.5 ${
                    viewMode === "pdf"
                      ? "bg-[var(--accent)] text-white font-bold shadow-xs"
                      : "text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Compiled PDF</span>
                </button>
                <button
                  onClick={() => handleViewModeChange("brief")}
                  className={`px-3 py-1 rounded-md transition inline-flex items-center gap-1.5 ${
                    viewMode === "brief"
                      ? "bg-[var(--accent)] text-white font-bold shadow-xs"
                      : "text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Formatted Brief</span>
                </button>
                <button
                  onClick={() => handleViewModeChange("latex")}
                  className={`px-3 py-1 rounded-md transition inline-flex items-center gap-1.5 ${
                    viewMode === "latex"
                      ? "bg-[var(--accent)] text-white font-bold shadow-xs"
                      : "text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>LaTeX (.tex)</span>
                </button>
                <button
                  onClick={() => handleViewModeChange("raw")}
                  className={`px-2.5 py-1 rounded-md transition ${
                    viewMode === "raw"
                      ? "bg-[var(--accent)] text-white font-bold shadow-xs"
                      : "text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                  }`}
                >
                  Markdown
                </button>
              </div>

              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-[var(--bg-page)] hover:bg-[var(--border)] text-[var(--ink)] flex items-center justify-center transition border border-[var(--border)]"
                title="Close Modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="px-4 sm:px-6 py-2.5 bg-[var(--bg-surface)] border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {/* Primary Action: Compiled PDF */}
              <button
                onClick={handleDownloadPdf}
                disabled={loadingPdf || downloadingPdf}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--accent)] hover:opacity-90 text-white font-bold transition shadow-xs disabled:opacity-50"
              >
                <FileDown className="w-3.5 h-3.5" />
                {downloadingPdf ? "Generating PDF..." : "Download Compiled PDF (.pdf)"}
              </button>

              {/* LaTeX Source */}
              <button
                onClick={handleDownloadLatex}
                disabled={downloadingLatex}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-page)] text-[var(--ink)] hover:bg-[var(--border)] font-semibold transition disabled:opacity-50"
              >
                <FileCode className="w-3.5 h-3.5 text-[var(--accent)]" />
                {downloadingLatex ? "Exporting .tex..." : "Download LaTeX (.tex)"}
              </button>

              {/* Markdown */}
              <button
                onClick={handleDownloadMarkdown}
                disabled={loading || !report}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-page)] text-[var(--ink-secondary)] hover:text-[var(--ink)] font-medium transition disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                Markdown (.md)
              </button>

              {/* JSON */}
              <button
                onClick={handleDownloadJson}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-page)] text-[var(--ink-secondary)] hover:text-[var(--ink)] font-medium transition disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                JSON
              </button>

              {/* Copy button */}
              {(viewMode === "latex" || viewMode === "raw" || viewMode === "brief") && (
                <button
                  onClick={handleCopy}
                  disabled={loading || (!report && !latexContent)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-page)] text-[var(--ink)] font-medium transition disabled:opacity-50"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-emerald-500 font-semibold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[var(--ink-secondary)]" />
                      <span>Copy {viewMode === "latex" ? "LaTeX" : "Text"}</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Permanent Save to Documents Library */}
            <button
              onClick={handleSaveToAttachments}
              disabled={saving || loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-page)] hover:bg-[var(--border)] text-[var(--ink)] font-semibold shadow-2xs transition disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5 text-[var(--accent)]" />
              {saving ? "Saving Dossier..." : "Save to Documents"}
            </button>
          </div>

          {/* Feedback Messages */}
          {error && (
            <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                onClick={loadCompiledPdf}
                className="text-xs font-bold underline ml-3 flex items-center gap-1 hover:opacity-80"
              >
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
            </div>
          )}
          {successMsg && (
            <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
              <button onClick={() => setSuccessMsg(null)} className="hover:opacity-80 ml-3">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Content Viewer */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[var(--bg-page)]/50 min-h-[480px]">
            {viewMode === "pdf" ? (
              loadingPdf ? (
                <div className="py-24 text-center space-y-3">
                  <div className="animate-spin w-8 h-8 border-3 border-[var(--accent)] border-t-transparent rounded-full mx-auto" />
                  <p className="text-xs text-[var(--ink-secondary)] font-medium">
                    Compiling publication-grade LaTeX PDF Dossier...
                  </p>
                </div>
              ) : pdfBlobUrl ? (
                <div className="flex flex-col h-full space-y-3">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-xs text-[var(--ink-secondary)] shadow-2xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[var(--ink)]">Compiled Publication-Grade PDF Dossier</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 font-mono font-bold">
                        A4 Typeset
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <a
                        href={pdfBlobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--accent)] hover:underline font-bold inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open Fullscreen
                      </a>
                      <button
                        onClick={handleDownloadPdf}
                        className="px-3 py-1 rounded bg-[var(--accent)] text-white font-bold hover:opacity-90 inline-flex items-center gap-1 shadow-xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download PDF
                      </button>
                    </div>
                  </div>
                  <div className="w-full h-[620px] rounded-lg border border-[var(--border)] overflow-hidden shadow-inner bg-black/5">
                    <iframe
                      src={`${pdfBlobUrl}#toolbar=1&navpanes=1&view=FitH`}
                      className="w-full h-full border-0"
                      title="Compiled LaTeX PDF Dossier"
                    />
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center text-[var(--ink-secondary)] text-xs space-y-3">
                  <p>Could not render PDF preview in this browser session.</p>
                  <button
                    onClick={handleDownloadPdf}
                    className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-bold"
                  >
                    Download Compiled PDF Directly
                  </button>
                </div>
              )
            ) : viewMode === "latex" ? (
              loadingLatex ? (
                <div className="py-24 text-center space-y-3">
                  <div className="animate-spin w-8 h-8 border-3 border-[var(--accent)] border-t-transparent rounded-full mx-auto" />
                  <p className="text-xs text-[var(--ink-secondary)] font-medium">
                    Generating LaTeX source code...
                  </p>
                </div>
              ) : latexContent ? (
                <div className="space-y-3">
                  <div className="p-3 bg-[var(--bg-surface)] rounded-lg border border-[var(--border)] flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ink-secondary)]">
                    <span className="font-mono text-[11px]">
                      Standard Article &bull; Geometry (1.8cm) &bull; Hyperref Bookmarks &bull; Tcolorbox &bull; Booktabs
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleOpenOverleaf}
                        className="px-2.5 py-1 rounded bg-emerald-600/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold hover:bg-emerald-600/25 transition inline-flex items-center gap-1.5"
                        title="Open and compile directly in Overleaf (Cloud LaTeX)"
                      >
                        <ExternalLink className="w-3 h-3" /> Compile in Overleaf
                      </button>
                      <button
                        onClick={handleDownloadLatex}
                        className="text-[var(--accent)] font-bold hover:underline flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" /> Download .tex
                      </button>
                    </div>
                  </div>
                  <pre className="font-mono text-xs bg-[#11100F] text-[#EDE8DE] p-5 sm:p-6 rounded-lg overflow-x-auto whitespace-pre leading-relaxed shadow-inner border border-[var(--border)]">
                    {latexContent}
                  </pre>
                </div>
              ) : (
                <div className="py-16 text-center text-[var(--ink-secondary)] text-xs">
                  Click above to load LaTeX source code.
                </div>
              )
            ) : report ? (
              viewMode === "brief" ? (
                <div className="prose prose-slate dark:prose-invert max-w-none text-xs sm:text-sm bg-[var(--bg-surface)] p-6 sm:p-8 rounded-lg border border-[var(--border)] shadow-xs leading-relaxed whitespace-pre-wrap font-sans text-[var(--ink)]">
                  {report.content}
                </div>
              ) : (
                <pre className="font-mono text-xs bg-[#11100F] text-[#EDE8DE] p-5 sm:p-6 rounded-lg overflow-x-auto whitespace-pre leading-relaxed shadow-inner border border-[var(--border)]">
                  {report.content}
                </pre>
              )
            ) : (
              <div className="py-16 text-center text-[var(--ink-secondary)] text-xs">
                No report content generated. Click Retry to compile.
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3.5 bg-[var(--bg-page)]/80 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--ink-secondary)]">
            <span className="font-mono text-[11px] hidden sm:inline">
              DecisionLens Dossier &bull; Grounded Evidence &bull; A4 Typeset &amp; Outline Bookmarks
            </span>
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={handleDownloadPdf}
                className="px-3.5 py-1.5 bg-[var(--accent)] text-white hover:opacity-90 font-bold rounded-lg transition"
              >
                Download PDF
              </button>
              <button
                onClick={onClose}
                className="px-3.5 py-1.5 bg-[var(--bg-surface)] hover:bg-[var(--border)] text-[var(--ink)] font-semibold rounded-lg border border-[var(--border)] transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
