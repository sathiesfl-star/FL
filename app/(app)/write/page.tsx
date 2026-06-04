import { resolveProvider } from "@/lib/ai";
import { PasteProposal } from "@/components/PasteProposal";

export const dynamic = "force-dynamic";

export default function WritePage() {
  return <PasteProposal aiStatus={resolveProvider()} />;
}
