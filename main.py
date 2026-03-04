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
