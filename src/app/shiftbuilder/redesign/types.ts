import type { ReactNode } from "react";

export interface CoverageEntry {
  name: string;
  label: string;
}

export interface ShiftCardProps {
  zone: number;
  subZones?: string[];
  name: string;
  secondName?: string;
  role?: string;
  notes?: string[];
  unassigned?: boolean;
  coverage?: CoverageEntry[];
  taskContent?: ReactNode;
  /** Optional in-flow footer used by live coverage banners. */
  footer?: ReactNode;
  noChip?: boolean;
  onClick?: () => void;
}

export interface BackstageCardProps {
  zone: number;
  label?: string;
  coveredBy?: string;
  name: string;
  role?: string;
  notes?: string[];
  zoneBanner?: string;
  onClick?: () => void;
}

export interface AuxStaffCardProps {
  name: string;
  role?: string;
  color: string;
}

export interface MiniCalendarProps {
  activeDate: number;
  onSelect: (railIndex: number) => void;
  onClose: () => void;
}

export interface Task {
  html: string;
  text: string;
}

export interface PlacementPadProps {
  card: {
    zone: number;
    label?: string;
    name: string;
  };
  onClose: () => void;
}

export interface RichTaskEditorProps {
  onSave: (html: string, text: string) => void;
  onCancel: () => void;
}

export interface ToggleProps {
  on: boolean;
  color: string;
  onChange: () => void;
}

export interface PrintCommandCenterProps {
  activeDay: number;
  onClose: () => void;
}

export interface DayPrintState {
  deploy: boolean;
  breaks: boolean;
}
