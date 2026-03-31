import os
import json
import sqlite3
from datetime import datetime
from functools import wraps
from flask import (Flask, render_template, request, jsonify, Response,
                   stream_with_context, session, redirect, url_for)
from werkzeug.security import generate_password_hash, check_password_hash
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'maverix-pe-dev-secret-2026')

genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))

SYSTEM_PROMPT = """You are an expert private equity analyst assistant for Maverix Private Equity,
a Toronto-based growth equity firm focused on technology investments. You help analysts source and
evaluate investment opportunities efficiently. Your analysis is concise, data-driven, and actionable.
Always structure your responses with clear headings and bullet points for easy scanning.
Focus on: business model clarity, growth signals, market positioning, and red flags."""

model = genai.GenerativeModel(
    model_name="gemini-2.5-flash",
    system_instruction=SYSTEM_PROMPT,
)

# ── Database ────────────────────────────────────────────────

DB = os.path.join(os.path.dirname(__file__), 'maverix.db')

def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()

    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT    UNIQUE NOT NULL,
        name          TEXT    NOT NULL,
        role          TEXT    NOT NULL,
        initials      TEXT    NOT NULL,
        password_hash TEXT    NOT NULL
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS deals (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        company       TEXT    NOT NULL,
        sector        TEXT    NOT NULL,
        target_amount TEXT,
        round_type    TEXT,
        stage         TEXT    NOT NULL DEFAULT 'sourcing',
        outcome       TEXT,
        notes         TEXT,
        owner         TEXT,
        created_at    TEXT    DEFAULT (datetime('now')),
        updated_at    TEXT    DEFAULT (datetime('now'))
    )''')

    # Seed users
    seed_users = [
        ('jruffolo', 'John Ruffolo',  'Managing Partner', 'JR', 'password123'),
        ('sandrews',  'Sarah Andrews', 'Associate',        'SA', 'password123'),
        ('mkim',      'Mike Kim',      'Analyst',          'MK', 'password123'),
        ('grussell',  'Greg Russell',  'Vice President',   'GR', 'password123'),
    ]
    for u in seed_users:
        try:
            c.execute('''INSERT INTO users (username, name, role, initials, password_hash)
                         VALUES (?, ?, ?, ?, ?)''',
                      (u[0], u[1], u[2], u[3], generate_password_hash(u[4])))
        except sqlite3.IntegrityError:
            pass

    # Seed deals (only once)
    c.execute('SELECT COUNT(*) FROM deals')
    if c.fetchone()[0] == 0:
        seed_deals = [
            ('Northstar Compliance',  'RegTech',            '$18–25M', 'Series A', 'sourcing',   None,       'Inbound referral via CVCA',         'SA'),
            ('Luminary Robotics',     'Industrial AI',      '$30–40M', 'Series B', 'sourcing',   None,       'Warm intro from BDC Capital',        'GR'),
            ('TrueData Inc.',         'Data Infrastructure','$50M',    'Growth',   'sourcing',   None,       'Proprietary sourcing',               'MK'),
            ('Stealth Fintech Co.',   'B2B Payments',       '$20–30M', 'Series A', 'sourcing',   None,       'Founder call scheduled Apr 2',       'JR'),
            ('GreenTrace Analytics',  'CleanTech / ESG',    '$15M',    'Series A', 'sourcing',   None,       'MaRS referral',                      'SA'),
            ('PayLink Solutions',     'Fintech',            '$28M',    'Series A', 'screening',  None,       'IC Apr 8',                           'GR'),
            ('Axiom Security',        'Cybersecurity',      '$35M',    'Series B', 'screening',  None,       'Mgmt call Apr 5',                    'MK'),
            ('SupplyBridge AI',       'Supply Chain',       '$22M',    'Series A', 'screening',  None,       'Financial model in review',          'SA'),
            ('HRFlow Technologies',   'HR Tech',            '$18M',    'Series A', 'screening',  None,       'Initial screen complete',            'JR'),
            ('MedRecord AI',          'HealthTech',         '$62M',    'Series B', 'diligence',  None,       'IC Mar 31 — Priority',               'JR'),
            ('FleetEdge Systems',     'Fleet / IoT',        '$40M',    'Series B', 'diligence',  None,       'Legal review in progress',           'MK'),
            ('Quiltt Financial',      'Open Banking',       '$30M',    'Series A', 'diligence',  None,       'Tech DD underway',                   'GR'),
            ('Vantage AI',            'AI / Analytics',     '$25M',    'Growth',   'closed',     'invested', 'Fund III · Closed Feb 2026',         'JR'),
            ('Blockform Inc.',        'Web3 / Infra',       '$50M',    'Series B', 'closed',     'passed',   'Valuation concern — 18x revenue',   'GR'),
        ]
        c.executemany('''INSERT INTO deals
            (company, sector, target_amount, round_type, stage, outcome, notes, owner)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)''', seed_deals)

    conn.commit()
    conn.close()

# ── Auth helpers ────────────────────────────────────────────

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            if request.is_json:
                return jsonify({'error': 'Not authenticated'}), 401
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated

# ── Auth routes ─────────────────────────────────────────────

@app.route('/login', methods=['GET', 'POST'])
def login():
    if 'user_id' in session:
        return redirect(url_for('index'))
    error = None
    if request.method == 'POST':
        username = request.form.get('username', '').strip().lower()
        password = request.form.get('password', '')
        conn = get_db()
        user = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
        conn.close()
        if user and check_password_hash(user['password_hash'], password):
            session['user_id']   = user['id']
            session['user_name'] = user['name']
            session['user_role'] = user['role']
            session['user_init'] = user['initials']
            return redirect(url_for('index'))
        error = 'Invalid username or password.'
    return render_template('login.html', error=error)

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

# ── Main app ─────────────────────────────────────────────────

@app.route('/')
@login_required
def index():
    return render_template('index.html',
                           user_name=session['user_name'],
                           user_role=session['user_role'],
                           user_init=session['user_init'])

# ── Deals API ────────────────────────────────────────────────

@app.route('/api/deals', methods=['GET'])
@login_required
def get_deals():
    conn = get_db()
    deals = conn.execute('SELECT * FROM deals ORDER BY created_at DESC').fetchall()
    conn.close()
    return jsonify([dict(d) for d in deals])

@app.route('/api/deals', methods=['POST'])
@login_required
def create_deal():
    data = request.get_json()
    required = ('company', 'sector', 'stage')
    if not all(data.get(f) for f in required):
        return jsonify({'error': 'company, sector and stage are required'}), 400
    conn = get_db()
    cur = conn.execute('''INSERT INTO deals
        (company, sector, target_amount, round_type, stage, outcome, notes, owner)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)''', (
        data['company'], data['sector'],
        data.get('target_amount', ''), data.get('round_type', ''),
        data['stage'], data.get('outcome'),
        data.get('notes', ''), data.get('owner', session.get('user_init', '')),
    ))
    conn.commit()
    deal = conn.execute('SELECT * FROM deals WHERE id = ?', (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(dict(deal)), 201

@app.route('/api/deals/<int:deal_id>', methods=['PUT'])
@login_required
def update_deal(deal_id):
    data = request.get_json()
    fields = ['company', 'sector', 'target_amount', 'round_type',
              'stage', 'outcome', 'notes', 'owner']
    updates = {k: data[k] for k in fields if k in data}
    if not updates:
        return jsonify({'error': 'Nothing to update'}), 400
    updates['updated_at'] = datetime.now().isoformat()
    set_clause = ', '.join(f'{k} = ?' for k in updates)
    values = list(updates.values()) + [deal_id]
    conn = get_db()
    conn.execute(f'UPDATE deals SET {set_clause} WHERE id = ?', values)
    conn.commit()
    deal = conn.execute('SELECT * FROM deals WHERE id = ?', (deal_id,)).fetchone()
    conn.close()
    if not deal:
        return jsonify({'error': 'Deal not found'}), 404
    return jsonify(dict(deal))

@app.route('/api/deals/<int:deal_id>', methods=['DELETE'])
@login_required
def delete_deal(deal_id):
    conn = get_db()
    conn.execute('DELETE FROM deals WHERE id = ?', (deal_id,))
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

@app.route('/api/stats', methods=['GET'])
@login_required
def get_stats():
    conn = get_db()
    rows = conn.execute('''SELECT stage, outcome, COUNT(*) as cnt
                           FROM deals GROUP BY stage, outcome''').fetchall()
    conn.close()
    counts = {'sourcing': 0, 'screening': 0, 'diligence': 0,
              'closed_invested': 0, 'closed_passed': 0}
    for r in rows:
        if r['stage'] == 'closed':
            k = f"closed_{r['outcome']}" if r['outcome'] else 'closed_passed'
            counts[k] = counts.get(k, 0) + r['cnt']
        else:
            counts[r['stage']] = counts.get(r['stage'], 0) + r['cnt']
    counts['active'] = counts['sourcing'] + counts['screening'] + counts['diligence']
    return jsonify(counts)

@app.route('/api/users', methods=['GET'])
@login_required
def get_users():
    conn = get_db()
    users = conn.execute('SELECT id, username, name, role, initials FROM users').fetchall()
    conn.close()
    return jsonify([dict(u) for u in users])

# ── AI streaming ─────────────────────────────────────────────

def stream_gemini(prompt: str) -> Response:
    def generate():
        try:
            resp = model.generate_content(prompt, stream=True)
            for chunk in resp:
                try:
                    if chunk.text:
                        yield f"data: {json.dumps({'text': chunk.text})}\n\n"
                except Exception:
                    pass
        except Exception as e:
            yield f"data: {json.dumps({'text': f'**Error:** {str(e)}'})}\n\n"
        yield "data: [DONE]\n\n"
    return Response(stream_with_context(generate()), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

def get_pipeline_context():
    """Inject live pipeline data into AI prompts."""
    conn = get_db()
    deals = conn.execute(
        "SELECT company, sector, target_amount, round_type, stage, notes FROM deals WHERE stage != 'closed'"
    ).fetchall()
    conn.close()
    if not deals:
        return ""
    lines = ["Current Maverix Deal Pipeline (for context):"]
    for d in deals:
        lines.append(f"  - {d['company']} ({d['sector']}, {d['round_type'] or 'TBD'}, "
                     f"{d['target_amount'] or 'TBD'}) — Stage: {d['stage'].capitalize()}")
    return "\n" + "\n".join(lines) + "\n"

@app.route('/api/summarize-company', methods=['POST'])
@login_required
def summarize_company():
    data = request.get_json()
    company_info = data.get('company_info', '').strip()
    if not company_info:
        return jsonify({'error': 'No company information provided'}), 400
    prompt = f"""Analyze this company profile and provide a structured investment summary:

{company_info}

## Company Overview
## Business Model
## Funding History & Valuation
## Growth Signals
## Market Position & Competitive Landscape
## Key Risks / Red Flags
## Investment Thesis (1-2 sentences)
"""
    return stream_gemini(prompt)

@app.route('/api/emerging-industries', methods=['POST'])
@login_required
def emerging_industries():
    data = request.get_json()
    sectors = data.get('sectors', '').strip()
    timeframe = data.get('timeframe', 'Q1 2026')
    focus = f"Focus on: {sectors}." if sectors else "Cover all technology sectors."
    prompt = f"""As of {timeframe}, identify emerging industries showing strong investment momentum for a Toronto-based growth equity technology investor.

{focus}

## Top Emerging Sectors (ranked by momentum)
For each: Why trending · Recent notable deals · Valuation dynamics · Toronto/Canadian angle · Recommended sub-segments

## Sectors to Watch (early stage)

## Sectors to Avoid

## Actionable Recommendations for Maverix
"""
    return stream_gemini(prompt)

@app.route('/api/ma-tracker', methods=['POST'])
@login_required
def ma_tracker():
    data = request.get_json()
    timeframe = data.get('timeframe', 'last 30 days')
    subsectors = data.get('subsectors', '').strip()
    focus = f"Focus specifically on: {subsectors}." if subsectors else ""
    prompt = f"""Provide a comprehensive M&A activity summary for Toronto-based growth equity tech over the {timeframe}. {focus}

## M&A Activity Summary
## Notable Deals (Toronto & Canadian Tech Focus)
(Target · Acquirer · Deal Value · Multiple · Implications for Maverix)
## Valuation Trends
## Competitor Activity
## Strategic Implications for Maverix
## Deal Sourcing Leads (3-5 company types to source now)
"""
    return stream_gemini(prompt)

@app.route('/api/morning-digest', methods=['POST'])
@login_required
def morning_digest():
    data = request.get_json()
    date = data.get('date', 'today')
    pipeline_ctx = get_pipeline_context()
    prompt = f"""Generate a concise daily morning digest for the Maverix PE deal sourcing team for {date}.
{pipeline_ctx}
# 🌅 Maverix Morning Digest — {date}

## Market Pulse
Key signals: TSX tech, NASDAQ, CAD/USD, sentiment.

## 🔥 Hot Sectors Today
Top 3 with one-line rationale each.

## 📊 M&A & Deal Flow
3-5 most relevant deals or rumors in Toronto/Canadian tech.

## 💡 Company Spotlight
One emerging company worth researching today.

## 📰 Must-Read News
Top 3-4 headlines relevant to PE deal sourcing in Canadian tech.

## 🎯 Today's Sourcing Priorities
3 actionable items for the team, referencing active pipeline where relevant.

## 📅 Week Ahead
Key events, earnings, or announcements to watch.

---
*Maverix AI Intelligence Platform*
"""
    return stream_gemini(prompt)

@app.route('/api/quick-screen', methods=['POST'])
@login_required
def quick_screen():
    data = request.get_json()
    company_name = data.get('company_name', '').strip()
    description  = data.get('description', '').strip()
    if not company_name:
        return jsonify({'error': 'Company name required'}), 400
    prompt = f"""Rapid investment screening:

**Company:** {company_name}
**Description:** {description or 'No description — use available knowledge.'}

## ⚡ Quick Screen: {company_name}

**Pass / Pass with Concerns / Fail**

### Why (2-3 bullets max)

### Maverix Fit Score: X/10
(Toronto/Canada nexus · growth equity stage · technology focus · team signals)

### Key Diligence Questions (top 3)

### Comparable Companies / Transactions (2-3 comps)

### Recommended Next Step (one sentence)
"""
    return stream_gemini(prompt)

if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=8080, debug=True)
