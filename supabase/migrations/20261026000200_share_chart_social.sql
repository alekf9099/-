-- 공개 범위 · 추천 · 청취 · 팔로우 · 알림 · 차트

-- ───────────────────────── 공개 설정 ─────────────────────────
-- 곡 데이터(composition)는 앱이 "공개한 부분만" 잘라서 올린다. 원본 전체는 제작자 폰에만 남는다.
alter table public.tracks
    add column visibility text not null default 'public' check (visibility in ('public', 'unlisted')),
    add column allow_remix boolean not null default true,
    add column allow_sing boolean not null default true,
    add column is_partial boolean not null default false,
    add column highlight_start_bar int not null default 0 check (highlight_start_bar >= 0),
    add column full_bars int not null default 0 check (full_bars >= 0),
    add column recommend_count int not null default 0;
create index tracks_public_idx on public.tracks (created_at desc) where visibility = 'public' and not hidden;

-- 집계 컬럼 보호에 추천 수 추가
create or replace function public.guard_track_counters() returns trigger
language plpgsql set search_path = public as $$
begin
    if current_user = 'authenticated' then
        new.like_count := old.like_count;
        new.rating_sum := old.rating_sum;
        new.rating_count := old.rating_count;
        new.comment_count := old.comment_count;
        new.play_count := old.play_count;
        new.report_count := old.report_count;
        new.recommend_count := old.recommend_count;
        new.hidden := old.hidden;
        new.owner_id := old.owner_id;
    end if;
    return new;
end $$;

-- ───────────────────────── 한국 시간 오늘 ─────────────────────────
create function private.kst_today() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'Asia/Seoul')::date $$;
grant execute on function private.kst_today() to anon, authenticated;

-- ───────────────────────── 추천 (하루 3번) ─────────────────────────
create table public.recommends (
    track_id uuid not null references public.tracks (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    day date not null default private.kst_today(),
    created_at timestamptz not null default now(),
    primary key (track_id, user_id, day)
);
create index recommends_user_day_idx on public.recommends (user_id, day);
create index recommends_recent_idx on public.recommends (created_at desc);

create function public.on_recommend_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    new.day := private.kst_today();
    if (select count(*) from recommends where user_id = new.user_id and day = new.day) >= 3 then
        raise exception 'daily_recommend_limit';
    end if;
    return new;
end $$;
create trigger recommends_limit before insert on public.recommends
    for each row execute function public.on_recommend_before();

create function public.on_recommend_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if tg_op = 'INSERT' then
        update tracks set recommend_count = recommend_count + 1 where id = new.track_id;
    else
        update tracks set recommend_count = greatest(recommend_count - 1, 0) where id = old.track_id;
    end if;
    return null;
end $$;
create trigger recommends_count after insert or delete on public.recommends
    for each row execute function public.on_recommend_change();

-- 남은 추천 횟수 (오늘)
create function public.recommends_left() returns int
language sql stable security invoker set search_path = public as $$
    select greatest(0, 3 - count(*))::int from recommends where user_id = auth.uid() and day = private.kst_today();
$$;

-- ───────────────────────── 청취 (하루 한 번만 집계) ─────────────────────────
create table public.listens (
    track_id uuid not null references public.tracks (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    day date not null default private.kst_today(),
    completed boolean not null default false,
    created_at timestamptz not null default now(),
    primary key (track_id, user_id, day)
);
create index listens_recent_idx on public.listens (created_at desc);
create index listens_user_idx on public.listens (user_id);

create function public.on_listen_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    update tracks set play_count = play_count + 1 where id = new.track_id;
    return null;
end $$;
create trigger listens_count after insert on public.listens
    for each row execute function public.on_listen_insert();

-- 재생 기록: 같은 날 다시 들으면 재생 수는 그대로, 끝까지 들었는지만 갱신
create function public.record_listen(p_track uuid, p_completed boolean default false) returns void
language sql security definer set search_path = public as $$
    insert into listens (track_id, user_id, completed)
    select p_track, auth.uid(), p_completed
    where exists (select 1 from profiles where id = auth.uid())
      and exists (select 1 from tracks where id = p_track and not hidden)
    on conflict (track_id, user_id, day) do update set completed = listens.completed or excluded.completed;
$$;

-- ───────────────────────── 팔로우 ─────────────────────────
alter table public.profiles
    add column follower_count int not null default 0,
    add column following_count int not null default 0;

create table public.follows (
    follower_id uuid not null references public.profiles (id) on delete cascade,
    followee_id uuid not null references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (follower_id, followee_id),
    check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id);

create function public.on_follow_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if tg_op = 'INSERT' then
        update profiles set follower_count = follower_count + 1 where id = new.followee_id;
        update profiles set following_count = following_count + 1 where id = new.follower_id;
    else
        update profiles set follower_count = greatest(follower_count - 1, 0) where id = old.followee_id;
        update profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
    end if;
    return null;
end $$;
create trigger follows_count after insert or delete on public.follows
    for each row execute function public.on_follow_change();

create function public.guard_profile_counters() returns trigger
language plpgsql set search_path = public as $$
begin
    if current_user = 'authenticated' then
        new.follower_count := old.follower_count;
        new.following_count := old.following_count;
    end if;
    return new;
end $$;
create trigger profiles_guard before update on public.profiles
    for each row execute function public.guard_profile_counters();

-- ───────────────────────── 알림 ─────────────────────────
create table public.notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles (id) on delete cascade,   -- 받는 사람
    actor_id uuid references public.profiles (id) on delete cascade,
    kind text not null check (kind in ('like', 'recommend', 'comment', 'follow')),
    track_id uuid references public.tracks (id) on delete cascade,
    created_at timestamptz not null default now(),
    read_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_actor_idx on public.notifications (actor_id);
create index notifications_track_idx on public.notifications (track_id);

-- 받는 사람·보내는 사람이 같거나 차단 관계면 만들지 않는다
create function private.notify(p_user uuid, p_actor uuid, p_kind text, p_track uuid) returns void
language sql security definer set search_path = public as $$
    insert into notifications (user_id, actor_id, kind, track_id)
    select p_user, p_actor, p_kind, p_track
    where p_user is not null and p_user <> p_actor and not private.is_blocked(p_user, p_actor);
$$;

create function public.on_like_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    perform private.notify((select owner_id from tracks where id = new.track_id), new.user_id, 'like', new.track_id);
    return null;
end $$;
create trigger likes_notify after insert on public.likes for each row execute function public.on_like_notify();

create function public.on_recommend_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    perform private.notify((select owner_id from tracks where id = new.track_id), new.user_id, 'recommend', new.track_id);
    return null;
end $$;
create trigger recommends_notify after insert on public.recommends for each row execute function public.on_recommend_notify();

create function public.on_comment_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    perform private.notify((select owner_id from tracks where id = new.track_id), new.user_id, 'comment', new.track_id);
    return null;
end $$;
create trigger comments_notify after insert on public.comments for each row execute function public.on_comment_notify();

create function public.on_follow_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    perform private.notify(new.followee_id, new.follower_id, 'follow', null);
    return null;
end $$;
create trigger follows_notify after insert on public.follows for each row execute function public.on_follow_notify();

-- ───────────────────────── 차트 ─────────────────────────
-- 점수 = Σ 좋아요 1 + 추천 5 + 끝까지 들음 0.5
--   × 가입 7일 이내 계정이면 0.5 (부계정 몰아주기 완화)
--   × 기간 안에서 오래된 반응일수록 최대 절반까지 감소
-- 곡 주인 본인의 반응은 제외. 링크 공개·숨김 곡은 제외.
-- 남의 청취 기록은 RLS로 안 보이므로 definer로 집계하고, 곡 id·점수만 돌려준다 (곡 내용은 호출자 RLS로 다시 조회).
create function public.chart(p_kind text default 'weekly', p_genre text default null, p_limit int default 50)
returns table (track_id uuid, score double precision)
language plpgsql stable security definer set search_path = public as $$
declare
    week_start timestamptz := date_trunc('week', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
    ws timestamptz;
    we timestamptz;
begin
    if p_kind = 'last_week' then
        ws := week_start - interval '7 days'; we := week_start;
    elsif p_kind = 'rising' then
        ws := now() - interval '24 hours'; we := now();
    elsif p_kind in ('weekly', 'rookie') then
        ws := week_start; we := now();
    else
        raise exception 'unknown chart kind';
    end if;
    p_limit := least(greatest(p_limit, 1), 100);
    return query
    with reactions as (
        select l.track_id, l.user_id, l.created_at, 1.0::double precision as pts from likes l where l.created_at >= ws and l.created_at < we
        union all
        select r.track_id, r.user_id, r.created_at, 5.0 from recommends r where r.created_at >= ws and r.created_at < we
        union all
        select s.track_id, s.user_id, s.created_at, 0.5 from listens s where s.completed and s.created_at >= ws and s.created_at < we
    )
    select t.id, sum(
        x.pts
        * (case when p.created_at > now() - interval '7 days' then 0.5 else 1.0 end)
        * (1.0 - 0.5 * greatest(0, extract(epoch from (we - x.created_at))) / greatest(1, extract(epoch from (we - ws))))
    )::double precision as score
    from reactions x
    join tracks t on t.id = x.track_id
    join profiles p on p.id = x.user_id
    where t.visibility = 'public' and not t.hidden and x.user_id <> t.owner_id
      and (p_genre is null or t.genre = p_genre)
      and (p_kind <> 'rookie' or (select min(t2.created_at) from tracks t2 where t2.owner_id = t.owner_id) > now() - interval '30 days')
    group by t.id
    order by score desc, max(x.created_at) desc
    limit p_limit;
end $$;

-- 주간 인기곡은 공개 곡만
create or replace function public.weekly_top(p_limit int default 30)
returns setof public.tracks
language sql stable security invoker set search_path = public as $$
    select t.* from tracks t
    join public.chart('weekly', null, p_limit) c on c.track_id = t.id
    order by c.score desc;
$$;

-- ───────────────────────── 보안 (RLS · 권한) ─────────────────────────
alter table public.recommends enable row level security;
alter table public.listens enable row level security;
alter table public.follows enable row level security;
alter table public.notifications enable row level security;

create policy "추천 조회" on public.recommends for select using (true);
create policy "추천하기 (내 곡 제외)" on public.recommends for insert
    with check (user_id = (select auth.uid()) and private.track_owner(track_id) is distinct from (select auth.uid()) and private.track_owner(track_id) is not null);
create policy "추천 취소" on public.recommends for delete using (user_id = (select auth.uid()));

-- 청취 기록은 본인 것만 보이고, 쓰기는 record_listen 으로만
create policy "내 청취 기록" on public.listens for select using (user_id = (select auth.uid()));

create policy "팔로우 조회" on public.follows for select using (true);
create policy "팔로우하기" on public.follows for insert
    with check (follower_id = (select auth.uid()) and not private.is_blocked(follower_id, followee_id));
create policy "팔로우 취소" on public.follows for delete using (follower_id = (select auth.uid()));

create policy "내 알림만" on public.notifications for select using (user_id = (select auth.uid()));
create policy "내 알림 읽음" on public.notifications for update using (user_id = (select auth.uid()));
revoke insert, update, delete on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke insert, update, delete on public.listens from anon, authenticated;

-- 트리거 함수는 직접 호출 불가, 앱 RPC는 로그인 사용자만
revoke execute on function
    public.on_recommend_before(), public.on_recommend_change(), public.on_listen_insert(), public.on_follow_change(),
    public.guard_profile_counters(), public.on_like_notify(), public.on_recommend_notify(), public.on_comment_notify(), public.on_follow_notify()
from public, anon, authenticated;
revoke execute on function private.notify(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.record_listen(uuid, boolean), public.recommends_left() from public, anon;
grant execute on function public.record_listen(uuid, boolean), public.recommends_left() to authenticated;

alter publication supabase_realtime add table public.notifications;
