#!/usr/bin/env python3
"""Fetch market data from Yahoo Finance with Day/MTD/YTD changes for the Goddard dashboard."""
import json, time, urllib.request, urllib.parse, os, sys
from datetime import datetime, timezone

TICKERS = [
    # Indices
    {"sym": "^GSPC", "name": "S&P 500", "group": "indices"},
    {"sym": "^IXIC", "name": "Nasdaq", "group": "indices"},
    {"sym": "^DJI", "name": "Dow Jones", "group": "indices"},
    {"sym": "^RUT", "name": "Russell 2000", "group": "indices"},
    {"sym": "^VIX", "name": "VIX", "group": "indices"},
    # Rates
    {"sym": "^TNX", "name": "10Y Yield", "group": "rates", "format": "yield"},
    {"sym": "^IRX", "name": "3M T-Bill", "group": "rates", "format": "yield"},
    {"sym": "^TYX", "name": "30Y Yield", "group": "rates", "format": "yield"},
    {"sym": "^FVX", "name": "5Y Yield", "group": "rates", "format": "yield"},
    # FX
    {"sym": "DX-Y.NYB", "name": "DXY", "group": "fx"},
    {"sym": "EURUSD=X", "name": "EUR/USD", "group": "fx"},
    {"sym": "JPY=X", "name": "USD/JPY", "group": "fx"},
    {"sym": "GBPUSD=X", "name": "GBP/USD", "group": "fx"},
    # Commodities
    {"sym": "GC=F", "name": "Gold", "group": "commodities"},
    {"sym": "SI=F", "name": "Silver", "group": "commodities"},
    {"sym": "CL=F", "name": "Crude Oil (WTI)", "group": "commodities"},
    {"sym": "HG=F", "name": "Copper", "group": "commodities"},
    # Crypto
    {"sym": "BTC-USD", "name": "Bitcoin", "group": "crypto"},
    {"sym": "ETH-USD", "name": "Ethereum", "group": "crypto"},
    {"sym": "SOL-USD", "name": "Solana", "group": "crypto"},
    # Airlines
    {"sym": "DAL", "name": "Delta", "group": "airlines"},
    {"sym": "UAL", "name": "United", "group": "airlines"},
    {"sym": "AAL", "name": "American", "group": "airlines"},
    {"sym": "LUV", "name": "Southwest", "group": "airlines"},
    {"sym": "ALK", "name": "Alaska", "group": "airlines"},
    {"sym": "JBLU", "name": "JetBlue", "group": "airlines"},
    {"sym": "ALGT", "name": "Allegiant", "group": "airlines"},
    {"sym": "ULCC", "name": "Frontier", "group": "airlines"},
    {"sym": "SKYW", "name": "SkyWest", "group": "airlines"},
    {"sym": "AL", "name": "Air Lease", "group": "airlines"},
    {"sym": "AER", "name": "AerCap", "group": "airlines"},
    {"sym": "TDG", "name": "TransDigm", "group": "airlines"},
    # Watchlist
    {"sym": "URA", "name": "Uranium ETF", "group": "watchlist"},
    {"sym": "COPX", "name": "Copper Miners", "group": "watchlist"},
    {"sym": "GRID", "name": "Grid Infra", "group": "watchlist"},
    {"sym": "IAU", "name": "Gold ETF", "group": "watchlist"},
]

def fetch_yahoo(sym, range_str="ytd", interval="1d"):
    """Fetch Yahoo Finance chart data."""
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?interval={interval}&range={range_str}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except Exception as e:
        return None

def calc_changes(sym):
    """Calculate day, MTD, and YTD price changes."""
    data = fetch_yahoo(sym, range_str="ytd", interval="1d")
    if not data:
        return None
    
    result = data.get('chart', {}).get('result', [None])[0]
    if not result:
        return None
    
    meta = result.get('meta', {})
    timestamps = result.get('timestamp', [])
    quotes = result.get('indicators', {}).get('quote', [{}])[0]
    closes = quotes.get('close', [])
    opens = quotes.get('open', [])
    highs = quotes.get('high', [])
    lows = quotes.get('low', [])
    volumes = quotes.get('volume', [])
    
    price = meta.get('regularMarketPrice') or meta.get('previousClose')
    prev_close = meta.get('chartPreviousClose') or meta.get('previousClose')
    
    if not price:
        return None
    
    # Day change
    day_chg = None
    day_pct = None
    if prev_close and prev_close != 0:
        day_chg = round(price - prev_close, 4)
        day_pct = round((day_chg / prev_close) * 100, 2)
    
    # Find MTD start (first trading day of current month)
    now = datetime.now()
    mtd_price = None
    ytd_price = None
    
    if timestamps and closes:
        for i, ts in enumerate(timestamps):
            if closes[i] is None:
                continue
            dt = datetime.fromtimestamp(ts)
            # YTD: first close of the year
            if ytd_price is None and dt.year == now.year:
                ytd_price = closes[i]
            # MTD: first close of current month
            if mtd_price is None and dt.year == now.year and dt.month == now.month:
                mtd_price = closes[i]
    
    mtd_pct = None
    if mtd_price and mtd_price != 0:
        mtd_pct = round(((price - mtd_price) / mtd_price) * 100, 2)
    
    ytd_pct = None
    if ytd_price and ytd_price != 0:
        ytd_pct = round(((price - ytd_price) / ytd_price) * 100, 2)
    
    # Today's range
    today_high = None
    today_low = None
    today_open = None
    today_vol = None
    if timestamps and len(timestamps) > 0:
        # Last entry is today
        idx = len(timestamps) - 1
        if idx >= 0:
            today_high = highs[idx] if idx < len(highs) else None
            today_low = lows[idx] if idx < len(lows) else None
            today_open = opens[idx] if idx < len(opens) else None
            today_vol = volumes[idx] if idx < len(volumes) else None
    
    # Also use meta for more reliable intraday data
    today_high = meta.get('regularMarketDayHigh', today_high)
    today_low = meta.get('regularMarketDayLow', today_low)
    today_vol = meta.get('regularMarketVolume', today_vol)
    
    return {
        "price": price,
        "prevClose": prev_close,
        "dayChg": day_chg,
        "dayPct": day_pct,
        "mtdPct": mtd_pct,
        "ytdPct": ytd_pct,
        "high": today_high,
        "low": today_low,
        "open": today_open,
        "volume": today_vol,
        "currency": meta.get('currency', 'USD'),
        "exchange": meta.get('exchangeName', ''),
        "shortName": meta.get('shortName', ''),
        "ok": True
    }

if __name__ == '__main__':
    out = {
        "ts": int(time.time() * 1000),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "tickers": {},
        "groups": {}
    }
    
    # Build group index
    for t in TICKERS:
        g = t["group"]
        if g not in out["groups"]:
            out["groups"][g] = []
        out["groups"][g].append(t["sym"])
    
    seen = set()
    total = len(TICKERS)
    for i, t in enumerate(TICKERS):
        sym = t["sym"]
        if sym in seen:
            continue
        seen.add(sym)
        
        print(f"  [{i+1}/{total}] {sym}...", end=" ", flush=True)
        result = calc_changes(sym)
        if result:
            result["name"] = t["name"]
            result["group"] = t["group"]
            result["format"] = t.get("format", "price")
            out["tickers"][sym] = result
            print(f"${result['price']:.2f} ({result['dayPct']:+.2f}%)" if result['price'] else "no price")
        else:
            out["tickers"][sym] = {
                "name": t["name"], "group": t["group"],
                "format": t.get("format", "price"),
                "price": None, "ok": False
            }
            print("FAILED")
        time.sleep(0.15)
    
    dest = '/opt/homebrew/lib/node_modules/openclaw/dist/control-ui/assets/markets.json'
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, 'w') as f:
        json.dump(out, f)
    
    ok_count = sum(1 for v in out["tickers"].values() if v.get("ok"))
    print(f"\n✅ Wrote {ok_count}/{len(out['tickers'])} tickers to {dest}")
