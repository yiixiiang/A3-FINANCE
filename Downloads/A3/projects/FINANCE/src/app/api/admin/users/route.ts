import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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

const validRoles = new Set<AppRole>(["administrator", "finance", "viewer", "user"]);
const validStatuses = new Set<AppStatus>(["active", "inactive"]);

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function requireAdministrator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "administrator" || profile.status !== "active") return null;
  return user;
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

async function replaceCompanyAccess(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  companyIds: number[],
  role: AppRole,
) {
  const { error: deleteError } = await admin
    .from("user_company_access")
    .delete()
    .eq("user_id", userId);

  if (deleteError) throw new Error(deleteError.message);
  if (companyIds.length === 0) return;

  const permission = permissionTemplate(role);
  const rows = companyIds.map((companyId) => ({
    user_id: userId,
    company_id: companyId,
    ...permission,
  }));

  const { error: insertError } = await admin.from("user_company_access").insert(rows);
  if (insertError) throw new Error(insertError.message);
}

async function writeAudit(
  admin: ReturnType<typeof createAdminClient>,
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
  const currentUser = await requireAdministrator();
  if (!currentUser) return jsonError("Administrator access is required.", 403);

  try {
    const admin = createAdminClient();
    const [authResult, profilesResult, accessResult, companiesResult] = await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      admin
        .from("profiles")
        .select("id, email, full_name, phone, job_title, notes, role, status, active_company_id, created_at, updated_at")
        .neq("role", "driver")
        .order("created_at"),
      admin
        .from("user_company_access")
        .select("user_id, company_id, can_view, can_create, can_edit, can_delete"),
      admin.from("companies").select("id, name, company_type, status").order("name"),
    ]);

    if (authResult.error) return jsonError(authResult.error.message, 500);
    if (profilesResult.error) return jsonError(profilesResult.error.message, 500);
    if (accessResult.error) return jsonError(accessResult.error.message, 500);
    if (companiesResult.error) return jsonError(companiesResult.error.message, 500);

    const authUsers = new Map<string, User>(authResult.data.users.map((user) => [user.id, user]));
    const accessByUser = new Map<string, NonNullable<typeof accessResult.data>>();

    for (const access of accessResult.data ?? []) {
      const rows = accessByUser.get(access.user_id) ?? [];
      rows.push(access);
      accessByUser.set(access.user_id, rows);
    }

    const users = (profilesResult.data ?? []).map((profile) => {
      const authUser = authUsers.get(profile.id);
      return {
        ...profile,
        email: authUser?.email ?? profile.email ?? "",
        last_sign_in_at: authUser?.last_sign_in_at ?? null,
        email_confirmed_at: authUser?.email_confirmed_at ?? null,
        company_access: accessByUser.get(profile.id) ?? [],
        is_current_user: profile.id === currentUser.id,
      };
    });

    return NextResponse.json({ users, companies: companiesResult.data ?? [] });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to load users.", 500);
  }
}

export async function POST(request: Request) {
  const currentUser = await requireAdministrator();
  if (!currentUser) return jsonError("Administrator access is required.", 403);

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
      if (password.length < 8) return jsonError("Temporary password must contain at least 8 characters.");
      if (!fullName) return jsonError("Full name is required.");
      if (!validRoles.has(role)) return jsonError("Invalid user role.");
      if (!validStatuses.has(status)) return jsonError("Invalid user status.");
      if (role !== "administrator" && companyIds.length === 0) {
        return jsonError("Assign at least one company to this user.");
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
        active_company_id: companyIds[0] ?? null,
      });

      if (profileError) {
        await admin.auth.admin.deleteUser(newUserId);
        return jsonError(profileError.message, 500);
      }

      await replaceCompanyAccess(admin, newUserId, companyIds, role);

      if (status === "inactive") {
        await admin.auth.admin.updateUserById(newUserId, { ban_duration: "876000h" });
      }

      await writeAudit(admin, currentUser.id, "user_created", newUserId, {
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
      if (role !== "administrator" && companyIds.length === 0) {
        return jsonError("Assign at least one company to this user.");
      }
      if (userId === currentUser.id && status === "inactive") {
        return jsonError("You cannot deactivate your own administrator account.");
      }

      const { data: existing } = await admin
        .from("profiles")
        .select("role, status")
        .eq("id", userId)
        .maybeSingle();

      if (!existing) return jsonError("User profile was not found.", 404);

      if (existing.role === "administrator" && role !== "administrator") {
        const { count } = await admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "administrator")
          .eq("status", "active");
        if ((count ?? 0) <= 1) return jsonError("The system must keep at least one active administrator.");
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
          active_company_id: companyIds[0] ?? null,
        })
        .eq("id", userId);

      if (profileError) return jsonError(profileError.message, 500);

      const { error: authError } = await admin.auth.admin.updateUserById(userId, {
        user_metadata: { full_name: fullName },
        ban_duration: status === "inactive" ? "876000h" : "none",
      });
      if (authError) return jsonError(authError.message, 500);

      await replaceCompanyAccess(admin, userId, companyIds, role);
      await writeAudit(admin, currentUser.id, "user_updated", userId, {
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

      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return jsonError(error.message, 500);

      await writeAudit(admin, currentUser.id, "password_reset_by_administrator", userId);
      return NextResponse.json({ success: true });
    }

    return jsonError("Unsupported action.");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "User operation failed.", 500);
  }
}
