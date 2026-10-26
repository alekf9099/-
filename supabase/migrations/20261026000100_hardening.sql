-- 보안·성능 점검(Supabase Advisors) 반영
-- 1) RLS 도우미 함수는 외부 API(/rest/v1/rpc)에 노출되지 않는 private 스키마로 옮긴다
--    (정책은 함수 OID로 연결돼 있어 스키마를 옮겨도 그대로 동작)
create schema if not exists private;
grant usage on schema private to anon, authenticated;

alter function public.is_blocked(uuid, uuid) set schema private;
alter function public.track_owner(uuid) set schema private;
alter function public.is_participant(uuid) set schema private;

revoke execute on function private.is_blocked(uuid, uuid), private.track_owner(uuid), private.is_participant(uuid) from public;
grant execute on function private.is_blocked(uuid, uuid), private.track_owner(uuid), private.is_participant(uuid) to anon, authenticated;

-- open_conversation 본문은 이름으로 호출하므로 새 위치로 갱신
create or replace function public.open_conversation(p_other uuid, p_track uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
    me uuid := auth.uid();
    a uuid;
    b uuid;
    conv uuid;
begin
    if me is null or p_other is null or me = p_other then
        raise exception 'invalid participants';
    end if;
    if private.is_blocked(me, p_other) then
        raise exception 'blocked';
    end if;
    a := least(me, p_other);
    b := greatest(me, p_other);
    insert into conversations (user_a, user_b, track_id) values (a, b, p_track)
    on conflict (user_a, user_b) do update set track_id = coalesce(excluded.track_id, conversations.track_id)
    returning id into conv;
    return conv;
end $$;

-- 2) 트리거 함수는 직접 호출 불가 (트리거로만 실행)
revoke execute on function
    public.on_like_change(), public.on_rating_change(), public.on_comment_change(),
    public.on_message_insert(), public.on_report_insert(), public.guard_track_counters()
from public, anon, authenticated;

-- 3) 앱이 쓰는 RPC는 로그인한 사용자만
revoke execute on function public.increment_play(uuid), public.open_conversation(uuid, uuid) from public, anon;
grant execute on function public.increment_play(uuid), public.open_conversation(uuid, uuid) to authenticated;

alter function public.guard_track_counters() set search_path = public;

-- 4) RLS 정책: auth.uid()를 행마다가 아니라 쿼리당 한 번만 계산
alter policy "내 프로필 생성" on public.profiles with check (id = (select auth.uid()));
alter policy "내 프로필 수정" on public.profiles using (id = (select auth.uid())) with check (id = (select auth.uid()));

alter policy "공개 곡 조회 (내가 차단한 사람 제외)" on public.tracks
    using ((not hidden and not private.is_blocked((select auth.uid()), owner_id)) or owner_id = (select auth.uid()));
alter policy "내 곡 올리기" on public.tracks with check (owner_id = (select auth.uid()));
alter policy "내 곡 수정" on public.tracks using (owner_id = (select auth.uid()));
alter policy "내 곡 삭제" on public.tracks using (owner_id = (select auth.uid()));

alter policy "좋아요 누르기" on public.likes with check (user_id = (select auth.uid()));
alter policy "좋아요 취소" on public.likes using (user_id = (select auth.uid()));

alter policy "별점 주기 (내 곡 제외)" on public.ratings
    with check (user_id = (select auth.uid()) and private.track_owner(track_id) is distinct from (select auth.uid()) and private.track_owner(track_id) is not null);
alter policy "별점 바꾸기" on public.ratings using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "별점 취소" on public.ratings using (user_id = (select auth.uid()));

alter policy "댓글 조회" on public.comments
    using ((not hidden and not private.is_blocked((select auth.uid()), user_id)) or user_id = (select auth.uid()));
alter policy "댓글 쓰기 (숨김 곡·곡 주인과 차단 관계면 불가)" on public.comments
    with check (
        user_id = (select auth.uid())
        and private.track_owner(track_id) is not null
        and not private.is_blocked((select auth.uid()), private.track_owner(track_id))
    );
alter policy "댓글 삭제 (작성자 또는 곡 주인)" on public.comments
    using (user_id = (select auth.uid()) or exists (select 1 from public.tracks t where t.id = track_id and t.owner_id = (select auth.uid())));

alter policy "내 차단 목록" on public.blocks using (blocker_id = (select auth.uid()));
alter policy "차단하기" on public.blocks with check (blocker_id = (select auth.uid()));
alter policy "차단 풀기" on public.blocks using (blocker_id = (select auth.uid()));

alter policy "신고하기" on public.reports with check (reporter_id = (select auth.uid()));

alter policy "내 대화만 조회" on public.conversations using ((select auth.uid()) in (user_a, user_b));

alter policy "메시지 보내기 (참여자 · 차단 아님)" on public.messages
    with check (
        sender_id = (select auth.uid())
        and private.is_participant(conversation_id)
        and not exists (
            select 1 from public.conversations c
            where c.id = conversation_id and private.is_blocked(c.user_a, c.user_b)
        )
    );
alter policy "받은 메시지 읽음 표시" on public.messages
    using (private.is_participant(conversation_id) and sender_id <> (select auth.uid()));

-- 5) 외래키 인덱스
create index if not exists blocks_blocked_idx on public.blocks (blocked_id);
create index if not exists comments_user_idx on public.comments (user_id);
create index if not exists conversations_track_idx on public.conversations (track_id);
create index if not exists conversations_user_b_idx on public.conversations (user_b);
create index if not exists likes_user_idx on public.likes (user_id);
create index if not exists messages_sender_idx on public.messages (sender_id);
create index if not exists ratings_user_idx on public.ratings (user_id);
create index if not exists tracks_remix_of_idx on public.tracks (remix_of);
