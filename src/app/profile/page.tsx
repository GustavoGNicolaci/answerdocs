import { redirect } from "next/navigation";
import { ProfileSettings } from "@/components/profile-settings";
import { getOptionalAuthenticatedUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ensureProfile } from "@/lib/workspace";

export default async function ProfilePage() {
  const user = await getOptionalAuthenticatedUser();

  if (!user) {
    redirect("/auth?next=/profile");
  }

  const profile = await ensureProfile(getSupabaseAdmin(), user);

  return <ProfileSettings initialUser={user} initialProfile={profile} />;
}
