import requests
import json

def handle_oeis(sub_cmds):
    """
    OEIS 수열 검색을 처리합니다.
    """
    if not sub_cmds:
        return {"status": "error", "message": "검색어를 입력하세요."}
    
    query = " ".join(sub_cmds)
    url = "https://oeis.org/search"
    params = {
        "q": query,
        "fmt": "json"
    }
    
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        
        # API 결과가 리스트인 경우와 딕셔너리인 경우 모두 대응
        if isinstance(data, list):
            results = data
        elif isinstance(data, dict):
            results = data.get("results", [])
        else:
            return {"status": "error", "message": "OEIS API로부터 알 수 없는 응답을 받았습니다."}

        if not results:
            return {"status": "error", "message": f"'{query}'에 대한 검색 결과가 없습니다."}

        formatted_results = []
        for res in results[:15]: # 최대 15개
            number = res.get("number")
            id_str = f"A{str(number).zfill(6)}"
            name = res.get("name")
            data_seq = res.get("data", "")
            
            # detail 필드를 사용하여 정보를 아래 줄에 표시 (두께감 형성)
            formatted_results.append({
                "label": f"$(symbol-number) {id_str}: {name[:120]}",
                "detail": f"Sequence: {data_seq[:150]}...",
                "id": id_str,
                "full_name": name,
                "data": data_seq
            })

        return {
            "status": "oeis_results",
            "results": formatted_results,
            "query": query
        }

    except Exception as e:
        return {"status": "error", "message": f"OEIS 검색 중 오류 발생: {str(e)}"}
