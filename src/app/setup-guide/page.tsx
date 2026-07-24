import styles from "./setup-guide.module.css";

const sections = [
  {
    number: "01",
    title: "First-Time Setup",
    items: [
      "Create or confirm your company under Companies.",
      "Set the company name, business type, UEN, address, contact details, currency, GST settings and branding.",
      "Confirm the correct company is selected from the top company selector before entering records.",
      "Root administrators should have access to every company. Company administrators should only be assigned to the companies they manage.",
    ],
  },
  {
    number: "02",
    title: "Users & Permissions",
    items: [
      "Open Users to create staff accounts and assign their role.",
      "Administrator: manages assigned companies and users.",
      "Finance: handles invoices, receivables, payables and reports.",
      "Viewer: read-only access to permitted modules.",
      "Driver: accesses the driver profile and assigned vehicle information.",
      "Always confirm company access before asking a new user to sign in.",
    ],
  },
  {
    number: "03",
    title: "Drivers & Vehicle Registration",
    items: [
      "Use Driver Network to create a public driver signup link for the selected limousine company.",
      "Share the short link in the format /d/XXXXXXXXXX.",
      "Review the submitted application and uploaded vehicle documents before approval.",
      "Approving an application creates or links the driver account automatically when required.",
      "Record vehicle plate, make, model, vehicle type, year, colour, passenger capacity, luggage capacity, ownership and status.",
    ],
  },
  {
    number: "04",
    title: "Rates, Customers & Jobs",
    items: [
      "Set standard limousine rates and client contract rates before creating jobs.",
      "Create customers with complete billing and contact details.",
      "Create each job under the correct company, customer, driver, vehicle and service date.",
      "Check pickup, destination, additional stops, surcharges and job status before billing.",
    ],
  },
  {
    number: "05",
    title: "Quotations & Invoices",
    items: [
      "Create a quotation for services that are not yet confirmed.",
      "Convert or recreate the approved quotation as an invoice after confirmation.",
      "Check service charge, GST, discounts, payment terms and due date.",
      "Preview the printable document before sending it to the customer.",
      "Do not mark an invoice as paid until the payment has been received and verified.",
    ],
  },
  {
    number: "06",
    title: "Receivables, Payables & Payouts",
    items: [
      "Record customer payments in Receivables and attach the correct invoice reference.",
      "Record supplier bills and operating expenses in Payables.",
      "Use Payouts for driver settlement and verify the driver, jobs, deductions and net amount.",
      "Use Bank Reconciliation to match system entries against the bank statement.",
    ],
  },
  {
    number: "07",
    title: "Financial Reports",
    items: [
      "Review Profit & Loss for income and expenses by accounting period.",
      "Review Balance Sheet for assets, liabilities and equity.",
      "Review Cash Flow for operating, investing and financing cash movement.",
      "Prepare GST Reports only after invoices, expenses and tax treatments have been checked.",
      "Use Financial Control to lock or review completed accounting periods.",
    ],
  },
  {
    number: "08",
    title: "Daily Operating Routine",
    items: [
      "Select the correct company.",
      "Review new jobs and driver applications.",
      "Update job status and supporting details.",
      "Issue quotations or invoices.",
      "Record incoming and outgoing payments.",
      "Reconcile the bank and review overdue balances.",
      "Check the dashboard and financial reports before closing the day.",
    ],
  },
];

export default function SetupGuidePage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>A3 FINANCE USER GUIDE</span>
          <h1>Setup & How to Use A3 Finance</h1>
          <p>
            Follow this guide in order when setting up a new company, then use the daily workflow
            to keep operations, drivers, billing and accounts accurate.
          </p>
        </div>
        <div className={styles.quickCard}>
          <strong>Important</strong>
          <p>Always confirm the selected company before creating or editing any record.</p>
        </div>
      </section>

      <section className={styles.startGrid}>
        <article><span>1</span><div><strong>Select Company</strong><small>Use the selector at the top.</small></div></article>
        <article><span>2</span><div><strong>Complete Setup</strong><small>Company, users, rates and drivers.</small></div></article>
        <article><span>3</span><div><strong>Operate Daily</strong><small>Jobs, invoices, payments and reports.</small></div></article>
      </section>

      <section className={styles.guideGrid}>
        {sections.map((section) => (
          <article className={styles.guideCard} key={section.number}>
            <header>
              <span>{section.number}</span>
              <h2>{section.title}</h2>
            </header>
            <ol>
              {section.items.map((item) => <li key={item}>{item}</li>)}
            </ol>
          </article>
        ))}
      </section>

      <section className={styles.helpBox}>
        <div>
          <span>COMMON CHECKS</span>
          <h2>When something does not appear</h2>
        </div>
        <ul>
          <li>Refresh the page and confirm the selected company.</li>
          <li>Confirm the user has an active profile and company access.</li>
          <li>Confirm the record belongs to the selected company.</li>
          <li>Sign out and sign in again after permission changes.</li>
          <li>Contact the root administrator before changing database settings.</li>
        </ul>
      </section>
    </main>
  );
}
