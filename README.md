# MidiAI Studio Homepage V6

기존 GitHub Pages 구조를 최대한 유지하면서 Google 로그인, PayPal 버튼 자리, 라이선스 상태 UI를 추가한 버전입니다.

## 덮어쓰기 기준

그대로 유지하세요:
- CNAME
- robots.txt
- sitemap.xml
- 기존에 직접 만든 이미지/영상 assets

업로드/교체하세요:
- index.html
- ko/index.html
- en/index.html
- ja/index.html
- assets/css/style.css
- assets/js/app.js
- assets/js/config.js

## 설정해야 하는 파일

`assets/js/config.js` 안의 값만 채우면 됩니다.

```js
window.MIDIAI_CONFIG = {
  firebase: {
    apiKey: "...",
    authDomain: "프로젝트ID.firebaseapp.com",
    projectId: "프로젝트ID",
    appId: "..."
  },
  paypalClientId: "...",
  currency: "KRW",
  priceValue: "90000",
  licenseCheckEndpoint: "",
  paymentCaptureEndpoint: "",
  supportDiscordUrl: "https://discord.gg/zyPJFGydS"
};
```

## GitHub에 올리는 순서

1. GitHub 저장소에서 기존 파일 백업용으로 ZIP 다운로드
2. `CNAME`, `robots.txt`, `sitemap.xml`은 건드리지 않기
3. V6 ZIP 안의 파일을 같은 위치에 업로드
4. GitHub Pages 배포 확인
5. 브라우저 캐시 강력 새로고침: Ctrl + F5

## Firebase에서 해야 할 것

1. Firebase 프로젝트 생성
2. Authentication → Sign-in method → Google 활성화
3. Authentication → Settings → Authorized domains에 GitHub Pages 도메인/커스텀 도메인 추가
4. Project settings → Web app 추가 후 Firebase config 복사
5. 복사한 값을 `assets/js/config.js`에 입력

## PayPal에서 해야 할 것

1. PayPal Developer에서 앱 생성
2. Client ID 복사
3. `assets/js/config.js`의 `paypalClientId`에 입력

## 자동 라이선스 지급 주의

프론트엔드만으로 결제 완료 후 라이선스를 바로 지급하면 조작 위험이 있습니다.
자동 지급은 Firebase Functions 또는 서버에서 PayPal 결제를 서버 측 검증한 뒤 Firestore `licenses/{uid}`에 기록하는 방식으로 진행하세요.

Firestore 예시:

```json
licenses/{uid} = {
  "active": true,
  "email": "buyer@gmail.com",
  "hwid": "...",
  "createdAt": "server timestamp",
  "plan": "lifetime"
}
```
