import requests
import json
import re
import argparse
import sys
import time
from datetime import datetime
import questionary
from rich.console import Console
from rich.table import Table
from rich.progress import (
    Progress, SpinnerColumn, TextColumn, BarColumn, 
    TaskProgressColumn, TimeRemainingColumn, MofNCompleteColumn, 
    TransferSpeedColumn
)
from rich.panel import Panel

# 설정 및 카테고리 매핑 (위키데이터 QID)
# 더 넓은 범위를 커버하고 정확한 항목을 가져오기 위해 QID를 최신화했습니다.
CATEGORY_MAP = {
    "방정식": "Q11345",     # Equation
    "항등식": "Q4116214",   # Mathematical identity
    "정리": "Q65943",       # Theorem
    "공식": "Q191167",     # Formula
    "함수": "Q11348",       # Function
    "부등식": "Q165309",    # Inequality
    "물리법칙": "Q462061",  # Physical law
    "통계": "Q12483",       # Statistics
    "수열": "Q131505",      # Sequence
}

console = Console()

def get_total_count(category_name, qid):
    """위키데이터에서 해당 카테고리의 전체 항목 수를 가져옵니다."""
    url = 'https://query.wikidata.org/sparql'
    
    # P2534(Defining formula) 또는 P1901(Formula) 중 하나라도 있는 항목을 찾습니다.
    query = f"""
    SELECT (COUNT(DISTINCT ?item) AS ?count) WHERE {{
      ?item wdt:P31/wdt:P279* wd:{qid}.
      {{ ?item wdt:P2534 ?formula. }} UNION {{ ?item wdt:P1901 ?formula. }}
    }}
    """
    headers = {
        'User-Agent': 'MathFormulaScraper/2.3 (Gemini CLI)',
        'Accept': 'application/sparql-results+json'
    }
    try:
        response = requests.get(url, params={'query': query, 'format': 'json'}, headers=headers, timeout=30)
        response.raise_for_status()
        data = response.json()
        return int(data['results']['bindings'][0]['count']['value'])
    except Exception as e:
        return -1

def fetch_wikidata(category_name, qid, limit):
    """지정된 카테고리의 공식을 위키데이터에서 가져옵니다."""
    url = 'https://query.wikidata.org/sparql'
    
    # 쿼리 수정: 
    # 1. SERVICE wikibase:label 블록에서 구체적인 변수 지정을 빼서 설명이 없는 항목도 포함되게 함.
    # 2. ko,en 순서로 언어 폴백(Fallback) 보장.
    query = f"""
    SELECT DISTINCT ?item ?itemLabel ?itemDescription ?formula WHERE {{
      ?item wdt:P31/wdt:P279* wd:{qid}.
      {{ ?item wdt:P2534 ?formula. }} UNION {{ ?item wdt:P1901 ?formula. }}
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "ko,en". }}
    }}
    LIMIT {limit}
    """
    headers = {
        'User-Agent': 'MathFormulaScraper/2.3 (Gemini CLI)',
        'Accept': 'application/sparql-results+json'
    }
    try:
        response = requests.get(url, params={'query': query, 'format': 'json'}, headers=headers, timeout=60)
        response.raise_for_status()
        return response.json()['results']['bindings']
    except Exception as e:
        console.print(f"[bold red]데이터 수집 에러 ({category_name}):[/bold red] {e}")
        return []

def process_formula(item, category):
    """수집된 원본 데이터를 JSON 형식에 맞게 변환합니다."""
    qid = item['item']['value'].split('/')[-1]
    name = item.get('itemLabel', {}).get('value', qid)
    latex = item.get('formula', {}).get('value', '')
    description = item.get('itemDescription', {}).get('value', '')
    
    # 태그 생성
    tags = set([t.strip().lower() for t in re.split(r'\s+|[(),\-]', name) if len(t) > 1])
    tags.add(category)
    
    # 복잡도 판별
    complexity = "Basic"
    if len(latex) > 100 or any(sym in latex for sym in ["\\int", "\\sum", "\\partial", "\\prod", "\\nabla", "\\oint"]):
        complexity = "Advanced"
    elif len(latex) > 40:
        complexity = "Intermediate"
        
    return {
        "id": qid.lower(),
        "name": name,
        "category": category,
        "latex": latex,
        "description": description,
        "tags": sorted(list(tags)),
        "complexity": complexity
    }

def main():
    console.print(Panel.fit(
        "[bold cyan]Wikidata Math Scraper v2.2[/bold cyan]\n"
        "데이터 속성 확장 및 쿼리 최적화 버전",
        border_style="cyan"
    ))

    # 1. 인터랙티브 카테고리 선택
    selected_cats = questionary.checkbox(
        "수집할 카테고리를 선택하세요:",
        choices=[questionary.Choice(cat) for cat in CATEGORY_MAP.keys()],
        style=questionary.Style([
            ('checkbox-selected', 'fg:cyan bold'),
            ('selected', 'fg:cyan'),
        ])
    ).ask()

    if not selected_cats:
        console.print("[bold yellow]선택된 카테고리가 없습니다.[/bold yellow]")
        return

    # 2. 모든 카테고리의 수량 조회 (개선된 쿼리 및 타임아웃)
    all_counts = {}
    with Progress(
        SpinnerColumn(),
        TextColumn("[bold blue]{task.description}"),
        console=console
    ) as progress:
        task = progress.add_task(description="위키데이터 전역 데이터베이스 조회 중...", total=len(selected_cats))
        for cat in selected_cats:
            progress.update(task, description=f"'{cat}' 항목 탐색 중 (대규모 카테고리는 시간이 걸릴 수 있습니다)...")
            count = get_total_count(cat, CATEGORY_MAP[cat])
            all_counts[cat] = count
            progress.update(task, advance=1)

    # 3. 수집량 입력
    targets = []
    total_requested = 0
    
    for cat in selected_cats:
        full_count = all_counts[cat]
        
        if full_count == -1:
            console.print(f"[orange1]! '{cat}' 카테고리는 응답 시간이 너무 길어 조회에 실패했습니다. 기본값으로 진행하시겠습니까?[/orange1]")
            if questionary.confirm(f"'{cat}'을(를) 강제로 50개 수집 시도할까요?").ask():
                full_count = 5000 # 가상의 최대치 설정
                default_val = "50"
            else:
                continue
        elif full_count == 0:
            console.print(f"[dim yellow]! '{cat}' 카테고리는 수식이 포함된 항목을 찾을 수 없습니다.[/dim yellow]")
            continue
        else:
            default_val = str(min(20, full_count))

        limit_str = questionary.text(
            f"'{cat}' (최대 {full_count if full_count < 5000 else '수천'}개 이상 가능) 중 수집할 개수:",
            default=default_val,
            validate=lambda text: text.isdigit() and int(text) >= 0 or "숫자를 입력하세요."
        ).ask()
        
        if limit_str and int(limit_str) > 0:
            limit = int(limit_str)
            targets.append({
                "name": cat, 
                "qid": CATEGORY_MAP[cat], 
                "limit": limit, 
                "total_on_wiki": full_count if full_count < 5000 else "Unknown"
            })
            total_requested += limit

    if not targets:
        return

    # 4. 최종 수집 계획 요약
    summary_table = Table(title="\n최종 수집 대상", show_header=True, header_style="bold magenta")
    summary_table.add_column("카테고리", style="cyan")
    summary_table.add_column("수집 목표량", justify="right")
    
    for t in targets:
        summary_table.add_row(t['name'], f"{t['limit']} 개")
    
    console.print(summary_table)
    console.print(Panel(f"총 [bold green]{total_requested}[/bold green] 개의 데이터를 수집합니다.", border_style="green"))

    if not questionary.confirm("수집을 시작할까요?").ask():
        return

    # 5. 수집 시작
    all_formulas = []
    start_time = time.time()
    
    with Progress(
        SpinnerColumn(),
        TextColumn("[bold blue]{task.description}"),
        BarColumn(bar_width=40),
        MofNCompleteColumn(),
        TaskProgressColumn(),
        TransferSpeedColumn(),
        TimeRemainingColumn(),
        console=console
    ) as progress:
        
        overall_task = progress.add_task("[green]전체 데이터 수집 중...", total=total_requested)
        
        for t in targets:
            progress.update(overall_task, description=f"[cyan]수집 중: {t['name']}")
            raw_data = fetch_wikidata(t['name'], t['qid'], t['limit'])
            
            for item in raw_data:
                formula_obj = process_formula(item, t['name'])
                all_formulas.append(formula_obj)
                progress.update(overall_task, advance=1)
                time.sleep(0.002)

    # 6. 결과 저장
    final_output = {
        "version": "1.4.2",
        "last_updated": datetime.now().strftime("%Y-%m-%d"),
        "total_count": len(all_formulas),
        "formulas": all_formulas
    }
    
    output_file = "math_formulas.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(final_output, f, ensure_ascii=False, indent=2)
    
    console.print("\n")
    console.print(Panel(
        f"[bold green]수집 완료![/bold green]\n\n"
        f"총 [bold white]{len(all_formulas)}[/bold white] 개의 공식 데이터를 수집했습니다.\n"
        f"파일 위치: [underline magenta]{output_file}[/underline magenta]",
        border_style="green"
    ))

if __name__ == "__main__":
    main()
