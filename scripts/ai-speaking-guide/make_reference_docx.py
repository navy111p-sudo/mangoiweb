"""Word(.docx) 스타일 템플릿 생성 / Build the Word style template.

pandoc 기본 템플릿을 받아 한글 글꼴(맑은 고딕)·색·여백을 안내서에 맞게 바꿉니다.
Takes pandoc's default reference.docx and applies the guide's fonts, colors and margins.

사용법 / Usage: python3 make_reference_docx.py <output.docx> [standard|compact]
  compact = 한 장 안내용 (작은 글자·좁은 여백) / for the one-page guide
"""
import subprocess
import sys

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

FONT = "Malgun Gothic"          # Windows 기본 한글 글꼴 (Mac Word는 자동 대체)
FONT_EA = "맑은 고딕"
INK = RGBColor(0x14, 0x1A, 0x38)
MUTED = RGBColor(0x56, 0x5D, 0x80)

# 스타일 이름 → (크기 pt, 굵게, 색, 앞 간격 pt)
STYLE_STANDARD = {
    "Normal": (10.5, None, INK, None),
    "Body Text": (10.5, None, INK, None),
    "First Paragraph": (10.5, None, INK, None),
    "Compact": (10, None, INK, None),
    "Heading 1": (22, True, INK, 0),
    "Heading 2": (15, True, INK, 18),
    "Heading 3": (12, True, INK, 10),
    "Image Caption": (9, None, MUTED, None),
}

STYLE_COMPACT = {
    "Normal": (10, None, INK, None),
    "Body Text": (10, None, INK, 0),
    "First Paragraph": (10, None, INK, 0),
    "Compact": (9.5, None, INK, 0),
    "Heading 1": (18, True, INK, 0),
    "Heading 2": (12.5, True, INK, 6),
    "Heading 3": (10.5, True, INK, 2),
}

PROFILES = {
    # 이름: (스타일, 여백 cm, 문단 뒤 간격 pt)
    "standard": (STYLE_STANDARD, 2.0, None),
    "compact": (STYLE_COMPACT, 1.3, 2),
}


def set_fonts(rpr):
    """테마 글꼴 지정을 지우고 실제 글꼴을 넣는다 (테마가 우선 적용되는 문제 방지)."""
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.insert(0, rfonts)
    for attr in ("w:asciiTheme", "w:hAnsiTheme", "w:eastAsiaTheme", "w:cstheme"):
        rfonts.attrib.pop(qn(attr), None)
    rfonts.set(qn("w:ascii"), FONT)
    rfonts.set(qn("w:hAnsi"), FONT)
    rfonts.set(qn("w:eastAsia"), FONT_EA)
    rfonts.set(qn("w:cs"), FONT)


def apply_styles(doc, spec_table, space_after):
    defaults = doc.styles.element.find(qn("w:docDefaults"))
    if defaults is not None:
        rpr = defaults.find(qn("w:rPrDefault") + "/" + qn("w:rPr"))
        if rpr is not None:
            set_fonts(rpr)

    for style in doc.styles:
        if style.type not in (1, 2):  # 1=문단, 2=문자 스타일
            continue
        set_fonts(style.element.get_or_add_rPr())
        spec = spec_table.get(style.name)
        if not spec:
            continue
        size, bold, color, space_before = spec
        style.font.size = Pt(size)
        if bold is not None:
            style.font.bold = bold
        style.font.color.rgb = color
        if space_before is not None:
            style.paragraph_format.space_before = Pt(space_before)
        if space_after is not None and style.type == 1:
            style.paragraph_format.space_after = Pt(space_after)


def apply_page(doc, margin_cm):
    for section in doc.sections:
        section.page_width, section.page_height = Cm(21), Cm(29.7)  # A4
        section.left_margin = section.right_margin = Cm(margin_cm)
        section.top_margin = section.bottom_margin = Cm(margin_cm)


def main(out_path, profile="standard"):
    spec_table, margin_cm, space_after = PROFILES[profile]
    default_ref = subprocess.run(
        ["pandoc", "--print-default-data-file", "reference.docx"],
        capture_output=True, check=True,
    ).stdout
    with open(out_path, "wb") as f:
        f.write(default_ref)

    doc = Document(out_path)
    apply_styles(doc, spec_table, space_after)
    apply_page(doc, margin_cm)
    doc.save(out_path)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "standard")
