# OddsEdge — Premier League Odds Comparison

Live odds comparison dashboard for English Premier League, aggregating odds from 50+ bookmakers worldwide with arbitrage detection.

## Features
- Real-time odds from 50+ bookmakers (UK, EU, US, AU)
- Automatic arbitrage opportunity detection
- Value bet scanner
- Live ticker and flashing price updates

## Setup

### 1. Get a free API key
Sign up at [the-odds-api.com](https://the-odds-api.com) — free tier gives 500 credits/month.

### 2. Deploy to Render (free)
1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your GitHub repo
4. Add environment variable: `ODDS_API_KEY` = your key
5. Deploy

### 3. Run locally
```bash
pip install -r requirements.txt
ODDS_API_KEY=your_key_here python main.py
```
Open http://localhost:8000

## Tech Stack
- **Backend:** FastAPI + httpx
- **Frontend:** Vanilla JS, CSS custom properties
- **Data:** The Odds API (50+ bookmakers, 70+ sports)
