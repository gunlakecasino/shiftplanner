"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

const ProjectsClient = dynamic(() => import("./ProjectsClient"), {
  ssr: false,
  loading: () => null,
});

export default function ShiftBuilderProjectsPage() {
  // Suspense boundary: ProjectsClient reads useSearchParams(), which requires
  // one at the page level for the route to stay statically renderable.
  return (
    <Suspense fallback={null}>
      <ProjectsClient />
    </Suspense>
  );
}
