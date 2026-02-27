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
CATEGORY_MAP = {
    "방정식": "Q11345",     # Equation
    "항등식": "Q41138",     # Identity
    "정리": "Q11012",       # Theorem
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
    query = f"""
    SELECT (COUNT(DISTINCT ?item) AS ?count) WHERE {{
      ?item wdt:P31/wdt:P279* wd:{qid}.
      ?item wdt:P2534 ?formula.
    }}
    """
    headers = {
        'User-Agent': 'MathFormulaScraper/2.0 (Gemini CLI)',
        'Accept': 'application/sparql-results+json'
    }
    try:
        response = requests.get(url, params={'query': query, 'format': 'json'}, headers=headers, timeout=15)
        response.raise_for_status()
        data = response.json()
        return int(data['results']['bindings'][0]['count']['value'])
    except Exception:
        return 0

def fetch_wikidata(category_name, qid, limit):
    """지정된 카테고리의 공식을 위키데이터에서 가져옵니다."""
    url = 'https://query.wikidata.org/sparql'
    query = f"""
    SELECT DISTINCT ?item ?itemLabel ?itemDescription ?formula WHERE {{
      ?item wdt:P31/wdt:P279* wd:{qid}.
      ?item wdt:P2534 ?formula.
      SERVICE wikibase:label {{ 
        bd:serviceParam wikibase:language "ko,en". 
        ?item rdfs:label ?itemLabel.
        ?item schema:description ?itemDescription.
      }}
    }}
    LIMIT {limit}
    """
    headers = {
        'User-Agent': 'MathFormulaScraper/2.0 (Gemini CLI)',
        'Accept': 'application/sparql-results+json'
    }
    try:
        response = requests.get(url, params={'query': query, 'format': 'json'}, headers=headers, timeout=60)
        response.raise_for_status()
        return response.json()['results']['bindings']
    except Exception as e:
        console.print(f"[bold red]에러 발생 ({category_name}):[/bold red] {e}")
        return []

def process_formula(item, category):
    """수집된 원본 데이터를 JSON 형식에 맞게 변환합니다."""
    qid = item['item']['value'].split('/')[-1]
    name = item.get('itemLabel', {}).get('value', qid)
    latex = item.get('formula', {}).get('value', '')
    description = item.get('itemDescription', {}).get('value', '')
    
    tags = set([t.strip().lower() for t in re.split(r'\s+|[(),\-]', name) if len(t) > 1])
    tags.add(category)
    
    complexity = "Basic"
    if len(latex) > 100 or "\\int" in latex or "\\sum" in latex or "\\partial" in latex:
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
        "[bold cyan]Wikidata Math Scraper v2.0[/bold cyan]\n"
        "방향키로 이동, [bold yellow]스페이스바[/bold yellow]로 선택, [bold green]엔터[/bold green]로 확정하세요.",
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
        console.print("[bold yellow]선택된 카테고리가 없습니다. 종료합니다.[/bold yellow]")
        return

    # 2. 각 카테고리별 전체 수량 조회 및 수집 수량 입력
    targets = []
    total_requested = 0
    
    console.print("\n[bold blue]위키데이터에서 전체 항목 수를 조회하는 중...[/bold blue]")
    
    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), console=console) as progress:
        for cat in selected_cats:
            task = progress.add_task(description=f"'{cat}' 수량 확인 중...", total=None)
            full_count = get_total_count(cat, CATEGORY_MAP[cat])
            progress.remove_task(task)
            
            # 사용자에게 수량 입력 받기
            limit_str = questionary.text(
                f"'{cat}' (전체 {full_count}개) 중 몇 개를 가져올까요?",
                default=str(min(20, full_count)),
                validate=lambda text: text.isdigit() and 0 <= int(text) <= full_count or f"0에서 {full_count} 사이의 숫자를 입력하세요."
            ).ask()
            
            if limit_str and int(limit_str) > 0:
                limit = int(limit_str)
                targets.append({
                    "name": cat, 
                    "qid": CATEGORY_MAP[cat], 
                    "limit": limit, 
                    "total_on_wiki": full_count
                })
                total_requested += limit

    if not targets:
        console.print("[bold yellow]수집할 데이터가 설정되지 않았습니다.[/bold yellow]")
        return

    # 3. 최종 수집 계획 요약
    summary_table = Table(title="\n수집 계획 요약", show_header=True, header_style="bold magenta")
    summary_table.add_column("카테고리", style="cyan")
    summary_table.add_column("수집 수량 / 전체", justify="right")
    summary_table.add_column("진척률", justify="right")
    
    for t in targets:
        ratio = (t['limit'] / t['total_on_wiki'] * 100) if t['total_on_wiki'] > 0 else 0
        summary_table.add_row(
            t['name'], 
            f"{t['limit']} / {t['total_on_wiki']}", 
            f"{ratio:.1f}%"
        )
    
    console.print(summary_table)
    console.print(Panel(f"총 [bold green]{total_requested}[/bold green] 개의 데이터를 수집합니다.", border_style="green"))

    if not questionary.confirm("이대로 수집을 시작할까요?").ask():
        console.print("[bold red]취소되었습니다.[/bold red]")
        return

    # 4. 실시간 진행 상황을 포함한 수집 시작
    all_formulas = []
    
    # Progress 바 구성: 스피너, 설명, 진행바, 현재/전체, 퍼센트, 속도, 남은 시간
    with Progress(
        SpinnerColumn(),
        TextColumn("[bold blue]{task.description}"),
        BarColumn(bar_width=40),
        MofNCompleteColumn(),
        TaskProgressColumn(),
        TransferSpeedColumn(), # 초당 처리 속도
        TimeRemainingColumn(),
        console=console
    ) as progress:
        
        overall_task = progress.add_task("[green]전체 데이터 수집 중...", total=total_requested)
        
        for t in targets:
            progress.update(overall_task, description=f"[cyan]수집 중: {t['name']}")
            
            raw_data = fetch_wikidata(t['name'], t['qid'], t['limit'])
            
            if not raw_data:
                progress.console.print(f"[dim yellow]  ! {t['name']}: 데이터를 가져오지 못했습니다.[/dim yellow]")
                # 실패한 만큼 진행바를 건너뛰지 않고 처리 (또는 skip)
                continue
            
            for item in raw_data:
                formula_obj = process_formula(item, t['name'])
                all_formulas.append(formula_obj)
                progress.update(overall_task, advance=1)
                # 실제 수동 딜레이는 최소화하되 속도 표시를 위해 아주 짧게 유지
                time.sleep(0.005)

    # 5. 결과 저장 및 최종 요약
    final_output = {
        "version": "1.4.0",
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
