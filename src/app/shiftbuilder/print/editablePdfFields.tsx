import React from "react";
import type {
  AcroFormTextField,
  jsPDF,
} from "jspdf";
import {
  GOLDEN_HEIGHT_PX,
  GOLDEN_WIDTH_PX,
} from "./goldenConstants";

const TM_FIELD_SELECTOR = '[data-pdf-tm-field="true"]';
const TM_SOURCE_SELECTOR = '[data-pdf-tm-source="true"]';

export type EditablePdfTmField = {
  slotKey: string;
  value: string;
  xPx: number;
  yPx: number;
  widthPx: number;
  heightPx: number;
  fontSizePx: number;
  color: string;
};

export type PdfImagePlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfTmFieldPlacement = {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
};

export function EditablePdfTmFieldAnchor({
  slotKey,
  value,
  fontSizePx,
  color = "#111111",
  style,
}: {
  slotKey: string;
  value?: string | null;
  fontSizePx: number;
  color?: string;
  style: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      data-pdf-tm-field="true"
      data-pdf-slot-key={slotKey}
      data-pdf-value={value?.trim() ?? ""}
      data-pdf-font-size={fontSizePx}
      data-pdf-color={color}
      style={{
        position: "absolute",
        display: "block",
        visibility: "hidden",
        pointerEvents: "none",
        ...style,
      }}
    />
  );
}

export const EDITABLE_PDF_TM_SOURCE_ATTR = {
  "data-pdf-tm-source": "true",
} as const;

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Capture field rectangles after the Golden artboard has reached its final
 * export geometry, then hide only the name/open-work source text before the
 * raster background is produced.
 */
export function collectAndSuppressEditableTmFields(
  artboard: HTMLElement,
): EditablePdfTmField[] {
  const artboardRect = artboard.getBoundingClientRect();
  if (artboardRect.width <= 0 || artboardRect.height <= 0) return [];

  const scaleX = GOLDEN_WIDTH_PX / artboardRect.width;
  const scaleY = GOLDEN_HEIGHT_PX / artboardRect.height;

  const fields = Array.from(
    artboard.querySelectorAll<HTMLElement>(TM_FIELD_SELECTOR),
  )
    .map((element): EditablePdfTmField | null => {
      const rect = element.getBoundingClientRect();
      const slotKey = element.dataset.pdfSlotKey?.trim();
      if (!slotKey || rect.width <= 0 || rect.height <= 0) return null;

      const xPx = Math.max(0, (rect.left - artboardRect.left) * scaleX);
      const yPx = Math.max(0, (rect.top - artboardRect.top) * scaleY);
      const widthPx = Math.min(rect.width * scaleX, GOLDEN_WIDTH_PX - xPx);
      const heightPx = Math.min(rect.height * scaleY, GOLDEN_HEIGHT_PX - yPx);
      if (widthPx <= 0 || heightPx <= 0) return null;

      return {
        slotKey,
        value: element.dataset.pdfValue ?? "",
        xPx,
        yPx,
        widthPx,
        heightPx,
        fontSizePx: finitePositive(
          Number(element.dataset.pdfFontSize),
          16,
        ),
        color: element.dataset.pdfColor?.trim() || "#111111",
      };
    })
    .filter((field): field is EditablePdfTmField => field !== null);

  artboard
    .querySelectorAll<HTMLElement>(TM_SOURCE_SELECTOR)
    .forEach((element) => {
      element.style.visibility = "hidden";
    });

  return fields;
}

export function mapEditableTmFieldToPdf(
  field: EditablePdfTmField,
  placement: PdfImagePlacement,
): PdfTmFieldPlacement {
  const scaleX = placement.width / GOLDEN_WIDTH_PX;
  const scaleY = placement.height / GOLDEN_HEIGHT_PX;
  return {
    x: placement.x + field.xPx * scaleX,
    y: placement.y + field.yPx * scaleY,
    width: field.widthPx * scaleX,
    height: field.heightPx * scaleY,
    fontSize: Math.max(6, field.fontSizePx * Math.min(scaleX, scaleY)),
  };
}

export function editableTmPdfFieldName(
  pageIndex: number,
  fieldIndex: number,
  slotKey: string,
): string {
  const safeSlot = slotKey.replace(/[^A-Za-z0-9_-]/g, "_");
  return `tm_${pageIndex + 1}_${safeSlot}_${fieldIndex + 1}`;
}

export function addEditableTmFieldsToPdf(
  pdf: jsPDF,
  TextField: typeof AcroFormTextField,
  fields: EditablePdfTmField[],
  placement: PdfImagePlacement,
  pageIndex: number,
): void {
  pdf.setFont("helvetica", "bold");
  const fontKey = pdf.getFont().id;

  fields.forEach((definition, fieldIndex) => {
    const mapped = mapEditableTmFieldToPdf(definition, placement);
    const field = new TextField();
    field.fieldName = editableTmPdfFieldName(
      pageIndex,
      fieldIndex,
      definition.slotKey,
    );
    field.value = definition.value;
    field.defaultValue = definition.value;
    field.x = mapped.x;
    field.y = mapped.y;
    field.width = mapped.width;
    field.height = mapped.height;
    field.fontName = "helvetica";
    field.fontStyle = "bold";
    field.fontSize = mapped.fontSize;
    field.maxFontSize = mapped.fontSize;
    field.color = definition.color;
    field.textAlign = "left";
    field.maxLength = 48;
    field.doNotSpellCheck = true;
    field.doNotScroll = true;
    field.showWhenPrinted = true;

    // jsPDF deliberately omits /DA from text-field dictionaries. Existing
    // values still render through /AP, but editors need /DA plus the AcroForm
    // default font resources to regenerate the appearance after a user types.
    const fieldWithStream = field as AcroFormTextField & {
      getKeyValueListForStream: () => Array<{
        key: string;
        value: string;
      }>;
    };
    const getBaseKeyValues =
      fieldWithStream.getKeyValueListForStream.bind(fieldWithStream);
    fieldWithStream.getKeyValueListForStream = () => {
      const keyValues = getBaseKeyValues();
      keyValues.push({
        key: "DA",
        value: `(/${fontKey} ${mapped.fontSize.toFixed(2)} Tf 0 g)`,
      });
      return keyValues;
    };

    pdf.addField(field);

    const acroFormRoot = (
      pdf.internal as unknown as {
        acroformPlugin?: {
          acroFormDictionaryRoot?: object & { DA?: string };
        };
      }
    ).acroformPlugin?.acroFormDictionaryRoot;
    if (acroFormRoot && !Object.hasOwn(acroFormRoot, "DR")) {
      acroFormRoot.DA = `/${fontKey} 0 Tf 0 g`;
      Object.defineProperty(acroFormRoot, "DR", {
        configurable: false,
        enumerable: false,
        value: "2 0 R",
      });
    }
  });
}
