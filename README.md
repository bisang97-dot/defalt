# Claude Enterprise 토큰 관리 에이전트

Claude Enterprise 조직의 구성원 목록과 그룹별/개인별 토큰(스펜드) 제한을 조회하고,
개인별 제한을 설정/해제하는 내부 관리용 웹 서비스입니다.

> ⚠️ **현재 개발/테스트 전용 모드로 동작합니다.**
> 1. 인증코드를 이메일로 발송하지 않고, **화면에 그대로 노출**합니다 (`src/routes/auth.ts`의 `sendOtpEmail` 호출이 주석 처리되어 있습니다).
> 2. Admin API 키를 `.env`로 관리하지 않고, 화면 상단의 **"Admin API 키" 입력창**에 매 세션마다 직접 입력합니다. 이 값은 요청 헤더(`x-admin-api-key`)로만 전달되고 서버/브라우저 저장소 어디에도 저장되지 않으며, 새로고침하면 다시 입력해야 합니다.
>
> 운영 배포 전에 반드시 아래 기능들을 원래대로 되돌려야 합니다 — 관련 위치는 각 파일 상단/호출부의 `[개발/테스트 전용 모드]` 주석을 검색하면 모두 찾을 수 있습니다 (`src/config.ts`, `src/middleware/adminKey.ts`, `src/services/anthropicAdmin.ts`, `src/services/orgDirectory.ts`, `src/services/mailer.ts`, `src/routes/auth.ts`, `src/routes/members.ts`, `public/js/app.js`, `public/index.html`). (`src/envPaths.ts`의 `env/` 폴더 분리 자체는 개발/테스트 전용이 아니라 그대로 유지하는 변경입니다.)
> 3. 그룹 평균 토큰 제한 초과 시 전체 관리자에게 보내야 할 메일도, 지금은 실제 발송 대신 화면 알림창으로 대신 보여줍니다.

## 주요 기능

1. **[센터별 토큰 관리 탭] 조직 구성원 조회** — 이름, 이메일, 소속 그룹, 그룹 기준 토큰 제한, 개인별 토큰 제한(및 그 출처)을 한 화면에서 확인
2. **[센터별 토큰 관리 탭] 개인별 토큰 제한 적용** — Claude Admin API(`POST /v1/organizations/spend_limits`)를 호출해 특정 구성원에게 개인별 한도를 설정하거나(`DELETE`) 해제
3. **[센터별 토큰 관리 탭] 그룹 평균 초과 확인 및 관리자 알림** — 개인별 제한을 저장하면 그 그룹의 평균 토큰 제한을 미리 계산해서, 기준값(기본 $100)을 초과할 경우 확인창을 띄우고, "예"를 누르면 전체 관리자에게 그룹 현황을 알립니다.
4. **[기간별 토큰 조회 탭] 기간별 사용량 조회** — 시작/종료 년월을 선택해서 조회하면, 같은 그룹 대상자별 그 기간 토큰 사용액과, 사용량 합계·기준 금액(인원수 × $100 × 개월수)·사용 가능 토큰(기준 금액 − 사용량 합계)을 보여줍니다.
5. **API 키 분리 관리** — Admin API 키는 소스코드에 포함되지 않고 `.env` 파일(런타임 환경변수)로만 주입
6. **이메일 기반 1회용 인증코드 로그인** — 비밀번호 없이, 이메일 입력 → 조직 구성원 여부 확인 → 6자리 인증코드 이메일 발송 → 코드 검증 방식으로 로그인. 이 조직에 소속되지 않은 이메일로는 로그인할 수 없습니다.

## 사전 준비물 (Anthropic 측)

- **Claude Enterprise** 플랜의 조직이어야 합니다 (Claude Console/Platform 조직은 Spend Limits API를 지원하지 않습니다).
- 조직의 **사용 크레딧(usage credits)** 이 활성화되어 있어야 합니다 (claude.ai 결제 설정에서 Primary Owner가 활성화).
- **Admin API 키** (`sk-ant-admin...`) 를 발급받아야 하며, 반드시 다음 스코프를 포함해야 합니다:
  - `read:spend_limits` (조회)
  - `write:spend_limits` (설정/해제)
  - `read:analytics` (**기간별 토큰 조회** 탭에서만 필요 — 없으면 그 탭만 오류가 나고, 센터별 토큰 관리 탭은 정상 동작합니다)

발급 방법: Claude Console → Organization Settings → Admin API Keys.

## 설치 및 실행

```bash
npm install
cp env/.env.example env/.env
# env/.env 파일을 열어 SESSION_SECRET 값을 채워주세요.
# (현재 개발/테스트 모드에서는 CLAUDE_ADMIN_API_KEY, SMTP_* 는 필요 없습니다.)

cp env/group_master.env.example env/group_master.env
# env/group_master.env 를 열어 "이메일, 그룹명" 형식으로 실제 사내 인원을 채워주세요. (git에 커밋되지 않습니다.)

npm run dev     # 개발 모드 (자동 재시작)
# 또는
npm run build && npm start   # 프로덕션 빌드 후 실행
```

서버는 기본적으로 `http://localhost:3000` 에서 서비스됩니다 (`env/.env`의 `PORT`로 변경 가능).
브라우저에서 열면 화면 상단의 **"Admin API 키"** 입력창에 `read:spend_limits`/`write:spend_limits` 스코프를 가진 Admin API 키를 직접 입력해야 조직 조회/로그인이 동작합니다.

## 민감한 설정 파일은 `env/` 폴더에 모아둔다

`.env`(세션 시크릿 등)와 `group_master.env`(사내 인원-그룹 매핑)는 모두 프로젝트 루트가 아니라 **`env/` 폴더** 안에 둡니다. 운영 서버에서는 이 폴더 하나에만 별도 권한을 걸어 다른 프로세스/사용자가 직접 열어볼 수 없게 하는 것을 권장합니다. 예:

```bash
chown -R appuser:appuser env
chmod 700 env
chmod 600 env/.env env/group_master.env
```

(서버를 실행하는 계정이 `appuser`라고 가정한 예시입니다. 실제 운영 계정/그룹에 맞게 바꾸세요.)

폴더 위치 자체를 리포지토리 밖으로 옮기고 싶다면, 서버를 띄우는 셸/서비스 유닛에서 `ENV_DIR` 환경변수로 지정할 수 있습니다 (`.env` 안에 넣는 것이 아니라, `.env`를 찾기 전에 필요하므로 반드시 셸/서비스 유닛 쪽에 설정해야 합니다):

```bash
ENV_DIR=/etc/claude-token-manager/env node dist/index.js
```

## 환경변수 (`env/.env`)

`env/.env.example` 파일을 참고하세요. 절대 `env/.env` 파일을 git에 커밋하지 마세요 (`.gitignore`에 이미 등록되어 있습니다).

| 변수 | 설명 |
| --- | --- |
| `SESSION_SECRET` | 로그인 세션(JWT) 서명용 비밀키. `openssl rand -hex 32` 등으로 생성한 무작위 값을 사용하세요. (필수) |
| `OTP_*` | 인증코드 길이/유효시간/최대 시도 횟수/재전송 쿨다운 설정. |
| `GROUP_MASTER_PATH` | `group_master.env` 경로를 `env/group_master.env`가 아닌 다른 곳으로 바꿀 때만 지정. |
| `GROUP_AVG_LIMIT_ALERT_THRESHOLD_USD` | 개인별 제한을 저장할 때, 그 그룹의 평균 토큰 제한이 이 금액(USD)을 초과하면 확인창을 띄웁니다. 기본값 100. |
| `ADMIN_NOTIFY_EMAILS` | 그룹 평균 초과를 확인하고 진행했을 때 그룹 현황을 알릴 전체 관리자 이메일. 콤마(,)로 구분해 2명 이상 지정할 수 있습니다. |
| `CLAUDE_ADMIN_API_KEY`, `SMTP_*` | **현재 개발/테스트 모드에서는 사용하지 않습니다** (주석 처리됨). 운영 전환 시 되돌리는 방법은 파일 안의 주석을 참고하세요. |

## 그룹 평균 토큰 제한 초과 확인 및 관리자 알림

개인별 제한을 저장(`PUT /api/members/:userId/limit`)할 때마다, 서버는 "이 값으로 저장하면 그 사람이 속한 그룹의 평균 토큰 제한이 얼마가 되는지"를 먼저 계산합니다.

- **평균 계산 방법**: 같은 그룹 멤버들의 현재 적용 중인 개인별 제한(effective amount) 중, 지금 저장하려는 사람의 값은 새로 입력한 금액으로 바꿔서 평균을 냅니다. 제한이 없는(무제한) 멤버는 평균 계산에서 제외합니다.
- 이 평균이 `GROUP_AVG_LIMIT_ALERT_THRESHOLD_USD` (기본 $100)를 **초과하면**, 아직 저장하지 않고 화면에 확인창이 뜹니다: *"이 값으로 저장하면 "OO" 그룹의 평균 토큰 제한이 $XXX 로 기준값 $100 을 초과합니다. 그래도 진행하시겠습니까?"*
  - **아니오** → 저장이 취소됩니다 (아무 것도 바뀌지 않습니다).
  - **예** → 그제서야 실제로 저장하고, 저장이 끝난 뒤의 최신 그룹 현황을 `ADMIN_NOTIFY_EMAILS` 에 등록된 전체 관리자에게 알립니다.
- 초과하지 않으면 확인창 없이 바로 저장됩니다.
- **[개발/테스트 전용]** 지금은 관리자에게 실제 메일을 보내지 않고, 그 내용(그룹명/평균/기준값/받는 사람/그룹 멤버별 현황)을 그대로 화면 알림창으로 보여줍니다. 운영 전환 시 `src/routes/members.ts` 에서 주석 처리된 `sendGroupAverageAlertEmail(adminNotification)` 호출을 복원하면, `src/services/mailer.ts` 에 이미 구현된 메일 발송 함수가 그 자리에서 실제로 발송합니다. (SMTP 설정도 함께 복원해야 합니다.)
- 이 확인/평균 계산은 서버가 매번 최신 데이터로 다시 계산합니다 — 화면에 떠 있는 확인창은 그 시점의 계산 결과이며, 실제 저장은 "예"를 눌렀을 때 다시 한번 서버에서 확정됩니다.

## 기간별 토큰 조회 탭

화면 상단 탭에서 **센터별 토큰 관리**(기존 화면)와 **기간별 토큰 조회**를 전환할 수 있습니다. 기간별 토큰 조회 탭은:

1. 시작 년/월, 종료 년/월(둘 다 포함)을 선택하고 **조회**를 누릅니다.
2. 로그인한 사람과 같은 그룹의 대상자 목록을, 센터별 토큰 관리 탭과 동일한 그룹 판정 방식(`env/group_master.env` + Claude Enterprise 실제 RBAC 그룹)으로 보여줍니다. 다만 여기서는 "현재 적용 중인 제한"이 아니라 **그 기간 동안 실제로 사용한 금액**을 보여줍니다 — Anthropic Analytics API(`GET /v1/organizations/analytics/user_cost_report`)로 조회합니다.
3. 표 맨 아래에 세 값을 계산해서 보여줍니다:
   - **사용량 합계** — 대상자 전원의 그 기간 사용액을 더한 값.
   - **기준 금액** — `그룹 인원수 × 인당 월 한도($100, `GROUP_AVG_LIMIT_ALERT_THRESHOLD_USD`) × 선택한 개월 수`. (이 "인당 월 $100" 값은 위 "그룹 평균 토큰 제한 초과 확인" 기능과 같은 설정값을 그대로 씁니다 — 별도로 관리하고 싶다면 `src/routes/usage.ts` 에서 다른 환경변수를 참조하도록 바꿔주세요.)
   - **사용 가능 토큰** — 기준 금액에서 사용량 합계를 뺀 값(음수가 나올 수도 있습니다 — 이미 예산을 초과했다는 뜻입니다).
4. Admin API 키에 **`read:analytics` 스코프**가 없으면 이 탭에서만 오류(`502`, "Admin API 키에 read:analytics 스코프가 있는지 확인해주세요")가 나고, 원인이 화면에 그대로 표시됩니다.

## 로그인 흐름

1. 사용자가 화면 상단에서 Admin API 키를 입력하고, 자신의 이메일을 입력합니다.
2. 서버는 그 Admin API 키로 조직 구성원 목록(`GET /v1/organizations/users`)을 조회해, 입력한 이메일이 실제로 이 조직의 구성원인지 확인합니다. (Admin API 키는 저장되지 않고 해당 요청에만 사용됩니다.)
3. 구성원이 맞으면 6자리 인증코드를 생성해 메모리에 저장(해시)합니다.
   - **[개발/테스트 전용]** 이메일 발송 대신 발급된 코드를 API 응답에 그대로 담아 화면에 노출합니다. 운영 전환 시 이메일 발송으로 되돌려야 합니다.
   - 조직 구성원이 아닌 이메일에는 코드를 발급하지 않지만, 이메일 존재 여부를 외부에 노출하지 않기 위해 응답 메시지는 항상 동일합니다.
4. 사용자가 (화면에 표시된) 인증코드를 입력하면 서버가 검증 후, httpOnly + `SameSite=Strict` 쿠키에 서명된 세션(JWT)을 발급합니다.
5. 이후 모든 `/api/members/*` 요청은 이 세션 쿠키와 Admin API 키 헤더가 모두 있어야 접근할 수 있습니다. 조회/변경 대상은 로그인한 사람과 `env/group_master.env` 상 같은 그룹인 사람으로 한 번 더 제한됩니다 (아래 "소속 그룹은 어디서, 누가 조회되는가" 참고).

### 알아둘 점 (내부 도구로서의 트레이드오프)

- 인증코드는 **단일 프로세스 메모리**에 저장됩니다. 서버를 재시작하면 발급된 코드가 모두 무효화됩니다. 여러 인스턴스로 스케일 아웃하려면 Redis 등 공유 저장소로 교체해야 합니다.
- 이메일 발송 성공/실패와 무관하게 API 응답 메시지는 동일하게 유지되어 사용자 열거(enumeration) 공격을 방어하지만, 실제 발급 시도 여부(재전송 쿨다운 등)까지 완전히 감추지는 않습니다. 순수 내부망 배포를 전제로 한 실용적 타협입니다.
- 조직 구성원 목록은 (Admin API 키별로) 30초 TTL로 캐시됩니다. 유효 스펜드 제한(`/spend_limits/effective`)은 매 요청마다 최신 값을 가져옵니다. `group_master.env` 는 파일이 바뀔 때만 다시 읽습니다.
- **[개발/테스트 전용]** 화면에 노출되는 인증코드와 입력창에 넣는 Admin API 키는 누구나 화면을 보면 알 수 있으므로, 신뢰할 수 없는 사람이 접근 가능한 환경에서는 절대 이 모드로 배포하지 마세요.

## 소속 그룹은 어디서, 누가 조회되는가

"소속 그룹"은 **두 곳을 함께** 봅니다. 둘 중 하나라도 같은 그룹명으로 나오면 로그인한 사람과 같은 그룹으로 취급합니다.

1. **`env/group_master.env`** — 수동으로 관리하는 "이메일 -> 그룹명" 매핑. 이 파일에 매핑이 있으면 이걸 우선 사용합니다.
2. **Claude Enterprise에 실제 등록된 RBAC 그룹** — `GET /v1/organizations/rbac_groups` + `GET /v1/organizations/rbac_groups/{id}/members` 로 조회. `env/group_master.env` 에 없는 사람도, Claude Enterprise 쪽에 이미 등록된 그룹명이 로그인한 사람의 그룹명과 같으면 함께 조회됩니다.

예시 (`env/group_master.env`):
```
skim@lgacademy.com, "업무지원/재경"
sjyang@lgacademy.com, "리더교육센터"
```
이 상태에서 `jyalee@lgacademy.com` 이 파일에는 없지만 Claude Enterprise 콘솔에서 "업무지원/재경" 그룹으로 등록되어 있다면, `skim@lgacademy.com` 으로 로그인했을 때 jyalee도 함께 조회됩니다 (그룹명 문자열이 정확히 같아야 합니다).

- **로그인한 사람과 같은 그룹명을 가진 사람만 조회됩니다.** 로그인 이메일로 본인의 그룹을 먼저 찾고(파일 우선, 없으면 Anthropic 그룹), 같은 그룹명인 다른 사람만 대시보드에 나타납니다. 서로 다른 그룹인 사람들은 서로 보이지 않습니다.
- 로그인한 사람의 그룹을 파일에서도, Anthropic 쪽에서도 찾을 수 없으면 조회 결과가 빈 목록으로 나오고 그 이유가 화면에 안내됩니다.
- 이 그룹 제한은 목록 조회뿐 아니라 개인별 제한 설정/해제(PUT·DELETE)에도 적용됩니다. 다른 그룹의 `userId`로 직접 요청해도 서버가 `403`으로 거부합니다.
- Anthropic RBAC 그룹 조회가 이 Admin API 키의 권한/스코프 문제로 실패해도 전체 조회가 막히지는 않습니다 — `env/group_master.env` 매핑만으로 계속 동작하고, 화면에 "Claude Enterprise 그룹 정보를 가져오지 못했습니다 (...)" 경고가 뜹니다.
- `env/group_master.env` 에서 `#` 로 시작하는 줄과 빈 줄은 무시됩니다. 이메일만 있고 그룹명이 없는 줄도 무시됩니다. 파일을 수정하면 서버 재시작 없이 다음 조회부터 바로 반영됩니다(파일 수정 시각 기준으로 캐시를 갱신).
- 이 파일은 사내 인원 구성이 담겨 있으므로 git에 커밋되지 않습니다 (`.gitignore`). 형식만 보여주는 `env/group_master.env.example` 은 커밋되어 있습니다.
- 파일 경로를 바꾸고 싶으면 `env/.env`에 `GROUP_MASTER_PATH=/절대/경로/group_master.env` 를 추가하세요.
- **같은 그룹인데 안 보이는 사람이 있다면:** `env/group_master.env` 에는 그 그룹으로 등록돼 있지만 조직 구성원 목록(`GET /v1/organizations/users`)에서는 찾지 못했다는 뜻일 수 있습니다. 화면에 어떤 이메일이 빠졌는지 경고로 표시됩니다 — 표기(오타, 다른 도메인 등)가 정확히 같은지, 그 계정이 실제로 이 조직에 속해 있는지 확인해주세요. `env/group_master.env` 에도 없고 Claude Enterprise 그룹으로도 확인 안 되는 경우라면, Claude Enterprise 콘솔에서 그 계정의 그룹명이 정말 동일한 문자열(공백/오탈자 없이)로 등록되어 있는지 확인해주세요.

### 그룹 기준 제한 표시의 한계

"그룹 기준 제한" 열은 Anthropic 의 `GET /v1/organizations/spend_limits/effective` 응답에서 그 멤버의 제한이 실제로 그룹(`rbac_group`)에서 상속되고 있을 때만 값을 알 수 있습니다. 조직이 Anthropic 쪽에서 그룹 기반 스펜드 제한을 아예 쓰지 않는다면(등급/조직 기본값만 쓰는 경우), 이 열은 항상 "확인 불가"로 표시됩니다 — API 한계가 아니라 애초에 존재하지 않는 값입니다.

## API 요약 (내부적으로 호출하는 Anthropic Admin API)

| 용도 | 메서드/경로 |
| --- | --- |
| 구성원 목록 | `GET /v1/organizations/users` |
| RBAC 그룹 목록 | `GET /v1/organizations/rbac_groups` |
| RBAC 그룹 멤버 목록 | `GET /v1/organizations/rbac_groups/{group_id}/members` |
| 멤버별 유효 토큰 제한 | `GET /v1/organizations/spend_limits/effective` |
| 개인별 제한 설정(upsert) | `POST /v1/organizations/spend_limits` |
| 개인별 제한 해제 | `DELETE /v1/organizations/spend_limits/{spend_limit_id}` |
| 기간별 사용자 지출 리포트 (기간별 토큰 조회 탭) | `GET /v1/organizations/analytics/user_cost_report` |

("소속 그룹"은 위 RBAC 그룹 API와 로컬 `env/group_master.env` 파일을 함께 참고합니다. RBAC 그룹 API가 실패해도 `env/group_master.env` 매핑만으로 동작합니다.)

금액은 조직 결제 통화의 **최소 단위(minor unit, 예: 센트) 문자열**로 주고받습니다. 화면에는 이해하기 쉬운 소수(예: `500.00 USD`)로 환산해 보여줍니다.

## 배포 시 주의사항

- `env/.env`, `env/group_master.env` 파일은 배포 서버에서만 생성하고, 소스 저장소에는 절대 포함하지 마세요. 가능하면 `env/` 폴더 권한을 서버 실행 계정만 읽을 수 있도록 잠그세요 (위 "민감한 설정 파일은 `env/` 폴더에 모아둔다" 참고).
- 사내 전용으로 운영할 경우에도 HTTPS 뒤에서 서비스하는 것을 권장합니다 (`NODE_ENV=production`으로 설정하면 세션 쿠키에 `Secure` 속성이 붙습니다).
- Admin API 키는 조직 전체의 스펜드 제한을 변경할 수 있는 매우 민감한 자격 증명입니다. 이 서비스가 실행되는 서버 접근 권한을 최소한으로 유지하세요.
