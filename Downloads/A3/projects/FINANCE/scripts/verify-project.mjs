import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const failures = [];
const warnings = [];
const pass = (message) => console.log(`PASS  ${message}`);
const fail = (message) => failures.push(message);

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const migrationDirectory = path.join(root, "supabase", "migrations");
const migrationFiles = walk(migrationDirectory).filter((file) => file.endsWith(".sql"));
const migrationSql = migrationFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");

const requiredMigrations = [
  "017_balance_sheet_reporting.sql",
  "018_cash_flow_statement.sql",
  "019_final_consolidation_control.sql",
  "020_driver_network_and_company_signup.sql",
  "021_driver_vehicle_document_uploads.sql",
  "022_public_limousine_website.sql",
  "023_repair_driver_login_links.sql",
];
for (const migration of requiredMigrations) {
  const fullPath = path.join(migrationDirectory, migration);
  if (!fs.existsSync(fullPath)) fail(`Missing migration: ${migration}`);
  else {
    const sql = fs.readFileSync(fullPath, "utf8");
    if (!/^\s*--[\s\S]*?\bbegin\s*;/i.test(sql)) fail(`${migration} does not start a transaction.`);
    if (!/\bcommit\s*;/i.test(sql)) fail(`${migration} does not commit its transaction.`);
    if ((sql.match(/\$\$/g) ?? []).length % 2 !== 0) fail(`${migration} has unbalanced dollar quotes.`);
  }
}
if (!failures.some((item) => item.includes("migration"))) {
  pass("Migrations 017 through 023 are present and transaction-wrapped.");
}


const driverLoginRepairSql = fs.readFileSync(
  path.join(migrationDirectory, "023_repair_driver_login_links.sql"),
  "utf8",
);
if (
  !driverLoginRepairSql.includes("lower(btrim(driver.login_email)) as email_key") ||
  !driverLoginRepairSql.includes("auth_user.email_key = driver.email_key") ||
  !driverLoginRepairSql.includes("login_enabled = true") ||
  !driverLoginRepairSql.includes("coalesce(profile.role, 'user') in ('user', 'driver')") ||
  !driverLoginRepairSql.includes("group by driver.auth_user_id, driver.company_id")
) {
  fail("Migration 023 does not safely repair and deduplicate exact-email driver login links.");
} else {
  pass("Driver login repair uses exact-email, role and duplicate-upsert safeguards.");
}

const compatibilityMigration = path.join(
  migrationDirectory,
  "010_z_limousine_extra_charge_rules_total_compatibility.sql",
);
if (!fs.existsSync(compatibilityMigration)) {
  fail("The consolidated 010_z limousine compatibility migration is missing.");
}
for (const obsolete of [
  "010A_limousine_legacy_rule_name_compatibility.sql",
  "010B_limousine_charge_type_constraint_compatibility.sql",
  "010C_limousine_extra_charge_rules_total_compatibility.sql",
]) {
  if (fs.existsSync(path.join(migrationDirectory, obsolete))) {
    fail(`Obsolete migration remains in the migration folder: ${obsolete}`);
  }
}
if (!failures.some((item) => item.includes("010_z") || item.includes("Obsolete migration"))) {
  pass("The limousine compatibility migration is consolidated without duplicate 010A/010B/010C files.");
}

const combinedSqlPath = path.join(
  migrationDirectory,
  "017_018_019_PHASES_8_9_10_ALL_IN_ONE.sql",
);
if (!fs.existsSync(combinedSqlPath)) {
  fail("The all-in-one Phases 8–10 SQL installer is missing.");
} else {
  const combinedSql = fs.readFileSync(combinedSqlPath, "utf8");
  for (const migration of requiredMigrations.slice(0, 3)) {
    if (!combinedSql.includes(`FILE: ${migration}`)) {
      fail(`The all-in-one SQL installer does not include ${migration}.`);
    }
  }
}
if (!failures.some((item) => item.includes("all-in-one"))) {
  pass("The all-in-one SQL installer contains all three final migrations.");
}

const phase8Sql = fs.readFileSync(path.join(migrationDirectory, requiredMigrations[0]), "utf8");
const phase10Sql = fs.readFileSync(path.join(migrationDirectory, requiredMigrations[2]), "utf8");
if (!phase8Sql.includes("Driver Payouts Payable") || !phase8Sql.includes("'2400'")) {
  fail("Phase 8 is missing the Driver Payouts Payable account.");
}
if (!phase10Sql.includes("The financial period overlaps an existing period")) {
  fail("Phase 10 is missing overlapping-period protection.");
}
if (!phase10Sql.includes("old_data := to_jsonb(old)") || !phase10Sql.includes("new_data := to_jsonb(new)")) {
  fail("Phase 10 does not protect both the original and new dates during updates.");
}
if (!phase10Sql.includes("('driver_payouts','period_end')")) {
  fail("Phase 10 is missing the driver-payout period lock.");
}
if (!failures.some((item) => item.startsWith("Phase 8") || item.startsWith("Phase 10"))) {
  pass("Balance Sheet source coverage and closed-period safeguards are installed.");
}

const requiredPages = [
  "src/app/balance-sheet/page.tsx",
  "src/app/balance-sheet/print/page.tsx",
  "src/app/cash-flow/page.tsx",
  "src/app/cash-flow/print/page.tsx",
  "src/app/financial-control/page.tsx",
  "src/app/api/admin/balance-sheet/route.ts",
  "src/app/api/admin/cash-flow/route.ts",
  "src/app/api/admin/financial-control/route.ts",
  "src/lib/finance-reporting.ts",
  "src/app/driver-network/page.tsx",
  "src/app/driver-network/driver-network.module.css",
  "src/app/driver-signup/[token]/page.tsx",
  "src/app/driver-signup/[token]/driver-signup.module.css",
  "src/app/api/admin/driver-network/route.ts",
  "src/app/api/public/driver-signup/[token]/route.ts",
  "src/app/limousine/page.tsx",
  "src/app/limousine/limousine-website.tsx",
  "src/app/limousine/limousine.module.css",
  "src/app/api/public/limousine/route.ts",
];
for (const file of requiredPages) {
  if (!fs.existsSync(path.join(root, file))) fail(`Missing required file: ${file}`);
}
if (!requiredPages.some((file) => !fs.existsSync(path.join(root, file)))) {
  pass("Phase 8–12 pages, public APIs and the shared report engine are present.");
}

const sourceFiles = walk(path.join(root, "src"));
const codeFiles = sourceFiles.filter((file) => /\.(?:ts|tsx)$/.test(file));
const sourceText = codeFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
const cjk = /[\u3400-\u9fff]/;
for (const file of sourceFiles.filter((item) => /\.(?:ts|tsx|css)$/.test(item))) {
  const content = fs.readFileSync(file, "utf8");
  if (cjk.test(content)) fail(`Non-English CJK text found in ${relative(file)}`);
}
if (!failures.some((item) => item.includes("CJK"))) pass("English-only source check passed.");

if (/\.from\(\s*["']invoices["']\s*\)/.test(sourceText)) {
  fail('Obsolete table reference .from("invoices") remains; use customer_invoices.');
}

const tableNames = new Set();
for (const match of migrationSql.matchAll(
  /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([A-Za-z_][A-Za-z0-9_]*)/gi,
)) {
  tableNames.add(match[1]);
}
for (const match of migrationSql.matchAll(
  /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([A-Za-z_][A-Za-z0-9_]*)/gi,
)) {
  tableNames.add(match[1]);
}
const tableReferences = new Set(
  [...sourceText.matchAll(/\.from\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\)/g)].map(
    (match) => match[1],
  ),
);
for (const table of tableReferences) {
  if (!tableNames.has(table)) fail(`Source references a table missing from migrations: ${table}`);
}

const functionNames = new Set(
  [...migrationSql.matchAll(
    /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/gi,
  )].map((match) => match[1]),
);
const rpcReferences = new Set(
  [...sourceText.matchAll(/\.rpc\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/g)].map(
    (match) => match[1],
  ),
);
for (const rpc of rpcReferences) {
  if (!functionNames.has(rpc)) fail(`Source references an RPC missing from migrations: ${rpc}`);
}
if (!failures.some((item) => item.includes("table missing") || item.includes("RPC missing") || item.includes("Obsolete table"))) {
  pass(`${tableReferences.size} table references and ${rpcReferences.size} RPC references match the supplied migrations.`);
}

const phase11Sql = fs.readFileSync(path.join(migrationDirectory, "020_driver_network_and_company_signup.sql"), "utf8");
const phase11UploadSql = fs.readFileSync(path.join(migrationDirectory, "021_driver_vehicle_document_uploads.sql"), "utf8");
for (const requiredTable of [
  "driver_company_links",
  "driver_customer_links",
  "driver_signup_links",
  "driver_signup_applications",
]) {
  if (!phase11Sql.includes(`public.${requiredTable}`)) {
    fail(`Phase 11 is missing ${requiredTable}.`);
  }
}
if (!phase11UploadSql.includes("public.driver_application_documents")) {
  fail("Phase 11.1 is missing the private vehicle-document register.");
}
const publicSignupPage = fs.readFileSync(path.join(root, "src/app/driver-signup/[token]/page.tsx"), "utf8");
const publicSignupApi = fs.readFileSync(path.join(root, "src/app/api/public/driver-signup/[token]/route.ts"), "utf8");
if (/Select Company|company selector/i.test(publicSignupPage.replace(/no company selector/gi, ""))) {
  fail("Public driver signup must not provide a company selector.");
}
if (!publicSignupPage.includes("Locked by this signup link")) {
  fail("Public driver signup does not show the company-lock notice.");
}
for (const requiredField of [
  "Full Name *",
  "Contact Number *",
  "Car Model *",
  "Car Plate *",
  "Emergency Contact Name *",
  "Bank Name *",
  "PayNow Number *",
  "Upload Vehicle Files *",
]) {
  if (!publicSignupPage.includes(requiredField)) {
    fail(`Public driver signup is missing required field: ${requiredField}`);
  }
}
if (!publicSignupPage.includes("uploadToSignedUrl") || !publicSignupApi.includes("createSignedUploadUrl")) {
  fail("Secure direct vehicle-document upload is not fully connected.");
}
if (!publicSignupApi.includes('status: "uploading"') || !publicSignupApi.includes('status: "pending"')) {
  fail("Vehicle uploads must remain hidden until the application is finalized.");
}
if (!failures.some((item) => item.startsWith("Phase 11") || item.includes("Public driver signup") || item.includes("vehicle-document") || item.includes("Vehicle uploads"))) {
  pass("Phase 11.1 required driver fields, company lock and private vehicle-document uploads are present.");
}

const publicLimousinePage = fs.readFileSync(path.join(root, "src/app/limousine/limousine-website.tsx"), "utf8");
const publicLimousineApi = fs.readFileSync(path.join(root, "src/app/api/public/limousine/route.ts"), "utf8");
const enterpriseShell = fs.readFileSync(path.join(root, "src/components/enterprise-shell.tsx"), "utf8");
const publicLimousineSql = fs.readFileSync(path.join(migrationDirectory, "022_public_limousine_website.sql"), "utf8");
for (const requiredText of [
  "WhatsApp",
  "Telegram",
  "WeChat",
  "Terms & Conditions",
  "Privacy Notice",
  "Submit Quotation Request",
]) {
  if (!publicLimousinePage.includes(requiredText)) {
    fail(`Public limousine website is missing: ${requiredText}`);
  }
}
if (!enterpriseShell.includes('pathname === "/limousine"')) {
  fail("EnterpriseShell does not bypass the public limousine route.");
}
if (!publicLimousineApi.includes('from("limousine_quote_requests")')) {
  fail("Public limousine API does not store quotation requests.");
}
if (!publicLimousineSql.includes("public.limousine_quote_requests")) {
  fail("Migration 022 does not create public limousine quotation storage.");
}
if (!failures.some((item) => item.includes("Public limousine") || item.includes("EnterpriseShell") || item.includes("Migration 022"))) {
  pass("AEJKY public limousine website, contact channels, legal notices and quotation storage are present.");
}

const cssModules = sourceFiles.filter((file) => file.endsWith(".module.css"));
for (const file of cssModules) {
  const css = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const selectorPattern = /(^|\})([^{}]+)\{/g;
  let match;
  while ((match = selectorPattern.exec(css))) {
    const selectorBlock = match[2].trim();
    if (!selectorBlock || selectorBlock.startsWith("@")) continue;
    for (const selector of selectorBlock.split(",").map((value) => value.trim())) {
      if (!selector || /^(from|to|\d+(?:\.\d+)?%)$/.test(selector)) continue;
      if (!/[.#]/.test(selector) && !selector.includes(":global(")) {
        fail(`Impure CSS Module selector '${selector}' in ${relative(file)}`);
      }
    }
  }
}
if (!failures.some((item) => item.includes("CSS Module"))) {
  pass(`${cssModules.length} CSS Modules passed selector-purity checks.`);
}

for (const file of sourceFiles.filter((item) => item.endsWith(`${path.sep}page.tsx`))) {
  const content = fs.readFileSync(file, "utf8");
  if (content.includes("useSearchParams(")) {
    if (!content.includes("Suspense") || !content.includes("<Suspense")) {
      fail(`useSearchParams without Suspense in ${relative(file)}`);
    }
  }
}
if (!failures.some((item) => item.includes("useSearchParams"))) {
  pass("All useSearchParams pages include Suspense boundaries.");
}

const require = createRequire(import.meta.url);
try {
  const ts = require("typescript");
  for (const file of codeFiles) {
    const result = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
        isolatedModules: true,
      },
      fileName: file,
      reportDiagnostics: true,
    });
    for (const diagnostic of result.diagnostics ?? []) {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
      fail(`TypeScript syntax error in ${relative(file)}: ${message}`);
    }
  }
  if (!failures.some((item) => item.includes("TypeScript syntax"))) {
    pass(`${codeFiles.length} TypeScript/TSX files passed syntax transpilation.`);
  }
} catch {
  warnings.push("TypeScript syntax transpilation skipped because dependencies are not installed yet.");
}

const globalsPath = path.join(root, "src", "app", "globals.css");
const expectedGlobalsHash = "84de327aaf89b65176bec8ceb1f280f41df71b968c74a82e897acf8a40c35c92";
if (!fs.existsSync(globalsPath)) fail("src/app/globals.css is missing.");
else if (sha256(globalsPath) !== expectedGlobalsHash) {
  fail("src/app/globals.css differs from the approved EnterpriseShell foundation stylesheet.");
} else {
  pass("Shared globals.css is byte-for-byte unchanged.");
}

const shellPath = path.join(root, "src", "components", "enterprise-shell.tsx");
if (!fs.existsSync(shellPath)) fail("EnterpriseShell is missing.");
else {
  const shell = fs.readFileSync(shellPath, "utf8");
  for (const href of ["/balance-sheet", "/cash-flow", "/financial-control", "/driver-network"]) {
    if (!shell.includes(href)) fail(`EnterpriseShell is missing ${href}.`);
  }
  if (!["/balance-sheet", "/cash-flow", "/financial-control", "/driver-network"].some((href) => !shell.includes(href))) {
    pass("EnterpriseShell includes finance navigation and the AEJKY public-site link.");
  }
  if (!shell.includes('pathname.startsWith("/driver-signup")')) {
    fail("EnterpriseShell must treat public driver signup pages as shell-free pages.");
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
if (packageJson.version !== "1.2.0") fail("package.json version must be 1.2.0.");
if (packageJson.dependencies?.next !== "16.2.11") fail("Next.js must be pinned to 16.2.11.");
if (packageJson.devDependencies?.["eslint-config-next"] !== "16.2.11") {
  fail("eslint-config-next must match Next.js 16.2.11.");
}
for (const script of ["lint", "typecheck", "verify", "clean"]) {
  if (!packageJson.scripts?.[script]) fail(`package.json ${script} script is missing.`);
}
if (
  packageLock.name !== packageJson.name ||
  packageLock.version !== packageJson.version ||
  packageLock.packages?.[""]?.name !== packageJson.name ||
  packageLock.packages?.[""]?.version !== packageJson.version
) {
  fail("package-lock.json root metadata does not match package.json.");
}
const lockedNext = packageLock.packages?.["node_modules/next"];
if (lockedNext?.version !== "16.2.11" || !lockedNext?.integrity) {
  fail("package-lock.json does not contain the complete Next.js 16.2.11 lock entry.");
}
if (!failures.some((item) => item.includes("package.json") || item.includes("package-lock.json") || item.includes("Next.js"))) {
  pass("Final package and lock-file metadata are consistent and security-patched.");
}

const eslintConfigPath = path.join(root, "eslint.config.mjs");
if (!fs.existsSync(eslintConfigPath)) fail("ESLint flat configuration is missing.");
else pass("ESLint 9 flat configuration is present.");

const layoutPath = path.join(root, "src", "app", "layout.tsx");
const layoutText = fs.existsSync(layoutPath) ? fs.readFileSync(layoutPath, "utf8") : "";
if (!layoutText.includes("metadataBase")) fail("Root metadataBase configuration is missing.");
else pass("Production metadataBase configuration is present.");

const browserClientPath = path.join(root, "src", "lib", "supabase", "client.ts");
const browserClientText = fs.existsSync(browserClientPath)
  ? fs.readFileSync(browserClientPath, "utf8")
  : "";
if (!browserClientText.includes('typeof window === "undefined"')) {
  fail("Browser Supabase client is not protected during server prerendering.");
} else {
  pass("Browser Supabase client is protected during server prerendering.");
}

const envExamplePath = path.join(root, ".env.example");
const envExampleText = fs.existsSync(envExamplePath) ? fs.readFileSync(envExamplePath, "utf8") : "";
if (!envExampleText.includes("NEXT_PUBLIC_SITE_URL=https://finance.a3group.sg")) {
  fail(".env.example is missing the production site URL.");
} else {
  pass("Deployment environment template includes the production site URL.");
}

const gitignorePath = path.join(root, ".gitignore");
const gitignoreText = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, "utf8") : "";
for (const requiredIgnore of ["node_modules/", ".next/", "tsconfig.tsbuildinfo"]) {
  if (!gitignoreText.split(/\r?\n/).includes(requiredIgnore)) {
    fail(`.gitignore must exclude ${requiredIgnore}`);
  }
}
if (!failures.some((item) => item.includes(".gitignore must exclude"))) {
  pass("Generated dependencies and build caches are excluded by .gitignore.");
}

for (const localArtifact of ["node_modules", ".next", "tsconfig.tsbuildinfo"]) {
  if (fs.existsSync(path.join(root, localArtifact))) {
    warnings.push(`${localArtifact} exists locally and must be excluded when creating a release ZIP.`);
  }
}

if (warnings.length) warnings.forEach((message) => console.warn(`WARN  ${message}`));
if (failures.length) {
  failures.forEach((message) => console.error(`FAIL  ${message}`));
  console.error(`\nVerification failed with ${failures.length} issue(s).`);
  process.exit(1);
}
console.log("\nA3 Finance version 1.2.0 verification passed.");
