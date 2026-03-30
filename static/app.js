/* ============================================================
   Maverix PE — Intelligence Platform
   Frontend JS: tabs, SSE streaming, markdown, dashboard
   ============================================================ */

// ── Tab navigation ──────────────────────────────────────────
const navItems  = document.querySelectorAll('.nav-item');
const tabPanels = document.querySelectorAll('.tab-panel');

const tabMeta = {
  dashboard:      { title: 'Dashboard',          subtitle: 'Monday, March 30, 2026 · Toronto, ON' },
  pipeline:       { title: 'Deal Pipeline',      subtitle: '14 active opportunities across all stages' },
  portfolio:      { title: 'Portfolio',           subtitle: '23 companies · $1.24B AUM · Fund III' },
  digest:         { title: 'Morning Digest',      subtitle: 'AI-generated daily deal sourcing briefing' },
  company:        { title: 'Company Research',    subtitle: 'AI-powered company profiling from raw data' },
  'quick-screen': { title: 'Quick Screen',        subtitle: 'Rapid pass/fail assessment for prospects' },
  industries:     { title: 'Sector Trends',       subtitle: 'Investment momentum by sector' },
  ma:             { title: 'M&A Tracker',         subtitle: 'Toronto growth equity tech deal activity' },
};

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const tab = item.dataset.tab;
    navItems.forEach(n => n.classList.remove('active'));
    tabPanels.forEach(p => p.classList.remove('active'));
    item.classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
    const meta = tabMeta[tab];
    if (meta) {
      document.getElementById('page-title').textContent    = meta.title;
      document.getElementById('page-subtitle').textContent = meta.subtitle;
    }
  });
});

// ── Markdown → HTML ─────────────────────────────────────────
function renderMarkdown(text) {
  const lines = text.split('\n');
  const html  = [];
  let inList  = false;
  let listType = null;

  for (const line of lines) {
    if (/^### (.+)/.test(line)) {
      if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      html.push(`<h3>${escHtml(line.replace(/^### /, ''))}</h3>`);
    } else if (/^## (.+)/.test(line)) {
      if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      html.push(`<h2>${escHtml(line.replace(/^## /, ''))}</h2>`);
    } else if (/^# (.+)/.test(line)) {
      if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      html.push(`<h1>${escHtml(line.replace(/^# /, ''))}</h1>`);
    } else if (/^[-*] (.+)/.test(line)) {
      if (!inList || listType !== 'ul') { if (inList) html.push('</ol>'); html.push('<ul>'); inList = true; listType = 'ul'; }
      html.push(`<li>${inlineMd(line.replace(/^[-*] /, ''))}</li>`);
    } else if (/^\d+\. (.+)/.test(line)) {
      if (!inList || listType !== 'ol') { if (inList) html.push('</ul>'); html.push('<ol>'); inList = true; listType = 'ol'; }
      html.push(`<li>${inlineMd(line.replace(/^\d+\. /, ''))}</li>`);
    } else if (/^---+$/.test(line.trim())) {
      if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      html.push('<hr>');
    } else if (line.trim() === '') {
      if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
    } else {
      if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      html.push(`<p>${inlineMd(line)}</p>`);
    }
  }
  if (inList) html.push(listType === 'ul' ? '</ul>' : '</ol>');
  return html.join('\n');
}

function inlineMd(t) {
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/__(.+?)__/g,     '<strong>$1</strong>');
  t = t.replace(/\*([^*]+)\*/g,   '<em>$1</em>');
  t = t.replace(/_([^_]+)_/g,     '<em>$1</em>');
  t = t.replace(/`(.+?)`/g,       '<code>$1</code>');
  return t;
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── SSE streaming ───────────────────────────────────────────
async function streamRequest(endpoint, payload, outputEl, resultCard, btn) {
  resultCard.classList.remove('hidden');
  outputEl.innerHTML = '';
  outputEl.classList.add('streaming-cursor');
  btn.disabled = true;
  const origLabel = btn.innerHTML;
  btn.innerHTML = '<span class="spinner"></span> Analyzing…';

  let acc = '';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      outputEl.innerHTML = `<p style="color:var(--red)">Error: ${escHtml(err.error || 'Unknown error')}</p>`;
      return;
    }
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          if (parsed.text) { acc += parsed.text; outputEl.innerHTML = renderMarkdown(acc); outputEl.scrollTop = outputEl.scrollHeight; }
        } catch (_) {}
      }
    }
  } catch (err) {
    outputEl.innerHTML = `<p style="color:var(--red)">Connection error: ${escHtml(err.message)}</p>`;
  } finally {
    outputEl.classList.remove('streaming-cursor');
    btn.disabled = false;
    btn.innerHTML = origLabel;
  }
}

// ── Wire up AI tool buttons ─────────────────────────────────

// Morning Digest
document.getElementById('btn-digest').addEventListener('click', function () {
  const date = document.getElementById('digest-date').value.trim() ||
    new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  streamRequest('/api/morning-digest', { date },
    document.getElementById('output-digest'),
    document.getElementById('result-digest'), this);
});

// Set default date
(function () {
  const el = document.getElementById('digest-date');
  if (el && !el.value) el.value = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
})();

// Company Research
document.getElementById('btn-company').addEventListener('click', function () {
  const v = document.getElementById('company-info').value.trim();
  if (!v) { alert('Paste company information first.'); return; }
  streamRequest('/api/summarize-company', { company_info: v },
    document.getElementById('output-company'),
    document.getElementById('result-company'), this);
});

// Quick Screen
document.getElementById('btn-screen').addEventListener('click', function () {
  const name = document.getElementById('screen-name').value.trim();
  if (!name) { alert('Enter a company name.'); return; }
  streamRequest('/api/quick-screen', { company_name: name, description: document.getElementById('screen-desc').value.trim() },
    document.getElementById('output-screen'),
    document.getElementById('result-screen'), this);
});

// Sector Trends
document.getElementById('btn-industries').addEventListener('click', function () {
  streamRequest('/api/emerging-industries', {
    sectors: document.getElementById('industry-sectors').value.trim(),
    timeframe: document.getElementById('industry-timeframe').value.trim() || 'Q1 2026',
  }, document.getElementById('output-industries'),
     document.getElementById('result-industries'), this);
});

// M&A Tracker
document.getElementById('btn-ma').addEventListener('click', function () {
  streamRequest('/api/ma-tracker', {
    timeframe: document.getElementById('ma-timeframe').value.trim() || 'last 30 days',
    subsectors: document.getElementById('ma-subsectors').value.trim(),
  }, document.getElementById('output-ma'),
     document.getElementById('result-ma'), this);
});

// Enter key on quick screen
document.getElementById('screen-name')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-screen').click();
});

// ── Copy to clipboard ───────────────────────────────────────
window.copyResult = function (cardId) {
  const el = document.querySelector(`#${cardId} .markdown-output`);
  if (!el) return;
  navigator.clipboard.writeText(el.innerText).then(() => {
    const btn = document.querySelector(`#${cardId} .btn-copy`);
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  });
};
