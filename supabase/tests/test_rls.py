"""
멜로딜 DB 보안 규칙(RLS)·트리거 테스트.
로컬 PostgreSQL에 Supabase 흉내 구성 + 마이그레이션을 적용하고, 여러 사용자로 바꿔가며 허용/거부를 확인한다.
실행: python3 supabase/tests/test_rls.py "host=... port=... user=postgres"
"""
import sys, uuid, json, pathlib
import psycopg

ROOT = pathlib.Path(__file__).resolve().parent.parent
DSN = sys.argv[1]

admin = psycopg.connect(DSN + " dbname=postgres", autocommit=True)
admin.execute("drop database if exists melodeal_test")
admin.execute("create database melodeal_test")
db = psycopg.connect(DSN + " dbname=melodeal_test", autocommit=True)
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

print(f"\n전체 {passed}개 통과")
