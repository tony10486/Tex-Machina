import json
import csv
import sys
from collections import Counter
from pathlib import Path

def count_categories(file_path, category_key='type'):
    """
    Counts occurrences of categories in a JSON or CSV file and prints them in descending order.
    """
    path = Path(file_path)
    if not path.exists():
        print(f"Error: File '{file_path}' not found.")
        return

    counts = Counter()
    
    try:
        if path.suffix == '.json':
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # Handle both list of dicts and dict of dicts
                items = data if isinstance(data, list) else data.values()
                for item in items:
                    cat = item.get(category_key, 'Unknown')
                    counts[cat] += 1
        
        elif path.suffix == '.csv':
            with open(path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    cat = row.get(category_key, 'Unknown')
                    counts[cat] += 1
        else:
            print(f"Unsupported file format: {path.suffix}")
            return

        # Sort by count (descending)
        sorted_counts = counts.most_common()

        print(f"{'Category':<20} | {'Count':<10}")
        print("-" * 35)
        for cat, count in sorted_counts:
            print(f"{cat:<20} | {count:<10,}")
        
        print("-" * 35)
        print(f"Total Items: {sum(counts.values()):,}")

    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    # Example usage: python count_categories.py data.json type
    target_file = sys.argv[1] if len(sys.argv) > 1 else 'math_formulas.json'
    key = sys.argv[2] if len(sys.argv) > 2 else 'type'
    
    count_categories(target_file, key)
