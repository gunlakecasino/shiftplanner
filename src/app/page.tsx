// v1.0.0 — Production Release — UI frozen & shipped June 24 2026
import { redirect } from "next/navigation";

/** ShiftBuilder is the sole OMS surface — legacy hub routes redirect via next.config. */
export default function RootPage() {
  redirect("/shiftbuilder");
}