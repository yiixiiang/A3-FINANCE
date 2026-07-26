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
  lastSyncAt: string;
  pendingWriteCount: number;
  conflictCount: number;
  backupTableReady: boolean;
  backupCount: number;
  latestBackupAt: string;
  auditTableReady: boolean;
  auditCount: number;
  latestAuditAt: string;
};

export type CloudBackupSummary = {
  id: string;
  createdAt: string;
  reason: string;
  keyCount: number;
  deviceId: string;
};

export type CloudAuditEntry = {
  id: string;
  createdAt: string;
  action: string;
  storageKey: string;
  deviceId: string;
  details: Record<string, unknown>;
};

export type CloudConflict = {
  id: string;
  storageKey: string;
  detectedAt: string;
  localUpdatedAt: string;
  cloudUpdatedAt: string;
  resolution: "local" | "cloud" | "cloud-first-sync";
};

export const CLOUD_SYNC_STATE_EVENT = "a3-cloud-sync-state";
export const CLOUD_SYNCED_EVENT = "a3-cloud-storage-hydrated";

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
const SESSION_STORAGE_KEY = "sb-a3-finance-session-v1";
const SYNCABLE_KEY_PREFIX = "a3-";
const STORAGE_UPDATED_EVENT = "a3-storage-updated";
const SYNC_META_KEY = "a3-cloud-sync-meta-v22";
const CONFLICT_HISTORY_KEY = "a3-cloud-conflicts-v22";
const DEVICE_ID_KEY = "a3-cloud-device-v22";
const FIRST_SYNC_BACKUP_KEY = "a3-cloud-first-sync-backup-v22";
const AUDIT_QUEUE_KEY = "a3-cloud-audit-queue-v23";
const APP_VERSION = 23;
const AUTO_SYNC_INTERVAL_MS = 90_000;
const LOCAL_ONLY_KEYS = new Set([
  "a3-user-access",
  SYNC_META_KEY,
  CONFLICT_HISTORY_KEY,
  DEVICE_ID_KEY,
  FIRST_SYNC_BACKUP_KEY,
  AUDIT_QUEUE_KEY,
]);

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

type CloudBackupRow = {
  id: string;
  created_at: string;
  reason: string;
  key_count: number;
  device_id?: string;
  payload?: Record<string, unknown>;
};

type CloudAuditRow = {
  id: string;
  created_at: string;
  action: string;
  storage_key: string;
  device_id?: string;
  details?: Record<string, unknown>;
};

type PendingAuditEvent = {
  created_at: string;
  action: string;
  storage_key: string;
  device_id: string;
  app_version: number;
  details: Record<string, unknown>;
};

type KeySyncMeta = {
  localUpdatedAt?: string;
  cloudUpdatedAt?: string;
  lastSyncedAt?: string;
};

type SyncMetaStore = {
  version: number;
  lastSyncAt: string;
  keys: Record<string, KeySyncMeta>;
};

let activeSession: CloudSession | null = null;
let state: CloudSyncState = SUPABASE_URL && SUPABASE_KEY ? "signed-out" : "disabled";
let lastError = "";
const pendingCloudWrites = new Map<string, unknown>();
let cloudFlushTimer: number | null = null;
let autoSyncRunning = false;

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

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local storage may be full. Cloud operations must remain usable.
  }
}

function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const generated = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(DEVICE_ID_KEY, generated);
  return generated;
}

function readSyncMeta(): SyncMetaStore {
  const value = readJson<SyncMetaStore>(SYNC_META_KEY, { version: APP_VERSION, lastSyncAt: "", keys: {} });
  return value && typeof value === "object" && value.keys
    ? { version: APP_VERSION, lastSyncAt: value.lastSyncAt || "", keys: value.keys || {} }
    : { version: APP_VERSION, lastSyncAt: "", keys: {} };
}

function writeSyncMeta(meta: SyncMetaStore): void {
  writeJson(SYNC_META_KEY, { ...meta, version: APP_VERSION });
}

function markLocalMutation(key: string): void {
  if (!isSyncableKey(key) || typeof window === "undefined") return;
  const meta = readSyncMeta();
  meta.keys[key] = { ...meta.keys[key], localUpdatedAt: new Date().toISOString() };
  writeSyncMeta(meta);
}

function applyCloudValue(key: string, value: unknown, cloudUpdatedAt = ""): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  const now = new Date().toISOString();
  const meta = readSyncMeta();
  meta.keys[key] = {
    ...meta.keys[key],
    cloudUpdatedAt: cloudUpdatedAt || now,
    localUpdatedAt: cloudUpdatedAt || now,
    lastSyncedAt: now,
  };
  meta.lastSyncAt = now;
  writeSyncMeta(meta);
  window.dispatchEvent(new CustomEvent(STORAGE_UPDATED_EVENT, { detail: { key } }));
}

function valuesEqual(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
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

function readConflicts(): CloudConflict[] {
  const conflicts = readJson<CloudConflict[]>(CONFLICT_HISTORY_KEY, []);
  return Array.isArray(conflicts) ? conflicts : [];
}

function recordConflict(storageKey: string, localUpdatedAt: string, cloudUpdatedAt: string, resolution: CloudConflict["resolution"]): void {
  const conflict: CloudConflict = {
    id: `conflict-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    storageKey,
    detectedAt: new Date().toISOString(),
    localUpdatedAt,
    cloudUpdatedAt,
    resolution,
  };
  writeJson(CONFLICT_HISTORY_KEY, [conflict, ...readConflicts()].slice(0, 30));
}

function readAuditQueue(): PendingAuditEvent[] {
  const queue = readJson<PendingAuditEvent[]>(AUDIT_QUEUE_KEY, []);
  return Array.isArray(queue) ? queue.slice(-200) : [];
}

function writeAuditQueue(queue: PendingAuditEvent[]): void {
  writeJson(AUDIT_QUEUE_KEY, queue.slice(-200));
}

export function queueCloudAudit(action: string, storageKey: string, details: Record<string, unknown> = {}): void {
  if (typeof window === "undefined" || !isSyncableKey(storageKey)) return;
  const entry: PendingAuditEvent = {
    created_at: new Date().toISOString(),
    action: action || "save",
    storage_key: storageKey,
    device_id: getDeviceId(),
    app_version: APP_VERSION,
    details,
  };
  writeAuditQueue([...readAuditQueue(), entry]);
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
  if (!session) throw new Error("Cloud session is not available.");
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
  const now = new Date().toISOString();
  const meta = readSyncMeta();
  for (const [key] of entries) {
    meta.keys[key] = { ...meta.keys[key], cloudUpdatedAt: now, localUpdatedAt: now, lastSyncedAt: now };
  }
  meta.lastSyncAt = now;
  writeSyncMeta(meta);
  await flushPendingAuditEvents().catch(() => undefined);
}

async function fetchCloudRows(): Promise<CloudStorageRow[]> {
  const response = await cloudRequest("/rest/v1/a3_app_storage?select=storage_key,value,updated_at&order=updated_at.asc", { method: "GET" });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Cloud load failed (${response.status}).`);
  }
  const rows = (await response.json()) as CloudStorageRow[];
  return Array.isArray(rows) ? rows : [];
}

async function fetchBackupRows(includePayload = false): Promise<{ ready: boolean; rows: CloudBackupRow[] }> {
  const select = includePayload ? "id,created_at,reason,key_count,device_id,payload" : "id,created_at,reason,key_count,device_id";
  const response = await cloudRequest(`/rest/v1/a3_app_backups?select=${select}&order=created_at.desc&limit=20`, { method: "GET" });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 404 || /a3_app_backups|relation .* does not exist/i.test(detail)) return { ready: false, rows: [] };
    throw new Error(detail || `Cloud backup check failed (${response.status}).`);
  }
  const rows = (await response.json()) as CloudBackupRow[];
  return { ready: true, rows: Array.isArray(rows) ? rows : [] };
}

async function fetchAuditRows(limit = 50): Promise<{ ready: boolean; rows: CloudAuditRow[] }> {
  const response = await cloudRequest(`/rest/v1/a3_app_audit?select=id,created_at,action,storage_key,device_id,details&order=created_at.desc&limit=${Math.max(1, Math.min(200, limit))}`, { method: "GET" });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 404 || /a3_app_audit|relation .* does not exist/i.test(detail)) return { ready: false, rows: [] };
    throw new Error(detail || `Cloud audit check failed (${response.status}).`);
  }
  const rows = (await response.json()) as CloudAuditRow[];
  return { ready: true, rows: Array.isArray(rows) ? rows : [] };
}

async function flushPendingAuditEvents(): Promise<void> {
  const queue = readAuditQueue();
  if (!queue.length) return;
  const session = await usableSession();
  if (!session) return;
  const rows = queue.map(item => ({ ...item, user_id: session.user.id }));
  const response = await cloudRequest("/rest/v1/a3_app_audit", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 404 || /a3_app_audit|relation .* does not exist/i.test(detail)) return;
    throw new Error(detail || `Cloud audit save failed (${response.status}).`);
  }
  writeAuditQueue([]);
}

async function createCloudBackupInternal(reason: string, entries = syncableLocalEntries()): Promise<CloudBackupSummary> {
  const session = await usableSession();
  if (!session) throw new Error("Cloud session is not available.");
  const payload = Object.fromEntries(entries);
  const response = await cloudRequest("/rest/v1/a3_app_backups", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: session.user.id,
      reason,
      key_count: entries.length,
      device_id: getDeviceId(),
      app_version: APP_VERSION,
      payload,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 404 || /a3_app_backups|relation .* does not exist/i.test(detail)) {
      throw new Error("Cloud backup table is missing. Run the latest supabase/schema.sql first.");
    }
    throw new Error(detail || `Cloud backup failed (${response.status}).`);
  }
  const rows = (await response.json().catch(() => [])) as CloudBackupRow[];
  const row = rows[0];
  if (!row) throw new Error("Cloud backup was created but no confirmation was returned.");
  await pruneCloudBackups();
  return { id: row.id, createdAt: row.created_at, reason: row.reason, keyCount: row.key_count, deviceId: row.device_id || "" };
}

async function pruneCloudBackups(): Promise<void> {
  const { ready, rows } = await fetchBackupRows(false);
  if (!ready || rows.length <= 10) return;
  const ids = rows.slice(10).map(row => row.id).filter(Boolean);
  if (!ids.length) return;
  const filter = ids.join(",");
  await cloudRequest(`/rest/v1/a3_app_backups?id=in.(${filter})`, { method: "DELETE" }).catch(() => undefined);
}

async function ensureDailyCloudBackup(): Promise<void> {
  try {
    const { ready, rows } = await fetchBackupRows(false);
    if (!ready) return;
    const latest = rows[0]?.created_at ? Date.parse(rows[0].created_at) : 0;
    if (!latest || Date.now() - latest >= 24 * 60 * 60 * 1000) {
      await createCloudBackupInternal("automatic-daily");
    }
  } catch {
    // Daily backups must never block normal saving or sign in.
  }
}

async function safeMergeCloudStorage(): Promise<void> {
  if (!isSupabaseConfigured() || typeof window === "undefined") return;
  const session = await usableSession();
  if (!session) return;

  const localEntries = syncableLocalEntries();
  const localMap = new Map(localEntries);
  const cloudRows = await fetchCloudRows();
  const cloudMap = new Map(cloudRows.map(row => [row.storage_key, row]));
  const meta = readSyncMeta();
  const toUpload: Array<[string, unknown]> = [];

  if (cloudRows.length === 0) {
    await upsertRows(localEntries);
    window.dispatchEvent(new CustomEvent(CLOUD_SYNCED_EVENT));
    return;
  }

  if (!meta.lastSyncAt && localEntries.length && !window.localStorage.getItem(FIRST_SYNC_BACKUP_KEY)) {
    try {
      const backup = await createCloudBackupInternal("pre-first-sync-local", localEntries);
      window.localStorage.setItem(FIRST_SYNC_BACKUP_KEY, backup.id);
    } catch {
      window.localStorage.setItem(FIRST_SYNC_BACKUP_KEY, "unavailable");
    }
  }

  for (const row of cloudRows) {
    const key = row.storage_key;
    const cloudUpdatedAt = row.updated_at || new Date().toISOString();
    if (!localMap.has(key)) {
      applyCloudValue(key, row.value, cloudUpdatedAt);
      continue;
    }

    const localValue = localMap.get(key);
    if (valuesEqual(localValue, row.value)) {
      const now = new Date().toISOString();
      const currentMeta = readSyncMeta();
      currentMeta.keys[key] = { ...currentMeta.keys[key], cloudUpdatedAt, localUpdatedAt: cloudUpdatedAt, lastSyncedAt: now };
      currentMeta.lastSyncAt = now;
      writeSyncMeta(currentMeta);
      continue;
    }

    const keyMeta = meta.keys[key] || {};
    const localUpdatedAt = keyMeta.localUpdatedAt || "";
    const lastSyncedAt = keyMeta.lastSyncedAt || "";
    const localChanged = Boolean(localUpdatedAt && (!lastSyncedAt || Date.parse(localUpdatedAt) > Date.parse(lastSyncedAt)));
    const cloudChanged = Boolean(!lastSyncedAt || Date.parse(cloudUpdatedAt) > Date.parse(lastSyncedAt));

    if (!lastSyncedAt) {
      recordConflict(key, localUpdatedAt, cloudUpdatedAt, "cloud-first-sync");
      applyCloudValue(key, row.value, cloudUpdatedAt);
    } else if (localChanged && cloudChanged) {
      const useLocal = Date.parse(localUpdatedAt) >= Date.parse(cloudUpdatedAt);
      recordConflict(key, localUpdatedAt, cloudUpdatedAt, useLocal ? "local" : "cloud");
      if (useLocal) toUpload.push([key, localValue]);
      else applyCloudValue(key, row.value, cloudUpdatedAt);
    } else if (localChanged) {
      toUpload.push([key, localValue]);
    } else {
      applyCloudValue(key, row.value, cloudUpdatedAt);
    }
  }

  for (const [key, value] of localEntries) {
    if (!cloudMap.has(key)) toUpload.push([key, value]);
  }

  if (toUpload.length) await upsertRows(toUpload);
  const completed = readSyncMeta();
  completed.lastSyncAt = new Date().toISOString();
  writeSyncMeta(completed);
  window.dispatchEvent(new CustomEvent(CLOUD_SYNCED_EVENT));
}

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

export function getCloudSyncSnapshot(): { state: CloudSyncState; error: string; email: string; lastSyncAt: string; pendingWriteCount: number; conflictCount: number } {
  const session = restoreSession();
  return {
    state,
    error: lastError,
    email: session?.user.email || "",
    lastSyncAt: readSyncMeta().lastSyncAt,
    pendingWriteCount: pendingCloudWrites.size,
    conflictCount: readConflicts().length,
  };
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

export function getCloudConflictHistory(): CloudConflict[] {
  return readConflicts();
}

export function clearCloudConflictHistory(): void {
  writeJson(CONFLICT_HISTORY_KEY, []);
  emitState(state, lastError);
}

export async function listCloudBackups(): Promise<{ ready: boolean; backups: CloudBackupSummary[] }> {
  if (!isSupabaseConfigured()) return { ready: false, backups: [] };
  const session = await usableSession();
  if (!session) return { ready: false, backups: [] };
  const { ready, rows } = await fetchBackupRows(false);
  return {
    ready,
    backups: rows.map(row => ({ id: row.id, createdAt: row.created_at, reason: row.reason, keyCount: row.key_count, deviceId: row.device_id || "" })),
  };
}

export async function listCloudAudit(limit = 50): Promise<{ ready: boolean; entries: CloudAuditEntry[] }> {
  if (!isSupabaseConfigured()) return { ready: false, entries: [] };
  const session = await usableSession();
  if (!session) return { ready: false, entries: [] };
  await flushPendingAuditEvents().catch(() => undefined);
  const { ready, rows } = await fetchAuditRows(limit);
  return {
    ready,
    entries: rows.map(row => ({
      id: row.id,
      createdAt: row.created_at,
      action: row.action,
      storageKey: row.storage_key,
      deviceId: row.device_id || "",
      details: row.details || {},
    })),
  };
}

export async function clearCloudAuditHistory(): Promise<void> {
  const response = await cloudRequest("/rest/v1/a3_app_audit", { method: "DELETE" });
  if (!response.ok) throw new Error((await response.text().catch(() => "")) || "Cloud audit history could not be cleared.");
}

export async function verifyCloudConnection(): Promise<CloudDiagnostics> {
  const inventory = getLocalCloudInventory();
  const configured = isSupabaseConfigured();
  const session = configured ? await usableSession() : null;
  const base = {
    localKeyCount: inventory.keyCount,
    localBytes: inventory.bytes,
    checkedAt: new Date().toISOString(),
    lastSyncAt: readSyncMeta().lastSyncAt,
    pendingWriteCount: pendingCloudWrites.size,
    conflictCount: readConflicts().length,
  };
  if (!configured) {
    emitState("disabled");
    return { configured: false, signedIn: false, email: "", cloudKeyCount: 0, backupTableReady: false, backupCount: 0, latestBackupAt: "", auditTableReady: false, auditCount: 0, latestAuditAt: "", ...base };
  }
  if (!session) {
    emitState("signed-out", "Cloud session is not available. Sign out and sign in again to reconnect.");
    return { configured: true, signedIn: false, email: "", cloudKeyCount: 0, backupTableReady: false, backupCount: 0, latestBackupAt: "", auditTableReady: false, auditCount: 0, latestAuditAt: "", ...base };
  }
  emitState("connecting");
  try {
    await flushPendingAuditEvents().catch(() => undefined);
    const [rows, backupResult, auditResult] = await Promise.all([fetchCloudRows(), fetchBackupRows(false), fetchAuditRows(50)]);
    emitState("connected");
    return {
      configured: true,
      signedIn: true,
      email: session.user.email || "",
      cloudKeyCount: rows.length,
      backupTableReady: backupResult.ready,
      backupCount: backupResult.rows.length,
      latestBackupAt: backupResult.rows[0]?.created_at || "",
      auditTableReady: auditResult.ready,
      auditCount: auditResult.rows.length,
      latestAuditAt: auditResult.rows[0]?.created_at || "",
      ...base,
      lastSyncAt: readSyncMeta().lastSyncAt,
      pendingWriteCount: pendingCloudWrites.size,
      conflictCount: readConflicts().length,
    };
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
    await safeMergeCloudStorage();
    await ensureDailyCloudBackup();
    await flushPendingAuditEvents().catch(() => undefined);
    emitState("connected");
    return { ok: true, message: created ? "Cloud account created and connected." : "Supabase connected.", created };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to connect to Supabase.";
    emitState("error", message);
    return { ok: false, message };
  }
}

export async function hydrateCloudStorage(): Promise<void> {
  await safeMergeCloudStorage();
}

export async function flushPendingCloudWrites(): Promise<void> {
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
    throw error;
  }
}

export function queueCloudWrite(key: string, value: unknown, immediate = false): void {
  if (!isSyncableKey(key) || typeof window === "undefined") return;
  markLocalMutation(key);
  if (!isSupabaseConfigured() || !restoreSession()) return;
  pendingCloudWrites.set(key, value);
  emitState("syncing");
  if (cloudFlushTimer !== null) window.clearTimeout(cloudFlushTimer);
  if (immediate) {
    void flushPendingCloudWrites().catch(() => undefined);
    return;
  }
  cloudFlushTimer = window.setTimeout(() => void flushPendingCloudWrites().catch(() => undefined), 450);
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
    await safeMergeCloudStorage();
    await ensureDailyCloudBackup();
    await flushPendingAuditEvents().catch(() => undefined);
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
  await flushPendingCloudWrites().catch(() => undefined);
  const entries = syncableLocalEntries();
  await upsertRows(entries);
  await createCloudBackupInternal("manual-upload").catch(() => undefined);
  emitState("connected");
  return verifyCloudConnection();
}

export async function restoreAllCloudDataToLocal(): Promise<CloudDiagnostics> {
  if (!isSupabaseConfigured()) throw new Error("Cloud sync is not configured.");
  const session = await usableSession();
  if (!session) throw new Error("Cloud session is not available. Sign out and sign in again.");
  emitState("syncing");
  const rows = await fetchCloudRows();
  for (const row of rows) applyCloudValue(row.storage_key, row.value, row.updated_at || "");
  window.dispatchEvent(new CustomEvent(CLOUD_SYNCED_EVENT));
  emitState("connected");
  return verifyCloudConnection();
}

export async function synchronizeCloudNow(): Promise<CloudDiagnostics> {
  emitState("syncing");
  await flushPendingCloudWrites().catch(() => undefined);
  await safeMergeCloudStorage();
  await ensureDailyCloudBackup();
  await flushPendingAuditEvents().catch(() => undefined);
  emitState("connected");
  return verifyCloudConnection();
}

export async function createCloudBackup(reason = "manual"): Promise<CloudBackupSummary> {
  emitState("syncing");
  await flushPendingCloudWrites().catch(() => undefined);
  const backup = await createCloudBackupInternal(reason);
  emitState("connected");
  return backup;
}

export async function restoreCloudBackup(backupId: string): Promise<CloudDiagnostics> {
  if (!backupId) throw new Error("Select a backup to restore.");
  emitState("syncing");
  const response = await cloudRequest(`/rest/v1/a3_app_backups?id=eq.${encodeURIComponent(backupId)}&select=id,payload&limit=1`, { method: "GET" });
  if (!response.ok) throw new Error((await response.text().catch(() => "")) || "Cloud backup could not be loaded.");
  const rows = (await response.json()) as Array<{ id: string; payload?: Record<string, unknown> }>;
  const payload = rows[0]?.payload;
  if (!payload || typeof payload !== "object") throw new Error("This backup does not contain restorable records.");
  const entries = Object.entries(payload).filter(([key]) => isSyncableKey(key));
  for (const [key, value] of entries) {
    window.localStorage.setItem(key, JSON.stringify(value));
    markLocalMutation(key);
    window.dispatchEvent(new CustomEvent(STORAGE_UPDATED_EVENT, { detail: { key } }));
  }
  await upsertRows(entries);
  window.dispatchEvent(new CustomEvent(CLOUD_SYNCED_EVENT));
  emitState("connected");
  return verifyCloudConnection();
}

export function downloadLocalDataBackup(): void {
  if (typeof window === "undefined") return;
  const storage = Object.fromEntries(syncableLocalEntries());
  const backup = {
    application: "A3 Finance",
    version: APP_VERSION,
    deviceId: getDeviceId(),
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

export async function importLocalDataBackup(file: File): Promise<number> {
  const text = await file.text();
  const parsed = JSON.parse(text) as { application?: string; storage?: Record<string, unknown> };
  if (parsed.application !== "A3 Finance" || !parsed.storage || typeof parsed.storage !== "object") {
    throw new Error("This file is not a valid A3 Finance backup.");
  }
  const entries = Object.entries(parsed.storage).filter(([key]) => isSyncableKey(key));
  for (const [key, value] of entries) {
    window.localStorage.setItem(key, JSON.stringify(value));
    markLocalMutation(key);
    window.dispatchEvent(new CustomEvent(STORAGE_UPDATED_EVENT, { detail: { key } }));
  }
  window.dispatchEvent(new CustomEvent(CLOUD_SYNCED_EVENT));
  return entries.length;
}

export function startCloudAutoSync(intervalMs = AUTO_SYNC_INTERVAL_MS): () => void {
  if (typeof window === "undefined") return () => undefined;
  let stopped = false;
  const run = async () => {
    if (stopped || autoSyncRunning || document.visibilityState === "hidden" || !navigator.onLine || !restoreSession()) return;
    autoSyncRunning = true;
    try {
      await synchronizeCloudNow();
    } catch {
      // State is already surfaced by the cloud status indicator.
    } finally {
      autoSyncRunning = false;
    }
  };
  const onOnline = () => void run();
  const onFocus = () => void run();
  const onVisibility = () => { if (document.visibilityState === "visible") void run(); };
  const onPageHide = () => { void flushPendingCloudWrites().catch(() => undefined); };
  const timer = window.setInterval(() => void run(), Math.max(30_000, intervalMs));
  window.addEventListener("online", onOnline);
  window.addEventListener("focus", onFocus);
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    stopped = true;
    window.clearInterval(timer);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", onFocus);
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

export async function signOutCloud(): Promise<void> {
  await flushPendingCloudWrites().catch(() => undefined);
  await flushPendingAuditEvents().catch(() => undefined);
  const session = await usableSession();
  if (session) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: "POST", headers: authHeaders(session.access_token) }).catch(() => undefined);
  }
  persistSession(null);
  emitState("signed-out");
}
