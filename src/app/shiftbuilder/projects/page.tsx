"use client";

import dynamic from "next/dynamic";
import { QueryProvider } from "../providers";

const ProjectsClient = dynamic(() => import("./ProjectsClient"), {
  ssr: false,
  loading: () => null,
});

export default function ShiftBuilderProjectsPage() {
  return (
    <QueryProvider>
      <ProjectsClient />
    </QueryProvider>
  );
}
