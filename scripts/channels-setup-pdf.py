from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, KeepTogether, ListFlowable, ListItem
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
CODE = ParagraphStyle("CODE", parent=P, fontName="Courier", fontSize=8.6, leading=11.5, backColor=colors.HexColor("#f4f5f8"), borderPadding=(4, 6, 4, 6), leftIndent=6, rightIndent=6, spaceBefore=2, spaceAfter=8)
NOTE = ParagraphStyle("NOTE", parent=P, backColor=WASH, borderPadding=(6, 8, 6, 8), leftIndent=4, rightIndent=4, spaceBefore=4, spaceAfter=10)

def steps(items):
    return ListFlowable([ListItem(Paragraph(t, P), leftIndent=14) for t in items], bulletType="1", bulletFontName="Helvetica-Bold", bulletFontSize=9.5, leftIndent=16, bulletColor=SIGNAL)

def bullets(items):
    return ListFlowable([ListItem(Paragraph(t, P), leftIndent=12) for t in items], bulletType="bullet", start="•", leftIndent=14, bulletColor=INK)

def table(rows, widths):
    t = Table(rows, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("FONTSIZE", (0,0), (-1,-1), 8.8), ("LEADING", (0,0), (-1,-1), 11.5),
        ("TEXTCOLOR", (0,0), (-1,0), DIM), ("LINEBELOW", (0,0), (-1,0), 0.8, INK), ("LINEBELOW", (0,1), (-1,-1), 0.4, RULE),
        ("VALIGN", (0,0), (-1,-1), "TOP"), ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4), ("LEFTPADDING", (0,0), (-1,-1), 2),
    ]))
    return t

def cell(t): return Paragraph(t, ParagraphStyle("c", parent=P, fontSize=8.8, leading=11.5, spaceAfter=0))

def footer(canvas, doc):
    canvas.saveState(); canvas.setFont("Helvetica", 8); canvas.setFillColor(DIM)
    canvas.drawString(0.9*inch, 0.55*inch, "MacroBrief — WhatsApp and Instagram setup · 18 Sep 2026")
    canvas.drawRightString(letter[0]-0.9*inch, 0.55*inch, f"Page {doc.page}")
    canvas.restoreState()

doc = SimpleDocTemplate(out, pagesize=letter, leftMargin=0.9*inch, rightMargin=0.9*inch, topMargin=0.8*inch, bottomMargin=0.9*inch, title="MacroBrief — WhatsApp and Instagram setup", author="MacroBrief")
s = []

s += [Paragraph("MacroBrief — turning on WhatsApp and Instagram", H1),
      Paragraph("What to set up at Twilio and Meta, what to hand to the platform, and what happens after. Written for whoever holds the Twilio and Meta accounts. 18 September 2026.", SUB)]

s += [Paragraph("Where things stand", H2),
      table([[cell("<b>Channel</b>"), cell("<b>Code</b>"), cell("<b>What is missing</b>"), cell("<b>Plan</b>")],
             [cell("WhatsApp"), cell("Built and deployed (Telnyx, or Twilio)"), cell("A Telnyx API key, a WhatsApp-enabled Telnyx number, an approved message template"), cell("Pro, Max")],
             [cell("Instagram"), cell("<b>Not built</b> — deliveries are recorded as skipped"), cell("A Meta app with messaging permission, plus the webhook/sender code on our side"), cell("Max")]],
            [1.0*inch, 1.7*inch, 2.8*inch, 0.9*inch]),
      Spacer(1, 8),
      Paragraph("Both channels are governed by one Meta rule that shapes everything below: <b>a business may message a person freely only inside 24 hours of that person's last message</b>. Outside that window, WhatsApp allows only pre-approved templates, and Instagram allows nothing at all. So WhatsApp briefs go out as a template, and Instagram can only ever be “DM the bot, it replies with your brief”.", NOTE)]

# ---------------- WhatsApp ----------------
s += [Paragraph("Part A — WhatsApp (via Telnyx)", H2),
      Paragraph("How it works once live: on the reader's schedule the platform sends a short digest — bold title, intro, headlines per topic, one link to the full brief — to the reader's verified number. Readers add their number under Settings › Channels, receive a six-digit code on WhatsApp, and verify it. Nothing is sent to an unverified number. Telnyx is the provider the code prefers; Twilio remains available (Appendix) and the switch is one environment variable.", P)]

s += [Paragraph("A1. Telnyx account and API key", H3),
      steps(["Sign in at <b>portal.telnyx.com</b> (create the account under Sakamoto Labs if there isn't one; Telnyx asks for a business profile and identity verification before messaging is enabled).",
             "Portal › <b>Account › Keys &amp; Credentials › API Keys › Create API key</b>. Copy it once — Telnyx shows it only at creation. This is <i>macrobrief-telnyx-key</i>.",
             "Add a little prepaid balance (Billing). Telnyx is pay-as-you-go; the WhatsApp onboarding steps below do not run on an empty balance."])]

s += [Paragraph("A2. The phone number", H3),
      steps(["Portal › <b>Numbers › Buy Numbers</b>: a US local number is the simplest (SMS-capable, a dollar or two a month). Chilean numbers can be used too if you already own one at Telnyx, but Meta must be able to reach it with an SMS or voice code.",
             "The number must not already be registered on WhatsApp — the app or any other provider. If it was, delete the WhatsApp account from that number first and wait for Meta to release it.",
             "This number is <i>macrobrief-telnyx-whatsapp-from</i>, in E.164 (<i>+1…</i>)."])]

s += [Paragraph("A3. Register the WhatsApp sender (embedded signup)", H3),
      Paragraph("Telnyx runs Meta's onboarding inside the portal, so the Facebook and Meta Business steps happen in one flow.", P),
      steps(["Portal › <b>Messaging › WhatsApp</b> › <b>Connect</b> (or <i>Get started</i>). A Facebook login window opens: sign in with the account that administers the Sakamoto Labs / MacroBrief <b>Meta Business Portfolio</b>, or create the portfolio there.",
             "Create the <b>WhatsApp Business Account</b> (WABA) inside the portfolio, give the sender its display name (<i>MacroBrief</i> — Meta reviews it; keep it identical to the brand) and select the Telnyx number from A2.",
             "Verify the number with the SMS or voice code Meta sends. When the flow finishes, the number shows as a WhatsApp-enabled sender in the Telnyx portal.",
             "Complete <b>Meta Business Verification</b> (Meta Business Suite › Settings › Security Centre): company registration, address, and usually a utility bill or bank statement. Until verified, Meta caps the portfolio at two numbers and a low daily messaging tier; plan on two to seven business days.",
             "Optional but recommended: request the <b>official business account</b> badge later; it is not needed to send."])]

s += [Paragraph("A4. The message template (required to reach readers on a schedule)", H3),
      Paragraph("A scheduled brief arrives outside any 24-hour window, so it must be an approved template. The platform sends one template with three body variables: {{1}} the brief title, {{2}} the digest body, {{3}} the link to the full brief. On Telnyx a template is referenced by its Meta <b>name and language</b>, not an ID.", P),
      steps(["Portal › <b>Messaging › WhatsApp › Message Templates › Create template</b>. Name <b>macrobrief_daily</b> (lowercase, underscores — this exact string is what the platform sends), language <b>English (US)</b>, category <b>Utility</b> (a message the reader subscribed to; not marketing).",
             "Body — paste exactly:"]),
      Paragraph("*{{1}}*<br/><br/>{{2}}<br/><br/>Full brief: {{3}}", CODE),
      steps(["Fill the required sample values, e.g. {{1}} <i>MacroBrief — Thu 18 Sep</i>, {{2}} <i>*Chilean lithium* • Codelco weighs job cuts (Reuters)</i>, {{3}} <i>https://macrobrief.com/app/briefs/abc</i>. Submit. Meta approves most templates within minutes; allow up to 24–48 hours. Rejections are almost always malformed placeholders or a body so generic it could carry anything.",
             "When it shows <i>Approved</i>, the template name is <i>macrobrief-telnyx-wa-template</i> (value: <i>macrobrief_daily</i>). The language code defaults to <i>en</i>; a Spanish twin named the same with language <i>es</i> can be added later and switched per reader."]),
      Paragraph("The verification code readers receive is sent through the same template (title “MacroBrief code”, body with the six digits), so one approved template covers both messages.", SMALL)]

s += [Paragraph("A5. Hand the three values to the platform", H3),
      Paragraph("Put them in <i>repos/macrobrief/.env</i> for Eduardo's local runs and in Secret Manager for production. Each secret already exists as an empty container; adding a version fills it. Then one deploy picks them up.", P),
      Paragraph("printf '&lt;KEY…&gt;' | gcloud secrets versions add macrobrief-telnyx-key --data-file=- --project=macrobrief1<br/>"
                "printf '+1XXXXXXXXXX' | gcloud secrets versions add macrobrief-telnyx-whatsapp-from --data-file=- --project=macrobrief1<br/>"
                "printf 'macrobrief_daily' | gcloud secrets versions add macrobrief-telnyx-wa-template --data-file=- --project=macrobrief1<br/>"
                "cd repos/macrobrief &amp;&amp; ./deploy.sh", CODE),
      Paragraph("Or add TELNYX_API_KEY, TELNYX_WHATSAPP_FROM and TELNYX_WA_TEMPLATE to <i>.env</i> and ask Claude to push and deploy — the values are never printed. The code picks Telnyx automatically when its key is present.", SMALL)]

s += [Paragraph("A6. Try it end to end", H3),
      steps(["Before the template is approved you can still test inside a 24-hour window: send any WhatsApp message from your phone to the sender number, then do the next step within 24 hours — the platform sends free-form text when no template is configured.",
             "Sign in to macrobrief.com › <b>Settings › Channels › WhatsApp</b>. Enter your number with the country code (<i>+56 9 …</i>), tick <i>on</i>, Save. A six-digit code arrives on WhatsApp; enter it in the Verify box that appears.",
             "As staff, <b>Briefs › Brief me now</b>. The brief's line should read <i>whatsapp sent</i>. Readers get theirs on their schedule.",
             "If it reads <i>whatsapp failed — telnyx …</i>, the detail names the cause: an unapproved or misnamed template, a sender not yet WhatsApp-enabled, or a recipient outside the window with no template configured."])]

s += [Paragraph("A7. Costs and rules to keep in mind", H3),
      bullets(["Meta bills per template message by category and country — the same through any provider. Utility messages are the cheap category: as of April 2026 roughly $0.001 (Colombia) to $0.055 (Germany), with the US and Chile in the low cents. The provider adds its own small markup on top; Telnyx publishes its messaging markup in the portal's pricing pages rather than on the public site, so read it there before setting plan limits. A daily digest to one reader is on the order of a dollar or two a month.",
               "Readers can reply <i>STOP</i> at any time; Meta enforces opt-out. Keep the Settings toggle the source of truth and switch the channel off for anyone who opts out.",
               "Quality rating: too many blocks or reports lowers the sender's messaging tier. Only verified numbers ever receive a brief, which is the main protection."])]

s += [Paragraph("Appendix — using Twilio instead", H3),
      Paragraph("The same code sends through Twilio when its credentials are present and Telnyx's are not (or when WHATSAPP_PROVIDER=twilio). Differences: the sender is written <i>whatsapp:+1…</i>; the template is built in Console › Messaging › Content Template Builder and referenced by its <b>Content SID</b> (<i>HX…</i>); and the Twilio <b>Sandbox</b> (<i>+1 415 523 8886</i>, join code) gives a same-day test with your own phone. Secrets: <i>macrobrief-twilio-sid</i>, <i>-token</i>, <i>-whatsapp-from</i>, <i>-wa-template</i>.", P)]

s += [PageBreak()]

# ---------------- Instagram ----------------
s += [Paragraph("Part B — Instagram (via Meta's Instagram Messaging API)", H2),
      Paragraph("What it can be: a reader sends a DM to the MacroBrief Instagram account (any message — “brief”, “hi”); within 24 hours the platform replies with their latest brief. It cannot push a brief unprompted, so it suits readers who already live in Instagram and want to pull. Max tier only. <b>The platform side is not built yet</b> — it needs a webhook to receive DMs and a sender to reply — and it cannot be built or tested without the Meta app below, so the account work comes first.", P)]

s += [Paragraph("B1. The Instagram account", H3),
      steps(["Create (or convert) the <b>@macrobrief</b> account as a <b>Professional</b> account — Business type. Instagram › Settings › Account type and tools › Switch to professional account.",
             "In Instagram › Settings › Messages and story replies › Message controls, allow message access for connected tools (the setting Meta calls <i>Connected tools</i> / <i>Allow access to messages</i>).",
             "A Facebook Page is no longer required for the Instagram-Login flavour of the API; connecting one does not hurt and helps business verification."])]

s += [Paragraph("B2. The Meta app", H3),
      steps(["Go to <b>developers.facebook.com › My Apps › Create app</b>. Use case: <i>Other</i> › type <i>Business</i>. Name it <i>MacroBrief</i>; attach it to the same Business Portfolio as WhatsApp.",
             "In the app dashboard add the product <b>Instagram</b> › set up <b>Instagram API with Instagram Login</b>.",
             "Under <i>Business login settings</i> note the <b>Instagram App ID</b> and <b>Instagram App Secret</b>. Add the redirect URI <i>https://macrobrief.com/api/instagram/callback</i> (the route the platform will expose).",
             "Under <i>Webhooks</i> you will later enter a callback URL (<i>https://macrobrief.com/api/instagram/webhook</i>) and a verify token; subscribe to the <b>messages</b> field. Leave this until the code exists — Meta pings the URL during setup and it must answer.",
             "Add the @macrobrief account as an <b>Instagram Tester</b> (App roles) and accept the invitation from the Instagram app. With the app in Development mode this is enough to test with that account."])]

s += [Paragraph("B3. Permissions and App Review", H3),
      Paragraph("Replying to DMs needs the permission <b>instagram_business_manage_messages</b> (plus <i>instagram_business_basic</i>). In Development mode it works only for accounts with a role on the app — enough for testing. To serve real readers the app needs <b>Advanced Access</b>, which Meta grants through App Review.", P),
      steps(["Complete <b>Business Verification</b> for the portfolio if not already done for WhatsApp — it is the same verification.",
             "App Review › request <i>instagram_business_manage_messages</i>. Meta asks for: a description of the use case (“a reader DMs the account and receives the news brief they subscribed to”), a <b>screencast</b> showing the full flow on a real account (DM sent › reply received), a privacy policy URL on macrobrief.com, and the app's data-handling answers.",
             "Reviews take a few days to a few weeks and are commonly sent back for a clearer screencast; record it once the platform side exists so the flow is real.",
             "When granted, switch the app to <b>Live</b> mode."])]

s += [Paragraph("B4. What to hand over, and what gets built", H3),
      Paragraph("Once the app exists (even in Development mode) send these three values and the code can be written and tested against your own account before App Review:", P),
      table([[cell("<b>Value</b>"), cell("<b>Where</b>"), cell("<b>Becomes</b>")],
             [cell("Instagram App ID"), cell("App dashboard › Instagram › Business login settings"), cell("macrobrief-instagram-app-id")],
             [cell("Instagram App Secret"), cell("Same page (Show)"), cell("macrobrief-instagram-app-secret")],
             [cell("Webhook verify token"), cell("Any long random string you choose; entered in Webhooks setup"), cell("macrobrief-instagram-verify-token")]],
            [1.5*inch, 3.0*inch, 1.9*inch]),
      Spacer(1, 6),
      Paragraph("Platform work that follows: the OAuth callback that links @macrobrief to the app and stores its access token; the webhook that receives DMs and maps the sender to a reader (readers enter their handle under Settings and confirm it by DMing a code); the reply that sends the latest brief as a text message within the window; and the audit row per reply, like every other channel.", P)]

s += [Paragraph("B5. Rules that shape the experience", H3),
      bullets(["Reply only within <b>24 hours</b> of the reader's last DM. No scheduled pushes; the brief is fetched by messaging the account.",
               "Messages are plain text (with links) — one or a few per reply. Instagram rate limits are per account and generous for this volume.",
               "A reader who has never DM'd the account cannot be reached at all; the Settings page will say so."])]

s += [Paragraph("Checklist", H2),
      table([[cell("<b>#</b>"), cell("<b>Step</b>"), cell("<b>Owner</b>"), cell("<b>Done</b>")],
             [cell("1"), cell("Telnyx API key created; balance added"), cell("You"), cell("[   ]")],
             [cell("2"), cell("WhatsApp-capable number bought (or chosen) at Telnyx"), cell("You"), cell("[   ]")],
             [cell("3"), cell("WhatsApp sender registered via embedded signup; Meta Business Verification submitted"), cell("You"), cell("[   ]")],
             [cell("4"), cell("Template <i>macrobrief_daily</i> (Utility, en) approved"), cell("You"), cell("[   ]")],
             [cell("5"), cell("Three Telnyx secrets filled; <i>./deploy.sh</i>"), cell("You / Claude"), cell("[   ]")],
             [cell("6"), cell("Own number verified in Settings; Brief me now shows <i>whatsapp sent</i>"), cell("You"), cell("[   ]")],
             [cell("7"), cell("@macrobrief professional account; message access enabled"), cell("You"), cell("[   ]")],
             [cell("8"), cell("Meta app with Instagram product; App ID / Secret / verify token handed over"), cell("You"), cell("[   ]")],
             [cell("9"), cell("Instagram webhook + reply built and tested in Development mode"), cell("Claude"), cell("[   ]")],
             [cell("10"), cell("App Review for <i>instagram_business_manage_messages</i>; app set Live"), cell("You"), cell("[   ]")]],
            [0.3*inch, 4.4*inch, 1.0*inch, 0.6*inch])]

s += [Spacer(1, 10), Paragraph("Sources: Telnyx — Send WhatsApp Messages (developers.telnyx.com); WhatsApp Business API developer guide and cost guide (telnyx.com/resources); WhatsApp message templates guide (support.telnyx.com). Twilio — Register WhatsApp senders using Self Sign-up; Content Template Builder. Meta — Instagram API with Instagram Login: Send Messages. Current as of 18 September 2026; both vendors change these flows often, so if a screen does not match, the Console's own wizard wins.", SMALL)]

doc.build(s, onFirstPage=footer, onLaterPages=footer)
print("wrote", out)
