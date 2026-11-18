"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, FileText, Loader2, Quote, RefreshCw, Sparkles, X } from "lucide-react";
import {
  askDecisionDocuments,
  getDecisionRagStatus,
  reindexDecisionRag,
  RagAskResponse,
  RagCitation,
  RagStatusResponse,
} from "@/lib/api";

interface AskDocumentsPanelProps {
  decisionId: number;
  attachmentCount: number;
  onStatusChange?: (status: RagStatusResponse | null) => void;
}

const SUGGESTIONS = ["What are the key costs?", "Any deadlines or notice periods?", "What risks are mentioned?"];

function CitationChip({
  n,
  active,
  onClick,
}: {
  n: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Show source ${n}`}
      className={`inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 mx-[1px] align-[1px] text-[9px] font-bold font-mono rounded-[3px] border transition-all duration-150 active:scale-90 ${
        active
          ? "bg-[#7a4e10] text-[#FBF8F1] border-[#7a4e10] dark:bg-[#D4AA50] dark:text-[#181614] dark:border-[#D4AA50]"
          : "bg-[#F3E7CC] text-[#7a4e10] border-[#D9C08A] hover:bg-[#EBD9B0] dark:bg-[#D4AA50]/15 dark:text-[#D4AA50] dark:border-[#D4AA50]/40"
      }`}
    >
      {n}
    </button>
  );
}

/** Renders answer text, turning [n] markers into tappable gold citation chips. */
function AnswerText({
  text,
  activeIndex,
  onCite,
}: {
  text: string;
  activeIndex: number | null;
  onCite: (n: number) => void;
}) {
  const parts = text.split(/(\[\d{1,2}\])/g);
  return (
    <p className="text-[12px] leading-[1.6] text-[#24211D] dark:text-[#E8E2D2]">
      {parts.map((part, i) => {
        const m = part.match(/^\[(\d{1,2})\]$/);
        if (m) {
          const n = Number(m[1]);
          return <CitationChip key={i} n={n} active={activeIndex === n} onClick={() => onCite(n)} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

function SourcePassage({ citation, onClose }: { citation: RagCitation; onClose: () => void }) {
  return (
    <div className="mt-2 border border-[#D9C08A] dark:border-[#D4AA50]/30 bg-[#FFFDF8] dark:bg-[#181614] dl-rise">
      <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-[#EADFC6] dark:border-[#38332C]">
        <span className="flex items-center gap-1 min-w-0 text-[10px] font-bold text-[#443a30] dark:text-[#E8E2D2]">
          <span className="font-mono text-[#7a4e10] dark:text-[#D4AA50]">[{citation.index}]</span>
          <FileText className="w-3 h-3 shrink-0 text-[#97907e]" />
          <span className="truncate">{citation.document_name}</span>
        </span>
        <button type="button" onClick={onClose} aria-label="Close source" className="text-[#97907e] hover:text-[#24211D] dark:hover:text-[#E8E2D2]">
          <X className="w-3 h-3" />
        </button>
      </div>
      <p className="px-2 py-1.5 text-[10.5px] leading-relaxed text-[#4f4b40] dark:text-[#A89F91] max-h-32 overflow-y-auto whitespace-pre-line">
        {citation.content}
      </p>
    </div>
  );
}

function ThinkingShimmer() {
  return (
    <div className="p-2.5 bg-[#FBF6EA] dark:bg-[#1E1B17] border border-[#E4D6B6] dark:border-[#38332C] space-y-1.5" aria-live="polite">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
        <Sparkles className="w-3 h-3 animate-pulse" />
        Reading your documents
      </div>
      {[92, 78, 54].map((w) => (
        <div key={w} className="h-2 rounded-sm dl-shimmer" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

export default function AskDocumentsPanel({ decisionId, attachmentCount, onStatusChange }: AskDocumentsPanelProps) {
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<RagAskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCitation, setActiveCitation] = useState<number | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [status, setStatus] = useState<RagStatusResponse | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refreshStatus = useCallback(() => {
    getDecisionRagStatus(decisionId)
      .then((s) => {
        setStatus(s);
        onStatusChange?.(s);
      })
      .catch(() => {
        setStatus(null);
        onStatusChange?.(null);
      });
  }, [decisionId, onStatusChange]);

  useEffect(() => {
    if (attachmentCount > 0) refreshStatus();
  }, [attachmentCount, refreshStatus]);

  const ask = async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2 || asking) return;
    setQuestion(trimmed);
    setAsking(true);
    setError(null);
    setActiveCitation(null);
    setShowSources(false);
    try {
      const res = await askDecisionDocuments(decisionId, trimmed);
      setResult(res);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Couldn't reach your documents. Try again.");
    } finally {
      setAsking(false);
    }
  };

  const handleReindex = async () => {
    setReindexing(true);
    setError(null);
    try {
      await reindexDecisionRag(decisionId);
      refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-index failed. Try again.");
    } finally {
      setReindexing(false);
    }
  };

  const citationFor = (n: number) => result?.citations.find((c) => c.index === n) ?? null;
  const active = activeCitation !== null ? citationFor(activeCitation) : null;
  const docCount = status?.document_count ?? attachmentCount;
  const stale = (status?.stale_chunks ?? 0) > 0;

  return (
    <div className="space-y-2 pt-1">
      {/* Status line */}
      <div className="flex items-center justify-between gap-2 text-[10px] text-[#97907e]">
        <span className="truncate">
          {status
            ? `${docCount} ${docCount === 1 ? "file" : "files"} indexed · ${status.semantic ? "search by meaning" : "word matching"}`
            : "Checking index…"}
          {stale && <span className="text-[#7a4e10] dark:text-[#D4AA50]"> · needs refresh</span>}
        </span>
        <button
          type="button"
          onClick={handleReindex}
          disabled={reindexing}
          className="flex items-center gap-1 shrink-0 font-bold text-[#443a30] dark:text-[#D4AA50] hover:underline disabled:opacity-50"
        >
          <RefreshCw className={`w-2.5 h-2.5 ${reindexing ? "animate-spin" : ""}`} />
          {reindexing ? "Re-indexing" : "Re-index"}
        </button>
      </div>

      {/* Ask box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
        className="group flex items-center gap-1 bg-[#FBF8F1] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] focus-within:border-[#7a4e10] dark:focus-within:border-[#D4AA50] transition-colors"
      >
        <Sparkles className="w-3 h-3 ml-2 shrink-0 text-[#7a4e10] dark:text-[#D4AA50]" />
        <input
          ref={inputRef}
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask your documents…"
          maxLength={1000}
          className="flex-1 min-w-0 py-1.5 text-[11.5px] bg-transparent text-[#24211D] dark:text-[#E8E2D2] placeholder-[#97907e] focus:outline-none"
        />
        <button
          type="submit"
          disabled={asking || question.trim().length < 2}
          aria-label="Ask"
          className="m-1 w-6 h-6 flex items-center justify-center shrink-0 bg-[#443a30] text-[#FBF8F1] dark:bg-[#D4AA50] dark:text-[#181614] disabled:opacity-40 hover:bg-[#2b241d] active:scale-90 transition-all"
        >
          {asking ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowUp className="w-3.5 h-3.5" />}
        </button>
      </form>

      {/* Suggestions when idle */}
      {!result && !asking && !error && (
        <div className="flex flex-wrap gap-1">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void ask(s)}
              className="px-1.5 py-0.5 text-[10px] text-[#4f4b40] dark:text-[#A89F91] bg-[#F4F0E6] dark:bg-[#1E1B17] border border-[#E2D9C4] dark:border-[#38332C] hover:border-[#7a4e10] hover:text-[#7a4e10] dark:hover:border-[#D4AA50] dark:hover:text-[#D4AA50] transition-colors active:scale-95"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {asking && <ThinkingShimmer />}

      {error && !asking && (
        <div className="p-2 text-[11px] border border-red-300 bg-red-50 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Answer card */}
      {result && !asking && (
        <div className="relative p-2.5 bg-[#FBF6EA] dark:bg-[#1E1B17] border border-[#E4D6B6] dark:border-[#38332C] shadow-[0_1px_0_#fff_inset,0_6px_16px_-12px_rgba(68,58,48,0.45)] dl-rise">
          <span className="absolute left-0 top-2.5 bottom-2.5 w-[2px] bg-[#C9A55A] dark:bg-[#D4AA50]" />
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50]">
              {result.covered ? "Answer" : "Not in your documents"}
            </span>
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setQuestion("");
                inputRef.current?.focus();
              }}
              aria-label="Clear answer"
              className="text-[#97907e] hover:text-[#24211D] dark:hover:text-[#E8E2D2]"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          {result.covered ? (
            <AnswerText
              text={result.answer}
              activeIndex={activeCitation}
              onCite={(n) => setActiveCitation((cur) => (cur === n ? null : n))}
            />
          ) : (
            <p className="text-[11.5px] leading-relaxed text-[#4f4b40] dark:text-[#A89F91] italic">{result.answer}</p>
          )}

          {active && <SourcePassage citation={active} onClose={() => setActiveCitation(null)} />}

          {result.citations.length > 0 && (
            <div className="mt-2 pt-1.5 border-t border-[#EADFC6] dark:border-[#38332C]">
              <button
                type="button"
                onClick={() => setShowSources((v) => !v)}
                className="w-full flex items-center justify-between text-[10px] text-[#97907e] hover:text-[#443a30] dark:hover:text-[#E8E2D2]"
              >
                <span className="flex items-center gap-1">
                  <Quote className="w-2.5 h-2.5 text-[#7a4e10] dark:text-[#D4AA50]" />
                  Grounded in {result.documents_used} {result.documents_used === 1 ? "document" : "documents"}
                </span>
                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showSources ? "rotate-180" : ""}`} />
              </button>
              {showSources && (
                <ul className="mt-1.5 space-y-1 dl-rise">
                  {result.citations.map((c) => (
                    <li key={c.index} className="flex items-center gap-1.5">
                      <CitationChip
                        n={c.index}
                        active={activeCitation === c.index}
                        onClick={() => setActiveCitation((cur) => (cur === c.index ? null : c.index))}
                      />
                      <button
                        type="button"
                        onClick={() => setActiveCitation((cur) => (cur === c.index ? null : c.index))}
                        className="min-w-0 flex-1 truncate text-left text-[10.5px] text-[#443a30] dark:text-[#E8E2D2] hover:text-[#7a4e10] dark:hover:text-[#D4AA50]"
                      >
                        {c.document_name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
