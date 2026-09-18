from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, ListFlowable, ListItem
import sys

out = sys.argv[1]
INK = colors.HexColor("#14161f"); SIGNAL = colors.HexColor("#1d4ed8"); DIM = colors.HexColor("#80848f"); RULE = colors.HexColor("#e1e3e9"); WASH = colors.HexColor("#e8edfb")
ss = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=ss["Title"], fontName="Helvetica-Bold", fontSize=22, leading=26, textColor=INK, alignment=0, spaceAfter=4)
SUB = ParagraphStyle("SUB", parent=ss["Normal"], fontName="Helvetica", fontSize=10.5, leading=14, textColor=DIM, spaceAfter=14)
H2 = ParagraphStyle("H2", parent=ss["Heading1"], fontName="Helvetica-Bold", fontSize=15, leading=19, textColor=INK, spaceBefore=14, spaceAfter=6)
H3 = ParagraphStyle("H3", parent=ss["Heading2"], fontName="Helvetica-Bold", fontSize=11.5, leading=15, textColor=SIGNAL, spaceBefore=10, spaceAfter=4)
P = ParagraphStyle("P", parent=ss["Normal"], fontName="Helvetica", fontSize=10, leading=14, textColor=INK, spaceAfter=6)
SMALL = ParagraphStyle("SMALL", parent=P, fontSize=8.5, leading=11.5, textColor=DIM)
NOTE = ParagraphStyle("NOTE", parent=P, backColor=WASH, borderPadding=(6, 8, 6, 8), leftIndent=4, rightIndent=4, spaceBefore=4, spaceAfter=10)
WARN = ParagraphStyle("WARN", parent=P, backColor=colors.HexColor("#fdecea"), borderPadding=(6, 8, 6, 8), leftIndent=4, rightIndent=4, spaceBefore=4, spaceAfter=10)

def steps(items):
    return ListFlowable([ListItem(Paragraph(t, P), leftIndent=14) for t in items], bulletType="1", bulletFontName="Helvetica-Bold", bulletFontSize=9.5, leftIndent=16, bulletColor=SIGNAL)
def bullets(items):
    return ListFlowable([ListItem(Paragraph(t, P), leftIndent=12) for t in items], bulletType="bullet", start="•", leftIndent=14, bulletColor=INK)
def cell(t): return Paragraph(t, ParagraphStyle("c", parent=P, fontSize=8.8, leading=11.5, spaceAfter=0))
def table(rows, widths):
    t = Table(rows, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([("FONTSIZE", (0,0), (-1,-1), 8.8), ("TEXTCOLOR", (0,0), (-1,0), DIM), ("LINEBELOW", (0,0), (-1,0), 0.8, INK), ("LINEBELOW", (0,1), (-1,-1), 0.4, RULE), ("VALIGN", (0,0), (-1,-1), "TOP"), ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4), ("LEFTPADDING", (0,0), (-1,-1), 2)]))
    return t
def footer(canvas, doc):
    canvas.saveState(); canvas.setFont("Helvetica", 8); canvas.setFillColor(DIM)
    canvas.drawString(0.9*inch, 0.55*inch, "MacroBrief — Meta Business setup · 18 Sep 2026")
    canvas.drawRightString(letter[0]-0.9*inch, 0.55*inch, f"Page {doc.page}")
    canvas.restoreState()

doc = SimpleDocTemplate(out, pagesize=letter, leftMargin=0.9*inch, rightMargin=0.9*inch, topMargin=0.8*inch, bottomMargin=0.9*inch, title="MacroBrief — Meta Business setup", author="MacroBrief")
s = []
s += [Paragraph("Setting up Meta Business for MacroBrief", H1),
      Paragraph("The Business Portfolio, its verification, and the three assets MacroBrief needs from it: a WhatsApp Business Account, an Instagram professional account, and a developer app. Written for the account owner. 18 September 2026.", SUB)]

s += [Paragraph("What you will end up with", H2),
      Paragraph("Everything at Meta hangs off one <b>Business Portfolio</b> (the thing formerly called Business Manager). The portfolio is the legal entity's home; assets are attached to it and people are given roles on it. MacroBrief needs the portfolio itself to be <b>verified</b>, and three assets inside it:", P),
      table([[cell("<b>Asset</b>"), cell("<b>What it is for</b>"), cell("<b>Where it lives</b>")],
             [cell("WhatsApp Business Account (WABA) + a phone number"), cell("Sending briefs and verification codes on WhatsApp, through Telnyx"), cell("WhatsApp Manager, inside the portfolio")],
             [cell("Instagram professional account (@macrobrief)"), cell("Readers DM it and get their brief back (Max tier)"), cell("Business Settings › Accounts › Instagram accounts")],
             [cell("Meta developer app (\"MacroBrief\")"), cell("The API credentials and permissions the platform uses"), cell("developers.facebook.com, attached to the portfolio")]],
            [2.1*inch, 2.7*inch, 1.6*inch]),
      Spacer(1, 6),
      Paragraph("Order matters: portfolio › security › verification (start it early, it takes days) › assets › app. Verification is the long pole; everything else is an afternoon.", NOTE)]

s += [Paragraph("Before you start", H2),
      bullets(["A <b>personal Facebook account</b> that is real and at least seven days old. Meta ties the portfolio's first admin to a person; use yours, not a throwaway.",
               "<b>Two-factor authentication</b> on that account (Settings › Security). Meta requires it for anyone administering a business portfolio; without it you will be locked out of Business Settings at some point.",
               "<b>The legal entity's documents</b>, exactly as registered: for Sakamoto Labs LLC — Articles of Organization (Florida), the IRS EIN letter, and a utility bill or bank statement showing the business name and the Miami address, dated within the last few months. The name on every document must match the name you type into the portfolio <i>character for character, including \"LLC\"</i> — the most common rejection is a mismatch.",
               "Control of <b>macrobrief.com's DNS</b> (GoDaddy) — Meta verifies domain ownership with a TXT record.",
               "A <b>phone number</b> for WhatsApp that has never been on WhatsApp (see Part 5), and a business email you can read."])]

s += [Paragraph("Part 1 — Create the Business Portfolio", H2),
      steps(["Signed in to your personal Facebook account, open <b>business.facebook.com/overview</b> and click <b>Create account</b> (in some views: <i>Create a business portfolio</i>).",
             "Enter the <b>legal business name</b> exactly as on your documents (e.g. <i>Sakamoto Labs LLC</i>), your name, and the business email. The portfolio's display name can be changed later; the legal name in verification cannot be fudged.",
             "Open the confirmation email and click the link; the portfolio is now active.",
             "Skip the \"add assets\" and \"add people\" prompts for now — assets come in Parts 4–6 after security and verification."])]

s += [Paragraph("Part 2 — Secure it before anything else", H2),
      steps(["<b>Business Settings › Security Center</b>: confirm 2FA shows as required and enabled for the portfolio.",
             "<b>Business Settings › Users › People › Add</b>: add a second person with <b>Admin</b> access (a trusted colleague, or a second account you control). A portfolio with a single admin is one lost phone away from being unrecoverable.",
             "Fill <b>Business Settings › Business info</b>: legal name, address, phone, website (<i>https://macrobrief.com</i>), business email. Verification reads these fields; make them match the documents now."])]

s += [Paragraph("Part 3 — Business Verification (start today)", H2),
      Paragraph("Verification links the portfolio to the legal entity. It lifts WhatsApp's unverified limits (two numbers, a low daily messaging tier) and is a prerequisite for the Instagram messaging permission's Advanced Access. It usually takes a few business days and can take two weeks with manual review.", P),
      steps(["<b>Business Settings › Security Center › Business Verification › Start verification</b>.",
             "Confirm the business details (legal name, address, phone, website). Meta may find the entity in public records and ask you to pick it.",
             "Upload documents. Meta wants proof from two groups: <b>legal registration</b> (articles of organization / incorporation, business licence, government registration certificate, EIN or tax letter) and <b>address or online presence</b> (utility bill, bank statement, lease — dated within the last few months; or the verified domain). Clear, complete scans; no cropped corners.",
             "Confirm a contact method: a code by email to the business domain, by phone, or by the <b>domain verification</b> in Part 4 — the domain route is the least fiddly once the TXT record is in.",
             "Wait. The status shows in Security Center; Meta emails the result. If rejected, the reason is almost always a name or address mismatch — fix the portfolio's business info to match the document, not the other way round, and resubmit."]),
      Paragraph("Do not submit personal documents (passport, personal bank statement) for a business portfolio; that is a rejection and a delay.", WARN)]

s += [Paragraph("Part 4 — Verify the domain", H2),
      steps(["<b>Business Settings › Brand Safety and Suitability › Domains › Add</b>: enter <i>macrobrief.com</i>.",
             "Choose <b>DNS verification</b>. Meta shows a TXT record like <i>facebook-domain-verification=…</i>.",
             "At GoDaddy, add a TXT record with host <b>@</b> and that value (host without the domain suffix — GoDaddy appends it). Keep the existing Google and Resend TXT records.",
             "Back in Meta, click <b>Verify</b>. DNS usually propagates within minutes; if it fails, wait an hour and retry. Once verified, the domain also serves as the verification contact in Part 3 and as link ownership for the app in Part 6."])]

s += [PageBreak(), Paragraph("Part 5 — WhatsApp Business Account and number", H2),
      Paragraph("The WhatsApp Business Account (WABA) is created inside the portfolio and holds the sender number, display name, templates and quality rating. Two ways to create it; use the first.", P),
      Paragraph("Option A — through Telnyx (recommended)", H3),
      steps(["In the Telnyx portal, <b>Messaging › WhatsApp › Connect</b>. A Facebook window opens: sign in with the portfolio's admin account, pick the portfolio from Part 1, and let the embedded flow create the WABA and register the number. See the companion guide <i>MacroBrief — WhatsApp and Instagram setup</i>, Part A3.",
             "When it finishes, the WABA appears in Meta under <b>Business Settings › Accounts › WhatsApp accounts</b>, with Telnyx listed as a partner. Nothing else to do in Meta."]),
      Paragraph("Option B — directly in Meta, then connect a provider", H3),
      steps(["<b>Business Settings › Accounts › WhatsApp accounts › Add › Create a new WhatsApp Business account</b>. Name it <i>MacroBrief</i>, timezone <i>America/Santiago</i> or <i>America/New_York</i>, currency USD.",
             "Open <b>WhatsApp Manager</b> (business.facebook.com/wa/manage) › <b>Phone numbers › Add phone number</b>. Display name <i>MacroBrief</i>, category <i>Media/News</i>, description one line. Verify the number by SMS or voice code.",
             "In <b>Accounts › WhatsApp accounts › Partners</b>, add Telnyx (or the provider) so it can send on the WABA's behalf; the provider's portal then imports the number."]),
      Paragraph("Rules that bite", H3),
      bullets(["The number must not be registered on the WhatsApp or WhatsApp Business <i>app</i> anywhere. If it was, delete the account from that app first and wait for Meta to release it (hours to a couple of days).",
               "Display names are reviewed: it must be the brand, not a generic phrase, and must not mislead. <i>MacroBrief</i> is fine; <i>News Alerts</i> is not.",
               "Messaging limits are tiered by verified status and quality: unverified portfolios start low (on the order of 250 business-initiated conversations per day); verification and a clean quality rating raise it to 1,000, then 10,000 and 100,000. Blocks and reports lower quality. MacroBrief only messages verified opt-ins, which is the main protection.",
               "Message templates can be created in WhatsApp Manager or in the provider's portal; either way Meta approves them (minutes to 48 hours). The template MacroBrief sends is described in the companion guide, Part A4."])]

s += [Paragraph("Part 6 — Instagram", H2),
      steps(["In the Instagram app on the @macrobrief account: <b>Settings › Account type and tools › Switch to professional account › Business</b>. Pick a category (<i>Media/News Company</i>).",
             "Optional but helpful: create a Facebook Page named <i>MacroBrief</i> in the portfolio (<b>Business Settings › Accounts › Pages › Add</b>) and link the Instagram account to it from Instagram's settings. The Instagram-Login API flavour does not need a Page, but Meta's review and verification flows are smoother with one.",
             "Attach the Instagram account to the portfolio: <b>Business Settings › Accounts › Instagram accounts › Add</b>, sign in as @macrobrief, confirm.",
             "In Instagram: <b>Settings › Messages and story replies › Message controls › Connected tools</b>: allow access to messages. Without this, no app can read or answer DMs.",
             "Give the portfolio admin full control of the account in <b>Business Settings › Accounts › Instagram accounts › Assign people</b>."])]

s += [Paragraph("Part 7 — The Meta developer app", H2),
      steps(["<b>developers.facebook.com › My Apps › Create app</b>. Use case <i>Other</i> › type <i>Business</i>. Name <i>MacroBrief</i>, contact email the business email, and <b>attach it to the portfolio</b> (the Business Portfolio dropdown). An app attached to a verified portfolio inherits the verification for App Review.",
             "<b>App settings › Basic</b>: fill <i>Privacy policy URL</i> (<i>https://macrobrief.com/privacy</i>), <i>Terms of service URL</i>, <i>App icon</i> (the isotype from the brandbook), and <i>Category</i>. App Review refuses apps with these blank.",
             "Add products: <b>Instagram</b> › <i>Instagram API with Instagram Login</i> (for DMs). WhatsApp does <i>not</i> need this app — Telnyx holds that integration — so leave the WhatsApp product off unless you later decide to send directly.",
             "<b>App roles › Roles</b>: add yourself as Administrator; add @macrobrief as an <b>Instagram Tester</b> and accept the invitation from the Instagram app. In Development mode the app can act on tester accounts only — enough for MacroBrief to be built and tried.",
             "Note the values MacroBrief needs (Instagram App ID, App Secret from <i>Instagram › Business login settings</i>; a webhook verify token you invent) and hand them over; the companion guide, Part B, lists them.",
             "When the platform side exists and the flow can be shown on video, request <b>App Review</b> for <i>instagram_business_manage_messages</i> (Advanced Access) and switch the app to <b>Live</b>."])]

s += [Paragraph("Part 8 — People, partners and tokens", H2),
      bullets(["<b>Admins</b> can do everything including delete the portfolio; <b>Employees</b> work on assets they are assigned. Give partners and freelancers Employee access on specific assets, never Admin.",
               "<b>Partners</b> (Business Settings › Users › Partners) is where Telnyx appears after Option A. A partner has access only to the assets shared with it; you can revoke it there.",
               "<b>System users</b> (Business Settings › Users › System users) are non-human identities for API tokens. MacroBrief does not need one today — Telnyx uses its partner access for WhatsApp, and the Instagram-Login flow uses the app's own credentials. If a direct WhatsApp integration is ever built, it will need a system user with <i>whatsapp_business_messaging</i>.",
               "Keep the portfolio's <b>notification email</b> monitored: policy notices, verification results and quality-rating changes arrive there."])]

s += [Paragraph("Checklist", H2),
      table([[cell("<b>#</b>"), cell("<b>Step</b>"), cell("<b>Done</b>")],
             [cell("1"), cell("Personal Facebook account at least 7 days old; 2FA on"), cell("[   ]")],
             [cell("2"), cell("Business Portfolio created with the exact legal name; email confirmed"), cell("[   ]")],
             [cell("3"), cell("Second Admin added; Business info filled to match documents"), cell("[   ]")],
             [cell("4"), cell("Business Verification submitted (registration + address documents)"), cell("[   ]")],
             [cell("5"), cell("macrobrief.com verified by DNS TXT"), cell("[   ]")],
             [cell("6"), cell("WABA created via Telnyx embedded signup; number registered; display name approved"), cell("[   ]")],
             [cell("7"), cell("Business Verification approved (messaging limits lifted)"), cell("[   ]")],
             [cell("8"), cell("@macrobrief switched to Business; attached to portfolio; message access allowed"), cell("[   ]")],
             [cell("9"), cell("Developer app created, attached, basic settings filled, Instagram product added, tester invited"), cell("[   ]")],
             [cell("10"), cell("Instagram App ID / Secret / verify token handed to Claude"), cell("[   ]")],
             [cell("11"), cell("App Review for instagram_business_manage_messages; app Live"), cell("[   ]")]],
            [0.3*inch, 5.4*inch, 0.6*inch])]

s += [Spacer(1, 10), Paragraph("Sources: Meta Business Help Center — About Business Verification; Verify your business in Meta Business Suite; Upload official documents to verify your business. Leadsie — How to create a Meta Business Account and Portfolio (2026). Meta for Developers — Instagram API with Instagram Login. Telnyx — Register WhatsApp senders. Flows change often; when a screen differs from this guide, the product's own wizard wins. Companion: <i>MacroBrief — WhatsApp and Instagram setup</i> (same folder).", SMALL)]

doc.build(s, onFirstPage=footer, onLaterPages=footer)
print("wrote", out)
