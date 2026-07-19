export const ZONE_COLORS: Record<number, { border: string; bg: string; chip: string; label: string }> = {
  1:  { border: "border-l-[#C8960C]", bg: "bg-[#C8960C]", chip: "bg-[#fef3d0] text-[#8a6300]", label: "#C8960C" },
  2:  { border: "border-l-[#C8960C]", bg: "bg-[#C8960C]", chip: "bg-[#fef3d0] text-[#8a6300]", label: "#C8960C" },
  3:  { border: "border-l-[#D93838]", bg: "bg-[#D93838]", chip: "bg-[#fde8e8] text-[#a01e1e]", label: "#D93838" },
  4:  { border: "border-l-[#D93838]", bg: "bg-[#D93838]", chip: "bg-[#fde8e8] text-[#a01e1e]", label: "#D93838" },
  5:  { border: "border-l-[#D93838]", bg: "bg-[#D93838]", chip: "bg-[#fde8e8] text-[#a01e1e]", label: "#D93838" },
  6:  { border: "border-l-[#D96B9A]", bg: "bg-[#D96B9A]", chip: "bg-[#fce8f3] text-[#b03c78]", label: "#D96B9A" },
  7:  { border: "border-l-[#4B7BE8]", bg: "bg-[#4B7BE8]", chip: "bg-[#e6edfc] text-[#2449a8]", label: "#4B7BE8" },
  8:  { border: "border-l-[#9B6A45]", bg: "bg-[#9B6A45]", chip: "bg-[#f5ebe0] text-[#6b3e1e]", label: "#9B6A45" },
  9:  { border: "border-l-[#D93838]", bg: "bg-[#D93838]", chip: "bg-[#fde8e8] text-[#a01e1e]", label: "#D93838" },
  10: { border: "border-l-[#4CAF7D]", bg: "bg-[#4CAF7D]", chip: "bg-[#e2f5ec] text-[#2d7d55]", label: "#4CAF7D" },
};

export const ZONE_STATUS: Record<number, string> = {
  1: "bg-green-400",
  2: "bg-green-400",
  3: "bg-yellow-400",
  4: "bg-green-400",
  5: "bg-orange-400",
  6: "bg-green-400",
  7: "bg-red-400",
  8: "bg-green-400",
  9: "bg-green-400",
  10: "bg-green-400",
};

export const DAY_RAIL = [
  { abbr: "THU", date: 16, color: "#0F766E", shadow: "rgba(15,118,110,0.4)", hover: "rgba(15,118,110,0.15)" },
  { abbr: "FRI", date: 17, color: "#DC2626", shadow: "rgba(220,38,38,0.4)", hover: "rgba(220,38,38,0.15)" },
  { abbr: "SAT", date: 18, color: "#2563EB", shadow: "rgba(37,99,235,0.4)", hover: "rgba(37,99,235,0.15)" },
  { abbr: "SUN", date: 19, color: "#7C3AED", shadow: "rgba(124,58,237,0.4)", hover: "rgba(124,58,237,0.15)" },
  { abbr: "MON", date: 20, color: "#16A34A", shadow: "rgba(22,163,74,0.4)", hover: "rgba(22,163,74,0.15)" },
  { abbr: "TUE", date: 21, color: "#D97706", shadow: "rgba(217,119,6,0.4)", hover: "rgba(217,119,6,0.15)" },
  { abbr: "WED", date: 22, color: "#92400E", shadow: "rgba(146,64,14,0.4)", hover: "rgba(146,64,14,0.15)" },
  { abbr: "THU", date: 23, color: "#0F766E", shadow: "rgba(15,118,110,0.4)", hover: "rgba(15,118,110,0.15)" },
  { abbr: "FRI", date: 24, color: "#DC2626", shadow: "rgba(220,38,38,0.4)", hover: "rgba(220,38,38,0.15)" },
];

export const MATRIX_CELLS = [
  { id: "Z1" }, { id: "Z2" }, { id: "Z3" }, { id: "Z4" }, { id: "Z5" },
  { id: "Z6" }, { id: "Z7" }, { id: "Z8" }, { id: "Z9" }, { id: "Z10" },
  { id: "1W" }, { id: "6W" }, { id: "7W" }, { id: "8W" }, { id: "10W" },
  { id: "ADMIN" }, { id: "Z9SR" },
];

export const SAMPLE_EXPOSURE: Record<string, number> = {
  Z1: 0, Z2: 2, Z3: 0, Z4: 1, Z5: 3,
  Z6: 0, Z7: 0, Z8: 2, Z9: 2, Z10: 0,
  "1W": 0, "6W": 0, "7W": 0, "8W": 0, "10W": 0,
  ADMIN: 0, Z9SR: 0,
};

export const EXPOSURE_STYLE: Record<number, string> = {
  0: "border border-dashed border-gray-300 text-gray-400",
  1: "border-2 border-green-400 text-green-600 bg-green-50",
  2: "border-2 border-orange-400 text-orange-600 bg-orange-50",
  3: "border-2 border-red-400 text-red-600 bg-red-50",
};

export const LAST5 = [
  { label: "SUP1", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { label: "Z5", color: "bg-red-100 text-red-600 border-red-200" },
  { label: "RR1W", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { label: "Z2", color: "bg-orange-100 text-orange-600 border-orange-200" },
  { label: "RR7W", color: "bg-blue-100 text-blue-700 border-blue-200" },
];

export const FONT_SIZES = ["10px", "11px", "13px", "15px"];

export const HIGHLIGHTS = [
  { color: "#fef08a", label: "Yellow" },
  { color: "#bbf7d0", label: "Green" },
  { color: "#fecaca", label: "Red" },
  { color: "#bfdbfe", label: "Blue" },
  { color: "transparent", label: "None" },
];

export const CAL_OFFSET = 3;
export const CAL_DAYS_IN_MONTH = 31;
