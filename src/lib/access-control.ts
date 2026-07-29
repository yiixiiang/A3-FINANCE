export type AccessRole = "ADMIN" | "COMPANY_ADMIN" | "DRIVER";
export type AccessScope = "ALL_INFORMATION" | "SELECTED_COMPANY" | "SELECTED_MODULES" | "OWN_RECORDS";

export type UserAccessRecord = {
  id: string;
  username: string;
  name: string;
  email: string;
  password: string;
  role: AccessRole;
  accessScope: AccessScope;
  companyId: string;
  driverId: string;
  visibleModules: string[];
  permissionRevision?: number;
  status: "Active" | "Suspended";
};

export type AccessModule = {
  id: string;
  label: string;
  roles: AccessRole[];
};

export const USER_ACCESS_STORAGE_KEY = "a3-user-access";
export const USER_ACCESS_UPDATED_EVENT = "a3-user-access-updated";
export const LOGIN_SESSION_KEY = "a3-login-session-v1";
export const MINIMUM_PASSWORD_LENGTH = 6;
export const DEFAULT_ADMIN_USERNAME = "admin";
export const DEFAULT_ADMIN_PASSWORD = "admin123";
export const CURRENT_PERMISSION_REVISION = 7;

export const ACCESS_MODULES: AccessModule[] = [
  { id: "overview", label: "Executive Overview", roles: ["ADMIN", "COMPANY_ADMIN", "DRIVER"] },
  { id: "bookingmanagement", label: "Booking Management", roles: ["ADMIN", "COMPANY_ADMIN"] },
  { id: "payout", label: "Driver Report Payout", roles: ["ADMIN", "COMPANY_ADMIN", "DRIVER"] },
  { id: "rebate", label: "Driver 10% Rebate", roles: ["ADMIN", "COMPANY_ADMIN", "DRIVER"] },
  { id: "network", label: "Driver Network", roles: ["ADMIN", "COMPANY_ADMIN", "DRIVER"] },
  { id: "driverclaims", label: "Driver Claims", roles: ["ADMIN", "COMPANY_ADMIN", "DRIVER"] },
  { id: "ratemanagement", label: "Limousine Management", roles: ["ADMIN", "COMPANY_ADMIN"] },
  { id: "clientsetup", label: "Client Management", roles: ["ADMIN", "COMPANY_ADMIN"] },
  { id: "drivers", label: "Driver Management", roles: ["ADMIN", "COMPANY_ADMIN"] },
  { id: "catalogue", label: "Website Catalogue", roles: ["ADMIN", "COMPANY_ADMIN"] },
  { id: "company", label: "Company Management", roles: ["ADMIN", "COMPANY_ADMIN"] },
  { id: "cloud", label: "Cloud & Backup", roles: ["ADMIN"] },
  { id: "income", label: "Income", roles: ["ADMIN", "COMPANY_ADMIN"] },
  { id: "expenses", label: "Expense", roles: ["ADMIN", "COMPANY_ADMIN"] },
  { id: "platform", label: "Platform Earning", roles: ["ADMIN", "COMPANY_ADMIN"] },
  { id: "invoice", label: "Invoice", roles: ["ADMIN", "COMPANY_ADMIN"] },
  { id: "quotation", label: "Quotation", roles: ["ADMIN", "COMPANY_ADMIN"] },
  { id: "reports", label: "Profit & Loss", roles: ["ADMIN", "COMPANY_ADMIN"] },
  { id: "balancesheet", label: "Balance Sheet", roles: ["ADMIN", "COMPANY_ADMIN"] },
  { id: "access", label: "User Access", roles: ["ADMIN"] },
];

const moduleById = new Map(ACCESS_MODULES.map(module => [module.id, module]));

const legacyModuleAliases: Record<string, string[]> = {
  Booking: ["bookingmanagement"],
  "Website Limousine Bookings": ["bookingmanagement"],
  "Website Sakura Table Bookings": ["bookingmanagement"],
  "Driver Reports": ["payout", "rebate", "network", "driverclaims", "drivers"],
  "Driver Claims": ["driverclaims"],
  Rates: ["ratemanagement"],
  "Client Setup": ["clientsetup"],
  "Client Management": ["clientsetup"],
  Client: ["clientsetup"],
  Clients: ["clientsetup"],
  Income: ["income", "reports", "platform"],
  "Income Records": ["income"],
  Expense: ["expenses"],
  "Expenses & Receipts": ["expenses"],
  "Expenses & Receipt Upload": ["expenses"],
  "Platform Earnings": ["platform"],
  "Platform Earning": ["platform"],
  Invoice: ["invoice"],
  "Invoice · EN / 中文 A4": ["invoice"],
  Quotation: ["quotation"],
  "Quotation · EN / 中文 A4": ["quotation"],
  "GST Reports": ["reports"],
  "Income / Expense / P&L": ["reports"],
  "Profit & Loss": ["reports"],
  "Balance Sheet": ["balancesheet"],
  "Company Management": ["company"],
  "Cloud & Backup": ["cloud"],
  Cloud: ["cloud"],
  "User Access": ["access"],
  "User Management": ["access"],
  Access: ["access"],
};

export const DEFAULT_ADMIN_USER: UserAccessRecord = {
  id: "USR-001",
  username: DEFAULT_ADMIN_USERNAME,
  name: "A3 Administrator",
  email: "admin@a3group.sg",
  password: DEFAULT_ADMIN_PASSWORD,
  role: "ADMIN",
  accessScope: "ALL_INFORMATION",
  companyId: "",
  driverId: "",
  visibleModules: ACCESS_MODULES.map(module => module.id),
  permissionRevision: CURRENT_PERMISSION_REVISION,
  status: "Active",
};

export function defaultAccessScope(role: AccessRole): AccessScope {
  return role === "ADMIN" ? "ALL_INFORMATION" : role === "COMPANY_ADMIN" ? "SELECTED_COMPANY" : "OWN_RECORDS";
}

export function roleLabel(role: AccessRole): string {
  return role === "COMPANY_ADMIN" ? "Company Admin" : role === "ADMIN" ? "Admin" : "Driver";
}

export function accessScopeLabel(scope: AccessScope): string {
  return {
    ALL_INFORMATION: "All Information",
    SELECTED_COMPANY: "Selected Company Only",
    SELECTED_MODULES: "Selected Modules Only",
    OWN_RECORDS: "Own Records Only",
  }[scope];
}

export function grantableModules(role: AccessRole): AccessModule[] {
  return ACCESS_MODULES.filter(module => module.roles.includes(role));
}

export function defaultModuleIdsForRole(role: AccessRole): string[] {
  return grantableModules(role).map(module => module.id);
}

export function normalizeVisibleModuleIds(value: unknown, role: AccessRole): string[] {
  const raw = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  const expanded = raw.flatMap(item => {
    if (moduleById.has(item)) return [item];
    const exactLabel = ACCESS_MODULES.find(module => module.label === item);
    if (exactLabel) return [exactLabel.id];
    return legacyModuleAliases[item] ?? [];
  });
  const grantable = new Set(defaultModuleIdsForRole(role));
  return [...new Set(expanded)].filter(id => grantable.has(id));
}

function usernameFrom(value: Partial<UserAccessRecord>): string {
  if (typeof value.username === "string" && value.username.trim()) return value.username.trim().toLowerCase();
  if (typeof value.email === "string" && value.email.includes("@")) return value.email.split("@")[0].trim().toLowerCase();
  if (typeof value.name === "string" && value.name.trim()) return value.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") || "user";
  return "user";
}

export function normalizeUserRecord(value: Partial<Omit<UserAccessRecord, "role">> & { role?: string }): UserAccessRecord {
  const role: AccessRole = value.role === "OPERATIONS" ? "COMPANY_ADMIN" : value.role === "DRIVER" ? "DRIVER" : value.role === "COMPANY_ADMIN" ? "COMPANY_ADMIN" : "ADMIN";
  const accessScope: AccessScope = ["ALL_INFORMATION", "SELECTED_COMPANY", "SELECTED_MODULES", "OWN_RECORDS"].includes(String(value.accessScope))
    ? value.accessScope as AccessScope
    : defaultAccessScope(role);
  const hasExplicitModuleSelection = Array.isArray(value.visibleModules);
  const normalizedModules = normalizeVisibleModuleIds(value.visibleModules, role);
  const storedPermissionRevision = Number(value.permissionRevision) || 0;
  const isExistingRecord = typeof value.id === "string" && Boolean(value.id);
  const migrationModules: Record<AccessRole, string[]> = {
    ADMIN: ["clientsetup", "income", "access", "driverclaims", "balancesheet", "cloud"],
    COMPANY_ADMIN: ["clientsetup", "income", "driverclaims", "balancesheet"],
    DRIVER: ["driverclaims"],
  };
  const migratedModules = isExistingRecord && storedPermissionRevision < CURRENT_PERMISSION_REVISION
    ? [...new Set([...normalizedModules, ...migrationModules[role]])]
    : normalizedModules;
  const visibleModules = hasExplicitModuleSelection
    ? migratedModules
    : accessScope === "OWN_RECORDS"
      ? defaultModuleIdsForRole("DRIVER")
      : defaultModuleIdsForRole(role);
  const id = typeof value.id === "string" && value.id ? value.id : "USR-001";
  const email = typeof value.email === "string" ? value.email.trim() : "";
  const legacyAdmin = id === DEFAULT_ADMIN_USER.id || email.toLowerCase() === DEFAULT_ADMIN_USER.email;
  const suppliedPassword = typeof value.password === "string" ? value.password : "";

  return {
    id,
    username: legacyAdmin && !value.username ? DEFAULT_ADMIN_USERNAME : usernameFrom(value as Partial<UserAccessRecord>),
    name: typeof value.name === "string" && value.name ? value.name : "User",
    email,
    password: legacyAdmin && !suppliedPassword ? DEFAULT_ADMIN_PASSWORD : suppliedPassword,
    role,
    accessScope,
    companyId: typeof value.companyId === "string" ? value.companyId : "",
    driverId: typeof value.driverId === "string" ? value.driverId : "",
    visibleModules,
    permissionRevision: CURRENT_PERMISSION_REVISION,
    status: value.status === "Suspended" ? "Suspended" : "Active",
  };
}

export function normalizeUserRecords(value: unknown): UserAccessRecord[] {
  const normalized = !Array.isArray(value) || value.length === 0
    ? [{ ...DEFAULT_ADMIN_USER, visibleModules: [...DEFAULT_ADMIN_USER.visibleModules] }]
    : value.map(item => normalizeUserRecord((item ?? {}) as Partial<UserAccessRecord>));

  // Older upgrades could create a duplicate administrator such as
  // `USR-001 / admin-2` when two legacy admin records normalized to the same
  // username. Keep one canonical primary administrator and remove the
  // duplicate without touching company or financial records.
  const usernameAdminIndex = normalized.findIndex(record => record.username === DEFAULT_ADMIN_USERNAME);
  const fallbackAdminIndex = normalized.findIndex(record => record.id === DEFAULT_ADMIN_USER.id || record.email.toLowerCase() === DEFAULT_ADMIN_USER.email);
  const selectedAdminIndex = usernameAdminIndex >= 0 ? usernameAdminIndex : fallbackAdminIndex;
  const selectedAdmin = selectedAdminIndex >= 0 ? normalized[selectedAdminIndex] : DEFAULT_ADMIN_USER;
  const canonicalAdmin: UserAccessRecord = {
    ...selectedAdmin,
    id: DEFAULT_ADMIN_USER.id,
    username: DEFAULT_ADMIN_USERNAME,
    email: DEFAULT_ADMIN_USER.email,
    password: selectedAdmin.password || DEFAULT_ADMIN_PASSWORD,
    role: "ADMIN",
    accessScope: "ALL_INFORMATION",
    visibleModules: [...DEFAULT_ADMIN_USER.visibleModules],
    permissionRevision: CURRENT_PERMISSION_REVISION,
    status: "Active",
  };

  const withoutDuplicatePrimaryAdmins = normalized.filter((record, index) => {
    if (index === selectedAdminIndex) return false;
    const duplicateId = record.id === DEFAULT_ADMIN_USER.id;
    const duplicateGeneratedUsername = /^admin-\d+$/i.test(record.username);
    const duplicatePrimaryEmail = record.email.toLowerCase() === DEFAULT_ADMIN_USER.email;
    return !(duplicateId || duplicateGeneratedUsername || duplicatePrimaryEmail);
  });

  const raw = [canonicalAdmin, ...withoutDuplicatePrimaryAdmins];
  const used = new Set<string>();
  return raw.map((record, index) => {
    const base = record.username || `user${index + 1}`;
    let username = base;
    let suffix = 2;
    while (used.has(username)) username = `${base}-${suffix++}`;
    used.add(username);
    return { ...record, username };
  });
}

export function visibleModuleIdsForUser(user: UserAccessRecord): Set<string> {
  if (user.status === "Suspended") return new Set();
  return new Set(normalizeVisibleModuleIds(user.visibleModules, user.role));
}

export function moduleLabels(ids: string[]): string[] {
  return ids.map(id => moduleById.get(id)?.label).filter((label): label is string => Boolean(label));
}
