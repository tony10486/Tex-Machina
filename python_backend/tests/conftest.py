# -*- coding: utf-8 -*-
"""
pytest 공용 픽스처 / 경로 설정.

python_backend 디렉터리를 sys.path 에 삽입하여 테스트 파일이
`from utils import ...` / `import calc_engine` 처럼
모듈을 직접 임포트할 수 있게 한다. (pytest 7+ 의 `pythonpath` ini 옵션과
이중 안전장치 — 오래된 pytest 에서도 동작하도록 conftest 에서도 삽입한다.)
"""
import os
import sys

_PYTHON_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PYTHON_BACKEND_DIR not in sys.path:
    sys.path.insert(0, _PYTHON_BACKEND_DIR)
