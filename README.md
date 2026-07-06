# MidiAI Studio Homepage V19 - Free Board

추가 기능:
- 자유게시판 목록 / 글쓰기 / 상세보기
- 게시글 수정 / 삭제(소프트 삭제)
- 댓글 작성 / 수정 / 삭제
- 답글 작성 / 수정 / 삭제
- 게시글 추천 기능(사용자별 1회)
- 조회수 자동 증가
- 관리자 게시판 관리(보기/수정/숨김/상단고정)

업로드 후 `firebase/firestore-rules.example.txt` 내용을 Firestore Rules에 반영해야 게시판 쓰기/댓글/추천이 정상 동작합니다.

추가 페이지:
- board.html
- board-write.html
- board-post.html


## V19.1 Board UX
- 상단 브랜드 심볼 이미지를 실제 심볼 이미지로 교체
- 자유게시판 사이드 메뉴 제거
- 글쓰기 버튼을 게시글 목록 툴바 오른쪽으로 이동
- 게시판 목록 화면을 넓은 단일 카드형 레이아웃으로 정리


## V19.2 Board UX Fixed
- 자유게시판 좌측 사이드 메뉴 강제 제거
- 글쓰기 버튼을 게시글 목록 우측 상단으로 이동
- 게시판 단일 와이드 레이아웃 적용
- 상단 심볼 이미지를 `assets/images/symbol.png`로 통일
- CSS/JS 캐시 방지 쿼리 `?v=19.2` 적용

업로드 후 브라우저에서 `Ctrl + F5`로 강력 새로고침하세요.
