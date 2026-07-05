# MidiAI Studio Homepage V7

Firebase Google 로그인 설정값이 반영된 버전입니다.

## 업로드할 파일
- `index.html`
- `ko/index.html`
- `en/index.html`
- `ja/index.html`
- `assets/css/style.css`
- `assets/js/app.js`
- `assets/js/config.js`
- `firebase/firestore-rules.example.txt`

## 건드리지 말 것
- `CNAME`
- `robots.txt`
- `sitemap.xml`

## Firebase에서 해야 할 일
1. Authentication → 로그인 방법 → Google 사용 설정
2. Authentication → Settings → Authorized domains에 GitHub Pages 도메인/커스텀 도메인 추가
3. Firestore Database 만들기 → 테스트 모드로 시작
4. Rules에 `firebase/firestore-rules.example.txt` 내용 적용

## 수동 라이선스 등록 예시
Firestore에서 `licenses` 컬렉션 생성 후 문서 ID를 사용자의 uid로 만들고 아래 필드를 넣습니다.

```json
{
  "active": true,
  "plan": "standard",
  "email": "customer@gmail.com",
  "licenseKey": "MID-XXXX-XXXX",
  "hwid": "사용자_HWID",
  "createdAt": "manual"
}
```

## 아직 비워둔 값
PayPal Client ID, 결제 검증 Functions URL은 다음 단계에서 연결합니다.
