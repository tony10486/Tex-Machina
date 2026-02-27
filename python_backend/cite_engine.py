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
            
        title_elem = entry.find('{http://www.w3.org/2005/Atom}title')
        title = title_elem.text.strip().replace('\n', ' ') if title_elem is not None else "Unknown Title"
        
        authors = [a.find('{http://www.w3.org/2005/Atom}name').text for a in entry.findall('{http://www.w3.org/2005/Atom}author')]
        
        published_elem = entry.find('{http://www.w3.org/2005/Atom}published')
        published = published_elem.text if published_elem is not None else "0000"
        year = published[:4]
        
        first_author_last = authors[0].split()[-1] if authors else "Unknown"
        
        # Citation Key 생성 (예: Author2024Arxiv)
        cite_key = f"{first_author_last}{year}Arxiv"
        
        bibtex = f"@article{{{cite_key},\n"
        bibtex += f"  title = {{{title}}},\n"
        bibtex += f"  author = {{{' and '.join(authors)}}},\n"
        bibtex += f"  year = {{{year}}},\n"
        bibtex += f"  journal = {{arXiv preprint arXiv:{clean_id}}},\n"
        bibtex += f"  url = {{https://arxiv.org/abs/{clean_id}}}\n"
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
            
            # 저널명 추출
            journal = item.get("container-title", ["Unknown Journal"])[0]
            
            authors_list = item.get("author", [])
            authors = ", ".join([f"{a.get('family', '')} {a.get('given', '')}" for a in authors_list[:2]])
            if len(authors_list) > 2: authors += " et al."
            
            # 출판년도 추출
            year_parts = item.get("published-print", item.get("published-online", {})).get("date-parts", [[None]])
            year = year_parts[0][0] if year_parts and year_parts[0] else "n.d."
            
            results.append({
                "label": f"$(library) [C] {title}",
                "description": f"{year} | {journal}",
                "detail": f"Authors: {authors}",
                "doi": doi
            })
            
        return {
            "status": "search_results",
            "results": results
        }
    except Exception as e:
        return {"status": "error", "message": f"Search failed: {str(e)}"}

def search_semantic_scholar(query):
    """Semantic Scholar API를 통해 논문을 검색합니다."""
    # fields: title, authors, year, externalIds(DOI), citationStyles(BibTeX), publicationVenue, journal
    url = f"https://api.semanticscholar.org/graph/v1/paper/search?query={query}&limit=5&fields=title,authors,year,externalIds,citationStyles,publicationVenue,journal"
    
    try:
        response = requests.get(url, timeout=10)
        if response.status_code != 200:
            return []
            
        data = response.json()
        items = data.get("data", [])
        
        results = []
        for item in items:
            title = item.get("title", "Unknown Title")
            year = item.get("year", "n.d.")
            
            # 저널명 추출
            venue = item.get("publicationVenue")
            journal = venue.get("name") if venue else item.get("journal", {}).get("name", "Unknown Journal")
            
            authors_list = item.get("authors", [])
            authors = ", ".join([a.get("name", "") for a in authors_list[:2]])
            if len(authors_list) > 2: authors += " et al."
            
            doi = item.get("externalIds", {}).get("DOI")
            # Semantic Scholar는 BibTeX을 직접 제공하기도 함
            bibtex = item.get("citationStyles", {}).get("bibtex")
            
            results.append({
                "label": f"$(book) [S] {title}",
                "description": f"{year} | {journal}",
                "detail": f"Authors: {authors}",
                "doi": doi,
                "bibtex": bibtex,
                "cite_key": re.search(r'@[a-zA-Z]+\{([^,]+),', bibtex).group(1) if bibtex else None
            })
        return results
    except:
        return []

def handle_cite(args):
    """cite 명령의 메인 핸들러"""
    if not args:
        return {"status": "error", "message": "No input provided for cite command."}
    
    query = " ".join(args).strip()
    
    # 1. DOI 판별 (10.으로 시작하거나 doi.org 포함)
    doi_match = re.search(r'(10\.\d{4,9}/[-._;()/:a-zA-Z0-9]+)', query)
    if doi_match:
        if query.startswith("10.") or "doi.org" in query or len(doi_match.group(1)) == len(query):
            return fetch_doi(doi_match.group(1))
        
    # 2. arXiv ID 판별
    arxiv_pattern = r'^(\d{4}\.\d{4,5}(?:v\d+)?)$'
    arxiv_prefix_pattern = r'arxiv:(\d{4}\.\d{4,5}(?:v\d+)?)'
    match_full = re.match(arxiv_pattern, query, re.I)
    match_prefix = re.search(arxiv_prefix_pattern, query, re.I)
    
    if match_full:
        return fetch_arxiv(match_full.group(1))
    if match_prefix:
        return fetch_arxiv(match_prefix.group(1))
        
    # 3. 제목 검색 (Semantic Scholar + Crossref 병렬 시도)
    ss_results = search_semantic_scholar(query)
    cr_res = search_crossref(query)
    cr_results = cr_res.get("results", []) if cr_res.get("status") == "search_results" else []
    
    # 중복 제거 및 결과 합치기 (DOI 기준)
    combined = ss_results
    seen_dois = {r["doi"] for r in ss_results if r.get("doi")}
    
    for r in cr_results:
        if r.get("doi") not in seen_dois:
            combined.append(r)
            if r.get("doi"): seen_dois.add(r["doi"])
            
    if not combined:
        return {"status": "error", "message": "No papers found for your query."}
        
    return {
        "status": "search_results",
        "results": combined[:8] # 상위 8개 결과 반환
    }
