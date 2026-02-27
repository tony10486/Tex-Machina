import requests
import json
import re
import argparse
import time
import sys
from datetime import datetime

# 기본 카테고리 (Q461293: 수학 공식, Q11345: 방정식, Q416447: 항등식, Q11012: 정리, Q192388: 정리(수학), Q4583161: 물리 법칙)
DEFAULT_CATEGORIES = ["Q461293", "Q11345", "Q416447", "Q11012", "Q192388", "Q4583161"]

def get_total_count(categories):
    """
    하위 계층(Subclasses)을 포함하여 조건에 맞는 전체 데이터 개수를 조회합니다.
    """
    url = 'https://query.wikidata.org/sparql'
    category_values = " ".join([f"wd:{c}" for c in categories])
    
    # P31/P279* 를 사용하여 하위 클래스의 인스턴스까지 모두 포함
    query = f"""
    SELECT (COUNT(DISTINCT ?item) AS ?count) WHERE {{
      VALUES ?types {{ {category_values} }}
      ?item wdt:P31/wdt:P279* ?types.
      ?item wdt:P2534 ?formula.
      
      SERVICE wikibase:label {{ 
        bd:serviceParam wikibase:language "ko,en". 
        ?item rdfs:label ?itemLabel.
      }}
      FILTER(!regex(?itemLabel, "^Q\\\\d+$"))
    }}
    """
    
    headers = {
        'User-Agent': 'MathFormulaScraper/1.0 (contact: user@example.com)',
        'Accept': 'application/sparql-results+json'
    }

    try:
        response = requests.get(url, params={'query': query, 'format': 'json'}, headers=headers, timeout=60)
        response.raise_for_status()
        count = response.json()['results']['bindings'][0]['count']['value']
        return int(count)
    except Exception as e:
        print(f"Error fetching count: {e}")
        return 0

def get_formula_qids(categories, limit=150, lang='ko'):
    """
    하위 계층을 포함하여 공식 QID와 위키백과 링크를 가져옵니다.
    """
    url = 'https://query.wikidata.org/sparql'
    category_values = " ".join([f"wd:{c}" for c in categories])
    
    query = f"""
    SELECT DISTINCT ?item ?itemLabel ?itemDescription ?categoryLabel ?koTitle ?enTitle WHERE {{
      VALUES ?types {{ {category_values} }}
      ?item wdt:P31/wdt:P279* ?types.
      ?item wdt:P2534 ?formula.
      
      OPTIONAL {{ 
        ?koArticle schema:about ?item; 
                   schema:isPartOf <https://ko.wikipedia.org/>; 
                   schema:name ?koTitle. 
      }}
      OPTIONAL {{ 
        ?enArticle schema:about ?item; 
                   schema:isPartOf <https://en.wikipedia.org/>; 
                   schema:name ?enTitle. 
      }}

      SERVICE wikibase:label {{ 
        bd:serviceParam wikibase:language "{lang},en". 
        ?item rdfs:label ?itemLabel.
        ?item schema:description ?itemDescription.
        ?categoryLabel_item rdfs:label ?categoryLabel. # 실제 카테고리 레이블
        BIND(?types AS ?categoryLabel_item)
      }}
      
      FILTER(!regex(?itemLabel, "^Q\\\\d+$"))
    }}
    LIMIT {limit}
    """
    
    headers = {
        'User-Agent': 'MathFormulaScraper/1.0 (contact: user@example.com)',
        'Accept': 'application/sparql-results+json'
    }

    try:
        response = requests.get(url, params={'query': query, 'format': 'json'}, headers=headers, timeout=90)
        response.raise_for_status()
        return response.json()['results']['bindings']
    except Exception as e:
        print(f"Error fetching QIDs: {e}")
        return []

def fetch_wikipedia_summary(title, lang='ko'):
    if not title: return None
    url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{title}"
    headers = {'User-Agent': 'MathFormulaScraper/1.0'}
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            return resp.json().get('extract')
    except: pass
    return None

def fetch_raw_latex(qids):
    if not qids: return {}
    url = "https://www.wikidata.org/w/api.php"
    headers = {'User-Agent': 'MathFormulaScraper/1.0'}
    results = {}
    for i in range(0, len(qids), 50):
        batch = qids[i:i+50]
        params = {"action": "wbgetentities", "ids": "|".join(batch), "format": "json", "props": "claims"}
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=30)
            data = resp.json().get('entities', {})
            for qid, entity in data.items():
                claims = entity.get('claims', {}).get('P2534', [])
                if claims:
                    latex = claims[0].get('mainsnak', {}).get('datavalue', {}).get('value', '')
                    if latex: results[qid] = latex
        except Exception as e: print(f"Error fetching batch {i}: {e}")
    return results

def is_meaningless_data(name, description):
    blacklist = ['prime number', '소수', 'natural number', '자연수', 'integer', '정수', 'large prime']
    text = f"{name} {description}".lower()
    for word in blacklist:
        if word in text: return True
    if re.search(r'\d+[·.]2\^', name): return True
    return False

def main():
    parser = argparse.ArgumentParser(description="Wikidata Math Formula Scraper")
    parser.add_argument("--count", action="store_true", help="Show total count of available items and exit")
    parser.add_argument("--limit", type=int, default=150, help="Max number of items to fetch (default: 150)")
    parser.add_argument("--output", type=str, default="math_formulas.json", help="Output file path (default: math_formulas.json)")
    parser.add_argument("--lang", type=str, default="ko", help="Preferred language (default: ko)")
    parser.add_argument("--categories", nargs="+", default=DEFAULT_CATEGORIES, help="Wikidata QIDs for categories")
    parser.add_argument("--no-filter", action="store_true", help="Disable 'meaningless data' (primes, etc.) filter")
    parser.add_argument("--min-latex", type=int, default=5, help="Minimum LaTeX string length (default: 5)")
    
    args = parser.parse_args()

    if args.count:
        print(f"[*] Querying total count (including subclasses) for categories...")
        total = get_total_count(args.categories)
        print(f"[+] Total available items in Wikidata: {total}")
        return

    print(f"[*] Starting scraper with limit={args.limit}, lang={args.lang}, filter={'OFF' if args.no_filter else 'ON'}")
    
    qid_data = get_formula_qids(args.categories, args.limit, args.lang)
    if not qid_data:
        print("[!] No data found.")
        return

    valid_items = []
    qids_to_fetch = []
    for b in qid_data:
        name = b.get('itemLabel', {}).get('value', '')
        desc = b.get('itemDescription', {}).get('value', '')
        if not args.no_filter and is_meaningless_data(name, desc): continue
        qid = b['item']['value'].split('/')[-1]
        valid_items.append({
            'qid': qid, 'name': name, 'wikidata_desc': desc,
            'category': b.get('categoryLabel', {}).get('value', 'Mathematics'),
            'koTitle': b.get('koTitle', {}).get('value'),
            'enTitle': b.get('enTitle', {}).get('value')
        })
        qids_to_fetch.append(qid)

    print(f"[*] Fetching raw LaTeX for {len(qids_to_fetch)} items...")
    latex_map = fetch_raw_latex(qids_to_fetch)
    
    print("[*] Gathering Wikipedia summaries...")
    formulas = []
    for item in valid_items:
        qid = item['qid']
        latex = latex_map.get(qid)
        if not latex or len(latex) < args.min_latex: continue
        summary = fetch_wikipedia_summary(item.get(f'{args.lang}Title'), args.lang)
        if not summary and args.lang != 'en':
            summary = fetch_wikipedia_summary(item.get('enTitle'), 'en')
        final_desc = summary if summary else item['wikidata_desc']
        if final_desc and len(final_desc) > 300:
            final_desc = " ".join(re.split(r'(?<=[.!?]) +', final_desc)[:3])
        tags = set([t.strip().lower() for t in item['name'].split() if len(t) > 1])
        if final_desc:
            words = re.findall(r'[가-힣a-zA-Z]{2,}', final_desc)
            for w in words[:10]: tags.add(w.lower())
        if item['category']: tags.add(item['category'].lower())
        formulas.append({
            "id": qid.lower(), "name": item['name'], "category": item['category'],
            "latex": latex, "description": final_desc, "tags": sorted(list(tags)),
            "complexity": "Intermediate" if len(latex) < 60 else "Advanced"
        })
        time.sleep(0.05)

    output_data = {
        "version": "1.3.0", "last_updated": datetime.now().strftime("%Y-%m-%d"),
        "total_count": len(formulas), "formulas": formulas
    }
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    print(f"[+] Done! Saved {len(formulas)} formulas to '{args.output}'.")

if __name__ == "__main__":
    main()
