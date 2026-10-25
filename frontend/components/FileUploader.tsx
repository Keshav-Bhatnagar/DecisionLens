"use client";

import { useState, useRef, useEffect } from "react";
import { uploadAttachment, importGoogleDriveAttachment, Attachment } from "@/lib/api";
import {
  UploadCloud,
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Info,
  Link as LinkIcon,
  X,
  ExternalLink,
} from "lucide-react";

declare global {
  interface Window {
    google?: any;
    gapi?: any;
  }
}

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

  // Google Drive Modal State
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [driveUrl, setDriveUrl] = useState("");
  const [driveImporting, setDriveImporting] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);

  // Google Picker scripts loader
  const [gapiLoaded, setGapiLoaded] = useState(false);
  const [gisLoaded, setGisLoaded] = useState(false);

  useEffect(() => {
    // Dynamically load Google GAPI & GIS scripts
    if (typeof window === "undefined") return;

    if (!document.getElementById("google-gapi-script")) {
      const gapiScript = document.createElement("script");
      gapiScript.id = "google-gapi-script";
      gapiScript.src = "https://apis.google.com/js/api.js";
      gapiScript.async = true;
      gapiScript.defer = true;
      gapiScript.onload = () => {
        window.gapi?.load("picker", () => setGapiLoaded(true));
      };
      document.body.appendChild(gapiScript);
    } else if (window.gapi) {
      window.gapi.load("picker", () => setGapiLoaded(true));
    }

    if (!document.getElementById("google-gis-script")) {
      const gisScript = document.createElement("script");
      gisScript.id = "google-gis-script";
      gisScript.src = "https://accounts.google.com/gsi/client";
      gisScript.async = true;
      gisScript.defer = true;
      gisScript.onload = () => setGisLoaded(true);
      document.body.appendChild(gisScript);
    } else if (window.google?.accounts) {
      setGisLoaded(true);
    }
  }, []);

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

  // 1. Handle Import via Google Drive / Docs URL
  const handleDriveUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driveUrl.trim()) return;

    setDriveImporting(true);
    setDriveError(null);
    setError(null);
    setSuccessMsg(null);

    try {
      const att = await importGoogleDriveAttachment(decisionId, {
        drive_url: driveUrl.trim(),
      });
      setSuccessMsg(`"${att.original_name}" imported from Google Drive successfully!`);
      onUploadSuccess(att);
      setShowDriveModal(false);
      setDriveUrl("");
    } catch (err: unknown) {
      setDriveError(err instanceof Error ? err.message : "Failed to import from Google Drive");
    } finally {
      setDriveImporting(false);
    }
  };

  // 2. Handle Google Drive Picker
  const handleOpenGooglePicker = () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "736536505245-um5hebvich2ccvme3lds6ahnqdh22l86.apps.googleusercontent.com";
    if (!window.google?.accounts?.oauth2) {
      setDriveError("Google Identity Services library is still loading. Please try again in a moment.");
      return;
    }

    setDriveError(null);

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (tokenResponse: any) => {
        if (tokenResponse && tokenResponse.access_token) {
          createAndShowPicker(tokenResponse.access_token);
        } else if (tokenResponse && tokenResponse.error) {
          if (tokenResponse.error === "access_denied") {
            setDriveError(
              "Google Access Denied (403): Your Google Cloud OAuth is in 'Testing' mode. Please add your Gmail under 'Test users' in Google Cloud Console -> OAuth consent screen. Or simply paste the Google Docs / Drive link directly in the box above (zero setup needed)!"
            );
          } else {
            setDriveError(`Google authorization error: ${tokenResponse.error}`);
          }
        }
      },
    });

    tokenClient.requestAccessToken({ prompt: "consent" });
  };

  const createAndShowPicker = (accessToken: string) => {
    if (!window.google?.picker) {
      setDriveError("Google Picker is initializing. Please try again in a few seconds.");
      return;
    }

    try {
      const docsView = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false);

      const picker = new window.google.picker.PickerBuilder()
        .addView(docsView)
        .setOAuthToken(accessToken)
        .setOrigin(window.location.origin)
        .setCallback(async (data: any) => {
          if (data.action === window.google.picker.Action.PICKED) {
            const doc = data.docs[0];
            const fileId = doc.id;
            const fileName = doc.name;
            const mimeType = doc.mimeType;

            setDriveImporting(true);
            try {
              const att = await importGoogleDriveAttachment(decisionId, {
                file_id: fileId,
                original_name: fileName,
                mime_type: mimeType,
                access_token: accessToken,
              });
              setSuccessMsg(`"${fileName}" imported from Google Drive successfully!`);
              onUploadSuccess(att);
              setShowDriveModal(false);
            } catch (err: unknown) {
              setDriveError(err instanceof Error ? err.message : "Failed to import selected document");
            } finally {
              setDriveImporting(false);
            }
          }
        })
        .build();

      picker.setVisible(true);
    } catch (err: any) {
      setDriveError(`Failed to initialize Google Picker: ${err?.message || err}`);
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
            ? "border-indigo-500 bg-indigo-50/70 scale-[1.01] shadow-md"
            : "border-slate-200/90 hover:border-indigo-400 hover:bg-slate-50/70 bg-white/70 backdrop-blur-xs shadow-2xs"
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

      {/* Cloud Integration Bar: Google Drive */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <button
          type="button"
          onClick={() => {
            setDriveError(null);
            setShowDriveModal(true);
          }}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl shadow-2xs hover:border-slate-300 transition-all active:scale-95"
        >
          {/* Google Drive Multi-color SVG icon */}
          <svg className="w-4 h-4" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
            <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
            <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
            <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
            <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
            <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
            <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
          </svg>
          <span>Import from Google Drive</span>
        </button>

        <span className="text-[11px] text-slate-400">
          Upload local file or import directly from Google Drive / Docs
        </span>
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
            Tip: You can also open this document in Google Drive $\rightarrow$ Open with Google Docs, then import via the Google Drive button above.
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

      {/* Modal: Google Drive Importer */}
      {showDriveModal && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-5 animate-in fade-in duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <svg className="w-5 h-5" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                  <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                  <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
                  <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                  <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                  <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                  <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                </svg>
                <h3 className="text-base font-bold text-slate-900">
                  Import from Google Drive
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDriveModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {driveError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{driveError}</span>
              </div>
            )}

            {/* Option A: Paste Google Docs / Drive Link */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Paste Google Docs or Drive Link
                </label>
                <form onSubmit={handleDriveUrlSubmit} className="flex gap-2">
                  <div className="relative flex-1">
                    <LinkIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="url"
                      required
                      value={driveUrl}
                      onChange={(e) => setDriveUrl(e.target.value)}
                      placeholder="https://docs.google.com/document/d/..."
                      className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={driveImporting || !driveUrl.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-colors shrink-0"
                  >
                    {driveImporting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Importing...</span>
                      </>
                    ) : (
                      <span>Import</span>
                    )}
                  </button>
                </form>
                <p className="text-[11px] text-slate-400 mt-1">
                  Supports Google Docs, Sheets, and public Google Drive documents.
                </p>
              </div>

              {/* Divider */}
              <div className="relative flex items-center justify-center my-4">
                <div className="border-t border-slate-200 w-full" />
                <span className="bg-white px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Or
                </span>
              </div>

              {/* Option B: Interactive Google Drive Picker */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                  Browse Google Drive Files
                </label>
                <button
                  type="button"
                  onClick={handleOpenGooglePicker}
                  disabled={driveImporting}
                  className="w-full py-3 px-4 rounded-xl border border-slate-200 hover:border-indigo-300 bg-slate-50 hover:bg-indigo-50/40 text-slate-700 font-semibold text-xs flex items-center justify-center gap-2.5 transition-all group active:scale-[0.99]"
                >
                  <ExternalLink className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition-transform" />
                  <span>Choose File from My Google Drive</span>
                </button>
                <p className="text-[11px] text-slate-400 text-center">
                  Opens Google&apos;s secure file browser to select any file from your Drive.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

