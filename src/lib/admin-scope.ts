import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type AdministratorScope = {
  user: User;
  companyIds: number[];
  activeCompanyId: number | null;
};

function uniquePositiveIds(values: unknown[]): number[] {
  return [...new Set(values.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

export async function requireAdministratorScope(): Promise<AdministratorScope | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,status,active_company_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "administrator" || profile.status !== "active") return null;

  const admin = createAdminClient();
  const { data: accessRows, error } = await admin
    .from("user_company_access")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("can_view", true);

  if (error) throw new Error(error.message);

  const activeCompanyId = Number(profile.active_company_id || 0) || null;
  const companyIds = uniquePositiveIds((accessRows ?? []).map((row) => row.company_id));

  return { user, companyIds, activeCompanyId };
}

export function isCompanyInScope(scope: AdministratorScope, companyId: number): boolean {
  return Number.isInteger(companyId) && companyId > 0 && scope.companyIds.includes(companyId);
}

export function areCompaniesInScope(scope: AdministratorScope, companyIds: number[]): boolean {
  return companyIds.every((companyId) => isCompanyInScope(scope, companyId));
}
