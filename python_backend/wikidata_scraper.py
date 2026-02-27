import requests
import json
import re
import argparse
import time
from datetime import datetime

def get_formula_qids(limit=1000, lang='ko'):
    """
    카테고리 구분 없이 LaTeX 공식(P2534) 속성이 있는 모든 항목을 가져옵니다.
    """
    url = 'https://query.wikidata.org/sparql'
    
    # 쿼리: P2534(LaTeX 공식) 속성이 있는 모든 항목
    # 노이즈를 줄이기 위해 한국어 또는 영어 레이블이 있는 것만 우선
    query = f"""
    SELECT DISTINCT ?item ?itemLabel ?itemDescription ?koTitle ?enTitle WHERE {{
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
      }}
      
      # 레이블이 QID(Q123...) 형태인 것은 제외
      FILTER(!regex(?itemLabel, "^Q\\\\d+$"))
    }}
    LIMIT {limit}
    """
    
    headers = {
        'User-Agent': 'MathFormulaScraper/1.0 (contact: user@example.com)',
        'Accept': 'application/sparql-results+json'
    }

    try:
        response = requests.get(url, params={'query': query, 'format': 'json'}, headers=headers, timeout=120)
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
        resp = requests.get(url, headers=headers, timeout=5)
        if resp.status_code == 200:
            return resp.json().get('extract')
    except: pass
    return None

def fetch_raw_latex(qids):
    if not qids: return {}
    url = "https://www.wikidata.org/w/api.php"
    headers = {'User-Agent': 'MathFormulaScraper/1.0'}
    results = {}
    # 50개씩 배치 처리
    for i in range(0, len(qids), 50):
        batch = qids[i:i+50]
        params = {"action": "wbgetentities", "ids": "|".join(batch), "format": "json", "props": "claims"}
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=30)
            data = resp.json().get('entities', {})
            for qid, entity in data.items():
                claims = entity.get('claims', {}).get('P2534', [])
                if claims:
                    # 모든 LaTeX 공식을 가져오기 위해 루프
                    latex_values = []
                    for c in claims:
                        v = c.get('mainsnak', {}).get('datavalue', {}).get('value', '')
                        if v: latex_values.append(v)
                    if latex_values:
                        results[qid] = latex_values[0] # 첫 번째 공식 사용
        except Exception as e: 
            print(f"Error fetching batch {i}: {e}")
    return results

def is_meaningless_data(name, description):
    blacklist = ['prime number', '소수', 'natural number', '자연수', 'integer', '정수', 'large prime', 'primeval number']
    text = f"{name} {description}".lower()
    for word in blacklist:
        if word in text: return True
    # n * 2^m + 1 형태의 소수 공식 필터링
    if re.search(r'\d+[·.]2\^', name): return True
    return False

def main():
    parser = argparse.ArgumentParser(description="Wikidata Global Math Formula Scraper")
    parser.add_argument("--limit", type=int, default=500, help="Max number of items (default: 500)")
    parser.add_argument("--output", type=str, default="math_formulas.json", help="Output file path")
    parser.add_argument("--lang", type=str, default="ko", help="Preferred language")
    parser.add_argument("--no-filter", action="store_true", help="Disable filters")
    
    args = parser.parse_args()

    print(f"[*] Starting Global Scraper (Total Pool: ~110k) with limit={args.limit}")
    
    # 1. 수집
    qid_data = get_formula_qids(args.limit * 2, args.lang) # 필터링 대비 2배수 요청
    if not qid_data: return

    # 2. 필터링
    valid_items = []
    qids_to_fetch = []
    for b in qid_data:
        name = b.get('itemLabel', {}).get('value', '')
        desc = b.get('itemDescription', {}).get('value', '')
        
        if not args.no_filter and is_meaningless_data(name, desc):
            continue
            
        qid = b['item']['value'].split('/')[-1]
        valid_items.append({
            'qid': qid, 'name': name, 'wikidata_desc': desc,
            'koTitle': b.get('koTitle', {}).get('value'),
            'enTitle': b.get('enTitle', {}).get('value')
        })
        qids_to_fetch.append(qid)
        if len(qids_to_fetch) >= args.limit: break

    # 3. LaTeX 가져오기
    print(f"[*] Fetching raw LaTeX for {len(qids_to_fetch)} items...")
    latex_map = fetch_raw_latex(qids_to_fetch)
    
    # 4. 위키백과 요약 (속도 제한 및 한국어 우선)
    print("[*] Gathering summaries (this may take a while)...")
    formulas = []
    for item in valid_items:
        qid = item['qid']
        latex = latex_map.get(qid)
        if not latex or len(latex) < 5: continue

        # 한국어 위키백과 요약만 시도하여 속도 향상 (없으면 위키데이터 설명 사용)
        summary = fetch_wikipedia_summary(item.get('koTitle'), 'ko')
        if not summary and item.get('enTitle'):
            # 영어 위키백과 요약은 위키데이터 설명이 너무 짧을 때만 시도
            if len(item['wikidata_desc']) < 20:
                summary = fetch_wikipedia_summary(item.get('enTitle'), 'en')
        
        final_desc = summary if summary else item['wikidata_desc']
        if final_desc and len(final_desc) > 300:
            final_desc = " ".join(re.split(r'(?<=[.!?]) +', final_desc)[:3])

        tags = set([t.strip().lower() for t in item['name'].split() if len(t) > 1])
        if final_desc:
            words = re.findall(r'[가-힣a-zA-Z]{2,}', final_desc)
            for w in words[:10]: tags.add(w.lower())

        formulas.append({
            "id": qid.lower(), "name": item['name'], "latex": latex,
            "description": final_desc, "tags": sorted(list(tags)),
            "complexity": "Basic" if len(latex) < 30 else "Advanced"
        })
        time.sleep(0.05)

    # 5. 저장
    output_data = {
        "version": "1.4.0", "last_updated": datetime.now().strftime("%Y-%m-%d"),
        "total_count": len(formulas), "formulas": formulas
    }
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    
    print(f"[+] Success! Saved {len(formulas)} formulas to '{args.output}'.")

if __name__ == "__main__":
    main()
