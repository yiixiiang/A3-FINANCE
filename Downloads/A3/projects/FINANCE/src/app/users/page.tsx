"use client";

import { useEffect, useMemo, useState } from "react";

type AppRole = "administrator" | "finance" | "viewer" | "user";
type AppStatus = "active" | "inactive";

type Company = {
  id: number;
  name: string;
  company_type: string;
  status: string;
};

type CompanyAccess = {
  company_id: number;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
};

type ManagedUser = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  job_title: string | null;
  notes: string | null;
  role: AppRole;
  status: AppStatus;
  company_access: CompanyAccess[];
  last_sign_in_at: string | null;
  is_current_user: boolean;
};

type UserForm = {
  full_name: string;
  email: string;
  password: string;
  phone: string;
  job_title: string;
  notes: string;
  role: AppRole;
  status: AppStatus;
  company_ids: number[];
};

const roleLabels: Record<AppRole, string> = {
  administrator: "Administrator",
  finance: "Finance User",
  user: "General User",
  viewer: "Viewer Only",
};

const typeLabels: Record<string, string> = {
  general: "General Business",
  limousine: "Limousine",
  entertainment: "Nightclub",
  food: "F&B",
  other: "Other",
};

const emptyForm: UserForm = {
  full_name: "",
  email: "",
  password: "",
  phone: "",
  job_title: "",
  notes: "",
  role: "user",
  status: "active",
  company_ids: [],
};

export default function UserManagementPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resetPassword, setResetPassword] = useState("");

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedId) ?? null,
    [users, selectedId],
  );

  async function loadUsers(preferredId?: string | null) {
    setLoading(true);
    setError("");

    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Unable to load users.");
      setLoading(false);
      return;
    }

    const nextUsers = (payload.users ?? []) as ManagedUser[];
    const nextCompanies = (payload.companies ?? []) as Company[];
    setUsers(nextUsers);
    setCompanies(nextCompanies);

    const nextSelected =
      nextUsers.find((user) => user.id === preferredId) ??
      nextUsers.find((user) => user.id === selectedId) ??
      nextUsers[0] ??
      null;

    if (nextSelected) selectUser(nextSelected, false);
    else newUser(false);
    setLoading(false);
  }

  function selectUser(user: ManagedUser, clearMessages = true) {
    setSelectedId(user.id);
    setForm({
      full_name: user.full_name ?? "",
      email: user.email,
      password: "",
      phone: user.phone ?? "",
      job_title: user.job_title ?? "",
      notes: user.notes ?? "",
      role: user.role,
      status: user.status,
      company_ids: user.company_access.map((access) => access.company_id),
    });
    setResetPassword("");
    if (clearMessages) {
      setError("");
      setNotice("");
    }
  }

  function newUser(clearMessages = true) {
    setSelectedId(null);
    setForm(emptyForm);
    setResetPassword("");
    if (clearMessages) {
      setError("");
      setNotice("Enter the new account details, assign companies, then save.");
    }
  }

  function update<K extends keyof UserForm>(key: K, value: UserForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleCompany(companyId: number) {
    setForm((current) => ({
      ...current,
      company_ids: current.company_ids.includes(companyId)
        ? current.company_ids.filter((id) => id !== companyId)
        : [...current.company_ids, companyId],
    }));
  }

  function selectAllCompanies() {
    update(
      "company_ids",
      companies.filter((company) => company.status === "active").map((company) => company.id),
    );
  }

  async function saveUser() {
    setSaving(true);
    setError("");
    setNotice("");

    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: selectedId ? "update" : "create",
        user_id: selectedId,
        ...form,
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Unable to save the user.");
      setSaving(false);
      return;
    }

    const savedId = selectedId ?? payload.user_id;
    await loadUsers(savedId);
    setNotice(selectedId ? "User updated successfully." : "User account created successfully.");
    setSaving(false);
  }

  async function changePassword() {
    if (!selectedId) return;
    setSaving(true);
    setError("");
    setNotice("");

    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reset_password",
        user_id: selectedId,
        password: resetPassword,
      }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Unable to reset the password.");
      setSaving(false);
      return;
    }

    setResetPassword("");
    setNotice("Password changed successfully. Give the new password directly to the user.");
    setSaving(false);
  }

  useEffect(() => {
     
    void loadUsers();
    // The initial loader is intentionally run once after mount.
     
  }, []);

  return (
    <div className="shell">
      

      <main className="container">
        <div className="actions page-heading-row">
          <div>
            <h1 className="page-title">User Management</h1>
            <p className="subtitle">
              Create login accounts, assign companies, control roles and reset passwords.
            </p>
          </div>
          <button className="button primary" onClick={() => newUser()}>
            + Add User
          </button>
        </div>

        {notice ? <div className="notice success">{notice}</div> : null}
        {error ? <div className="notice error">{error}</div> : null}

        {loading ? (
          <section className="card">Loading users...</section>
        ) : (
          <div className="user-management-grid">
            <aside className="card user-list-card">
              <strong>Users ({users.length})</strong>
              <div className="user-list">
                {users.map((user) => (
                  <button
                    key={user.id}
                    className={`user-list-item ${user.id === selectedId ? "active" : ""}`}
                    onClick={() => selectUser(user)}
                  >
                    <span>
                      <b>{user.full_name || user.email}</b>
                      <small>{user.email}</small>
                    </span>
                    <span className={`status-dot ${user.status}`} title={user.status} />
                  </button>
                ))}
              </div>
            </aside>

            <section className="grid">
              <article className="card">
                <div className="actions user-form-title">
                  <div>
                    <h2>{selectedUser ? selectedUser.full_name || selectedUser.email : "New User"}</h2>
                    {selectedUser?.is_current_user ? <span className="badge">Your account</span> : null}
                  </div>
                  {selectedUser ? <span className="badge">{roleLabels[selectedUser.role]}</span> : null}
                </div>

                <div className="form-grid">
                  <label className="field full">
                    <span>Full name *</span>
                    <input value={form.full_name} onChange={(event) => update("full_name", event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Email *</span>
                    <input
                      type="email"
                      value={form.email}
                      disabled={Boolean(selectedId)}
                      onChange={(event) => update("email", event.target.value)}
                    />
                  </label>
                  {!selectedId ? (
                    <label className="field">
                      <span>Temporary password *</span>
                      <input
                        type="password"
                        minLength={8}
                        value={form.password}
                        onChange={(event) => update("password", event.target.value)}
                      />
                    </label>
                  ) : null}
                  <label className="field">
                    <span>Role</span>
                    <select value={form.role} onChange={(event) => update("role", event.target.value as AppRole)}>
                      {Object.entries(roleLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Status</span>
                    <select value={form.status} onChange={(event) => update("status", event.target.value as AppStatus)}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Phone</span>
                    <input value={form.phone} onChange={(event) => update("phone", event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Job title</span>
                    <input value={form.job_title} onChange={(event) => update("job_title", event.target.value)} />
                  </label>
                  <label className="field full">
                    <span>Internal notes</span>
                    <textarea rows={3} value={form.notes} onChange={(event) => update("notes", event.target.value)} />
                  </label>
                </div>
              </article>

              <article className="card">
                <div className="actions company-access-heading">
                  <div>
                    <h2>Company Access</h2>
                    <p className="subtitle">Users only see assigned companies. Administrators can see all companies.</p>
                  </div>
                  <div className="actions">
                    <button className="button secondary" type="button" onClick={selectAllCompanies}>Select all</button>
                    <button className="button secondary" type="button" onClick={() => update("company_ids", [])}>Clear</button>
                  </div>
                </div>

                <div className="company-access-grid">
                  {companies.map((company) => (
                    <label key={company.id} className="company-access-option">
                      <input
                        type="checkbox"
                        checked={form.company_ids.includes(company.id)}
                        onChange={() => toggleCompany(company.id)}
                      />
                      <span>
                        <b>{company.name}</b>
                        <small>{typeLabels[company.company_type] ?? company.company_type}</small>
                      </span>
                      <span className={`badge ${company.status === "inactive" ? "badge-muted" : ""}`}>
                        {company.status}
                      </span>
                    </label>
                  ))}
                </div>

                <div className="role-permission-summary">
                  <strong>{roleLabels[form.role]} permissions</strong>
                  <span>
                    {form.role === "administrator" && "View, create, edit and delete across all companies."}
                    {form.role === "finance" && "View, create and edit assigned-company records; no deletion."}
                    {form.role === "user" && "View and create assigned-company records; no editing or deletion."}
                    {form.role === "viewer" && "View assigned-company records only."}
                  </span>
                </div>
              </article>

              {selectedId ? (
                <article className="card">
                  <h2 style={{ marginTop: 0 }}>Set New Password</h2>
                  <p className="subtitle">Minimum 8 characters. The user can sign in immediately with the new password.</p>
                  <div className="actions password-reset-row">
                    <input
                      type="password"
                      minLength={8}
                      placeholder="Enter new password"
                      value={resetPassword}
                      onChange={(event) => setResetPassword(event.target.value)}
                    />
                    <button
                      className="button secondary"
                      disabled={saving || resetPassword.length < 8}
                      onClick={() => void changePassword()}
                    >
                      Change Password
                    </button>
                  </div>
                </article>
              ) : null}

              <div className="actions">
                <button className="button primary" disabled={saving} onClick={() => void saveUser()}>
                  {saving ? "Saving..." : selectedId ? "Save User Changes" : "Create User Account"}
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
