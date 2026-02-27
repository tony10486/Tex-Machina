import requests
import sys
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn

console = Console()

def query_wikidata_categories():
    """
    Queries Wikidata for items containing mathematical formulas (P2534 or P1901),
    groups them by their instance-of (P31) category, and counts them.
    """
    url = 'https://query.wikidata.org/sparql'
    
    # This query finds items with a formula, gets their type (P31),
    # and counts occurrences of each type.
    query = """
    SELECT ?class ?classLabel (COUNT(?item) AS ?count) WHERE {
      { ?item wdt:P2534 ?formula. } UNION { ?item wdt:P1901 ?formula. }
      ?item wdt:P31 ?class.
      SERVICE wikibase:label { bd:serviceParam wikibase:language "ko,en". }
    }
    GROUP BY ?class ?classLabel
    ORDER BY DESC(?count)
    LIMIT 50
    """
    
    headers = {
        'User-Agent': 'WikidataExplorer/1.0 (Gemini CLI)',
        'Accept': 'application/sparql-results+json'
    }
    
    try:
        with Progress(
            SpinnerColumn(),
            TextColumn("[bold blue]Wikidata에서 수식 카테고리 통계 분석 중..."),
            console=console
        ) as progress:
            progress.add_task("query", total=None)
            response = requests.get(url, params={'query': query, 'format': 'json'}, headers=headers, timeout=60)
            response.raise_for_status()
            data = response.json()
            
        results = data['results']['bindings']
        
        table = Table(title="Wikidata 수식 포함 항목 카테고리 통계", show_header=True, header_style="bold magenta")
        table.add_column("Rank", justify="right", style="dim")
        table.add_column("Category (Label)", style="cyan")
        table.add_column("QID", style="green")
        table.add_column("Item Count", justify="right", style="bold yellow")
        
        total_items = 0
        for i, row in enumerate(results, 1):
            label = row.get('classLabel', {}).get('value', 'Unknown')
            qid = row['class']['value'].split('/')[-1]
            count = int(row['count']['value'])
            total_items += count
            table.add_row(str(i), label, qid, f"{count:,}")
            
        console.print(table)
        console.print(f"\n[bold white]Top 50 카테고리 합계 항목 수: {total_items:,}[/bold white]")
        console.print("[dim]* 수식이 있는 항목은 여러 카테고리에 중복 포함될 수 있습니다.[/dim]")

    except Exception as e:
        console.print(f"[bold red]오류 발생:[/bold red] {e}")

if __name__ == "__main__":
    query_wikidata_categories()
