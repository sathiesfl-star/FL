import { getActiveProfile } from "@/lib/account";
import { searchActiveProjects, freelancerMode } from "@/lib/freelancer";
import { scoreProject, passesProfile, type ProfileFilter } from "@/lib/relevance";
import { matchKeywordsFor, skillByKey } from "@/lib/skills";
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

  // Fetch active projects. In RSS mode we pull a keyword feed per selected skill (label),
  // combine + dedupe, to get many more relevant projects than the single "latest" feed.
  const keywords = matchKeywordsFor(profile.skills);
  const feedKeywords = profile.skills
    .map((k) => skillByKey(k)?.label.split(" ")[0]) // first word of each skill label, e.g. "WordPress"
    .filter((s): s is string => !!s);
  let fetchError: string | null = null;
  let raw: Awaited<ReturnType<typeof searchActiveProjects>> = [];
  try {
    raw = await searchActiveProjects({ keywords: feedKeywords, limit: 120 });
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
      mode={freelancerMode()}
      profileSkillCount={profile.skills.length}
      keywordCount={keywords.length}
      fetchError={fetchError}
    />
  );
}
