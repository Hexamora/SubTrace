// ════════════════════════════════════════
//  STATE
// ════════════════════════════════════════
let WORDLIST        = [];   
let results         = [];
let isScanning      = false;
let scanAbort       = false;
let startTime       = null;
let timerID         = null;
let rateHistory     = [];
let activeFilter    = 'all';
let timelineBuckets = new Array(20).fill(0);
let totalWords      = 0;
let scannedCount    = 0;
let foundCount      = 0;

// ════════════════════════════════════════
//  DOM refs
// ════════════════════════════════════════
const domainInput    = document.getElementById('domain-input');
const btnScan        = document.getElementById('btn-scan');
const btnText        = document.getElementById('btn-text');
const btnExport      = document.getElementById('btn-export');
const btnExportTxt   = document.getElementById('btn-export-txt');
const btnClear       = document.getElementById('btn-clear');
const resultsList    = document.getElementById('results-list');
const progressTrack  = document.getElementById('progress-track');
const progressFill   = document.getElementById('progress-fill');
const liveLog        = document.getElementById('live-log');
const liveDot        = document.getElementById('live-dot');
const wordlistSelect = document.getElementById('wordlist-select');

// ════════════════════════════════════════
//  Load wordlist from selected file
// ════════════════════════════════════════
async function loadWordlist() {
  const filePath = wordlistSelect.value;
  const fileName = filePath.split('/').pop();

  document.getElementById('wordlist-info').textContent  = `Loading ${fileName}…`;
  document.getElementById('wordlist-count').textContent = '…';
  document.getElementById('wordlist-file').textContent  = fileName;

  try {
    const res  = await fetch(filePath);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    WORDLIST = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));

    document.getElementById('wordlist-info').textContent  = `${WORDLIST.length} words · ${fileName}`;
    document.getElementById('wordlist-count').textContent = `${WORDLIST.length} words`;
    document.getElementById('wordlist-file').textContent  = fileName;
    addLog(`Wordlist loaded: ${WORDLIST.length} words from ${fileName}`, 'c-cyan');
  } catch (err) {
    WORDLIST = [];
    document.getElementById('wordlist-info').textContent  = `⚠ Failed to load ${fileName}`;
    document.getElementById('wordlist-count').textContent = '0 words';
    document.getElementById('wordlist-file').textContent  = `${fileName} (error)`;
    addLog(`Failed to load ${fileName}: ${err.message}`, 'c-red');
    toast(`Failed to load ${fileName}!`, 'error');
  }
}

wordlistSelect.addEventListener('change', () => {
  if (isScanning) {
    // Revert selection and warn
    const current = WORDLIST.length
      ? wordlistSelect.options[wordlistSelect.selectedIndex === 0 ? 1 : 0]
      : null;
    toast('Cannot switch wordlist while scanning.', 'error');
    return;
  }
  loadWordlist();
});

// Update DoH provider label
document.getElementById('doh-provider').addEventListener('change', function () {
  document.getElementById('doh-status').textContent =
    this.value === 'cloudflare' ? 'Cloudflare' : 'Google';
});

// ════════════════════════════════════════
//  DNS-over-HTTPS resolver
// ════════════════════════════════════════
async function resolveDoH(subdomain, domain) {
  const fqdn     = `${subdomain}.${domain}`;
  const provider = document.getElementById('doh-provider').value;
  const url = provider === 'cloudflare'
    ? `https://cloudflare-dns.com/dns-query?name=${fqdn}&type=A`
    : `https://dns.google/resolve?name=${fqdn}&type=A`;

  const t0 = performance.now();
  try {
    const res  = await fetch(url, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const ms   = Math.round(performance.now() - t0);

    if (data.Status !== 0 || !data.Answer) return null;

    const ips = [...new Set(
      data.Answer.filter(r => r.type === 1 || r.type === 28).map(r => r.data)
    )];
    if (!ips.length) return null;

    return {
      subdomain: fqdn,
      name: subdomain,
      ips,
      latency_ms: ms,
      hasIPv6: ips.some(ip => ip.includes(':')),
      timestamp: new Date().toISOString(),
    };
  } catch { return null; }
}

// ════════════════════════════════════════
//  Concurrency pool
// ════════════════════════════════════════
async function runPool(tasks, concurrency, onResult) {
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      if (scanAbort) return;
      const task = tasks[idx++];
      const result = await task();
      onResult(result);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

// ════════════════════════════════════════
//  Scan start / stop
// ════════════════════════════════════════
function toggleScan() {
  if (isScanning) { stopScan(true); return; }
  startScan();
}

async function startScan() {
  const domainRaw = domainInput.value.trim();
  const domain    = validateDomain(domainRaw);
  if (!domain) {
    toast('Invalid domain. Example: example.com', 'error');
    shake(domainInput);
    return;
  }

  if (!WORDLIST.length) {
    toast('Wordlist not loaded yet. Please wait or reload the page.', 'error');
    return;
  }

  const concurrency = parseInt(document.getElementById('concurrency-select').value) || 20;
  const customRaw   = document.getElementById('custom-words').value;
  const customWords = customRaw.split(',').map(w => w.trim()).filter(Boolean);
  const wordlist    = [...customWords, ...WORDLIST];
  const fileName    = wordlistSelect.value.split('/').pop();

  results = []; isScanning = true; scanAbort = false;
  scannedCount = 0; foundCount = 0; rateHistory = [];
  timelineBuckets = new Array(20).fill(0);
  totalWords = wordlist.length;

  wordlistSelect.disabled = true;

  // Reset UI
  resultsList.innerHTML = '';
  const es = document.createElement('div');
  es.className = 'empty-state'; es.id = 'empty-state';
  es.innerHTML = '<div class="empty-icon spin" style="opacity:0.6">◎</div><div style="color:var(--cyan)">Scan in progress…</div>';
  resultsList.appendChild(es);

  btnScan.classList.add('scanning');
  btnText.textContent   = 'Stop';
  btnExport.disabled    = true;
  btnExportTxt.disabled = true;
  btnClear.disabled     = true;
  liveDot.classList.add('active');
  progressTrack.classList.add('active');
  progressFill.style.width = '0%';

  document.getElementById('current-domain').textContent  = domain;
  document.getElementById('wordlist-count').textContent  = `${wordlist.length} words`;
  document.getElementById('wordlist-file').textContent   = fileName;
  document.getElementById('threads-info').textContent    = `${concurrency} concurrent`;
  document.getElementById('stat-found').textContent      = '0';
  document.getElementById('stat-scanned').textContent    = '0';
  document.getElementById('stat-progress').textContent   = '0%';

  clearLog();
  renderMiniChart();

  startTime = Date.now();
  timerID   = setInterval(updateTimer, 300);

  addLog(`Starting scan: ${domain}`, 'c-cyan');
  addLog(`Wordlist: ${wordlist.length} words (${fileName}) | Concurrency: ${concurrency}`, 'c-dim');
  addLog(`DoH Provider: ${document.getElementById('doh-provider').value}`, 'c-dim');
  if (customWords.length) addLog(`Custom words prepended: ${customWords.length}`, 'c-dim');

  const tasks = wordlist.map(word => () => resolveDoH(word, domain));

  await runPool(tasks, concurrency, (result) => {
    scannedCount++;
    updateStats(foundCount, scannedCount, totalWords);
    updateRate(scannedCount);

    if (result) {
      foundCount++;
      results.push(result);
      appendResult(result);
      const bucket = Math.floor((scannedCount / totalWords) * 19);
      timelineBuckets[bucket]++;
      renderMiniChart();
      addLog(`✓ ${result.subdomain} [${result.ips[0]}] ${result.latency_ms}ms`, 'c-green');
    }
  });

  if (!scanAbort) {
    clearInterval(timerID);
    updateTimer();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    addLog(`Done: ${foundCount} found out of ${totalWords} words in ${elapsed}s`, 'c-cyan');
    toast(`Done! ${foundCount} subdomain${foundCount !== 1 ? 's' : ''} found`, foundCount > 0 ? 'success' : '');
  }

  stopScan(false);
  const hasResults      = foundCount > 0;
  btnExport.disabled    = !hasResults;
  btnExportTxt.disabled = !hasResults;
  btnClear.disabled     = false;
}

function stopScan(aborted = true) {
  if (aborted) {
    scanAbort = true;
    addLog('Scan stopped by user.', 'c-orange');
  }
  isScanning = false;
  clearInterval(timerID);
  btnScan.classList.remove('scanning');
  btnText.textContent     = 'Scan';
  liveDot.classList.remove('active');
  wordlistSelect.disabled = false;  // unlock selector
}

// ════════════════════════════════════════
//  Stats
// ════════════════════════════════════════
function updateStats(found, scanned, total) {
  document.getElementById('stat-found').textContent    = found;
  document.getElementById('stat-scanned').textContent  = scanned;
  const pct = total > 0 ? Math.round((scanned / total) * 100) : 0;
  document.getElementById('stat-progress').textContent = `${pct}%`;
  progressFill.style.width = `${pct}%`;
}

function updateTimer() {
  if (!startTime) return;
  const s = Math.floor((Date.now() - startTime) / 1000);
  document.getElementById('stat-time').textContent =
    s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
}

function updateRate(scanned) {
  rateHistory.push({ t: Date.now(), n: scanned });
  if (rateHistory.length > 10) rateHistory.shift();
  if (rateHistory.length >= 2) {
    const dt   = (rateHistory[rateHistory.length - 1].t - rateHistory[0].t) / 1000;
    const dn   = rateHistory[rateHistory.length - 1].n - rateHistory[0].n;
    const rate = dt > 0 ? Math.round(dn / dt) : 0;
    document.getElementById('scan-rate').textContent = `${rate}/s`;
  }
}

// ════════════════════════════════════════
//  Results rendering
// ════════════════════════════════════════
function appendResult(data) {
  const es = document.getElementById('empty-state');
  if (es) es.remove();

  if (!filterPasses(data, activeFilter)) return;

  const latMs    = data.latency_ms || 0;
  const latClass = latMs < 100 ? 'fast' : latMs > 500 ? 'slow' : '';

  const item = document.createElement('div');
  item.className = 'result-item';
  item.innerHTML = `
    <div class="result-main">
      <div class="result-sub">${escHtml(data.subdomain)}</div>
      <div class="result-ips">${data.ips.map(ip => `<span class="ip-tag">${escHtml(ip)}</span>`).join('')}</div>
    </div>
    <div class="result-meta">
      <div class="result-latency ${latClass}">${latMs}ms</div>
      <div class="result-time">${new Date(data.timestamp).toLocaleTimeString('en-US')}</div>
    </div>`;

  item.addEventListener('click', () => showModal(data));
  resultsList.appendChild(item);

  if (resultsList.scrollTop + resultsList.clientHeight > resultsList.scrollHeight - 80) {
    resultsList.scrollTop = resultsList.scrollHeight;
  }

  document.getElementById('panel-title-text').textContent = `Scan Results (${results.length})`;
  btnClear.disabled     = false;
  btnExport.disabled    = false;
  btnExportTxt.disabled = false;
}

function filterPasses(data, filter) {
  if (filter === 'all')  return true;
  if (filter === 'fast') return (data.latency_ms || 0) < 100;
  if (filter === 'slow') return (data.latency_ms || 0) > 500;
  if (filter === 'ipv6') return data.hasIPv6;
  return true;
}

function reRenderResults() {
  resultsList.innerHTML = '';
  if (!results.length) {
    const es = document.createElement('div');
    es.className = 'empty-state';
    es.innerHTML = '<div class="empty-icon">◎</div><div>No results for this filter</div>';
    resultsList.appendChild(es);
    return;
  }
  results.forEach(r => appendResult(r));
}

// ════════════════════════════════════════
//  Mini chart
// ════════════════════════════════════════
function renderMiniChart() {
  const container = document.getElementById('mini-bars');
  const max = Math.max(...timelineBuckets, 1);
  container.innerHTML = timelineBuckets.map(v => {
    const h = Math.round((v / max) * 56) + 4;
    return `<div class="mini-bar ${v > 0 ? 'has-data' : ''}" style="height:${h}px" title="${v} found"></div>`;
  }).join('');
}

// ════════════════════════════════════════
//  Live log
// ════════════════════════════════════════
function addLog(msg, cls = 'c-dim') {
  const ts    = new Date().toLocaleTimeString('en-US', { hour12: false });
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-ts">${ts}</span><span class="log-msg ${cls}">${escHtml(msg)}</span>`;
  liveLog.appendChild(entry);
  liveLog.scrollTop = liveLog.scrollHeight;
  while (liveLog.children.length > 200) liveLog.removeChild(liveLog.firstChild);
}

function clearLog() { liveLog.innerHTML = ''; }

// ════════════════════════════════════════
//  Modal
// ════════════════════════════════════════
function showModal(data) {
  document.getElementById('modal-domain').textContent = data.subdomain;
  const latClass = data.latency_ms < 100 ? 'green' : '';
  document.getElementById('modal-body').innerHTML = `
    <div class="modal-row">
      <span class="modal-key">Subdomain</span>
      <span class="modal-val accent">${escHtml(data.subdomain)}</span>
    </div>
    <div class="modal-row">
      <span class="modal-key">IP Address</span>
      <span class="modal-val">${data.ips.map(escHtml).join(' · ')}</span>
    </div>
    <div class="modal-row">
      <span class="modal-key">Latency</span>
      <span class="modal-val ${latClass}">${data.latency_ms}ms</span>
    </div>
    <div class="modal-row">
      <span class="modal-key">Discovered</span>
      <span class="modal-val">${new Date(data.timestamp).toLocaleString('en-US')}</span>
    </div>
    <div class="modal-row">
      <span class="modal-key">IP Version</span>
      <span class="modal-val">${data.hasIPv6 ? 'IPv4 + IPv6' : 'IPv4 only'}</span>
    </div>
    <div class="modal-row">
      <span class="modal-key">IP Count</span>
      <span class="modal-val green">${data.ips.length}</span>
    </div>
    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
      <a href="http://${escHtml(data.subdomain)}" target="_blank" rel="noopener"
         style="color:var(--cyan);font-family:var(--font-mono);font-size:11px;text-decoration:none">
        → Open http://${escHtml(data.subdomain)}
      </a><br><br>
      <a href="https://${escHtml(data.subdomain)}" target="_blank" rel="noopener"
         style="color:var(--cyan);font-family:var(--font-mono);font-size:11px;text-decoration:none">
        → Open https://${escHtml(data.subdomain)}
      </a>
    </div>`;
  document.getElementById('modal-overlay').classList.add('open');
}

document.getElementById('modal-close').addEventListener('click', () => {
  document.getElementById('modal-overlay').classList.remove('open');
});
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});

// ════════════════════════════════════════
//  Export CSV
// ════════════════════════════════════════
function exportCSV() {
  if (!results.length) return;
  const rows = [
    ['subdomain', 'ips', 'latency_ms', 'ipv6', 'timestamp'],
    ...results.map(r => [r.subdomain, r.ips.join('|'), r.latency_ms, r.hasIPv6, r.timestamp])
  ];
  const csv = rows.map(r => r.join(',')).join('\n');
  downloadFile(csv, `subfinder_${domainInput.value}_${Date.now()}.csv`, 'text/csv');
  toast('CSV exported successfully!', 'success');
}

// ════════════════════════════════════════
//  Export TXT
// ════════════════════════════════════════
function exportTXT() {
  if (!results.length) return;

  const domain   = domainInput.value.trim();
  const fileName = wordlistSelect.value.split('/').pop();
  const scanDate = new Date().toLocaleString('en-US');
  const sep      = '─'.repeat(52);

  const header = [
    '╔══════════════════════════════════════════════════╗',
    '║           SubFinder — Scan Report                ║',
    '╚══════════════════════════════════════════════════╝',
    '',
    `  Domain    : ${domain}`,
    `  Date      : ${scanDate}`,
    `  Wordlist  : ${fileName}`,
    `  Found     : ${results.length} subdomain${results.length !== 1 ? 's' : ''}`,
    `  Scanned   : ${totalWords} words`,
    '',
    sep,
    '',
  ].join('\n');

  const body = results.map((r, i) => {
    const num    = String(i + 1).padStart(3, ' ');
    const ipLine = r.ips.join(', ');
    const v6flag = r.hasIPv6 ? '  [IPv6]' : '';
    return [
      `${num}. ${r.subdomain}`,
      `      IP      : ${ipLine}${v6flag}`,
      `      Latency : ${r.latency_ms}ms`,
      '',
    ].join('\n');
  }).join('\n');

  const footer = [
    sep,
    '',
    `  Generated by SubFinder`,
    `  ${new Date().toISOString()}`,
  ].join('\n');

  downloadFile(
    header + body + footer,
    `subfinder_${domain}_${Date.now()}.txt`,
    'text/plain'
  );
  toast('TXT exported successfully!', 'success');
}

// ════════════════════════════════════════
//  Download helper
// ════════════════════════════════════════
function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ════════════════════════════════════════
//  Toast
// ════════════════════════════════════════
function toast(msg, type = '', duration = 3500) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-wrap').appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ════════════════════════════════════════
//  Utilities
// ════════════════════════════════════════
function validateDomain(d) {
  d = d.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
  return /^(?:[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(d) ? d : null;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function shake(el) {
  el.style.borderColor = 'var(--red)';
  setTimeout(() => el.style.borderColor = '', 800);
}

// ════════════════════════════════════════
//  Event listeners
// ════════════════════════════════════════
btnScan.addEventListener('click', toggleScan);

domainInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !isScanning) startScan();
});

btnExport.addEventListener('click', exportCSV);
btnExportTxt.addEventListener('click', exportTXT);

btnClear.addEventListener('click', () => {
  results = []; timelineBuckets = new Array(20).fill(0);
  resultsList.innerHTML = '';
  const es = document.createElement('div');
  es.className = 'empty-state'; es.id = 'empty-state';
  es.innerHTML = '<div class="empty-icon">◎</div><div>Results cleared</div>';
  resultsList.appendChild(es);
  clearLog();
  updateStats(0, 0, 0);
  document.getElementById('panel-title-text').textContent = 'Scan Results';
  document.getElementById('stat-time').textContent        = '0s';
  document.getElementById('scan-rate').textContent        = '—';
  progressFill.style.width = '0%';
  progressTrack.classList.remove('active');
  document.getElementById('current-domain').textContent   = '—';
  renderMiniChart();
  btnExport.disabled    = true;
  btnExportTxt.disabled = true;
  btnClear.disabled     = true;
});

document.querySelectorAll('.filter-tab').forEach(tab => {
  tab.addEventListener('click', function () {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    this.classList.add('active');
    activeFilter = this.dataset.filter;
    reRenderResults();
  });
});

// ═════════════════════════════════════════════════
//  Init — load default wordlist, then prepare UI
// ═════════════════════════════════════════════════
(async () => {
  renderMiniChart();
  domainInput.focus();
  await loadWordlist();
})();