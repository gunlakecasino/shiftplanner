import { BuilderLoadingShell } from "./components/builderPrimitives";

/**
 * Route-level loading shell — matches the live canvas chrome while the client bundle loads.
 */
export default function ShiftBuilderLoading() {
  return <BuilderLoadingShell />;
}
