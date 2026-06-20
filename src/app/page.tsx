import { redirect } from "next/navigation";

/** ShiftBuilder is the sole OMS surface — legacy hub routes redirect via next.config. */
export default function RootPage() {
  redirect("/shiftbuilder");
}