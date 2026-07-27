import { NextRequest, NextResponse } from "next/server";
import { createClient, type User } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";

const PRIMARY_ADMIN_EMAIL = "admin@a3group.sg";

type CloudUserRequest = {
  email?: string;
  password?: string;
  name?: string;
  username?: string;
  role?: string;
};

function adminClient() {
  if (!supabaseUrl || !secretKey) {
    throw new Error("Supabase server environment variables are missing.");
  }

  return createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

async function verifyAdministrator(request: NextRequest): Promise<void> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    throw new Error("Cloud administrator session is missing.");
  }

  if (!supabaseUrl || !publishableKey) {
    throw new Error("Supabase public environment variables are missing.");
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Cloud administrator session is invalid.");
  }

  const user = (await response.json()) as {
    email?: string;
  };

  if (user.email?.toLowerCase() !== PRIMARY_ADMIN_EMAIL) {
    throw new Error("Only the primary administrator may manage cloud users.");
  }
}

export async function POST(request: NextRequest) {
  try {
    await verifyAdministrator(request);

    const body = (await request.json()) as CloudUserRequest;
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    const name = body.name?.trim() ?? "";
    const username = body.username?.trim().toLowerCase() ?? "";
    const role = body.role?.trim() ?? "DRIVER";

    if (!email.includes("@")) {
      return NextResponse.json(
        { ok: false, message: "A valid email address is required." },
        { status: 400 },
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { ok: false, message: "Password must contain at least 6 characters." },
        { status: 400 },
      );
    }

    const supabase = adminClient();

    const {
      data: { users },
      error: listError,
    } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listError) {
      throw listError;
    }

    const existingUser = users.find(
      (user: User) => user.email?.toLowerCase() === email,
    );

    if (existingUser) {
      const { data, error } =
        await supabase.auth.admin.updateUserById(existingUser.id, {
          password,
          email_confirm: true,
          user_metadata: {
            name,
            username,
            role,
            application: "A3 Finance",
          },
        });

      if (error) {
        throw error;
      }

      return NextResponse.json({
        ok: true,
        created: false,
        userId: data.user.id,
        message: "Existing Supabase user updated.",
      });
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        username,
        role,
        application: "A3 Finance",
      },
    });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      ok: true,
      created: true,
      userId: data.user.id,
      message: "Supabase user created automatically.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cloud user setup failed.";

    return NextResponse.json(
      { ok: false, message },
      { status: 500 },
    );
  }
}
