import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "./dashboard.module.css";
import { createClient } from "@/lib/supabase/server";

const typeLabels: Record<string, string> = {
  general: "General Business",
  limousine: "Limousine",
  nightclub: "Nightclub",
  entertainment: "Nightclub",
  fnb: "F&B",
  food: "F&B",
  other: "Other",
};

const financeModules = [
  { href: "/invoices", title: "Invoices & Quotations", detail: "Customer billing, quotations and premium A4 documents.", icon: "▤" },
  { href: "/receivables", title: "Accounts Receivable", detail: "Collections, ageing, allocations and customer credits.", icon: "◩" },
  { href: "/payables", title: "Accounts Payable", detail: "Supplier bills, payments, credits and payment vouchers.", icon: "▥" },
  { href: "/bank-reconciliation", title: "Bank Reconciliation", detail: "Statement import, matching, cash book and reconciliation reports.", icon: "▧" },
  { href: "/gst-reports", title: "GST Reports", detail: "Tax codes, eight-box return, review and filing control.", icon: "▨" },
  { href: "/profit-loss", title: "Profit & Loss", detail: "Actual, comparison, budget variance and transaction drill-down.", icon: "▰" },
  { href: "/balance-sheet", title: "Balance Sheet", detail: "Assets, liabilities, equity and period-end snapshots.", icon: "▱" },
  { href: "/cash-flow", title: "Cash Flow Statement", detail: "Operating, investing and financing cash movements.", icon: "⇄" },
  { href: "/financial-control", title: "Financial Control", detail: "Period closing, permissions, audit trail, health checks and backup.", icon: "✓" },
  { href: "/driver-network", title: "Driver Network", detail: "Multi-company driver links, assigned clients and company-specific recruitment.", icon: "⌘" },
];

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=Please%20sign%20in%20to%20continue.");

  const [{ data: profile }, { data: companies }] = await Promise.all([
    supabase.from("profiles").select("full_name,role,active_company_id").eq("id", user.id).maybeSingle(),
    supabase.from("companies").select("id,name,company_type,status,base_currency").order("name"),
  ]);

  const rows = companies ?? [];
  const activeCompany = rows.find((row) => row.id === profile?.active_company_id)
    ?? rows.find((row) => row.status === "active")
    ?? null;
  const isDriver = profile?.role === "driver";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>A3 Management Finance</p>
          <h1>Finance Command Centre</h1>
          <p>Welcome {profile?.full_name || user.email}. Role: {profile?.role || "user"}</p>
        </div>
        <div className={styles.releaseBadge}>Phases 1–11 Complete</div>
      </header>

      <section className={styles.companyHero}>
        <div>
          <span>Active workspace</span>
          <h2>{activeCompany?.name ?? "No company selected"}</h2>
        </div>
        {activeCompany ? (
          <div className={styles.companyMeta}>
            <strong>{typeLabels[activeCompany.company_type] ?? activeCompany.company_type}</strong>
            <strong>{activeCompany.base_currency}</strong>
            <strong>{activeCompany.status === "active" ? "Active" : "Inactive"}</strong>
          </div>
        ) : null}
      </section>

      <section className={styles.metrics}>
        <article className={styles.metric}><span>Total companies</span><strong>{rows.length}</strong></article>
        <article className={styles.metric}><span>Active companies</span><strong>{rows.filter((row) => row.status === "active").length}</strong></article>
        <article className={styles.metric}><span>Nightclub companies</span><strong>{rows.filter((row) => ["nightclub", "entertainment"].includes(row.company_type)).length}</strong></article>
        <article className={styles.metric}><span>F&B companies</span><strong>{rows.filter((row) => ["fnb", "food"].includes(row.company_type)).length}</strong></article>
      </section>

      {isDriver ? (
        <section className={styles.driverPanel}>
          <div><h2>Driver Portal</h2><p>Review your driver profile, assigned jobs and payout information.</p></div>
          <Link className={styles.primaryButton} href="/driver/profile" prefetch={false}>Open My Driver Profile</Link>
        </section>
      ) : (
        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div><h2>Complete Business Suite</h2><p>From operational documents to statutory reporting and final period close.</p></div>
            <span className={styles.phaseTag}>11 / 11 modules delivered</span>
          </div>
          <div className={styles.moduleGrid}>
            {financeModules.map((module) => (
              <Link className={styles.moduleCard} href={module.href} key={module.href}>
                <span className={styles.moduleIcon}>{module.icon}</span>
                <strong>{module.title}</strong>
                <small>{module.detail}</small>
                <b>Open module →</b>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
