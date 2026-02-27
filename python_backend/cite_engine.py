import requests
import json
import re
import xml.etree.ElementTree as ET

def fetch_arxiv(arxiv_id):
    """arXiv ID를 통해 BibTeX 정보를 가져옵니다."""
    # arXiv ID 정규화 (버전 번호 v1, v2 등 제거)
    clean_id = re.sub(r'v\d+$', '', arxiv_id)
    url = f"http://export.arxiv.org/api/query?id_list={clean_id}"
    
    try:
        response = requests.get(url, timeout=10)
        if response.status_code != 200:
            return {"status": "error", "message": f"arXiv API error: {response.status_code}"}
        
        root = ET.fromstring(response.content)
        entry = root.find('{http://www.w3.org/2005/Atom}entry')
        
        if entry is None or entry.find('{http://www.w3.org/2005/Atom}id') is None:
            return {"status": "error", "message": "arXiv entry not found."}
            
        title = entry.find('{http://www.w3.org/2005/Atom}title').text.strip().replace('
', ' ')
        authors = [a.find('{http://www.w3.org/2005/Atom}name').text for a in entry.findall('{http://www.w3.org/2005/Atom}author')]
        published = entry.find('{http://www.w3.org/2005/Atom}published').text
        year = published[:4]
        first_author_last = authors[0].split()[-1]
        
        # Citation Key 생성 (예: Author2024Arxiv)
        cite_key = f"{first_author_last}{year}Arxiv"
        
        bibtex = f"@article{{{cite_key},
"
        bibtex += f"  title = {{{title}}},
"
        bibtex += f"  author = {{{' and '.join(authors)}}},
"
        bibtex += f"  year = {{{year}}},
"
        bibtex += f"  journal = {{arXiv preprint arXiv:{clean_id}}},
"
        bibtex += f"  url = {{https://arxiv.org/abs/{clean_id}}}
"
        bibtex += "}"
        
        return {
            "status": "success",
            "bibtex": bibtex,
            "cite_key": cite_key,
            "title": title
        }
    except Exception as e:
        return {"status": "error", "message": f"arXiv fetch failed: {str(e)}"}

def fetch_doi(doi):
    """DOI를 통해 BibTeX 정보를 가져옵니다."""
    # DOI 정규화
    doi = doi.replace("https://doi.org/", "").replace("doi.org/", "")
    url = f"https://doi.org/{doi}"
    headers = {"Accept": "application/x-bibtex"}
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            bibtex = response.text.strip()
            # BibTeX에서 Key 추출 (@article{Key, ...)
            match = re.search(r'@[a-zA-Z]+\{([^,]+),', bibtex)
            cite_key = match.group(1) if match else "citation_key"
            
            # 제목 추출 (UI 표시용)
            title_match = re.search(r'title\s*=\s*[\{"](.+?)[\}"]', bibtex, re.IGNORECASE | re.DOTALL)
            title = title_match.group(1) if title_match else doi
            
            return {
                "status": "success",
                "bibtex": bibtex,
                "cite_key": cite_key,
                "title": title
            }
        else:
            return {"status": "error", "message": f"DOI API error: {response.status_code}"}
    except Exception as e:
        return {"status": "error", "message": f"DOI fetch failed: {str(e)}"}

def search_crossref(query):
    """제목 또는 키워드로 Crossref에서 논문을 검색합니다."""
    url = f"https://api.crossref.org/works?query={query}&rows=5"
    
    try:
        response = requests.get(url, timeout=10)
        if response.status_code != 200:
            return {"status": "error", "message": f"Crossref API error: {response.status_code}"}
            
        data = response.json()
        items = data.get("message", {}).get("items", [])
        
        results = []
        for item in items:
            title = item.get("title", ["Unknown Title"])[0]
            doi = item.get("DOI")
            authors = ", ".join([f"{a.get('family', '')} {a.get('given', '')}" for a in item.get("author", [])])
            year = item.get("published-print", item.get("published-online", {})).get("date-parts", [[None]])[0][0]
            
            results.append({
                "label": f"{title} ({year})",
                "description": authors,
                "doi": doi
            })
            
        return {
            "status": "search_results",
            "results": results
        }
    except Exception as e:
        return {"status": "error", "message": f"Search failed: {str(e)}"}

def handle_cite(args):
    """cite 명령의 메인 핸들러"""
    if not args:
        return {"status": "error", "message": "No input provided for cite command."}
    
    query = " ".join(args).strip()
    
    # 1. arXiv ID 판별 (예: 2109.12345 또는 arXiv:2109.12345)
    arxiv_match = re.search(r'(?:arxiv:)?(\d{4}\.\d{4,5})', query, re.I)
    if arxiv_match:
        return fetch_arxiv(arxiv_match.group(1))
        
    # 2. DOI 판별 (예: 10.1038/nature12345)
    doi_match = re.search(r'(10\.\d{4,9}/[-._;()/:a-zA-Z0-9]+)', query)
    if doi_match:
        return fetch_doi(doi_match.group(1))
        
    # 3. 나머지는 제목 검색으로 간주
    return search_crossref(query)

if __name__ == "__main__":
    # 간단한 테스트
    # print(json.dumps(handle_cite(["2109.12345"]), indent=2))
    # print(json.dumps(handle_cite(["10.1038/nature14539"]), indent=2))
    # print(json.dumps(handle_cite(["Attention is all you need"]), indent=2))
    pass
