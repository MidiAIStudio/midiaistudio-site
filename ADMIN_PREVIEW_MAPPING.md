# ADMIN_PREVIEW_MAPPING

Preview-only inventory. Production `admin.html` / Firestore / Functions are unchanged.

## LICENSE ZERO-LOSS (LIC-001…009 = mapped)

```
OLD FEATURE                         → NEW PAGE        → NEW LOCATION                         → DATA SOURCE              → ACTION PRESERVED
LIC-001 권한 user/admin             → 라이선스 현황   → 회원 상세 / 라이선스 탭                → mock MEMBERS.role        → YES
LIC-002 체험판/평생/기간제          → 라이선스 현황   → #adminLicensePlan + 배지               → mock MEMBERS.plan        → YES
LIC-003 시작일                      → 라이선스 현황   → #adminLicenseStartsAt                  → mock startsAt             → YES
LIC-004 만료일                      → 라이선스 현황   → #adminLicenseExpiresAt                 → mock expiresAt            → YES
LIC-005 라이선스 메모               → 라이선스 현황   → #adminLicenseMemo                      → mock licenseMemo          → YES
LIC-006 Meta chips                  → 라이선스 현황   → 유형/상태/시작/만료/변경/발급          → mock derived              → YES
LIC-007 Lifetime 만료 없음          → 라이선스 현황   → 만료 chip = 없음                       → plan=lifetime             → YES
LIC-008 Save Changes                → 라이선스 현황   → float Save Changes                     → mock apply, no Firestore  → YES
LIC-009 grant-trial                 → 라이선스 현황   → 체험판 지급                            → existing action id        → YES (preview mock)
LIC-009 grant-lifetime              → 라이선스 현황   → 평생 지급                              → existing action id        → YES (preview mock)
LIC-009 grant-timed 기간제 지급     → 라이선스 현황   → 기간제 지급                            → plan=period + dates       → YES
                                    →                 → 시작일=오늘, 만료=+30일, Save Changes  → existing grant-timed flow → YES
LIC-009 activate                    → 라이선스 현황   → 활성화                                 → licenseStatus=active      → YES
LIC-009 ban                         → 라이선스 현황   → 정지                                   → licenseStatus=banned      → YES
변경/지급 기록                      → 로그            → 탭 라이선스                            → mock LOGS cat=license     → YES
```

Unmapped license admin actions: 0

## OTHER FEATURES

```
OLD FEATURE                         → NEW PAGE        → NEW LOCATION                 → DATA SOURCE              → ACTION PRESERVED
HWID 보기                           → 회원 관리       → 상세 / 기기·HWID             → mock MEMBERS             → YES (preview)
HWID 복사                           → 회원 관리       → 상세 / 기기·HWID             → mock                     → YES (안내만)
HWID 초기화                         → 회원 관리       → 상세 ⋯ / 기기                → existing action stub     → YES (no write)
Lifetime/체험판/기간제 표시         → 회원 관리·홈    → 배지 / KPI                   → mock plan                → YES
권한 변경 UI                        → 회원 관리       → 상세 / 라이선스              → mock form                → YES (no write)
쪽지 발송                           → 회원 관리       → ⋯ 메뉴 / 일괄                → stub                     → YES (no write)
회원 삭제/차단                      → 회원 관리       → ⋯ / 일괄                     → stub                     → YES (no write)
주문 미니테이블/서랍                → 회원 관리       → 상세 / 결제                  → mock ORDERS              → YES
문의 목록                           → 회원 관리       → 상세 / 문의                  → mock TICKETS             → YES
작성글 삭제 UI                      → 회원 관리       → 상세 / 작성글                → stub                     → YES
관리자 메모/타임라인                → 회원 관리       → 상세 / 관리자 기록           → mock                     → YES
로그 콘솔                           → 로그            → 사용자 선택 + 탭 + 테이블    → mock LOGS                → YES
로그 탭 전체/라이선스/관리자/쪽지/결제/앱/HWID/문의 → 로그 → 탭          → mock cat                 → YES
로그 기간 필터                      → 로그            → toolbar                      → mock day                 → YES
결제 내역 테이블                    → 결제 내역       → table                        → mock ORDERS              → YES
문의 상태 필터                      → 문의 관리       → toolbar + sidebar            → mock status              → YES
가격·상품 폼                        → 가격·상품       → 기존 섹션                    → mock copy                → YES (no save)
공지·CMS 링크                       → 공지·쪽지       → 허브 링크                    → notices/patch/faq/board  → YES
홈 바로가기 6카드                   → (제거)          → Sidebar가 대체               → n/a                      → NAV preserved in sidebar
7일/30일 미접속 KPI                 → 회원 관리       → 통계 카드                    → mock seen                → YES (홈에서만 역할 분리)
오늘 결제 KPI                       → 홈              → KPI                          → ORDERS.isToday           → derived mock
미답변 문의 KPI                     → 홈              → KPI                          → TICKETS.status=open      → derived mock
현재 온라인 KPI                     → 홈              → KPI                          → MEMBERS.activity=online  → derived mock
```
