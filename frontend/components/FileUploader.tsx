"use client";

import { useState, useRef, useEffect } from "react";
import ModalPortal from "@/components/ModalPortal";
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
  FolderOpen,
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
      setError(`Unsupported file format '${ext}'. Permitted formats: .pdf, .docx, .txt, .md`);
      return;
    }

    // Client-side size check (25MB)
    const maxBytes = 25 * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the 25MB maximum threshold.`);
      return;
    }

    if (file.size === 0) {
      setError("Uploaded file is empty (0 bytes).");
      return;
    }

    setUploading(true);
    try {
      const attachment = await uploadAttachment(decisionId, file);
      setSuccessMsg(`"${file.name}" ingested into decision corpus (${attachment.extracted_text ? attachment.extracted_text.split(/\s+/).filter(Boolean).length : 0} words parsed).`);
      onUploadSuccess(attachment);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to upload document.";
      setError(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      await handleFileProcess(file);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      await handleFileProcess(file);
    }
  };

  // Import via pasted Google Docs / Drive URL
  const handleDriveUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driveUrl.trim()) return;

    setDriveError(null);
    setDriveImporting(true);

    try {
      const att = await importGoogleDriveAttachment(decisionId, { drive_url: driveUrl.trim() });
      setSuccessMsg(`Document "${att.original_name}" ingested from Google Drive!`);
      onUploadSuccess(att);
      setShowDriveModal(false);
      setDriveUrl("");
    } catch (err: unknown) {
      setDriveError(err instanceof Error ? err.message : "Failed to import from Google Drive URL.");
    } finally {
      setDriveImporting(false);
    }
  };

  // Launch Google OAuth2 Token Client & Google Picker
  const handleOpenGooglePicker = () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;

    if (!clientId) {
      setDriveError("NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured in client environment. Use direct link paste below.");
      return;
    }

    if (!window.google?.accounts?.oauth2) {
      setDriveError("Google Identity Services script is still loading. Please re-try in a moment.");
      return;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      callback: async (tokenResponse: any) => {
        if (tokenResponse.error !== undefined) {
          setDriveError(`Authentication error: ${tokenResponse.error}`);
          return;
        }
        createPicker(tokenResponse.access_token, apiKey);
      },
    });

    tokenClient.requestAccessToken({ prompt: "consent" });
  };

  const createPicker = (accessToken: string, apiKey?: string) => {
    if (!window.google?.picker) {
      setDriveError("Google Picker API failed to load.");
      return;
    }

    try {
      const docsView = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false);

      const pickerBuilder = new window.google.picker.PickerBuilder()
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
        });

      if (apiKey) {
        pickerBuilder.setDeveloperKey(apiKey);
      }

      const picker = pickerBuilder.build();
      picker.setVisible(true);
    } catch (err: any) {
      setDriveError(`Failed to initialize Google Picker: ${err?.message || err}`);
    }
  };

  const isScannedPdfError = error?.toLowerCase().includes("scanned pdf") || error?.toLowerCase().includes("ocr");

  return (
    <div className="space-y-4">
      {/* Archival Drag & Drop Dossier Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed p-8 sm:p-10 text-center cursor-pointer transition-all duration-150 rounded-none ${
          isDragging
            ? "border-[#7a4e10] dark:border-[#D4AA50] bg-[#efe8d8] dark:bg-[#28221a] scale-[1.005]"
            : "border-[#cfc7b2] dark:border-[#38332C] hover:border-[#7a4e10] dark:hover:border-[#D4AA50] bg-[#F4F0E6] dark:bg-[#181614]"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,.markdown"
          onChange={handleFileInputChange}
          className="hidden"
        />

        {/* Subtle Archival Corner Notch Marks */}
        <div className="absolute top-2 left-2 w-2 h-2 border-t-2 border-l-2 border-[#7a4e10]/40 dark:border-[#D4AA50]/40" />
        <div className="absolute top-2 right-2 w-2 h-2 border-t-2 border-r-2 border-[#7a4e10]/40 dark:border-[#D4AA50]/40" />
        <div className="absolute bottom-2 left-2 w-2 h-2 border-b-2 border-l-2 border-[#7a4e10]/40 dark:border-[#D4AA50]/40" />
        <div className="absolute bottom-2 right-2 w-2 h-2 border-b-2 border-r-2 border-[#7a4e10]/40 dark:border-[#D4AA50]/40" />

        <div className="flex flex-col items-center justify-center space-y-3.5">
          <div className="w-12 h-12 rounded-none bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] text-[#7a4e10] dark:text-[#D4AA50] flex items-center justify-center shadow-2xs">
            {uploading ? (
              <Loader2 className="w-5 h-5 animate-spin text-[#7a4e10] dark:text-[#D4AA50]" />
            ) : (
              <FolderOpen className="w-5 h-5" />
            )}
          </div>

          <div>
            <p className="font-newsreader text-lg text-[#1d1d1b] dark:text-[#F0EAE1]">
              {uploading ? "Extracting and indexing document text..." : "Click to select or drop technical reference dossiers"}
            </p>
            <p className="text-xs font-courier text-[#4f4b40] dark:text-[#A89F91] mt-1">
              PDF, Word (.docx), Plain Text (.txt), or Markdown (.md) · Maximum 25MB
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1 font-courier text-[11px] font-bold">
            <span className="px-2 py-0.5 bg-[#E5DEC9] dark:bg-[#2C2723] text-[#1d1d1b] dark:text-[#F0EAE1] border border-[#cfc7b2] dark:border-[#38332C]">
              .PDF
            </span>
            <span className="px-2 py-0.5 bg-[#E5DEC9] dark:bg-[#2C2723] text-[#1d1d1b] dark:text-[#F0EAE1] border border-[#cfc7b2] dark:border-[#38332C]">
              .DOCX
            </span>
            <span className="px-2 py-0.5 bg-[#E5DEC9] dark:bg-[#2C2723] text-[#1d1d1b] dark:text-[#F0EAE1] border border-[#cfc7b2] dark:border-[#38332C]">
              .TXT
            </span>
            <span className="px-2 py-0.5 bg-[#E5DEC9] dark:bg-[#2C2723] text-[#1d1d1b] dark:text-[#F0EAE1] border border-[#cfc7b2] dark:border-[#38332C]">
              .MD
            </span>
          </div>
        </div>
      </div>

      {/* Cloud Integration Bar: Google Drive */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-1 font-courier text-xs">
        <button
          type="button"
          onClick={() => {
            setDriveError(null);
            setShowDriveModal(true);
          }}
          className="inline-flex items-center gap-2 px-3.5 py-2 font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] bg-[#EDE7D6] hover:bg-[#E5DEC9] dark:bg-[#221F1C] dark:hover:bg-[#2C2723] border border-[#cfc7b2] dark:border-[#38332C] rounded-none shadow-2xs transition-colors cursor-pointer"
        >
          {/* Google Drive Multi-color SVG icon */}
          <svg className="w-3.5 h-3.5" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
            <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
            <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
            <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
            <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
            <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
            <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
          </svg>
          <span>Import from Google Drive</span>
        </button>

        <span className="text-[11px] text-[#4f4b40] dark:text-[#A89F91]">
          Upload local document or ingest directly from Google Drive / Docs
        </span>
      </div>

      {/* Scanned PDF Specific Alert */}
      {isScannedPdfError && (
        <div className="p-4 bg-[#EDE7D6] dark:bg-[#221F1C] border-l-4 border-l-[#7a4e10] dark:border-l-[#D4AA50] border border-[#cfc7b2] dark:border-[#38332C] text-xs font-courier space-y-1.5">
          <div className="flex items-center gap-2 font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider">
            <Info className="w-4 h-4 shrink-0" />
            <span>Scanned PDF Notice (OCR Required)</span>
          </div>
          <p className="text-[#1d1d1b] dark:text-[#F0EAE1]">
            {error}
          </p>
          <p className="text-[11px] text-[#4f4b40] dark:text-[#A89F91]">
            Tip: Open this document in Google Drive $\rightarrow$ &quot;Open with Google Docs&quot;, then import using the Google Drive button above.
          </p>
        </div>
      )}

      {/* General Error Alert */}
      {error && !isScannedPdfError && (
        <div className="p-3.5 bg-red-950/10 dark:bg-red-950/40 border border-red-400 dark:border-red-900 text-red-800 dark:text-red-300 text-xs font-courier flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Success Banner */}
      {successMsg && (
        <div className="p-3.5 bg-[#E5DEC9] dark:bg-[#2C2723] border border-[#7a4e10]/40 dark:border-[#D4AA50]/40 text-[#7a4e10] dark:text-[#D4AA50] text-xs font-courier flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="font-bold">{successMsg}</span>
        </div>
      )}

      {/* Modal: Google Drive Importer (Strict DecisionLens Theme) */}
      {showDriveModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] bg-[#181614]/80 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-[#F4F0E6] dark:bg-[#181614] border border-[#cfc7b2] dark:border-[#38332C] max-w-lg w-full p-6 sm:p-7 space-y-5 rounded-none shadow-2xl">
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#cfc7b2] dark:border-[#38332C]">
                <div>
                  <span className="text-[10px] font-courier font-bold uppercase tracking-wider text-[#7a4e10] dark:text-[#D4AA50] block">
                    Document Corpus Ingestion
                  </span>
                  <h3 className="font-newsreader text-xl font-normal text-[#1d1d1b] dark:text-[#F0EAE1]">
                    Import from Google Drive
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDriveModal(false)}
                  className="p-1 text-[#4f4b40] hover:text-[#1d1d1b] dark:text-[#A89F91] dark:hover:text-[#F0EAE1] border border-[#cfc7b2] dark:border-[#38332C] rounded-none transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {driveError && (
                <div className="p-3 bg-red-950/10 dark:bg-red-950/40 border border-red-400 dark:border-red-900 text-red-800 dark:text-red-300 text-xs font-courier flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{driveError}</span>
                </div>
              )}

              {/* Option A: Paste Google Docs / Drive Link */}
              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-courier font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1] mb-1.5">
                    Paste Google Docs or Drive Public Link
                  </label>
                  <form onSubmit={handleDriveUrlSubmit} className="flex gap-2">
                    <div className="relative flex-1">
                      <LinkIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#4f4b40] dark:text-[#A89F91]" />
                      <input
                        type="url"
                        required
                        value={driveUrl}
                        onChange={(e) => setDriveUrl(e.target.value)}
                        placeholder="https://docs.google.com/document/d/..."
                        className="w-full pl-9 pr-3 py-2 text-xs font-courier bg-[#EDE7D6] dark:bg-[#221F1C] border border-[#cfc7b2] dark:border-[#38332C] rounded-none text-[#1d1d1b] dark:text-[#F0EAE1] placeholder-[#7B8491] focus:border-[#7a4e10] dark:focus:border-[#D4AA50] focus:outline-none transition-colors"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={driveImporting || !driveUrl.trim()}
                      className="px-4 py-2 bg-[#1d1d1b] hover:bg-[#33302b] dark:bg-[#D4AA50] dark:hover:bg-[#E5BE64] dark:text-[#181614] text-[#F4F0E6] font-courier font-bold uppercase tracking-wider text-xs rounded-none flex items-center gap-1.5 transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
                    >
                      {driveImporting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Importing...</span>
                        </>
                      ) : (
                        <span>Ingest</span>
                      )}
                    </button>
                  </form>
                  <p className="text-[11px] font-courier text-[#4f4b40] dark:text-[#A89F91] mt-1.5">
                    Supports Google Docs, Sheets, and shared Google Drive files.
                  </p>
                </div>

                {/* Divider */}
                <div className="relative flex items-center justify-center my-3">
                  <div className="border-t border-[#cfc7b2] dark:border-[#38332C] w-full" />
                  <span className="bg-[#F4F0E6] dark:bg-[#181614] px-3 font-courier text-[10px] font-bold text-[#7a4e10] dark:text-[#D4AA50] uppercase tracking-wider">
                    Or Use Cloud Picker
                  </span>
                </div>

                {/* Option B: Interactive Google Drive Picker */}
                <div className="space-y-2">
                  <label className="block text-[11px] font-courier font-bold uppercase tracking-wider text-[#1d1d1b] dark:text-[#F0EAE1]">
                    Interactive Drive Selector
                  </label>
                  <button
                    type="button"
                    onClick={handleOpenGooglePicker}
                    disabled={driveImporting}
                    className="w-full py-2.5 px-4 rounded-none border border-[#cfc7b2] dark:border-[#38332C] hover:border-[#7a4e10] dark:hover:border-[#D4AA50] bg-[#EDE7D6] hover:bg-[#E5DEC9] dark:bg-[#221F1C] dark:hover:bg-[#2C2723] text-[#1d1d1b] dark:text-[#F0EAE1] font-courier font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2.5 transition-colors group cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-[#7a4e10] dark:text-[#D4AA50]" />
                    <span>Choose File from My Google Drive</span>
                  </button>
                  <p className="text-[11px] font-courier text-[#4f4b40] dark:text-[#A89F91] text-center">
                    Launches Google&apos;s authenticated picker to ingest files directly into the decision index.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
