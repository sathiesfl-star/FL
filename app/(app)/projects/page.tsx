import { getActiveProfile } from "@/lib/account";
import { searchActiveProjects, isLiveMode } from "@/lib/freelancer";
import { scoreProject, passesProfile, type ProfileFilter } from "@/lib/relevance";
import { matchKeywordsFor } from "@/lib/skills";
import { ProjectFeed } from "@/components/ProjectFeed";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const profile = await getActiveProfile();
  const filter: ProfileFilter = {
    skills: profile.skills,
    minBudgetUsd: profile.minBudgetUsd,
    maxBudgetUsd: profile.maxBudgetUsd,
    projectTypes: profile.projectTypes,
    avoid: profile.avoid,
  };

  // Fetch active projects (mock unless FREELANCER_MODE=live). Query by the profile's keywords.
  const keywords = matchKeywordsFor(profile.skills);
  let fetchError: string | null = null;
  let raw: Awaited<ReturnType<typeof searchActiveProjects>> = [];
  try {
    raw = await searchActiveProjects({ query: undefined, limit: 60 });
  } catch (e) {
    fetchError = e instanceof Error ? e.message : "Fetch failed";
  }

  const scored = raw
    .filter((p) => passesProfile(p, filter))
    .map((p) => scoreProject(p, filter))
    .sort((a, b) => b.matchScore - a.matchScore);

  return (
    <ProjectFeed
      projects={scored}
      mode={isLiveMode() ? "live" : "mock"}
      profileSkillCount={profile.skills.length}
      keywordCount={keywords.length}
      fetchError={fetchError}
    />
  );
}
