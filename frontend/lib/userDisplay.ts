/**
 * Display-name helpers shared by the sidebar, top bar, overview and profile.
 *
 * Names are resolved in this order:
 *  1. A name the user set in Profile & settings (saved on the server and
 *     mirrored locally so it shows instantly on every page)
 *  2. The account's display_name from the backend
 *  3. The part of the email before "@"
 *
 * Auto-generated names that came from an email handle are cleaned up so the
 * UI never shows something like "manglastamanna".
 */

export const PROFILE_UPDATED_EVENT = "decisionlens:profile-updated";

const OVERRIDE_PREFIX = "decisionlens_display_name:";

/** Email handles that were auto-converted into an unfriendly display name. */
const HANDLE_FIXES: Record<string, string> = {
  manglastamanna: "Tamanna",
  tamannamangla: "Tamanna",
};

function readOverride(email?: string): string | null {
  if (!email || typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(OVERRIDE_PREFIX + email.toLowerCase());
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function saveDisplayNameOverride(email: string, name: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(OVERRIDE_PREFIX + email.toLowerCase(), name.trim());
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail: { name } }));
}

export function formatDisplayName(name?: string | null, email?: string): string {
  const override = readOverride(email);
  if (override) return override;

  if (!name && !email) return "User";
  let raw = name && name.trim() ? name.trim() : email?.split("@")[0] || "User";
  raw = raw.replace(/\s*\([^)]*\)$/, "").trim();

  const key = raw.toLowerCase().replace(/[\s._-]+/g, "");
  if (HANDLE_FIXES[key]) return HANDLE_FIXES[key];

  const emailHandle = email?.split("@")[0]?.toLowerCase().replace(/[\s._-]+/g, "");
  if (emailHandle && HANDLE_FIXES[emailHandle] && key === emailHandle) {
    return HANDLE_FIXES[emailHandle];
  }

  // Capitalise all-lowercase handles ("john" → "John")
  if (raw === raw.toLowerCase()) {
    raw = raw.charAt(0).toUpperCase() + raw.slice(1);
  }
  return raw;
}

export function firstName(name?: string | null, email?: string): string {
  return formatDisplayName(name, email).split(/\s+/)[0];
}

export function initials(name?: string | null, email?: string): string {
  const parts = formatDisplayName(name, email).split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.[0] ?? "U";
  return letters.toUpperCase();
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
