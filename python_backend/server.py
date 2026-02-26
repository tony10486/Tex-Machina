import sys
import json
import traceback

def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
            
        try:
            from calc_engine import execute_calc
            result_json_str = execute_calc(line)
            
            sys.stdout.write(result_json_str + '\n')
            sys.stdout.flush()
            
        except Exception as e:
            error_msg = {
                "status": "error", 
                "message": f"Server Error: {str(e)}"
            }
            sys.stdout.write(json.dumps(error_msg) + '\n')
            sys.stdout.flush()

if __name__ == "__main__":
    main()