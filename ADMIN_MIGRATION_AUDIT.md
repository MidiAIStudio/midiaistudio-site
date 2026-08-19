# ADMIN_MIGRATION_AUDIT

Date: 2026-08-19  
Baseline: `ADMIN_BASELINE.md`  
Scope: Admin Console IA/UI migration only.

Format: `Feature ID | Existing Feature | Old Location | New Location | Backend Changed | Result`

---

## AUTH / SHELL

| Feature ID | Existing Feature | Old Location | New Location | Backend Changed | Result |
|---|---|---|---|---|---|
| AUTH-001 | Google login | topbar `#loginBtn` | topbar `#loginBtn` (public nav hidden, actions kept) | NO | PASS |
| AUTH-002 | Logout | `#logoutBtn` | `#logoutBtn` | NO | PASS |
| AUTH-003 | Language toggle | `#langBtn` | `#langBtn` | NO | PASS |
| AUTH-004 | Admin gate | `#adminGate` | `#adminGate` | NO | PASS |
| AUTH-005 | Flash / save message | `#adminSaveMsg` | `#adminSaveMsg` | NO | PASS |
| NAV-001 | Tab 회원·CRM | floating nav | Sidebar 회원 관리 → 전체 회원 | NO | PASS |
| NAV-002 | Tab 로그 | floating nav | Sidebar 로그 | NO | PASS |
| NAV-003 | Tab 가격·상품 | floating nav | Sidebar 콘텐츠 → 가격·상품 | NO | PASS |
| NAV-004 | Tab 전체 문의 | floating nav | Sidebar 문의 관리 | NO | PASS |

---

## MEMBER MANAGEMENT

| Feature ID | Existing Feature | Old Location | New Location | Backend Changed | Result |
|---|---|---|---|---|---|
| MEM-STAT-001 | 전체 회원 | CRM stats | 홈 통계 + 회원 관리 통계 | NO | PASS |
| MEM-STAT-002 | 활성 | CRM stats | 홈 + 회원 관리 | NO | PASS |
| MEM-STAT-003 | 평생 | CRM stats | 홈 + 회원 관리 | NO | PASS |
| MEM-STAT-004 | 체험판 | CRM stats | 홈 + 회원 관리 | NO | PASS |
| MEM-STAT-005 | 오늘 가입 | CRM stats | 홈 + 회원 관리 | NO | PASS |
| MEM-STAT-006 | 7일 미접속 | CRM stats | 홈 + 회원 관리 | NO | PASS |
| MEM-STAT-007 | 30일 미접속 | CRM stats | 홈 + 회원 관리 | NO | PASS |
| MEM-STAT-008 | 필터 결과 | CRM stats | 홈 + 회원 관리 | NO | PASS |
| MEM-STAT-009 | Stat click filter | `applyAdminCrmStatFilter` | same handler; home click also opens CRM | NO | PASS |
| MEM-001 | Search email/name/UID/HWID | `#adminUserSearch` | 회원 관리 toolbar | NO | PASS |
| MEM-002 | License filter | `#adminUserLicenseStatus` | 회원 관리 toolbar | NO | PASS |
| MEM-003 | Sort | `#adminUserSort` | 회원 관리 toolbar | NO | PASS |
| MEM-004 | Payment filter | `#adminCrmFilterOrders` | 회원 관리 toolbar | NO | PASS |
| MEM-005 | Ticket filter | `#adminCrmFilterTickets` | 회원 관리 toolbar | NO | PASS |
| MEM-006 | Count n / total | `#adminUserCount` | 회원 관리 list head | NO | PASS |
| MEM-007 | Pagination | `#adminCrmPager` | 회원 관리 table footer | NO | PASS |
| MEM-BULK-001 | Select all | `#adminCrmSelectAll` | 회원 table above | NO | PASS |
| MEM-BULK-002 | Row checkbox | `[data-crm-check]` | table checkbox column | NO | PASS |
| MEM-BULK-003 | Bulk bar count | `#adminCrmBulkCount` | table action bar | NO | PASS |
| MEM-BULK-004 | 일괄 차단 | `data-bulk=ban` | same handler | NO | PASS |
| MEM-BULK-005 | 일괄 앱 쪽지 | `data-bulk=app-message` | same handler | NO | PASS |
| MEM-BULK-006 | 일괄 삭제 | `data-bulk=delete` | same handler | NO | PASS |
| MEM-BULK-007 | Bulk confirmations | `confirm()` | unchanged | NO | PASS |
| MEM-LIST-001 | Avatar | member card | table 사용자 column | NO | PASS |
| MEM-LIST-002 | Display name | member card | table 사용자 | NO | PASS |
| MEM-LIST-003 | Favorite star | member card | table 사용자 | NO | PASS |
| MEM-LIST-004 | Role badge | member card | table 권한 | NO | PASS |
| MEM-LIST-005 | License badge | member card | table 라이선스 | NO | PASS |
| MEM-LIST-006 | Country line | member card meta | table 국가 | NO | PASS |
| MEM-LIST-007 | Relative last login | member card meta | table 최근 접속 | NO | PASS |
| MEM-LIST-008 | Order count | member card | table 주문 | NO | PASS |
| MEM-LIST-009 | Ticket count | member card | table 문의 | NO | PASS |
| MEM-LIST-010 | Row select | card click | table row click → `selectAdminCrmUser` | NO | PASS |
| MEM-LIST-011 | Selected highlight | `.is-selected` | table row `.is-selected` | NO | PASS |

---

## MEMBER DETAIL

| Feature ID | Existing Feature | Old Location | New Location | Backend Changed | Result |
|---|---|---|---|---|---|
| MEM-D-001 | Avatar | right panel header | 회원 상세 header | NO | PASS |
| MEM-D-002 | Name | right panel | 회원 상세 header | NO | PASS |
| MEM-D-003 | Role badge | right panel | 회원 상세 header | NO | PASS |
| MEM-D-004 | License badge | right panel | 회원 상세 header | NO | PASS |
| MEM-D-005 | Email | right panel | 회원 상세 header | NO | PASS |
| MEM-D-006 | UID | right panel | 회원 상세 header / 개요 | NO | PASS |
| MEM-D-007 | 가입일 | header meta | 회원 상세 header | NO | PASS |
| MEM-D-008 | 최근 로그인 | header meta | 회원 상세 header | NO | PASS |
| MEM-D-009 | Online / activity | header meta | 회원 상세 header + 개요 활동 카드 | NO | PASS |
| MEM-D-010 | Favorite toggle | header | 회원 상세 header | NO | PASS |
| MEM-D-011 | Overflow menu | ⋯ | 회원 상세 header | NO | PASS |
| MEM-D-012 | Menu HWID 초기화 | ⋯ | 회원 상세 ⋯ + 기기 탭 | NO | PASS |
| MEM-D-013 | Menu 앱 쪽지 | ⋯ | 회원 상세 ⋯ | NO | PASS |
| MEM-D-014 | Menu 회원 삭제 | ⋯ | 회원 상세 ⋯ | NO | PASS |
| MEM-D-015 | Summary 주문 | summary cards | 개요 tab + 결제 tab | NO | PASS |
| MEM-D-016 | Summary 문의 | summary cards | 개요 tab + 문의 tab | NO | PASS |
| MEM-D-017 | Summary 활동 | summary cards | 개요 tab | NO | PASS |
| MEM-D-018 | Empty state | `#adminCrmEmpty` | 상세 pane (목록에서 미선택 시 pane hidden) | NO | PASS |
| MEM-D-019 | Skeleton | `#adminCrmSkeleton` | 회원 상세 | NO | PASS |
| MEM-D-020 | Dirty float save | `#adminCrmFloatSave` | 회원 상세 | NO | PASS |
| HWID-001 | HWID display | right panel | 회원 > 기기/HWID | NO | PASS |
| HWID-002 | 보기/숨기기 | right panel | 회원 > 기기/HWID | NO | PASS |
| HWID-003 | 복사 | right panel | 회원 > 기기/HWID | NO | PASS |
| HWID-004 | 초기화 | right panel + ⋯ | 회원 > 기기/HWID + ⋯ | NO | PASS |
| HWID-005 | Copy disabled empty | same | same | NO | PASS |
| ACC-001 | 국가 | 접속 정보 | 회원 > 접속 정보 | NO | PASS |
| ACC-002 | 지역 | 접속 정보 | 회원 > 접속 정보 | NO | PASS |
| ACC-003 | 최근 접속 datetime | 접속 정보 | 회원 > 접속 정보 | NO | PASS |
| ACC-004 | IP masked | 접속 정보 | 회원 > 접속 정보 | NO | PASS |
| ACC-005 | 언어 | 접속 정보 | 회원 > 접속 정보 | NO | PASS |
| ACC-006 | 접속 환경 | 접속 정보 | 회원 > 접속 정보 | NO | PASS |
| ACC-007 | Empty 국가 정보 없음 | 접속 정보 | 회원 > 접속 정보 | NO | PASS |
| LIC-001 | 권한 select | license card | 회원 > 라이선스 | NO | PASS |
| LIC-002 | 라이선스 유형 | license card | 회원 > 라이선스 | NO | PASS |
| LIC-003 | 시작일 | license card | 회원 > 라이선스 | NO | PASS |
| LIC-004 | 만료일 | license card | 회원 > 라이선스 | NO | PASS |
| LIC-005 | 라이선스 메모 | license card | 회원 > 라이선스 | NO | PASS |
| LIC-006 | Meta chips | license card | 회원 > 라이선스 | NO | PASS |
| LIC-007 | Lifetime no expiry copy | license card | 회원 > 라이선스 | NO | PASS |
| LIC-008 | Save Changes | float save | 회원 상세 float save | NO | PASS |
| LIC-009 | Quick grant handlers | JS `grant-trial/lifetime/timed/ban/activate` | handlers kept; live HTML already used form+Save (no extra buttons added) | NO | PASS |
| LIC-010 | Loading/missing/conflict | license card | 회원 > 라이선스 | NO | PASS |
| USE-001 | FULL 기능 사용 collapse | right panel | 회원 > 개요 | NO | PASS |
| USE-002 | Usage fetch | `renderAdminCrmUsage` | same | NO | PASS |
| PAY-001 | Order mini table | right panel | 회원 > 결제 | NO | PASS |
| PAY-002 | 더보기 | orders-more | 회원 > 결제 | NO | PASS |
| PAY-003 | Row → order drawer | `openAdminCrmOrderDrawer` | 회원 > 결제; 결제 내역 row also opens drawer | NO | PASS |
| PAY-004 | Drawer close | same | same | NO | PASS |
| PAY-005 | Global orders snapshot | `adminOrderRows` | 결제 관리 table reuses same array | NO | PASS |
| TKT-M-001 | Member ticket list | right panel | 회원 > 문의 | NO | PASS |
| TKT-M-002 | 전체 → tickets tab | tickets-tab | 문의 관리 + email search | NO | PASS |
| POST-001 | 작성글 list | right panel | 회원 > 작성글 | NO | PASS |
| POST-002 | Count | right panel | 회원 > 작성글 | NO | PASS |
| POST-003 | Select all posts | right panel | 회원 > 작성글 | NO | PASS |
| POST-004 | 선택 삭제 | right panel | 회원 > 작성글 | NO | PASS |
| POST-005 | 전체 삭제 | right panel | 회원 > 작성글 | NO | PASS |
| POST-006 | Per-row delete | right panel | 회원 > 작성글 | NO | PASS |
| MEMO-001 | 관리자 메모 autosave | right panel | 회원 > 관리자 기록 | NO | PASS |
| MEMO-002 | Memo history | right panel | 회원 > 관리자 기록 | NO | PASS |
| TL-001 | Timeline | right panel | 회원 > 관리자 기록 | NO | PASS |
| FEED-001 | Recent Activity | right panel | 회원 > 관리자 기록 | NO | PASS |

---

## LOGS / PRICING / TICKETS / CMS

| Feature ID | Existing Feature | Old Location | New Location | Backend Changed | Result |
|---|---|---|---|---|---|
| LOG-001 | User list + email search | logs panel | 로그 | NO | PASS |
| LOG-002 | Selected user summary | logs panel | 로그 | NO | PASS |
| LOG-003 | Tab 전체 | logs tabs | Sidebar 로그 > 전체 + in-panel tabs | NO | PASS |
| LOG-004 | Tab 라이선스 | logs tabs | Sidebar + in-panel | NO | PASS |
| LOG-005 | Tab 관리자 작업 | logs tabs | Sidebar + in-panel | NO | PASS |
| LOG-006 | Tab 쪽지/알림 | logs tabs | Sidebar + in-panel | NO | PASS |
| LOG-007 | Tab 결제 | logs tabs | Sidebar + in-panel | NO | PASS |
| LOG-008 | Tab 앱 사용 | logs tabs | Sidebar + in-panel | NO | PASS |
| LOG-009 | Tab HWID/기기 | logs tabs | Sidebar + in-panel | NO | PASS |
| LOG-010 | Tab 문의 | logs tabs | Sidebar + in-panel | NO | PASS |
| LOG-011 | Table content search | `#adminLogsTableSearch` | 로그 header | NO | PASS |
| LOG-012 | Date filter | `#adminLogsDateFilter` | 로그 header | NO | PASS |
| LOG-013 | 새로고침 | `#adminLogsRefreshBtn` | 로그 header | NO | PASS |
| LOG-014 | 더보기 | `#adminLogsLoadMore` | 로그 | NO | PASS |
| LOG-015 | Independent of CRM timeline | separate module | unchanged | NO | PASS |
| PRC-001 … PRC-013 | Pricing / promo | `#adminPricingSection` | Sidebar 가격·상품 | NO | PASS |
| TKT-001 | Search | tickets section | 문의 관리 | NO | PASS |
| TKT-002 | Status filter | `#adminTicketStatus` | 문의 관리 + Sidebar 전체/미답변/답변완료/종료 | NO | PASS |
| TKT-003 | Count | `#adminTicketCount` | 문의 관리 | NO | PASS |
| TKT-004 | Table columns | tickets | 문의 관리 | NO | PASS |
| TKT-005 | Expand row meta | tickets | 문의 관리 | NO | PASS |
| TKT-006 | Replies live | tickets | 문의 관리 | NO | PASS |
| TKT-007 | Reply form | tickets | 문의 관리 | NO | PASS |
| TKT-008 | Close ticket | tickets | 문의 관리 | NO | PASS |
| TKT-009 | Select all / checks | tickets | 문의 관리 | NO | PASS |
| TKT-010 | 선택 삭제 | tickets | 문의 관리 | NO | PASS |
| TKT-011 | 전체 삭제 | tickets | 문의 관리 | NO | PASS |
| TKT-012 | Unread highlight | tickets | 문의 관리 + sidebar badge | NO | PASS |
| TKT-013 | Toast / deep link `?tab=tickets&open=` | floating tab click | same selector `[data-admin-tab=tickets]` now in sidebar | NO | PASS |
| CMS-001 | 공지 CMS | notices.html | 콘텐츠 → 공지사항 CMS link | NO | PASS |
| CMS-002 | 패치노트 CMS | patch-notes.html | 콘텐츠 link | NO | PASS |
| CMS-003 | FAQ CMS | faq.html | 콘텐츠 link | NO | PASS |
| CMS-004 | Board pin/hide/delete | board.html + CRM posts | 콘텐츠 link + 회원 > 작성글 | NO | PASS |

---

## Information Preservation Audit

```
OLD_VISIBLE_FIELDS ⊆ NEW_ACCESSIBLE_FIELDS

UID                 OLD: 회원 상세          NEW: 회원 상세 header / 개요          PASS
Email               OLD: 목록+상세          NEW: table + 상세                    PASS
Name                OLD: 목록+상세          NEW: table + 상세                    PASS
Role                OLD: 목록+상세          NEW: table + 상세                    PASS
License             OLD: 목록+상세          NEW: table + 라이선스 탭             PASS
Activity / online   OLD: 상세               NEW: table 상태 + 개요               PASS
가입일              OLD: 상세 header        NEW: 상세 header                     PASS
최근 로그인         OLD: 목록+상세          NEW: table + header                  PASS
국가                OLD: 목록+접속정보      NEW: table + 접속 정보 탭            PASS
지역                OLD: 접속 정보          NEW: 접속 정보 탭                    PASS
IP                  OLD: 접속 정보          NEW: 접속 정보 탭                    PASS
언어                OLD: 접속 정보          NEW: 접속 정보 탭                    PASS
접속 환경           OLD: 접속 정보          NEW: 접속 정보 탭                    PASS
HWID                OLD: 상세               NEW: 기기/HWID 탭                    PASS
주문 수             OLD: 목록+요약          NEW: table + 개요 + 결제             PASS
문의 수             OLD: 목록+요약          NEW: table + 개요 + 문의             PASS
주문 상세           OLD: mini table+drawer  NEW: 결제 탭 + 결제 내역 화면        PASS
문의 목록           OLD: 상세               NEW: 문의 탭 + 문의 관리             PASS
작성글              OLD: 상세               NEW: 작성글 탭                       PASS
메모/히스토리       OLD: 상세               NEW: 관리자 기록 탭                  PASS
Timeline / feed     OLD: 상세               NEW: 관리자 기록 탭                  PASS
Usage               OLD: 상세               NEW: 개요 탭                         PASS
```

---

## Filter Preservation Audit

```
OLD_FILTERS == NEW_FILTERS

Member search (email/name/UID/HWID)   PASS
License (all/trial/lifetime/period/favorites) PASS
Sort (lastLogin/createdAt/name/lastPayment) PASS
Orders (all/has/none)                 PASS
Tickets (all/has/none)                PASS
Stat chips (8)                        PASS
Ticket status (all/open/answered/closed) PASS
Logs date (all/today/7d/30d)          PASS
Logs category tabs (8)                PASS
Logs user email search                PASS
Logs content search                   PASS
Payments search (new surface over existing adminOrderRows) PASS — additive
```

---

## Action Preservation Audit

Existing handlers reused: `selectAdminCrmUser`, `adminResetHwid`, `adminDeleteUser`, `adminQuickLicense`, `notifyAdminAppMessage`, `saveAdminCrmAllChanges`, `openAdminCrmOrderDrawer`, `writeAdminAuditLog`, bulk ban/message/delete, ticket reply/close/delete, pricing save, logs refresh/load more.

Buttons without handler: 0 (LIC-009 grant-* had handlers before this migration and still have no dedicated HTML buttons; license changes remain via form + Save Changes).

---

## Backend Diff Audit

| Area | Result |
|---|---|
| Firestore schema | UNCHANGED |
| Cloud Functions | UNCHANGED |
| License behavior | UNCHANGED |
| Payment behavior | UNCHANGED |
| Permission behavior | UNCHANGED |
| HWID behavior | UNCHANGED |
| Logging | UNCHANGED |
| Firestore rules | UNCHANGED |

Admin console skips the public `initSidebarLayout` shell so the new left sidebar is not nested inside the public site sidebar. Auth/login/license/payment Functions are not involved.

---

## Files touched (UI/IA only)

- `admin.html`
- `assets/css/style.css` (`.admin-console-page` scoped)
- `assets/js/admin-console.js` (new view shell)
- `assets/js/app.js` (table/detail-tab/payments paint + skip public sidebar)
- `assets/js/pricing-admin.js` (tab → `showAdminView`)
- `assets/js/admin-user-logs.js` (`setAdminLogsTab`, `selectAdminLogsUser`)
- `ADMIN_BASELINE.md`
- `ADMIN_MIGRATION_AUDIT.md`
- `tests/admin-console-preservation.mjs`

---

## Runtime / Visual QA

- Static preservation test: `tests/admin-console-preservation.mjs`
- JS syntax: `node --check` on admin JS modules
- Live admin login against production data was not used for destructive actions
- Gate page can be opened without mutating data

---

## Verdict checklist

```
MISSING_FEATURES = 0
MISSING_ACTIONS = 0
MISSING_FIELDS = 0
MISSING_FILTERS = 0
BROKEN_ACTIONS = 0  (handlers still bound to the same IDs)
BROKEN_NAVIGATION = 0
UNEXPECTED_SCHEMA_CHANGES = 0
UNEXPECTED_BACKEND_CHANGES = 0
UNEXPECTED_PERMISSION_CHANGES = 0
UNEXPECTED_LICENSE_CHANGES = 0
UNEXPECTED_PAYMENT_CHANGES = 0
UNEXPECTED_LOGGING_CHANGES = 0
```
