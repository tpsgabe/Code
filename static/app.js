/* ============================================================
   Maverix PE — AI Deal Sourcing Tool
   Frontend JS: tab navigation, SSE streaming, markdown render
   ============================================================ */

// ---- Tab navigation ----------------------------------------
const navItems = document.querySelectorAll('.nav-item');
const tabPanels = document.querySelectorAll('.tab-panel');

const tabMeta = {
  digest:        { title: 'Morning Digest',      subtitle: 'Your daily deal sourcing briefing' },
  company:       { title: 'Company Research',    subtitle: 'AI-powered company profiling from raw data' },
  'quick-screen':{ title: 'Quick Screen',        subtitle: 'Rapid pass/fail assessment for new prospects' },
  industries:    { title: 'Emerging Industries', subtitle: 'Identify sectors with strong investment momentum' },
  ma:            { title: 'M&A Tracker',         subtitle: 'Toronto growth equity tech deal activity' },
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
      document.getElementById('page-title').textContent = meta.title;
      document.getElementById('page-subtitle').textContent = meta.subtitle;
    }
  });
});

// ---- Utility: simple markdown → HTML ----------------------
function renderMarkdown(text) {
  // Process line-by-line for headers, then handle inline
  const lines = text.split('\n');
  const html = [];
  let inList = false;
  let listType = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Headings
    if (/^### (.+)/.test(line)) {
      if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      html.push(`<h3>${escHtml(line.replace(/^### /, ''))}</h3>`);
    } else if (/^## (.+)/.test(line)) {
      if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      html.push(`<h2>${escHtml(line.replace(/^## /, ''))}</h2>`);
    } else if (/^# (.+)/.test(line)) {
      if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      html.push(`<h1>${escHtml(line.replace(/^# /, ''))}</h1>`);
    // Unordered list
    } else if (/^[-*] (.+)/.test(line)) {
      if (!inList || listType !== 'ul') {
        if (inList) html.push('</ol>');
        html.push('<ul>');
        inList = true; listType = 'ul';
      }
      html.push(`<li>${inlineMarkdown(line.replace(/^[-*] /, ''))}</li>`);
    // Ordered list
    } else if (/^\d+\. (.+)/.test(line)) {
      if (!inList || listType !== 'ol') {
        if (inList) html.push('</ul>');
        html.push('<ol>');
        inList = true; listType = 'ol';
      }
      html.push(`<li>${inlineMarkdown(line.replace(/^\d+\. /, ''))}</li>`);
    // HR
    } else if (/^---+$/.test(line.trim())) {
      if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      html.push('<hr>');
    // Empty line
    } else if (line.trim() === '') {
      if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      html.push('');
    // Paragraph
    } else {
      if (inList) { html.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      html.push(`<p>${inlineMarkdown(line)}</p>`);
    }
  }

  if (inList) html.push(listType === 'ul' ? '</ul>' : '</ol>');
  return html.join('\n');
}

function inlineMarkdown(text) {
  // Bold (**text** or __text__)
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
  // Italic (*text* or _text_)
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
  // Code `text`
  text = text.replace(/`(.+?)`/g, '<code>$1</code>');
  // Escape remaining HTML
  return text;
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---- SSE streaming fetch -----------------------------------
async function streamRequest(endpoint, payload, outputEl, resultCard, btn) {
  // Reset state
  resultCard.classList.remove('hidden');
  outputEl.innerHTML = '';
  outputEl.classList.add('streaming-cursor');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Analyzing…';

  let accText = '';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Request failed' }));
      outputEl.innerHTML = `<p style="color:var(--red)">Error: ${escHtml(err.error || 'Unknown error')}</p>`;
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          if (parsed.text) {
            accText += parsed.text;
            outputEl.innerHTML = renderMarkdown(accText);
            // Auto-scroll
            outputEl.scrollTop = outputEl.scrollHeight;
          }
        } catch (_) {
          // Ignore parse errors for partial chunks
        }
      }
    }
  } catch (err) {
    outputEl.innerHTML = `<p style="color:var(--red)">Connection error: ${escHtml(err.message)}</p>`;
  } finally {
    outputEl.classList.remove('streaming-cursor');
    btn.disabled = false;
  }
}

// ---- Wire up buttons ---------------------------------------

// Morning Digest
document.getElementById('btn-digest').addEventListener('click', () => {
  const date = document.getElementById('digest-date').value.trim() ||
    new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  streamRequest(
    '/api/morning-digest',
    { date },
    document.getElementById('output-digest'),
    document.getElementById('result-digest'),
    document.getElementById('btn-digest'),
  );
  document.getElementById('btn-digest').innerHTML = '<span class="spinner"></span> Generating…';
});

// Set today's date as default for digest
(function setDefaultDate() {
  const el = document.getElementById('digest-date');
  if (!el.value) {
    el.value = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }
})();

// Company Research
document.getElementById('btn-company').addEventListener('click', () => {
  const company_info = document.getElementById('company-info').value.trim();
  if (!company_info) { alert('Please paste company information first.'); return; }

  const btn = document.getElementById('btn-company');
  btn.innerHTML = '<span class="spinner"></span> Analyzing…';
  streamRequest(
    '/api/summarize-company',
    { company_info },
    document.getElementById('output-company'),
    document.getElementById('result-company'),
    btn,
  );
});

// Quick Screen
document.getElementById('btn-screen').addEventListener('click', () => {
  const company_name = document.getElementById('screen-name').value.trim();
  const description = document.getElementById('screen-desc').value.trim();
  if (!company_name) { alert('Please enter a company name.'); return; }

  const btn = document.getElementById('btn-screen');
  btn.innerHTML = '<span class="spinner"></span> Screening…';
  streamRequest(
    '/api/quick-screen',
    { company_name, description },
    document.getElementById('output-screen'),
    document.getElementById('result-screen'),
    btn,
  );
});

// Emerging Industries
document.getElementById('btn-industries').addEventListener('click', () => {
  const sectors = document.getElementById('industry-sectors').value.trim();
  const timeframe = document.getElementById('industry-timeframe').value.trim() || 'Q1 2026';

  const btn = document.getElementById('btn-industries');
  btn.innerHTML = '<span class="spinner"></span> Analyzing…';
  streamRequest(
    '/api/emerging-industries',
    { sectors, timeframe },
    document.getElementById('output-industries'),
    document.getElementById('result-industries'),
    btn,
  );
});

// M&A Tracker
document.getElementById('btn-ma').addEventListener('click', () => {
  const timeframe = document.getElementById('ma-timeframe').value.trim() || 'last 30 days';
  const subsectors = document.getElementById('ma-subsectors').value.trim();

  const btn = document.getElementById('btn-ma');
  btn.innerHTML = '<span class="spinner"></span> Tracking…';
  streamRequest(
    '/api/ma-tracker',
    { timeframe, subsectors },
    document.getElementById('output-ma'),
    document.getElementById('result-ma'),
    btn,
  );
});

// ---- Reset button label after streaming --------------------
// (streamRequest already resets btn.disabled; restore icon text)
const btnConfig = {
  'btn-digest':     '<span class="btn-icon">☀️</span> Generate Digest',
  'btn-company':    '<span class="btn-icon">🏢</span> Analyze Company',
  'btn-screen':     '<span class="btn-icon">⚡</span> Quick Screen',
  'btn-industries': '<span class="btn-icon">📈</span> Analyze Trends',
  'btn-ma':         '<span class="btn-icon">🤝</span> Track M&A Activity',
};

// Observe disabled changes to restore button text when re-enabled
Object.entries(btnConfig).forEach(([id, label]) => {
  const el = document.getElementById(id);
  const observer = new MutationObserver(() => {
    if (!el.disabled && !el.innerHTML.includes('btn-icon')) {
      el.innerHTML = label;
    }
  });
  observer.observe(el, { attributes: true, attributeFilter: ['disabled'] });
});

// ---- Copy to clipboard -------------------------------------
window.copyResult = function(cardId) {
  const outputEl = document.querySelector(`#${cardId} .markdown-output`);
  if (!outputEl) return;
  const text = outputEl.innerText;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector(`#${cardId} .btn-copy`);
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  });
};

// ---- Enter key support for single-line inputs --------------
['screen-name'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        document.getElementById('btn-screen').click();
      }
    });
  }
});
