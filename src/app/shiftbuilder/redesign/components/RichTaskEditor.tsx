import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { FONT_SIZES, HIGHLIGHTS } from "../tokens";
import type { RichTaskEditorProps } from "../types";

export function RichTaskEditor({ onSave, onCancel }: RichTaskEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState("11px");
  const [highlightColor, setHighlightColor] = useState("transparent");
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, underline: false });
  const [showHighlights, setShowHighlights] = useState(false);

  const updateActiveFormats = () => {
    setActiveFormats({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
    });
  };

  const exec = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
    updateActiveFormats();
  };

  const applyFontSize = (size: string) => {
    setFontSize(size);
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const span = document.createElement("span");
      span.style.fontSize = size;
      range.surroundContents(span);
    } else if (editorRef.current) {
      editorRef.current.style.fontSize = size;
    }
    editorRef.current?.focus();
  };

  const applyHighlight = (color: string) => {
    setHighlightColor(color);
    setShowHighlights(false);
    exec("hiliteColor", color === "transparent" ? "transparent" : color);
  };

  const handleSave = () => {
    const el = editorRef.current;
    if (!el) return;
    const text = el.innerText.trim();
    if (!text) return;
    onSave(el.innerHTML, text);
  };

  useEffect(() => { editorRef.current?.focus(); }, []);

  const fmtBtn = (active: boolean, onClick: () => void, children: React.ReactNode, title: string) => (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className={`w-6 h-6 flex items-center justify-center rounded text-[11px] font-bold transition-colors
        ${active ? "bg-gray-700 text-white" : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"}`}
    >
      {children}
    </button>
  );

  return (
    <div className="flex flex-col gap-1.5 mt-0.5">
      <div className="flex items-center gap-0.5 bg-gray-50 border border-gray-200 rounded-lg px-1.5 py-1 flex-wrap">
        {fmtBtn(activeFormats.bold,      () => exec("bold"),      <span className="font-black">B</span>, "Bold")}
        {fmtBtn(activeFormats.italic,    () => exec("italic"),    <span style={{ fontStyle: "italic" }}>I</span>, "Italic")}
        {fmtBtn(activeFormats.underline, () => exec("underline"), <span className="underline">U</span>, "Underline")}
        <div className="w-px h-4 bg-gray-200 mx-0.5" />
        {FONT_SIZES.map((s) => (
          <button
            key={s}
            onMouseDown={(e) => { e.preventDefault(); applyFontSize(s); }}
            className={`h-6 px-1.5 rounded text-[10px] font-semibold transition-colors
              ${fontSize === s ? "bg-gray-700 text-white" : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"}`}
          >
            {s === "10px" ? "XS" : s === "11px" ? "S" : s === "13px" ? "M" : "L"}
          </button>
        ))}
        <div className="w-px h-4 bg-gray-200 mx-0.5" />
        <div className="relative">
          <button
            onMouseDown={(e) => { e.preventDefault(); setShowHighlights((o) => !o); }}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
          >
            <span className="text-[11px] font-bold" style={{ textDecoration: "underline", textDecorationColor: highlightColor === "transparent" ? "#d1d5db" : highlightColor, textDecorationThickness: "3px" }}>A</span>
          </button>
          {showHighlights && (
            <div className="absolute top-full right-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-1.5 flex gap-1">
              {HIGHLIGHTS.map((h) => (
                <button
                  key={h.label}
                  onMouseDown={(e) => { e.preventDefault(); applyHighlight(h.color); }}
                  title={h.label}
                  className="w-5 h-5 rounded border border-gray-300 hover:scale-110 transition-transform"
                  style={{ backgroundColor: h.color === "transparent" ? "#f3f4f6" : h.color }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onKeyUp={updateActiveFormats}
        onMouseUp={updateActiveFormats}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSave(); }
          if (e.key === "Escape") onCancel();
        }}
        data-placeholder="Task name…"
        className="min-h-[32px] text-[11px] text-gray-800 border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-300"
        style={{ fontSize }}
      />

      <div className="flex gap-1.5">
        <button onMouseDown={(e) => { e.preventDefault(); handleSave(); }} className="flex-1 text-[11px] font-semibold bg-blue-500 hover:bg-blue-600 text-white rounded-lg py-1.5 transition-colors">
          Save
        </button>
        <button onMouseDown={(e) => { e.preventDefault(); onCancel(); }} className="text-[11px] font-semibold text-gray-400 hover:text-gray-600 px-2 rounded-lg hover:bg-gray-100 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}
