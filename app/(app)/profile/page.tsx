import { getActiveProfile } from "@/lib/account";
import { SKILLS } from "@/lib/skills";
import { ProfileEditor } from "@/components/ProfileEditor";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const profile = await getActiveProfile();
  return <ProfileEditor profile={profile} skills={SKILLS} />;
}
