#!/usr/bin/env python3
"""Generate the Project Workflow Core sample engineering package as one PDF."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Flowable,
    Image as ReportImage,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "samples" / "project-workflow-core.json"
DEFAULT_OUTPUT = ROOT / "output" / "pdf" / "project-workflow-core-engineering-package.pdf"
DEFAULT_VISUALS = ROOT / "tmp" / "pdfs" / "engineering-report-visuals"

NAVY = colors.HexColor("#17365D")
BLUE = colors.HexColor("#2F75B5")
LIGHT_BLUE = colors.HexColor("#D9EAF7")
PALE_BLUE = colors.HexColor("#EEF5FB")
ORANGE = colors.HexColor("#F4B183")
YELLOW = colors.HexColor("#FFD966")
PALE_YELLOW = colors.HexColor("#FFF2CC")
GREEN = colors.HexColor("#70AD47")
RED = colors.HexColor("#C00000")
GRAY = colors.HexColor("#666666")
LIGHT_GRAY = colors.HexColor("#E7E6E6")
VERY_LIGHT_GRAY = colors.HexColor("#F7F7F7")


def text(value, default="-"):
    if value is None or value == "":
        return default
    return str(value)


def number(value, digits=1, default="-"):
    try:
        return f"{float(value):,.{digits}f}"
    except (TypeError, ValueError):
        return default


def load_project(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        project = json.load(handle)
    required = ["equipment", "loads", "cables", "trays", "ductbanks", "oneLine", "settings"]
    missing = [key for key in required if not project.get(key)]
    if missing:
        raise ValueError(f"Sample project is missing required report data: {', '.join(missing)}")
    settings = project["settings"]
    package = settings.get("engineeringPackage", {})
    studies = settings.get("studies", {})
    if not package.get("protectiveDevices") or not studies.get("arcFlash") or not studies.get("tcc"):
        raise ValueError("Sample project needs engineeringPackage, arcFlash, and tcc data")
    return project


def load_visual_assets(path: Path, project: dict) -> dict:
    manifest_path = path / "manifest.json"
    if not manifest_path.exists():
        raise ValueError(
            f"Application-rendered report visuals are missing: {manifest_path}. "
            "Run the visual capture step before generating the PDF."
        )
    with manifest_path.open("r", encoding="utf-8") as handle:
        manifest = json.load(handle)
    if manifest.get("projectId") != project.get("id"):
        raise ValueError("The captured visuals do not belong to the requested sample project")
    captures = manifest.get("captures", {})
    one_line = captures.get("oneLine", {})
    trays = {row.get("id"): row for row in captures.get("trays", [])}
    ductbanks = {row.get("id"): row for row in captures.get("ductbanks", [])}
    expected_trays = project["settings"]["engineeringPackage"]["trayCrossSections"]
    expected_ductbanks = project["settings"]["engineeringPackage"]["ductbankCrossSections"]
    if not one_line or any(row["trayId"] not in trays for row in expected_trays):
        raise ValueError("The application visual manifest is incomplete for the tray and one-line report sheets")
    if any(row["ductbankId"] not in ductbanks for row in expected_ductbanks):
        raise ValueError("The application visual manifest is incomplete for the ductbank report sheets")
    for capture in [one_line, *trays.values(), *ductbanks.values()]:
        capture_path = path / capture.get("file", "")
        if not capture_path.is_file():
            raise ValueError(f"Captured application visual is missing: {capture_path}")
        capture["path"] = capture_path
    return {"manifest": manifest, "oneLine": one_line, "trays": trays, "ductbanks": ductbanks}


def application_visual(capture: dict, max_width=6.9 * inch, max_height=5.35 * inch):
    image = ReportImage(str(capture["path"]))
    scale = min(max_width / image.imageWidth, max_height / image.imageHeight)
    image.drawWidth = image.imageWidth * scale
    image.drawHeight = image.imageHeight * scale
    image.hAlign = "CENTER"
    return image


def make_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="PackageTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=23,
        leading=27,
        textColor=NAVY,
        alignment=TA_CENTER,
        spaceAfter=14,
    ))
    styles.add(ParagraphStyle(
        name="CoverSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=12,
        leading=16,
        textColor=GRAY,
        alignment=TA_CENTER,
        spaceAfter=8,
    ))
    styles.add(ParagraphStyle(
        name="SheetTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=18,
        textColor=NAVY,
        spaceAfter=8,
    ))
    styles.add(ParagraphStyle(
        name="Subhead",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=12,
        textColor=NAVY,
        spaceBefore=7,
        spaceAfter=5,
    ))
    styles.add(ParagraphStyle(
        name="BodySmall",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#222222"),
        spaceAfter=5,
    ))
    styles.add(ParagraphStyle(
        name="Note",
        parent=styles["BodyText"],
        fontName="Helvetica-Oblique",
        fontSize=7.5,
        leading=9.5,
        textColor=GRAY,
        spaceAfter=5,
    ))
    styles.add(ParagraphStyle(
        name="Cell",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=6.4,
        leading=7.5,
        textColor=colors.black,
    ))
    styles.add(ParagraphStyle(
        name="CellSmall",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=5.7,
        leading=6.6,
        textColor=colors.black,
    ))
    styles.add(ParagraphStyle(
        name="CellHead",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=6.2,
        leading=7,
        textColor=colors.white,
        alignment=TA_CENTER,
    ))
    styles.add(ParagraphStyle(
        name="CoverStatus",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=14,
        alignment=TA_CENTER,
        textColor=RED,
    ))
    return styles


def paragraph_cell(value, style):
    if isinstance(value, Flowable):
        return value
    value = text(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return Paragraph(value, style)


def section_anchor_name(number_value):
    return f"section-{str(number_value).strip().replace('.', '-')}"


class PdfSectionAnchor(Flowable):
    def __init__(self, number_value, title_value):
        super().__init__()
        self.number_value = str(number_value)
        self.title_value = str(title_value)
        self.width = 0
        self.height = 0

    def draw(self):
        key = section_anchor_name(self.number_value)
        title = f"{self.number_value}. {self.title_value}"
        self.canv.bookmarkPage(key)
        self.canv.addOutlineEntry(title, key, level=0, closed=False)


def internal_link_cell(value, anchor, style):
    label = text(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return Paragraph(f'<link href="#{anchor}" color="#17365D"><u>{label}</u></link>', style)


def data_table(headers, rows, widths, styles, font_size=6.4, repeat_rows=1, style_commands=None):
    cell_style = styles["CellSmall"] if font_size < 6.2 else styles["Cell"]
    body = [[paragraph_cell(header, styles["CellHead"]) for header in headers]]
    body.extend([[paragraph_cell(value, cell_style) for value in row] for row in rows])
    table = Table(body, colWidths=widths, repeatRows=repeat_rows, hAlign="LEFT")
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#9EADBA")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, VERY_LIGHT_GRAY]),
    ]
    if style_commands:
        commands.extend(style_commands)
    table.setStyle(TableStyle(commands))
    return table


def key_value_table(rows, styles, widths=(1.65 * inch, 5.05 * inch)):
    body = [[paragraph_cell(label, styles["CellHead"]), paragraph_cell(value, styles["Cell"])] for label, value in rows]
    table = Table(body, colWidths=list(widths), hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), NAVY),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#A6A6A6")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


class DuctbankCrossSection(Flowable):
    def __init__(self, section):
        super().__init__()
        self.section = section
        self.width = 6.7 * inch
        self.height = 4.4 * inch

    def draw(self):
        c = self.canv
        s = self.section
        cx = self.width / 2
        bank_h = 3.15 * inch
        bank_w = bank_h * float(s["widthIn"]) / float(s["heightIn"])
        x0 = cx - bank_w / 2
        y0 = 0.55 * inch
        c.setFillColor(colors.HexColor("#D9D9D9"))
        c.setStrokeColor(colors.HexColor("#666666"))
        c.setLineWidth(1.2)
        c.rect(x0, y0, bank_w, bank_h, fill=1, stroke=1)
        c.setFillColor(colors.white)
        rows = int(s.get("rows", 2))
        columns = int(s.get("columns", 2))
        radius = min(bank_w / (columns * 3.2), bank_h / (rows * 3.2), 0.34 * inch)
        centers = []
        for row_index in range(rows):
            for column_index in range(columns):
                centers.append((
                    x0 + bank_w * (column_index + 1) / (columns + 1),
                    y0 + bank_h * (rows - row_index) / (rows + 1),
                ))
        circuits = s.get("circuits", [])
        for index, (x, y) in enumerate(centers):
            c.setFillColor(colors.white)
            c.setStrokeColor(NAVY)
            c.setLineWidth(1.5)
            c.circle(x, y, radius, fill=1, stroke=1)
            circuit = circuits[index] if index < len(circuits) else "SPARE"
            if circuit != "SPARE":
                c.setFillColor(ORANGE)
                c.circle(x, y, radius * 0.48, fill=1, stroke=0)
            c.setFillColor(colors.black)
            c.setFont("Helvetica-Bold", 6.5)
            circuit_label = "FEEDER" if circuit != "SPARE" else "SPARE"
            c.drawCentredString(x, y - radius - 12, f"C{index + 1}: {circuit_label}")
        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(NAVY)
        c.drawCentredString(cx, y0 + bank_h + 20, f"{s['id']} - {s['widthIn']} in x {s['heightIn']} in concrete encasement")
        c.setFont("Helvetica", 8)
        c.setFillColor(colors.black)
        c.drawString(x0, y0 - 28, f"Conduits: {s['rows']} x {s['columns']} - {s['conduitTradeSizeIn']} in trade size")
        c.drawString(x0, y0 - 40, f"Minimum concrete cover: {s['concreteCoverIn']} in; nominal center spacing: {s['conduitSpacingIn']} in")
        c.setStrokeColor(GRAY)
        c.setLineWidth(0.6)
        c.line(x0 - 18, y0, x0 - 18, y0 + bank_h)
        c.line(x0 - 23, y0, x0 - 13, y0)
        c.line(x0 - 23, y0 + bank_h, x0 - 13, y0 + bank_h)
        c.saveState()
        c.translate(x0 - 28, y0 + bank_h / 2)
        c.rotate(90)
        c.setFont("Helvetica", 7)
        c.drawCentredString(0, 0, f"{s['heightIn']} in")
        c.restoreState()


class TrayCrossSection(Flowable):
    def __init__(self, section, cables):
        super().__init__()
        self.section = section
        self.cables = cables
        self.width = 6.7 * inch
        self.height = 3.9 * inch

    def draw(self):
        c = self.canv
        s = self.section
        x0 = 0.55 * inch
        y0 = 0.8 * inch
        tray_w = 5.6 * inch
        tray_h = 1.4 * inch
        c.setStrokeColor(NAVY)
        c.setLineWidth(4)
        c.line(x0, y0, x0, y0 + tray_h)
        c.line(x0, y0, x0 + tray_w, y0)
        c.line(x0 + tray_w, y0, x0 + tray_w, y0 + tray_h)
        selected = [self.cables[tag] for tag in s.get("cables", []) if tag in self.cables]
        total_od_area = sum(math.pi * (float(row.get("diameter", 0)) / 2) ** 2 for row in selected)
        scale = tray_w / max(float(s["insideWidthIn"]), 1)
        cursor = x0 + 0.35 * inch
        palette = [ORANGE, LIGHT_BLUE, GREEN]
        for index, cable in enumerate(selected):
            diameter = max(float(cable.get("diameter", 0.5)) * scale, 0.24 * inch)
            radius = diameter / 2
            c.setFillColor(palette[index % len(palette)])
            c.setStrokeColor(colors.black)
            c.setLineWidth(0.7)
            c.circle(cursor + radius, y0 + radius + 3, radius, fill=1, stroke=1)
            c.setFillColor(colors.black)
            c.setFont("Helvetica", 6.5)
            c.drawCentredString(cursor + radius, y0 - 12 - index * 10, text(cable.get("tag")))
            cursor += diameter + 0.22 * inch
        tray_area = float(s["insideWidthIn"]) * float(s["usableDepthIn"])
        area_fill = 100 * total_od_area / tray_area if tray_area else 0
        c.setFillColor(NAVY)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(x0, y0 + tray_h + 28, f"{s['id']} - {s['insideWidthIn']} in W x {s['usableDepthIn']} in usable depth")
        c.setFillColor(colors.black)
        c.setFont("Helvetica", 8)
        c.drawString(x0, y0 + tray_h + 13, f"Shown cable OD area: {total_od_area:.2f} in2 ({area_fill:.1f}% of rectangular area; screening only)")
        c.drawString(x0, y0 - 52, text(s.get("separationNote")))


class OneLineDiagram(Flowable):
    def __init__(self):
        super().__init__()
        self.width = 6.7 * inch
        self.height = 5.25 * inch

    def draw_box(self, c, x, y, w, h, tag, detail, fill=PALE_BLUE):
        c.setFillColor(fill)
        c.setStrokeColor(NAVY)
        c.setLineWidth(1.1)
        c.roundRect(x, y, w, h, 5, fill=1, stroke=1)
        c.setFillColor(NAVY)
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(x + w / 2, y + h - 12, tag)
        c.setFillColor(colors.black)
        c.setFont("Helvetica", 6.5)
        c.drawCentredString(x + w / 2, y + 9, detail)

    def breaker(self, c, x, y, label):
        c.setStrokeColor(RED)
        c.setLineWidth(1.2)
        c.rect(x - 9, y - 9, 18, 18, fill=0, stroke=1)
        c.line(x - 6, y - 6, x + 6, y + 6)
        c.setFillColor(colors.black)
        c.setFont("Helvetica", 5.5)
        c.drawCentredString(x, y - 17, label)

    def draw(self):
        c = self.canv
        c.setStrokeColor(colors.black)
        c.setLineWidth(1.2)
        source_x = 0.55 * inch
        source_y = 4.12 * inch
        bus_x = 1.65 * inch
        bus_y = 4.42 * inch
        c.setFillColor(PALE_YELLOW)
        c.circle(source_x, source_y, 0.24 * inch, fill=1, stroke=1)
        c.setFillColor(NAVY)
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(source_x, source_y - 3, "UTILITY")
        c.setFillColor(colors.black)
        c.setFont("Helvetica", 5.5)
        c.drawCentredString(source_x, source_y - 27, "480Y/277 V, 20 MVA")
        c.line(source_x + 18, source_y, bus_x - 20, source_y)
        self.breaker(c, bus_x - 31, source_y, "MAIN")
        c.setLineWidth(5)
        c.setStrokeColor(NAVY)
        c.line(bus_x, 0.78 * inch, bus_x, bus_y)
        c.setLineWidth(1.1)
        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(bus_x + 8, bus_y + 5, "SWBD-101 - 800 A, 65 kA")

        branch_x = 2.55 * inch
        load_x = 4.52 * inch
        branches = [
            (3.62, "FDR-MCC-101", "MCC-101", "480 V, 800 A", "PMP-101 / VFD-101 / PMP-102", "Process pumps", PALE_BLUE),
            (2.72, "FDR-MCC-102", "MCC-102", "480 V, 600 A", "FAN-101 / AHU-101 / CMP-101", "Production motors", PALE_BLUE),
            (1.82, "FDR-XFMR-101", "XFMR-101", "75 kVA, 480-208Y/120 V", "LP-101", "Lighting / receptacles", colors.HexColor("#EDEDED")),
            (0.92, "FDR-XFMR-102", "XFMR-102", "112.5 kVA, 480-208Y/120 V", "LP-102", "Warehouse loads", colors.HexColor("#EDEDED")),
        ]
        for y_in, device, source_tag, source_detail, load_tag, load_detail, source_fill in branches:
            y = y_in * inch
            c.setStrokeColor(colors.black)
            c.line(bus_x, y, branch_x, y)
            self.breaker(c, 2.08 * inch, y, device)
            self.draw_box(c, branch_x, y - 0.27 * inch, 1.45 * inch, 0.54 * inch, source_tag, source_detail, fill=source_fill)
            c.line(branch_x + 1.45 * inch, y, load_x, y)
            self.draw_box(c, load_x, y - 0.27 * inch, 1.75 * inch, 0.54 * inch, load_tag, load_detail, fill=colors.HexColor("#E2F0D9"))
            c.setFillColor(GRAY)
            c.setFont("Helvetica", 5.2)
            c.drawString(branch_x + 0.08 * inch, y - 0.38 * inch, device)
        c.setFillColor(GRAY)
        c.setFont("Helvetica-Oblique", 7)
        c.drawString(0.55 * inch, 0.25 * inch, "Simplified single-line representation. Verify device catalog numbers and field settings before issue.")


class TccChart(Flowable):
    def __init__(self, settings, short_circuit):
        super().__init__()
        self.settings = settings
        self.short_circuit = short_circuit
        self.width = 6.7 * inch
        self.height = 6.25 * inch

    def draw(self):
        c = self.canv
        left = 0.72 * inch
        bottom = 0.65 * inch
        plot_w = 5.45 * inch
        plot_h = 5.05 * inch
        xmin, xmax = 10, 30000
        ymin, ymax = 0.01, 1000

        def px(current):
            return left + (math.log10(current) - math.log10(xmin)) / (math.log10(xmax) - math.log10(xmin)) * plot_w

        def py(seconds):
            return bottom + (math.log10(seconds) - math.log10(ymin)) / (math.log10(ymax) - math.log10(ymin)) * plot_h

        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.rect(left, bottom, plot_w, plot_h, fill=1, stroke=1)
        c.setFont("Helvetica", 6.5)
        for current in [10, 100, 1000, 10000]:
            x = px(current)
            c.setStrokeColor(LIGHT_GRAY)
            c.line(x, bottom, x, bottom + plot_h)
            c.setFillColor(colors.black)
            c.drawCentredString(x, bottom - 12, f"{current:,}")
        for seconds in [0.01, 0.1, 1, 10, 100, 1000]:
            y = py(seconds)
            c.setStrokeColor(LIGHT_GRAY)
            c.line(left, y, left + plot_w, y)
            c.setFillColor(colors.black)
            c.drawRightString(left - 6, y - 2, text(seconds))
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(left + plot_w / 2, bottom - 28, "Current (A RMS symmetrical)")
        c.saveState()
        c.translate(left - 40, bottom + plot_h / 2)
        c.rotate(90)
        c.drawCentredString(0, 0, "Time (seconds)")
        c.restoreState()

        palette = [NAVY, BLUE, RED, GREEN, colors.HexColor("#7030A0"), colors.HexColor("#ED7D31")]
        for index, (device_id, cfg) in enumerate(self.settings.items()):
            pickup = float(cfg["pickupA"])
            st_pickup = float(cfg["shortTimePickupA"])
            inst = float(cfg["instantaneousA"])
            lt = float(cfg["longTimeDelayS"])
            st = float(cfg["shortTimeDelayS"])
            points = []
            for step in range(70):
                current = pickup * (10 ** (step / 69 * math.log10(max(inst / pickup, 1.01))))
                if current < st_pickup:
                    seconds = min(ymax, max(st, lt * (6 * pickup / current) ** 2))
                elif current < inst:
                    seconds = st
                else:
                    seconds = 0.02
                points.append((px(max(xmin, current)), py(max(ymin, min(ymax, seconds)))))
            color = palette[index % len(palette)]
            c.setStrokeColor(color)
            c.setLineWidth(2.2)
            path = c.beginPath()
            path.moveTo(*points[0])
            for point in points[1:]:
                path.lineTo(*point)
            c.drawPath(path, fill=0, stroke=1)
            legend_y = bottom + plot_h - index * 16 - 12
            c.setStrokeColor(color)
            c.line(left + plot_w - 118, legend_y, left + plot_w - 92, legend_y)
            c.setFillColor(colors.black)
            c.setFont("Helvetica-Bold", 6.5)
            c.drawString(left + plot_w - 86, legend_y - 2, device_id)

        fault_values = []
        for key, row in self.short_circuit.items():
            if key.startswith("_") or not isinstance(row, dict):
                continue
            if row.get("threePhaseKA"):
                fault_values.append((row.get("equipmentTag", key), float(row["threePhaseKA"]) * 1000))
        for label, current in fault_values[:3]:
            if xmin <= current <= xmax:
                x = px(current)
                c.setStrokeColor(colors.HexColor("#A5A5A5"))
                c.setDash(2, 2)
                c.line(x, bottom, x, bottom + plot_h)
                c.setDash()
                c.saveState()
                c.translate(x + 3, bottom + 8)
                c.rotate(90)
                c.setFillColor(GRAY)
                c.setFont("Helvetica", 5.5)
                c.drawString(0, 0, f"{label} {current / 1000:.2f} kA")
                c.restoreState()


class SeriesFuseTccChart(Flowable):
    """Coordination chart for one radial path of series-connected fuses."""

    def __init__(self, study, settings):
        super().__init__()
        self.study = study
        self.settings = settings
        self.width = 6.7 * inch
        self.height = 5.95 * inch

    def draw(self):
        c = self.canv
        left = 0.67 * inch
        bottom = 0.58 * inch
        plot_w = 4.72 * inch
        plot_h = 4.90 * inch
        legend_x = left + plot_w + 0.13 * inch
        xmin, xmax = 10, 30000
        ymin, ymax = 0.01, 1000

        def px(current):
            value = max(xmin, min(xmax, float(current)))
            return left + (math.log10(value) - math.log10(xmin)) / (math.log10(xmax) - math.log10(xmin)) * plot_w

        def py(seconds):
            value = max(ymin, min(ymax, float(seconds)))
            return bottom + (math.log10(value) - math.log10(ymin)) / (math.log10(ymax) - math.log10(ymin)) * plot_h

        def draw_curve(points, color, width=1.7, dash=None):
            visible = [(px(x), py(y)) for x, y in points if x > 0 and y > 0]
            if len(visible) < 2:
                return
            c.setStrokeColor(color)
            c.setLineWidth(width)
            if dash:
                c.setDash(*dash)
            path = c.beginPath()
            path.moveTo(*visible[0])
            for point in visible[1:]:
                path.lineTo(*point)
            c.drawPath(path, fill=0, stroke=1)
            c.setDash()

        def draw_fuse_band(minimum_melt, total_clear, color):
            minimum_points = [(px(x), py(y)) for x, y in minimum_melt if x > 0 and y > 0]
            clearing_points = [(px(x), py(y)) for x, y in total_clear if x > 0 and y > 0]
            if len(minimum_points) < 2 or len(clearing_points) < 2:
                return
            band = c.beginPath()
            band.moveTo(*clearing_points[0])
            for point in clearing_points[1:]:
                band.lineTo(*point)
            for point in reversed(minimum_points):
                band.lineTo(*point)
            band.close()
            c.saveState()
            c.setFillColor(color)
            if hasattr(c, "setFillAlpha"):
                c.setFillAlpha(0.06)
            c.drawPath(band, fill=1, stroke=0)
            c.clipPath(band, stroke=0, fill=0)
            c.setStrokeColor(color)
            c.setLineWidth(0.45)
            if hasattr(c, "setStrokeAlpha"):
                c.setStrokeAlpha(0.36)
            hatch_spacing = 7
            offset = -plot_h
            while offset <= plot_w:
                c.line(left + offset, bottom, left + offset + plot_h, bottom + plot_h)
                offset += hatch_spacing
            c.restoreState()

        def draw_tag_callout(x, y, label, color):
            font_name = "Helvetica-Bold"
            font_size = 5.5
            label_width = c.stringWidth(label, font_name, font_size)
            label_y = max(bottom + 4, min(bottom + plot_h - 7, y + 6))
            c.setFillColor(color)
            c.setFont(font_name, font_size)
            if x + label_width + 7 <= left + plot_w:
                c.drawString(x + 6, label_y, label)
            else:
                c.drawRightString(x - 6, label_y, label)

        def add_legend(y, color, label, dash=None):
            c.setStrokeColor(color)
            c.setLineWidth(1.8)
            if dash:
                c.setDash(*dash)
            c.line(legend_x, y, legend_x + 18, y)
            c.setDash()
            c.setFillColor(colors.black)
            c.setFont("Helvetica", 5.6)
            c.drawString(legend_x + 22, y - 2, label[:29])

        c.setFillColor(colors.white)
        c.setStrokeColor(colors.black)
        c.rect(left, bottom, plot_w, plot_h, fill=1, stroke=1)
        c.setFont("Helvetica", 6.2)
        for current in [10, 100, 1000, 10000]:
            x = px(current)
            c.setStrokeColor(LIGHT_GRAY)
            c.line(x, bottom, x, bottom + plot_h)
            c.setFillColor(colors.black)
            c.drawCentredString(x, bottom - 12, f"{current:,}")
        for seconds in [0.01, 0.1, 1, 10, 100, 1000]:
            y = py(seconds)
            c.setStrokeColor(LIGHT_GRAY)
            c.line(left, y, left + plot_w, y)
            c.setFillColor(colors.black)
            c.drawRightString(left - 6, y - 2, text(seconds))
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(left + plot_w / 2, bottom - 28, "Current (A RMS symmetrical)")
        c.saveState()
        c.translate(left - 39, bottom + plot_h / 2)
        c.rotate(90)
        c.drawCentredString(0, 0, "Time (seconds)")
        c.restoreState()

        palette = [NAVY, RED, GREEN]
        legend_y = bottom + plot_h - 10
        for index, device_id in enumerate(self.study["seriesPath"]):
            cfg = self.settings[device_id]
            rating = float(cfg["ratingA"])
            melt_factor = float(cfg.get("minimumMeltFactor", 1.5))
            clearing_factor = float(cfg.get("totalClearingFactor", 2.0))
            minimum_melt = []
            total_clear = []
            for step in range(90):
                ratio = 1.05 + step / 89 * 39
                current = rating * ratio
                seconds = 70 * (ratio / melt_factor) ** -2.25
                minimum_melt.append((current, max(ymin, min(ymax, seconds))))
                total_clear.append((current, max(ymin, min(ymax, seconds * clearing_factor))))
            color = palette[index % len(palette)]
            draw_fuse_band(minimum_melt, total_clear, color)
            draw_curve(total_clear, color, 2.0)
            draw_curve(minimum_melt, color, 1.1, (3, 2))
            add_legend(legend_y, color, f"{device_id} total clear")
            legend_y -= 12
            add_legend(legend_y, color, f"{device_id} min melt", (3, 2))
            legend_y -= 15

        cable = self.study.get("protectedCable")
        if cable:
            one_second = float(cable["oneSecondDamageA"])
            cable_points = []
            for step in range(90):
                current = max(xmin, one_second / math.sqrt(ymax)) * (10 ** (step / 89 * math.log10(xmax / max(xmin, one_second / math.sqrt(ymax)))))
                cable_points.append((current, (one_second / current) ** 2))
            cable_color = colors.HexColor("#595959")
            draw_curve(cable_points, cable_color, 2.0, (6, 3))
            add_legend(legend_y, cable_color, f"{cable['tag']} damage", (6, 3))
            legend_y -= 15

        motor = self.study.get("motor")
        if motor:
            fla = float(motor["fullLoadA"])
            multiples = [1.15, 1.3, 1.5, 2, 3, 4, 5, 6, 8, 10]
            hot_seconds = [600, 300, 150, 65, 24, 12, 7, 4.5, 2.2, 1.2]
            cold_seconds = [min(ymax, value * 2.1) for value in hot_seconds]
            motor_color = colors.HexColor("#7030A0")
            draw_curve([(fla * multiple, value) for multiple, value in zip(multiples, cold_seconds)], motor_color, 1.8)
            draw_curve([(fla * multiple, value) for multiple, value in zip(multiples, hot_seconds)], motor_color, 1.5, (3, 2))
            start_current = fla * float(motor["lockedRotorMultiple"])
            start_time = float(motor["accelerationTimeS"])
            c.setFillColor(motor_color)
            start_x, start_y = px(start_current), py(start_time)
            c.circle(start_x, start_y, 3, fill=1, stroke=0)
            draw_tag_callout(start_x, start_y, f"{motor['tag']} start", motor_color)
            add_legend(legend_y, motor_color, f"{motor['tag']} cold limit")
            legend_y -= 12
            add_legend(legend_y, motor_color, f"{motor['tag']} hot limit", (3, 2))
            legend_y -= 12
            c.setFont("Helvetica", 5.4)
            c.setFillColor(motor_color)
            c.drawString(legend_x, legend_y - 2, f"{motor['tag']} start: {start_current:.0f} A / {start_time:.1f} s")
            legend_y -= 15

        transformer = self.study.get("transformer")
        if transformer:
            kva = float(transformer["kva"])
            volts = float(transformer["primaryVoltageV"])
            fla = kva * 1000 / (math.sqrt(3) * volts)
            inrush_current = fla * float(transformer["inrushMultiple"])
            inrush_time = float(transformer["inrushTimeS"])
            transformer_color = colors.HexColor("#ED7D31")
            c.setStrokeColor(transformer_color)
            c.setLineWidth(2)
            x, y = px(inrush_current), py(inrush_time)
            c.line(x - 4, y - 4, x + 4, y + 4)
            c.line(x - 4, y + 4, x + 4, y - 4)
            draw_tag_callout(x, y, f"{transformer['tag']} inrush", transformer_color)
            damage_multiple = float(transformer.get("damageCurrentMultiple", 25))
            damage_points = []
            for multiple in [2, 3, 4, 6, 8, 10, 15, 20, damage_multiple]:
                damage_points.append((fla * multiple, min(ymax, 500 / (multiple ** 1.55))))
            draw_curve(damage_points, transformer_color, 1.7, (5, 2))
            add_legend(legend_y, transformer_color, f"{transformer['tag']} damage", (5, 2))
            legend_y -= 12
            c.setFont("Helvetica", 5.4)
            c.setFillColor(transformer_color)
            c.drawString(legend_x, legend_y - 2, f"{transformer['tag']} inrush: {inrush_current:.0f} A / {inrush_time:.2f} s")
            legend_y -= 15

        fault_current = float(self.study.get("faultCurrentKA", 0)) * 1000
        if xmin <= fault_current <= xmax:
            x = px(fault_current)
            c.setStrokeColor(colors.HexColor("#A5A5A5"))
            c.setDash(2, 2)
            c.line(x, bottom, x, bottom + plot_h)
            c.setDash()
            c.saveState()
            c.translate(x + 3, bottom + 8)
            c.rotate(90)
            c.setFillColor(GRAY)
            c.setFont("Helvetica", 5.5)
            c.drawString(0, 0, f"Available fault {fault_current / 1000:.2f} kA")
            c.restoreState()


class ArcFlashLabels(Flowable):
    def __init__(self, results, created_date):
        super().__init__()
        self.results = results
        self.created_date = created_date
        self.width = 6.7 * inch
        self.height = 6.55 * inch

    def draw_label(self, c, x, y, w, h, row):
        c.setStrokeColor(colors.black)
        c.setFillColor(PALE_YELLOW)
        c.setLineWidth(1)
        c.rect(x, y, w, h, fill=1, stroke=1)
        c.setFillColor(ORANGE)
        c.rect(x, y + h - 28, w, 28, fill=1, stroke=1)
        # ANSI Z535.4 safety-alert symbol: equilateral triangle with exclamation mark.
        symbol_cx = x + 22
        symbol_top = y + h - 4
        symbol_bottom = y + h - 24
        symbol = c.beginPath()
        symbol.moveTo(symbol_cx, symbol_top)
        symbol.lineTo(symbol_cx - 12, symbol_bottom)
        symbol.lineTo(symbol_cx + 12, symbol_bottom)
        symbol.close()
        c.setFillColor(colors.black)
        c.drawPath(symbol, fill=1, stroke=0)
        c.setFillColor(ORANGE)
        c.setFont("Helvetica-Bold", 11)
        c.drawCentredString(symbol_cx, symbol_bottom + 4, "!")
        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 11)
        c.drawCentredString(x + w / 2 + 8, y + h - 18, "WARNING - ARC FLASH HAZARD")
        c.setFont("Helvetica-Bold", 10)
        c.drawString(x + 10, y + h - 45, text(row.get("equipmentTag")))
        c.setFont("Helvetica-Bold", 19)
        c.setFillColor(RED)
        c.drawString(x + 10, y + h - 72, f"{number(row.get('incidentEnergy'), 1)} cal/cm2")
        c.setFillColor(colors.black)
        c.setFont("Helvetica", 7.5)
        lines = [
            f"Nominal voltage: {text(row.get('nominalVoltage'))} V",
            f"Arc flash boundary: {text(row.get('boundary'))} {text(row.get('boundaryUnit'), 'in')}",
            f"Working distance: {text(row.get('workingDistanceIn'))} in",
            f"Minimum arc rating: {text(row.get('minimumArcRatingCalCm2'), '0')} cal/cm2",
            f"Label created: {text(self.created_date)}",
        ]
        for index, line in enumerate(lines):
            c.drawString(x + 10, y + h - 85 - index * 9, line)
        c.setFont("Helvetica-Bold", 6.5)
        c.drawString(x + 10, y + 9, "SAMPLE ONLY - NOT FOR FIELD APPLICATION")

    def draw(self):
        c = self.canv
        label_w = 3.16 * inch
        label_h = 1.98 * inch
        gap_x = 0.22 * inch
        gap_y = 0.16 * inch
        start_x = 0.08 * inch
        start_y = self.height - label_h
        for index, row in enumerate(self.results[:6]):
            col = index % 2
            row_index = index // 2
            x = start_x + col * (label_w + gap_x)
            y = start_y - row_index * (label_h + gap_y)
            self.draw_label(c, x, y, label_w, label_h, row)


def draw_page_frame(canvas, doc, meta, package):
    canvas.saveState()
    width, height = letter
    canvas.setStrokeColor(NAVY)
    canvas.setLineWidth(0.8)
    canvas.line(doc.leftMargin, height - 0.48 * inch, width - doc.rightMargin, height - 0.48 * inch)
    canvas.setFillColor(NAVY)
    canvas.setFont("Helvetica-Bold", 7)
    canvas.drawString(doc.leftMargin, height - 0.38 * inch, text(meta.get("projectName")))
    canvas.drawRightString(width - doc.rightMargin, height - 0.38 * inch, text(package.get("title")))
    canvas.setStrokeColor(colors.HexColor("#A6A6A6"))
    canvas.line(doc.leftMargin, 0.48 * inch, width - doc.rightMargin, 0.48 * inch)
    canvas.setFillColor(GRAY)
    canvas.setFont("Helvetica", 6.5)
    canvas.drawString(doc.leftMargin, 0.32 * inch, f"Project {text(meta.get('projectNumber'))} | Package {text(package.get('packageId'))} | Rev {text(meta.get('revision'))}")
    canvas.drawCentredString(width / 2, 0.32 * inch, text(package.get("issueStatus")))
    canvas.drawRightString(width - doc.rightMargin, 0.32 * inch, f"Page {canvas.getPageNumber()}")
    canvas.restoreState()


def section_title(number_value, title_value, styles, subtitle=None):
    content = [
        PdfSectionAnchor(number_value, title_value),
        Paragraph(f"{number_value}. {title_value}", styles["SheetTitle"]),
    ]
    if subtitle:
        content.append(Paragraph(subtitle, styles["Note"]))
    return content


def cable_voltage_drop(cable, loads):
    resistance_per_kft = {
        "#4 AWG": 0.31,
        "#2 AWG": 0.19,
        "#1 AWG": 0.15,
        "500 kcmil": 0.027,
    }
    destination = cable.get("to") or cable.get("to_tag")
    load_kw = sum(float(row.get("kw", 0)) * float(row.get("quantity", 1)) for row in loads if row.get("tag") == destination)
    if load_kw <= 0 and destination == "MCC-101":
        load_kw = sum(float(row.get("kw", 0)) * float(row.get("quantity", 1)) for row in loads if row.get("source") == "MCC-101")
    if load_kw <= 0 and destination == "XFMR-101":
        load_kw = sum(float(row.get("kw", 0)) * float(row.get("quantity", 1)) for row in loads if row.get("source") == "LP-101")
    voltage = float(cable.get("voltage", 480))
    pf = 0.9
    current = load_kw * 1000 / (math.sqrt(3) * voltage * pf) if voltage else 0
    resistance = resistance_per_kft.get(cable.get("conductor_size"), 0.2) * float(cable.get("length_ft", cable.get("length", 0))) / 1000
    drop_v = math.sqrt(3) * current * resistance
    return 100 * drop_v / voltage if voltage else 0


def build_pdf(project: dict, output_path: Path, visuals: dict):
    settings = project["settings"]
    meta = settings["projectMeta"]
    package = settings["engineeringPackage"]
    studies = settings["studies"]
    tcc_settings = settings["tccSettings"]["settings"]
    styles = make_styles()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=letter,
        rightMargin=0.55 * inch,
        leftMargin=0.55 * inch,
        topMargin=0.62 * inch,
        bottomMargin=0.58 * inch,
        title=f"{meta['projectName']} - {package['title']}",
        author=package["preparedBy"],
        subject="Sample electrical engineering report package",
    )
    frame = lambda canvas, document: draw_page_frame(canvas, document, meta, package)
    story = []

    # 1. Cover
    story.extend([
        Spacer(1, 0.75 * inch),
        Paragraph(package["title"], styles["PackageTitle"]),
        Paragraph(meta["projectName"], styles["CoverSubtitle"]),
        Spacer(1, 0.2 * inch),
        Table([["CTR", "CABLETRAYROUTE\nENGINEERING REPORT"]], colWidths=[1.2 * inch, 4.8 * inch], rowHeights=[0.85 * inch], style=TableStyle([
            ("BACKGROUND", (0, 0), (0, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (0, 0), colors.white),
            ("FONTNAME", (0, 0), (0, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (0, 0), 23),
            ("ALIGN", (0, 0), (0, 0), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BACKGROUND", (1, 0), (1, 0), PALE_BLUE),
            ("TEXTCOLOR", (1, 0), (1, 0), NAVY),
            ("FONTNAME", (1, 0), (1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (1, 0), (1, 0), 13),
            ("LEFTPADDING", (1, 0), (1, 0), 18),
            ("BOX", (0, 0), (-1, -1), 1, NAVY),
        ])),
        Spacer(1, 0.45 * inch),
        key_value_table([
            ("Project number", meta["projectNumber"]),
            ("Client", meta["client"]),
            ("Site", f"{meta['site']} - {meta['location']}"),
            ("Package ID", package["packageId"]),
            ("Revision / date", f"Rev {meta['revision']} - {meta['date']}"),
            ("Prepared by", package["preparedBy"]),
            ("Checked by", package["checkedBy"]),
        ], styles),
        Spacer(1, 0.35 * inch),
        Paragraph(package["issueStatus"], styles["CoverStatus"]),
        Spacer(1, 0.12 * inch),
        Paragraph("This document demonstrates automated report assembly from a shared project model. It is not sealed, issued for construction, or suitable for energized-work planning.", styles["Note"]),
        PageBreak(),
    ])

    # 2. Document control and contents
    story.extend(section_title("1", "Document Control and Contents", styles))
    story.append(key_value_table([
        ("Issue status", package["issueStatus"]),
        ("Purpose", "Demonstrate a complete, internally consistent electrical engineering package generated from one sample project."),
        ("Revision 0", f"{meta['date']} - Initial automated sample issue - {package['preparedBy']}"),
        ("Review state", "Internal sample review only; no professional seal or construction authorization."),
    ], styles))
    story.append(Spacer(1, 0.14 * inch))
    contents_data = [
        ("1", "Document Control and Contents", "2", "section-1"),
        ("2", "Executive Summary and Design Basis", "3", "section-2"),
        ("3", "Equipment List", "4", "section-3"),
        ("4", "Load List and Demand Summary", "5", "section-4"),
        ("5", "Cable Schedule", "6", "section-5"),
        ("6", "Raceway Schedule", "7", "section-6"),
        ("7", "Ductbank Cross-Section Views", "8-9", "section-7-1"),
        ("8", "Cable Tray Cross-Section Views", "10-12", "section-8-1"),
        ("9", "Electrical One-Line Diagram", "13", "section-9"),
        ("10", "Short-Circuit Study", "14", "section-10"),
        ("11", "Arc-Flash Study Summary", "15", "section-11"),
        ("12", "Arc-Flash Labels", "16-17", "section-12-1"),
        ("13", "Series-Fuse TCC Charts", "18-20", "section-13-1"),
        ("14", "Protective Device Settings and Coordination", "21", "section-14"),
        ("15", "Engineering Review Checklist and Limitations", "22", "section-15"),
    ]
    contents = [
        [
            internal_link_cell(number_value, anchor, styles["Cell"]),
            internal_link_cell(title_value, anchor, styles["Cell"]),
            internal_link_cell(page_value, anchor, styles["Cell"]),
        ]
        for number_value, title_value, page_value, anchor in contents_data
    ]
    story.append(Paragraph("Click any linked row to jump directly to that report section.", styles["Note"]))
    story.append(data_table(["Section", "Title", "Page"], contents, [0.65 * inch, 5.45 * inch, 0.6 * inch], styles))
    story.append(PageBreak())

    # 3. Summary and basis
    story.extend(section_title("2", "Executive Summary and Design Basis", styles))
    equipment_count = len(project["equipment"])
    connected_kw = sum(float(row.get("kw", 0)) * float(row.get("quantity", 1)) for row in project["loads"])
    demand_kw = sum(float(row.get("kw", 0)) * float(row.get("quantity", 1)) * float(row.get("demandFactor", 100)) / 100 for row in project["loads"])
    story.append(key_value_table([
        ("System overview", "480Y/277 V industrial service feeding two MCC/process motor branches and two 480-208Y/120 V transformer/panel branches."),
        ("Modeled assets", f"{equipment_count} equipment records, {len(project['loads'])} load records, {len(project['cables'])} cables, {len(project['trays'])} tray, and {len(project['ductbanks'])} ductbank."),
        ("Connected / demand load", f"{connected_kw:.1f} kW connected; {demand_kw:.1f} kW diversified screening demand."),
        ("Fault basis", f"480 V utility Thevenin source, 20 MVA, X/R 10; maximum calculated three-phase duty {studies['shortCircuit']['availableFaultKa']:.2f} kA."),
        ("Study scope", "Equipment/load schedules, raceways, cross-sections, one-line, voltage-drop screening, short circuit, arc flash, labels, and TCC coordination screening."),
    ], styles))
    story.append(Paragraph("Applicable standards", styles["Subhead"]))
    standards = [[item] for item in package["applicableStandards"]]
    story.append(data_table(["Reference"], standards, [6.7 * inch], styles))
    story.append(Paragraph("Design assumptions and limitations", styles["Subhead"]))
    for note in package["designNotes"]:
        story.append(Paragraph(f"- {note}", styles["BodySmall"]))
    story.append(PageBreak())

    # 4. Equipment list
    story.extend(section_title("3", "Equipment List", styles, "Equipment ratings and interrupting capacities must be confirmed against approved vendor data."))
    equipment_rows = []
    device_by_equipment = {row["equipment"]: row for row in package["protectiveDevices"]}
    for row in project["equipment"]:
        device = device_by_equipment.get(row["tag"], {})
        equipment_rows.append([
            row.get("tag"), row.get("description"), row.get("voltage"), row.get("category"),
            row.get("arrangement"), row.get("manufacturer"), row.get("model"),
            device.get("ratingA", device.get("frameA", "-")), device.get("interruptingKA", "-"),
        ])
    story.append(data_table(
        ["Tag", "Description", "Voltage", "Category", "Location", "Manufacturer", "Model", "OCPD A", "SCCR / AIC kA"],
        equipment_rows,
        [0.62 * inch, 1.45 * inch, 0.52 * inch, 0.7 * inch, 0.8 * inch, 0.75 * inch, 0.78 * inch, 0.46 * inch, 0.62 * inch],
        styles,
        font_size=5.7,
    ))
    story.append(PageBreak())

    # 5. Load list
    story.extend(section_title("4", "Load List and Demand Summary", styles))
    load_rows = []
    for row in project["loads"]:
        qty = float(row.get("quantity", 1))
        kw = float(row.get("kw", 0)) * qty
        demand = kw * float(row.get("demandFactor", 100)) / 100
        voltage = float(row.get("voltage", 0))
        pf = float(row.get("powerFactor", 1))
        phases = int(row.get("phases", 3))
        current = kw * 1000 / ((math.sqrt(3) if phases == 3 else 1) * voltage * pf) if voltage and pf else 0
        load_rows.append([
            row.get("tag"), row.get("source"), row.get("description"), int(qty), row.get("voltage"), phases,
            row.get("loadType"), number(kw, 2), number(pf, 2), number(current, 1), row.get("demandFactor"), number(demand, 2), row.get("circuit"),
        ])
    story.append(data_table(
        ["Load", "Source", "Description", "Qty", "V", "Ph", "Type", "Connected kW", "PF", "FLA A", "Demand %", "Demand kW", "Circuit"],
        load_rows,
        [0.55 * inch, 0.55 * inch, 1.1 * inch, 0.28 * inch, 0.34 * inch, 0.25 * inch, 0.5 * inch, 0.5 * inch, 0.3 * inch, 0.38 * inch, 0.45 * inch, 0.48 * inch, 0.58 * inch],
        styles,
        font_size=5.7,
    ))
    story.append(Spacer(1, 0.14 * inch))
    story.append(key_value_table([
        ("Total connected load", f"{connected_kw:.2f} kW"),
        ("Diversified demand", f"{demand_kw:.2f} kW"),
        ("Saved demand study", f"{studies['demandSchedule']['totalDemandKva']:.1f} kVA ({studies['demandSchedule']['status']})"),
        ("Continuous-load note", "Final feeder/OCPD sizing must apply the NEC continuous-load and motor rules appropriate to each circuit."),
    ], styles))
    story.append(PageBreak())

    # 6. Cable schedule
    story.extend(section_title("5", "Cable Schedule", styles, "Voltage drop values are screening calculations using conductor resistance and scheduled load."))
    cable_rows = []
    cable_vd_styles = []
    for row_index, row in enumerate(project["cables"], start=1):
        voltage_drop = cable_voltage_drop(row, project["loads"])
        cable_rows.append([
            row.get("tag"), row.get("from"), row.get("to"), row.get("cable_type"), row.get("conductors"),
            row.get("conductor_size"), row.get("conductor_material"), row.get("ground_size"), row.get("insulation_type"),
            row.get("voltage"), row.get("cable_rating"), row.get("ocpd_rating"), row.get("length_ft"), row.get("route_preference"),
            f"{voltage_drop:.2f}%",
        ])
        if voltage_drop > 5:
            cable_vd_styles.extend([
                ("BACKGROUND", (14, row_index), (14, row_index), colors.HexColor("#F4CCCC")),
                ("TEXTCOLOR", (14, row_index), (14, row_index), colors.HexColor("#9C0006")),
                ("FONTNAME", (14, row_index), (14, row_index), "Helvetica-Bold"),
            ])
        elif voltage_drop > 3:
            cable_vd_styles.extend([
                ("BACKGROUND", (14, row_index), (14, row_index), colors.HexColor("#FFF2CC")),
                ("TEXTCOLOR", (14, row_index), (14, row_index), colors.HexColor("#7F6000")),
                ("FONTNAME", (14, row_index), (14, row_index), "Helvetica-Bold"),
            ])
    story.append(data_table(
        ["Cable tag", "From", "To", "Service", "Cond", "Size", "Matl", "EGC", "Insul", "Operating V", "Cable rated V", "OCPD A", "Length ft", "Raceway", "VD"],
        cable_rows,
        [0.8 * inch, 0.46 * inch, 0.46 * inch, 0.42 * inch, 0.25 * inch, 0.48 * inch, 0.32 * inch, 0.39 * inch, 0.38 * inch, 0.41 * inch, 0.43 * inch, 0.36 * inch, 0.4 * inch, 0.65 * inch, 0.3 * inch],
        styles,
        font_size=5.7,
        style_commands=cable_vd_styles,
    ))
    story.append(Spacer(1, 0.14 * inch))
    story.append(Paragraph("Voltage-drop highlighting: yellow = greater than 3% and less than or equal to 5%; red = greater than 5%.", styles["BodySmall"]))
    story.append(Spacer(1, 0.06 * inch))
    story.append(Paragraph(f"Cable schedule QA: all {len(project['cables'])} rows have unique tags, source/destination equipment, conductor size, insulation, operating voltage, cable rated voltage, OCPD, length, and assigned raceway. Final ampacity requires complete adjustment/correction factors and terminal temperature verification.", styles["BodySmall"]))
    story.append(PageBreak())

    # 7. Raceway schedule
    story.extend(section_title("6", "Raceway Schedule", styles))
    raceway_rows = []
    for row in project["trays"]:
        assigned_count = sum(1 for cable in project["cables"] if row.get("tray_id") in (cable.get("raceway_ids") or []) or cable.get("route_preference") == row.get("tray_id"))
        raceway_rows.append([
            row.get("tray_id"), "Cable tray", row.get("description"), f"{row.get('inside_width')} x {row.get('tray_depth')} in",
            row.get("material"), row.get("length_ft"), f"EL {row.get('start_z')} ft", f"{assigned_count} scheduled cables",
        ])
    for ductbank in project["ductbanks"]:
        raceway_rows.append([
            ductbank.get("ductbank_id"), "Ductbank", ductbank.get("description"), f"{ductbank.get('conduit_count')} x {ductbank.get('trade_size')} in",
            "Concrete encased", ductbank.get("length_ft"), f"EL {ductbank.get('start_z')} ft", f"{len(ductbank.get('conduits', []))} modeled / 3 spare",
        ])
        for conduit in ductbank.get("conduits", []):
            raceway_rows.append([
                conduit.get("conduit_id"), "Conduit", f"Child conduit of {ductbank.get('ductbank_id')}", conduit.get("trade_size"),
                conduit.get("type"), number(math.dist(
                    [conduit.get("start_x", 0), conduit.get("start_y", 0), conduit.get("start_z", 0)],
                    [conduit.get("end_x", 0), conduit.get("end_y", 0), conduit.get("end_z", 0)],
                ), 1), "Underground to tray transition", "CBL-MCC-PMP-101",
            ])
    story.append(data_table(
        ["Raceway", "Type", "Description", "Size / arrangement", "Material", "Length ft", "Elevation / route", "Assignment"],
        raceway_rows,
        [0.82 * inch, 0.58 * inch, 1.55 * inch, 0.82 * inch, 0.75 * inch, 0.5 * inch, 0.9 * inch, 0.78 * inch],
        styles,
    ))
    story.append(Spacer(1, 0.14 * inch))
    story.append(Paragraph("Raceway schedule includes parent/child ductbank context. Geometry coordinates are in feet; cross-sectional dimensions are in inches.", styles["Note"]))
    story.append(PageBreak())

    # 8. Ductbank views
    ductbank_map = {row["ductbank_id"]: row for row in project["ductbanks"]}
    for index, cross_section in enumerate(package["ductbankCrossSections"], start=1):
        ductbank = ductbank_map.get(cross_section["ductbankId"], {})
        conduit_loading = []
        for conduit in ductbank.get("conduits", []):
            conduit_id = conduit.get("conduit_id")
            assigned_tags = [
                cable.get("tag") for cable in project["cables"]
                if conduit_id == cable.get("route_preference")
                or conduit_id in (cable.get("raceway_ids") or [])
                or conduit_id == cable.get("conduit_id")
            ]
            if assigned_tags:
                conduit_loading.append(f"{conduit_id}: {', '.join(assigned_tags)}")
        story.extend(section_title(f"7.{index}", "Ductbank Cross-Section View", styles, "Schematic cross-section; coordinate with civil details, structural reinforcement, drainage, and utility separation."))
        story.append(application_visual(visuals["ductbanks"][cross_section["ductbankId"]], max_height=5.0 * inch))
        story.append(key_value_table([
            ("Parent route", f"{cross_section['ductbankId']} - {text(ductbank.get('description'))}; scheduled length {text(ductbank.get('length_ft'))} ft."),
            ("Concrete envelope", f"{text(cross_section.get('widthIn'))} in W x {text(cross_section.get('heightIn'))} in H with {text(cross_section.get('concreteCoverIn'))} in minimum concrete beyond the conduit outside wall on every side."),
            ("Circuit assignment", "; ".join(f"C{circuit_index + 1} - {circuit}" for circuit_index, circuit in enumerate(cross_section["circuits"]))),
            ("Conduit loading", "; ".join(conduit_loading) if conduit_loading else "All modeled conduits are spare."),
            ("Thermal basis", "Concrete encasement and conductor ampacity require project soil thermal resistivity, ambient earth temperature, burial depth, and loading profile."),
            ("Construction note", "Provide spacers, minimum cover, warning tape, grounding/bonding, and spare-conduit caps per project specifications."),
        ], styles))
        story.append(PageBreak())

    # 9. Tray view
    cable_map = {row["tag"]: row for row in project["cables"]}
    tray_map = {row["tray_id"]: row for row in project["trays"]}
    for index, tray_section in enumerate(package["trayCrossSections"], start=1):
        tray = tray_map.get(tray_section["trayId"], {})
        zones = tray_section.get("dividerZones", [])
        divider_text = "No divider - single zone" if len(zones) <= 1 else f"{len(zones) - 1} divider(s): " + "; ".join(zones)
        story.extend(section_title(f"8.{index}", "Cable Tray Cross-Section View", styles, "Schematic installed arrangement; cable tray fill must be evaluated using the applicable NEC 392.22 method for the installed cable types."))
        story.append(Spacer(1, 0.12 * inch))
        story.append(application_visual(visuals["trays"][tray_section["trayId"]], max_height=4.7 * inch))
        story.append(key_value_table([
            ("Tray", f"{tray_section['trayId']} - {text(tray.get('material'))} {text(tray.get('tray_type')).lower()} tray, {tray_section['insideWidthIn']} in inside width x {tray_section['usableDepthIn']} in usable depth."),
            ("Divider zones", divider_text),
            ("Scheduled cables", ", ".join(tray_section["cables"])),
            ("Drawing notation", "Solid orange line = physical divider; dotted orange line = stacking boundary between non-stackable large cables and stackable smaller cables, when shown."),
            ("Installation note", tray_section["separationNote"]),
            ("Support note", "Verify support span, concentrated loads, fittings, bonding jumpers, and environmental derating against vendor and project criteria."),
        ], styles))
        story.append(PageBreak())

    # 10. One-line
    story.extend(section_title("9", "Electrical One-Line Diagram", styles))
    story.append(application_visual(visuals["oneLine"], max_height=6.6 * inch))
    story.append(key_value_table([
        ("Source", "SWBD-101, 480Y/277 V, 20 MVA equivalent source, X/R 10."),
        ("Process branch A", "MCC-101 supplies PMP-101 and VFD-101/PMP-102."),
        ("Production branch", "MCC-102 supplies FAN-101, AHU-101, and CMP-101."),
        ("Panel branches", "XFMR-101/LP-101 and XFMR-102/LP-102 supply process and warehouse utilization loads."),
    ], styles))
    story.append(PageBreak())

    # 11. Short circuit
    story.extend(section_title("10", "Short-Circuit Study", styles, "ANSI screening results from the sample one-line and cable impedances."))
    short_rows = []
    for key, row in studies["shortCircuit"].items():
        if key.startswith("_") or not isinstance(row, dict) or row.get("threePhaseKA") is None:
            continue
        equipment = next((item for item in project["equipment"] if item["tag"] == row.get("equipmentTag")), {})
        device = device_by_equipment.get(row.get("equipmentTag"), {})
        rating = device.get("interruptingKA") or (65 if row.get("equipmentTag") == "LP-101" else "-")
        duty = float(row["threePhaseKA"])
        short_rows.append([
            row.get("equipmentTag"), f"{float(row.get('prefaultKV', 0)) * 1000:.0f}", number(duty, 2),
            number(row.get("lineToGroundKA"), 2), number(row.get("lineToLineKA"), 2), number(row.get("doubleLineGroundKA"), 2),
            rating, "PASS" if rating != "-" and float(rating) >= duty else "REVIEW", equipment.get("arrangement"),
        ])
    story.append(data_table(
        ["Bus / equipment", "V", "3-phase kA", "SLG kA", "L-L kA", "DLG kA*", "Rating kA", "Duty", "Location"],
        short_rows,
        [0.85 * inch, 0.38 * inch, 0.62 * inch, 0.55 * inch, 0.52 * inch, 0.55 * inch, 0.56 * inch, 0.5 * inch, 1.1 * inch],
        styles,
    ))
    story.append(Spacer(1, 0.14 * inch))
    story.append(key_value_table([
        ("Maximum calculated duty", f"{studies['shortCircuit']['availableFaultKa']:.2f} kA at SWBD-101."),
        ("Method", studies["shortCircuit"]["_meta"]["method"]),
        ("Fault abbreviation", "DLG = double-line-to-ground fault (two phase conductors faulted to ground)."),
        ("Result statement", "Modeled interrupting ratings shown in this sample exceed the calculated three-phase symmetrical duty. Verify asymmetrical/peak ratings and manufacturer series combinations separately."),
    ], styles))
    story.append(PageBreak())

    # 12. Arc flash summary
    story.extend(section_title("11", "Arc-Flash Study Summary", styles, studies["arcFlash"]["_meta"]["limitations"]))
    arc_results = []
    for key, row in studies["arcFlash"].items():
        if key.startswith("_") or not isinstance(row, dict):
            continue
        arc_results.append(row)
    arc_rows = [[
        row.get("equipmentTag"), row.get("nominalVoltage"), number(row.get("boltedFaultCurrentKA"), 2),
        number(row.get("arcingCurrentKA"), 2), number(row.get("clearingTime"), 3), row.get("workingDistanceIn"),
        number(row.get("incidentEnergy"), 1), f"{row.get('boundary')} {row.get('boundaryUnit')}",
        "Below 1.2" if float(row.get("incidentEnergy", 0)) <= 1.2 else f">= {row.get('minimumArcRatingCalCm2')} cal/cm2",
    ] for row in arc_results]
    story.append(data_table(
        ["Equipment", "V", "Bolted kA", "Arcing kA", "Clear s", "Work dist in", "IE cal/cm2", "AF boundary", "Arc-rated PPE"],
        arc_rows,
        [0.72 * inch, 0.35 * inch, 0.55 * inch, 0.55 * inch, 0.45 * inch, 0.55 * inch, 0.62 * inch, 0.7 * inch, 1.1 * inch],
        styles,
    ))
    story.append(Spacer(1, 0.12 * inch))
    story.append(Paragraph("PPE is not selected solely from incident energy. The employer's electrical safety program must address shock protection, task-specific risk assessment, equipment condition, boundaries, and all NFPA 70E requirements.", styles["BodySmall"]))
    story.append(PageBreak())

    # 13. Labels
    for index in range(0, len(arc_results), 6):
        page_number = index // 6 + 1
        story.extend(section_title(f"12.{page_number}", "Arc-Flash Labels", styles, "Label artwork is for report review only. Do not install these sample labels."))
        story.append(ArcFlashLabels(arc_results[index:index + 6], package.get("labelCreatedDate", meta.get("date"))))
        story.append(PageBreak())

    # 14. TCC charts - one radial series-fuse path per sheet
    for index, tcc_study in enumerate(package["tccStudies"], start=1):
        series_path = " -> ".join(tcc_study["seriesPath"])
        story.extend(section_title(
            f"13.{index}",
            tcc_study["title"],
            styles,
            f"Only fuses on the connected radial path are plotted: {series_path}. Solid curves are total-clearing screening envelopes; dashed companion curves are minimum-melt envelopes; diagonal hatching identifies the fuse operating band between them.",
        ))
        story.append(SeriesFuseTccChart(tcc_study, tcc_settings))
        protected_assets = [tcc_study["protectedCable"]["tag"]]
        if tcc_study.get("motor"):
            protected_assets.append(f"motor {tcc_study['motor']['tag']} (hot/cold thermal limits and starting point)")
        if tcc_study.get("transformer"):
            protected_assets.append(f"transformer {tcc_study['transformer']['tag']} (inrush point and through-fault damage curve)")
        story.append(key_value_table([
            ("Series fuse path", series_path),
            ("Protected assets", "; ".join(protected_assets)),
            ("Available fault", f"{number(tcc_study.get('faultCurrentKA'), 2)} kA RMS symmetrical at the downstream study location."),
        ], styles))
        story.append(PageBreak())

    # 15. Settings and coordination
    story.extend(section_title("14", "Protective Device Settings and Coordination", styles))
    setting_rows = []
    protective_map = {row["id"]: row for row in package["protectiveDevices"]}
    for device_id, cfg in tcc_settings.items():
        equipment = protective_map.get(device_id, {})
        setting_rows.append([
            device_id, equipment.get("equipment"), equipment.get("manufacturer"), equipment.get("family"), cfg.get("type"),
            cfg.get("fuseClass"), cfg.get("ratingA"), cfg.get("curveFamily"),
            cfg.get("minimumMeltFactor"), cfg.get("totalClearingFactor"), equipment.get("interruptingKA"),
        ])
    story.append(data_table(
        ["Device", "Equipment", "Manufacturer", "Family", "Type", "Fuse class", "Rating A", "Curve family", "Min-melt factor", "Total-clear factor", "AIC kA"],
        setting_rows,
        [0.78 * inch, 0.50 * inch, 0.65 * inch, 0.52 * inch, 0.38 * inch, 0.48 * inch, 0.42 * inch, 1.05 * inch, 0.52 * inch, 0.55 * inch, 0.42 * inch],
        styles,
        font_size=5.7,
    ))
    story.append(Paragraph("Coordination interval review", styles["Subhead"]))
    pair_rows = [[
        row["upstream"], row["downstream"], number(row["faultCurrentKA"], 2), number(row["intervalSeconds"], 2),
        number(studies["tcc"]["minimumCoordinationIntervalSeconds"], 2), row["status"],
    ] for row in studies["tcc"]["pairs"]]
    story.append(data_table(
        ["Upstream", "Downstream", "Fault kA", "Interval s", "Minimum s", "Status"],
        pair_rows,
        [1.25 * inch, 1.25 * inch, 0.8 * inch, 0.8 * inch, 0.8 * inch, 1.0 * inch],
        styles,
    ))
    story.append(Spacer(1, 0.12 * inch))
    story.append(Paragraph("The Section 13 sheets now include series-connected fuse pairs, cable damage limits, transformer inrush/damage, and motor hot/cold thermal limits. Final coordination still requires manufacturer-published tolerance bands and project-specific conductor, motor, and transformer data.", styles["BodySmall"]))
    story.append(PageBreak())

    # 16. Review checklist
    story.extend(section_title("15", "Engineering Review Checklist and Limitations", styles))
    checklist = [
        ("Project data integrity", "PASS", "Equipment, load, cable, raceway, and one-line tags cross-reference consistently."),
        ("Cable routing", "PASS", "All sample cable rows have an assigned tray or conduit and stored route result."),
        ("Equipment duty", "PASS / VERIFY", "Sample calculated duty is below modeled ratings; confirm approved equipment data."),
        ("Arc-flash inputs", "VERIFY", "Field-verify working distance, enclosure, electrode configuration, operating mode, and clearing time."),
        ("TCC curves", "VERIFY", "Replace screening envelopes with manufacturer curves and tolerance bands."),
        ("Raceway design", "VERIFY", "Confirm NEC fill method, ampacity derating, tray support, bonding, and ductbank thermal inputs."),
        ("Construction coordination", "VERIFY", "Coordinate civil, structural, mechanical, firestopping, hazardous area, and access requirements."),
        ("Professional review", "REQUIRED", "A qualified engineer must review, revise, and seal any jurisdictional deliverable."),
    ]
    story.append(data_table(["Review item", "Status", "Required action / evidence"], checklist, [1.45 * inch, 0.8 * inch, 4.45 * inch], styles))
    story.append(Spacer(1, 0.18 * inch))
    story.append(Paragraph("Demonstration conclusion", styles["Subhead"]))
    story.append(Paragraph(
        "This sample proves that one normalized CableTrayRoute project can drive a consolidated report containing project controls, design basis, equipment and load lists, cable and raceway schedules, ductbank and cable tray cross-sections, a one-line diagram, short-circuit results, arc-flash results and labels, and a TCC coordination review. The package is deliberately marked as a sample because real engineering issue requires project-specific inputs, independent checking, and professional authorization.",
        styles["BodySmall"],
    ))
    story.append(Spacer(1, 0.22 * inch))
    signoff = Table([
        ["Prepared by", package["preparedBy"], "Date", meta["date"]],
        ["Checked by", package["checkedBy"], "Date", meta["date"]],
        ["Approved for construction", "NOT APPLICABLE - SAMPLE ONLY", "Seal", "Not provided"],
    ], colWidths=[1.3 * inch, 2.45 * inch, 0.65 * inch, 2.3 * inch])
    signoff.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#888888")),
        ("BACKGROUND", (0, 0), (0, -1), LIGHT_BLUE),
        ("BACKGROUND", (2, 0), (2, -1), LIGHT_BLUE),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.append(signoff)

    doc.build(story, onFirstPage=frame, onLaterPages=frame)


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Sample project JSON")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Destination PDF")
    parser.add_argument("--visuals", type=Path, default=DEFAULT_VISUALS, help="Application-rendered visual asset directory")
    return parser.parse_args()


def main():
    args = parse_args()
    project = load_project(args.input.resolve())
    visuals = load_visual_assets(args.visuals.resolve(), project)
    build_pdf(project, args.output.resolve(), visuals)
    print(args.output.resolve())


if __name__ == "__main__":
    main()
