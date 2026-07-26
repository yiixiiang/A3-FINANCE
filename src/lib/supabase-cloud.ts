"use client";

export type CloudSyncState = "disabled" | "signed-out" | "connecting" | "syncing" | "connected" | "error";

export type CloudDiagnostics = {
  configured: boolean;
  signedIn: boolean;
  email: string;
  localKeyCount: number;
  cloudKeyCount: number;
  localBytes: number;
  checkedAt: string;
};

export const CLOUD_SYNC_STATE_EVENT = "a3-cloud-sync-state";
export const CLOUD_SYNCED_EVENT = "a3-cloud-storage-hydrated";

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
const SESSION_STORAGE_KEY = "sb-a3-finance-session-v1";
const SYNCABLE_KEY_PREFIX = "a3-";
const STORAGE_UPDATED_EVENT = "a3-storage-updated";
const LOCAL_ONLY_KEYS = new Set(["a3-user-access"]);

function isSyncableKey(key: string): boolean {
  return key.startsWith(SYNCABLE_KEY_PREFIX) && !LOCAL_ONLY_KEYS.has(key);
}

type CloudSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string; email?: string };
};

type AuthResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id: string; email?: string };
  msg?: string;
  message?: string;
  error_description?: string;
};

type CloudStorageRow = {
  storage_key: string;
  value: unknown;
  updated_at?: string;
};

let activeSession: CloudSession | null = null;
let state: CloudSyncState = SUPABASE_URL && SUPABASE_KEY ? "signed-out" : "disabled";
let lastError = "";
const pendingCloudWrites = new Map<string, unknown>();
let cloudFlushTimer: number | null = null;

function emitState(next: CloudSyncState, error = ""): void {
  state = next;
  lastError = error;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CLOUD_SYNC_STATE_EVENT, { detail: { state, error } }));
  }
}

function authHeaders(token?: string): Record<string, string> {
  return {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function persistSession(session: CloudSession | null): void {
  activeSession = session;
  if (typeof window === "undefined") return;
  if (session) window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

function normalizeSession(payload: AuthResponse): CloudSession | null {
  if (!payload.access_token || !payload.refresh_token || !payload.user?.id) return null;
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + Math.max(30, Number(payload.expires_in || 3600)),
    user: payload.user,
  };
}

function restoreSession(): CloudSession | null {
  if (activeSession) return activeSession;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CloudSession;
    if (!parsed.access_token || !parsed.refresh_token || !parsed.user?.id) return null;
    activeSession = parsed;
    return parsed;
  } catch {
    return null;
  }
}

async function refreshSession(session: CloudSession): Promise<CloudSession | null> {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    const payload = (await response.json().catch(() => ({}))) as AuthResponse;
    if (!response.ok) return null;
    const refreshed = normalizeSession(payload);
    persistSession(refreshed);
    return refreshed;
  } catch {
    return null;
  }
}

async function usableSession(): Promise<CloudSession | null> {
  const session = restoreSession();
  if (!session) return null;
  if (session.expires_at - Math.floor(Date.now() / 1000) > 60) return session;
  return refreshSession(session);
}

function syncableLocalEntries(): Array<[string, unknown]> {
  if (typeof window === "undefined") return [];
  const entries: Array<[string, unknown]> = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index) || "";
    if (!isSyncableKey(key)) continue;
    try {
      entries.push([key, JSON.parse(window.localStorage.getItem(key) || "null")]);
    } catch {
      // Ignore malformed legacy values rather than breaking the complete sync.
    }
  }
  return entries;
}

async function cloudRequest(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const session = await usableSession();
  if (!session) throw new Error("Cloud session is not available.");
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      ...authHeaders(session.access_token),
      ...(init.headers || {}),
    },
  });
  if (response.status === 401 && retry) {
    const refreshed = await refreshSession(session);
    if (refreshed) return cloudRequest(path, init, false);
  }
  return response;
}

async function upsertRows(entries: Array<[string, unknown]>): Promise<void> {
  if (!entries.length) return;
  const session = await usableSession();
  if (!session) return;
  const rows = entries.map(([storage_key, value]) => ({ user_id: session.user.id, storage_key, value }));
  const response = await cloudRequest("/rest/v1/a3_app_storage?on_conflict=user_id,storage_key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Cloud save failed (${response.status}).`);
  }
}

async function fetchCloudRows(): Promise<CloudStorageRow[]> {
  const response = await cloudRequest("/rest/v1/a3_app_storage?select=storage_key,value,updated_at&order=updated_at.asc", {
    method: "GET",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Cloud load failed (${response.status}).`);
  }
  const rows = (await response.json()) as CloudStorageRow[];
  return Array.isArray(rows) ? rows : [];
}

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

export function getCloudSyncSnapshot(): { state: CloudSyncState; error: string; email: string } {
  const session = restoreSession();
  return { state, error: lastError, email: session?.user.email || "" };
}

export function getLocalCloudInventory(): { keyCount: number; bytes: number } {
  if (typeof window === "undefined") return { keyCount: 0, bytes: 0 };
  let bytes = 0;
  let keyCount = 0;
  for (const [key, value] of syncableLocalEntries()) {
    keyCount += 1;
    bytes += new Blob([key, JSON.stringify(value)]).size;
  }
  return { keyCount, bytes };
}

export async function verifyCloudConnection(): Promise<CloudDiagnostics> {
  const inventory = getLocalCloudInventory();
  const configured = isSupabaseConfigured();
  const session = configured ? await usableSession() : null;
  if (!configured) {
    emitState("disabled");
    return { configured: false, signedIn: false, email: "", localKeyCount: inventory.keyCount, cloudKeyCount: 0, localBytes: inventory.bytes, checkedAt: new Date().toISOString() };
  }
  if (!session) {
    emitState("signed-out", "Cloud session is not available. Sign out and sign in again to reconnect.");
    return { configured: true, signedIn: false, email: "", localKeyCount: inventory.keyCount, cloudKeyCount: 0, localBytes: inventory.bytes, checkedAt: new Date().toISOString() };
  }
  emitState("connecting");
  try {
    const rows = await fetchCloudRows();
    emitState("connected");
    return { configured: true, signedIn: true, email: session.user.email || "", localKeyCount: inventory.keyCount, cloudKeyCount: rows.length, localBytes: inventory.bytes, checkedAt: new Date().toISOString() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cloud verification failed.";
    emitState("error", message);
    throw error;
  }
}

export async function signInAndHydrateCloud(email: string, password: string): Promise<{ ok: boolean; message: string; created?: boolean }> {
  if (!isSupabaseConfigured()) return { ok: true, message: "Cloud sync is not configured." };
  if (!email.includes("@")) return { ok: false, message: "This user needs a valid email address before Supabase can connect." };
  emitState("connecting");
  try {
    let response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email, password }),
    });
    let payload = (await response.json().catch(() => ({}))) as AuthResponse;
    let created = false;

    if (!response.ok) {
      response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email, password, data: { application: "A3 Finance" } }),
      });
      payload = (await response.json().catch(() => ({}))) as AuthResponse;
      if (!response.ok) {
        const reason = payload.error_description || payload.msg || payload.message || "Supabase sign-in failed.";
        emitState("error", reason);
        return { ok: false, message: reason };
      }
      created = true;
    }

    const session = normalizeSession(payload);
    if (!session) {
      const message = created
        ? "Cloud account created. Confirm the Supabase email, then sign in again."
        : "Supabase did not return a session. Check the Auth email-confirmation setting.";
      emitState("signed-out", message);
      return { ok: false, message };
    }

    persistSession(session);
    emitState("syncing");
    await hydrateCloudStorage();
    emitState("connected");
    return { ok: true, message: created ? "Cloud account created and connected." : "Supabase connected.", created };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to connect to Supabase.";
    emitState("error", message);
    return { ok: false, message };
  }
}

export async function hydrateCloudStorage(): Promise<void> {
  if (!isSupabaseConfigured() || typeof window === "undefined") return;
  const session = await usableSession();
  if (!session) return;
  const localEntries = syncableLocalEntries();
  const cloudRows = await fetchCloudRows();
  const cloudKeys = new Set(cloudRows.map(row => row.storage_key));

  if (cloudRows.length === 0) {
    await upsertRows(localEntries);
  } else {
    for (const row of cloudRows) {
      window.localStorage.setItem(row.storage_key, JSON.stringify(row.value));
      window.dispatchEvent(new CustomEvent(STORAGE_UPDATED_EVENT, { detail: { key: row.storage_key } }));
    }
    const localOnly = localEntries.filter(([key]) => !cloudKeys.has(key));
    await upsertRows(localOnly);
  }
  window.dispatchEvent(new CustomEvent(CLOUD_SYNCED_EVENT));
}

async function flushCloudWrites(): Promise<void> {
  cloudFlushTimer = null;
  if (!pendingCloudWrites.size) return;
  const entries = Array.from(pendingCloudWrites.entries());
  pendingCloudWrites.clear();
  try {
    await upsertRows(entries);
    emitState("connected");
  } catch (error) {
    entries.forEach(([key, value]) => pendingCloudWrites.set(key, value));
    const message = error instanceof Error ? error.message : "Cloud save failed.";
    emitState("error", message);
  }
}

export function queueCloudWrite(key: string, value: unknown, immediate = false): void {
  if (!isSyncableKey(key) || !isSupabaseConfigured() || typeof window === "undefined") return;
  if (!restoreSession()) return;
  pendingCloudWrites.set(key, value);
  if (cloudFlushTimer !== null) window.clearTimeout(cloudFlushTimer);
  if (immediate) {
    void flushCloudWrites();
    return;
  }
  cloudFlushTimer = window.setTimeout(() => void flushCloudWrites(), 450);
}


export async function resumeCloudSession(): Promise<{ ok: boolean; message: string }> {
  if (!isSupabaseConfigured()) {
    emitState("disabled");
    return { ok: false, message: "Cloud sync is not configured." };
  }
  const session = await usableSession();
  if (!session) {
    emitState("signed-out");
    return { ok: false, message: "Cloud session is not available." };
  }
  emitState("syncing");
  try {
    await hydrateCloudStorage();
    emitState("connected");
    return { ok: true, message: "Cloud session restored and synchronized." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cloud session could not be restored.";
    emitState("error", message);
    return { ok: false, message };
  }
}

export async function uploadAllLocalDataToCloud(): Promise<CloudDiagnostics> {
  if (!isSupabaseConfigured()) throw new Error("Cloud sync is not configured.");
  const session = await usableSession();
  if (!session) throw new Error("Cloud session is not available. Sign out and sign in again.");
  emitState("syncing");
  const entries = syncableLocalEntries();
  await upsertRows(entries);
  emitState("connected");
  return verifyCloudConnection();
}

export async function restoreAllCloudDataToLocal(): Promise<CloudDiagnostics> {
  if (!isSupabaseConfigured()) throw new Error("Cloud sync is not configured.");
  const session = await usableSession();
  if (!session) throw new Error("Cloud session is not available. Sign out and sign in again.");
  emitState("syncing");
  const rows = await fetchCloudRows();
  for (const row of rows) {
    window.localStorage.setItem(row.storage_key, JSON.stringify(row.value));
    window.dispatchEvent(new CustomEvent(STORAGE_UPDATED_EVENT, { detail: { key: row.storage_key } }));
  }
  window.dispatchEvent(new CustomEvent(CLOUD_SYNCED_EVENT));
  emitState("connected");
  return verifyCloudConnection();
}

export async function synchronizeCloudNow(): Promise<CloudDiagnostics> {
  emitState("syncing");
  await hydrateCloudStorage();
  emitState("connected");
  return verifyCloudConnection();
}

export function downloadLocalDataBackup(): void {
  if (typeof window === "undefined") return;
  const storage = Object.fromEntries(syncableLocalEntries());
  const backup = {
    application: "A3 Finance",
    version: 21,
    exportedAt: new Date().toISOString(),
    storage,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `A3-Finance-Backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function signOutCloud(): Promise<void> {
  const session = await usableSession();
  if (session) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: "POST", headers: authHeaders(session.access_token) }).catch(() => undefined);
  }
  persistSession(null);
  emitState("signed-out");
}
