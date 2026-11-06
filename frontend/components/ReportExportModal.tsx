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
  FileCode,
  ExternalLink,
  Eye,
  FileCheck2,
  Braces,
  BookOpen,
  Code2,
} from "lucide-react";

interface ReportExportModalProps {
  decisionId: number;
  decisionTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onReportSaved?: () => void;
}

type ExportFormat = "pdf" | "markdown" | "json";
type MarkdownMode = "reading" | "source";

interface FormatMeta {
  id: ExportFormat;
  title: string;
  extension: string;
  badge: string;
  description: string;
}

const FORMATS: FormatMeta[] = [
  {
    id: "pdf",
    title: "Executive PDF dossier",
    extension: ".pdf",
    badge: "Typeset dossier",
    description: "Publication-grade dossier with table of contents, blunder shield, and verified footnotes.",
  },
  {
    id: "markdown",
    title: "Architectural decision record",
    extension: ".md",
    badge: "MADR standard",
    description: "Git-native architectural record formatted for engineering wikis, Notion, and pull requests.",
  },
  {
    id: "json",
    title: "Decision telemetry & graph",
    extension: ".json",
    badge: "JSON-LD",
    description: "Complete machine-readable audit trail, weighted scoring matrix, and dependency graph.",
  },
];

export default function ReportExportModal({
  decisionId,
  decisionTitle,
  isOpen,
  onClose,
  onReportSaved,
}: ReportExportModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("pdf");
  const [markdownMode, setMarkdownMode] = useState<MarkdownMode>("reading");

  // Content states
  const [report, setReport] = useState<ReportExportResponse | null>(null);
  const [latexContent, setLatexContent] = useState<string | null>(null);
  const [jsonContent, setJsonContent] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);

  // Loading states
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [loadingLatex, setLoadingLatex] = useState(false);
  const [loadingMarkdown, setLoadingMarkdown] = useState(false);
  const [loadingJson, setLoadingJson] = useState(false);

  // Download states
  const [downloadingFormat, setDownloadingFormat] = useState<ExportFormat | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const pdfUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadCompiledPdf();
      loadMarkdown();
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

  async function loadMarkdown() {
    if (report) return;
    setLoadingMarkdown(true);
    try {
      const data = await exportDecisionReport(decisionId, "markdown");
      setReport(data);
    } catch {
      // Non-critical if markdown fails while PDF is loading
    } finally {
      setLoadingMarkdown(false);
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

  async function loadJsonContent() {
    if (jsonContent) return;
    setLoadingJson(true);
    try {
      const data = await exportDecisionReport(decisionId, "json");
      const text = typeof data.content === "string" ? data.content : JSON.stringify(data, null, 2);
      setJsonContent(text);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load JSON telemetry");
    } finally {
      setLoadingJson(false);
    }
  }

  function handleSelectFormat(fmt: ExportFormat) {
    setSelectedFormat(fmt);
    setError(null);
    if (fmt === "pdf" && !pdfBlobUrl) {
      loadCompiledPdf();
    } else if (fmt === "markdown" && !report) {
      loadMarkdown();
    } else if (fmt === "json" && !jsonContent) {
      loadJsonContent();
    }
  }

  function handleCopyCurrentContent() {
    let text = "";
    if (selectedFormat === "markdown") text = report?.content || "";
    else if (selectedFormat === "json") text = jsonContent || "";

    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  function getSafeFilename(extension: string) {
    const slug = decisionTitle.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 35) || "decision";
    return `${slug}_dossier${extension}`;
  }

  async function handleDownload(fmt: ExportFormat) {
    setDownloadingFormat(fmt);
    setError(null);
    try {
      let blob: Blob;
      let filename = "";

      if (fmt === "pdf") {
        blob = await downloadDecisionExportBlob(decisionId, "pdf");
        filename = getSafeFilename(".pdf");
      } else if (fmt === "markdown") {
        if (report?.content) {
          blob = new Blob([report.content], { type: "text/markdown;charset=utf-8" });
        } else {
          blob = await downloadDecisionExportBlob(decisionId, "markdown");
        }
        filename = getSafeFilename(".md");
      } else {
        blob = await downloadDecisionExportBlob(decisionId, "json");
        filename = getSafeFilename(".json");
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Export download failed for ${fmt.toUpperCase()}`);
    } finally {
      setDownloadingFormat(null);
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

  async function handleSaveToAttachments() {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res: SaveReportResponse = await saveDecisionReportExport(decisionId);
      setSuccessMsg(`Dossier saved to attachments: ${res.filename}`);
      if (onReportSaved) {
        onReportSaved();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save dossier to attachments library");
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fadeIn">
        <div className="bg-[var(--bg-surface)] text-[var(--ink)] rounded-2xl border border-[var(--border)] shadow-2xl max-w-6xl w-full max-h-[92vh] flex flex-col overflow-hidden my-auto">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-[var(--border)] flex items-center justify-between gap-4 bg-[var(--bg-page)]/40">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="p-1.5 rounded-lg bg-[var(--bg-surface)] text-[var(--accent)] border border-[var(--border)] shadow-2xs">
                  <FileCheck2 className="w-5 h-5" />
                </span>
                <h3 className="text-base sm:text-lg font-serif font-bold text-[var(--ink)] tracking-tight">
                  Export decision dossier
                </h3>
              </div>
              <p className="text-xs text-[var(--ink-secondary)] mt-1">
                Review and download your architectural decision across publication and developer formats.
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-page)] text-[var(--ink)] flex items-center justify-center border border-[var(--border)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] cursor-pointer"
              title="Close modal"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Feedback Banners */}
          {error && (
            <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                onClick={() => handleSelectFormat(selectedFormat)}
                className="text-xs font-semibold underline ml-3 flex items-center gap-1 hover:opacity-80 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
            </div>
          )}
          {successMsg && (
            <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
              <button onClick={() => setSuccessMsg(null)} className="hover:opacity-80 ml-3 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Split Workbench Body */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-[500px]">
            {/* Left Column: Format Deck */}
            <div className="w-full md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-[var(--border)] bg-[var(--bg-page)]/30 p-4 space-y-2.5 overflow-y-auto flex flex-col justify-between">
              <div className="space-y-2">
                <span className="block text-[11px] font-mono text-[var(--ink-secondary)] font-semibold uppercase tracking-wider mb-1">
                  Export formats
                </span>
                {FORMATS.map((fmt) => {
                  const isSelected = selectedFormat === fmt.id;
                  const isDownloading = downloadingFormat === fmt.id;

                  return (
                    <div
                      key={fmt.id}
                      onClick={() => handleSelectFormat(fmt.id)}
                      className={`p-3 rounded-xl border text-left transition-colors cursor-pointer relative ${
                        isSelected
                          ? "bg-[var(--bg-surface)] border-[var(--accent)] shadow-xs"
                          : "bg-[var(--bg-surface)]/60 border-[var(--border)] hover:bg-[var(--bg-surface)] text-[var(--ink-secondary)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={`text-xs font-semibold ${isSelected ? "text-[var(--ink)]" : "text-[var(--ink-secondary)]"}`}>
                          {fmt.title}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--bg-page)] text-[var(--ink-secondary)]">
                          {fmt.extension}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--ink-secondary)] leading-relaxed mb-2.5">
                        {fmt.description}
                      </p>
                      <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]/60 text-xs">
                        <span className="text-[10px] text-[var(--ink-tertiary)] font-mono">
                          {fmt.badge}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(fmt.id);
                          }}
                          disabled={isDownloading}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] cursor-pointer ${
                            isSelected
                              ? "bg-[var(--accent)] text-white hover:opacity-90 shadow-2xs"
                              : "bg-[var(--bg-page)] hover:bg-[var(--border)] text-[var(--ink)] border border-[var(--border)]"
                          }`}
                        >
                          <Download className="w-3 h-3" />
                          <span>{isDownloading ? "Downloading..." : `Download ${fmt.extension}`}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Save to attachments permanent action */}
              <div className="pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={handleSaveToAttachments}
                  disabled={saving}
                  className="w-full py-2 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-page)] text-[var(--ink)] text-xs font-semibold flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] cursor-pointer shadow-2xs disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>{saving ? "Saving to documents..." : "Save dossier to documents library"}</span>
                </button>
              </div>
            </div>

            {/* Right Column: Live Artifact Canvas */}
            <div className="flex-1 flex flex-col bg-[var(--bg-surface)] min-w-0 overflow-hidden">
              {/* Context Bar */}
              <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-page)]/20 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[var(--ink)]">
                    {FORMATS.find((f) => f.id === selectedFormat)?.title}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--bg-surface)] text-[var(--ink-secondary)] border border-[var(--border)]">
                    {FORMATS.find((f) => f.id === selectedFormat)?.badge}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Contextual actions based on active format */}
                  {selectedFormat === "pdf" && (
                    <>
                      {pdfBlobUrl && (
                        <a
                          href={pdfBlobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-page)] text-[var(--ink)] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Open fullscreen</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          if (!latexContent) await loadLatexContent();
                          handleOpenOverleaf();
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold hover:bg-emerald-500/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer"
                        title="Open document directly in Overleaf (Cloud LaTeX)"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open in Overleaf</span>
                      </button>
                    </>
                  )}

                  {selectedFormat === "markdown" && (
                    <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-0.5 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => setMarkdownMode("reading")}
                        className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1 ${
                          markdownMode === "reading"
                            ? "bg-[var(--accent)] text-white font-semibold shadow-2xs"
                            : "text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                        }`}
                      >
                        <BookOpen className="w-3 h-3" />
                        <span>Reading view</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMarkdownMode("source")}
                        className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer flex items-center gap-1 ${
                          markdownMode === "source"
                            ? "bg-[var(--accent)] text-white font-semibold shadow-2xs"
                            : "text-[var(--ink-secondary)] hover:text-[var(--ink)]"
                        }`}
                      >
                        <Code2 className="w-3 h-3" />
                        <span>Raw source</span>
                      </button>
                    </div>
                  )}

                  {selectedFormat !== "pdf" && (
                    <button
                      type="button"
                      onClick={handleCopyCurrentContent}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--bg-page)] text-[var(--ink)] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-600">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[var(--ink-secondary)]" />
                          <span>Copy content</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDownload(selectedFormat)}
                    disabled={downloadingFormat === selectedFormat}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--accent)] hover:opacity-90 text-white font-bold transition-opacity shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>
                      {downloadingFormat === selectedFormat
                        ? "Downloading..."
                        : `Download ${FORMATS.find((f) => f.id === selectedFormat)?.extension}`}
                    </span>
                  </button>
                </div>
              </div>

              {/* Viewer Area */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[var(--bg-page)]/20">
                {selectedFormat === "pdf" ? (
                  loadingPdf ? (
                    <div className="py-28 text-center space-y-3">
                      <div className="animate-spin w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full mx-auto" />
                      <p className="text-xs text-[var(--ink-secondary)] font-medium">
                        Compiling publication-grade LaTeX PDF dossier...
                      </p>
                    </div>
                  ) : pdfBlobUrl ? (
                    <div className="w-full h-[620px] rounded-xl border border-[var(--border)] overflow-hidden shadow-inner bg-black/5">
                      <iframe
                        src={`${pdfBlobUrl}#toolbar=1&navpanes=0&view=FitH`}
                        className="w-full h-full border-0"
                        title="Compiled LaTeX PDF Dossier"
                      />
                    </div>
                  ) : (
                    <div className="py-24 text-center text-xs text-[var(--ink-secondary)] space-y-3">
                      <p>Preview not available in this browser session.</p>
                      <button
                        type="button"
                        onClick={() => handleDownload("pdf")}
                        className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white font-bold cursor-pointer"
                      >
                        Download PDF directly
                      </button>
                    </div>
                  )
                ) : selectedFormat === "markdown" ? (
                  loadingMarkdown ? (
                    <div className="py-28 text-center space-y-3">
                      <div className="animate-spin w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full mx-auto" />
                      <p className="text-xs text-[var(--ink-secondary)] font-medium">
                        Loading Markdown record...
                      </p>
                    </div>
                  ) : report?.content ? (
                    markdownMode === "reading" ? (
                      <div className="prose prose-slate dark:prose-invert max-w-none text-xs sm:text-sm bg-[var(--bg-surface)] p-6 sm:p-8 rounded-xl border border-[var(--border)] shadow-xs leading-relaxed whitespace-pre-wrap font-sans text-[var(--ink)]">
                        {report.content}
                      </div>
                    ) : (
                      <pre className="font-mono text-xs bg-[#11100F] text-[#EDE8DE] p-5 sm:p-6 rounded-xl overflow-x-auto whitespace-pre leading-relaxed shadow-inner border border-[var(--border)] max-h-[620px]">
                        {report.content}
                      </pre>
                    )
                  ) : (
                    <div className="py-24 text-center text-xs text-[var(--ink-secondary)]">
                      No markdown report found.
                    </div>
                  )
                ) : selectedFormat === "json" ? (
                  loadingJson ? (
                    <div className="py-28 text-center space-y-3">
                      <div className="animate-spin w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full mx-auto" />
                      <p className="text-xs text-[var(--ink-secondary)] font-medium">
                        Formatting telemetry JSON graph...
                      </p>
                    </div>
                  ) : jsonContent ? (
                    <pre className="font-mono text-xs bg-[#11100F] text-[#EDE8DE] p-5 sm:p-6 rounded-xl overflow-x-auto whitespace-pre leading-relaxed shadow-inner border border-[var(--border)] max-h-[620px]">
                      {jsonContent}
                    </pre>
                  ) : (
                    <div className="py-24 text-center text-xs text-[var(--ink-secondary)]">
                      No telemetry graph available.
                    </div>
                  )
                ) : null}
              </div>
            </div>
          </div>

          {/* Clean Footer */}
          <div className="p-3.5 bg-[var(--bg-page)]/50 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--ink-secondary)]">
            <span className="text-[11px] font-mono">
              DecisionLens intelligence dossier • Verified audit trail
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 bg-[var(--bg-surface)] hover:bg-[var(--border)] text-[var(--ink)] font-semibold rounded-lg border border-[var(--border)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] cursor-pointer"
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
