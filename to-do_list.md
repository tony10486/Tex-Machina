# Tex-Machina Extension
## Structure

## 개선이 핑요한 사항
- quickpick을 통한 명령어 입력 시 뜨는 연관 명령어를 모든 기능에 대해 지원해야 함 
- 설정에서 더 많은 커스터마이징이 가능하도록 해야 함 
- table generator 기능을 더 수정했으면 함 
## 추가 예정 기능 
- 수식 모드 자동 전환 : 일반 텍스트 모드에서 \alpha나 \sum 같은 수학 전용 매크로를 타이핑하면, 에디터가 이를 감지하고 자동으로 양옆에 $ $를 씌워줌 (예: Let \alpha -> Let $\alpha$)
- Latex environment 자동 삭제 : \begin{itemize}를 지우면 쌍을 이루는 \end{itemize}가 동시에 삭제되는 기능
- cmd + shift + ; 단축키를 일정 시간동안 켜 둘 수 있도록 만들어야 함. (매번 해당 단축키를 눌러 활성화 하기보다, 해당 단측키가 고정되어 있고 esc를 눌러 이스케이프 하도록)
### Calc

### Plot 

### Macro 
- 웹뷰에서 저장된 명령어를 한눈에 보고 관리할 수 있도록 하면 좋을 것 같음 
- 키스트로크 레코딩 및 재생 속도 조절 지원.
- 매크로 미리보기 : 매크로 실행 시 예상 코드를 회색으로 미리 보여주는 기능 

### Cite
### Ref Graph
#### Frontend
### Formular search
## 고쳐야 할 버그
- label webview 레이아웃 수정이 필요함 
