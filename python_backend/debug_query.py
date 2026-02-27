import requests
import json

def debug_wikidata(qid):
    url = 'https://query.wikidata.org/sparql'
    # 특정 QID에 대해 공식(P2534)이 있는 항목 5개만 가져오기
    query = "SELECT DISTINCT ?item ?itemLabel ?formula WHERE { ?item wdt:P31 wd:" + qid + ". ?item wdt:P2534 ?formula. SERVICE wikibase:label { bd:serviceParam wikibase:language 'ko,en'. } } LIMIT 5"
    headers = {
        'User-Agent': 'MathFormulaScraper/2.3 (Gemini CLI)',
        'Accept': 'application/sparql-results+json'
    }
    try:
        response = requests.get(url, params={'query': query, 'format': 'json'}, headers=headers)
        return response.json()['results']['bindings']
    except Exception as e:
        print("Error fetching " + qid + ": " + str(e))
        return []

if __name__ == "__main__":
    # 항등식(Q41138)에 대해 직접 인스턴스 확인
    print("--- 항등식(Q41138) 직접 조회 ---")
    results = debug_wikidata("Q41138")
    for r in results:
        label = r.get('itemLabel', {}).get('value', 'No Label')
        formula = r.get('formula', {}).get('value', 'No Formula')
        print(label + ": " + formula[:30] + "...")

    # 정리(Q1064567) 직접 조회
    print("\n--- 수학적 정리(Q1064567) 직접 조회 ---")
    results = debug_wikidata("Q1064567")
    for r in results:
        label = r.get('itemLabel', {}).get('value', 'No Label')
        formula = r.get('formula', {}).get('value', 'No Formula')
        print(label + ": " + formula[:30] + "...")
