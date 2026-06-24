// v1.0.0 — Production Release — UI frozen & shipped June 24 2026
import { readFloorGuideMarkdown } from "@/lib/shiftbuilder/floorGuideContent";
import HelpPageClient from "./HelpPageClient";

export const metadata = {
  title: "ShiftBuilder Help — Floor Guide & Tutorial",
  description: "Gun Lake Casino ShiftBuilder floor guide and interactive grave-shift tutorial.",
};

export default function ShiftBuilderHelpPage() {
  const markdown = readFloorGuideMarkdown();
  return <HelpPageClient markdown={markdown} />;
}