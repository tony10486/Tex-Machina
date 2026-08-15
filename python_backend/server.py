import sys
import os
import json
import io
import types
import signal
import traceback

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

# 요청당 최대 처리 시간 (초). 초과 시 해당 요청을 중단하고 루프를 계속 진행한다.
REQUEST_TIMEOUT_SECONDS = 10
# 입력 한 줄의 최대 길이 (1MB). 초과 시 계산 없이 거부한다.
MAX_LINE_LENGTH = 1_000_000

# SIGALRM은 POSIX 전용 (Windows에는 없음). 없으면 watchdog 비활성화 —
# Windows는 아래 입력 길이 제한 + calc_engine/matrix/plot의 수치 캡으로 보호된다.
_HAS_ALARM = hasattr(signal, 'SIGALRM') and hasattr(signal, 'ITIMER_REAL')


class RequestTimeoutError(TimeoutError):
    """단일 요청이 REQUEST_TIMEOUT_SECONDS를 초과했을 때 발생시키는 예외."""


def _handle_timeout(signum, frame):
    """SIGALRM 핸들러 — 실행 중이던 계산을 TimeoutError로 중단시킨다."""
    raise RequestTimeoutError(
        f"처리 시간 초과 (요청이 제한 시간을 초과했습니다, 최대 {REQUEST_TIMEOUT_SECONDS}초)"
    )


def _arm_timeout():
    """요청별 watchdog 타이머 시작 (SIGALRM 미지원 플랫폼에서는 no-op)."""
    if _HAS_ALARM:
        signal.setitimer(signal.ITIMER_REAL, REQUEST_TIMEOUT_SECONDS)


def _disarm_timeout():
    """요청별 watchdog 타이머 해제 (SIGALRM 미지원 플랫폼에서는 no-op)."""
    if _HAS_ALARM:
        signal.setitimer(signal.ITIMER_REAL, 0)


def is_line_too_long(line: str) -> bool:
    """입력 줄의 길이 제한 검사 (테스트에서 직접 사용 가능)."""
    return len(line) > MAX_LINE_LENGTH


def main():
    # SIGALRM 핸들러 등록 (main thread에서만 동작 — server.py는 main thread)
    if _HAS_ALARM:
        signal.signal(signal.SIGALRM, _handle_timeout)

    # Signal that the server is ready to accept requests
    sys.stdout.write(json.dumps({"status": "ready", "pid": os.getpid()}) + '\n')
    sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        request_id = None

        # 1. 입력 길이 제한 (json.loads 이전에 검사)
        if is_line_too_long(line):
            try:
                request_id = json.loads(line).get('requestId')
            except Exception:
                request_id = None
            sys.stdout.write(json.dumps({
                "status": "error",
                "message": "입력이 너무 깁니다 (최대 1MB)",
                "requestId": request_id
            }) + '\n')
            sys.stdout.flush()
            continue

        try:
            req = json.loads(line)
            request_id = req.get('requestId')

            # 2. 요청별 watchdog: 제한 시간 초과 시 SIGALRM으로 계산 중단
            _arm_timeout()
            try:
                result_json_str = execute_calc(line)
            finally:
                # 계산 종료 후 타이머 비활성화 (다음 요청에서 다시 설정)
                _disarm_timeout()

            if request_id:
                try:
                    res_obj = json.loads(result_json_str)
                    if isinstance(res_obj, dict):
                        res_obj['requestId'] = request_id
                        result_json_str = json.dumps(res_obj)
                except Exception:
                    # requestId 재부착 실패 — 응답 자체는 유지하고 로그만 남김
                    sys.stderr.write(
                        "[Server] requestId 재부착 실패, 원본 응답 유지\n"
                    )

            sys.stdout.write(result_json_str + '\n')
            sys.stdout.flush()

        except RequestTimeoutError:
            error_msg = {
                "status": "error",
                "message": f"처리 시간 초과 (요청이 제한 시간을 초과했습니다, 최대 {REQUEST_TIMEOUT_SECONDS}초)"
            }
            if request_id:
                error_msg['requestId'] = request_id
            sys.stdout.write(json.dumps(error_msg) + '\n')
            sys.stdout.flush()

        except Exception as e:
            # 디버깅용 traceback 로깅 (응답보다 먼저 stderr에 기록)
            sys.stderr.write("[Server] 요청 처리 중 예외 발생:\n")
            sys.stderr.write(traceback.format_exc())
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