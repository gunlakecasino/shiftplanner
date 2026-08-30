import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SheetBuilder Golden Print",
  robots: { index: false, follow: false },
};

export { default } from "../../../shiftbuilder/print/golden/page";
