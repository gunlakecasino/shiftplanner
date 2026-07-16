import { BuilderLoadingShell } from "./components/builderPrimitives";

/** Auth remains owned by OpsAuthGate; this fills the post-auth route gap. */
export default function ShiftBuilderLoading() {
  return <BuilderLoadingShell label="LOADING" sublabel="Preparing your workspace" />;
}
