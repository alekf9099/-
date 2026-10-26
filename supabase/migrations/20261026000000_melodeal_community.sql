-- 멜로딜 커뮤니티: 곡 공유 · 평가 · 댓글 · 1:1 채팅 · 신고 · 차단
-- 로그인은 Supabase 익명 로그인(auth.signInAnonymously)을 쓰고, 닉네임은 profiles에 저장한다.

-- ───────────────────────── 프로필 ─────────────────────────
create table public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    nickname text not null unique check (char_length(nickname) between 2 and 12),
    bio text not null default '' check (char_length(bio) <= 80),
    created_at timestamptz not null default now()
);

-- ───────────────────────── 곡 ─────────────────────────
-- 곡 내용은 앱의 Composition JSON(멜로디·코드·가사)을 그대로 저장한다. 음원 파일 없이 앱에서 다시 합성해 재생.
create table public.tracks (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.profiles (id) on delete cascade,
    title text not null check (char_length(title) between 1 and 30),
    description text not null default '' check (char_length(description) <= 200),
    genre text not null check (genre in ('BALLAD', 'POP', 'DANCE', 'ACOUSTIC')),
    composition jsonb not null,
    remix_of uuid references public.tracks (id) on delete set null,
    like_count int not null default 0,
    rating_sum int not null default 0,
    rating_count int not null default 0,
    comment_count int not null default 0,
    play_count int not null default 0,
    report_count int not null default 0,
    hidden boolean not null default false,
    created_at timestamptz not null default now()
);
create index tracks_created_idx on public.tracks (created_at desc) where not hidden;
create index tracks_owner_idx on public.tracks (owner_id);

create table public.likes (
    track_id uuid not null references public.tracks (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (track_id, user_id)
);
create index likes_recent_idx on public.likes (created_at desc);

create table public.ratings (
    track_id uuid not null references public.tracks (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    stars smallint not null check (stars between 1 and 5),
    primary key (track_id, user_id)
);

create table public.comments (
    id uuid primary key default gen_random_uuid(),
    track_id uuid not null references public.tracks (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    body text not null check (char_length(body) between 1 and 300),
    hidden boolean not null default false,
    created_at timestamptz not null default now()
);
create index comments_track_idx on public.comments (track_id, created_at);

-- ───────────────────────── 안전: 차단 · 신고 ─────────────────────────
create table public.blocks (
    blocker_id uuid not null references public.profiles (id) on delete cascade,
    blocked_id uuid not null references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (blocker_id, blocked_id),
    check (blocker_id <> blocked_id)
);

create table public.reports (
    id uuid primary key default gen_random_uuid(),
    reporter_id uuid not null references public.profiles (id) on delete cascade,
    target_type text not null check (target_type in ('track', 'comment', 'user', 'message')),
    target_id uuid not null,
    reason text not null check (reason in ('spam', 'abuse', 'plagiarism', 'sexual', 'scam', 'other')),
    detail text not null default '' check (char_length(detail) <= 300),
    created_at timestamptz not null default now(),
    unique (reporter_id, target_type, target_id)
);

-- ───────────────────────── 1:1 채팅 ─────────────────────────
create table public.conversations (
    id uuid primary key default gen_random_uuid(),
    user_a uuid not null references public.profiles (id) on delete cascade,
    user_b uuid not null references public.profiles (id) on delete cascade,
    track_id uuid references public.tracks (id) on delete set null, -- 어떤 곡을 보고 시작한 대화인지
    last_message text not null default '',
    last_message_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    check (user_a < user_b),
    unique (user_a, user_b)
);

create table public.messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations (id) on delete cascade,
    sender_id uuid not null references public.profiles (id) on delete cascade,
    body text not null check (char_length(body) between 1 and 1000),
    read_at timestamptz,
    created_at timestamptz not null default now()
);
create index messages_conv_idx on public.messages (conversation_id, created_at);

-- ───────────────────────── 도우미 함수 ─────────────────────────
-- a와 b 사이에 어느 쪽이든 차단이 있는지
create function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.blocks
        where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
    );
$$;

-- 곡 주인 (RLS와 무관하게 조회: 차단으로 곡이 안 보여도 주인을 알아야 차단 검사가 된다)
create function public.track_owner(p_track uuid) returns uuid
language sql stable security definer set search_path = public as $$
    select owner_id from public.tracks where id = p_track and not hidden;
$$;

create function public.is_participant(conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.conversations c
        where c.id = conv and auth.uid() in (c.user_a, c.user_b)
    );
$$;

-- ───────────────────────── 집계 트리거 ─────────────────────────
create function public.on_like_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if tg_op = 'INSERT' then
        update tracks set like_count = like_count + 1 where id = new.track_id;
    else
        update tracks set like_count = greatest(like_count - 1, 0) where id = old.track_id;
    end if;
    return null;
end $$;
create trigger likes_count after insert or delete on public.likes
    for each row execute function public.on_like_change();

create function public.on_rating_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if tg_op = 'INSERT' then
        update tracks set rating_sum = rating_sum + new.stars, rating_count = rating_count + 1 where id = new.track_id;
    elsif tg_op = 'UPDATE' then
        update tracks set rating_sum = rating_sum - old.stars + new.stars where id = new.track_id;
    else
        update tracks set rating_sum = rating_sum - old.stars, rating_count = greatest(rating_count - 1, 0) where id = old.track_id;
    end if;
    return null;
end $$;
create trigger ratings_count after insert or update or delete on public.ratings
    for each row execute function public.on_rating_change();

create function public.on_comment_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if tg_op = 'INSERT' then
        update tracks set comment_count = comment_count + 1 where id = new.track_id;
    else
        update tracks set comment_count = greatest(comment_count - 1, 0) where id = old.track_id;
    end if;
    return null;
end $$;
create trigger comments_count after insert or delete on public.comments
    for each row execute function public.on_comment_change();

-- 메시지가 오면 대화 목록의 마지막 메시지 갱신
create function public.on_message_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    update conversations set last_message = left(new.body, 80), last_message_at = new.created_at
    where id = new.conversation_id;
    return null;
end $$;
create trigger messages_touch after insert on public.messages
    for each row execute function public.on_message_insert();

-- 신고가 5건 쌓이면 자동으로 숨김 (운영자 검토 전까지)
create function public.on_report_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if new.target_type = 'track' then
        update tracks set report_count = report_count + 1, hidden = (report_count + 1 >= 5) or hidden where id = new.target_id;
    elsif new.target_type = 'comment' then
        update comments set hidden = true
        where id = new.target_id and (select count(*) from reports r where r.target_type = 'comment' and r.target_id = new.target_id) >= 3;
    end if;
    return null;
end $$;
create trigger reports_moderate after insert on public.reports
    for each row execute function public.on_report_insert();

-- 집계·숨김 컬럼은 사용자가 직접 못 바꾸게 (트리거·운영자만)
create function public.guard_track_counters() returns trigger
language plpgsql as $$
begin
    -- 사용자가 직접 수정할 때만 막는다. 집계 트리거·increment_play 같은 security definer 함수는 소유자 권한으로 돌므로 통과
    if current_user = 'authenticated' then
        new.like_count := old.like_count;
        new.rating_sum := old.rating_sum;
        new.rating_count := old.rating_count;
        new.comment_count := old.comment_count;
        new.play_count := old.play_count;
        new.report_count := old.report_count;
        new.hidden := old.hidden;
        new.owner_id := old.owner_id;
    end if;
    return new;
end $$;
create trigger tracks_guard before update on public.tracks
    for each row execute function public.guard_track_counters();

-- 재생 수 +1 (누구나 호출, 행 직접 수정 권한 없이)
create function public.increment_play(p_track uuid) returns void
language sql security definer set search_path = public as $$
    update tracks set play_count = play_count + 1 where id = p_track and not hidden;
$$;

-- 이번 주(월요일 0시, 한국 시간) 받은 좋아요 순 인기곡
create function public.weekly_top(p_limit int default 30)
returns setof public.tracks
language sql stable security invoker set search_path = public as $$
    select t.* from tracks t
    join (
        select track_id, count(*) as n from likes
        where created_at >= date_trunc('week', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
        group by track_id
    ) w on w.track_id = t.id
    order by w.n desc, t.rating_sum desc, t.created_at desc
    limit p_limit;
$$;

-- 1:1 대화 열기 (이미 있으면 기존 대화). 차단 관계면 실패
create function public.open_conversation(p_other uuid, p_track uuid default null)
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
    if public.is_blocked(me, p_other) then
        raise exception 'blocked';
    end if;
    a := least(me, p_other);
    b := greatest(me, p_other);
    insert into conversations (user_a, user_b, track_id) values (a, b, p_track)
    on conflict (user_a, user_b) do update set track_id = coalesce(excluded.track_id, conversations.track_id)
    returning id into conv;
    return conv;
end $$;

-- ───────────────────────── 행 단위 보안 (RLS) ─────────────────────────
alter table public.profiles enable row level security;
alter table public.tracks enable row level security;
alter table public.likes enable row level security;
alter table public.ratings enable row level security;
alter table public.comments enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "프로필은 누구나 조회" on public.profiles for select using (true);
create policy "내 프로필 생성" on public.profiles for insert with check (id = auth.uid());
create policy "내 프로필 수정" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "공개 곡 조회 (내가 차단한 사람 제외)" on public.tracks for select
    using ((not hidden and not public.is_blocked(auth.uid(), owner_id)) or owner_id = auth.uid());
create policy "내 곡 올리기" on public.tracks for insert with check (owner_id = auth.uid());
create policy "내 곡 수정" on public.tracks for update using (owner_id = auth.uid());
create policy "내 곡 삭제" on public.tracks for delete using (owner_id = auth.uid());

create policy "좋아요 조회" on public.likes for select using (true);
create policy "좋아요 누르기" on public.likes for insert with check (user_id = auth.uid());
create policy "좋아요 취소" on public.likes for delete using (user_id = auth.uid());

create policy "별점 조회" on public.ratings for select using (true);
create policy "별점 주기 (내 곡 제외)" on public.ratings for insert
    with check (user_id = auth.uid() and public.track_owner(track_id) is distinct from auth.uid() and public.track_owner(track_id) is not null);
create policy "별점 바꾸기" on public.ratings for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "별점 취소" on public.ratings for delete using (user_id = auth.uid());

create policy "댓글 조회" on public.comments for select
    using ((not hidden and not public.is_blocked(auth.uid(), user_id)) or user_id = auth.uid());
create policy "댓글 쓰기 (숨김 곡·곡 주인과 차단 관계면 불가)" on public.comments for insert
    with check (
        user_id = auth.uid()
        and public.track_owner(track_id) is not null
        and not public.is_blocked(auth.uid(), public.track_owner(track_id))
    );
create policy "댓글 삭제 (작성자 또는 곡 주인)" on public.comments for delete
    using (user_id = auth.uid() or exists (select 1 from public.tracks t where t.id = track_id and t.owner_id = auth.uid()));

create policy "내 차단 목록" on public.blocks for select using (blocker_id = auth.uid());
create policy "차단하기" on public.blocks for insert with check (blocker_id = auth.uid());
create policy "차단 풀기" on public.blocks for delete using (blocker_id = auth.uid());

-- 신고는 쓰기만 가능 (조회는 운영자가 대시보드에서)
create policy "신고하기" on public.reports for insert with check (reporter_id = auth.uid());

create policy "내 대화만 조회" on public.conversations for select using (auth.uid() in (user_a, user_b));

create policy "내 대화 메시지만 조회" on public.messages for select using (public.is_participant(conversation_id));
create policy "메시지 보내기 (참여자 · 차단 아님)" on public.messages for insert
    with check (
        sender_id = auth.uid()
        and public.is_participant(conversation_id)
        and not exists (
            select 1 from public.conversations c
            where c.id = conversation_id and public.is_blocked(c.user_a, c.user_b)
        )
    );
create policy "받은 메시지 읽음 표시" on public.messages for update
    using (public.is_participant(conversation_id) and sender_id <> auth.uid());
-- 메시지는 읽음 시각만 바꿀 수 있다 (내용 수정 불가)
revoke update on public.messages from authenticated;
grant update (read_at) on public.messages to authenticated;

-- ───────────────────────── 실시간 (채팅) ─────────────────────────
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
