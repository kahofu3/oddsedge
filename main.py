#!/usr/bin/env python3
"""OddsEdge — Multi-League Betting Intelligence
Single-service deployment: FastAPI backend + static frontend served together.
Designed for Render free tier."""

import os
import time
import json
import httpx
from pathlib import Path
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager

# --- Config ---
ODDS_API_KEY = os.environ.get("ODDS_API_KEY", "")
ODDS_API_BASE = "https://api.the-odds-api.com/v4"
CACHE_TTL = int(os.environ.get("CACHE_TTL", "1800"))  # default 30 min

# --- Supported Leagues ---
LEAGUES = {
    "soccer_epl": "English Premier League",
    "soccer_spain_la_liga": "La Liga",
    "soccer_germany_bundesliga": "Bundesliga",
    "soccer_italy_serie_a": "Serie A",
    "soccer_france_ligue_one": "Ligue 1",
    "soccer_epl_cup": "FA Cup",
    "soccer_uefa_champs_league": "Champions League",
}

# --- Cache ---
cache = {}

def get_cached(key):
    if key in cache:
        entry = cache[key]
        if time.time() - entry["ts"] < CACHE_TTL:
            return entry["data"]
    return None

def set_cached(key, data):
    cache[key] = {"data": data, "ts": time.time()}

# --- Demo data ---
DEMO_MATCHES = {
    "soccer_epl": [
        ("Arsenal", "Chelsea"), ("Manchester City", "Liverpool"),
        ("Manchester United", "Tottenham Hotspur"), ("Newcastle United", "Aston Villa"),
        ("Brighton", "West Ham United"), ("Everton", "Wolverhampton"),
        ("Crystal Palace", "Fulham"), ("Brentford", "Nottingham Forest"),
        ("Bournemouth", "Leicester City"), ("Ipswich Town", "Southampton"),
    ],
    "soccer_spain_la_liga": [
        ("Real Madrid", "FC Barcelona"), ("Atletico Madrid", "Sevilla"),
        ("Valencia", "Athletic Bilbao"), ("Real Sociedad", "Villarreal"),
        ("Betis", "Celta Vigo"), ("Getafe", "Osasuna"),
        ("Espanyol", "Cadiz"), ("Rayo Vallecano", "Alaves"),
    ],
    "soccer_germany_bundesliga": [
        ("Bayern Munich", "Borussia Dortmund"), ("RB Leipzig", "Bayer Leverkusen"),
        ("Borussia Monchengladbach", "Wolfsburg"), ("Eintracht Frankfurt", "Freiburg"),
        ("Hoffenheim", "Mainz"), ("Stuttgart", "Augsburg"),
        ("Hertha BSC", "Bochum"), ("Cologne", "Union Berlin"),
    ],
    "soccer_italy_serie_a": [
        ("Juventus", "Inter Milan"), ("AC Milan", "Napoli"),
        ("Roma", "Lazio"), ("Atalanta", "Fiorentina"),
        ("Torino", "Sassuolo"), ("Sampdoria", "Udinese"),
        ("Bologna", "Verona"), ("Lecce", "Cremonese"),
    ],
    "soccer_france_ligue_one": [
        ("Paris Saint-Germain", "Olympique Marseille"), ("Lyon", "Monaco"),
        ("Lille", "Rennes"), ("Nice", "Lens"),
        ("Strasbourg", "Nantes"), ("Montpellier", "Reims"),
        ("Brest", "Lorient"), ("Clermont", "Auxerre"),
    ],
    "soccer_epl_cup": [
        ("Arsenal", "Manchester City"), ("Chelsea", "Liverpool"),
        ("Manchester United", "Newcastle United"), ("Tottenham", "Brighton"),
        ("Aston Villa", "Brentford"), ("West Ham", "Crystal Palace"),
    ],
    "soccer_uefa_champs_league": [
        ("Real Madrid", "Bayern Munich"), ("Manchester City", "Paris Saint-Germain"),
        ("Barcelona", "Juventus"), ("Chelsea", "Atletico Madrid"),
        ("Liverpool", "AC Milan"), ("Borussia Dortmund", "Inter Milan"),
        ("Ajax", "Benfica"), ("Porto", "Shakhtar Donetsk"),
    ],
}

def generate_demo_data(sport_key="soccer_epl"):
    import random
    random.seed(int(time.time()) // 600)

    league_name = LEAGUES.get(sport_key, "Football")
    matches = DEMO_MATCHES.get(sport_key, DEMO_MATCHES["soccer_epl"])

    bookmakers_pool = [
        ("bet365", "Bet365"), ("williamhill", "William Hill"),
        ("paddypower", "Paddy Power"), ("betfair_sb_uk", "Betfair Sportsbook"),
        ("ladbrokes_uk", "Ladbrokes"), ("unibet_uk", "Unibet"),
        ("betvictor", "Bet Victor"), ("skybet", "Sky Bet"),
        ("sport888", "888sport"), ("coral", "Coral"),
        ("betway", "Betway"), ("boylesports", "BoyleSports"),
        ("pinnacle", "Pinnacle"), ("onexbet", "1xBet"),
        ("draftkings", "DraftKings"), ("fanduel", "FanDuel"),
        ("betmgm", "BetMGM"), ("sportsbet", "SportsBet"),
        ("tab", "TAB"), ("neds", "Neds"),
    ]

    events = []
    base_time = time.time() + 86400

    for i, (home, away) in enumerate(matches):
        commence = base_time + i * 7200
        base_home = round(random.uniform(1.5, 4.0), 2)
        base_draw = round(random.uniform(2.8, 4.2), 2)
        base_away = round(random.uniform(1.8, 5.5), 2)

        num_books = random.randint(10, min(15, len(bookmakers_pool)))
        selected = random.sample(bookmakers_pool, num_books)

        bookmakers = []
        for bkey, btitle in selected:
            var = lambda b: round(b + random.uniform(-0.3, 0.3), 2)
            h_price = max(1.05, var(base_home))
            d_price = max(1.05, var(base_draw))
            a_price = max(1.05, var(base_away))

            bookmakers.append({
                "key": bkey, "title": btitle,
                "last_update": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "markets": [{"key": "h2h", "last_update": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "outcomes": [
                        {"name": home, "price": h_price},
                        {"name": "Draw", "price": d_price},
                        {"name": away, "price": a_price},
                    ]}]
            })

        events.append({
            "id": f"demo_{i}", "sport_key": sport_key, "sport_title": league_name,
            "commence_time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(commence)),
            "home_team": home, "away_team": away, "bookmakers": bookmakers,
        })

    return events


@asynccontextmanager
async def lifespan(app):
    yield

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/odds")
async def get_odds(
    regions: str = Query("uk,eu,us,au"),
    markets: str = Query("h2h"),
    sport: str = Query("soccer_epl"),
):
    # Validate sport key
    if sport not in LEAGUES:
        sport = "soccer_epl"
    cache_key = f"odds:{sport}:{regions}:{markets}"
    cached = get_cached(cache_key)
    if cached:
        return cached

    if not ODDS_API_KEY:
        data = generate_demo_data(sport)
        result = {"events": data, "demo": True, "remaining_credits": "N/A (demo)", "sport": sport, "league_name": LEAGUES[sport]}
        set_cached(cache_key, result)
        return result

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{ODDS_API_BASE}/sports/{sport}/odds",
                params={"apiKey": ODDS_API_KEY, "regions": regions, "markets": markets,
                        "oddsFormat": "decimal", "dateFormat": "iso"})

        if resp.status_code == 401:
            raise HTTPException(status_code=401, detail="Invalid API key")
        if resp.status_code == 429:
            raise HTTPException(status_code=429, detail="Rate limited")
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)

        data = resp.json()
        remaining = resp.headers.get("x-requests-remaining", "?")
        result = {"events": data, "demo": False, "remaining_credits": remaining, "sport": sport, "league_name": LEAGUES[sport]}
        set_cached(cache_key, result)
        return result
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/arbitrage")
async def get_arbitrage(
    sport: str = Query("soccer_epl"),
):
    if sport not in LEAGUES:
        sport = "soccer_epl"
    cache_key = f"odds:{sport}:uk,eu,us,au:h2h"
    cached = get_cached(cache_key)
    if not cached:
        cached = await get_odds(sport=sport)

    events = cached.get("events", [])
    opportunities = []

    for event in events:
        if not event.get("bookmakers"):
            continue

        best = {}
        for bm in event["bookmakers"]:
            for market in bm.get("markets", []):
                if market["key"] != "h2h":
                    continue
                for outcome in market.get("outcomes", []):
                    name = outcome["name"]
                    price = outcome["price"]
                    if name not in best or price > best[name][0]:
                        best[name] = (price, bm["title"])

        if len(best) < 3:
            continue

        total_implied = sum(1.0 / v[0] for v in best.values())
        margin = (total_implied - 1.0) * 100

        opp = {
            "event_id": event["id"], "home_team": event["home_team"],
            "away_team": event["away_team"], "commence_time": event["commence_time"],
            "best_odds": {k: {"price": v[0], "bookmaker": v[1]} for k, v in best.items()},
            "total_implied_probability": round(total_implied, 4),
            "margin_percent": round(margin, 2),
            "is_arbitrage": total_implied < 1.0,
        }

        if total_implied < 1.0:
            opp["profit_percent"] = round((1.0 / total_implied - 1.0) * 100, 2)
            stake_total = 1000
            stakes = {}
            for name, (price, bm) in best.items():
                stake = round(stake_total / (price * total_implied), 2)
                stakes[name] = {"stake": stake, "potential_return": round(stake * price, 2), "bookmaker": bm}
            opp["suggested_stakes"] = stakes

        opportunities.append(opp)

    opportunities.sort(key=lambda x: (not x["is_arbitrage"], x["margin_percent"]))

    return {
        "opportunities": opportunities,
        "total_events": len(events),
        "arbitrage_count": sum(1 for o in opportunities if o["is_arbitrage"]),
        "demo": cached.get("demo", False),
        "sport": sport,
        "league_name": LEAGUES[sport],
    }


@app.get("/api/leagues")
async def get_leagues():
    return {"leagues": LEAGUES}

@app.get("/api/health")
async def health():
    return {"status": "ok", "has_api_key": bool(ODDS_API_KEY)}


# Serve static files (frontend)
STATIC_DIR = Path(__file__).parent / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    @app.get("/")
    async def serve_index():
        return FileResponse(str(STATIC_DIR / "index.html"))

    @app.get("/{path:path}")
    async def serve_static(path: str):
        file_path = STATIC_DIR / path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(STATIC_DIR / "index.html"))


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
