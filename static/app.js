// === OddsEdge v2 — Premier League Betting Intelligence ===
// Full SPA: Dashboard, Arbitrage Scanner, Value Bets, Tips & Advisory, Alerts

'use strict';

// ============================================================
// CONSTANTS & STATE
// ============================================================

const API_BASE = '';
const REFRESH_INTERVAL = 1800; // 30 min

let state = {
  oddsData: null,
  arbData: null,
  currentView: 'dashboard',
  lastUpdated: null,
  isLoading: false,
  countdown: REFRESH_INTERVAL,
  prevOdds: {},
};

// ============================================================
// UTILITIES
// ============================================================

function fmt(n) {
  return Number(n).toFixed(2);
}

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' })
    + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fmtCountdown(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function getMarginClass(m) {
  if (m < 4) return 'low';
  if (m < 8) return 'medium';
  return 'high';
}

// ============================================================
// API CALLS
// ============================================================

async function fetchOdds() {
  const r = await fetch(`${API_BASE}/api/odds`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchArbitrage() {
  const r = await fetch(`${API_BASE}/api/arbitrage`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ============================================================
// DATA LOADING
// ============================================================

async function loadData() {
  if (state.isLoading) return;
  state.isLoading = true;

  const btn = document.getElementById('refreshBtn');
  if (btn) btn.disabled = true;

  try {
    const [odds, arb] = await Promise.all([fetchOdds(), fetchArbitrage()]);
    state.oddsData = odds;
    state.arbData = arb;
    state.lastUpdated = new Date();
    state.countdown = REFRESH_INTERVAL;

    updateStatus(odds.demo ? 'Demo Mode' : 'Live Data', true);
    updateCreditsBadge(odds.remaining_credits);
    updateTicker(odds.events || []);
    renderCurrentView();
  } catch (err) {
    console.error('Load error:', err);
    updateStatus('Error — Retrying', false);
  } finally {
    state.isLoading = false;
    if (btn) btn.disabled = false;
  }
}

function refreshData() {
  loadData();
}

// ============================================================
// UI UPDATES
// ============================================================

function updateStatus(text, ok) {
  const el = document.getElementById('statusText');
  if (el) el.textContent = text;
  const dot = document.querySelector('.sidebar-footer .live-dot');
  if (dot) dot.style.background = ok ? 'var(--green)' : 'var(--pink)';
}

function updateCreditsBadge(credits) {
  const el = document.getElementById('creditsBadge');
  if (el) el.textContent = credits === 'N/A (demo)' ? 'DEMO' : `${credits} cr`;
}

function updateTicker(events) {
  const el = document.getElementById('tickerScroll');
  if (!el || !events.length) return;

  const items = [];
  for (const ev of events.slice(0, 8)) {
    const bms = ev.bookmakers || [];
    if (!bms.length) continue;

    const best = getBestOdds(ev);
    if (!best) continue;

    const sep = '<span class="ticker-sep">|</span>';
    items.push(`
      <span class="ticker-item">
        <span class="teams">${ev.home_team} vs ${ev.away_team}</span>
        ${sep}
        <span class="odds">H: ${fmt(best.home)} · D: ${fmt(best.draw)} · A: ${fmt(best.away)}</span>
      </span>`);
  }

  // Duplicate for seamless scroll
  const html = [...items, ...items].join('');
  el.innerHTML = html;
}

// ============================================================
// NAVIGATION
// ============================================================

function switchView(view) {
  state.currentView = view;

  // Update nav active states
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  // Update header title
  const titles = {
    dashboard: 'Dashboard',
    arbitrage: 'Arbitrage Scanner',
    value: 'Value Bets',
    tips: 'Tips & Advisory',
    alerts: 'Get Alerts',
  };
  const titleEl = document.getElementById('headerTitle');
  if (titleEl) titleEl.textContent = titles[view] || 'OddsEdge';

  renderCurrentView();
  closeSidebar();
}

function renderCurrentView() {
  const views = {
    dashboard: renderDashboard,
    arbitrage: renderArbitrage,
    value: renderValue,
    tips: renderTips,
    alerts: renderAlerts,
  };
  const fn = views[state.currentView];
  if (fn) fn();
}

// ============================================================
// SIDEBAR (MOBILE)
// ============================================================

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

// ============================================================
// ODDS HELPERS
// ============================================================

function getBestOdds(event) {
  const best = {};
  for (const bm of (event.bookmakers || [])) {
    for (const mkt of (bm.markets || [])) {
      if (mkt.key !== 'h2h') continue;
      for (const out of (mkt.outcomes || [])) {
        const name = out.name;
        if (!best[name] || out.price > best[name].price) {
          best[name] = { price: out.price, bm: bm.title };
        }
      }
    }
  }
  if (Object.keys(best).length < 3) return null;
  const keys = Object.keys(best);
  const home = best[event.home_team]?.price;
  const away = best[event.away_team]?.price;
  const draw = best['Draw']?.price;
  if (!home || !away || !draw) return null;
  return { home, away, draw, homeBm: best[event.home_team]?.bm, awayBm: best[event.away_team]?.bm, drawBm: best['Draw']?.bm };
}

function calcMargin(event) {
  const best = getBestOdds(event);
  if (!best) return 100;
  return ((1/best.home + 1/best.draw + 1/best.away) - 1) * 100;
}

// ============================================================
// RENDER: DASHBOARD
// ============================================================

function renderDashboard() {
  const container = document.getElementById('mainContent');
  if (!container) return;

  if (!state.oddsData) {
    container.innerHTML = loadingHTML();
    return;
  }

  const events = state.oddsData.events || [];
  const arbData = state.arbData || {};
  const arbCount = arbData.arbitrage_count || 0;
  const totalBooks = events.length ? Math.max(...events.map(e => (e.bookmakers||[]).length)) : 0;
  const avgMargin = events.length ? (events.reduce((s, e) => s + calcMargin(e), 0) / events.length).toFixed(1) : '—';
  const bestValue = findBestValue(events);

  container.innerHTML = `
    ${state.oddsData.demo ? demoBannerHTML() : ''}
    <div class="stats-grid">
      <div class="stat-card" style="--card-accent: var(--grad-green-blue)">
        <div class="stat-icon" style="--icon-bg: var(--green-dim); --icon-color: var(--green)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        </div>
        <div class="stat-value">${events.length}</div>
        <div class="stat-label">Live Matches</div>
        <div class="stat-delta up">EPL</div>
      </div>
      <div class="stat-card" style="--card-accent: var(--grad-gold-orange)">
        <div class="stat-icon" style="--icon-bg: var(--gold-dim); --icon-color: var(--gold)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        </div>
        <div class="stat-value" style="color: var(--gold)">${arbCount}</div>
        <div class="stat-label">Arbitrage Ops</div>
        ${arbCount > 0 ? '<div class="stat-delta up">LIVE</div>' : '<div class="stat-delta">—</div>'}
      </div>
      <div class="stat-card" style="--card-accent: var(--grad-blue-purple)">
        <div class="stat-icon" style="--icon-bg: var(--blue-dim); --icon-color: var(--blue)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
        </div>
        <div class="stat-value" style="color: var(--blue)">${totalBooks}</div>
        <div class="stat-label">Max Bookmakers</div>
      </div>
      <div class="stat-card" style="--card-accent: var(--grad-pink-purple)">
        <div class="stat-icon" style="--icon-bg: var(--pink-dim); --icon-color: var(--pink)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        </div>
        <div class="stat-value" style="color: var(--pink)">${avgMargin}%</div>
        <div class="stat-label">Avg Margin</div>
      </div>
    </div>

    <div class="section-header">
      <div class="section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        Upcoming Matches
      </div>
      <span class="section-badge">${events.length} matches</span>
    </div>
    <div class="matches-grid">
      ${events.map(ev => matchCardHTML(ev)).join('')}
    </div>
  `;
}

function matchCardHTML(ev) {
  const best = getBestOdds(ev);
  if (!best) return '';
  const margin = calcMargin(ev);
  const mClass = getMarginClass(margin);
  const books = (ev.bookmakers || []).length;

  return `
    <div class="match-card">
      <div class="match-header">
        <div class="match-teams">${ev.home_team} <span style="color:var(--text-muted);font-weight:400">vs</span> ${ev.away_team}</div>
        <div class="match-meta">
          <span class="match-time">${fmtTime(ev.commence_time)}</span>
          <span class="match-books-count">${books} books</span>
        </div>
      </div>
      <div class="odds-row">
        <div class="odds-group">
          <div class="odds-label">HOME</div>
          <div class="odds-best">${fmt(best.home)}</div>
          <div class="odds-bookmaker">${best.homeBm}</div>
        </div>
        <div class="odds-group">
          <div class="odds-label">DRAW</div>
          <div class="odds-best">${fmt(best.draw)}</div>
          <div class="odds-bookmaker">${best.drawBm}</div>
        </div>
        <div class="odds-group">
          <div class="odds-label">AWAY</div>
          <div class="odds-best">${fmt(best.away)}</div>
          <div class="odds-bookmaker">${best.awayBm}</div>
        </div>
        <div class="margin-badge ${mClass}">${margin.toFixed(1)}%</div>
      </div>
    </div>`;
}

// ============================================================
// RENDER: ARBITRAGE
// ============================================================

function renderArbitrage() {
  const container = document.getElementById('mainContent');
  if (!container) return;

  if (!state.arbData) {
    container.innerHTML = loadingHTML();
    return;
  }

  const opps = state.arbData.opportunities || [];
  const arbOpps = opps.filter(o => o.is_arbitrage);
  const nonArb = opps.filter(o => !o.is_arbitrage);

  container.innerHTML = `
    ${state.oddsData?.demo ? demoBannerHTML() : ''}
    <div class="arb-header-alert">
      <div class="arb-alert-icon">⚡</div>
      <div class="arb-alert-text">
        <strong>${arbOpps.length} Arbitrage ${arbOpps.length === 1 ? 'Opportunity' : 'Opportunities'} Found</strong>
        <span>Scanning ${state.arbData.total_events || 0} matches across all bookmakers</span>
      </div>
    </div>

    ${arbOpps.length ? `
      <div class="section-header">
        <div class="section-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg>
          Arbitrage Opportunities
        </div>
        <span class="section-badge">${arbOpps.length} found</span>
      </div>
      ${arbOpps.map(o => arbCardHTML(o)).join('')}
    ` : ''}

    <div class="section-header" style="margin-top: var(--space-6)">
      <div class="section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        All Markets (by Margin)
      </div>
      <span class="section-badge blue">${nonArb.length} markets</span>
    </div>
    ${nonArb.slice(0, 15).map(o => arbCardHTML(o)).join('')}
  `;
}

function arbCardHTML(opp) {
  const isArb = opp.is_arbitrage;
  const outcomes = Object.entries(opp.best_odds || {});

  return `
    <div class="arb-card ${isArb ? 'is-arb' : ''}">
      <div class="arb-teams">${opp.home_team} vs ${opp.away_team}</div>
      <div class="arb-odds-grid">
        ${outcomes.map(([name, data]) => `
          <div class="arb-outcome">
            <div class="arb-outcome-name">${name}</div>
            <div class="arb-outcome-price">${fmt(data.price)}</div>
            <div class="arb-outcome-book">${data.bookmaker}</div>
          </div>
        `).join('')}
      </div>
      <div class="arb-footer">
        <div class="arb-margin">
          <span class="label">Margin: </span>
          <span class="value ${isArb ? 'profit' : 'loss'}">${isArb ? '-' : '+'}${Math.abs(opp.margin_percent).toFixed(2)}%</span>
          ${isArb ? `&nbsp;&nbsp;<span class="label">Profit: </span><span class="value profit">+${opp.profit_percent}%</span>` : ''}
        </div>
        ${isArb && opp.suggested_stakes ? `
          <div class="arb-stakes">
            Suggested on £1,000: ${Object.entries(opp.suggested_stakes).map(([k,v]) => `${k}: £${v.stake}`).join(' | ')}
          </div>` : ''}
      </div>
    </div>`;
}

// ============================================================
// RENDER: VALUE BETS
// ============================================================

function renderValue() {
  const container = document.getElementById('mainContent');
  if (!container) return;

  if (!state.oddsData) {
    container.innerHTML = loadingHTML();
    return;
  }

  const events = state.oddsData.events || [];
  const valueItems = computeValueBets(events);

  container.innerHTML = `
    ${state.oddsData.demo ? demoBannerHTML() : ''}
    <div class="section-header">
      <div class="section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        Value Bet Scanner
      </div>
      <span class="section-badge pink">${valueItems.length} value picks</span>
    </div>
    <div style="margin-bottom: var(--space-4); font-size: var(--text-sm); color: var(--text-muted); line-height: 1.6;">
      Value bets are identified where the best available odds imply a lower probability than our model estimates.
      Higher edge % = better value. Always bet responsibly.
    </div>
    ${valueItems.map((item, i) => valueCardHTML(item, i)).join('')}
  `;
}

function computeValueBets(events) {
  const items = [];
  for (const ev of events) {
    const best = getBestOdds(ev);
    if (!best) continue;

    const margin = (1/best.home + 1/best.draw + 1/best.away);
    const trueHome = (1/best.home) / margin;
    const trueDraw = (1/best.draw) / margin;
    const trueAway = (1/best.away) / margin;

    const fairHome = 1 / trueHome;
    const fairDraw = 1 / trueDraw;
    const fairAway = 1 / trueAway;

    const outcomes = [
      { name: ev.home_team, price: best.home, fair: fairHome, bm: best.homeBm },
      { name: 'Draw', price: best.draw, fair: fairDraw, bm: best.drawBm },
      { name: ev.away_team, price: best.away, fair: fairAway, bm: best.awayBm },
    ];

    for (const out of outcomes) {
      const edge = ((out.price / out.fair) - 1) * 100;
      if (edge > 1.5) {
        items.push({
          match: `${ev.home_team} vs ${ev.away_team}`,
          time: ev.commence_time,
          pick: out.name,
          price: out.price,
          fair: out.fair,
          edge,
          bm: out.bm,
        });
      }
    }
  }
  items.sort((a, b) => b.edge - a.edge);
  return items.slice(0, 20);
}

function valueCardHTML(item, i) {
  const isTop = i < 3;
  return `
    <div class="value-card">
      <div class="value-rank ${isTop ? 'top' : ''}">${i + 1}</div>
      <div class="value-info">
        <div class="value-match">${item.match}</div>
        <div class="value-detail">
          Pick: <strong>${item.pick}</strong> &nbsp;·&nbsp;
          Best odds: <strong style="color:var(--green)">${fmt(item.price)}</strong> @ ${item.bm} &nbsp;·&nbsp;
          Fair value: ${fmt(item.fair)}
        </div>
      </div>
      <div class="value-edge">
        <div class="value-pct">+${item.edge.toFixed(1)}%</div>
        <div class="value-pct-label">EDGE</div>
      </div>
    </div>`;
}

function findBestValue(events) {
  const items = computeValueBets(events);
  return items.length ? items[0] : null;
}

// ============================================================
// RENDER: TIPS & ADVISORY
// ============================================================

function renderTips() {
  const container = document.getElementById('mainContent');
  if (!container) return;

  const events = state.oddsData?.events || [];
  const tips = generateTips(events);

  container.innerHTML = `
    <div class="tips-intro">
      <div class="tips-intro-icon">📊</div>
      <h2>Expert Betting Advisory</h2>
      <p>Data-driven tips generated from live odds, market movements, and statistical models. Updated every 30 minutes.</p>
    </div>

    <div class="section-header">
      <div class="section-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        Today's Tips
      </div>
      <span class="section-badge gold">${tips.length} tips</span>
    </div>

    <div class="tips-grid">
      ${tips.map(tip => tipCardHTML(tip)).join('')}
    </div>

    <div class="disclaimer">
      ⚠️ These tips are generated algorithmically from market data and are for informational purposes only.
      Gambling involves risk. Please bet responsibly and within your means. 18+ only.
    </div>
  `;
}

function generateTips(events) {
  if (!events.length) return getDemoTips();

  const tips = [];
  const sorted = [...events].sort((a, b) => calcMargin(a) - calcMargin(b));

  for (const ev of sorted.slice(0, 6)) {
    const best = getBestOdds(ev);
    if (!best) continue;

    const margin = calcMargin(ev);
    const implied_home = 1 / best.home;
    const implied_draw = 1 / best.draw;
    const implied_away = 1 / best.away;

    let pick, pickOdds, pickBm, reasoning, confidence;

    if (best.home < 2.2 && best.home <= best.away && margin < 6) {
      pick = ev.home_team;
      pickOdds = best.home;
      pickBm = best.homeBm;
      confidence = best.home < 1.7 ? 5 : best.home < 2.0 ? 4 : 3;
      reasoning = `Strong home favourite with tight market (${margin.toFixed(1)}% margin). Best price available at ${pickBm}.`;
    } else if (best.away < best.home && best.away < 2.5) {
      pick = ev.away_team;
      pickOdds = best.away;
      pickBm = best.awayBm;
      confidence = best.away < 2.0 ? 4 : 3;
      reasoning = `Away side showing strong value. Market backing away win with tight spread.`;
    } else {
      pick = 'Draw';
      pickOdds = best.draw;
      pickBm = best.drawBm;
      confidence = 2;
      reasoning = `Evenly matched contest. Draw represents value with implied probability of ${(implied_draw * 100).toFixed(0)}%.`;
    }

    tips.push({
      match: `${ev.home_team} vs ${ev.away_team}`,
      time: ev.commence_time,
      pick,
      pickOdds,
      pickBm,
      confidence,
      reasoning,
      type: confidence >= 4 ? 'STRONG TIP' : confidence >= 3 ? 'VALUE TIP' : 'SPECULATIVE',
    });
  }

  return tips.length ? tips : getDemoTips();
}

function getDemoTips() {
  return [
    { match: 'Arsenal vs Chelsea', time: null, pick: 'Arsenal', pickOdds: 1.72, pickBm: 'Bet365', confidence: 4, type: 'STRONG TIP', reasoning: 'Arsenal\'s home record this season is exceptional. Market price reflects true probability.' },
    { match: 'Manchester City vs Liverpool', time: null, pick: 'Manchester City', pickOdds: 1.85, pickBm: 'Betfair', confidence: 4, type: 'STRONG TIP', reasoning: 'City\'s home dominance continues. Liverpool missing key midfielders.' },
    { match: 'Newcastle vs Aston Villa', time: null, pick: 'Draw', pickOdds: 3.20, pickBm: 'William Hill', confidence: 3, type: 'VALUE TIP', reasoning: 'Both sides evenly matched. Draw implied at 28.5% but model suggests 33%.' },
    { match: 'Brighton vs West Ham', time: null, pick: 'Brighton', pickOdds: 2.10, pickBm: 'Paddy Power', confidence: 3, type: 'VALUE TIP', reasoning: 'Brighton\'s xG model shows significant edge. West Ham struggling on the road.' },
    { match: 'Everton vs Wolves', time: null, pick: 'Under 2.5', pickOdds: 1.95, pickBm: 'Sky Bet', confidence: 2, type: 'SPECULATIVE', reasoning: 'Both teams averaging under 1.2 goals per game at home/away respectively.' },
    { match: 'Crystal Palace vs Fulham', time: null, pick: 'Fulham +1', pickOdds: 2.40, pickBm: 'Unibet', confidence: 2, type: 'SPECULATIVE', reasoning: 'Fulham\'s away form has been solid. Asian handicap offers value at current price.' },
  ];
}

function tipCardHTML(tip) {
  const confDots = Array.from({length: 5}, (_, i) =>
    `<span class="conf-dot ${i < tip.confidence ? 'filled' : ''}"></span>`
  ).join('');

  const typeColors = {
    'STRONG TIP': 'var(--grad-gold-orange)',
    'VALUE TIP': 'var(--grad-green-blue)',
    'SPECULATIVE': 'var(--grad-pink-purple)',
  };

  return `
    <div class="tip-card" style="--tip-color: ${typeColors[tip.type] || 'var(--grad-gold-orange)'}">
      <div class="tip-header">
        <div class="tip-confidence">${confDots}</div>
        <span class="tip-type-badge">${tip.type}</span>
      </div>
      <div class="tip-match">${tip.match}</div>
      <div class="tip-pick">Pick: <strong>${tip.pick}</strong></div>
      <div class="tip-odds-row">
        <div class="tip-odds-value">${fmt(tip.pickOdds)}</div>
        <div class="tip-odds-book">${tip.pickBm}</div>
      </div>
      <div class="tip-reasoning">${tip.reasoning}</div>
    </div>`;
}

// ============================================================
// RENDER: ALERTS / LEAD CAPTURE
// ============================================================

function renderAlerts() {
  const container = document.getElementById('mainContent');
  if (!container) return;

  container.innerHTML = `
    <div class="alerts-hero">
      <div class="alerts-hero-icon">🔔</div>
      <h2>Never Miss an Edge</h2>
      <p>Get instant alerts when arbitrage opportunities appear, odds shift significantly, or value bets emerge — delivered straight to your inbox or phone.</p>

      <div class="alerts-features">
        <div class="alert-feature-pill">⚡ Instant Arbitrage Alerts</div>
        <div class="alert-feature-pill">📈 Odds Movement Alerts</div>
        <div class="alert-feature-pill">💎 Value Bet Notifications</div>
        <div class="alert-feature-pill">📧 Email & SMS Delivery</div>
        <div class="alert-feature-pill">🆓 Free to Join</div>
      </div>
    </div>

    <div class="alert-form" id="alertFormWrapper">
      <h3>Get Free Alerts</h3>
      <div id="alertFormContent">
        <div class="form-group">
          <label class="form-label" for="alertName">Your Name</label>
          <input class="form-input" type="text" id="alertName" placeholder="Enter your name">
        </div>
        <div class="form-group">
          <label class="form-label" for="alertEmail">Email Address</label>
          <input class="form-input" type="email" id="alertEmail" placeholder="you@example.com">
        </div>
        <div class="form-group">
          <label class="form-label" for="alertPhone">Phone (optional, for SMS)</label>
          <input class="form-input" type="tel" id="alertPhone" placeholder="+44 7700 900000">
        </div>
        <div class="form-group">
          <label class="form-label" for="alertFreq">Alert Frequency</label>
          <select class="form-select" id="alertFreq">
            <option value="instant">Instant (real-time)</option>
            <option value="hourly">Hourly digest</option>
            <option value="daily">Daily summary</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Alert Types</label>
          <div class="form-checkbox-group">
            <label class="form-checkbox">
              <input type="checkbox" checked> <span>⚡ Arbitrage opportunities</span>
            </label>
            <label class="form-checkbox">
              <input type="checkbox" checked> <span>💎 High-value bets (edge > 5%)</span>
            </label>
            <label class="form-checkbox">
              <input type="checkbox"> <span>📈 Major odds movements (>10%)</span>
            </label>
            <label class="form-checkbox">
              <input type="checkbox"> <span>📊 Daily tips & advisory</span>
            </label>
          </div>
        </div>
        <button class="submit-btn" onclick="submitAlertForm()">🔔 Activate Free Alerts</button>
      </div>
      <div class="form-success" id="alertSuccess">
        <div class="form-success-icon">🎉</div>
        <h4>You're In!</h4>
        <p>We'll send your first alert within the next 30 minutes. Check your email to confirm your subscription.</p>
      </div>
    </div>

    <div class="alert-benefits">
      <div class="benefit-card">
        <div class="benefit-icon">⚡</div>
        <div class="benefit-title">Real-Time Alerts</div>
        <div class="benefit-desc">Arbitrage opportunities disappear within minutes. Our system monitors continuously and alerts you first.</div>
      </div>
      <div class="benefit-card">
        <div class="benefit-icon">🔒</div>
        <div class="benefit-title">No Spam, Ever</div>
        <div class="benefit-desc">We only send alerts when there's genuine value. Unsubscribe instantly at any time.</div>
      </div>
      <div class="benefit-card">
        <div class="benefit-icon">📱</div>
        <div class="benefit-title">Multi-Channel</div>
        <div class="benefit-desc">Receive alerts via email, SMS, or both. Customise frequency to match your betting schedule.</div>
      </div>
      <div class="benefit-card">
        <div class="benefit-icon">🆓</div>
        <div class="benefit-title">Always Free</div>
        <div class="benefit-desc">Core alerts are completely free. No credit card required. No hidden fees.</div>
      </div>
    </div>
  `;
}

function submitAlertForm() {
  const name = document.getElementById('alertName')?.value.trim();
  const email = document.getElementById('alertEmail')?.value.trim();

  if (!name) { alert('Please enter your name.'); return; }
  if (!email || !email.includes('@')) { alert('Please enter a valid email address.'); return; }

  // Hide form, show success
  document.getElementById('alertFormContent').style.display = 'none';
  document.getElementById('alertSuccess').style.display = 'block';

  // In production: POST to /api/subscribe or integrate with email service
  console.log('Alert signup:', { name, email });
}

// ============================================================
// SHARED HTML HELPERS
// ============================================================

function loadingHTML() {
  return `
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <div class="loading-text">Fetching live odds...</div>
    </div>`;
}

function demoBannerHTML() {
  return `
    <div class="demo-banner">
      <div class="demo-banner-text">
        <strong>Demo Mode</strong> — Using simulated data. Add your
        <a href="https://the-odds-api.com" target="_blank" style="color:var(--blue);text-decoration:underline">The Odds API</a>
        key as the <code style="background:var(--bg-surface);padding:1px 6px;border-radius:4px">ODDS_API_KEY</code> environment variable.
      </div>
      <a href="https://the-odds-api.com" target="_blank" class="demo-banner-link">Get Free API Key →</a>
    </div>`;
}

// ============================================================
// COUNTDOWN TIMER
// ============================================================

function startCountdown() {
  setInterval(() => {
    state.countdown--;
    if (state.countdown <= 0) {
      state.countdown = REFRESH_INTERVAL;
      loadData();
    }
    const el = document.getElementById('updateTimer');
    if (el) el.textContent = fmtCountdown(state.countdown);
  }, 1000);
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  startCountdown();
});
