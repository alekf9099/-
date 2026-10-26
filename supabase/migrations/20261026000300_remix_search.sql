-- 리믹스 허용 확인 · 검색 인덱스

-- ───────────────────────── 리믹스 허용 ─────────────────────────
-- 앱 화면에서만 막으면 우회할 수 있으므로, 원곡이 리믹스를 허용하지 않으면 서버에서도 거부한다.
-- (자기 곡을 리믹스하는 건 항상 허용)
create function public.guard_remix() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    src record;
begin
    if new.remix_of is null then return new; end if;
    if tg_op = 'UPDATE' and new.remix_of is not distinct from old.remix_of then return new; end if;
    select owner_id, allow_remix, hidden into src from tracks where id = new.remix_of;
    if not found then
        new.remix_of := null;   -- 원곡이 지워졌으면 표시만 없앤다
    elsif src.owner_id <> new.owner_id and (not src.allow_remix or src.hidden or private.is_blocked(src.owner_id, new.owner_id)) then
        raise exception 'remix_not_allowed';
    end if;
    return new;
end $$;
create trigger tracks_remix_guard before insert or update of remix_of on public.tracks
    for each row execute function public.guard_remix();
revoke execute on function public.guard_remix() from public, anon, authenticated;

-- ───────────────────────── 검색 ─────────────────────────
-- 제목·닉네임 부분 일치(ilike '%검색어%')를 빠르게: 트라이그램 인덱스
create extension if not exists pg_trgm with schema extensions;
create index if not exists tracks_title_trgm_idx on public.tracks using gin (title extensions.gin_trgm_ops);
create index if not exists profiles_nickname_trgm_idx on public.profiles using gin (nickname extensions.gin_trgm_ops);
