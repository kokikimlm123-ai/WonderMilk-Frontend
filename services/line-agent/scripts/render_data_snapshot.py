"""Render already scope-filtered adapter evidence, never unfiltered source workbooks."""
import json, sys
from xml.sax.saxutils import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.pagesizes import landscape, A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pathlib import Path
styles=getSampleStyleSheet()
font=Path('/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf')
if font.exists():
    pdfmetrics.registerFont(TTFont('SourceSans',str(font)))
    styles['BodyText'].fontName='SourceSans'
styles['BodyText'].fontSize=9
styles['BodyText'].leading=12
styles['BodyText'].wordWrap='CJK'
data=json.loads(Path(sys.argv[1]).read_text())
story=[Paragraph(escape(sys.argv[3]),styles['Title']),Paragraph('Source-data snapshot. Original workbook layout is not reproduced. Missing values remain null; source warnings are included.',styles['BodyText']),Spacer(1,12)]
# JSON lines preserve keys, nulls, row numbers and source provenance without AI inference.
for line in json.dumps(data,ensure_ascii=False,indent=2).splitlines():
    story.append(Paragraph(escape(line).replace('  ','&#160;&#160;'),styles['BodyText']))
SimpleDocTemplate(sys.argv[2],pagesize=landscape(A4),leftMargin=30,rightMargin=30,topMargin=30,bottomMargin=30).build(story)
