import io
import json
import sys

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def escape_text(value):
    return str(value or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def bullet_paragraph(text, style):
    return Paragraph(f"- {escape_text(text)}", style)


def main():
    payload = json.loads(sys.stdin.read() or "{}")

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.7 * inch,
        leftMargin=0.7 * inch,
        topMargin=0.7 * inch,
        bottomMargin=0.7 * inch,
        title=payload.get("title", "Pipeline Report"),
        author="Agent OS",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "TitleStyle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=24,
        leading=28,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=10,
        alignment=TA_LEFT,
    )
    subtitle_style = ParagraphStyle(
        "SubtitleStyle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#475569"),
        spaceAfter=12,
    )
    section_style = ParagraphStyle(
        "SectionStyle",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#0f766e"),
        spaceBefore=8,
        spaceAfter=8,
    )
    body_style = ParagraphStyle(
        "BodyStyle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10.5,
        leading=15,
        textColor=colors.HexColor("#1f2937"),
        spaceAfter=6,
    )
    bullet_style = ParagraphStyle(
        "BulletStyle",
        parent=body_style,
        leftIndent=0,
        spaceAfter=5,
    )

    story = [
        Paragraph(escape_text(payload.get("title", "Client Strategy Report")), title_style),
        Paragraph(escape_text(payload.get("subtitle", "Generated from your Agent OS pipeline run")), subtitle_style),
    ]

    context_rows = []
    for label, value in payload.get("context_rows", []):
        if value:
            context_rows.append([
                Paragraph(f"<b>{escape_text(label)}</b>", body_style),
                Paragraph(escape_text(value), body_style),
            ])

    if context_rows:
        table = Table(context_rows, colWidths=[1.65 * inch, 4.9 * inch])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#e2e8f0")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(table)
        story.append(Spacer(1, 0.18 * inch))

    for section in payload.get("sections", []):
        title = section.get("title")
        if title:
            story.append(Paragraph(escape_text(title), section_style))

        body = section.get("body")
        if body:
            story.append(Paragraph(escape_text(body), body_style))

        for bullet in section.get("bullets", []):
            story.append(bullet_paragraph(bullet, bullet_style))

        story.append(Spacer(1, 0.1 * inch))

    doc.build(story)
    sys.stdout.buffer.write(buffer.getvalue())


if __name__ == "__main__":
    main()
