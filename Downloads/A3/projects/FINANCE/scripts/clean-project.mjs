import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const removed = [];

function remove(target) {
  const fullPath = path.join(root, target);
  if (!fs.existsSync(fullPath)) return;
  fs.rmSync(fullPath, { recursive: true, force: true });
  removed.push(target);
}

for (const obsolete of [
  "supabase/migrations/010A_limousine_legacy_rule_name_compatibility.sql",
  "supabase/migrations/010B_limousine_charge_type_constraint_compatibility.sql",
  "supabase/migrations/010C_limousine_extra_charge_rules_total_compatibility.sql",
  ".next",
  "tsconfig.tsbuildinfo",
]) {
  remove(obsolete);
}

if (removed.length) {
  console.log("Removed stale files:");
  removed.forEach((item) => console.log(`- ${item}`));
} else {
  console.log("No stale legacy or build-cache files were found.");
}

console.log("Dependencies in node_modules are intentionally preserved for local verification and builds.");
