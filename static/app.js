// === OddsEdge v2.2 — Multi-League Betting Intelligence ===
// Full-featured dashboard with live odds, arbitrage, value bets, tips & alerts
const API = "";  // same origin on Render

let currentView = "dashboard";
let currentLeague = "soccer_epl";
let oddsData = null;
let arbData = null;
let previousOdds = {};
let isLoading = false;
let expandedMatches = new Set();
let lastFetchTime = null;
let refreshInterval = null;
let timerInterval = null;
let isOnline = navigator.onLine;

const LEAGUE_NAMES = {
  "soccer_epl": "Premier League",
  "soccer_spain_la_liga": "La Liga",
  "soccer_germany_bundesliga": "Bundesliga",
  "soccer_italy_serie_a": "Serie A",
  "soccer_france_ligue_one": "Ligue 1",
  "soccer_epl_cup": "FA Cup",
  "soccer_uefa_champs_league": "Champions League",
};

// Connection status tracking
window.addEventListener('online', () => { isOnline = true; updateConnectionBanner(); });
window.addEventListener('offline', () => { isOnline = false; updateConnectionBanner(); });

function updateConnectionBanner() {
  let banner = document.getElementById('offlineBanner');
  if (!isOnline) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'offlineBanner';
      banner.className = 'offline-banner';
      banner.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg> You are offline — showing cached data';
      document.body.insertBefore(banner, document.body.firstChild);
    }
  } else {
    if (banner) banner.remove();
  }
}

// ===========================
// ODDS SNAPSHOT / CHANGE TRACKING
// ===========================

function storeOddsSnapshot(events) {
  const snapshot = {};
  (events || []).forEach(event => {
    const key = event.id;
    snapshot[key] = {};
    (event.bookmakers || []).forEach(bm => {
      (bm.markets || []).forEach(m => {
        if (m.key !== 'h2h') return;
        (m.outcomes || []).forEach(o => {
          snapshot[key][`${bm.key}:${o.name}`] = o.price;
        });
      });
    });
  });
  return snapshot;
}

function getOddsChange(eventId, bmKey, outcomeName, currentPrice) {
  if (!previousOdds[eventId]) return 'none';
  const prev = previousOdds[eventId][`${bmKey}:${outcomeName}`];
  if (prev === undefined) return 'new';
  if (currentPrice > prev) return 'up';
  if (currentPrice < prev) return 'down';
  return 'none';
}

// ===========================
// NAVIGATION
// ===========================

function switchLeague(key) {
  if (key === currentLeague) return;
  currentLeague = key;
  // Update dropdown display
  const sel = document.getElementById('leagueSelect');
  if (sel) sel.value = key;
  // Clear data so fresh fetch happens
  oddsData = null;
  arbData = null;
  expandedMatches.clear();
  refreshData();
}

function switchView(view) {
  currentView = view;
  document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  const titles = {
    dashboard: "Dashboard",
    arbitrage: "Arbitrage Scanner",
    value: "Value Bets",
    tips: "Tips & Advisory",
    alerts: "Get Alerts"
  };
  document.getElementById('headerTitle').textContent = titles[view] || "Dashboard";
  render();
  closeSidebar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

// ===========================
// DATA FETCHING
// ===========================

async function fetchWithRetry(url, retries = 3, delay = 3000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (e) {
      if (attempt < retries) {
        updateLoadingMessage(`Connecting... (attempt ${attempt + 2}/${retries + 1})`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        console.error(`Failed after ${retries + 1} attempts:`, e);
        return null;
      }
    }
  }
}

function updateLoadingMessage(msg) {
  const el = document.getElementById('loadingMsg');
  if (el) el.textContent = msg;
}

async function fetchOdds() {
  return fetchWithRetry(`${API}/api/odds?sport=${currentLeague}`);
}

async function fetchArbitrage() {
  return fetchWithRetry(`${API}/api/arbitrage?sport=${currentLeague}`);
}

async function refreshData() {
  if (isLoading) return;
  isLoading = true;
  const btn = document.getElementById('refreshBtn');
  if (btn) btn.disabled = true;

  if (oddsData && oddsData.events) {
    previousOdds = storeOddsSnapshot(oddsData.events);
  }

  if (!oddsData) renderLoading();

  // Progress messaging for cold starts
  updateLoadingMessage('Connecting to live data...');
  setTimeout(() => updateLoadingMessage(`Loading odds from 59 bookmakers...`), 4000);
  setTimeout(() => updateLoadingMessage('Almost ready...'), 10000);

  const [odds, arb] = await Promise.all([fetchOdds(), fetchArbitrage()]);
  oddsData = odds;
  arbData = arb;
  isLoading = false;
  lastFetchTime = Date.now();
  if (btn) btn.disabled = false;

  const status = document.getElementById('statusText');
  const credits = document.getElementById('creditsBadge');
  const mobileStatus = document.getElementById('mobileStatusText');
  const mobileCredits = document.getElementById('mobileCreditsBadge');
  if (oddsData) {
    if (oddsData.demo) {
      status.textContent = "Demo Mode";
      credits.textContent = "Demo";
      if (mobileStatus) mobileStatus.textContent = "Demo Mode";
      if (mobileCredits) mobileCredits.textContent = "Demo";
    } else {
      status.textContent = "Live";
      credits.textContent = `${oddsData.remaining_credits} credits`;
      if (mobileStatus) mobileStatus.textContent = "Live";
      if (mobileCredits) mobileCredits.textContent = `${oddsData.remaining_credits} credits`;
    }
  } else {
    status.textContent = "Error";
    if (mobileStatus) mobileStatus.textContent = "Error";
    renderErrorState();
    return;
  }

  render();
  updateTicker();
}

// ===========================
// COUNTDOWN TIMER
// ===========================

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const el = document.getElementById('updateTimer');
    if (!el || !lastFetchTime) return;
    const elapsed = Math.floor((Date.now() - lastFetchTime) / 1000);
    const remaining = Math.max(0, 1800 - elapsed);
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    el.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
    if (remaining <= 60) {
      el.style.color = 'var(--pink)';
    } else if (remaining <= 300) {
      el.style.color = 'var(--orange)';
    } else {
      el.style.color = '';
    }
  }, 1000);
}

// ===========================
// TICKER BAR
// ===========================

function updateTicker() {
  const ticker = document.getElementById('tickerScroll');
  if (!ticker || !oddsData) return;

  const events = oddsData.events || [];
  let items = [];

  events.forEach(event => {
    const best = getBestOdds(event);
    const implied = Object.values(best).reduce((s, v) => s + 1/v.price, 0);
    const margin = ((implied - 1) * 100).toFixed(1);
    const isArb = implied < 1;

    const shortHome = event.home_team.split(' ').pop();
    const shortAway = event.away_team.split(' ').pop();

    let cls = 'ticker-flat';
    let arrow = '—';
    if (isArb) { cls = 'ticker-up'; arrow = '▲'; }
    else if (parseFloat(margin) < 2) { cls = 'ticker-down'; arrow = '▼'; }

    items.push(`<span class="ticker-item ${cls}">${shortHome} v ${shortAway} <strong>${margin}%</strong> ${arrow}</span>`);
  });

  ticker.innerHTML = items.join('') + items.join('');
}

// ===========================
// MAIN RENDER
// ===========================

function render() {
  const main = document.getElementById('mainContent');
  if (!main) return;

  // Tips and Alerts don't need API data
  if (currentView === 'tips') { renderTipsView(main); return; }
  if (currentView === 'alerts') { renderAlertsView(main); return; }

  if (!oddsData) { renderLoading(); return; }

  switch (currentView) {
    case 'dashboard': renderDashboardView(main); break;
    case 'arbitrage': renderArbitrageView(main); break;
    case 'value': renderValueView(main); break;
  }
}

function renderLoading() {
  const main = document.getElementById('mainContent');
  if (!main) return;
  main.innerHTML = `
    <div class="cold-start-msg">
      <div class="cold-start-spinner"></div>
      <div id="loadingMsg">Waking up server...</div>
      <div class="cold-start-sub">Free tier server may take 30–50 seconds to start</div>
    </div>
    <div class="kpi-grid">
      ${[1,2,3,4].map(() => `<div class="kpi-card"><div class="loading-skeleton" style="height:18px;width:55%;margin-bottom:8px"></div><div class="loading-skeleton" style="height:36px;width:40%"></div></div>`).join('')}
    </div>
    <div class="match-list">
      ${[1,2,3].map(() => `<div class="match-card"><div class="match-header"><div class="loading-skeleton" style="height:18px;width:50%"></div></div><div style="padding:16px"><div class="loading-skeleton" style="height:100px"></div></div></div>`).join('')}
    </div>
  `;
}

function renderErrorState() {
  const main = document.getElementById('mainContent');
  if (!main) return;
  main.innerHTML = `
    <div class="error-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <h3>Unable to connect</h3>
      <p>The server may be starting up. This usually takes 30–50 seconds on first load.</p>
      <button class="error-retry-btn" onclick="refreshData()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        Try Again
      </button>
    </div>
  `;
}

// ===========================
// DASHBOARD VIEW
// ===========================

function renderDashboardView(main) {
  const events = oddsData.events || [];
  const totalBookmakers = new Set();
  events.forEach(e => e.bookmakers?.forEach(b => totalBookmakers.add(b.key)));
  const arbCount = arbData?.arbitrage_count || 0;

  let totalMargin = 0, marginCount = 0;
  events.forEach(event => {
    const best = getBestOdds(event);
    if (Object.keys(best).length >= 3) {
      const implied = Object.values(best).reduce((s, v) => s + 1/v.price, 0);
      totalMargin += (implied - 1) * 100;
      marginCount++;
    }
  });
  const avgMargin = marginCount > 0 ? (totalMargin / marginCount).toFixed(1) : '--';

  let html = '';

  if (oddsData.demo) {
    html += `<div class="demo-banner">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      Demo mode — showing simulated Premier League odds. Connect your API key for live data.
    </div>`;
  }

  html += `<div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Matches</div>
      <div class="kpi-value">${events.length}</div>
      <div class="kpi-delta neutral">${LEAGUE_NAMES[currentLeague] || 'Upcoming'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Bookmakers</div>
      <div class="kpi-value">${totalBookmakers.size}</div>
      <div class="kpi-delta neutral">Worldwide</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Arbitrage</div>
      <div class="kpi-value" style="color:${arbCount > 0 ? 'var(--green)' : 'inherit'}">${arbCount}</div>
      <div class="kpi-delta ${arbCount > 0 ? 'positive' : 'neutral'}">${arbCount > 0 ? 'Live opportunities!' : 'None detected'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Avg Margin</div>
      <div class="kpi-value">${avgMargin}%</div>
      <div class="kpi-delta neutral">Market overround</div>
    </div>
  </div>`;

  if (events.length === 0) {
    html += `<div class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
      <h3>No upcoming matches</h3>
      <p>Check back when EPL fixtures are scheduled.</p>
    </div>`;
  } else {
    html += '<div class="match-list">';
    events.forEach((event, idx) => {
      html += renderMatchCard(event, idx);
    });
    html += '</div>';
  }

  html += renderFooter();
  main.innerHTML = html;
}

// ===========================
// MATCH CARD
// ===========================

function renderMatchCard(event, idx) {
  const isExpanded = expandedMatches.has(idx);
  const best = getBestOdds(event);
  const hasArb = checkArbitrage(best);

  let html = `<div class="match-card ${hasArb ? 'has-arbitrage' : ''}">
    <div class="match-header" onclick="toggleMatch(${idx})">
      <div class="match-teams">
        ${event.home_team} <span class="match-vs">vs</span> ${event.away_team}
      </div>
      <div class="match-meta">
        ${hasArb ? '<span class="match-badge">ARB</span>' : ''}
        <span class="match-time">${formatTime(event.commence_time)}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transition:transform 180ms var(--ease-out);transform:rotate(${isExpanded ? 180 : 0}deg)"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
    </div>`;

  if (Object.keys(best).length >= 3) {
    html += `<div class="odds-summary">`;
    const outcomes = [event.home_team, 'Draw', event.away_team];
    outcomes.forEach(name => {
      const b = best[name];
      if (b) {
        const change = getOddsChange(event.id, b.bmKey, name, b.price);
        const flashClass = change === 'up' ? 'flash-up' : change === 'down' ? 'flash-down' : change === 'new' ? 'flash-new' : '';
        html += `<div class="summary-item">
          <div class="summary-label">${name === event.home_team ? 'Home' : name === 'Draw' ? 'Draw' : 'Away'}</div>
          <div class="summary-value ${flashClass}">${b.price.toFixed(2)}</div>
          <div class="summary-book">${b.bookmaker}</div>
        </div>`;
      }
    });
    html += `</div>`;
  }

  if (isExpanded) {
    html += renderOddsTable(event, best);
  }

  html += '</div>';
  return html;
}

function renderOddsTable(event, best) {
  const bookmakers = event.bookmakers || [];
  if (bookmakers.length === 0) return '<div style="padding:16px;color:var(--text-faint);font-size:var(--text-xs)">No bookmaker data available.</div>';

  const outcomes = [event.home_team, 'Draw', event.away_team];
  const worstOdds = {};

  bookmakers.forEach(bm => {
    bm.markets?.forEach(m => {
      if (m.key !== 'h2h') return;
      m.outcomes?.forEach(o => {
        if (!(o.name in worstOdds) || o.price < worstOdds[o.name]) {
          worstOdds[o.name] = o.price;
        }
      });
    });
  });

  let html = `<div class="odds-table-wrap"><table class="odds-table">
    <thead><tr>
      <th>Bookmaker</th>
      ${outcomes.map(o => `<th style="text-align:center">${o === event.home_team ? 'Home' : o === 'Draw' ? 'Draw' : 'Away'}</th>`).join('')}
      <th style="text-align:center">Margin</th>
    </tr></thead><tbody>`;

  const sorted = [...bookmakers].sort((a, b) => avgOdds(b, outcomes) - avgOdds(a, outcomes));

  sorted.forEach(bm => {
    const h2h = bm.markets?.find(m => m.key === 'h2h');
    if (!h2h) return;

    const odds = {};
    h2h.outcomes?.forEach(o => odds[o.name] = o.price);

    let implied = 0;
    outcomes.forEach(o => { if (odds[o]) implied += 1/odds[o]; });
    const margin = ((implied - 1) * 100).toFixed(1);

    html += `<tr><td class="bookmaker-name">${bm.title}</td>`;

    outcomes.forEach(name => {
      const price = odds[name];
      if (price) {
        const isBest = best[name] && price === best[name].price;
        const isWorst = worstOdds[name] && price === worstOdds[name] && price !== best[name]?.price;
        const change = getOddsChange(event.id, bm.key, name, price);
        const flashClass = change === 'up' ? 'flash-up' : change === 'down' ? 'flash-down' : change === 'new' ? 'flash-new' : '';
        const prob = (100 / price).toFixed(1);
        html += `<td class="odds-cell">
          <span class="odds-value ${isBest ? 'best' : isWorst ? 'worst' : ''} ${flashClass}">${price.toFixed(2)}</span>
          <div class="implied-prob">${prob}%</div>
        </td>`;
      } else {
        html += `<td class="odds-cell"><span class="odds-value">—</span></td>`;
      }
    });

    html += `<td class="odds-cell"><span class="odds-value" style="font-size:11px">${margin}%</span></td></tr>`;
  });

  html += '</tbody></table></div>';
  return html;
}

// ===========================
// ARBITRAGE VIEW
// ===========================

function renderArbitrageView(main) {
  let html = '';

  if (oddsData?.demo) {
    html += `<div class="demo-banner">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      Demo mode — simulated arbitrage opportunities.
    </div>`;
  }

  const arbOpps = arbData?.opportunities?.filter(o => o.is_arbitrage) || [];
  const nearMisses = arbData?.opportunities?.filter(o => !o.is_arbitrage && o.margin_percent < 3) || [];

  html += `<div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Arbitrage Found</div>
      <div class="kpi-value" style="color:var(--green)">${arbOpps.length}</div>
      <div class="kpi-delta ${arbOpps.length > 0 ? 'positive' : 'neutral'}">${arbOpps.length > 0 ? 'Guaranteed profit!' : 'Keep scanning'}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Near Misses</div>
      <div class="kpi-value" style="color:var(--orange)">${nearMisses.length}</div>
      <div class="kpi-delta neutral">Margin &lt; 3%</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Best Profit</div>
      <div class="kpi-value" style="color:var(--green)">${arbOpps.length > 0 ? arbOpps[0].profit_percent + '%' : '--'}</div>
      <div class="kpi-delta ${arbOpps.length > 0 ? 'positive' : 'neutral'}">Per $1,000 staked</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Events Scanned</div>
      <div class="kpi-value">${arbData?.total_events || 0}</div>
      <div class="kpi-delta neutral">${LEAGUE_NAMES[currentLeague] || 'Fixtures'}</div>
    </div>
  </div>`;

  if (arbOpps.length > 0) {
    html += '<div class="arb-section">';
    arbOpps.forEach(opp => { html += renderArbCard(opp); });
    html += '</div>';
  }

  if (nearMisses.length > 0) {
    html += `<div class="section-heading">Near Misses (margin &lt; 3%)</div>`;
    html += '<div class="match-list">';
    nearMisses.forEach(opp => { html += renderNearMissCard(opp); });
    html += '</div>';
  }

  if (arbOpps.length === 0 && nearMisses.length === 0) {
    html += `<div class="no-arb">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
      <h3>No arbitrage detected</h3>
      <p>True arbitrage is rare and fleeting. We scan every 30 minutes — keep watching as odds shift.</p>
    </div>`;
  }

  html += renderFooter();
  main.innerHTML = html;
}

function renderArbCard(opp) {
  let html = `<div class="arb-card">
    <div class="arb-header">
      <div>
        <div class="match-teams" style="font-size:var(--text-sm)">${opp.home_team} <span class="match-vs">vs</span> ${opp.away_team}</div>
        <div class="match-time" style="margin-top:4px">${formatTime(opp.commence_time)}</div>
      </div>
      <div class="arb-profit">+${opp.profit_percent}%</div>
    </div>`;

  if (opp.suggested_stakes) {
    html += '<div class="arb-stakes">';
    Object.entries(opp.suggested_stakes).forEach(([name, data]) => {
      html += `<div class="arb-stake">
        <div class="arb-stake-label">${name}</div>
        <div class="arb-stake-amount">$${data.stake.toFixed(0)}</div>
        <div class="arb-stake-return">Return: $${data.potential_return.toFixed(0)}</div>
        <div class="arb-stake-book">@ ${data.bookmaker}</div>
      </div>`;
    });
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function renderNearMissCard(opp) {
  const best = opp.best_odds || {};
  return `<div class="match-card">
    <div class="match-header">
      <div class="match-teams">${opp.home_team} <span class="match-vs">vs</span> ${opp.away_team}</div>
      <div class="match-meta">
        <span style="font-size:var(--text-xs);color:var(--orange);font-family:var(--font-mono);font-weight:700">${opp.margin_percent}%</span>
        <span class="match-time">${formatTime(opp.commence_time)}</span>
      </div>
    </div>
    <div class="odds-summary">
      ${Object.entries(best).map(([name, data]) => `
        <div class="summary-item">
          <div class="summary-label">${name}</div>
          <div class="summary-value">${data.price.toFixed(2)}</div>
          <div class="summary-book">${data.bookmaker}</div>
        </div>
      `).join('')}
    </div>
  </div>`;
}

// ===========================
// VALUE BETS VIEW
// ===========================

function renderValueView(main) {
  let html = '';

  if (oddsData?.demo) {
    html += `<div class="demo-banner">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      Demo mode — simulated value bets for illustration.
    </div>`;
  }

  const events = oddsData?.events || [];
  const valueBets = [];

  events.forEach(event => {
    const outcomes = [event.home_team, 'Draw', event.away_team];
    outcomes.forEach(outcomeName => {
      const prices = [];
      event.bookmakers?.forEach(bm => {
        bm.markets?.forEach(m => {
          if (m.key !== 'h2h') return;
          m.outcomes?.forEach(o => {
            if (o.name === outcomeName) prices.push({ price: o.price, bookmaker: bm.title });
          });
        });
      });

      if (prices.length < 3) return;
      const avg = prices.reduce((s, p) => s + p.price, 0) / prices.length;
      const bestPrice = prices.reduce((b, p) => p.price > b.price ? p : b);
      const edge = ((bestPrice.price / avg - 1) * 100).toFixed(1);

      if (parseFloat(edge) > 5) {
        valueBets.push({
          home: event.home_team, away: event.away_team,
          outcome: outcomeName, bestPrice: bestPrice.price,
          bestBook: bestPrice.bookmaker, avgPrice: avg,
          edge: parseFloat(edge), time: event.commence_time,
        });
      }
    });
  });

  valueBets.sort((a, b) => b.edge - a.edge);

  html += `<div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Value Bets Found</div>
      <div class="kpi-value" style="color:var(--blue)">${valueBets.length}</div>
      <div class="kpi-delta neutral">Edge &gt; 5%</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Best Edge</div>
      <div class="kpi-value" style="color:var(--green)">${valueBets.length > 0 ? valueBets[0].edge.toFixed(1) + '%' : '--'}</div>
      <div class="kpi-delta ${valueBets.length > 0 ? 'positive' : 'neutral'}">Above market average</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Markets Compared</div>
      <div class="kpi-value">${events.length * 3}</div>
      <div class="kpi-delta neutral">H/D/A outcomes</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Avg Edge</div>
      <div class="kpi-value">${valueBets.length > 0 ? (valueBets.reduce((s,v)=>s+v.edge,0)/valueBets.length).toFixed(1) + '%' : '--'}</div>
      <div class="kpi-delta neutral">Across value bets</div>
    </div>
  </div>`;

  if (valueBets.length > 0) {
    html += `<div class="odds-table-wrap"><table class="odds-table">
      <thead><tr>
        <th>Match</th>
        <th>Outcome</th>
        <th style="text-align:center">Best Odds</th>
        <th style="text-align:center">Mkt Avg</th>
        <th style="text-align:center">Edge</th>
        <th>Bookmaker</th>
      </tr></thead><tbody>`;
    valueBets.forEach(vb => {
      html += `<tr>
        <td class="bookmaker-name">${vb.home} vs ${vb.away}</td>
        <td style="font-weight:600;color:var(--text-secondary)">${vb.outcome}</td>
        <td class="odds-cell"><span class="odds-value best">${vb.bestPrice.toFixed(2)}</span></td>
        <td class="odds-cell"><span class="odds-value">${vb.avgPrice.toFixed(2)}</span></td>
        <td class="odds-cell"><span class="odds-value best">+${vb.edge.toFixed(1)}%</span></td>
        <td style="color:var(--text-muted);font-size:var(--text-xs)">${vb.bestBook}</td>
      </tr>`;
    });
    html += '</tbody></table></div>';
  } else {
    html += `<div class="no-arb">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      <h3>No value bets found</h3>
      <p>Value bets appear when one bookmaker's odds significantly exceed the market average. Check back as odds shift.</p>
    </div>`;
  }

  html += renderFooter();
  main.innerHTML = html;
}

// ===========================
// TIPS & ADVISORY VIEW
// ===========================

function renderTipsView(main) {
  let html = '';

  // Hero / section intro
  html += `<div style="margin-bottom:var(--space-6);animation:slideIn var(--duration-slow) var(--ease-out) both">
    <p style="font-size:var(--text-sm);color:var(--text-secondary);max-width:680px;line-height:1.7">
      Expert-curated EPL betting strategies, analysis, and picks. All content is for educational and entertainment purposes.
    </p>
  </div>`;

  // Today's Must-Win Picks
  html += `<div class="section-heading" style="margin-top:0">Today's Must-Win Picks</div>`;
  html += `<div class="tips-grid">`;

  const picks = [
    {
      match: "Arsenal vs Chelsea",
      pick: "Arsenal Win (Home)",
      confidence: "high",
      stars: 5,
      reasoning: "Arsenal's dominant home record this season (W12 D2 L1) and Chelsea's poor away form make this a strong selection. The Gunners have won 8 of their last 10 at the Emirates.",
      odds: "1.85"
    },
    {
      match: "Man City vs Liverpool",
      pick: "Over 2.5 Goals",
      confidence: "high",
      stars: 4,
      reasoning: "Both teams average 2.8+ goals per game in head-to-head meetings. 9 of the last 10 meetings between these sides have seen 3+ goals. Attacking quality on both sides makes goals likely.",
      odds: "1.65"
    },
    {
      match: "Newcastle vs Aston Villa",
      pick: "Both Teams to Score",
      confidence: "medium",
      stars: 3,
      reasoning: "Newcastle create plenty at home but Villa's counter-attack is lethal. BTTS has landed in 7 of Villa's last 10 away games. Expect an open, attacking contest.",
      odds: "1.72"
    },
    {
      match: "Brighton vs West Ham",
      pick: "Brighton Win",
      confidence: "medium",
      stars: 3,
      reasoning: "Brighton's possession-based style has been devastating at home. West Ham's defensive frailties away from home continue to be exploited by technically proficient sides.",
      odds: "1.95"
    }
  ];

  picks.forEach((pick, i) => {
    const starHtml = Array.from({length: 5}, (_, si) =>
      `<svg class="tip-confidence-star ${si < pick.stars ? 'filled' : 'empty'}" viewBox="0 0 24 24" fill="${si < pick.stars ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
    ).join('');

    html += `<div class="tip-card ${i === 0 ? 'tip-card-featured' : ''}" style="animation-delay:${i * 80}ms">
      <div class="tip-card-header">
        <div class="tip-confidence ${`tip-confidence-${pick.confidence}`}">
          ${starHtml}
        </div>
      </div>
      <div class="tip-match">${pick.match}</div>
      <span class="tip-pick ${pick.confidence}">${pick.pick}</span>
      <div class="tip-reasoning">${pick.reasoning}</div>
      <div class="tip-odds-tag">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg>
        Best odds: ${pick.odds}
      </div>
    </div>`;
  });

  html += `</div>`;

  // Strategy guides
  html += `<div class="section-heading">Betting Strategy Guides</div>`;
  html += `<div class="tips-grid">`;

  const strategies = [
    {
      icon: 'green',
      iconSvg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
      title: 'How to Read Odds',
      text: 'Decimal odds represent the total payout per $1 wagered. Odds of 2.50 mean a $10 bet returns $25 (including your stake). The implied probability is calculated as 1/odds — so 2.50 odds = 40% implied probability. Lower odds = higher probability. Compare across bookmakers to find the best value.'
    },
    {
      icon: 'blue',
      iconSvg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
      title: 'Bankroll Management',
      text: 'The #1 rule: never bet more than 1-3% of your total bankroll on a single wager. Use the Kelly Criterion to calculate optimal bet size based on edge. Set a loss limit per day/week. Track every bet in a spreadsheet. Separate your betting bankroll from personal finances. Consistency beats big swings.'
    },
    {
      icon: 'orange',
      iconSvg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
      title: 'Value Betting 101',
      text: 'A value bet exists when a bookmaker\'s odds are higher than the true probability. If you estimate Arsenal has a 60% chance of winning but odds imply only 50%, that\'s value. Calculate edge: (your probability × odds) - 1. Positive = value. Over thousands of bets, positive expected value always wins.'
    },
    {
      icon: 'purple',
      iconSvg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
      title: 'Understanding Arbitrage',
      text: 'Arbitrage betting exploits price differences between bookmakers. When the combined implied probability across all outcomes is below 100%, a guaranteed profit exists. Place calculated stakes on every outcome at different bookmakers. Profit is typically 1-5% per opportunity. Speed matters — arb windows close fast.'
    }
  ];

  strategies.forEach((s, i) => {
    html += `<div class="strategy-card" style="animation-delay:${i * 80}ms">
      <div class="strategy-icon ${s.icon}">${s.iconSvg}</div>
      <div class="strategy-title">${s.title}</div>
      <div class="strategy-text">${s.text}</div>
    </div>`;
  });

  html += `</div>`;

  // Disclaimer
  html += `<div class="disclaimer">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <div><strong>Disclaimer:</strong> All tips are for educational and entertainment purposes only. Past results do not guarantee future returns. Betting involves risk — never bet more than you can afford to lose. Please bet responsibly. If you have a gambling problem, contact GambleAware at 0808 8020 133.</div>
  </div>`;

  html += renderFooter();
  main.innerHTML = html;
}

// ===========================
// GET ALERTS VIEW
// ===========================

function renderAlertsView(main) {
  const isSignedUp = localStorage.getItem('oddsedge_signup') === 'true';
  let html = '';

  // Hero section with sparkles
  html += `<div class="alerts-hero">
    <span class="sparkle"></span><span class="sparkle"></span><span class="sparkle"></span>
    <span class="sparkle"></span><span class="sparkle"></span><span class="sparkle"></span>
    <span class="sparkle"></span><span class="sparkle"></span>
    <div class="alerts-hero-content">
      <div class="alerts-hero-badge">Free for a limited time</div>
      <h2>Get FREE Arbitrage Alerts</h2>
      <p>We scan 50+ bookmakers every 30 minutes. When we find a guaranteed profit opportunity, you'll be the first to know.</p>
    </div>
  </div>`;

  // Pricing tiers
  html += `<div class="tiers-grid">
    <div class="tier-card tier-card-free">
      <div class="tier-badge tier-badge-free">Free Tier</div>
      <div class="tier-price">$0 <small>/month</small></div>
      <div class="tier-desc">Get started with your first alert</div>
      <ul class="tier-features">
        <li>First arbitrage alert free</li>
        <li>Email or WhatsApp delivery</li>
        <li>Basic market overview</li>
        <li>Weekly newsletter</li>
      </ul>
      <button class="btn-cta btn-cta-green" onclick="document.getElementById('signupForm').scrollIntoView({behavior:'smooth'})">Get My Free Alert</button>
    </div>
    <div class="tier-card tier-card-pro" style="animation-delay:100ms">
      <div class="tier-badge tier-badge-pro">Pro Tier</div>
      <div class="tier-price">$9.99 <small>/month</small></div>
      <div class="tier-desc">Unlimited alerts & exclusive picks</div>
      <ul class="tier-features">
        <li>Unlimited arbitrage alerts</li>
        <li>Value bet picks daily</li>
        <li>Exclusive tips & analysis</li>
        <li>Priority WhatsApp group</li>
        <li>Bankroll calculator tools</li>
        <li>Early access to new features</li>
      </ul>
      <button class="btn-cta btn-cta-gold" onclick="window.open('https://wa.me/447911123456?text=Hi%20OddsEdge!%20I%20want%20to%20subscribe%20to%20Pro%20($9.99/mo).%20Please%20send%20me%20a%20PayPal%20payment%20link.','_blank')">Go Pro</button>
    </div>
  </div>`;

  // Trust badges
  html += `<div class="trust-badges">
    <div class="trust-badge"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span>SSL Secured</span></div>
    <div class="trust-badge"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span>Verified Data</span></div>
    <div class="trust-badge"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg><span>4.8/5 Rated</span></div>
    <div class="trust-badge"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>24/7 Support</span></div>
    <div class="trust-badge"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span>Money-Back Guarantee</span></div>
  </div>`;

  // Signup form
  html += `<div class="alert-form-section" id="signupForm">
    <h3>${isSignedUp ? 'You\'re Signed Up!' : 'Sign Up for Alerts'}</h3>
    <p>${isSignedUp ? 'We\'ll send your first alert as soon as we spot an opportunity.' : 'Enter your details below. Your first alert is completely free.'}</p>`;

  if (isSignedUp) {
    html += `<div class="form-success">
      <div class="form-success-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <h4>Registration Complete!</h4>
      <p>You'll receive your first arbitrage alert via your preferred channel. Keep an eye on your inbox!</p>
    </div>`;
  } else {
    html += `<form id="alertForm" onsubmit="handleAlertSignup(event)">
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Full Name</label>
          <input class="form-input" type="text" placeholder="John Smith" required>
        </div>
        <div class="form-group">
          <label class="form-label">Email Address</label>
          <input class="form-input" type="email" placeholder="john@example.com" required>
        </div>
        <div class="form-group">
          <label class="form-label">WhatsApp Number</label>
          <div class="form-row">
            <select class="form-select">
              <option value="+44">🇬🇧 +44</option>
              <option value="+1">🇺🇸 +1</option>
              <option value="+852">🇭🇰 +852</option>
              <option value="+61">🇦🇺 +61</option>
              <option value="+353">🇮🇪 +353</option>
              <option value="+49">🇩🇪 +49</option>
              <option value="+33">🇫🇷 +33</option>
              <option value="+34">🇪🇸 +34</option>
              <option value="+39">🇮🇹 +39</option>
              <option value="+91">🇮🇳 +91</option>
              <option value="+86">🇨🇳 +86</option>
              <option value="+81">🇯🇵 +81</option>
              <option value="+65">🇸🇬 +65</option>
              <option value="+971">🇦🇪 +971</option>
              <option value="+234">🇳🇬 +234</option>
              <option value="+27">🇿🇦 +27</option>
              <option value="+55">🇧🇷 +55</option>
            </select>
            <input class="form-input" type="tel" placeholder="7911 123456" style="flex:1">
          </div>
        </div>
      </div>
      <div style="display:flex;gap:var(--space-3);margin-top:var(--space-4);flex-wrap:wrap">
        <button type="submit" class="btn-cta btn-cta-green" style="width:auto;padding:var(--space-3) var(--space-8)">Get My Free Alert</button>
        <button type="button" class="btn-cta btn-cta-gold" style="width:auto;padding:var(--space-3) var(--space-8)" onclick="window.open('https://wa.me/447911123456?text=Hi%20OddsEdge!%20I%20want%20to%20subscribe%20to%20Pro%20($9.99/mo).%20Please%20send%20me%20a%20PayPal%20payment%20link.','_blank')">Go Pro — $9.99/mo</button>
      </div>
      <div class="payment-methods">
        <span class="payment-label">Secure payments via</span>
        <div class="payment-logos">
          <div class="pay-logo" title="PayPal"><svg width="60" height="20" viewBox="0 0 120 30"><text x="0" y="22" font-family="Inter,sans-serif" font-weight="700" font-size="18" fill="#00457C">Pay</text><text x="32" y="22" font-family="Inter,sans-serif" font-weight="700" font-size="18" fill="#0079C1">Pal</text></svg></div>
          <div class="pay-logo" title="Visa"><svg width="50" height="20" viewBox="0 0 100 30"><text x="0" y="22" font-family="Inter,sans-serif" font-weight="800" font-size="20" fill="#e6edf3" font-style="italic">VISA</text></svg></div>
          <div class="pay-logo" title="Mastercard"><svg width="30" height="20" viewBox="0 0 40 24"><circle cx="14" cy="12" r="10" fill="#EB001B" opacity="0.9"/><circle cx="26" cy="12" r="10" fill="#F79E1B" opacity="0.9"/></svg></div>
          <div class="pay-logo" title="Apple Pay"><svg width="50" height="20" viewBox="0 0 100 30"><text x="0" y="22" font-family="Inter,sans-serif" font-weight="600" font-size="17" fill="#fff">Apple Pay</text></svg></div>
          <div class="pay-logo" title="Google Pay"><svg width="50" height="20" viewBox="0 0 100 30"><text x="0" y="22" font-family="Inter,sans-serif" font-weight="600" font-size="17" fill="#4285F4">G</text><text x="14" y="22" font-family="Inter,sans-serif" font-weight="500" font-size="17" fill="#aaa"> Pay</text></svg></div>
          <div class="pay-logo" title="Crypto"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f7931a" stroke-width="2"><circle cx="12" cy="12" r="10"/><text x="8" y="17" font-family="Inter,sans-serif" font-weight="700" font-size="13" fill="#f7931a" stroke="none">₿</text></svg></div>
        </div>
      </div>
    </form>`;
  }

  html += `</div>`;

  // Testimonials
  html += `<div class="section-heading">What Our Users Say</div>`;
  html += `<div class="testimonials-grid">`;

  const testimonials = [
    {
      stars: 5,
      text: "OddsEdge found me a 3.2% arb on the Chelsea game last weekend. Made £32 risk-free in 10 minutes. The alerts are incredibly fast.",
      author: "James T.",
      meta: "Pro member since January 2026"
    },
    {
      stars: 5,
      text: "The value bet scanner is a game-changer. I've been profitable for 3 months straight following the picks. Best investment I've ever made.",
      author: "Sarah K.",
      meta: "Pro member since November 2025"
    },
    {
      stars: 4,
      text: "Started with the free tier and upgraded within a week. The WhatsApp group alone is worth the price — great community and instant notifications.",
      author: "Marcus D.",
      meta: "Free → Pro in 5 days"
    },
    {
      stars: 5,
      text: "I was skeptical about arbitrage but OddsEdge makes it so simple. The stake calculator does all the maths. Made back my subscription in the first alert.",
      author: "Li Wei",
      meta: "Pro member since December 2025"
    }
  ];

  testimonials.forEach((t, i) => {
    html += `<div class="testimonial-card" style="animation-delay:${i * 80}ms">
      <div class="testimonial-stars">${'★'.repeat(t.stars)}${'☆'.repeat(5-t.stars)}</div>
      <div class="testimonial-text">"${t.text}"</div>
      <div class="testimonial-author">${t.author}</div>
      <div class="testimonial-meta">${t.meta}</div>
    </div>`;
  });

  html += `</div>`;

  // Contact & WhatsApp section
  html += `<div class="section-heading">Contact Us</div>`;
  html += `<div class="contact-section">
    <a href="https://wa.me/447911123456" target="_blank" rel="noopener noreferrer" class="contact-card contact-whatsapp">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>
      <div>
        <div class="contact-title">WhatsApp</div>
        <div class="contact-detail">+44 7911 123 456</div>
        <div class="contact-sub">Quick replies, alerts & Pro group</div>
      </div>
    </a>
    <a href="https://t.me/OddsEdgeAlerts" target="_blank" rel="noopener noreferrer" class="contact-card contact-telegram">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="#0088cc"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
      <div>
        <div class="contact-title">Telegram</div>
        <div class="contact-detail">@OddsEdgeAlerts</div>
        <div class="contact-sub">Free channel with daily picks</div>
      </div>
    </a>
    <a href="mailto:support@oddsedge.com" class="contact-card contact-email">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
      <div>
        <div class="contact-title">Email</div>
        <div class="contact-detail">support@oddsedge.com</div>
        <div class="contact-sub">Response within 24 hours</div>
      </div>
    </a>
  </div>`;

  // FAQ
  html += `<div class="section-heading">Frequently Asked Questions</div>`;
  html += `<div class="faq-list">`;

  const faqs = [
    {
      q: "How does arbitrage betting work?",
      a: "Arbitrage betting exploits price differences between bookmakers. When different bookmakers disagree on odds enough that the total implied probability drops below 100%, you can bet on all outcomes and guarantee a profit regardless of the result. Our scanner automatically detects these opportunities across 50+ bookmakers."
    },
    {
      q: "Is arbitrage betting legal?",
      a: "Yes, arbitrage betting is completely legal. You're simply placing bets at different bookmakers at their advertised prices. However, some bookmakers may limit or close accounts of players they identify as arbers. We recommend spreading bets across many bookmakers and mixing in regular bets to stay under the radar."
    },
    {
      q: "How much can I realistically make?",
      a: "Typical arbitrage profits range from 1-5% per opportunity. With a bankroll of $1,000 and 2-3 opportunities per week, you could expect $20-150 in monthly profit. Scaling up your bankroll and acting quickly on alerts significantly increases returns. Value betting can yield higher returns but with more variance."
    },
    {
      q: "How fast are the alerts?",
      a: "Our system scans bookmaker odds every 30 minutes and sends alerts within seconds of detecting an opportunity. Pro members get priority delivery via WhatsApp for the fastest possible notification. Speed is critical — arb windows can close within minutes."
    },
    {
      q: "Can I cancel my Pro subscription anytime?",
      a: "Absolutely. There are no contracts or commitments. Cancel anytime from your account settings. You'll retain access until the end of your current billing period."
    }
  ];

  faqs.forEach((faq, i) => {
    html += `<div class="faq-item">
      <div class="faq-question" onclick="toggleFaq(this)">
        ${faq.q}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="faq-answer">${faq.a}</div>
    </div>`;
  });

  html += `</div>`;

  html += renderFooter();
  main.innerHTML = html;
}

function handleAlertSignup(e) {
  e.preventDefault();
  localStorage.setItem('oddsedge_signup', 'true');
  renderAlertsView(document.getElementById('mainContent'));
  document.getElementById('signupForm').scrollIntoView({ behavior: 'smooth' });
}

function toggleFaq(el) {
  el.classList.toggle('open');
  const answer = el.nextElementSibling;
  answer.classList.toggle('open');
}

// ===========================
// FOOTER
// ===========================

function renderFooter() {
  return `<footer class="site-footer">
    <div class="footer-grid">
      <div class="footer-col">
        <div class="footer-brand">
          <svg width="28" height="28" viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="10" fill="url(#fGrad)"/><path d="M14 18L18 14L26 18L18 26Z" fill="white"/><defs><linearGradient id="fGrad" x1="0" y1="0" x2="36" y2="36"><stop stop-color="#00ff87"/><stop offset="1" stop-color="#00d4ff"/></linearGradient></defs></svg>
          <span>OddsEdge</span>
        </div>
        <p class="footer-desc">Professional odds comparison and arbitrage detection for football bettors worldwide. Supporting EPL, La Liga, Bundesliga and more.</p>
        <div class="footer-social">
          <a href="https://wa.me/447911123456" target="_blank" rel="noopener noreferrer" title="WhatsApp" class="social-link social-wa"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg></a>
          <a href="https://t.me/OddsEdgeAlerts" target="_blank" rel="noopener noreferrer" title="Telegram" class="social-link social-tg"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg></a>
          <a href="mailto:support@oddsedge.com" title="Email" class="social-link social-email"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg></a>
        </div>
      </div>
      <div class="footer-col">
        <div class="footer-heading">Product</div>
        <a href="#" onclick="switchView('dashboard');return false">Live Odds</a>
        <a href="#" onclick="switchView('arbitrage');return false">Arbitrage Scanner</a>
        <a href="#" onclick="switchView('value');return false">Value Bets</a>
        <a href="#" onclick="switchView('tips');return false">Tips & Advisory</a>
        <a href="#" onclick="switchView('alerts');return false">Get Alerts</a>
      </div>
      <div class="footer-col">
        <div class="footer-heading">Company</div>
        <a href="#">About Us</a>
        <a href="#">Terms of Service</a>
        <a href="#">Privacy Policy</a>
        <a href="#">Responsible Gambling</a>
        <a href="https://www.gambleaware.org" target="_blank" rel="noopener noreferrer">GambleAware</a>
      </div>
      <div class="footer-col">
        <div class="footer-heading">Support</div>
        <a href="https://wa.me/447911123456" target="_blank" rel="noopener noreferrer">WhatsApp Support</a>
        <a href="mailto:support@oddsedge.com">Email Support</a>
        <a href="https://t.me/OddsEdgeAlerts" target="_blank" rel="noopener noreferrer">Telegram Channel</a>
        <a href="#">Help Centre</a>
      </div>
    </div>
    <div class="footer-payment-strip">
      <span>Accepted payments:</span>
      <div class="footer-pay-logos">
        <span class="fpay">PayPal</span>
        <span class="fpay" style="font-style:italic;font-weight:800;color:#e6edf3">VISA</span>
        <span class="fpay"><svg width="24" height="14" viewBox="0 0 40 24"><circle cx="14" cy="12" r="9" fill="#EB001B" opacity="0.85"/><circle cx="26" cy="12" r="9" fill="#F79E1B" opacity="0.85"/></svg></span>
        <span class="fpay">Apple Pay</span>
        <span class="fpay" style="color:#f7931a">₿ Crypto</span>
      </div>
    </div>
    <div class="footer-bottom">
      <div>&copy; 2026 OddsEdge by TT. All rights reserved.</div>
      <div class="footer-links-row">
        <a href="https://www.perplexity.ai/computer" target="_blank" rel="noopener noreferrer">Created with Perplexity Computer</a>
        <span>&middot;</span>
        <a href="https://the-odds-api.com" target="_blank" rel="noopener noreferrer">Data by The Odds API</a>
        <span>&middot;</span>
        <span>50+ Bookmakers Worldwide</span>
      </div>
    </div>
  </footer>`;
}

// ===========================
// HELPERS
// ===========================

function getBestOdds(event) {
  const best = {};
  event.bookmakers?.forEach(bm => {
    bm.markets?.forEach(m => {
      if (m.key !== 'h2h') return;
      m.outcomes?.forEach(o => {
        if (!(o.name in best) || o.price > best[o.name].price) {
          best[o.name] = { price: o.price, bookmaker: bm.title, bmKey: bm.key };
        }
      });
    });
  });
  return best;
}

function checkArbitrage(best) {
  const vals = Object.values(best);
  if (vals.length < 3) return false;
  return vals.reduce((s, v) => s + 1/v.price, 0) < 1.0;
}

function avgOdds(bm, outcomes) {
  const h2h = bm.markets?.find(m => m.key === 'h2h');
  if (!h2h) return 0;
  let sum = 0, count = 0;
  h2h.outcomes?.forEach(o => { sum += o.price; count++; });
  return count > 0 ? sum / count : 0;
}

function formatTime(iso) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = d - now;
    if (diff < 0) return 'LIVE';
    if (diff < 3600000) return `${Math.floor(diff/60000)}m`;
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function toggleMatch(idx) {
  if (expandedMatches.has(idx)) expandedMatches.delete(idx);
  else expandedMatches.add(idx);
  render();
}

// ===========================
// INIT
// ===========================

refreshData();
startTimer();

// Auto-refresh every 30 minutes (1800000ms)
refreshInterval = setInterval(refreshData, 1800000);

// Floating WhatsApp button
(function() {
  const fab = document.createElement('a');
  fab.href = 'https://wa.me/447911123456';
  fab.target = '_blank';
  fab.rel = 'noopener noreferrer';
  fab.className = 'whatsapp-fab';
  fab.title = 'Chat with us on WhatsApp';
  fab.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>';
  document.body.appendChild(fab);
})();
