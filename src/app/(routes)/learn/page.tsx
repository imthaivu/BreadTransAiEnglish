import { LearnStoriesPage } from "../stories/page";
import { parseLearnTabParam } from "@/lib/learn-tabs";

export const dynamic = "force-dynamic";

export default async function LearnPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  return <LearnStoriesPage initialTab={parseLearnTabParam(tab)} />;
}
