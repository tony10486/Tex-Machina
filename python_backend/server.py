import sys
import os
import json
import io
import types

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# Ensure compatibility for antlr4 on Python 3.12+ (typing.io removal)
if 'typing.io' not in sys.modules:
    m = types.ModuleType('typing.io')
    m.TextIO = io.TextIOBase
    m.BinaryIO = io.BufferedIOBase
    sys.modules['typing.io'] = m

from calc_engine import execute_calc

def main():
    # Signal that the server is ready to accept requests
    sys.stdout.write(json.dumps({"status": "ready", "pid": os.getpid()}) + '\n')
    sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        request_id = None
        try:
            req = json.loads(line)
            request_id = req.get('requestId')

            result_json_str = execute_calc(line)

            if request_id:
                try:
                    res_obj = json.loads(result_json_str)
                    if isinstance(res_obj, dict):
                        res_obj['requestId'] = request_id
                        result_json_str = json.dumps(res_obj)
                except Exception:
                    pass

            sys.stdout.write(result_json_str + '\n')
            sys.stdout.flush()

        except Exception as e:
            error_msg = {
                "status": "error",
                "message": f"Server Error: {str(e)}"
            }
            if request_id:
                error_msg['requestId'] = request_id
            sys.stdout.write(json.dumps(error_msg) + '\n')
            sys.stdout.flush()

if __name__ == "__main__":
    main()