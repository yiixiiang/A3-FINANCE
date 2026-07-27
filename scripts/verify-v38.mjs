import fs from 'node:fs';
const required=['supabase/V38-COMPLETE-UPGRADE.sql','supabase/migrations/v29-database-first.sql','supabase/migrations/v38-reporting-forecast.sql','src/lib/v38/finance-repository.ts','src/lib/v38/accounting.ts'];
const missing=required.filter(x=>!fs.existsSync(new URL('../'+x,import.meta.url)));
if(missing.length){console.error('Missing V38 files:',missing);process.exit(1)}
console.log('A3 Finance V38 package structure verified.');
