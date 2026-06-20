import { triggerPdfDownload } from "@/app/shiftbuilder/print/exportPdf";

export type OperatorOnboardingCardInput = {
  operatorName: string;
  username: string;
  temporaryPin: string;
  issuedAt?: Date;
};

function formatIssuedAt(d: Date): string {
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Portrait index-card PDF for in-person operator onboarding handoff. */
export async function buildOperatorOnboardingPdf(
  input: OperatorOnboardingCardInput,
): Promise<Blob> {
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageW = pdf.internal.pageSize.getWidth();
  const margin = 48;
  const contentW = pageW - margin * 2;
  const issued = input.issuedAt ?? new Date();

  pdf.setFillColor(18, 18, 20);
  pdf.rect(0, 0, pageW, 96, "F");

  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("Gun Lake Casino Resort", margin, 40);
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "normal");
  pdf.text("ShiftBuilder · Operator onboarding", margin, 58);

  pdf.setTextColor(30, 30, 32);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.text("Temporary access card", margin, 130);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.setTextColor(80, 80, 86);
  pdf.text("Hand this card to the operator in person. Do not email or text the PIN.", margin, 152);

  pdf.setDrawColor(184, 151, 8);
  pdf.setLineWidth(1.5);
  pdf.roundedRect(margin, 178, contentW, 148, 12, 12, "S");

  pdf.setTextColor(30, 30, 32);
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  pdf.text("OPERATOR", margin + 20, 206);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(16);
  pdf.text(input.operatorName, margin + 20, 228);

  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  pdf.text("USERNAME", margin + 20, 254);
  pdf.setFont("courier", "normal");
  pdf.setFontSize(14);
  pdf.text(`@${input.username}`, margin + 20, 272);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("TEMPORARY PIN (6 digits)", margin + 20, 298);
  pdf.setFont("courier", "bold");
  pdf.setFontSize(32);
  pdf.setTextColor(12, 110, 62);
  pdf.text(input.temporaryPin, margin + 20, 318);

  pdf.setTextColor(30, 30, 32);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  const steps = [
    "1. Open ShiftBuilder at the ops kiosk or supervisor station.",
    "2. Enter the temporary PIN at the login screen.",
    "3. Choose a personal 6-digit PIN when prompted.",
    "4. Destroy this card after the operator has logged in successfully.",
  ];
  let y = 360;
  pdf.setFont("helvetica", "bold");
  pdf.text("First login steps", margin, y);
  y += 18;
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(70, 70, 76);
  for (const line of steps) {
    pdf.text(line, margin, y);
    y += 16;
  }

  pdf.setFontSize(10);
  pdf.setTextColor(120, 120, 128);
  pdf.text(`Issued: ${formatIssuedAt(issued)}`, margin, y + 12);
  pdf.text("Temporary PIN expires 72 hours after issue.", margin, y + 26);
  pdf.text("If lost, a sudo_admin can issue a new temporary PIN.", margin, y + 40);

  return pdf.output("blob");
}

export async function downloadOperatorOnboardingPdf(
  input: OperatorOnboardingCardInput,
): Promise<void> {
  const slug = input.username.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "operator";
  const blob = await buildOperatorOnboardingPdf(input);
  triggerPdfDownload(blob, `ShiftBuilder-Onboarding-${slug}.pdf`);
}