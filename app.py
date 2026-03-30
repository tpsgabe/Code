import os
import json
from flask import Flask, render_template, request, jsonify, Response, stream_with_context
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))

SYSTEM_PROMPT = """You are an expert private equity analyst assistant for Maverix Private Equity,
a Toronto-based growth equity firm focused on technology investments. You help analysts source and
evaluate investment opportunities efficiently. Your analysis is concise, data-driven, and actionable.
Always structure your responses with clear headings and bullet points for easy scanning.
Focus on: business model clarity, growth signals, market positioning, and red flags."""

model = genai.GenerativeModel(
    model_name="gemini-1.5-flash",
    system_instruction=SYSTEM_PROMPT,
)


def stream_gemini(prompt: str) -> Response:
    """Stream a Gemini response as Server-Sent Events."""
    def generate():
        try:
            response = model.generate_content(prompt, stream=True)
            for chunk in response:
                try:
                    text = chunk.text
                    if text:
                        yield f"data: {json.dumps({'text': text})}\n\n"
                except Exception:
                    pass
        except Exception as e:
            yield f"data: {json.dumps({'text': f'**Error:** {str(e)}'})}\n\n"
        yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/summarize-company", methods=["POST"])
def summarize_company():
    data = request.get_json()
    company_info = data.get("company_info", "").strip()
    if not company_info:
        return jsonify({"error": "No company information provided"}), 400

    prompt = f"""Analyze this company profile and provide a structured investment summary for a PE analyst:

{company_info}

Structure your response as follows:
## Company Overview
## Business Model
## Funding History & Valuation
## Growth Signals
## Market Position & Competitive Landscape
## Key Risks / Red Flags
## Investment Thesis (1-2 sentences)
"""
    return stream_gemini(prompt)


@app.route("/api/emerging-industries", methods=["POST"])
def emerging_industries():
    data = request.get_json()
    sectors = data.get("sectors", "").strip()
    timeframe = data.get("timeframe", "Q1 2026")

    focus = f"Focus on these sectors: {sectors}." if sectors else "Cover all technology sectors."

    prompt = f"""As of {timeframe}, identify emerging industries and sectors showing strong investment momentum relevant to a Toronto-based growth equity technology investor.

{focus}

Structure your response as follows:
## Top Emerging Sectors (ranked by momentum)
For each sector include:
- **Why it's trending**: key drivers
- **Recent notable deals**: illustrative examples
- **Valuation dynamics**: multiples, trends
- **Toronto/Canadian angle**: local opportunity or market context
- **Recommended focus areas**: specific sub-segments to prioritize

## Sectors to Watch (early stage, not yet peak)

## Sectors to Avoid or Deprioritize

## Actionable Recommendations for Maverix
"""
    return stream_gemini(prompt)


@app.route("/api/ma-tracker", methods=["POST"])
def ma_tracker():
    data = request.get_json()
    timeframe = data.get("timeframe", "last 30 days")
    subsectors = data.get("subsectors", "").strip()

    focus = f"Focus specifically on: {subsectors}." if subsectors else ""

    prompt = f"""Provide a comprehensive M&A activity summary for the Toronto-based growth equity technology sector over the {timeframe}. {focus}

Structure your response as follows:
## M&A Activity Summary
Brief overview of deal volume and sentiment.

## Notable Deals (Toronto & Canadian Tech Focus)
For each deal:
- **Target**: company name, description
- **Acquirer**: name, strategic rationale
- **Deal Value**: estimated or disclosed
- **Multiple**: EV/Revenue or EV/EBITDA if available
- **Implications for Maverix**: what this signals

## Valuation Trends
Current market multiples for growth equity tech in Canada/Toronto.

## Competitor Activity
Which PE/growth equity firms are most active and in what spaces.

## Strategic Implications for Maverix
- Sectors heating up (act fast)
- Sectors cooling (wait or avoid)
- Specific opportunities this activity surfaces

## Deal Sourcing Leads
Based on this M&A activity, suggest 3-5 types of companies Maverix should be actively sourcing right now.
"""
    return stream_gemini(prompt)


@app.route("/api/morning-digest", methods=["POST"])
def morning_digest():
    data = request.get_json()
    date = data.get("date", "today")

    prompt = f"""Generate a concise daily morning digest for the Maverix Private Equity deal sourcing team for {date}.

This digest should be scannable in under 5 minutes and cover everything an analyst needs to start their day.

Structure as follows:

# 🌅 Maverix Morning Digest — {date}

## Market Pulse (2-min read)
Key overnight/morning market signals relevant to growth equity tech investing (TSX tech, NASDAQ, relevant indices, CAD/USD).

## 🔥 Hot Sectors Today
Top 3 sectors showing momentum right now with one-line rationale each.

## 📊 M&A & Deal Flow (Yesterday/This Week)
3-5 most relevant deals or rumors in Toronto/Canadian tech growth equity space.

## 💡 Company Spotlight
One emerging company worth researching today — brief profile and why it's interesting for Maverix.

## 📰 Must-Read News
Top 3-4 headlines most relevant to PE deal sourcing in Canadian tech (with brief impact notes).

## 🎯 Today's Sourcing Priorities
3 actionable items for the deal sourcing team today.

## 📅 Week Ahead
Key events, earnings, or announcements to watch this week that affect deal sourcing.

---
*Generated by Maverix AI Deal Sourcing Assistant*
"""
    return stream_gemini(prompt)


@app.route("/api/quick-screen", methods=["POST"])
def quick_screen():
    data = request.get_json()
    company_name = data.get("company_name", "").strip()
    description = data.get("description", "").strip()

    if not company_name:
        return jsonify({"error": "Company name required"}), 400

    prompt = f"""Perform a rapid investment screening for this company:

**Company:** {company_name}
**Description:** {description if description else "No description provided — use your knowledge if available."}

Provide a 60-second screening assessment:

## ⚡ Quick Screen: {company_name}

**Pass / Pass with Concerns / Fail**

### Why (2-3 bullet points max)

### Maverix Fit Score: X/10
(Based on: Toronto/Canada nexus, growth equity stage, technology focus, team quality signals)

### Key Questions to Answer Before Proceeding
(Top 3 diligence questions)

### Comparable Companies / Transactions
(2-3 relevant comps)

### Recommended Next Step
(One sentence action)
"""
    return stream_gemini(prompt)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
