#!/usr/bin/env python3
"""Builds the 8-slide Model Arena deck (editable .pptx) and a matching HTML used to print the PDF.

Usage: python3 presentation/build_deck.py   (run from the repository root)
Every figure below comes from the stored genuine race data or the test suite — nothing is invented.
"""
import base64, html
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.util import Pt

BG, CYAN, PINK, AMBER, WHITE, MUTED = '05040D', '22E5FF', 'FF2BD6', 'FFB627', 'FFFFFF', 'B8B4D6'

SLIDES = [
    {'kicker': 'APPFUSION HACKATHON 2026 · TRU AI CLUB', 'title': 'Model Arena', 'img': 'screenshots/01-home.png',
     'lines': [('Real AI models answer the same prompt. A neutral AI judge scores them. The results race on a neon 3D track.', 22, MUTED, False),
               ('Apex Intelligence — Khushmeet Kaur Bade', 20, PINK, True),
               ('github.com/KhushmeetBade/model-arena', 16, CYAN, False),
               ('Live: model-arena-lake.vercel.app', 16, CYAN, False)]},
    {'kicker': 'PROBLEM AND TARGET USERS', 'title': 'Comparing AI models is slow and hard to see', 'cols': [
        ['• Same prompt pasted into several tools, answers read and judged by hand',
         '• No side-by-side view of how different models handle YOUR prompt',
         '• Speed, quality and failures are hard to compare fairly'],
        ['• Students learning how models differ', '• Developers choosing a model', '• AI enthusiasts',
         '• Educators & researchers demonstrating differences']]},
    {'kicker': 'SOLUTION AND VALUE', 'title': 'One prompt. Five models. One fair, visible verdict.', 'img': 'screenshots/03-race.png',
     'bullets': ['• Identical prompt sent to up to 5 free models at the same moment',
                 '• Answers stream live (Team Radio) and can all be read in full',
                 '• Neutral AI judge scores each answer blind (A, B, C…)',
                 '• Scores become race positions, a podium and a championship',
                 '• Every race saved as a replay at its original timing']},
    {'kicker': 'AI WORKFLOW AND ARCHITECTURE', 'title': 'Real inference drives every result', 'size': 17,
     'bullets': ['• Garage: only :free OpenRouter models with every price = $0 (11 verified)',
                 '• POST /api/races/run → same prompt to every model (concurrent) → Server-Sent Events',
                 '• Judge: neutral free model that is not racing, strict JSON — accuracy, helpfulness, clarity, completeness (0–10)',
                 '• Total = 65% quality + 25% speed + 10% completion; DNF = 0',
                 '• React 19 · TypeScript · Vite · Zustand · three.js | Node 24 · Express 5 · SSE · JSON files / private Vercel Blob']},
    {'kicker': 'REAL APPLICATION DEMONSTRATION', 'title': 'Genuine race: “Hey love, find me the love of my life.”', 'img': 'screenshots/04-replay.png', 'size': 16,
     'bullets': ['• Race 348cee31, recorded 21 Nov 2026 with real OpenRouter inference — 3 cars, all finished',
                 '• Winner: Nemotron 3.5 Super VL, 95.1 (quality 92.5, speed 100) — said it cannot find a person, then gave practical dating advice',
                 '• 2nd Nemotron 3 Nano Omni 87.0 · 3rd ERNIE-5.5-Flash-Preview 85.4',
                 '• Judge NVIDIA Nemotron 3 Ultra: “Answer A offers the most immediate, practical guidance…”',
                 '• 11 genuine races stored and replayable locally']},
    {'kicker': 'INNOVATION, CREATIVITY AND USABILITY', 'title': 'AI evaluation as motorsport', 'img': 'screenshots/05-mobile.png',
     'bullets': ['• Tokens move the cars; time-to-first-token launches them',
                 '• The judge — not the finish line — decides the podium',
                 '• Telemetry: tokens/s, TTFT, latency, reasoning phase',
                 '• Paint Shop, replays, championship standings',
                 '• Mobile-first PWA: bottom tab bar, 44 px touch targets, no overflow at 320–390 px (Chrome emulation)',
                 '• Three DEMO races, always labelled simulated, use no AI quota']},
    {'kicker': 'SAFETY, TESTING AND TECHNICAL UNDERSTANDING', 'title': 'Free-only, server-side keys, tested', 'size': 17,
     'bullets': ['• API key server-side only; paid providers hard-locked (ALLOW_PAID_PROVIDERS=false)',
                 '• Whole-race quota preflight blocks a race before it can fail halfway; cooldowns, judge fallback, DNF reasons',
                 '• Public deployment: owner access code, daily cap of 5 live races, host/origin guard',
                 '• Safe Markdown rendering — model output cannot inject HTML',
                 '• 74 automated tests (57 server + 17 client, mock providers) · TypeScript · production build',
                 '• Secret scan: no keys or access codes in tracked files or git history']},
    {'kicker': 'RESULTS, LIMITATIONS AND NEXT STEPS', 'title': 'What we learned', 'footer': 'Model Arena — AI comparison you can watch.',
     'bullets': [('• 11 genuine races, 45 car entries, 31 finished, 10 decided by the AI judge', WHITE),
                 ('• Limitation: LLM judging is subjective and can be biased', AMBER),
                 ('• Limitation: free models are often rate-limited (14 of 45 entries DNF; 50 free requests/day)', AMBER),
                 ('• Limitation: mobile verified in Chrome emulation; physical-iPhone testing still to do', AMBER),
                 ('• Next: custom criteria, multiple judges, benchmark prompt sets, more providers, usability study', WHITE)]},
]

def rgb(h): return RGBColor.from_string(h)

def add_text(slide, x, y, w, h, paras):
    tb = slide.shapes.add_textbox(Pt(x), Pt(y), Pt(w), Pt(h))
    tf = tb.text_frame; tf.word_wrap = True
    for i, (text, size, color, bold) in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(8)
        r = p.add_run(); r.text = text
        r.font.size = Pt(size); r.font.color.rgb = rgb(color); r.font.bold = bold; r.font.name = 'Calibri'
    return tb

def norm_bullets(s):
    size = s.get('size', 18)
    return [(b, size, WHITE, False) if isinstance(b, str) else (b[0], size, b[1], False) for b in s.get('bullets', [])]

prs = Presentation()
prs.slide_width, prs.slide_height = Pt(960), Pt(540)
for s in SLIDES:
    sl = prs.slides.add_slide(prs.slide_layouts[6])
    sl.background.fill.solid(); sl.background.fill.fore_color.rgb = rgb(BG)
    add_text(sl, 43, 25, 864, 28, [(s['kicker'], 14, CYAN, True)])
    add_text(sl, 43, 50, 864, 72, [(s['title'], 36 if len(s['title']) < 50 else 30, WHITE, True)])
    img = s.get('img'); wide = 432 if img else 878
    if 'cols' in s:
        add_text(sl, 43, 129, 446, 360, [(t, 18, WHITE, False) for t in s['cols'][0]])
        add_text(sl, 504, 129, 417, 360, [(t, 18, WHITE, False) for t in s['cols'][1]])
    elif 'lines' in s:
        add_text(sl, 43, 129, 432, 300, s['lines'])
    else:
        add_text(sl, 43, 129, wide, 380, norm_bullets(s))
    if img: sl.shapes.add_picture(img, Pt(496), Pt(129), Pt(432), Pt(243))
    if s.get('footer'): add_text(sl, 43, 460, 864, 43, [(s['footer'], 22, PINK, True)])
prs.save('presentation/Model-Arena-Presentation.pptx')

# Matching HTML (same boxes, sizes and colours, in pt) for the PDF
def box(x, y, w, paras):
    ps = ''.join(f'<p style="margin:0 0 8pt;font-size:{sz}pt;color:#{c};font-weight:{700 if b else 400}">{html.escape(t)}</p>' for t, sz, c, b in paras)
    return f'<div style="position:absolute;left:{x}pt;top:{y}pt;width:{w}pt">{ps}</div>'
pages = []
for s in SLIDES:
    img = s.get('img'); wide = 432 if img else 878
    parts = [box(50, 30, 850, [(s['kicker'], 14, CYAN, True)]), box(50, 55, 850, [(s['title'], 36 if len(s['title']) < 50 else 30, WHITE, True)])]
    if 'cols' in s:
        parts += [box(50, 136, 432, [(t, 18, WHITE, False) for t in s['cols'][0]]), box(511, 136, 403, [(t, 18, WHITE, False) for t in s['cols'][1]])]
    elif 'lines' in s: parts.append(box(50, 136, 418, s['lines']))
    else: parts.append(box(50, 136, wide - 14, norm_bullets(s)))
    if img:
        data = base64.b64encode(open(img, 'rb').read()).decode()
        parts.append(f'<img src="data:image/png;base64,{data}" style="position:absolute;left:496pt;top:129pt;width:432pt;height:243pt;object-fit:cover">')
    if s.get('footer'): parts.append(box(50, 465, 850, [(s['footer'], 22, PINK, True)]))
    pages.append(f'<section style="position:relative;width:960pt;height:540pt;background:#{BG};overflow:hidden;page-break-after:always">{"".join(parts)}</section>')
open('presentation/deck.html', 'w').write('<!doctype html><meta charset="utf-8"><style>@page{size:960pt 540pt;margin:0}body{margin:0;font-family:Calibri,Carlito,"Segoe UI",Inter,Arial,sans-serif;line-height:1.2}</style>' + ''.join(pages))
print('deck built:', len(SLIDES), 'slides')
