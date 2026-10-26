package com.melodeal.community

import com.melodeal.data.song.Genre
import com.melodeal.studio.Composition
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.exceptions.RestException
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.query.filter.FilterOperator
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.decodeRecord
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.realtime
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.IOException
import java.time.Instant
import java.time.OffsetDateTime
import java.util.UUID

// ───────── PostgREST 행 (DB 컬럼 이름 그대로) ─────────

@Serializable
internal data class ProfileRow(val id: String, val nickname: String, val bio: String = "")

@Serializable
internal data class NicknameRef(val nickname: String)

@Serializable
internal data class TrackRow(
    val id: String,
    @SerialName("owner_id") val ownerId: String,
    val title: String,
    val description: String = "",
    val genre: String,
    val composition: JsonElement,
    @SerialName("remix_of") val remixOf: String? = null,
    @SerialName("like_count") val likeCount: Int = 0,
    @SerialName("rating_sum") val ratingSum: Int = 0,
    @SerialName("rating_count") val ratingCount: Int = 0,
    @SerialName("comment_count") val commentCount: Int = 0,
    @SerialName("play_count") val playCount: Int = 0,
    @SerialName("created_at") val createdAt: String,
    val profiles: NicknameRef? = null,
)

@Serializable
internal data class TrackInsert(
    @SerialName("owner_id") val ownerId: String,
    val title: String,
    val description: String,
    val genre: String,
    val composition: JsonElement,
    @SerialName("remix_of") val remixOf: String?,
)

@Serializable
internal data class LikeRow(@SerialName("track_id") val trackId: String, @SerialName("user_id") val userId: String)

@Serializable
internal data class RatingRow(@SerialName("track_id") val trackId: String, @SerialName("user_id") val userId: String, val stars: Int)

@Serializable
internal data class CommentRow(
    val id: String = "",
    @SerialName("track_id") val trackId: String,
    @SerialName("user_id") val userId: String,
    val body: String,
    @SerialName("created_at") val createdAt: String = "",
    val profiles: NicknameRef? = null,
)

@Serializable
internal data class CommentInsert(@SerialName("track_id") val trackId: String, @SerialName("user_id") val userId: String, val body: String)

@Serializable
internal data class BlockRow(
    @SerialName("blocker_id") val blockerId: String,
    @SerialName("blocked_id") val blockedId: String,
    val profiles: ProfileRow? = null,
)

@Serializable
internal data class ReportInsert(
    @SerialName("reporter_id") val reporterId: String,
    @SerialName("target_type") val targetType: String,
    @SerialName("target_id") val targetId: String,
    val reason: String,
    val detail: String,
)

@Serializable
internal data class TitleRef(val title: String)

@Serializable
internal data class ConversationRow(
    val id: String,
    @SerialName("user_a") val userA: String,
    @SerialName("user_b") val userB: String,
    @SerialName("track_id") val trackId: String? = null,
    @SerialName("last_message") val lastMessage: String = "",
    @SerialName("last_message_at") val lastMessageAt: String,
    val a: ProfileRow? = null,
    val b: ProfileRow? = null,
    val tracks: TitleRef? = null,
)

@Serializable
internal data class MessageRow(
    val id: String = "",
    @SerialName("conversation_id") val conversationId: String,
    @SerialName("sender_id") val senderId: String,
    val body: String,
    @SerialName("created_at") val createdAt: String = "",
    @SerialName("read_at") val readAt: String? = null,
)

@Serializable
internal data class MessageInsert(@SerialName("conversation_id") val conversationId: String, @SerialName("sender_id") val senderId: String, val body: String)

@Serializable
internal data class UnreadRow(@SerialName("conversation_id") val conversationId: String)

internal fun parseTime(s: String?): Long = if (s.isNullOrBlank()) 0 else runCatching { OffsetDateTime.parse(s).toInstant().toEpochMilli() }.getOrDefault(0)

internal fun TrackRow.toTrack(liked: Boolean = false, myRating: Int? = null, nickname: String? = null) = Track(
    id = id, ownerId = ownerId, ownerNickname = nickname ?: profiles?.nickname ?: "알 수 없음", title = title, description = description,
    genre = runCatching { Genre.valueOf(genre) }.getOrDefault(Genre.POP),
    composition = Composition.fromJson(composition.toString()),
    likeCount = likeCount, ratingSum = ratingSum, ratingCount = ratingCount, commentCount = commentCount, playCount = playCount,
    createdAt = parseTime(createdAt), remixOf = remixOf, likedByMe = liked, myRating = myRating,
)

internal fun MessageRow.toMessage() = Message(id, conversationId, senderId, body, parseTime(createdAt), readAt?.let(::parseTime))

/**
 * Supabase 서버 연결. DB 구조와 보안 규칙은 supabase/migrations 참고.
 * 로그인은 익명 로그인(대시보드 Authentication > Sign In / Providers 에서 Anonymous 사용 설정 필요).
 */
class SupabaseCommunity(private val client: SupabaseClient) : CommunityRepository {
    override val isDemo = false
    private val _me = MutableStateFlow<Profile?>(null)
    override val me: StateFlow<Profile?> = _me

    private val trackColumns = Columns.raw("*, profiles(nickname)")

    private fun uid(): String = client.auth.currentUserOrNull()?.id ?: throw CommunityException.NeedProfile()
    private fun requireProfile(): Profile = _me.value ?: throw CommunityException.NeedProfile()

    /** 서버 오류를 화면용 오류로 바꾼다 */
    private suspend fun <T> call(block: suspend () -> T): T = try {
        block()
    } catch (e: CommunityException) {
        throw e
    } catch (e: RestException) {
        val msg = (e.error + " " + (e.description ?: "") + " " + (e.message ?: "")).lowercase()
        throw when {
            "anonymous" in msg -> CommunityException.ServerConfig("익명 로그인이 꺼져 있어요 (Supabase 대시보드에서 켜야 해요)")
            "profiles_nickname_key" in msg || ("duplicate" in msg && "nickname" in msg) -> CommunityException.NicknameTaken()
            "blocked" in msg || "row-level security" in msg -> CommunityException.Blocked()
            else -> CommunityException.Network(e.error)
        }
    } catch (e: IOException) {
        throw CommunityException.Network(e.message)
    } catch (e: Exception) {
        if (e is kotlinx.coroutines.CancellationException) throw e
        throw CommunityException.Network(e.message)
    }

    override suspend fun signIn(): Profile? = call {
        client.auth.awaitInitialization()
        if (client.auth.currentUserOrNull() == null) client.auth.signInAnonymously()
        val p = client.from("profiles").select { filter { eq("id", uid()) } }.decodeSingleOrNull<ProfileRow>()
        p?.let { Profile(it.id, it.nickname, it.bio) }.also { _me.value = it }
    }

    override suspend fun saveProfile(nickname: String, bio: String): Profile = call {
        val n = Nickname.validate(nickname)
        val row = ProfileRow(uid(), n, bio.take(80))
        client.from("profiles").upsert(row) { onConflict = "id" }
        Profile(row.id, row.nickname, row.bio).also { _me.value = it }
    }

    private suspend fun decorate(rows: List<TrackRow>, nicknames: Map<String, String> = emptyMap()): List<Track> {
        if (rows.isEmpty()) return emptyList()
        val me = client.auth.currentUserOrNull()?.id
        val ids = rows.map { it.id }
        val liked = if (me == null) emptySet() else
            client.from("likes").select { filter { eq("user_id", me); isIn("track_id", ids) } }.decodeList<LikeRow>().map { it.trackId }.toSet()
        val rated = if (me == null) emptyMap() else
            client.from("ratings").select { filter { eq("user_id", me); isIn("track_id", ids) } }.decodeList<RatingRow>().associate { it.trackId to it.stars }
        return rows.map { it.toTrack(it.id in liked, rated[it.id], nicknames[it.ownerId]) }
    }

    override suspend fun feed(sort: FeedSort, genre: Genre?): List<Track> = call {
        when (sort) {
            FeedSort.WEEKLY -> {
                val rows = client.postgrest.rpc("weekly_top", buildJsonObject { put("p_limit", 30) }).decodeList<TrackRow>()
                    .filter { genre == null || it.genre == genre.name }
                // RPC 결과에는 닉네임이 없으므로 따로 가져온다
                val owners = rows.map { it.ownerId }.distinct()
                val names = if (owners.isEmpty()) emptyMap() else
                    client.from("profiles").select { filter { isIn("id", owners) } }.decodeList<ProfileRow>().associate { it.id to it.nickname }
                decorate(rows, names)
            }
            else -> decorate(
                client.from("tracks").select(trackColumns) {
                    filter { if (genre != null) eq("genre", genre.name) }
                    if (sort == FeedSort.TOP_RATED) {
                        filter { gt("rating_count", 0) }
                        order("rating_sum", Order.DESCENDING)
                    } else {
                        order("created_at", Order.DESCENDING)
                    }
                    limit(50)
                }.decodeList<TrackRow>(),
            ).let { list -> if (sort == FeedSort.TOP_RATED) list.sortedByDescending { it.ratingAvg } else list }
        }
    }

    override suspend fun track(id: String): Track? = call {
        client.from("tracks").select(trackColumns) { filter { eq("id", id) } }.decodeSingleOrNull<TrackRow>()?.let { decorate(listOf(it)).first() }
    }

    override suspend fun tracksBy(userId: String): List<Track> = call {
        decorate(client.from("tracks").select(trackColumns) { filter { eq("owner_id", userId) }; order("created_at", Order.DESCENDING) }.decodeList())
    }

    override suspend fun profile(userId: String): Profile? = call {
        client.from("profiles").select { filter { eq("id", userId) } }.decodeSingleOrNull<ProfileRow>()?.let { Profile(it.id, it.nickname, it.bio) }
    }

    override suspend fun publish(composition: Composition, description: String, remixOf: String?): Track = call {
        val me = requireProfile()
        val row = client.from("tracks").insert(
            TrackInsert(me.id, composition.title.take(30), description.take(200), composition.genre.name, Json.parseToJsonElement(composition.toJson()), remixOf),
        ) { select(trackColumns) }.decodeSingle<TrackRow>()
        row.toTrack(nickname = me.nickname)
    }

    override suspend fun deleteTrack(id: String) = call { client.from("tracks").delete { filter { eq("id", id) } }; Unit }

    override suspend fun setLiked(trackId: String, liked: Boolean) = call {
        val me = requireProfile().id
        if (liked) client.from("likes").upsert(LikeRow(trackId, me)) { onConflict = "track_id,user_id"; ignoreDuplicates = true }
        else client.from("likes").delete { filter { eq("track_id", trackId); eq("user_id", me) } }
        Unit
    }

    override suspend fun rate(trackId: String, stars: Int) = call {
        require(stars in 1..5)
        client.from("ratings").upsert(RatingRow(trackId, requireProfile().id, stars)) { onConflict = "track_id,user_id" }
        Unit
    }

    override suspend fun recordPlay(trackId: String) = call {
        client.postgrest.rpc("increment_play", buildJsonObject { put("p_track", trackId) })
        Unit
    }

    override suspend fun comments(trackId: String): List<Comment> = call {
        client.from("comments").select(Columns.raw("*, profiles(nickname)")) { filter { eq("track_id", trackId) }; order("created_at", Order.ASCENDING) }
            .decodeList<CommentRow>()
            .map { Comment(it.id, it.trackId, it.userId, it.profiles?.nickname ?: "알 수 없음", it.body, parseTime(it.createdAt)) }
    }

    override suspend fun addComment(trackId: String, body: String): Comment = call {
        val me = requireProfile()
        val row = client.from("comments").insert(CommentInsert(trackId, me.id, ContentFilter.mask(body.trim().take(300)))) { select() }.decodeSingle<CommentRow>()
        Comment(row.id, row.trackId, row.userId, me.nickname, row.body, parseTime(row.createdAt))
    }

    override suspend fun deleteComment(commentId: String) = call { client.from("comments").delete { filter { eq("id", commentId) } }; Unit }

    override suspend fun report(target: ReportTarget, targetId: String, reason: ReportReason, detail: String) = call {
        client.from("reports").upsert(ReportInsert(requireProfile().id, target.dbValue, targetId, reason.dbValue, detail.take(300))) {
            onConflict = "reporter_id,target_type,target_id"; ignoreDuplicates = true
        }
        Unit
    }

    override suspend fun block(userId: String) = call {
        client.from("blocks").upsert(BlockRow(requireProfile().id, userId)) { onConflict = "blocker_id,blocked_id"; ignoreDuplicates = true }
        Unit
    }

    override suspend fun unblock(userId: String) = call {
        client.from("blocks").delete { filter { eq("blocker_id", requireProfile().id); eq("blocked_id", userId) } }
        Unit
    }

    override suspend fun blockedUsers(): List<Profile> = call {
        client.from("blocks").select(Columns.raw("*, profiles!blocks_blocked_id_fkey(id, nickname, bio)")) { filter { eq("blocker_id", uid()) } }
            .decodeList<BlockRow>().mapNotNull { it.profiles?.let { p -> Profile(p.id, p.nickname, p.bio) } }
    }

    override suspend fun conversations(): List<Conversation> = call {
        val me = uid()
        val rows = client.from("conversations").select(
            Columns.raw("*, a:profiles!conversations_user_a_fkey(id, nickname, bio), b:profiles!conversations_user_b_fkey(id, nickname, bio), tracks(title)"),
        ) { order("last_message_at", Order.DESCENDING) }.decodeList<ConversationRow>()
        val unread = client.from("messages").select(Columns.list("conversation_id")) {
            filter { neq("sender_id", me); filter("read_at", FilterOperator.IS, "null") }
        }.decodeList<UnreadRow>().groupingBy { it.conversationId }.eachCount()
        rows.mapNotNull { r ->
            val other = (if (r.userA == me) r.b else r.a) ?: return@mapNotNull null
            Conversation(r.id, Profile(other.id, other.nickname, other.bio), r.trackId, r.tracks?.title, r.lastMessage, parseTime(r.lastMessageAt), unread[r.id] ?: 0)
        }
    }

    override suspend fun openConversation(otherId: String, trackId: String?): String = call {
        requireProfile()
        client.postgrest.rpc("open_conversation", buildJsonObject {
            put("p_other", otherId)
            if (trackId != null) put("p_track", trackId)
        }).decodeAs<String>()
    }

    override suspend fun messages(conversationId: String): List<Message> = call {
        client.from("messages").select { filter { eq("conversation_id", conversationId) }; order("created_at", Order.ASCENDING); limit(500) }
            .decodeList<MessageRow>().map { it.toMessage() }
    }

    override fun incoming(conversationId: String): Flow<Message> = flow {
        val channel = client.channel("conv-$conversationId-${UUID.randomUUID()}")
        val changes = channel.postgresChangeFlow<PostgresAction.Insert>(schema = "public") {
            table = "messages"
            filter("conversation_id", FilterOperator.EQ, conversationId)
        }
        channel.subscribe()
        try {
            emitAll(changes.map { it.decodeRecord<MessageRow>().toMessage() })
        } finally {
            withContext(NonCancellable) { client.realtime.removeChannel(channel) }
        }
    }

    override suspend fun sendMessage(conversationId: String, body: String): Message = call {
        client.from("messages").insert(MessageInsert(conversationId, requireProfile().id, ContentFilter.mask(body.trim().take(1000)))) { select() }
            .decodeSingle<MessageRow>().toMessage()
    }

    override suspend fun markRead(conversationId: String) = call {
        val me = uid()
        client.from("messages").update(buildJsonObject { put("read_at", Instant.now().toString()) }) {
            filter { eq("conversation_id", conversationId); neq("sender_id", me); filter("read_at", FilterOperator.IS, "null") }
        }
        Unit
    }
}
