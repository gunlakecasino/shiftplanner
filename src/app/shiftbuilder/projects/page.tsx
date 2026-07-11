"use client";

import dynamic from "next/dynamic";

const ProjectsClient = dynamic(() => import("./ProjectsClient"), {
  ssr: false,
  loading: () => null,
});

export default function ShiftBuilderProjectsPage() {
  return <ProjectsClient />;
}
