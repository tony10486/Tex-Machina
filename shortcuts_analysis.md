# VS Code & OS 단축키 충돌 분석 및 TeX-Machina 전용 코드(Chord) 제안

단일 단축키의 충돌을 피하기 위해, 특정 **접두사(Prefix)**를 먼저 누른 후 기능을 선택하는 **코드(Chord)** 방식의 단축키 구성을 제안합니다. 아래는 주요 운영체제에서 아직 할당되지 않았거나 충돌 가능성이 낮은 조합들입니다.

## 1. 전용 접두사(Prefix) 후보군 분석

| 접두사 (Prefix) | Windows / Linux | macOS | 분석 결과 |
| :--- | :--- | :--- | :--- |
| **`Ctrl + L`** | 행 선택 (기본) | 행 선택 (기본) | LaTeX Workshop 등에서 이미 접두사로 많이 사용됨. |
| **`Alt + L`** | **안전 (비어 있음)** | **안전 (`¬` 입력)** | 전역 메뉴와 겹치지 않으며 VS Code 기본값도 아님. |
| **`Ctrl + Alt + T`** | **안전 (비어 있음)** | `Cmd+Option+T` (도구 모음) | TeX의 **T**를 의미하여 기억하기 좋음. |
| **`Alt + Shift + T`** | **안전 (비어 있음)** | **안전 (`ˇ` 입력)** | 모든 플랫폼에서 매우 안전함. |
| **`Ctrl + M`** | 탭 포커스 전환 (주의) | **안전 (비어 있음)** | Math의 **M**이나, Windows에서 기능 충돌 존재. |

---

## 2. 권장 코드(Chord) 시퀀스 제안

가장 안전하고 확장성이 높은 **`Alt + L`** (Windows/Linux) 및 **`Cmd + L`** (macOS는 기존 기능이 강력하여 **`Alt + L`** 병행 추천)를 접두사로 사용하는 시퀀스입니다.

### 후보 A: `Alt + L` 시리즈 (LaTeX의 L)
*   **`Alt + L, M`**: 행렬 리사이저 메뉴 (Matrix)
*   **`Alt + L, T`**: 수식 모드 전환 (Toggle)
*   **`Alt + L, S`**: 스마트 줄바꿈 (Smart Newline)
*   **`Alt + L, N`**: 노드 탐색 (Navigation)

### 후보 B: `Ctrl + Alt + M` 시리즈 (Math의 M)
*   **`Ctrl + Alt + M, R`**: 행 추가 (Row)
*   **`Ctrl + Alt + M, C`**: 열 추가 (Column)
*   **`Ctrl + Alt + M, T`**: 모드 전환 (Toggle)

---

## 3. 운영체제별 충돌 리스트 (대조군)

### Windows / Linux에서 피해야 할 것
*   `Ctrl + S / Z / X / C / V`: 시스템 기본
*   `Alt + F / E / V`: 메뉴 바 활성화
*   `Ctrl + K`: VS Code 기본 코드 접두사 (이미 수십 개 할당됨)

### macOS에서 피해야 할 것
*   `Option + (대부분의 영문자)`: 특수 기호 입력 (예: `Option+M` = `µ`, `Option+S` = `ß`)
*   `Cmd + Shift + P`: 커맨드 팔레트
*   `Cmd + Option + (화살표/숫자)`: 창 관리 및 뷰 전환

---

## 4. 최종 추천 결론

**`Alt + L`**을 접두사로 사용하는 방식이 가장 직관적이고 충돌이 적습니다.

1.  사용자가 **`Alt + L`**을 누릅니다.
2.  에디터 하단 상태 표시줄에 `(Alt+L) was pressed. Waiting for second key of chord...` 메시지가 뜹니다.
3.  이어서 **`M`**을 누르면 행렬 메뉴가, **`T`**를 누르면 수식 전환이 실행됩니다.

이 분석 결과에 따라 단축키를 코드로 변경할까요?
