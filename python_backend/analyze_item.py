import requests
import json

def get_item_info(qid):
    url = 'https://query.wikidata.org/sparql'
    query = """
    SELECT ?p ?pLabel ?o ?oLabel WHERE {
      wd:""" + qid + """ ?p ?o.
      SERVICE wikibase:label { bd:serviceParam wikibase:language "ko,en". }
    }
    LIMIT 50
    """
    headers = {
        'User-Agent': 'MathFormulaScraper/2.3 (Gemini CLI)',
        'Accept': 'application/sparql-results+json'
    }
    response = requests.get(url, params={'query': query, 'format': 'json'}, headers=headers)
    return response.json()['results']['bindings']

if __name__ == "__main__":
    print("--- 오일러 항등식(Q211135) 속성 분석 ---")
    data = get_item_info("Q211135")
    for item in data:
        p = item.get('pLabel', {}).get('value', 'No P')
        o = item.get('oLabel', {}).get('value', 'No O')
        print(p + ": " + o)
