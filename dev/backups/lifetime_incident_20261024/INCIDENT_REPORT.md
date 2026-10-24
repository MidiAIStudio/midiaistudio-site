# Lifetime 일괄 기간제 덮어쓰기 사고 복구 보고

- 프로젝트: midiaistudio
- 사고 시각(UTC): 2026-10-24T14:45:52Z ~ 14:46:05Z (KST 23:45~23:46)
- 복구 완료: 2026-10-24 (동일일)

## 1. 사고 원인

관리자 CRM **일괄 지급 → 기간제 3일(직접입력)** 이 클라이언트에서 `licenses/{uid}` 를 `setDoc(..., { merge:true })` 로 덮어썼다.

- 호출 경로: `runAdminBulkGrant` → `runAdminBulkLicenseGrant` → `adminBulkApplyLicenseToUid`
- 서버 Cloud Function 미경유 (브라우저 Admin SDK / Firestore 직접 쓰기)
- Lifetime 여부 검사 없음 → `plan/method/startsAt/expiresAt/passProductId` 일괄 덮어쓰기
- 부수 증상: 커스텀 3일이 `PASS_7D` 로 매핑되어 라벨만 "7일 Full"로 표시됨 (만료일은 3일)

## 2. 일괄 지급 대상

| 항목 | 수 |
|---|---|
| 감사 로그 unique 대상 | **124** |
| A. 사고 전 Lifetime → 3일 기간제 | **15** |
| B. 사고 전 Trial → 3일 Full (정상 유지) | **102** |
| C. 사고 전 기간제 → 3일로 덮어씀 (자동 복구 제외) | **7** |

## 3. 백업 / PITR

| 항목 | 결과 |
|---|---|
| PITR | **DISABLED** |
| Version retention | 3600s (1시간) |
| Scheduled backups | 없음 |
| 사고 직전 읽기 | `readTime=2026-10-24T14:45:00Z` 로 A그룹 15명 모두 `plan=lifetime` 확인 |
| 로컬 백업 | `dev/backups/lifetime_incident_20261024/` |

## 4. Lifetime 복구

- 근거: adminAuditLogs `before.plan=lifetime` **AND** readTime 스냅샷 `plan=lifetime` **AND** 현재 fingerprint(`period`+`admin_bulk`+만료 2026-10-27)
- Dry-run: 15 would_restore
- Apply: **15/15 success**
- 재실행(idempotent): 15 already_ok
- 복구 필드: `plan=lifetime`, `status=active`, `licensed=true`, `method`(원본), `memo`(원본 있을 때), 삭제=`startsAt/expiresAt/passProductId/durationDays/expireReason/expiredAt`
- 유지: HWID, UID, 결제/포트원 메타, 크레딧 미변경

## 5. 유지 / 제외

- B(Trial→3일): **유지** (샘플 5명 period+2026-10-27 확인)
- C(기존 기간제 7명): **자동 변경 안 함** — 이전 만료일 복원은 별도 검토
- 크레딧/결제 기록: 변경 없음

## 6. 재발 방지 (배포됨)

1. 기간제 일괄 지급 **긴급 잠금** (hosting)
2. `adminBulkApplyLicenseToUid`: Lifetime → period/trial **건너뜀**
3. 지급 전 미리보기 + 성공/건너뜀/실패 보고
4. Firestore rules: `method==admin_bulk` 로 Lifetime 강등 금지

## 7. 산출물

- `group_A_lifetime_victims.json`
- `group_B_trial_keep.json`
- `group_C_review.json`
- `A_historical_readTime_144500Z.json`
- `A_current_licenses.json` (복구 전)
- `restore_dry_run_report.json` / `restore_apply_report.json`
- `post_restore_verify.json`
- `dev/scripts/restore_lifetime_bulk_incident_20261024.mjs`
