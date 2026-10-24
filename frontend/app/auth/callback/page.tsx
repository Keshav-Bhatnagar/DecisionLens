"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, AlertCircle, ArrowRight, Compass } from "lucide-react";
import { authenticateOAuth } from "@/lib/api";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeProviderName, setActiveProviderName] = useState<string>("Identity Provider");

  useEffect(() => {
    // 1. Check URL hash (Supabase OAuth standard web flow returns #access_token=...&token_type=bearer)
    let hashToken: string | null = null;
    let hashError: string | null = null;
    if (typeof window !== "undefined" && window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      hashToken = hashParams.get("access_token");
      hashError = hashParams.get("error_description") || hashParams.get("error");
    }

    if (hashError) {
      setStatus("error");
      setErrorMessage(hashError);
      return;
    }

    // 2. Check query search params (standard code or error)
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");
    const errorDesc = searchParams.get("error_description");
    const stateParam = searchParams.get("state");

    if (errorParam) {
      setStatus("error");
      setErrorMessage(errorDesc || errorParam || "Authentication was denied or cancelled by user.");
      return;
    }

    if (!code && !hashToken) {
      setStatus("error");
      setErrorMessage("No authorization code or session token was returned by the identity provider.");
      return;
    }

    let isMounted = true;

    // Detect provider from query, state, sessionStorage, hash, or code signature
    let provider = searchParams.get("provider") || stateParam;
    if (!provider || !["google", "microsoft", "github", "supabase", "azure"].includes(provider.toLowerCase())) {
      if (typeof window !== "undefined") {
        const stored = sessionStorage.getItem("oauth_provider");
        if (stored && ["google", "microsoft", "github", "supabase", "azure"].includes(stored.toLowerCase())) {
          provider = stored.toLowerCase();
        }
      }
    }

    if (hashToken) {
      provider = "supabase";
    } else if (!provider || !["google", "microsoft", "github", "supabase", "azure"].includes(provider.toLowerCase())) {
      if (code && (code.startsWith("M.") || code.includes(".R3_") || code.length > 400)) {
        provider = "microsoft";
      } else if (code && code.startsWith("4/")) {
        provider = "google";
      } else if (code && code.length === 20) {
        provider = "github";
      } else {
        provider = "supabase";
      }
    }

    const providerName =
      provider === "microsoft" || provider === "azure"
        ? "Microsoft / Azure AD"
        : provider === "github"
        ? "GitHub"
        : provider === "supabase"
        ? "Supabase Identity"
        : "Google Workspace";

    setActiveProviderName(providerName);

    async function completeOAuth() {
      try {
        const redirectUri = window.location.origin + "/auth/callback";
        if (hashToken) {
          await authenticateOAuth({
            provider: "supabase",
            token: hashToken,
            redirect_uri: redirectUri,
          });
        } else {
          await authenticateOAuth({
            provider: provider || "supabase",
            code: code ?? undefined,
            redirect_uri: redirectUri,
          });
        }

        if (isMounted) {
          setStatus("success");
          setTimeout(() => {
            router.replace("/dashboard");
          }, 800);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setStatus("error");
          setErrorMessage(
            err instanceof Error
              ? err.message
              : `Failed to exchange authorization credentials with ${providerName}. Please try signing in again.`
          );
        }
      }
    }

    completeOAuth();

    return () => {
      isMounted = false;
    };
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper-page text-ink p-4 font-sans">
      <div className="max-w-md w-full bg-paper-surface border border-border rounded-sm p-8 shadow-xs space-y-6 text-center">
        {/* Brand header */}
        <div className="flex items-center justify-center gap-2">
          <div className="w-8 h-8 rounded-sm bg-ink text-paper-surface flex items-center justify-center">
            <Compass className="w-4 h-4 text-paper-surface" />
          </div>
          <span className="font-serif text-lg font-bold tracking-tight text-ink">DecisionLens</span>
        </div>

        {status === "processing" && (
          <div className="space-y-4 py-4">
            <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
            <div>
              <h2 className="font-serif text-base font-bold text-ink">Verifying {activeProviderName} Credentials</h2>
              <p className="text-xs text-ink-secondary mt-1">
                Authenticating your account and initializing your DecisionLens dossier...
              </p>
            </div>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4 py-4 animate-in fade-in">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-base font-bold text-ink">Authentication Approved</h2>
              <p className="text-xs text-ink-secondary mt-1">Redirecting to your executive dashboard...</p>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-5 py-2 animate-in fade-in text-left">
            <div className="flex items-start gap-3 p-3.5 bg-red-50/80 border border-red-200 rounded-sm">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-bold text-red-900">OAuth Verification Failed</h3>
                <p className="text-xs text-red-700 mt-0.5 break-words">{errorMessage}</p>
              </div>
            </div>

            <div className="text-center pt-2">
              <Link
                href="/auth"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-ink text-paper-surface text-xs font-semibold rounded-sm hover:opacity-90 transition w-full"
              >
                <span>Return to Sign In</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}

        <div className="text-[11px] text-ink-tertiary pt-2 border-t border-border">
          DecisionLens Institutional Access &middot; Single Sign-On
        </div>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-paper-page text-ink p-4">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
