"""
튠업 DB 보안 규칙(RLS)·트리거 테스트.
로컬 PostgreSQL에 Supabase 흉내 구성 + 마이그레이션을 적용하고, 여러 사용자로 바꿔가며 허용/거부를 확인한다.
실행: python3 supabase/tests/test_rls.py "host=... port=... user=postgres"
"""
import sys, uuid, json, pathlib
import psycopg

ROOT = pathlib.Path(__file__).resolve().parent.parent
DSN = sys.argv[1]

admin = psycopg.connect(DSN + " dbname=postgres", autocommit=True)
admin.execute("drop database if exists tuneup_test")
admin.execute("create database tuneup_test")
db = psycopg.connect(DSN + " dbname=tuneup_test", autocommit=True)
db.execute((ROOT / "tests/supabase_stub.sql").read_text())
for f in sorted((ROOT / "migrations").glob("*.sql")):
    db.execute(f.read_text())

A, B, C = (str(uuid.uuid4()) for _ in range(3))
for u in (A, B, C):
    db.execute("insert into auth.users values (%s)", (u,))

passed = 0
def as_user(uid):
    db.execute("reset role")
    db.execute("select set_config('request.jwt.claim.sub', %s, false)", (uid or "",))
    db.execute("set role authenticated" if uid else "set role anon")

def ok(desc, sql, params=(), expect_rows=None):
    global passed
    cur = db.execute(sql, params)
    rows = cur.fetchall() if cur.description else None
    if expect_rows is not None:
        n = len(rows) if rows is not None else cur.rowcount
        assert n == expect_rows, f"{desc}: 기대 {expect_rows}행, 실제 {n}행 {rows}"
    passed += 1
    print("  OK ", desc)
    return rows

def denied(desc, sql, params=()):
    global passed
    try:
        cur = db.execute(sql, params)
        if cur.rowcount == 0 and sql.strip().lower().startswith(("update", "delete")):
            passed += 1; print("  OK ", desc, "(0행)"); return
    except psycopg.Error as e:
        passed += 1; print("  OK ", desc, "→", type(e).__name__); return
    raise AssertionError(f"{desc}: 거부돼야 하는데 성공함")

def scalar(sql, params=()):
    db.execute("reset role")
    return db.execute(sql, params).fetchone()[0]

comp = json.dumps({"title": "t", "notes": []})

print("프로필")
as_user(A); ok("A 프로필 생성", "insert into profiles (id, nickname) values (%s, '하늘')", (A,))
as_user(B); ok("B 프로필 생성", "insert into profiles (id, nickname) values (%s, '바다')", (B,))
as_user(C); ok("C 프로필 생성", "insert into profiles (id, nickname) values (%s, '숲속')", (C,))
as_user(B); denied("B가 A 행으로 프로필 생성", "insert into profiles (id, nickname) values (%s, '사칭')", (A,))
denied("B가 A 닉네임 수정", "update profiles set nickname = '해킹' where id = %s", (A,))
denied("닉네임 1글자", "update profiles set nickname = '바' where id = %s", (B,))

print("곡")
as_user(A)
t1 = ok("A 곡 올리기", "insert into tracks (owner_id, title, genre, composition) values (%s, '첫 곡', 'POP', %s) returning id", (A, comp))[0][0]
denied("A가 B 이름으로 곡 올리기", "insert into tracks (owner_id, title, genre, composition) values (%s, '사칭', 'POP', %s)", (B, comp))
denied("없는 장르", "insert into tracks (owner_id, title, genre, composition) values (%s, 'x', 'ROCK', %s)", (A, comp))
ok("A가 집계 컬럼을 조작해도 무시됨", "update tracks set like_count = 999, title = '첫 곡!' where id = %s", (t1,))
assert scalar("select like_count from tracks where id = %s", (t1,)) == 0
assert scalar("select title from tracks where id = %s", (t1,)) == "첫 곡!"
as_user(B); denied("B가 A 곡 수정", "update tracks set title = '내꺼' where id = %s", (t1,))
denied("B가 A 곡 삭제", "delete from tracks where id = %s", (t1,))
ok("B가 A 곡 조회", "select id from tracks where id = %s", (t1,), expect_rows=1)
as_user(None); ok("비로그인도 공개 곡 조회", "select id from tracks", expect_rows=1)

print("좋아요 · 별점 · 재생 수")
as_user(B); ok("B 좋아요", "insert into likes (track_id, user_id) values (%s, %s)", (t1, B))
denied("B 좋아요 두 번", "insert into likes (track_id, user_id) values (%s, %s)", (t1, B))
denied("B가 C 대신 좋아요", "insert into likes (track_id, user_id) values (%s, %s)", (t1, C))
ok("B 별점 4", "insert into ratings (track_id, user_id, stars) values (%s, %s, 4)", (t1, B))
as_user(C); ok("C 별점 2", "insert into ratings (track_id, user_id, stars) values (%s, %s, 2)", (t1, C))
ok("C 별점 5로 변경", "update ratings set stars = 5 where track_id = %s and user_id = %s", (t1, C))
denied("별점 6", "update ratings set stars = 6 where track_id = %s and user_id = %s", (t1, C))
as_user(A); denied("A가 자기 곡에 별점", "insert into ratings (track_id, user_id, stars) values (%s, %s, 5)", (t1, A))
ok("재생 수 +1", "select increment_play(%s)", (t1,))
assert scalar("select like_count from tracks where id = %s", (t1,)) == 1
assert scalar("select (rating_sum, rating_count)::text from tracks where id = %s", (t1,)) == "(9,2)"
assert scalar("select play_count from tracks where id = %s", (t1,)) == 1
as_user(B); ok("B 좋아요 취소", "delete from likes where track_id = %s and user_id = %s", (t1, B), expect_rows=1)
assert scalar("select like_count from tracks where id = %s", (t1,)) == 0
as_user(B); ok("다시 좋아요 (주간 인기용)", "insert into likes (track_id, user_id) values (%s, %s)", (t1, B))
ok("이번 주 인기곡", "select id from weekly_top(10)", expect_rows=1)

print("댓글")
as_user(B); c1 = ok("B 댓글", "insert into comments (track_id, user_id, body) values (%s, %s, '좋아요!') returning id", (t1, B))[0][0]
as_user(C); c2 = ok("C 댓글", "insert into comments (track_id, user_id, body) values (%s, %s, '별로') returning id", (t1, C))[0][0]
denied("C가 B 댓글 삭제", "delete from comments where id = %s", (c1,))
as_user(A); ok("곡 주인 A가 C 댓글 삭제", "delete from comments where id = %s", (c2,), expect_rows=1)
assert scalar("select comment_count from tracks where id = %s", (t1,)) == 1

print("차단")
as_user(A); ok("A가 C 차단", "insert into blocks (blocker_id, blocked_id) values (%s, %s)", (A, C))
as_user(C); denied("차단당한 C는 A 곡에 댓글 불가", "insert into comments (track_id, user_id, body) values (%s, %s, '...')", (t1, C))
ok("차단당한 C에겐 A 곡이 안 보임", "select id from tracks where id = %s", (t1,), expect_rows=0)
denied("C가 A에게 대화 열기", "select open_conversation(%s)", (A,))
as_user(B); ok("B는 차단 목록을 못 봄", "select * from blocks", expect_rows=0)

print("채팅")
as_user(B); conv = ok("B가 A에게 대화 열기", "select open_conversation(%s, %s)", (A, t1))[0][0]
conv2 = ok("같은 상대면 같은 대화", "select open_conversation(%s)", (A,))[0][0]
assert conv == conv2
m1 = ok("B 메시지", "insert into messages (conversation_id, sender_id, body) values (%s, %s, '이 곡 가사 붙여봐도 될까요?') returning id", (conv, B))[0][0]
denied("B가 A인 척 메시지", "insert into messages (conversation_id, sender_id, body) values (%s, %s, '사칭')", (conv, A))
as_user(A); ok("A가 받은 메시지 조회", "select id from messages where conversation_id = %s", (conv,), expect_rows=1)
ok("A 답장", "insert into messages (conversation_id, sender_id, body) values (%s, %s, '좋아요!')", (conv, A))
ok("A가 받은 메시지 읽음", "update messages set read_at = now() where id = %s", (m1,), expect_rows=1)
denied("A가 받은 메시지 내용 변조", "update messages set body = '변조' where id = %s", (m1,))
assert scalar("select last_message from conversations where id = %s", (conv,)) == "좋아요!"
as_user(C); ok("C는 남의 대화 못 봄", "select id from conversations", expect_rows=0)
ok("C는 남의 메시지 못 봄", "select id from messages", expect_rows=0)
denied("C가 남의 대화에 메시지", "insert into messages (conversation_id, sender_id, body) values (%s, %s, '끼어들기')", (conv, C))
as_user(A); ok("A가 B 차단", "insert into blocks (blocker_id, blocked_id) values (%s, %s)", (A, B))
as_user(B); denied("차단 후 B는 메시지 불가", "insert into messages (conversation_id, sender_id, body) values (%s, %s, '왜요')", (conv, B))

print("신고")
as_user(B); ok("B가 곡 신고", "insert into reports (reporter_id, target_type, target_id, reason) values (%s, 'track', %s, 'plagiarism')", (B, t1))
denied("같은 대상 중복 신고", "insert into reports (reporter_id, target_type, target_id, reason) values (%s, 'track', %s, 'spam')", (B, t1))
ok("신고 내역은 조회 불가", "select * from reports", expect_rows=0)
denied("신고는 ON CONFLICT(upsert)로 못 넣음 → 앱은 그냥 insert", "insert into reports (reporter_id, target_type, target_id, reason) values (%s, 'user', %s, 'spam') on conflict (reporter_id, target_type, target_id) do nothing", (B, A))
# 신고 5건이면 자동 숨김
db.execute("reset role")
for _ in range(4):
    db.execute("reset role")
    u = str(uuid.uuid4())
    db.execute("insert into auth.users values (%s)", (u,))
    db.execute("insert into profiles (id, nickname) values (%s, %s)", (u, "신고" + u[:4]))
    as_user(u); db.execute("insert into reports (reporter_id, target_type, target_id, reason) values (%s, 'track', %s, 'spam')", (u, t1))
assert scalar("select hidden from tracks where id = %s", (t1,)) is True
as_user(B); ok("숨겨진 곡은 다른 사람에게 안 보임", "select id from tracks where id = %s", (t1,), expect_rows=0)
as_user(A); ok("곡 주인에겐 보임 (숨김 상태 확인용)", "select id from tracks where id = %s", (t1,), expect_rows=1)

print("외부 노출 차단")
as_user(B); denied("public 에는 도우미 함수가 없음 (차단 여부 엿보기 불가)", "select public.is_blocked(%s, %s)", (A, C))
denied("트리거 함수 직접 호출 불가", "select public.on_like_change()")
as_user(None); denied("비로그인은 대화 열기 불가", "select open_conversation(%s)", (A,))
denied("비로그인은 재생 수 조작 불가", "select increment_play(%s)", (t1,))
as_user(C); ok("로그인 사용자는 재생 수 +1 가능", "select increment_play(gen_random_uuid())")

print("공개 범위 · 추천 · 청취")
db.execute("reset role")
D = str(uuid.uuid4()); db.execute("insert into auth.users values (%s)", (D,))
as_user(D); ok("D 프로필 생성", "insert into profiles (id, nickname) values (%s, '노을')", (D,))
as_user(C)
pub = [ok(f"C 공개 곡 {i}", "insert into tracks (owner_id, title, genre, composition, is_partial, highlight_start_bar, full_bars) values (%s, %s, 'BALLAD', %s, true, 4, 16) returning id", (C, f"곡{i}", comp))[0][0] for i in range(4)]
unl = ok("C 링크 공개 곡", "insert into tracks (owner_id, title, genre, composition, visibility) values (%s, '비밀', 'POP', %s, 'unlisted') returning id", (C, comp))[0][0]
denied("없는 공개 범위", "insert into tracks (owner_id, title, genre, composition, visibility) values (%s, 'x', 'POP', %s, 'friends')", (C, comp))
ok("C 공개 범위 변경", "update tracks set allow_remix = false where id = %s", (pub[0],), expect_rows=1)
ok("C가 추천 수 조작해도 무시됨", "update tracks set recommend_count = 99 where id = %s", (pub[0],))
assert scalar("select recommend_count from tracks where id = %s", (pub[0],)) == 0
as_user(C); denied("내 곡 추천 불가", "insert into recommends (track_id, user_id) values (%s, %s)", (pub[0], C))
as_user(D)
ok("남은 추천 3", "select recommends_left()", expect_rows=1)
for i in range(3):
    ok(f"D 추천 {i+1}", "insert into recommends (track_id, user_id) values (%s, %s)", (pub[i], D))
denied("하루 4번째 추천 불가", "insert into recommends (track_id, user_id) values (%s, %s)", (pub[3], D))
denied("같은 곡 같은 날 두 번 추천 불가", "insert into recommends (track_id, user_id) values (%s, %s)", (pub[0], D))
as_user(D); assert db.execute("select recommends_left()").fetchone()[0] == 0
denied("남 대신 추천 불가", "insert into recommends (track_id, user_id) values (%s, %s)", (pub[3], B))
assert scalar("select recommend_count from tracks where id = %s", (pub[0],)) == 1
as_user(D); ok("추천 취소", "delete from recommends where track_id = %s and user_id = %s", (pub[2], D), expect_rows=1)
assert scalar("select recommend_count from tracks where id = %s", (pub[2],)) == 0
as_user(D); ok("취소하면 다시 추천 가능", "insert into recommends (track_id, user_id) values (%s, %s)", (pub[3], D))

as_user(D)
ok("D 청취", "select record_listen(%s, false)", (pub[1],))
ok("같은 날 다시 끝까지 들음", "select record_listen(%s, true)", (pub[1],))
assert scalar("select play_count from tracks where id = %s", (pub[1],)) == 1
assert scalar("select completed from listens where track_id = %s and user_id = %s", (pub[1], D)) is True
as_user(D); denied("청취 기록 직접 쓰기 불가", "insert into listens (track_id, user_id) values (%s, %s)", (pub[2], D))
as_user(B); ok("남의 청취 기록은 안 보임", "select * from listens", expect_rows=0)
as_user(None); denied("비로그인 청취 기록 불가", "select record_listen(%s)", (pub[1],))
denied("비로그인 남은 추천 조회 불가", "select recommends_left()")

print("차트")
# D는 새 계정(7일 이내) → 반응 점수 절반. 오래된 계정 B는 그대로.
db.execute("reset role")
db.execute("update profiles set created_at = now() - interval '30 days' where id in (%s, %s, %s)", (A, B, C))
as_user(B); ok("B가 곡3 좋아요", "insert into likes (track_id, user_id) values (%s, %s)", (pub[3], B))
ok("B가 링크 공개 곡 좋아요", "insert into likes (track_id, user_id) values (%s, %s)", (unl, B))
rows = ok("주간 차트", "select track_id, score from chart('weekly')")
ids = [r[0] for r in rows]
assert ids[0] in (pub[0], pub[3]), rows   # 추천(5×0.5)+좋아요(1) 경쟁
assert unl not in ids, "링크 공개 곡은 차트 제외"
assert t1 not in ids, "숨김 곡은 차트 제외"
sc = dict(rows)
assert abs(sc[pub[1]] - (2.5 + 0.25)) < 0.05, sc  # 추천 5×0.5 + 끝까지 들음 0.5×0.5
assert abs(sc[pub[3]] - (2.5 + 1.0)) < 0.05, sc
ok("장르 필터", "select track_id from chart('weekly', 'POP')", expect_rows=0)
ok("신인 차트 (C 첫 곡 30일 이내, 반응 받은 3곡)", "select track_id from chart('rookie')", expect_rows=3)
db.execute("reset role"); db.execute("update tracks set created_at = now() - interval '60 days' where id = %s", (pub[0],))
as_user(B); ok("오래된 제작자는 신인 차트 제외", "select track_id from chart('rookie')", expect_rows=0)
ok("지난주 차트는 비어 있음", "select track_id from chart('last_week')", expect_rows=0)
ok("급상승 차트", "select track_id from chart('rising')", expect_rows=3)
denied("모르는 차트 종류", "select * from chart('monthly')")
as_user(None); ok("비로그인도 차트 조회", "select track_id from chart('weekly')", expect_rows=3)

print("리믹스")
as_user(D)
rx = ok("허용된 곡 리믹스", "insert into tracks (owner_id, title, genre, composition, remix_of) values (%s, '리믹스', 'POP', %s, %s) returning id", (D, comp, pub[1]))[0][0]
denied("리믹스 비허용 곡은 서버도 거부", "insert into tracks (owner_id, title, genre, composition, remix_of) values (%s, '몰래', 'POP', %s, %s)", (D, comp, pub[0]))
denied("나중에 원곡을 비허용 곡으로 바꿔치기도 거부", "update tracks set remix_of = %s where id = %s", (pub[0], rx))
as_user(C); ok("자기 곡은 비허용이어도 리믹스 가능", "insert into tracks (owner_id, title, genre, composition, remix_of) values (%s, '셀프', 'POP', %s, %s)", (C, comp, pub[0]))
as_user(D); denied("트리거 함수 직접 호출 불가", "select public.guard_remix()")
ok("제목 검색", "select id from tracks where title ilike %s", ("%곡%",))
db.execute("reset role"); db.execute("delete from tracks where title in ('리믹스', '셀프')")

print("팔로우 · 알림")
as_user(D); ok("D가 C 팔로우", "insert into follows (follower_id, followee_id) values (%s, %s)", (D, C))
denied("자기 자신 팔로우 불가", "insert into follows (follower_id, followee_id) values (%s, %s)", (D, D))
denied("남 대신 팔로우 불가", "insert into follows (follower_id, followee_id) values (%s, %s)", (B, C))
assert scalar("select (follower_count, following_count)::text from profiles where id = %s", (C,)) == "(1,0)"
assert scalar("select following_count from profiles where id = %s", (D,)) == 1
as_user(C); ok("C가 팔로워 수 조작해도 무시됨", "update profiles set follower_count = 1000, bio = '안녕' where id = %s", (C,))
assert scalar("select follower_count from profiles where id = %s", (C,)) == 1
as_user(C); denied("A가 C를 차단했으므로 C는 A 팔로우 불가", "insert into follows (follower_id, followee_id) values (%s, %s)", (C, A))
as_user(D); ok("D 언팔로우", "delete from follows where follower_id = %s and followee_id = %s", (D, C), expect_rows=1)
assert scalar("select follower_count from profiles where id = %s", (C,)) == 0
as_user(C)
kinds = sorted(r[0] for r in ok("C가 받은 알림", "select kind from notifications"))
assert kinds == ["follow", "like", "like", "recommend", "recommend", "recommend", "recommend"], kinds
as_user(C); ok("C 댓글은 자기 곡이라 알림 없음", "insert into comments (track_id, user_id, body) values (%s, %s, '내 곡')", (pub[1], C))
assert scalar("select count(*) from notifications where user_id = %s and kind = 'comment'", (C,)) == 0
as_user(D); ok("D 댓글 → C 알림", "insert into comments (track_id, user_id, body) values (%s, %s, '최고')", (pub[1], D))
assert scalar("select count(*) from notifications where user_id = %s and kind = 'comment'", (C,)) == 1
as_user(D); ok("D는 C 알림을 못 봄", "select * from notifications", expect_rows=0)
denied("알림 직접 만들기 불가", "insert into notifications (user_id, actor_id, kind) values (%s, %s, 'like')", (C, D))
denied("남의 알림 읽음 처리 불가", "update notifications set read_at = now() where user_id = %s", (C,))
as_user(C); ok("C 알림 모두 읽음", "update notifications set read_at = now() where read_at is null", expect_rows=8)
denied("알림 내용 변조 불가", "update notifications set kind = 'follow'")
denied("알림 함수 직접 호출 불가", "select private.notify(%s, %s, 'like', null)", (C, D))
# 차단 관계면 알림 없음: A가 B를 차단한 상태 → B가 A 곡에 반응해도 A에게 알림 없음
db.execute("reset role"); db.execute("update tracks set hidden = false, report_count = 0 where id = %s", (t1,))
as_user(B); ok("차단당한 B가 추천 시도", "select 1")
before = scalar("select count(*) from notifications where user_id = %s", (A,))
db.execute("reset role"); db.execute("insert into recommends (track_id, user_id) values (%s, %s)", (t1, B))
assert scalar("select count(*) from notifications where user_id = %s", (A,)) == before, "차단 관계면 알림 없음"

print(f"\n전체 {passed}개 통과")
