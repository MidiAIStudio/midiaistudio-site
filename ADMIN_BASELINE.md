# ADMIN_BASELINE

Source: `admin.html`, `assets/js/app.js`, `assets/js/pricing-admin.js`, `assets/js/admin-user-logs.js`  
Scope: features visible or reachable from the current admin page (including handlers, hidden state, and CMS on hub pages).  
Date: 2026-08-19

This document is the freeze list for UI/IA migration. Nothing listed here may be removed.

---

## Admin modules

1. Auth gate (`#adminGate`, `admin-locked`, Google login, role=admin)
2. Member CRM (`#adminCrm`)
3. User logs console (`#adminLogsSection`)
4. Pricing / products / promo (`#adminPricingSection`)
5. Support tickets (`#adminTicketsSection`)
6. Hub CMS (notices / patch notes / FAQ) on public hub pages, admin write/edit/delete
7. Board post admin (per-member in CRM; global table only if `#adminBoardList` exists — currently not on admin.html)

---

## AUTH / SHELL

| ID | Feature | Location | Handler |
|----|---------|----------|---------|
| AUTH-001 | Google login | topbar `#loginBtn` | existing auth |
| AUTH-002 | Logout | `#logoutBtn` | existing auth |
| AUTH-003 | Language toggle | `#langBtn` | existing i18n |
| AUTH-004 | Admin gate / no permission | `#adminGate` | `setAdminGate` / `unlockAdminPanel` |
| AUTH-005 | Flash / save message | `#adminSaveMsg` | `adminFlash` |
| NAV-001 | Tab: 회원·CRM | `[data-admin-tab=crm]` | `pricing-admin.bindTabs` |
| NAV-002 | Tab: 로그 | `[data-admin-tab=logs]` | bindTabs + `showAdminUserLogsPanel` |
| NAV-003 | Tab: 가격·상품 | `[data-admin-tab=pricing]` | bindTabs + load products |
| NAV-004 | Tab: 전체 문의 | `[data-admin-tab=tickets]` | bindTabs; also ticket toast click |

---

## MEMBER MANAGEMENT

### Statistics (clickable filters)

| ID | Feature |
|----|---------|
| MEM-STAT-001 | 전체 회원 |
| MEM-STAT-002 | 활성 |
| MEM-STAT-003 | 평생 |
| MEM-STAT-004 | 체험판 |
| MEM-STAT-005 | 오늘 가입 |
| MEM-STAT-006 | 7일 미접속 |
| MEM-STAT-007 | 30일 미접속 |
| MEM-STAT-008 | 필터 결과 |
| MEM-STAT-009 | Stat click → `applyAdminCrmStatFilter` |

### Search / filters / sort

| ID | Feature | Control |
|----|---------|---------|
| MEM-001 | Search email / name / UID / HWID | `#adminUserSearch` |
| MEM-002 | License filter: 전체 / 체험판 / 평생 / 기간제 / 즐겨찾기 | `#adminUserLicenseStatus` |
| MEM-003 | Sort: 최근 로그인 / 가입일 / 이름 / 최근 결제 | `#adminUserSort` |
| MEM-004 | Payment filter: 전체 / 있음 / 없음 | `#adminCrmFilterOrders` |
| MEM-005 | Ticket filter: 전체 / 있음 / 없음 | `#adminCrmFilterTickets` |
| MEM-006 | Count `n / total` | `#adminUserCount` |
| MEM-007 | Pagination prev/next + range | `#adminCrmPager` `ADMIN_CRM_PAGE_SIZE` |

### Bulk actions

| ID | Feature | Handler |
|----|---------|---------|
| MEM-BULK-001 | Select all (filtered page set) | `#adminCrmSelectAll` |
| MEM-BULK-002 | Row checkbox | `[data-crm-check]` |
| MEM-BULK-003 | Bulk bar count | `#adminCrmBulkCount` |
| MEM-BULK-004 | 일괄 차단 | `data-bulk=ban` → `adminQuickLicense` banned |
| MEM-BULK-005 | 일괄 앱 쪽지 | `data-bulk=app-message` → composer + `notifyAdminAppMessage` + audit log |
| MEM-BULK-006 | 일괄 삭제 | `data-bulk=delete` → `adminDeleteUser` (license/orders kept) |
| MEM-BULK-007 | Confirmations on bulk ban / message / delete | existing `confirm()` |

### Member list row fields

| ID | Field |
|----|-------|
| MEM-LIST-001 | Avatar / fallback initial |
| MEM-LIST-002 | Display name |
| MEM-LIST-003 | Favorite star |
| MEM-LIST-004 | Role badge |
| MEM-LIST-005 | License plan badge |
| MEM-LIST-006 | Country line |
| MEM-LIST-007 | Relative last login |
| MEM-LIST-008 | Order count |
| MEM-LIST-009 | Ticket count |
| MEM-LIST-010 | Row select → `selectAdminCrmUser` |
| MEM-LIST-011 | Selected highlight |

### Member detail — header / overview

| ID | Field / action | Node / handler |
|----|----------------|----------------|
| MEM-D-001 | Avatar | `#adminCrmAvatar` |
| MEM-D-002 | Name | `#adminCrmName` |
| MEM-D-003 | Role badge | `#adminCrmRoleBadge` |
| MEM-D-004 | License badge | `#adminCrmHeaderLicense` |
| MEM-D-005 | Email | `#adminCrmEmail` |
| MEM-D-006 | UID | `#adminCrmUid` |
| MEM-D-007 | 가입일 | `#adminCrmHeaderMeta` |
| MEM-D-008 | 최근 로그인 (relative) | header meta |
| MEM-D-009 | Online / activity badge | `adminActivityBadgeHtml` |
| MEM-D-010 | Favorite toggle | `#adminCrmFavBtn` `toggle-fav` |
| MEM-D-011 | Overflow menu | `#adminCrmMenuBtn` |
| MEM-D-012 | Menu: HWID 초기화 | `hwid-reset` |
| MEM-D-013 | Menu: 앱으로 쪽지 | `app-message` |
| MEM-D-014 | Menu: 회원 삭제 | `delete` → `adminDeleteUser` |
| MEM-D-015 | Summary: 주문 수 + last payment | `data-crm-action=orders` |
| MEM-D-016 | Summary: 문의 수 + last ticket | `data-crm-action=tickets` |
| MEM-D-017 | Summary: 활동 | activity card |
| MEM-D-018 | Empty state | `#adminCrmEmpty` |
| MEM-D-019 | Skeleton | `#adminCrmSkeleton` |
| MEM-D-020 | Dirty float save | `#adminCrmFloatSave` `saveAdminCrmAllChanges` |

### HWID

| ID | Feature |
|----|---------|
| HWID-001 | HWID display (masked) |
| HWID-002 | 보기 / 숨기기 | `hwid-reveal` |
| HWID-003 | 복사 | `hwid-copy` |
| HWID-004 | 초기화 | `adminResetHwid` |
| HWID-005 | Copy disabled when empty |

### Access information

| ID | Field |
|----|-------|
| ACC-001 | 국가 (flag + name) |
| ACC-002 | 지역 (city/region) |
| ACC-003 | 최근 접속 datetime |
| ACC-004 | IP (masked) |
| ACC-005 | 언어 |
| ACC-006 | 접속 환경 (app/web) |
| ACC-007 | Empty: 국가 정보 없음 |

### License

| ID | Feature |
|----|---------|
| LIC-001 | 권한 select user/admin | `#adminUserRole` |
| LIC-002 | 라이선스 trial/lifetime/period | `#adminLicensePlan` |
| LIC-003 | 시작일 | `#adminLicenseStartsAt` |
| LIC-004 | 만료일 | `#adminLicenseExpiresAt` |
| LIC-005 | 라이선스 메모 | `#adminLicenseMemo` |
| LIC-006 | Meta chips: 유형 / 시작 / 만료 / 변경 / 발급 |
| LIC-007 | Lifetime = no expiry copy |
| LIC-008 | Save via float Save Changes (existing dirty watchers) |
| LIC-009 | Quick grant trial / lifetime / timed / ban / activate (detail actions) |
| LIC-010 | Loading / missing / conflict / error states (no auto-heal on open) |

### Usage

| ID | Feature |
|----|---------|
| USE-001 | FULL 기능 사용 collapsible |
| USE-002 | Usage fetch (existing `renderAdminCrmUsage`) |

### Orders / payments (per member)

| ID | Feature |
|----|---------|
| PAY-001 | Order mini table (id, method, amount, date, status) |
| PAY-002 | 더보기 full list | `orders-more` |
| PAY-003 | Row click → order drawer | `openAdminCrmOrderDrawer` |
| PAY-004 | Order drawer close | `close-order-drawer` |
| PAY-005 | Global `orders` snapshot already loaded (`adminOrderRows`) |

### Tickets (per member)

| ID | Feature |
|----|---------|
| TKT-M-001 | Member ticket list |
| TKT-M-002 | 전체 → tickets tab | `tickets-tab` |

### Posts (per member)

| ID | Feature |
|----|---------|
| POST-001 | 작성글 list |
| POST-002 | Count |
| POST-003 | Select all posts |
| POST-004 | 선택 삭제 |
| POST-005 | 전체 삭제 |
| POST-006 | Per-row delete |

### Memo / timeline / feed

| ID | Feature |
|----|---------|
| MEMO-001 | 관리자 메모 textarea autosave |
| MEMO-002 | Memo history |
| TL-001 | Timeline |
| FEED-001 | Recent Activity feed (`adminCrmRecentFeed`) |

---

## LOGS CONSOLE

| ID | Feature |
|----|---------|
| LOG-001 | User list + email search | `#adminLogsUserSearch` |
| LOG-002 | Selected user summary |
| LOG-003 | Tab 전체 |
| LOG-004 | Tab 라이선스 |
| LOG-005 | Tab 관리자 작업 |
| LOG-006 | Tab 쪽지/알림 |
| LOG-007 | Tab 결제 |
| LOG-008 | Tab 앱 사용 |
| LOG-009 | Tab HWID/기기 |
| LOG-010 | Tab 문의 |
| LOG-011 | Table content search | `#adminLogsTableSearch` |
| LOG-012 | Date filter 전체/오늘/7일/30일 | `#adminLogsDateFilter` |
| LOG-013 | 새로고침 | `#adminLogsRefreshBtn` |
| LOG-014 | 더보기 pagination | `#adminLogsLoadMore` |
| LOG-015 | Independent of CRM timeline (do not merge engines) |

---

## PRICING / PRODUCTS

| ID | Feature |
|----|---------|
| PRC-001 | 상품 추가 | `#pricingAddProduct` |
| PRC-002 | Region 추가 | `#pricingAddRegion` |
| PRC-003 | 저장 | `#pricingSaveBtn` |
| PRC-004 | 상품 목록 | `#pricingProductList` |
| PRC-005 | Product editor | `#pricingEditor` |
| PRC-006 | 언어→Region map ko/en/ja | `#pricingLangKo/En/Ja` + `#pricingSaveLangMap` |
| PRC-007 | 할인 캠페인 사용 |
| PRC-008 | 할인 시작/종료일 |
| PRC-009 | 할인 뱃지 표시 + KO/EN/JA |
| PRC-010 | 홈 할인 팝업 사용 + 기간 |
| PRC-011 | 팝업 제목/내용/CTA KO/EN/JA |
| PRC-012 | 할인/팝업 저장 | `#pricingSavePromoBtn` |
| PRC-013 | Flash `#pricingSaveMsg` |

---

## TICKETS (global)

| ID | Feature |
|----|---------|
| TKT-001 | Search | `#adminTicketSearch` |
| TKT-002 | Status filter 전체/접수/답변 완료/종료 | `#adminTicketStatus` |
| TKT-003 | Count |
| TKT-004 | Table: 유형/제목/사용자/상태/수정일 |
| TKT-005 | Expand row: meta (유형, 버전, OS, 이메일), body, attachments |
| TKT-006 | Replies live |
| TKT-007 | Reply form |
| TKT-008 | Close ticket |
| TKT-009 | Select all / row checks |
| TKT-010 | 선택 삭제 |
| TKT-011 | 전체 삭제 |
| TKT-012 | Unread highlight |
| TKT-013 | Admin ticket notifications / deep link |

---

## HUB CMS (existing, not currently HTML on admin.html)

Admin write/edit/delete on `notices.html`, `patch-notes.html`, `faq.html`, `board.html`.  
Must remain reachable. Do not delete hub handlers.

| ID | Feature |
|----|---------|
| CMS-001 | 공지 작성/수정/삭제/고정 |
| CMS-002 | 패치노트 작성/수정/삭제 (APP/WEB type) |
| CMS-003 | FAQ 작성/수정/삭제 |
| CMS-004 | Board pin/hide/delete (hub + per-member) |

---

## Backend contracts (must stay UNCHANGED)

- Collections: `users`, `licenses`, `orders`, `supportTickets`, `boardPosts`, `products`, `pricingConfig`, `announcements`, `patchNotes`, `faq`, audit/log writes used by `writeAdminAuditLog`
- Functions: payment, license, HWID reset, `recordAccessInfo`, app message notify
- License semantics: trial / lifetime / period; expiry; ban
- CRM license open is read-only (no create/migrate/heal)

---

## Counts (baseline)

```
Features:  ~120 Feature IDs above
Actions:   bulk 3 + member menu 3 + HWID 3 + license save/quick + tickets CRUD + pricing save + logs refresh
Visible fields: member list 9+; detail header 9+; access 6; license 8+; order columns 5; ticket columns 5+
Filters:   member 5 controls + 8 stats; tickets 1 status; logs 1 date + 8 category tabs
Admin modules: 5 on admin.html + hub CMS
```
