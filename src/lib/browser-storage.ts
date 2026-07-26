import { queueCloudAudit, queueCloudWrite } from "@/lib/supabase-cloud";

type IdleCallback = (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void;
type BrowserWindow = Window & {
  requestIdleCallback?: (callback: IdleCallback, options?: { timeout: number }) => number;
};

export const STORAGE_UPDATED_EVENT = "a3-storage-updated";

const pendingWrites = new Map<string, unknown>();
let flushScheduled = false;
let lifecycleHooksInstalled = false;

function notifyStorageUpdated(key: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STORAGE_UPDATED_EVENT, { detail: { key } }));
}

function writeEntry(key: string, value: unknown, immediateCloud = false, auditAction = "autosave"): void {
  try {
    const serialized = JSON.stringify(value);
    window.localStorage.setItem(key, serialized);
    queueCloudAudit(auditAction, key, { bytes: new Blob([serialized]).size });
    queueCloudWrite(key, value, immediateCloud);
  } catch {
    // Storage can be unavailable or full. Keep the UI responsive and allow
    // the caller to continue; a future server-backed store can surface errors.
  }
}

function flushPendingWrites(): void {
  if (typeof window === "undefined") return;
  flushScheduled = false;
  const entries = Array.from(pendingWrites.entries());
  pendingWrites.clear();
  for (const [key, value] of entries) writeEntry(key, value, false, "autosave");
}

function installLifecycleHooks(): void {
  if (lifecycleHooksInstalled || typeof window === "undefined") return;
  lifecycleHooksInstalled = true;
  window.addEventListener("pagehide", flushPendingWrites);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingWrites();
  });
}

function scheduleFlush(): void {
  if (flushScheduled || typeof window === "undefined") return;
  flushScheduled = true;
  installLifecycleHooks();
  const browserWindow = window as BrowserWindow;
  if (browserWindow.requestIdleCallback) {
    browserWindow.requestIdleCallback(() => flushPendingWrites(), { timeout: 500 });
  } else {
    window.setTimeout(flushPendingWrites, 120);
  }
}

export function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  if (pendingWrites.has(key)) return pendingWrites.get(key) as T;
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Coalesces repeated writes and performs JSON serialization off the input event path. */
export function save(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  pendingWrites.set(key, value);
  notifyStorageUpdated(key);
  scheduleFlush();
}

/** Use for explicit Save/Submit actions where persistence must complete immediately. */
export function saveNow(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  pendingWrites.delete(key);
  writeEntry(key, value, true, "save");
  notifyStorageUpdated(key);
}
