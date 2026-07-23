"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import CompanySelector from "@/components/company-selector";

type NavItem = {
  href: string;
  label: string;
  icon: string;
};

const groups: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Operations",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "⌂" },
      { href: "/jobs", label: "Jobs", icon: "▣" },
      { href: "/limousine-rates", label: "Limousine Rates", icon: "◇" },
      { href: "/limousine", label: "Public Limousine Site", icon: "↗" },
      { href: "/client-rates", label: "Client Contract Rates", icon: "¤" },
      { href: "/drivers", label: "Drivers", icon: "♙" },
      { href: "/driver-network", label: "Driver Network", icon: "⌘" },
      { href: "/driver/profile", label: "My Driver Profile", icon: "◉" },
      { href: "/customers", label: "Customers", icon: "◎" },
    ],
  },
  {
    title: "Finance",
    items: [
      { href: "/invoices", label: "Invoices", icon: "▤" },
      { href: "/receivables", label: "Receivables", icon: "◩" },
      { href: "/payables", label: "Payables", icon: "▥" },
      { href: "/bank-reconciliation", label: "Bank Reconciliation", icon: "▧" },
      { href: "/gst-reports", label: "GST Reports", icon: "▨" },
      { href: "/profit-loss", label: "Profit & Loss", icon: "▰" },
      { href: "/balance-sheet", label: "Balance Sheet", icon: "▱" },
      { href: "/cash-flow", label: "Cash Flow", icon: "⇄" },
      { href: "/payouts", label: "Payouts", icon: "◫" },
      { href: "/quotations", label: "Quotations", icon: "◇" },
    ],
  },
  {
    title: "Administration",
    items: [
      { href: "/companies", label: "Companies", icon: "▦" },
      { href: "/users", label: "Users", icon: "♙" },
      { href: "/financial-control", label: "Financial Control", icon: "✓" },
    ],
  },
];

const mobileItems = [
  { href: "/dashboard", label: "Home", icon: "⌂" },
  { href: "/jobs", label: "Jobs", icon: "▣" },
  { href: "/invoices", label: "Invoices", icon: "▤" },
  { href: "/balance-sheet", label: "B/S", icon: "▱" },
  { href: "/cash-flow", label: "Cash", icon: "⇄" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function EnterpriseShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isAuthPage =
    pathname.startsWith("/login") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/driver-signup");
  const isPublicPage =
    pathname === "/" ||
    pathname === "/limousine" ||
    pathname.startsWith("/limousine/");
  const isDocumentPage = pathname.includes("/print") || pathname.includes("/receipt");

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (isAuthPage || isDocumentPage || isPublicPage) return <>{children}</>;

  return (
    <div className="enterprise-frame">
      <button
        type="button"
        className="mobile-menu-trigger"
        aria-label="Open navigation"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span />
        <span />
        <span />
      </button>

      <div className={`enterprise-overlay ${open ? "show" : ""}`} onClick={() => setOpen(false)} />

      <aside className={`enterprise-sidebar ${open ? "open" : ""}`}>
        <div className="enterprise-logo">
          <div className="enterprise-logo-mark">A3</div>
          <div>
            <strong>A3 MANAGEMENT</strong>
            <small>Business Operating System</small>
          </div>
          <button type="button" className="sidebar-close" onClick={() => setOpen(false)} aria-label="Close navigation">×</button>
        </div>

        <div className="sidebar-workspace">
          <span className="workspace-dot" />
          <div>
            <small>Workspace</small>
            <strong>Management Portal</strong>
          </div>
        </div>

        <nav className="enterprise-nav" aria-label="Main navigation">
          {groups.map((group) => (
            <section key={group.title}>
              <p>{group.title}</p>
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={item.href === "/driver/profile" ? false : undefined}
                  className={isActive(pathname, item.href) ? "active" : ""}
                >
                  <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </section>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-help-icon">?</div>
          <div>
            <strong>Need help?</strong>
            <small>System support</small>
          </div>
        </div>
      </aside>

      <div className="enterprise-content">
        <header className="enterprise-topbar">
          <div className="enterprise-topbar-actions">
            <CompanySelector />
            <form action="/api/logout" method="post">
              <button className="enterprise-logout" type="submit">Logout</button>
            </form>
          </div>
        </header>
        {children}
      </div>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {mobileItems.map((item) => (
          <Link
                  key={item.href}
                  href={item.href}
                  prefetch={item.href === "/driver/profile" ? false : undefined}
                  className={isActive(pathname, item.href) ? "active" : ""}
                >
            <span aria-hidden="true">{item.icon}</span>
            <small>{item.label}</small>
          </Link>
        ))}
      </nav>
    </div>
  );
}
