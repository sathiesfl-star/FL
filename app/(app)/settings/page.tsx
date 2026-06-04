import { getAgencyProfile } from "@/lib/agency-profile";
import { resolveProvider } from "@/lib/ai";
import { AgencyProfileEditor } from "@/components/AgencyProfileEditor";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const profile = await getAgencyProfile();
  return <AgencyProfileEditor profile={profile} aiStatus={resolveProvider()} />;
}
