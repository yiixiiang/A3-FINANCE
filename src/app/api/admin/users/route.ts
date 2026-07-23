import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  areCompaniesInScope,
  requireAdministratorScope,
  type AdministratorScope,
} from "@/lib/admin-scope";

export const dynamic = "force-dynamic";

type AppRole = "administrator" | "finance" | "viewer" | "user";
type AppStatus = "active" | "inactive";

type UserPayload = {
  action?: "create" | "update" | "reset_password";
  user_id?: string;
  email?: string;
  password?: string;
  full_name?: string;
  phone?: string;
  job_title?: string;
  notes?: string;
  role?: AppRole;
  status?: AppStatus;
  company_ids?: number[];
};

type AdminClient = ReturnType<typeof createAdminClient>;

type AccessRow = {
  user_id: string;
  company_id: number;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
};

const validRoles = new Set<AppRole>(["administrator", "finance", "viewer", "user"]);
const validStatuses = new Set<AppStatus>(["active", "inactive"]);

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function normaliseCompanyIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

function permissionTemplate(role: AppRole) {
  if (role === "administrator") {
    return { can_view: true, can_create: true, can_edit: true, can_delete: true };
  }
  if (role === "finance") {
    return { can_view: true, can_create: true, can_edit: true, can_delete: false };
  }
  if (role === "user") {
    return { can_view: true, can_create: true, can_edit: false, can_delete: false };
  }
  return { can_view: true, can_create: false, can_edit: false, can_delete: false };
}

async function replaceScopedCompanyAccess(
  admin: AdminClient,
  scope: AdministratorScope,
  userId: string,
  companyIds: number[],
  role: AppRole,
) {
  const { error: deleteError } = await admin
    .from("user_company_access")
    .delete()
    .eq("user_id", userId)
    .in("company_id", scope.companyIds);

  if (deleteError) throw new Error(deleteError.message);
  if (companyIds.length === 0) return;

  const permission = permissionTemplate(role);
  const rows = companyIds.map((companyId) => ({
    user_id: userId,
    company_id: companyId,
    ...permission,
  }));

  const { error: insertError } = await admin
    .from("user_company_access")
    .upsert(rows, { onConflict: "user_id,company_id" });
  if (insertError) throw new Error(insertError.message);
}

async function getTargetAccess(admin: AdminClient, userId: string): Promise<AccessRow[]> {
  const { data, error } = await admin
    .from("user_company_access")
    .select("user_id,company_id,can_view,can_create,can_edit,can_delete")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []) as AccessRow[];
}

function targetIsFullyInScope(scope: AdministratorScope, rows: AccessRow[]) {
  return rows.length > 0 && rows.every((row) => scope.companyIds.includes(Number(row.company_id)));
}

async function writeAudit(
  admin: AdminClient,
  actorUserId: string,
  action: string,
  targetUserId: string,
  details: Record<string, unknown> = {},
) {
  await admin.from("audit_logs").insert({
    actor_user_id: actorUserId,
    action,
    target_table: "profiles",
    target_user_id: targetUserId,
    target_record_id: targetUserId,
    details,
  });
}

export async function GET() {
  const scope = await requireAdministratorScope();
  if (!scope) return jsonError("Administrator access is required.", 403);
  if (scope.companyIds.length === 0) {
    return jsonError("No company is assigned to this administrator.", 403);
  }

  try {
    const admin = createAdminClient();
    const [scopedAccessResult, companiesResult] = await Promise.all([
      admin
        .from("user_company_access")
        .select("user_id,company_id,can_view,can_create,can_edit,can_delete")
        .in("company_id", scope.companyIds),
      admin
        .from("companies")
        .select("id,name,company_type,status")
        .in("id", scope.companyIds)
        .order("name"),
    ]);

    if (scopedAccessResult.error) return jsonError(scopedAccessResult.error.message, 500);
    if (companiesResult.error) return jsonError(companiesResult.error.message, 500);

    const candidateUserIds = [
      ...new Set((scopedAccessResult.data ?? []).map((row) => String(row.user_id))),
    ];
    if (!candidateUserIds.includes(scope.user.id)) candidateUserIds.push(scope.user.id);

    if (candidateUserIds.length === 0) {
      return NextResponse.json({ users: [], companies: companiesResult.data ?? [] });
    }

    const [authResult, profilesResult, allCandidateAccessResult] = await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      admin
        .from("profiles")
        .select(
          "id,email,full_name,phone,job_title,notes,role,status,active_company_id,created_at,updated_at",
        )
        .in("id", candidateUserIds)
        .neq("role", "driver")
        .order("created_at"),
      admin
        .from("user_company_access")
        .select("user_id,company_id,can_view,can_create,can_edit,can_delete")
        .in("user_id", candidateUserIds),
    ]);

    if (authResult.error) return jsonError(authResult.error.message, 500);
    if (profilesResult.error) return jsonError(profilesResult.error.message, 500);
    if (allCandidateAccessResult.error) return jsonError(allCandidateAccessResult.error.message, 500);

    const authUsers = new Map<string, User>(authResult.data.users.map((user) => [user.id, user]));
    const accessByUser = new Map<string, AccessRow[]>();
    for (const access of (allCandidateAccessResult.data ?? []) as AccessRow[]) {
      const rows = accessByUser.get(access.user_id) ?? [];
      rows.push(access);
      accessByUser.set(access.user_id, rows);
    }

    const users = (profilesResult.data ?? [])
      .filter((profile) => {
        const rows = accessByUser.get(profile.id) ?? [];
        return profile.id === scope.user.id || targetIsFullyInScope(scope, rows);
      })
      .map((profile) => {
        const authUser = authUsers.get(profile.id);
        const companyAccess = (accessByUser.get(profile.id) ?? []).filter((access) =>
          scope.companyIds.includes(Number(access.company_id)),
        );
        return {
          ...profile,
          email: authUser?.email ?? profile.email ?? "",
          last_sign_in_at: authUser?.last_sign_in_at ?? null,
          email_confirmed_at: authUser?.email_confirmed_at ?? null,
          company_access: companyAccess,
          is_current_user: profile.id === scope.user.id,
        };
      });

    return NextResponse.json({ users, companies: companiesResult.data ?? [] });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to load users.", 500);
  }
}

export async function POST(request: Request) {
  const scope = await requireAdministratorScope();
  if (!scope) return jsonError("Administrator access is required.", 403);
  if (scope.companyIds.length === 0) {
    return jsonError("No company is assigned to this administrator.", 403);
  }

  let body: UserPayload;
  try {
    body = (await request.json()) as UserPayload;
  } catch {
    return jsonError("Invalid request body.");
  }

  const admin = createAdminClient();
  const action = body.action;

  try {
    if (action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const fullName = String(body.full_name ?? "").trim();
      const role = body.role ?? "user";
      const status = body.status ?? "active";
      const companyIds = normaliseCompanyIds(body.company_ids);

      if (!email || !email.includes("@")) return jsonError("Enter a valid email address.");
      if (password.length < 8) {
        return jsonError("Temporary password must contain at least 8 characters.");
      }
      if (!fullName) return jsonError("Full name is required.");
      if (!validRoles.has(role)) return jsonError("Invalid user role.");
      if (!validStatuses.has(status)) return jsonError("Invalid user status.");
      if (companyIds.length === 0) return jsonError("Assign at least one company to this user.");
      if (!areCompaniesInScope(scope, companyIds)) {
        return jsonError("You can only assign companies available to your administrator account.", 403);
      }

      const { data: createResult, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (createError || !createResult.user) {
        return jsonError(createError?.message ?? "Unable to create the authentication account.");
      }

      const newUserId = createResult.user.id;
      const { error: profileError } = await admin.from("profiles").upsert({
        id: newUserId,
        email,
        full_name: fullName,
        phone: String(body.phone ?? "").trim() || null,
        job_title: String(body.job_title ?? "").trim() || null,
        notes: String(body.notes ?? "").trim() || null,
        role,
        status,
        active_company_id: companyIds[0],
      });

      if (profileError) {
        await admin.auth.admin.deleteUser(newUserId);
        return jsonError(profileError.message, 500);
      }

      await replaceScopedCompanyAccess(admin, scope, newUserId, companyIds, role);

      if (status === "inactive") {
        await admin.auth.admin.updateUserById(newUserId, { ban_duration: "876000h" });
      }

      await writeAudit(admin, scope.user.id, "user_created", newUserId, {
        role,
        status,
        company_ids: companyIds,
      });

      return NextResponse.json({ success: true, user_id: newUserId });
    }

    if (action === "update") {
      const userId = String(body.user_id ?? "");
      const fullName = String(body.full_name ?? "").trim();
      const role = body.role ?? "user";
      const status = body.status ?? "active";
      const companyIds = normaliseCompanyIds(body.company_ids);

      if (!userId) return jsonError("User ID is required.");
      if (!fullName) return jsonError("Full name is required.");
      if (!validRoles.has(role)) return jsonError("Invalid user role.");
      if (!validStatuses.has(status)) return jsonError("Invalid user status.");
      if (companyIds.length === 0) return jsonError("Assign at least one company to this user.");
      if (!areCompaniesInScope(scope, companyIds)) {
        return jsonError("You can only assign companies available to your administrator account.", 403);
      }
      if (userId === scope.user.id && status === "inactive") {
        return jsonError("You cannot deactivate your own administrator account.");
      }

      const targetAccess = await getTargetAccess(admin, userId);
      if (userId !== scope.user.id && !targetIsFullyInScope(scope, targetAccess)) {
        return jsonError("User profile was not found in your assigned companies.", 404);
      }

      const { data: existing, error: existingError } = await admin
        .from("profiles")
        .select("role,status")
        .eq("id", userId)
        .neq("role", "driver")
        .maybeSingle();
      if (existingError) return jsonError(existingError.message, 500);
      if (!existing) return jsonError("User profile was not found.", 404);

      if (existing.role === "administrator" && role !== "administrator") {
        const { count } = await admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "administrator")
          .eq("status", "active");
        if ((count ?? 0) <= 1) {
          return jsonError("The system must keep at least one active administrator.");
        }
      }

      const { error: profileError } = await admin
        .from("profiles")
        .update({
          full_name: fullName,
          phone: String(body.phone ?? "").trim() || null,
          job_title: String(body.job_title ?? "").trim() || null,
          notes: String(body.notes ?? "").trim() || null,
          role,
          status,
          active_company_id: companyIds[0],
        })
        .eq("id", userId);
      if (profileError) return jsonError(profileError.message, 500);

      const { error: authError } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: { full_name: fullName },
        ban_duration: status === "inactive" ? "876000h" : "none",
      });
      if (authError) return jsonError(authError.message, 500);

      await replaceScopedCompanyAccess(admin, scope, userId, companyIds, role);
      await writeAudit(admin, scope.user.id, "user_updated", userId, {
        role,
        status,
        company_ids: companyIds,
      });

      return NextResponse.json({ success: true });
    }

    if (action === "reset_password") {
      const userId = String(body.user_id ?? "");
      const password = String(body.password ?? "");
      if (!userId) return jsonError("User ID is required.");
      if (password.length < 8) return jsonError("New password must contain at least 8 characters.");

      const targetAccess = await getTargetAccess(admin, userId);
      if (userId !== scope.user.id && !targetIsFullyInScope(scope, targetAccess)) {
        return jsonError("User profile was not found in your assigned companies.", 404);
      }

      const { data: targetProfile, error: targetProfileError } = await admin
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .neq("role", "driver")
        .maybeSingle();
      if (targetProfileError) return jsonError(targetProfileError.message, 500);
      if (!targetProfile) return jsonError("User profile was not found.", 404);

      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return jsonError(error.message, 500);

      await writeAudit(admin, scope.user.id, "password_reset_by_administrator", userId);
      return NextResponse.json({ success: true });
    }

    return jsonError("Unsupported action.");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "User operation failed.", 500);
  }
}
