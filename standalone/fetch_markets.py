#!/usr/bin/env python3
"""Fetch market data from Yahoo Finance and save as JSON for the dashboard."""
import json, time, urllib.request, urllib.parse, os, sys

TICKERS = {
    'indices': ['^GSPC', '^IXIC', '^DJI', '^RUT'],
    'rates': ['^TNX', '^IRX', '^TYX'],
    'fx': ['DX-Y.NYB', 'EURUSD=X', 'JPY=X', 'GBPUSD=X'],
    'commodities': ['GC=F', 'SI=F', 'CL=F', 'HG=F', 'URA'],
    'crypto': ['BTC-USD', 'ETH-USD', 'SOL-USD'],
    'airlines': ['DAL', 'AAL', 'LUV', 'ALK', 'JBLU', 'UAL'],
    'watchlist': ['URA', 'COPX', 'GRID', 'IAU']
}

ALL_SYMS = []
seen = set()
for group in TICKERS.values():
    for s in group:
        if s not in seen:
            ALL_SYMS.append(s)
            seen.add(s)

def fetch_yahoo(sym):
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?interval=1d&range=2d'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        result = data['chart']['result'][0]
        meta = result['meta']
        price = meta.get('regularMarketPrice') or meta.get('previousClose')
        prev = meta.get('chartPreviousClose') or meta.get('previousClose')
        change = round(price - prev, 4) if price and prev else None
        pct = round((change / prev) * 100, 4) if change and prev else None
        return {'price': price, 'change': change, 'changePct': pct, 'ok': True, 'name': meta.get('shortName', sym)}
    except Exception as e:
        return {'price': None, 'change': None, 'changePct': None, 'ok': False, 'error': str(e)}

if __name__ == '__main__':
    out = {'ts': int(time.time() * 1000), 'data': {}}
    for sym in ALL_SYMS:
        out['data'][sym] = fetch_yahoo(sym)
        time.sleep(0.1)  # be gentle
    
    dest = '/opt/homebrew/lib/node_modules/openclaw/dist/control-ui/assets/markets.json'
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, 'w') as f:
        json.dump(out, f)
    print(f"✅ Wrote {len(out['data'])} tickers to {dest}")
    print(f"   Updated: {time.strftime('%Y-%m-%d %H:%M:%S')}")
