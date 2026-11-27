#!/usr/bin/env python3
"""艾奧傑亞證券交易所：在 GitHub Actions 預先抓取 Universalis 資料，輸出 snapshot.json。
用法：python build_snapshot.py <上一份 snapshot.json> <輸出資料夾>
環境變數 SKIP_IF_FRESH=1：上一份已是這個半小時時段（00、30 分）產生的就跳過，不重複打 Universalis
（外部定時觸發與延誤的 GitHub 排程可能在同一時段各跑一次）。
輸出 snapshot.json（完整行情）與 meta.json（只有時間，讓網頁先用小檔判斷要不要下載完整行情）。
只用 Python 標準函式庫。"""
import json, os, re, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from collections import Counter

API = 'https://universalis.app/api'
DC = '陸行鳥'
WORLDS = {4028: '伊弗利特', 4029: '迦樓羅', 4030: '利維坦', 4031: '鳳凰', 4032: '奧汀', 4033: '巴哈姆特', 4035: '泰坦'}
CLOSED = {4034}  # 拉姆：已關閉
DAY = 86400
SLOT = 1800  # 更新週期：每 30 分鐘
PER_SECTOR = 30
EXT = 3
R = lambda a, b: list(range(a, b + 1))
SECTORS = {
    'food': [45], 'potion': [43],
    'material': [44, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 57, 58, 59],
    'furniture': [56, 65, 66, 67, 68, 69, 70, 71, 72, 81, 82],
    'gear': R(9, 29) + [31, 33, 35, 36, 37, 39, 40, 41, 42, 73, 76, 77, 78] + R(83, 89) + [91, 92],
}
CAT2SEC = {c: k for k, cs in SECTORS.items() for c in cs}
HERE = os.path.dirname(os.path.abspath(__file__))
UA = {'User-Agent': 'EorzeaStockExchange/1.0 (+https://seiran-ilai.github.io/eorzea-stock-exchange/)'}
DCQ = urllib.parse.quote(DC)
calls = 0


def get(url):
    global calls
    for i in range(5):
        try:
            calls += 1
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
                return json.load(r)
        except Exception as e:
            code = getattr(e, 'code', None)
            if code == 404:
                return None
            time.sleep(2 * (i + 1))
    print('FAILED', url[:120], file=sys.stderr)
    return None


def pmap(fn, xs, workers=4):
    with ThreadPoolExecutor(workers) as ex:
        return list(ex.map(fn, xs))


def chunks(a, n):
    return [a[i:i + n] for i in range(0, len(a), n)]


def items_of(d):
    if not d:
        return {}
    if 'items' in d:
        return d['items']
    if 'itemID' in d:
        return {str(d['itemID']): d}
    return {}


def wmedian(es):
    if not es:
        return None
    a = sorted(es, key=lambda x: x['p'])
    tot = sum(x['q'] for x in a)
    c = 0
    for x in a:
        c += x['q']
        if c >= tot / 2:
            return x['p']
    return a[-1]['p']


def clean(es):
    """排除極端成交：與前後各 10 筆同品質成交的加權中位數相差 3 倍以上。"""
    out, removed = [], 0
    for q in (False, True):
        g = sorted((x for x in es if x['hq'] == q), key=lambda x: x['t'])
        if len(g) < 5:
            out += g
            continue
        for i, x in enumerate(g):
            m = wmedian(g[max(0, i - 10):i + 11])
            if m and (x['p'] > m * EXT or x['p'] < m / EXT):
                removed += 1
            else:
                out.append(x)
    return out, removed


def load_items():
    src = open(os.path.join(HERE, 'js', 'items.js'), encoding='utf-8').read()
    m = re.search(r'ITEMS_TSV=`(.*?)`', src, re.S)
    items = {}
    for line in m.group(1).strip().split('\n'):
        f = line.split('\t')
        items[int(f[0])] = {'cat': int(f[3]), 'sec': CAT2SEC.get(int(f[3]))}
    return items


def main():
    prev_path, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    now = int(time.time())
    items = load_items()
    try:
        prev = json.load(open(prev_path, encoding='utf-8'))
    except Exception:
        prev = {}
    if os.environ.get('SKIP_IF_FRESH') == '1' and prev.get('t', 0) // 1000 // SLOT == now // SLOT:
        print('這個時段已經更新過，跳過')
        return

    # 1. 成分股：24 小時內沿用上一份，否則重新掃描
    cons = prev.get('cons')
    if not cons or now * 1000 - cons.get('t', 0) > 24 * 3600 * 1000:
        ids = [i for i, it in items.items() if it['sec']]
        score = {}

        def scan(c):
            d = get(f"{API}/v2/aggregated/{DCQ}/{','.join(map(str, c))}")
            for r in (d or {}).get('results', []):
                t = 0
                for q in ('nq', 'hq'):
                    v = (((r.get(q) or {}).get('dailySaleVelocity') or {}).get('dc') or {}).get('quantity') or 0
                    p = (((r.get(q) or {}).get('averageSalePrice') or {}).get('dc') or {}).get('price') or 0
                    t += v * p
                score[r['itemId']] = t
        pmap(scan, chunks(ids, 100))
        sectors = {k: sorted([i for i in ids if items[i]['sec'] == k and score.get(i, 0) > 0], key=lambda i: -score[i])[:PER_SECTOR] for k in SECTORS}
        cons = {'t': now * 1000, 'sectors': sectors}
        print('成分股重新掃描', {k: len(v) for k, v in sectors.items()})
    all_ids = sorted({i for v in cons['sectors'].values() for i in v})

    # 2. 成分股近 8 天成交（DC 範圍）
    buyers, bidx = [], {}
    hist = {}

    def fetch_hist(c):
        d = get(f"{API}/v2/history/{DCQ}/{','.join(map(str, c))}?entriesToReturn=999&entriesWithin={8 * DAY}")
        its = items_of(d)
        res = {}
        for i in c:
            raw = (its.get(str(i)) or {}).get('entries') or []
            es = [{'t': x['timestamp'], 'p': x['pricePerUnit'], 'q': x['quantity'], 'hq': bool(x.get('hq')), 'w': x.get('worldID'), 'b': x.get('buyerName') or ''}
                  for x in raw if x.get('worldID') not in CLOSED]
            res[i] = (len(raw), es)
        return res
    for part in pmap(fetch_hist, chunks(all_ids, 10)):
        for i, (raw_n, es) in part.items():
            cl, removed = clean(es)
            rows = []
            for x in sorted(cl, key=lambda x: x['t']):
                b = x['b']
                if b not in bidx:
                    bidx[b] = len(buyers)
                    buyers.append(b)
                rows.append([now - x['t'], x['p'], x['q'], 1 if x['hq'] else 0, x['w'], bidx[b]])
            hist[i] = {'raw': raw_n, 'removed': removed, 'e': rows}

    # 3. 稅率（各伺服器最常見的城市稅率）
    tax = {}

    def fetch_tax(w):
        d = get(f"{API}/tax-rates?world={urllib.parse.quote(WORLDS[w])}") or {}
        vals = list(d.values())
        if vals:
            tax[w] = sorted(Counter(vals).items(), key=lambda kv: (-kv[1], -kv[0]))[0][0]
    pmap(fetch_tax, list(WORLDS))

    # 4. 各伺服器最近上傳時間
    upload = {}
    for c in chunks(all_ids, 100):
        d = get(f"{API}/v2/aggregated/{DCQ}/{','.join(map(str, c))}") or {}
        for r in d.get('results', []):
            for u in r.get('worldUploadTimes') or []:
                upload[u['worldId']] = max(upload.get(u['worldId'], 0), u['timestamp'])

    # 5. 最新成交跑馬燈
    ticker = []
    rec = get(f"{API}/v2/extra/stats/most-recently-updated?dcName={DCQ}&entries=60") or {}
    tids = list(dict.fromkeys(x['itemID'] for x in rec.get('items', []) if x['itemID'] in items))[:60]
    if tids:
        d = get(f"{API}/v2/{DCQ}/{','.join(map(str, tids))}?listings=0&entries=5")
        for it in items_of(d).values():
            avg = it.get('averagePrice') or 0
            for h in it.get('recentHistory') or []:
                if h.get('worldID') in CLOSED:
                    continue
                p = h['pricePerUnit']
                if avg and (p > avg * EXT or p < avg / EXT):
                    continue
                ticker.append({'id': it['itemID'], 'p': p, 'q': h['quantity'], 'hq': bool(h.get('hq')), 't': h['timestamp'], 'w': h.get('worldID'), 'avg': avg})
        ticker.sort(key=lambda x: -x['t'])
        ticker = ticker[:80]

    snap = {'v': 1, 't': now * 1000, 'now': now, 'cons': cons, 'tax': tax, 'upload': upload, 'buyers': buyers, 'hist': hist, 'ticker': ticker}
    path = os.path.join(out_dir, 'snapshot.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(snap, f, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(out_dir, 'meta.json'), 'w', encoding='utf-8') as f:
        json.dump({'v': 1, 't': snap['t']}, f, separators=(',', ':'))
    print(f'完成：{len(hist)} 檔、{sum(len(h["e"]) for h in hist.values())} 筆成交、{calls} 次請求、{os.path.getsize(path) / 1e6:.2f} MB')


if __name__ == '__main__':
    main()
