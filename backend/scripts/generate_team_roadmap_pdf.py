import os
import sys
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748B"))
        
        # Header (pages > 1)
        if self._pageNumber > 1:
            self.drawString(54, 750, "DecisionLens · Team Strategic Direction & Architecture Roadmap")
            self.setStrokeColor(colors.HexColor("#CBD5E1"))
            self.setLineWidth(0.5)
            self.line(54, 744, 558, 744)

        # Footer (all pages)
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(54, 45, 558, 45)
        self.drawString(54, 32, "CONFIDENTIAL · INTERNAL TEAM BLUEPRINT · DECISIONLENS v2.0")
        self.drawRightString(558, 32, f"Page {self._pageNumber} of {page_count}")
        self.restoreState()

def build_pdf(filename="DecisionLens_Team_Roadmap.pdf"):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    
    styles = getSampleStyleSheet()
    
    # Custom Palette
    c_primary = colors.HexColor("#0F172A")    # Deep Navy
    c_secondary = colors.HexColor("#1E293B")  # Dark Slate
    c_teal = colors.HexColor("#0D9488")       # Primary Accent Teal
    c_blue = colors.HexColor("#2563EB")       # Accent Blue
    c_amber = colors.HexColor("#D97706")      # Warning/Caution
    c_bg_light = colors.HexColor("#F8FAFC")   # Box background
    c_border = colors.HexColor("#E2E8F0")     # Subtle border
    c_text = colors.HexColor("#334155")       # Body text
    
    # Typography Styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=22,
        leading=26,
        textColor=c_primary,
        spaceAfter=4
    )
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=c_teal,
        spaceAfter=12
    )
    h1_style = ParagraphStyle(
        'SecH1',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=17,
        textColor=c_secondary,
        spaceBefore=12,
        spaceAfter=6,
        keepWithNext=True
    )
    body_style = ParagraphStyle(
        'BodyDark',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12.5,
        textColor=c_text,
        spaceAfter=5
    )
    bullet_style = ParagraphStyle(
        'BulletDark',
        parent=body_style,
        leftIndent=12,
        firstLineIndent=-8,
        spaceAfter=3.5
    )
    callout_style = ParagraphStyle(
        'CalloutText',
        parent=body_style,
        fontName='Helvetica-Oblique',
        fontSize=8.5,
        leading=12.5,
        textColor=c_primary
    )
    table_header_style = ParagraphStyle(
        'TH',
        parent=body_style,
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10.5,
        textColor=colors.white
    )
    table_cell_style = ParagraphStyle(
        'TD',
        parent=body_style,
        fontSize=7.5,
        leading=10.5,
        textColor=c_text,
        spaceAfter=0
    )
    table_cell_bold = ParagraphStyle(
        'TDBold',
        parent=table_cell_style,
        fontName='Helvetica-Bold',
        textColor=c_primary
    )

    story = []

    # Title Block
    story.append(Paragraph("DECISIONLENS: TEAM STRATEGIC ROADMAP & ALIGNMENT", title_style))
    story.append(Paragraph("From Academic Prototype to B2B AI Decision Room · Engineering & Viva Playbook", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=c_teal, spaceBefore=2, spaceAfter=10))

    # Executive Summary Card
    summary_text = (
        "<b>Executive Summary:</b> We are transforming DecisionLens from an academic prototype with a 6-stage manual form "
        "into a high-value B2B platform: <b>The Collaborative AI Decision Room</b>. Instead of forcing busy executives to fill out "
        "step-by-step cognitive boxes, our new direction allows teams to conduct their meetings directly inside the app, captures silent anonymous "
        "dissent to kill meeting bias (HiPPO effect), and instantly outputs an audit-grade 1-page Architecture Decision Record (ADR) "
        "with closed-loop precedent memory. This document explains the exact 'Why', 'What', and 'How' so our entire team is aligned."
    )
    summary_table = Table([[Paragraph(summary_text, callout_style)]], colWidths=[504])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), c_bg_light),
        ('BOX', (0,0), (-1,-1), 1, c_teal),
        ('PADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 10))

    # Section 1: The Core Problem With Our Previous Approach
    story.append(Paragraph("1. Why Are We Changing? (The Flaws in Our Previous Direction)", h1_style))
    story.append(Paragraph(
        "Our backend architecture is exceptionally solid: we have 143 passing tests, an epistemic cognitive filter (Dr. Evelyn Vance), "
        "a gap sentry (Dr. Marcus Vance), and mathematical MAUT scoring (Prof. Caleb Thorne). <b>However, our product packaging had 3 fatal flaws:</b>",
        body_style
    ))
    
    story.append(Paragraph("• <b>The 'Cognitive Obstacle Course' (High Friction):</b> Users were forced to manually click through 6 sequential tabs (Input &rarr; Structuring &rarr; Gaps &rarr; Frameworks &rarr; Synthesis &rarr; Roadmap). Busy tech leads and managers will not spend 15 minutes doing homework for a tool.", bullet_style))
    story.append(Paragraph("• <b>Single-Player Bottleneck:</b> Decision-making in engineering teams is never done alone. In our old model, only one person sat at their laptop entering text. The real stakeholders were excluded.", bullet_style))
    story.append(Paragraph("• <b>The 'HiPPO' Problem (Loud Boss Dominance):</b> In real 45-minute meetings, the senior lead speaks 80% of the time. Junior developers and quiet architects who know critical flaws are afraid to speak up aloud.", bullet_style))
    story.append(Spacer(1, 6))

    # Section 2: The New Product Architecture
    story.append(Paragraph("2. The New Direction: Collaborative Decision Room & ADR Engine", h1_style))
    story.append(Paragraph(
        "We are pivoting our user experience into a seamless <b>In-App Decision Room</b> that operates on 4 core superpowers:",
        body_style
    ))

    # 4 Pillars Table
    pillars_data = [
        [Paragraph("Superpower", table_header_style), Paragraph("How It Works Technically", table_header_style), Paragraph("Why It Wins (The Value)", table_header_style)],
        
        [Paragraph("1. In-App Video & Silent Scribe", table_cell_bold),
         Paragraph("Embedded WebRTC video (Jitsi React SDK) + Private Side-Drawer on the right side of the screen.", table_cell_style),
         Paragraph("<b>Kills HiPPO bias.</b> Team speaks on video, but quiet engineers privately and anonymously submit technical risks without office politics.", table_cell_style)],
        
        [Paragraph("2. Trilingual Indian STT", table_cell_bold),
         Paragraph("AI4Bharat IndicWhisper + Groq Whisper-Large-v3. Native support for Punjabi, Hindi, and Indian English.", table_cell_style),
         Paragraph("<b>No language barrier.</b> Code-switching in Indian tech teams (Bangalore, NCR, Chandigarh) is transcribed with 95%+ accuracy for &8377;0.", table_cell_style)],

        [Paragraph("3. Dual Hub-and-Spoke RAG", table_cell_bold),
         Paragraph("Modular Vector Collections (Career, Legal, Software) + Private Document RAG for PRDs and contracts.", table_cell_style),
         Paragraph("<b>Grounding without bloat.</b> Satisfies our teacher's academic demand for Universal RAG while keeping latency under 8 seconds.", table_cell_style)],

        [Paragraph("4. Precedent Folder Memory", table_cell_bold),
         Paragraph("Semantic vector retrieval over past meetings in that folder, replacing naive LIMIT 5 FIFO.", table_cell_style),
         Paragraph("<b>Prevents repeated mistakes.</b> If Meeting #2 had a database outage 5 months ago, Meeting #15 is warned automatically.", table_cell_style)],
    ]
    t_pillars = Table(pillars_data, colWidths=[120, 194, 190])
    t_pillars.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_primary),
        ('GRID', (0,0), (-1,-1), 0.5, c_border),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('PADDING', (0,0), (-1,-1), 5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_bg_light]),
    ]))
    story.append(t_pillars)
    story.append(Spacer(1, 10))

    # Page Break for Technical Changes & Responsibilities
    story.append(PageBreak())

    # Section 3: Technical Implementation Tasks
    story.append(Paragraph("3. Concrete Technical Changes Required in Our Codebase", h1_style))
    story.append(Paragraph(
        "To make this new architecture live, here are the exact files and modules we are modifying. Notice that our existing 143 passing unit tests remain intact because our additions are modular adapters:",
        body_style
    ))

    tech_tasks = [
        [Paragraph("Component / Layer", table_header_style), Paragraph("Target File(s)", table_header_style), Paragraph("Action Required", table_header_style)],
        
        [Paragraph("Live Video Room", table_cell_bold),
         Paragraph("<font name=\"Courier\">frontend/components/LiveDecisionRoom.tsx</font>", table_cell_style),
         Paragraph("Embed Jitsi Meet React SDK (70% width) with room link generation for multi-device joining.", table_cell_style)],

        [Paragraph("Silent Scribe Drawer", table_cell_bold),
         Paragraph("<font name=\"Courier\">frontend/components/SilentScribeDrawer.tsx</font>", table_cell_style),
         Paragraph("Right-side drawer (30% width) with inputs for anonymous technical risks, constraints, and criteria voting.", table_cell_style)],

        [Paragraph("Express ADR Mode", table_cell_bold),
         Paragraph("<font name=\"Courier\">frontend/app/decisions/[id]/page.tsx</font>", table_cell_style),
         Paragraph("Add 1-Click 'Generate 1-Page ADR Memo' button that runs Stages 2–5 asynchronously behind a 6-second progress bar.", table_cell_style)],

        [Paragraph("Transcript Ingestion", table_cell_bold),
         Paragraph("<font name=\"Courier\">backend/app/services/file_parser.py</font>", table_cell_style),
         Paragraph("Add parse_vtt_transcript() to strip WEBVTT timestamps from Google Meet and Zoom transcript exports.", table_cell_style)],

        [Paragraph("Private Notes API", table_cell_bold),
         Paragraph("<font name=\"Courier\">backend/app/models.py</font><br/>"
                   "<font name=\"Courier\">backend/app/api/decisions.py</font>", table_cell_style),
         Paragraph("Add DecisionParticipantNote table and POST /decisions/{id}/private-notes endpoint.", table_cell_style)],

        [Paragraph("Folder Semantic RAG", table_cell_bold),
         Paragraph("<font name=\"Courier\">backend/app/services/folder_context.py</font>", table_cell_style),
         Paragraph("Replace chronological LIMIT 5 with vector similarity search against past decisions in the same folder.", table_cell_style)],
    ]
    t_tech = Table(tech_tasks, colWidths=[110, 174, 220])
    t_tech.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_secondary),
        ('GRID', (0,0), (-1,-1), 0.5, c_border),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('PADDING', (0,0), (-1,-1), 4.5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_bg_light]),
    ]))
    story.append(t_tech)
    story.append(Spacer(1, 10))

    # Section 4: Team Roles and Task Division
    story.append(Paragraph("4. Team Division of Responsibilities (Who Builds What)", h1_style))
    story.append(Paragraph(
        "To execute this cleanly and without overlapping merge conflicts, here is the suggested division of labor across our team:",
        body_style
    ))

    roles_data = [
        [Paragraph("Role / Owner", table_header_style), Paragraph("Primary Ownership", table_header_style), Paragraph("Deliverables for This Sprint", table_header_style)],
        
        [Paragraph("Frontend Engineer 1<br/>(UI & Live Room)", table_cell_bold),
         Paragraph("Live Decision Room & WebRTC Layout", table_cell_style),
         Paragraph("1. Install @jitsi/react-sdk.<br/>2. Build the split-screen Live Room page.<br/>3. Connect the camera/mic controls.", table_cell_style)],

        [Paragraph("Frontend Engineer 2<br/>(Scribe & Express UX)", table_cell_bold),
         Paragraph("Silent Drawer & 1-Page ADR View", table_cell_style),
         Paragraph("1. Build the Silent Scribe Drawer.<br/>2. Build the 'Express Memo' 1-click summary card.<br/>3. Hook up the PDF Export button.", table_cell_style)],

        [Paragraph("Backend Engineer 1<br/>(STT & Ingestion)", table_cell_bold),
         Paragraph("VTT Parser & Trilingual STT Gateway", table_cell_style),
         Paragraph("1. Add VTT/TXT parser in file_parser.py.<br/>2. Wire up AI4Bharat / Groq Whisper endpoint.<br/>3. Create Participant Notes API.", table_cell_style)],

        [Paragraph("Backend Engineer 2<br/>(RAG & Folder Memory)", table_cell_bold),
         Paragraph("Folder Precedent Semantic RAG", table_cell_style),
         Paragraph("1. Upgrade folder_context.py with vector search.<br/>2. Connect Stage 3 gap sentry to domain RAG.<br/>3. Maintain 100% pytest passing rate.", table_cell_style)],
    ]
    t_roles = Table(roles_data, colWidths=[120, 164, 220])
    t_roles.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_teal),
        ('GRID', (0,0), (-1,-1), 0.5, c_border),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('PADDING', (0,0), (-1,-1), 4.5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_bg_light]),
    ]))
    story.append(t_roles)
    story.append(Spacer(1, 10))

    # Page Break for Presentation & Viva Cheat Sheet
    story.append(PageBreak())

    # Section 5: The Viva & Presentation Defense Playbook
    story.append(Paragraph("5. The Viva & Mentor Presentation Defense Playbook", h1_style))
    story.append(Paragraph(
        "When teachers, mentors, or external examiners question our project during reviews, every teammate must use these exact, unified defenses:",
        body_style
    ))

    qa_data = [
        [Paragraph("Examiner / Mentor Question", table_header_style), Paragraph("How Every Teammate Must Answer (The Unified Defense)", table_header_style)],
        
        [Paragraph("<b>Q1: 'Why not just use ChatGPT Plus or Claude?'</b>", table_cell_bold),
         Paragraph("<i>'ChatGPT has zero organizational memory and cannot track outcomes over 90 days. Furthermore, ChatGPT acts as an echo chamber for the loudest voice. DecisionLens has Precedent Chaining across meetings, silent anonymous risk capture, and mathematical MAUT scoring.'</i>", table_cell_style)],

        [Paragraph("<b>Q2: 'Your teacher asked for Universal RAG. Is it only for software?'</b>", table_cell_bold),
         Paragraph("<i>'No, Sir. Our architecture is 100% Universal with a Hub-and-Spoke RAG model. We have modular vector collections for Career (O*NET), Legal (Common Paper), and Software (AWS Well-Architected). We use Software Architecture as our commercial spearhead because tech decisions carry multi-lakh financial penalties.'</i>", table_cell_style)],

        [Paragraph("<b>Q3: 'How does it handle Indian languages and Hinglish?'</b>", table_cell_bold),
         Paragraph("<i>'We integrate AI4Bharat IndicWhisper (from IIT Madras), explicitly trained on Indian accents, code-switching, Punjabi, and Hindi. Furthermore, Stage 2 Dr. Evelyn Vance normalizes phonetic idioms into standardized engineering facts.'</i>", table_cell_style)],

        [Paragraph("<b>Q4: 'Why wouldn't an arrogant lead ignore your app?'</b>", table_cell_bold),
         Paragraph("<i>'DecisionLens serves as an objective Architectural Sentry. It gives the lead an audit-grade liability shield (ADR) to justify the decision to the CTO, while allowing quiet junior engineers to privately submit fatal infrastructure risks.'</i>", table_cell_style)],

        [Paragraph("<b>Q5: 'What is your defensible moat?'</b>", table_cell_bold),
         Paragraph("<i>'Folder Precedent Memory. When a company uses DecisionLens for 6 months, their past mistakes and post-mortems live inside our system. That institutional memory creates massive switching costs that no generic LLM can replicate.'</i>", table_cell_style)],
    ]
    t_qa = Table(qa_data, colWidths=[170, 334])
    t_qa.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_primary),
        ('GRID', (0,0), (-1,-1), 0.5, c_border),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('PADDING', (0,0), (-1,-1), 5),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, c_bg_light]),
    ]))
    story.append(t_qa)
    story.append(Spacer(1, 10))

    # Concluding Banner
    concl_text = (
        "<b>Action Call for the Team:</b> Let us build with confidence. We have 143 passing tests, an unfair moat in Precedent Chaining, "
        "and a product that addresses real organizational pain. Review this document, pick your component, and let's make DecisionLens "
        "the standout project of our academic and professional careers."
    )
    t_concl = Table([[Paragraph(concl_text, callout_style)]], colWidths=[504])
    t_concl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#FEF3C7")),
        ('BOX', (0,0), (-1,-1), 1, c_amber),
        ('PADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_concl)

    # Build Document
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Successfully generated PDF at: {filename}")

if __name__ == "__main__":
    out_path = sys.argv[1] if len(sys.argv) > 1 else "DecisionLens_Team_Roadmap.pdf"
    build_pdf(out_path)
