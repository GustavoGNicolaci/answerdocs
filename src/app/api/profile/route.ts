import { z } from "zod";
import {
  ACCOUNT_DELETE_CONFIRMATION,
  sanitizeDisplayName,
  verifyCurrentPassword,
} from "@/lib/account";
import { requireAuthenticatedUser } from "@/lib/auth";
import { badRequest, toResponseError } from "@/lib/errors";
import {
  normalizeInterfaceLanguage,
  type InterfaceLanguage,
} from "@/lib/interface-language";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase-auth";
import { ensureProfile } from "@/lib/workspace";

export const runtime = "nodejs";

const profileUpdateSchema = z
  .object({
    fullName: z.string().max(120).optional(),
    interfaceLanguage: z.enum(["en", "pt"]).optional(),
  })
  .refine((data) => data.fullName !== undefined || data.interfaceLanguage, {
    message: "Provide a profile field to update.",
  });

const deleteProfileSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  confirmation: z.string().min(1).max(32),
});

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const supabase = getSupabaseAdmin();
    const profile = await ensureProfile(supabase, user);

    return Response.json({ user, profile });
  } catch (error) {
    return toResponseError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const body = profileUpdateSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();

    await ensureProfile(supabase, user);

    const update: {
      full_name?: string;
      interface_language?: InterfaceLanguage;
      updated_at: string;
    } = {
      updated_at: new Date().toISOString(),
    };

    if (body.fullName !== undefined) {
      update.full_name = sanitizeDisplayName(body.fullName);
    }

    if (body.interfaceLanguage) {
      update.interface_language = normalizeInterfaceLanguage(
        body.interfaceLanguage,
      );
    }

    const { data, error } = await supabase
      .from("profiles")
      .update(update)
      .eq("id", user.id)
      .select("id,full_name,email,created_at,updated_at,interface_language")
      .single();

    if (error) throw new Error("Could not update profile.");

    if (update.full_name !== undefined) {
      const authClient = await createSupabaseServerClient();
      const { error: metadataError } = await authClient.auth.updateUser({
        data: { full_name: data.full_name },
      });

      if (metadataError) throw new Error("Could not update profile.");
    }

    return Response.json({ profile: data });
  } catch (error) {
    return toResponseError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const body = deleteProfileSchema.parse(await request.json());

    if (body.confirmation !== ACCOUNT_DELETE_CONFIRMATION) {
      throw badRequest('Type "DELETE" to confirm account deletion.');
    }

    const profile = await ensureProfile(getSupabaseAdmin(), user);
    await verifyCurrentPassword({
      email: user.email ?? profile.email,
      password: body.currentPassword,
    });

    const authClient = await createSupabaseServerClient();
    await authClient.auth.signOut({ scope: "global" });

    const { error } = await getSupabaseAdmin().auth.admin.deleteUser(
      user.id,
      false,
    );

    if (error) throw new Error("Could not delete account.");

    return Response.json({ ok: true });
  } catch (error) {
    return toResponseError(error);
  }
}
