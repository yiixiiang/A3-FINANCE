"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format-date";
import styles from "./driver-network.module.css";

type Tab = "directory" | "signup" | "applications";
type Company = {
  id: number;
  name: string;
  company_type: string;
  status: string;
  phone?: string | null;
  email?: string | null;
};
type Customer = {
  id: number;
  company_id: number;
  customer_no: string | null;
  customer_type: "company" | "individual";
  customer_name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  status: string;
};
type CompanyLink = {
  id: number;
  driver_id: number;
  company_id: number;
  is_primary: boolean;
  membership_status: string;
  joined_at: string;
  notes: string | null;
};
type CustomerLink = {
  id: number;
  driver_id: number;
  company_id: number;
  customer_id: number;
  relationship_type: "client" | "customer";
  link_status: string;
  notes: string | null;
};
type VehicleDocument = {
  id: string;
  application_id: number;
  company_id: number;
  driver_id: number | null;
  document_type: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  upload_status: string;
  uploaded_at: string | null;
  signed_url: string | null;
};
type Driver = {
  id: number;
  driver_no: string;
  company_id: number;
  auth_user_id: string | null;
  full_name: string;
  phone: string | null;
  contact_email: string | null;
  nationality: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  vehicle_type: string | null;
  status: string;
  created_at: string;
  company_links: CompanyLink[];
  customer_links: CustomerLink[];
  vehicle_documents: VehicleDocument[];
};
type SignupLink = {
  id: string;
  company_id: number;
  public_token: string;
  short_code: string;
  link_name: string;
  status: "active" | "inactive";
  expires_at: string | null;
  max_applications: number | null;
  application_count: number;
  created_at: string;
};
type Application = {
  id: number;
  application_no: string | null;
  company_id: number;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  driver_id: number | null;
  full_name: string;
  phone: string;
  contact_email: string | null;
  address: string | null;
  nationality: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_plate: string | null;
  vehicle_type: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_no: string | null;
  paynow_type: string | null;
  paynow_no: string | null;
  notes: string | null;
  review_notes: string | null;
  submitted_at: string;
  vehicle_documents: VehicleDocument[];
};
type Payload = {
  drivers: Driver[];
  companies: Company[];
  customers: Customer[];
  signup_links: SignupLink[];
  applications: Application[];
  error?: string;
};

const emptyPayload: Payload = {
  drivers: [],
  companies: [],
  customers: [],
  signup_links: [],
  applications: [],
};

function companyLabel(company: Company | undefined) {
  return company?.name ?? "Unknown company";
}

function documentSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export default function DriverNetworkPage() {
  const [data, setData] = useState<Payload>(emptyPayload);
  const [tab, setTab] = useState<Tab>("directory");
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);
  const [companyIds, setCompanyIds] = useState<number[]>([]);
  const [primaryCompanyId, setPrimaryCompanyId] = useState<number>(0);
  const [customerIds, setCustomerIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [applicationFilter, setApplicationFilter] = useState("pending");
  const [linkCompanyId, setLinkCompanyId] = useState(0);
  const [linkName, setLinkName] = useState("Driver Recruitment");
  const [linkExpiry, setLinkExpiry] = useState("");
  const [linkLimit, setLinkLimit] = useState("");
  const [origin, setOrigin] = useState("");
  const [latestLink, setLatestLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [renderedAt] = useState(() => Date.now());

  const selectedDriver = useMemo(
    () => data.drivers.find((driver) => driver.id === selectedDriverId) ?? null,
    [data.drivers, selectedDriverId],
  );

  const filteredDrivers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data.drivers;
    return data.drivers.filter((driver) =>
      [driver.full_name, driver.driver_no, driver.phone, driver.contact_email, driver.vehicle_plate]
        .some((value) => String(value ?? "").toLowerCase().includes(term)),
    );
  }, [data.drivers, search]);

  const activeCompanies = useMemo(
    () => data.companies.filter((company) => company.status === "active"),
    [data.companies],
  );

  const availableCustomers = useMemo(
    () =>
      data.customers.filter(
        (customer) => customer.status === "active" && companyIds.includes(customer.company_id),
      ),
    [companyIds, data.customers],
  );

  const displayedApplications = useMemo(
    () =>
      applicationFilter === "all"
        ? data.applications
        : data.applications.filter((application) => application.status === applicationFilter),
    [applicationFilter, data.applications],
  );

  const load = useCallback(async (preferredDriverId?: number | null) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/driver-network", { cache: "no-store" });
      const payload = (await response.json()) as Payload;
      if (!response.ok) throw new Error(payload.error || "Unable to load Driver Network.");
      setData(payload);
      const nextDriverId =
        preferredDriverId ?? selectedDriverId ?? payload.drivers[0]?.id ?? null;
      setSelectedDriverId(nextDriverId);
      if (!linkCompanyId && payload.companies[0]?.id) setLinkCompanyId(payload.companies[0].id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load Driver Network.");
    } finally {
      setLoading(false);
    }
  }, [linkCompanyId, selectedDriverId]);

  useEffect(() => {
    setOrigin(window.location.origin);
    void load();
  }, []);  

  useEffect(() => {
    if (!selectedDriver) {
      setCompanyIds([]);
      setPrimaryCompanyId(0);
      setCustomerIds([]);
      return;
    }
    const activeCompanyIdSet = new Set(
      data.companies
        .filter((company) => company.status === "active")
        .map((company) => company.id),
    );
    const activeLinks = selectedDriver.company_links.filter(
      (link) =>
        link.membership_status === "active" && activeCompanyIdSet.has(link.company_id),
    );
    const nextCompanyIds = activeLinks.map((link) => link.company_id);
    const primary = activeLinks.find((link) => link.is_primary)?.company_id;
    setCompanyIds(nextCompanyIds);
    setPrimaryCompanyId(primary ?? nextCompanyIds[0] ?? 0);
    setCustomerIds(
      selectedDriver.customer_links
        .filter(
          (link) =>
            link.link_status === "active" && nextCompanyIds.includes(link.company_id),
        )
        .map((link) => link.customer_id),
    );
  }, [selectedDriver]);

  function toggleCompany(companyId: number, checked: boolean) {
    setCompanyIds((current) => {
      const next = checked
        ? [...new Set([...current, companyId])]
        : current.filter((id) => id !== companyId);
      if (!checked) {
        setCustomerIds((ids) =>
          ids.filter((customerId) => {
            const customer = data.customers.find((item) => item.id === customerId);
            return customer?.company_id !== companyId;
          }),
        );
        if (primaryCompanyId === companyId) setPrimaryCompanyId(next[0] ?? 0);
      } else if (!primaryCompanyId) {
        setPrimaryCompanyId(companyId);
      }
      return next;
    });
  }

  function toggleCustomer(customerId: number, checked: boolean) {
    setCustomerIds((current) =>
      checked
        ? [...new Set([...current, customerId])]
        : current.filter((id) => id !== customerId),
    );
  }

  async function post(payload: Record<string, unknown>, successMessage: string) {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/admin/driver-network", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as Record<string, any>;
      if (!response.ok) throw new Error(String(result.error || "Unable to update Driver Network."));
      setNotice(successMessage);
      return result;
    } catch (postError) {
      setError(postError instanceof Error ? postError.message : "Unable to update Driver Network.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveNetwork() {
    if (!selectedDriver) return;
    const result = await post(
      {
        action: "save_driver_network",
        driver_id: selectedDriver.id,
        primary_company_id: primaryCompanyId,
        company_ids: companyIds,
        customer_ids: customerIds,
      },
      "Driver company, client and customer links updated.",
    );
    if (result) await load(selectedDriver.id);
  }

  function signupPath(code: string) {
    return `/d/${code}`;
  }

  function signupUrl(code: string) {
    return `${origin || ""}${signupPath(code)}`;
  }

  async function copyText(value: string, message = "Copied.") {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(message);
    } catch {
      window.prompt("Copy this information:", value);
    }
  }

  async function createSignupLink() {
    const result = await post(
      {
        action: "create_signup_link",
        company_id: linkCompanyId,
        link_name: linkName,
        expires_at: linkExpiry ? new Date(`${linkExpiry}T23:59:59`).toISOString() : null,
        max_applications: linkLimit ? Number(linkLimit) : null,
      },
      "Company-specific driver signup link created.",
    );
    const shortCode = result?.signup_link?.short_code as string | undefined;
    if (shortCode) {
      const url = signupUrl(shortCode);
      setLatestLink(shortCode);
      await copyText(url, "Short signup link copied.");
    }
    if (result) await load(selectedDriverId);
  }

  async function changeLinkStatus(link: SignupLink) {
    const nextStatus = link.status === "active" ? "inactive" : "active";
    const result = await post(
      {
        action: "set_signup_link_status",
        signup_link_id: link.id,
        status: nextStatus,
      },
      `Signup link ${nextStatus === "active" ? "activated" : "deactivated"}.`,
    );
    if (result) await load(selectedDriverId);
  }

  async function reviewApplication(application: Application, approve: boolean) {
    const notes = window.prompt(
      approve ? "Optional approval notes:" : "Enter the rejection reason:",
      "",
    );
    if (!approve && !notes) return;
    const result = await post(
      {
        action: approve ? "approve_application" : "reject_application",
        application_id: application.id,
        review_notes: notes ?? "",
      },
      approve
        ? "Application approved and driver linked to the selected company."
        : "Application rejected.",
    );
    if (result && approve) {
      const loginEmail = String(result.login_email || application.contact_email || "");
      const temporaryPassword = String(result.temporary_password || "");
      if (temporaryPassword) {
        const credentials = `Driver login created\nEmail: ${loginEmail}\nTemporary password: ${temporaryPassword}\nSign in: ${origin || ""}/login`;
        await copyText(
          credentials,
          "Application approved. Driver account created and credentials copied.",
        );
        window.prompt("Driver account created. Copy these one-time login details:", credentials);
      } else {
        setNotice("Application approved and linked to the driver's existing login account.");
      }
    }
    if (result) await load(selectedDriverId);
  }

  const pendingCount = data.applications.filter((application) => application.status === "pending").length;
  const linkedClientCount = selectedDriver?.customer_links.filter(
    (link) => link.link_status === "active" && link.relationship_type === "client",
  ).length ?? 0;
  const linkedCustomerCount = selectedDriver?.customer_links.filter(
    (link) => link.link_status === "active" && link.relationship_type === "customer",
  ).length ?? 0;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>PHASE 11 · DRIVER NETWORK & RECRUITMENT</p>
          <h1>Driver Network Centre</h1>
          <p>
            Connect one driver to multiple limousine companies, company clients and individual customers. Generate recruitment links that are locked to one selected company.
          </p>
        </div>
        <div className={styles.heroStats}>
          <div><strong>{data.drivers.length}</strong><span>Drivers</span></div>
          <div><strong>{activeCompanies.length}</strong><span>Limousine companies</span></div>
          <div><strong>{pendingCount}</strong><span>Pending applications</span></div>
        </div>
      </header>

      {notice ? <div className={styles.success}>{notice}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}

      <nav className={styles.tabs} aria-label="Driver Network sections">
        <button className={tab === "directory" ? styles.activeTab : ""} onClick={() => setTab("directory")}>Driver Directory</button>
        <button className={tab === "signup" ? styles.activeTab : ""} onClick={() => setTab("signup")}>Company Signup Links</button>
        <button className={tab === "applications" ? styles.activeTab : ""} onClick={() => setTab("applications")}>
          Applications {pendingCount ? <span>{pendingCount}</span> : null}
        </button>
      </nav>

      {loading && data.drivers.length === 0 ? <section className={styles.loading}>Loading Driver Network...</section> : null}

      {tab === "directory" ? (
        <section className={styles.directoryLayout}>
          <aside className={styles.driverListPanel}>
            <div className={styles.panelHeader}>
              <div><span>Directory</span><h2>Drivers</h2></div>
              <strong>{filteredDrivers.length}</strong>
            </div>
            <div className={styles.searchBox}>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone or vehicle" />
            </div>
            <div className={styles.driverList}>
              {filteredDrivers.map((driver) => {
                const links = driver.company_links.filter((link) => link.membership_status === "active");
                return (
                  <button
                    type="button"
                    key={driver.id}
                    className={selectedDriverId === driver.id ? styles.selectedDriver : ""}
                    onClick={() => setSelectedDriverId(driver.id)}
                  >
                    <span className={styles.avatar}>{driver.full_name.charAt(0).toUpperCase()}</span>
                    <span className={styles.driverListText}>
                      <strong>{driver.full_name}</strong>
                      <small>{driver.driver_no} · {driver.vehicle_plate || "No vehicle"}</small>
                      <em>{links.length} linked compan{links.length === 1 ? "y" : "ies"}</em>
                    </span>
                    <i className={driver.status === "active" ? styles.online : styles.offline} />
                  </button>
                );
              })}
              {filteredDrivers.length === 0 ? <p className={styles.empty}>No drivers match the search.</p> : null}
            </div>
          </aside>

          <div className={styles.networkContent}>
            {selectedDriver ? (
              <>
                <article className={styles.profileCard}>
                  <div className={styles.largeAvatar}>{selectedDriver.full_name.charAt(0).toUpperCase()}</div>
                  <div className={styles.profileIdentity}>
                    <span>{selectedDriver.driver_no}</span>
                    <h2>{selectedDriver.full_name}</h2>
                    <p>{selectedDriver.phone || "No phone"} · {selectedDriver.contact_email || "No email"}</p>
                  </div>
                  <div className={styles.profileFacts}>
                    <div><span>Login</span><strong>{selectedDriver.auth_user_id ? "Enabled" : "Not created"}</strong><small>{selectedDriver.contact_email || "No login email"}</small></div>
                    <div><span>Vehicle</span><strong>{selectedDriver.vehicle_plate || "—"}</strong><small>{[selectedDriver.vehicle_make, selectedDriver.vehicle_model].filter(Boolean).join(" ") || "Vehicle not set"}</small></div>
                    <div><span>Network</span><strong>{companyIds.length} companies</strong><small>{linkedClientCount} clients · {linkedCustomerCount} customers</small></div>
                  </div>
                </article>

                {selectedDriver.vehicle_documents.length > 0 ? (
                  <article className={styles.sectionCard}>
                    <div className={styles.sectionHeading}>
                      <div><span>Vehicle files</span><h2>Approved Vehicle Documents</h2><p>Documents submitted during recruitment remain linked to this driver across the limousine network.</p></div>
                      <div className={styles.linkTotals}><strong>{selectedDriver.vehicle_documents.length}</strong><span>files</span></div>
                    </div>
                    <div className={styles.documentGrid}>
                      {selectedDriver.vehicle_documents.map((document) => (
                        <a key={document.id} href={document.signed_url || undefined} target="_blank" rel="noreferrer" className={!document.signed_url ? styles.disabledDocument : ""}>
                          <span>{document.mime_type === "application/pdf" ? "PDF" : "IMG"}</span>
                          <div><strong>{document.original_filename}</strong><small>{documentSize(document.size_bytes)} · {document.upload_status}</small></div>
                          <em>Open</em>
                        </a>
                      ))}
                    </div>
                  </article>
                ) : null}

                <article className={styles.sectionCard}>
                  <div className={styles.sectionHeading}>
                    <div><span>Step 1</span><h2>Linked Limousine Companies</h2><p>Select every company this driver may work for, then choose one primary company.</p></div>
                  </div>
                  <div className={styles.companyGrid}>
                    {activeCompanies.map((company) => {
                      const checked = companyIds.includes(company.id);
                      return (
                        <div key={company.id} className={`${styles.companyOption} ${checked ? styles.checkedCard : ""}`}>
                          <label>
                            <input type="checkbox" checked={checked} onChange={(event) => toggleCompany(company.id, event.target.checked)} />
                            <span className={styles.companyMark}>{company.name.slice(0, 2).toUpperCase()}</span>
                            <span><strong>{company.name}</strong><small>{company.phone || company.email || "Limousine company"}</small></span>
                          </label>
                          <label className={styles.primaryChoice}>
                            <input type="radio" name="primary-company" disabled={!checked} checked={primaryCompanyId === company.id} onChange={() => setPrimaryCompanyId(company.id)} />
                            Primary company
                          </label>
                        </div>
                      );
                    })}
                    {activeCompanies.length === 0 ? <p className={styles.empty}>Create an active company with type Limousine first.</p> : null}
                  </div>
                </article>

                <article className={styles.sectionCard}>
                  <div className={styles.sectionHeading}>
                    <div><span>Step 2</span><h2>Linked Clients & Customers</h2><p>Company records are shown as Clients. Individual records are shown as Customers.</p></div>
                    <div className={styles.linkTotals}><strong>{customerIds.length}</strong><span>selected</span></div>
                  </div>
                  {companyIds.length === 0 ? (
                    <p className={styles.empty}>Select at least one limousine company to view its clients and customers.</p>
                  ) : (
                    <div className={styles.customerGroups}>
                      {companyIds.map((companyId) => {
                        const company = data.companies.find((item) => item.id === companyId);
                        const customers = availableCustomers.filter((customer) => customer.company_id === companyId);
                        return (
                          <section key={companyId}>
                            <h3>{companyLabel(company)} <span>{customers.length}</span></h3>
                            <div className={styles.customerGrid}>
                              {customers.map((customer) => (
                                <label key={customer.id} className={customerIds.includes(customer.id) ? styles.selectedCustomer : ""}>
                                  <input type="checkbox" checked={customerIds.includes(customer.id)} onChange={(event) => toggleCustomer(customer.id, event.target.checked)} />
                                  <span className={customer.customer_type === "company" ? styles.clientBadge : styles.customerBadge}>
                                    {customer.customer_type === "company" ? "Client" : "Customer"}
                                  </span>
                                  <strong>{customer.customer_name}</strong>
                                  <small>{customer.contact_person || customer.phone || customer.email || customer.customer_no}</small>
                                </label>
                              ))}
                              {customers.length === 0 ? <p className={styles.empty}>No active clients or customers for this company.</p> : null}
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  )}
                  <div className={styles.cardActions}>
                    <button type="button" className={styles.primaryButton} disabled={saving || companyIds.length === 0 || !primaryCompanyId} onClick={() => void saveNetwork()}>
                      {saving ? "Saving..." : "Save Driver Network"}
                    </button>
                  </div>
                </article>
              </>
            ) : (
              <article className={styles.sectionCard}><p className={styles.empty}>No driver is available. Create a driver first.</p></article>
            )}
          </div>
        </section>
      ) : null}

      {tab === "signup" ? (
        <section className={styles.signupLayout}>
          <article className={styles.signupBuilder}>
            <div className={styles.sectionHeading}><div><span>Recruitment</span><h2>Create Company-Locked Signup Link</h2><p>The applicant sees the selected company but cannot change it.</p></div></div>
            <div className={styles.formGrid}>
              <label><span>Selected Limousine Company</span><select value={linkCompanyId} onChange={(event) => setLinkCompanyId(Number(event.target.value))}>{activeCompanies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
              <label><span>Link Name</span><input value={linkName} onChange={(event) => setLinkName(event.target.value)} /></label>
              <label><span>Expiry Date</span><input type="date" value={linkExpiry} onChange={(event) => setLinkExpiry(event.target.value)} /></label>
              <label><span>Application Limit</span><input type="number" min="1" placeholder="Unlimited" value={linkLimit} onChange={(event) => setLinkLimit(event.target.value)} /></label>
            </div>
            <div className={styles.lockNotice}><strong>Company lock enabled</strong><p>The short code controls the company. No company selector, NRIC or driving licence number is collected.</p></div>
            <button type="button" className={styles.primaryButton} disabled={saving || !linkCompanyId} onClick={() => void createSignupLink()}>{saving ? "Creating..." : "Create & Copy Signup Link"}</button>
            {latestLink ? <div className={styles.latestLink}><span>Latest short link</span><code>{signupPath(latestLink)}</code><button type="button" onClick={() => void copyText(signupUrl(latestLink), "Short signup link copied.")}>Copy</button></div> : null}
          </article>

          <article className={styles.linkListCard}>
            <div className={styles.sectionHeading}><div><span>Active links</span><h2>Recruitment Links</h2><p>Copy, deactivate or reactivate company-specific links.</p></div></div>
            <div className={styles.linkList}>
              {data.signup_links.map((link) => {
                const company = data.companies.find((item) => item.id === link.company_id);
                const url = signupUrl(link.short_code);
                const shortPath = signupPath(link.short_code);
                const expired = Boolean(link.expires_at && new Date(link.expires_at).getTime() <= renderedAt);
                return (
                  <article key={link.id}>
                    <div className={styles.linkIcon}>↗</div>
                    <div className={styles.linkBody}>
                      <div><strong>{link.link_name}</strong><span className={link.status === "active" && !expired ? styles.activeBadge : styles.inactiveBadge}>{expired ? "expired" : link.status}</span></div>
                      <p>{companyLabel(company)}</p>
                      <code>{shortPath}</code>
                      <small>Created {formatDate(link.created_at)} · {link.application_count} application{link.application_count === 1 ? "" : "s"}{link.max_applications ? ` / ${link.max_applications}` : ""}{link.expires_at ? ` · Expires ${formatDate(link.expires_at)}` : " · No expiry"}</small>
                    </div>
                    <div className={styles.linkActions}>
                      <button type="button" onClick={() => void copyText(url, "Short signup link copied.")}>Copy</button>
                      <button type="button" onClick={() => void changeLinkStatus(link)}>{link.status === "active" ? "Deactivate" : "Activate"}</button>
                    </div>
                  </article>
                );
              })}
              {data.signup_links.length === 0 ? <p className={styles.empty}>No driver signup links have been created.</p> : null}
            </div>
          </article>
        </section>
      ) : null}

      {tab === "applications" ? (
        <section className={styles.applicationsCard}>
          <div className={styles.applicationsHeader}>
            <div><span>Recruitment inbox</span><h2>Driver Applications</h2><p>Approval creates or links the driver and automatically prepares the driver login account.</p></div>
            <select value={applicationFilter} onChange={(event) => setApplicationFilter(event.target.value)}><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All applications</option></select>
          </div>
          <div className={styles.applicationGrid}>
            {displayedApplications.map((application) => {
              const company = data.companies.find((item) => item.id === application.company_id);
              return (
                <article key={application.id}>
                  <div className={styles.applicationTop}>
                    <div className={styles.avatar}>{application.full_name.charAt(0).toUpperCase()}</div>
                    <div><span>{application.application_no || `Application ${application.id}`}</span><h3>{application.full_name}</h3><p>{companyLabel(company)}</p></div>
                    <em className={styles[`${application.status}Status`]}>{application.status}</em>
                  </div>
                  <div className={styles.applicationDetails}>
                    <div><span>Name & Contact</span><strong>{application.phone}</strong><small>{application.contact_email || "No email provided"}</small></div>
                    <div><span>Car</span><strong>{application.vehicle_plate || "—"}</strong><small>{[application.vehicle_make, application.vehicle_model, application.vehicle_type].filter(Boolean).join(" ") || "Not provided"}</small></div>
                    <div><span>Emergency Contact</span><strong>{application.emergency_contact_name || "—"}</strong><small>{application.emergency_contact_phone || "No contact number"}</small></div>
                    <div><span>Bank</span><strong>{application.bank_name || "—"}</strong><small>{application.bank_account_name || "No account name"} · {application.bank_account_no || "No account number"}</small></div>
                    <div><span>PayNow</span><strong>{application.paynow_type ? application.paynow_type.toUpperCase() : "—"}</strong><small>{application.paynow_no || "No PayNow number"}</small></div>
                    <div><span>Submitted</span><strong>{formatDate(application.submitted_at)}</strong><small>{application.nationality || "Nationality not provided"}</small></div>
                    <div><span>Vehicle Files</span><strong>{application.vehicle_documents.length}</strong><small>Private uploaded files</small></div>
                  </div>
                  {application.vehicle_documents.length > 0 ? (
                    <div className={styles.applicationDocuments}>
                      {application.vehicle_documents.map((document) => (
                        <a key={document.id} href={document.signed_url || undefined} target="_blank" rel="noreferrer" className={!document.signed_url ? styles.disabledDocument : ""}>
                          <span>{document.mime_type === "application/pdf" ? "PDF" : "IMG"}</span>
                          <div><strong>{document.original_filename}</strong><small>{documentSize(document.size_bytes)}</small></div>
                          <em>Review</em>
                        </a>
                      ))}
                    </div>
                  ) : <p className={styles.missingDocuments}>No vehicle documents are attached.</p>}
                  {application.notes ? <p className={styles.applicationNotes}>{application.notes}</p> : null}
                  {application.review_notes ? <p className={styles.reviewNotes}><strong>Review:</strong> {application.review_notes}</p> : null}
                  {application.status === "pending" ? (
                    <div className={styles.applicationActions}>
                      <button type="button" className={styles.rejectButton} disabled={saving} onClick={() => void reviewApplication(application, false)}>Reject</button>
                      <button type="button" className={styles.approveButton} disabled={saving} onClick={() => void reviewApplication(application, true)}>Approve & Create Driver Login</button>
                    </div>
                  ) : null}
                </article>
              );
            })}
            {displayedApplications.length === 0 ? <p className={styles.empty}>No applications in this category.</p> : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
