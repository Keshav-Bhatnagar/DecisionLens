"use client";

import { useState, useRef } from "react";
import { uploadAttachment, Attachment } from "@/lib/api";
import {
  UploadCloud,
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
  FileUp,
  Info,
} from "lucide-react";

interface FileUploaderProps {
  decisionId: number;
  onUploadSuccess: (attachment: Attachment) => void;
}

export default function FileUploader({ decisionId, onUploadSuccess }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileProcess = async (file: File) => {
    setError(null);
    setSuccessMsg(null);

    // Client-side extension validation
    const allowed = [".pdf", ".docx", ".txt", ".md", ".markdown"];
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!allowed.includes(ext)) {
      setError(`Unsupported file format '${ext}'. Supported formats: .pdf, .docx, .txt, .md`);
      return;
    }

    // Client-side size check (25MB)
    const maxBytes = 25 * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the 25MB maximum limit.`);
      return;
    }

    if (file.size === 0) {
      setError("Uploaded file is empty (0 bytes).");
      return;
    }

    setUploading(true);
    try {
      const attachment = await uploadAttachment(decisionId, file);
      setSuccessMsg(`"${file.name}" uploaded and text extracted successfully!`);
      onUploadSuccess(attachment);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileProcess(e.target.files[0]);
    }
  };

  const isScannedPdfError = error?.toLowerCase().includes("scanned pdf") || error?.toLowerCase().includes("ocr");

  return (
    <div className="space-y-4">
      {/* Drag & Drop Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
          isDragging
            ? "border-indigo-500 bg-indigo-50/60 scale-[1.01]"
            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 bg-white"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,.markdown"
          onChange={handleFileInputChange}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            {uploading ? (
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            ) : (
              <UploadCloud className="w-6 h-6" />
            )}
          </div>

          <div>
            <p className="text-sm font-bold text-slate-800">
              {uploading ? "Extracting document text..." : "Click to upload or drag & drop"}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              PDF, Word (.docx), Plain Text (.txt), or Markdown (.md) up to 25MB
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-400 font-medium">
            <span className="px-2 py-0.5 bg-slate-100 rounded">.PDF</span>
            <span className="px-2 py-0.5 bg-slate-100 rounded">.DOCX</span>
            <span className="px-2 py-0.5 bg-slate-100 rounded">.TXT</span>
            <span className="px-2 py-0.5 bg-slate-100 rounded">.MD</span>
          </div>
        </div>
      </div>

      {/* Scanned PDF Specific Alert */}
      {isScannedPdfError && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-1">
          <div className="flex items-center gap-2 font-bold text-amber-800">
            <Info className="w-4 h-4 shrink-0" />
            <span>Scanned PDF Notice (OCR Required)</span>
          </div>
          <p className="text-amber-700">
            {error}
          </p>
          <p className="text-[11px] text-amber-600">
            Note: DecisionLens currently extracts selectable digital text. Scanned photo-only PDFs require optical character recognition (OCR), which is deferred for now.
          </p>
        </div>
      )}

      {/* General Error Alert */}
      {error && !isScannedPdfError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Success Banner */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
    </div>
  );
}
