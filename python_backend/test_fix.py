import sys
import os
import requests

# 현재 경로 추가
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from wikidata_scraper import get_total_count, fetch_wikidata, CATEGORY_MAP

def test_categories():
    test_cats = ["방정식", "항등식", "정리", "공식"]
    print(f"{'Category':<10} | {'Count':<10}")
    print("-" * 25)
    
    for cat in test_cats:
        count = get_total_count(cat, CATEGORY_MAP[cat])
        print(f"{cat:<10} | {count:<10}")

def test_data_fetch():
    # 항등식(Identity)에서 데이터가 오는지 확인
    print("\n[항등식 데이터 샘플 확인]")
    data = fetch_wikidata("항등식", CATEGORY_MAP["항등식"], 3)
    if not data:
        print("No data found for 항등식.")
    for i, item in enumerate(data):
        label = item.get('itemLabel', {}).get('value', 'No Label')
        formula = item.get('formula', {}).get('value', 'No Formula')
        print(f"{i+1}. {label}: {formula[:30]}...")

    # 정리(Theorem)에서 데이터가 오는지 확인
    print("\n[정리 데이터 샘플 확인]")
    data = fetch_wikidata("정리", CATEGORY_MAP["정리"], 3)
    if not data:
        print("No data found for 정리.")
    for i, item in enumerate(data):
        label = item.get('itemLabel', {}).get('value', 'No Label')
        formula = item.get('formula', {}).get('value', 'No Formula')
        print(f"{i+1}. {label}: {formula[:30]}...")

if __name__ == "__main__":
    try:
        test_categories()
        test_data_fetch()
    except Exception as e:
        print(f"Error during test: {e}")
