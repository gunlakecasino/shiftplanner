#!/usr/bin/env python3
"""Build the branded SheetBuilder Guide PDF from its HTML source."""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

from pypdf import PdfReader, PdfWriter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "SheetBuilder Guide (source).html"
OUTPUT = ROOT / "output" / "pdf" / "SheetBuilder Guide.pdf"
LOGO = ROOT / "Nightwatch" / "Claude Design" / "assets" / "logo-horizontal.png"


def render_html(source: Path, output: Path) -> None:
    subprocess.run(
        ["weasyprint", "--pdf-variant", "pdf/ua-1", str(source), str(output)],
        check=True,
    )


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="sheetbuilder-guide-") as temp_name:
        temp_dir = Path(temp_name)
        content_pdf = temp_dir / "content.pdf"
        overlay_html = temp_dir / "header.html"
        overlay_pdf = temp_dir / "header.pdf"

        render_html(SOURCE, content_pdf)

        overlay_html.write_text(
            f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>SheetBuilder Guide Header</title>
  <style>
    @page {{ size: Letter; margin: 0; }}
    html, body {{ margin: 0; padding: 0; background: transparent; }}
    .header {{
      position: absolute;
      top: 0.48in;
      left: 0.58in;
      right: 0.58in;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 0.34in;
      padding-bottom: 0.10in;
      border-bottom: 2px solid #192744;
    }}
    img {{ width: 1.35in; height: auto; display: block; }}
    .name {{
      color: #192744;
      font-family: "Arial Narrow", Arial, sans-serif;
      font-size: 8.3pt;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
    }}
  </style>
</head>
<body>
  <header class="header">
    <img src="{LOGO.as_uri()}" alt="Gun Lake Casino Resort">
    <div class="name">SheetBuilder Guide</div>
  </header>
</body>
</html>
""",
            encoding="utf-8",
        )
        render_html(overlay_html, overlay_pdf)

        content = PdfReader(str(content_pdf))
        writer = PdfWriter()
        for page in content.pages:
            overlay_page = PdfReader(str(overlay_pdf)).pages[0]
            page.merge_page(overlay_page)
            writer.add_page(page)

        writer.add_metadata(
            {
                "/Title": "SheetBuilder Guide",
                "/Author": "Gun Lake Casino Resort Operations",
                "/Subject": "Quick training for updating an existing SheetBuilder deployment sheet.",
            }
        )
        with OUTPUT.open("wb") as handle:
            writer.write(handle)

    print(OUTPUT)


if __name__ == "__main__":
    main()
