package com.melodeal.community

import com.melodeal.data.song.Genre
import com.melodeal.studio.Composition
import com.melodeal.studio.MelodyGenerator
import com.melodeal.studio.MusicKey
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.UUID

/**
 * 서버 없이 기기 안에서만 도는 체험 모드.
 * 예시 사용자·곡·댓글이 들어 있고, 메시지를 보내면 잠시 뒤 자동 답장이 온다. 앱을 끄면 초기화된다.
 */
class DemoCommunity(
    private val now: () -> Long = System::currentTimeMillis,
    private val replyDelayMs: Long = 1200,
    /** 곡을 올리면 이만큼 간격으로 예시 사용자들이 반응한다 (0 이하면 반응 없음) */
    private val reactionDelayMs: Long = 4000,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
) : CommunityRepository {
    override val isDemo = true

    private val myId = "me"
    private val _me = MutableStateFlow<Profile?>(null)
    override val me: StateFlow<Profile?> = _me

    private val lock = Mutex()
    private val profiles = linkedMapOf<String, Profile>()
    private val tracks = linkedMapOf<String, Track>()
    private val likes = mutableSetOf<Pair<String, String>>()               // (trackId, userId)
    private val likeTimes = mutableMapOf<Pair<String, String>, Long>()
    private val ratings = mutableMapOf<Pair<String, String>, Int>()
    private val comments = mutableListOf<Comment>()
    private val blocks = mutableSetOf<Pair<String, String>>()              // (blocker, blocked)
    private val reports = mutableSetOf<Triple<String, ReportTarget, String>>()
    private val conversations = linkedMapOf<String, Conversation>()
    private val messages = mutableListOf<Message>()
    private val stream = MutableSharedFlow<Message>(extraBufferCapacity = 64)
    private val joined = mutableMapOf<String, Long>()                     // 가입 시각
    private val firstTrack = mutableMapOf<String, Long>()                 // 첫 곡 시각 (예시 사용자는 예전부터 활동)
    private val recommends = mutableListOf<Triple<String, String, Long>>() // (trackId, userId, at)
    private val listens = mutableMapOf<Triple<String, String, Long>, Pair<Long, Boolean>>() // (track, user, 날짜) → (시각, 끝까지)
    private val follows = mutableSetOf<Pair<String, String>>()            // (follower, followee)
    private val notifs = mutableListOf<AppNotification>()
    private val notifStream = MutableSharedFlow<AppNotification>(extraBufferCapacity = 64)

    init {
        seed()
    }

    private fun seed() {
        val day = 24 * 3600 * 1000L
        val users = listOf(
            Profile("u1", "별빛작곡가", "밤에 떠오르는 멜로디를 모아요"),
            Profile("u2", "퇴근길피아노", "지하철에서 흥얼거린 노래들"),
            Profile("u3", "새벽감성", "잔잔한 발라드 좋아해요"),
            Profile("u4", "라라랜드", "댄스곡 같이 만들 사람!"),
        )
        users.forEach { profiles[it.id] = it }
        val start = ChartScoring.weekStart(now())
        // 이번 주 안의 시각 (frac 0 = 월요일 0시, 1 = 지금)
        fun thisWeek(frac: Double) = start + ((now() - start) * frac).toLong()
        mapOf("u1" to 120, "u2" to 90, "u3" to 40, "u4" to 12).forEach { (u, d) -> joined[u] = now() - d * day }
        mapOf("u1" to 100, "u2" to 60, "u3" to 20).forEach { (u, d) -> firstTrack[u] = now() - d * day }
        val samples = listOf(
            Triple("u1", "밤하늘 산책", Genre.BALLAD) to MusicKey(0, false),
            Triple("u2", "환승역에서", Genre.POP) to MusicKey(7, false),
            Triple("u3", "새벽 세 시", Genre.BALLAD) to MusicKey(9, true),
            Triple("u4", "불금 파티", Genre.DANCE) to MusicKey(2, false),
            Triple("u2", "주말 아침 커피", Genre.ACOUSTIC) to MusicKey(5, false),
            Triple("u1", "여름 끝자락", Genre.POP) to MusicKey(4, true),
        )
        samples.forEachIndexed { i, (meta, key) ->
            val (owner, title, genre) = meta
            val comp = Composition(
                title = title, genre = genre, key = key,
                notes = MelodyGenerator.generate(key, seed = 100L + i, center = if (key.minor) 69 else 67),
            ).autoChords()
            val id = "t${i + 1}"
            tracks[id] = Track(
                id = id, ownerId = owner, ownerNickname = profiles.getValue(owner).nickname, title = title,
                description = listOf("처음 만든 곡이에요. 의견 부탁드려요!", "가사 붙여 주실 분 찾아요", "", "후렴 어떤가요?", "아침에 듣기 좋은 곡", "")[i],
                genre = genre, composition = comp, createdAt = now() - (i + 1) * day / 3,
                playCount = 40 - i * 5,
                isPartial = i == 2, highlightStartBar = if (i == 2) 4 else 0, fullBars = if (i == 2) comp.bars + 4 else comp.bars,
                allowRemix = i != 2,
            )
        }
        // 예시 반응: 다른 사용자들의 좋아요·별점·댓글
        val reactions = listOf("t1" to listOf("u2", "u3", "u4"), "t2" to listOf("u1", "u3"), "t3" to listOf("u1", "u2", "u4"), "t4" to listOf("u2"), "t5" to listOf("u3", "u4"))
        reactions.forEach { (t, us) ->
            us.forEachIndexed { k, u ->
                likes += t to u; likeTimes[t to u] = thisWeek(0.9 - k * 0.2)
                ratings[t to u] = 5 - (k % 2)
            }
        }
        listOf(
            Triple("t1", "u3", "후렴 멜로디 너무 좋아요"),
            Triple("t1", "u4", "댄스 버전도 들어보고 싶어요!"),
            Triple("t3", "u1", "단조 분위기 최고네요"),
            Triple("t2", "u4", "출근길에 딱이에요"),
        ).forEachIndexed { i, (t, u, body) ->
            comments += Comment("c$i", t, u, profiles.getValue(u).nickname, body, now() - (10 - i) * 600_000L)
        }
        // 추천: 이번 주 · 최근 24시간 · 지난주
        listOf("t3" to "u1", "t3" to "u4", "t1" to "u2", "t4" to "u1", "t4" to "u3", "t4" to "u2").forEachIndexed { k, (t, u) ->
            recommends += Triple(t, u, if (t == "t4") now() - (k + 1) * 1800_000L else thisWeek(0.5 + k * 0.05))
        }
        listOf("t2" to "u3", "t2" to "u4", "t5" to "u1").forEachIndexed { k, (t, u) -> recommends += Triple(t, u, start - (k + 1) * day) }
        listOf("t1" to "u2", "t1" to "u3", "t3" to "u2", "t2" to "u1").forEach { (t, u) ->
            listens[Triple(t, u, ChartScoring.kstDay(thisWeek(0.7)))] = thisWeek(0.7) to true
        }
        follows += "u2" to "u1"; follows += "u3" to "u1"; follows += "u4" to "u3"
        recount()
    }

    private fun recount() {
        tracks.replaceAll { id, t ->
            val rs = ratings.filterKeys { it.first == id }.values
            t.copy(
                likeCount = likes.count { it.first == id },
                ratingSum = rs.sum(), ratingCount = rs.size,
                commentCount = comments.count { it.trackId == id },
                recommendCount = recommends.count { it.first == id },
            )
        }
        profiles.replaceAll { id, p -> p.copy(followerCount = follows.count { it.second == id }, followingCount = follows.count { it.first == id }) }
    }

    private fun today() = ChartScoring.kstDay(now())
    private fun recommendedToday(trackId: String, userId: String) =
        recommends.any { it.first == trackId && it.second == userId && ChartScoring.kstDay(it.third) == today() }

    private fun notify(user: String?, actor: String, kind: NotificationKind, trackId: String?) {
        // 체험 모드에선 내가 받는 알림만 보관한다
        if (user != myId || user == actor || isBlocked(user, actor)) return
        val n = AppNotification(UUID.randomUUID().toString(), kind, profiles[actor], trackId, trackId?.let { tracks[it]?.title }, now(), false)
        notifs += n
        notifStream.tryEmit(n)
    }

    private fun isBlocked(a: String, b: String) = (a to b) in blocks || (b to a) in blocks
    private fun requireMe(): Profile = _me.value ?: throw CommunityException.NeedProfile()

    private fun decorate(t: Track) = t.copy(
        likedByMe = (t.id to myId) in likes,
        myRating = ratings[t.id to myId],
        recommendedByMe = recommendedToday(t.id, myId),
        ownerNickname = profiles[t.ownerId]?.nickname ?: t.ownerNickname,
    )

    private fun visible(t: Track) = !isBlocked(myId, t.ownerId)

    override suspend fun signIn(): Profile? = _me.value

    override suspend fun saveProfile(nickname: String, bio: String): Profile = lock.withLock {
        val n = Nickname.validate(nickname)
        if (profiles.values.any { it.nickname == n && it.id != myId }) throw CommunityException.NicknameTaken()
        val old = profiles[myId]
        val p = (old ?: Profile(myId, n, createdAt = now())).copy(nickname = n, bio = bio.take(80))
        profiles[myId] = p
        joined.getOrPut(myId) { now() }
        _me.value = p
        p
    }

    override suspend fun feed(sort: FeedSort, genre: Genre?): List<Track> = lock.withLock {
        val list = tracks.values.filter { visible(it) && it.visibility == Visibility.PUBLIC && (genre == null || it.genre == genre) }
        when (sort) {
            FeedSort.LATEST -> list.sortedByDescending { it.createdAt }
            FeedSort.WEEKLY -> {
                val weekAgo = now() - 7 * 24 * 3600_000L
                list.map { t -> t to likeTimes.count { (k, v) -> k.first == t.id && v >= weekAgo } }
                    .filter { it.second > 0 }
                    .sortedWith(compareByDescending<Pair<Track, Int>> { it.second }.thenByDescending { it.first.ratingSum })
                    .map { it.first }
            }
            FeedSort.TOP_RATED -> list.filter { it.ratingCount > 0 }.sortedByDescending { it.ratingAvg }
        }.map(::decorate)
    }

    override suspend fun track(id: String): Track? = lock.withLock { tracks[id]?.takeIf(::visible)?.let(::decorate) }

    override suspend fun tracksBy(userId: String): List<Track> = lock.withLock {
        // 링크 공개 곡은 내 프로필에서만 보인다
        tracks.values.filter { it.ownerId == userId && visible(it) && (userId == myId || it.visibility == Visibility.PUBLIC) }.sortedByDescending { it.createdAt }.map(::decorate)
    }

    override suspend fun profile(userId: String): Profile? = lock.withLock { profiles[userId] }

    override suspend fun publish(original: Composition, description: String, settings: ShareSettings, remixOf: String?): Track {
        val t = lock.withLock {
            val me = requireMe()
            val s = settings.coerceTo(original)
            val t = Track(
                id = UUID.randomUUID().toString(), ownerId = me.id, ownerNickname = me.nickname, title = original.title,
                description = description.take(200), genre = original.genre, composition = ShareCut.apply(original, s), createdAt = now(), remixOf = remixOf,
            ).withShare(s, original.bars)
            tracks[t.id] = t
            firstTrack.getOrPut(myId) { now() }
            t
        }
        simulateReactions(t)
        return t
    }

    private fun Track.withShare(s: ShareSettings, fullBars: Int) = copy(
        visibility = s.visibility, allowRemix = s.allowRemix, allowSing = s.allowSing,
        isPartial = s.isPartial(fullBars), highlightStartBar = s.startBar, fullBars = fullBars,
    )

    override suspend fun updateShare(trackId: String, settings: ShareSettings, original: Composition?, description: String?): Track = lock.withLock {
        val t = tracks[trackId]?.takeIf { it.ownerId == myId } ?: throw IllegalArgumentException("내 곡이 아니에요")
        val updated = if (original != null) {
            val s = settings.coerceTo(original)
            t.copy(composition = ShareCut.apply(original, s), title = original.title, genre = original.genre).withShare(s, original.bars)
        } else {
            t.copy(visibility = settings.visibility, allowRemix = settings.allowRemix, allowSing = settings.allowSing)
        }.let { if (description != null) it.copy(description = description.take(200)) else it }
        tracks[trackId] = updated
        decorate(updated)
    }

    /** 체험 모드: 곡을 올리면 예시 사용자들이 차례로 반응해서 알림이 온다 */
    private fun simulateReactions(t: Track) {
        if (reactionDelayMs <= 0) return
        scope.launch {
            val steps: List<suspend () -> Unit> = listOf(
                { likes += t.id to "u3"; likeTimes[t.id to "u3"] = now(); notify(myId, "u3", NotificationKind.LIKE, t.id) },
                { recommends += Triple(t.id, "u1", now()); notify(myId, "u1", NotificationKind.RECOMMEND, t.id) },
                {
                    comments += Comment(UUID.randomUUID().toString(), t.id, "u4", profiles.getValue("u4").nickname, "멜로디 좋네요! 전체 버전도 궁금해요", now())
                    notify(myId, "u4", NotificationKind.COMMENT, t.id)
                },
                { if (follows.add("u2" to myId)) notify(myId, "u2", NotificationKind.FOLLOW, null) },
            )
            for (step in steps) {
                delay(reactionDelayMs)
                lock.withLock {
                    val cur = tracks[t.id] ?: return@launch
                    if (cur.visibility != Visibility.PUBLIC) return@launch
                    step()
                    recount()
                }
            }
        }
    }

    override suspend fun discover(): List<Track> = lock.withLock {
        tracks.values.filter { visible(it) && it.visibility == Visibility.PUBLIC }
            .sortedByDescending { ChartScoring.hot(it, now()) }.map(::decorate)
    }

    override suspend fun followingFeed(): List<Track> = lock.withLock {
        val followees = follows.filter { it.first == myId }.map { it.second }.toSet()
        tracks.values.filter { it.ownerId in followees && visible(it) && it.visibility == Visibility.PUBLIC }
            .sortedByDescending { it.createdAt }.map(::decorate)
    }

    override suspend fun chart(kind: ChartKind, genre: Genre?): List<ChartEntry> = lock.withLock {
        val reactions = buildList {
            likeTimes.forEach { (k, at) -> add(ChartScoring.Reaction(k.first, k.second, at, ChartScoring.LIKE)) }
            recommends.forEach { (t, u, at) -> add(ChartScoring.Reaction(t, u, at, ChartScoring.RECOMMEND)) }
            listens.forEach { (k, v) -> if (v.second) add(ChartScoring.Reaction(k.first, k.second, v.first, ChartScoring.COMPLETED_LISTEN)) }
        }
        val pool = tracks.filterValues { visible(it) && (genre == null || it.genre == genre) }
        ChartScoring.rank(
            kind, reactions, pool,
            accountCreated = { joined[it] ?: 0L },
            firstTrackAt = { owner -> listOfNotNull(firstTrack[owner], tracks.values.filter { it.ownerId == owner }.minOfOrNull { it.createdAt }).minOrNull() ?: now() },
            now = now(),
        ).mapIndexed { i, (t, score) -> ChartEntry(i + 1, decorate(t), score) }
    }
    override suspend fun deleteTrack(id: String) = lock.withLock {
        if (tracks[id]?.ownerId == myId) {
            tracks.remove(id)
            comments.removeAll { it.trackId == id }
        }
        Unit
    }

    override suspend fun setLiked(trackId: String, liked: Boolean) = lock.withLock {
        requireMe()
        if (liked) {
            if (likes.add(trackId to myId)) notify(tracks[trackId]?.ownerId, myId, NotificationKind.LIKE, trackId)
            likeTimes[trackId to myId] = now()
        } else { likes -= trackId to myId; likeTimes.remove(trackId to myId) }
        recount()
    }

    override suspend fun recommend(trackId: String) = lock.withLock {
        requireMe()
        val t = tracks[trackId] ?: throw IllegalArgumentException("없는 곡")
        if (t.ownerId == myId) throw CommunityException.OwnTrack()
        if (isBlocked(myId, t.ownerId)) throw CommunityException.Blocked()
        if (recommendedToday(trackId, myId)) return@withLock
        if (leftToday() <= 0) throw CommunityException.RecommendLimit()
        recommends += Triple(trackId, myId, now())
        notify(t.ownerId, myId, NotificationKind.RECOMMEND, trackId)
        recount()
    }

    private fun leftToday() = (ChartScoring.DAILY_RECOMMENDS - recommends.count { it.second == myId && ChartScoring.kstDay(it.third) == today() }).coerceAtLeast(0)

    override suspend fun recommendsLeft(): Int = lock.withLock { leftToday() }

    override suspend fun rate(trackId: String, stars: Int) = lock.withLock {
        requireMe()
        require(stars in 1..5)
        if (tracks[trackId]?.ownerId == myId) return@withLock
        ratings[trackId to myId] = stars
        recount()
    }

    override suspend fun recordListen(trackId: String, completed: Boolean) = lock.withLock {
        val t = tracks[trackId] ?: return@withLock
        val key = Triple(trackId, myId, today())
        val prev = listens[key]
        if (prev == null) tracks[trackId] = t.copy(playCount = t.playCount + 1)
        listens[key] = (prev?.first ?: now()) to (completed || prev?.second == true)
    }

    override suspend fun setFollowing(userId: String, follow: Boolean) = lock.withLock {
        requireMe()
        if (userId == myId) return@withLock
        if (follow) {
            if (isBlocked(myId, userId)) throw CommunityException.Blocked()
            if (follows.add(myId to userId)) notify(userId, myId, NotificationKind.FOLLOW, null)
        } else follows -= myId to userId
        recount()
    }

    override suspend fun isFollowing(userId: String): Boolean = lock.withLock { (myId to userId) in follows }

    override suspend fun notifications(): List<AppNotification> = lock.withLock {
        notifs.filter { n -> n.actor?.let { !isBlocked(myId, it.id) } ?: true }
            .map { n -> n.copy(actor = n.actor?.let { profiles[it.id] ?: it }) }
            .sortedByDescending { it.createdAt }
    }

    override suspend fun markNotificationsRead() = lock.withLock { notifs.replaceAll { it.copy(read = true) } }

    override fun notificationEvents(): Flow<AppNotification> = notifStream

    override suspend fun comments(trackId: String): List<Comment> = lock.withLock {
        comments.filter { it.trackId == trackId && !isBlocked(myId, it.userId) }.sortedBy { it.createdAt }
    }

    override suspend fun addComment(trackId: String, body: String): Comment = lock.withLock {
        val me = requireMe()
        val owner = tracks[trackId]?.ownerId ?: throw CommunityException.Blocked()
        if (isBlocked(myId, owner)) throw CommunityException.Blocked()
        val c = Comment(UUID.randomUUID().toString(), trackId, myId, me.nickname, ContentFilter.mask(body.trim().take(300)), now())
        comments += c
        notify(owner, myId, NotificationKind.COMMENT, trackId)
        recount()
        c
    }

    override suspend fun deleteComment(commentId: String) = lock.withLock {
        val c = comments.firstOrNull { it.id == commentId } ?: return@withLock
        if (c.userId == myId || tracks[c.trackId]?.ownerId == myId) {
            comments.remove(c)
            recount()
        }
    }

    override suspend fun report(target: ReportTarget, targetId: String, reason: ReportReason, detail: String) = lock.withLock {
        requireMe()
        reports += Triple(myId, target, targetId)
        Unit
    }

    override suspend fun block(userId: String) = lock.withLock {
        if (userId != myId) {
            blocks += myId to userId
            follows -= myId to userId
            follows -= userId to myId
            recount()
        }
        Unit
    }

    override suspend fun unblock(userId: String) = lock.withLock {
        blocks -= myId to userId
        Unit
    }

    override suspend fun blockedUsers(): List<Profile> = lock.withLock {
        blocks.filter { it.first == myId }.mapNotNull { profiles[it.second] }
    }

    override suspend fun conversations(): List<Conversation> = lock.withLock {
        conversations.values.map { c ->
            c.copy(unread = messages.count { it.conversationId == c.id && it.senderId != myId && it.readAt == null })
        }.sortedByDescending { it.lastMessageAt }
    }

    override suspend fun openConversation(otherId: String, trackId: String?): String = lock.withLock {
        requireMe()
        if (otherId == myId) throw IllegalArgumentException("자기 자신과는 대화할 수 없어요")
        if (isBlocked(myId, otherId)) throw CommunityException.Blocked()
        val existing = conversations.values.firstOrNull { it.other.id == otherId }
        if (existing != null) {
            if (trackId != null && existing.trackId == null) conversations[existing.id] = existing.copy(trackId = trackId, trackTitle = tracks[trackId]?.title)
            return@withLock existing.id
        }
        val other = profiles[otherId] ?: throw IllegalArgumentException("없는 사용자")
        val c = Conversation(UUID.randomUUID().toString(), other, trackId, trackId?.let { tracks[it]?.title }, "", now(), 0)
        conversations[c.id] = c
        c.id
    }

    override suspend fun messages(conversationId: String): List<Message> = lock.withLock {
        messages.filter { it.conversationId == conversationId }.sortedBy { it.createdAt }
    }

    override fun incoming(conversationId: String): Flow<Message> = stream.filter { it.conversationId == conversationId }

    override suspend fun sendMessage(conversationId: String, body: String): Message {
        val msg = lock.withLock {
            requireMe()
            val conv = conversations[conversationId] ?: throw IllegalArgumentException("없는 대화")
            if (isBlocked(myId, conv.other.id)) throw CommunityException.Blocked()
            val m = Message(UUID.randomUUID().toString(), conversationId, myId, ContentFilter.mask(body.trim().take(1000)), now())
            messages += m
            conversations[conversationId] = conv.copy(lastMessage = m.body.take(80), lastMessageAt = m.createdAt)
            m
        }
        // 체험 모드 자동 답장
        scope.launch {
            delay(replyDelayMs)
            val reply = lock.withLock {
                val conv = conversations[conversationId] ?: return@withLock null
                if (isBlocked(myId, conv.other.id)) return@withLock null
                val r = Message(
                    UUID.randomUUID().toString(), conversationId, conv.other.id,
                    "메시지 고마워요! (체험 모드 자동 답장이에요. 서버를 연결하면 실제 사용자와 대화할 수 있어요)", now(),
                )
                messages += r
                conversations[conversationId] = conv.copy(lastMessage = r.body.take(80), lastMessageAt = r.createdAt)
                r
            }
            reply?.let { stream.emit(it) }
        }
        return msg
    }

    override suspend fun markRead(conversationId: String) = lock.withLock {
        messages.replaceAll { if (it.conversationId == conversationId && it.senderId != myId && it.readAt == null) it.copy(readAt = now()) else it }
    }
}
