# 관리자(트레이너) 계정 · 이메일 인증 설정

가입 기본 역할은 **회원(client)** 입니다. 트레이너 전용 기능(트레이너 스튜디오·코칭 노트)은
역할이 `trainer` 인 계정만 사용할 수 있어요(보기 모드의 "트레이너" 토글이 회원 계정에선 잠김).

## 1. 데모/가짜 데이터 정리

1. Supabase → **SQL Editor → New query** → `supabase/cleanup_demo.sql` 붙여넣기 → **Run**
2. 보조 회원(코치 하늘·이민서·조다온·김아리), 모든 게시글·댓글·응원·코치 코멘트, 채팅방·메시지가 삭제돼
   **빈 초기 상태**가 됩니다. (본인 측정 데이터는 유지)

## 2. 관리자(트레이너) 계정 만들기

1. Supabase → **Authentication → Users → Add user → Create new user**
   - **Email**: `knm9907@hanyang.ac.kr`
   - **Password**: (원하는 비밀번호)
   - **Auto Confirm User**: ✅ 체크 (메일 확인 없이 바로 활성)
   - **Create user**
2. SQL Editor에서 역할을 트레이너로 승격:
   ```sql
   update public.profiles
     set role = 'trainer', name = '관리자', initials = '관리'
     where id = (select id from auth.users where email = 'knm9907@hanyang.ac.kr');
   ```
3. ✅ 확인:
   ```sql
   select p.name, p.role from public.profiles p
     join auth.users u on u.id = p.id where u.email = 'knm9907@hanyang.ac.kr';
   ```
   → `role = trainer` 이면 완료. 이 계정으로 로그인하면 보기 모드에서 **트레이너** 토글이 활성화됩니다.

> ⚠️ 비밀번호는 대시보드에서 직접 입력하세요. 코드/깃/문서에 평문 비밀번호를 넣지 마세요.

## 3. 회원가입 이메일 인증 켜기

1. Supabase → **Authentication → Sign In / Providers → Email**
2. **Confirm email** 을 **ON** 으로 (가입 시 인증 메일 발송 → 링크 클릭해야 로그인 가능)
3. **Authentication → URL Configuration**:
   - **Site URL**: 배포 도메인(Vercel) 또는 `http://localhost:5173`
   - **Redirect URLs**: 위 도메인 + `/**`
4. 앱의 회원가입은 이미 이 흐름을 처리합니다 — 인증 메일이 발송되면 "확인 메일을 보냈어요…" 안내가 표시돼요.

### 운영용 메일 발송(권장)
- Supabase 기본 메일은 **시간당 발송량 제한**이 있고 스팸함으로 갈 수 있어요.
- 실제 서비스라면 **Authentication → Emails → SMTP** 에 커스텀 SMTP(예: Resend, SendGrid, AWS SES)를
  연결하세요. 메일 템플릿(확인/비밀번호 재설정)도 거기서 한국어로 수정 가능합니다.

## 역할별 접근 정리

| 기능 | 회원(client) | 트레이너(trainer) |
|---|---|---|
| 나의 건강·커뮤니티·채팅·멤버 | ✅ | ✅ |
| 보기 모드 "트레이너" 토글 | 🔒 잠김 | ✅ |
| 트레이너 스튜디오(로스터·코칭 노트) | ❌ | ✅ (코칭 노트 전송은 RLS로도 trainer만 허용) |

> 보기 모드 토글은 UI 가드이고, **코칭 노트 전송은 DB(RLS `coach_notes insert`)에서도 trainer 만 허용**되어
> 이중으로 보호됩니다.
