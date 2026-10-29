#!/usr/bin/env python3
"""
Generates the sample drive used for preview tests and screenshots.

Files are written by real Office libraries (python-docx, python-pptx, openpyxl), so the preview
parsers are exercised against genuine producer output, not hand-built XML. The Box Notes are
hand-written JSON in the ProseMirror shape Box uses.

All names, emails and figures are fictional.

Usage:  python3 scripts/make-sample-drive.py <output-dir>
Needs:  pip install openpyxl python-pptx python-docx   (use a virtualenv)
"""

import datetime
import json
import sys
from pathlib import Path

from docx import Document
from openpyxl import Workbook
from openpyxl.styles import Font
from pptx import Presentation
from pptx.util import Inches


def make_boxnote(path: Path) -> None:
    def text(t, marks=None):
        node = {"type": "text", "text": t}
        if marks:
            node["marks"] = [{"type": m} for m in marks]
        return node

    def para(*nodes):
        return {"type": "paragraph", "content": list(nodes)}

    doc = {
        "type": "doc",
        "content": [
            {"type": "heading", "attrs": {"level": 1}, "content": [text("Q4 Planning Sync")]},
            para(text("Attendees: Priya Nair, Marcus Webb, Elena Rossi. "), text("Decisions below are final.", ["strong"])),
            {"type": "heading", "attrs": {"level": 2}, "content": [text("Action items")]},
            {
                "type": "bullet_list",
                "content": [
                    {"type": "list_item", "content": [para(text("Priya: publish the revised ARR forecast by Friday"))]},
                    {"type": "list_item", "content": [para(text("Marcus: confirm the mainframe renewal pipeline"))]},
                    {
                        "type": "list_item",
                        "content": [
                            para(text("Elena: close SOX findings")),
                            {
                                "type": "bullet_list",
                                "content": [{"type": "list_item", "content": [para(text("Finding 1: multi-element allocation"))]}],
                            },
                        ],
                    },
                ],
            },
            {
                "type": "table",
                "content": [
                    {"type": "table_row", "content": [
                        {"type": "table_header", "content": [para(text("Region"))]},
                        {"type": "table_header", "content": [para(text("Q4 target"))]},
                    ]},
                    {"type": "table_row", "content": [
                        {"type": "table_cell", "content": [para(text("EMEA"))]},
                        {"type": "table_cell", "content": [para(text("$128M"))]},
                    ]},
                ],
            },
            {"type": "code_block", "content": [text("SELECT region, SUM(arr) FROM pipeline GROUP BY region;")]},
        ],
    }
    path.write_text(json.dumps({"version": 1, "schema_version": 1, "doc": doc, "atext": {"text": "ignored when doc exists"}}), encoding="utf-8")


def make_legacy_boxnote(path: Path) -> None:
    path.write_text(
        json.dumps({"atext": {"text": "Kickoff notes\nOwner: Grace Liu\nNext review in November."}}), encoding="utf-8"
    )


def make_docx(path: Path) -> None:
    d = Document()
    d.add_heading("Northwind Bank Strategic Account Plan", level=1)
    d.add_paragraph("Prepared by the enterprise accounts team. Confidential.")
    d.add_heading("Objectives", level=2)
    for item in ("Expand hybrid cloud footprint", "Renew mainframe support through FY28"):
        d.add_paragraph(item, style="List Bullet")
    p = d.add_paragraph("Total contract value: ")
    p.add_run("$4.2M").bold = True
    t = d.add_table(rows=3, cols=3)
    for r, row in enumerate([("Quarter", "Target", "Status"), ("Q3", "$1.1M", "Closed"), ("Q4", "$1.4M", "At risk")]):
        for c, value in enumerate(row):
            t.cell(r, c).text = value
    d.add_paragraph("Special characters: <b>not bold</b> & \"quotes\" ñ 日本語")
    d.save(path)


def make_pptx(path: Path) -> None:
    prs = Presentation()
    s1 = prs.slides.add_slide(prs.slide_layouts[0])
    s1.shapes.title.text = "Mainframe to Hybrid Cloud Roadmap"
    s1.placeholders[1].text = "Enterprise Architecture · FY27"
    s1.notes_slide.notes_text_frame.text = "Open with the cost story before the architecture."

    s2 = prs.slides.add_slide(prs.slide_layouts[1])
    s2.shapes.title.text = "Migration phases"
    body = s2.placeholders[1].text_frame
    body.text = "Phase 1: assess workloads"
    p = body.add_paragraph()
    p.text = "Phase 2: pilot batch jobs"
    p = body.add_paragraph()
    p.text = "Compliance checkpoint"
    p.level = 1
    s2.notes_slide.notes_text_frame.text = "Mention the audit dependency.\nSecond line of notes."

    s3 = prs.slides.add_slide(prs.slide_layouts[5])
    s3.shapes.title.text = "Budget by phase"
    rows, cols = 3, 2
    table = s3.shapes.add_table(rows, cols, Inches(1), Inches(2), Inches(6), Inches(1.5)).table
    for r, row in enumerate([("Phase", "Budget"), ("Assess", "$0.4M"), ("Pilot", "$1.2M")]):
        for c, value in enumerate(row):
            table.cell(r, c).text = value
    prs.save(path)


def make_xlsx(path: Path) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "Forecast"
    ws.append(["Region", "Q3 actual", "Q4 forecast", "Closed on", "Renewed", "Growth"])
    for cell in ws[1]:
        cell.font = Font(bold=True)
    ws.append(["EMEA", 118.4, 128.0, datetime.date(2026, 10, 12), True, 0.0834])
    ws.append(["Americas", 201.25, 233.5, datetime.datetime(2026, 10, 15, 14, 30), False, 0.1602])
    ws.append(["APAC", 74.1 + 0.2, "=B4*1.1", None, None, None])
    ws.append(["Notes: <script>alert(1)</script> & more", None, None, None, None, None])

    s2 = wb.create_sheet("Pipeline")
    s2.append(["Deal", "Stage"])
    for i in range(250):
        s2.append([f"Deal {i + 1}", "Negotiation" if i % 2 else "Proposal"])

    hidden = wb.create_sheet("Hidden calc")
    hidden["A1"] = "internal only"
    hidden.sheet_state = "hidden"
    wb.save(path)


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    make_boxnote(out / "Q4_Planning_Sync.boxnote")
    make_legacy_boxnote(out / "Kickoff_Notes_Legacy.boxnote")
    make_docx(out / "Northwind_Bank_Account_Plan.docx")
    make_pptx(out / "Mainframe_Hybrid_Cloud_Roadmap.pptx")
    make_xlsx(out / "FY26_Q4_Revenue_Forecast.xlsx")
    (out / "Scratch_Notes.txt").write_text("Remember to confirm the legal hold list.\nSecond line.\n", encoding="utf-8")
    print(f"Wrote sample drive to {out}")


if __name__ == "__main__":
    main()
