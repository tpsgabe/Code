/* ============================================================
   Maverix PE — Intelligence Platform
   Frontend JS: tabs, SSE streaming, markdown, pipeline CRUD
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

// ── Pipeline CRUD ────────────────────────────────────────────

let allDeals = [];

async function loadPipeline() {
  try {
    const res = await fetch('/api/deals');
    allDeals = await res.json();
    renderPipeline();
    updateDashboard();
  } catch (e) {
    console.error('Failed to load pipeline:', e);
  }
}

function renderPipeline() {
  const cols = { sourcing: [], screening: [], diligence: [], closed: [] };
  for (const deal of allDeals) {
    const stage = cols[deal.stage] ? deal.stage : 'sourcing';
    cols[stage].push(deal);
  }
  for (const [stage, deals] of Object.entries(cols)) {
    const col = document.getElementById(`col-${stage}`);
    if (!col) continue;
    col.innerHTML = '';
    for (const deal of deals) {
      col.appendChild(buildCard(deal));
    }
    const countEl = document.getElementById(`count-${stage}`);
    if (countEl) countEl.textContent = deals.length;
  }
  const total = allDeals.length;
  const active = (cols.sourcing.length + cols.screening.length + cols.diligence.length);
  const totalEl = document.getElementById('count-total');
  if (totalEl) totalEl.textContent = `${active} active · ${total} total`;
}

function buildCard(deal) {
  const div = document.createElement('div');
  div.className = 'pipeline-card';
  if (deal.stage === 'closed') div.classList.add('closed');
  div.dataset.dealId = deal.id;

  let badge = '';
  if (deal.stage === 'closed' && deal.outcome === 'invested') {
    badge = `<div class="pc-closed-badge invested">✓ Invested</div>`;
  } else if (deal.stage === 'closed' && deal.outcome === 'passed') {
    badge = `<div class="pc-closed-badge passed">✗ Passed</div>`;
  }

  div.innerHTML = `
    ${badge}
    <div class="pc-top">
      <span class="pc-name">${escHtml(deal.company)}</span>
      <span class="pc-sector">${escHtml(deal.sector)}</span>
    </div>
    <div class="pc-meta">${escHtml(deal.target_amount || '')}${deal.target_amount && deal.round_type ? ' · ' : ''}${escHtml(deal.round_type || '')}</div>
    ${deal.notes ? `<div class="pc-owner">${escHtml(deal.notes)}</div>` : ''}
    <div class="pc-actions">
      <button class="pc-action-btn" onclick="editDeal(${deal.id})">Edit</button>
      <button class="pc-action-btn delete" onclick="deleteDeal(${deal.id})">Delete</button>
    </div>
  `;
  return div;
}

function updateDashboard() {
  const active = allDeals.filter(d => d.stage !== 'closed').length;
  const el = document.getElementById('stat-active-deals');
  const delta = document.getElementById('stat-active-delta');
  if (el) el.textContent = active;
  if (delta) delta.textContent = `${allDeals.length} total in pipeline`;

  // Dashboard pipeline list
  const list = document.getElementById('dash-pipeline-list');
  const tag  = document.getElementById('dash-pipeline-tag');
  if (!list) return;
  if (tag) tag.textContent = `${active} active`;
  const recent = allDeals.filter(d => d.stage !== 'closed').slice(0, 6);
  if (recent.length === 0) {
    list.innerHTML = '<div style="padding:1rem;color:var(--text-muted);font-size:.85rem">No active deals.</div>';
    return;
  }
  const stageLabel = { sourcing: 'Sourcing', screening: 'Screening', diligence: 'Diligence', closed: 'Closed' };
  const stageColor = { sourcing: 'var(--blue)', screening: 'var(--orange)', diligence: 'var(--gold)', closed: 'var(--gray-400)' };
  list.innerHTML = recent.map(d => `
    <div class="deal-item">
      <div class="deal-info">
        <span class="deal-company">${escHtml(d.company)}</span>
        <span class="deal-sector">${escHtml(d.sector)}</span>
      </div>
      <div class="deal-right">
        <span class="deal-value" style="color:${stageColor[d.stage]}">${stageLabel[d.stage]}</span>
        ${d.owner ? `<span class="deal-type series-a">${escHtml(d.owner)}</span>` : ''}
      </div>
    </div>
  `).join('');
}

// ── Sortable drag-drop ───────────────────────────────────────
function initSortable() {
  const stages = ['sourcing', 'screening', 'diligence', 'closed'];
  stages.forEach(stage => {
    const el = document.getElementById(`col-${stage}`);
    if (!el) return;
    Sortable.create(el, {
      group: 'pipeline',
      animation: 150,
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      onEnd(evt) {
        const dealId = parseInt(evt.item.dataset.dealId);
        const newStage = evt.to.id.replace('col-', '');
        if (newStage === stage && evt.from === evt.to) return;
        fetch(`/api/deals/${dealId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: newStage }),
        }).then(() => loadPipeline());
      },
    });
  });
}

// ── Add / Edit Deal Modal ────────────────────────────────────
window.openAddDeal = function () {
  document.getElementById('modal-title').textContent = 'Add New Deal';
  document.getElementById('modal-deal-id').value = '';
  document.getElementById('modal-company').value = '';
  document.getElementById('modal-sector').value = '';
  document.getElementById('modal-amount').value = '';
  document.getElementById('modal-round').value = '';
  document.getElementById('modal-stage').value = 'sourcing';
  document.getElementById('modal-outcome').value = '';
  document.getElementById('modal-notes').value = '';
  document.getElementById('modal-owner').value = 'JR';
  document.getElementById('deal-modal').classList.remove('hidden');
  document.getElementById('modal-company').focus();
};

window.editDeal = function (id) {
  const deal = allDeals.find(d => d.id === id);
  if (!deal) return;
  document.getElementById('modal-title').textContent = 'Edit Deal';
  document.getElementById('modal-deal-id').value = deal.id;
  document.getElementById('modal-company').value = deal.company;
  document.getElementById('modal-sector').value = deal.sector;
  document.getElementById('modal-amount').value = deal.target_amount || '';
  document.getElementById('modal-round').value = deal.round_type || '';
  document.getElementById('modal-stage').value = deal.stage;
  document.getElementById('modal-outcome').value = deal.outcome || '';
  document.getElementById('modal-notes').value = deal.notes || '';
  document.getElementById('modal-owner').value = deal.owner || 'JR';
  document.getElementById('deal-modal').classList.remove('hidden');
};

window.closeModal = function () {
  document.getElementById('deal-modal').classList.add('hidden');
};

window.closeModalOutside = function (e) {
  if (e.target === document.getElementById('deal-modal')) closeModal();
};

window.saveDeal = async function () {
  const id = document.getElementById('modal-deal-id').value;
  const company = document.getElementById('modal-company').value.trim();
  const sector  = document.getElementById('modal-sector').value.trim();
  if (!company || !sector) { alert('Company name and sector are required.'); return; }

  const payload = {
    company,
    sector,
    target_amount: document.getElementById('modal-amount').value.trim(),
    round_type:    document.getElementById('modal-round').value,
    stage:         document.getElementById('modal-stage').value,
    outcome:       document.getElementById('modal-outcome').value || null,
    notes:         document.getElementById('modal-notes').value.trim(),
    owner:         document.getElementById('modal-owner').value,
  };

  const btn = document.getElementById('modal-save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    const url    = id ? `/api/deals/${id}` : '/api/deals';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (!res.ok) { const e = await res.json(); alert(e.error || 'Save failed'); return; }
    closeModal();
    await loadPipeline();
  } catch (err) {
    alert('Network error: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Deal';
  }
};

window.deleteDeal = async function (id) {
  if (!confirm('Delete this deal? This cannot be undone.')) return;
  await fetch(`/api/deals/${id}`, { method: 'DELETE' });
  await loadPipeline();
};

// ── Init ─────────────────────────────────────────────────────
loadPipeline().then(() => initSortable());
