package com.melodeal.community

import com.melodeal.data.song.Genre
import com.melodeal.studio.Composition
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

/**
 * 곡 공유 · 평가 · 댓글 · 채팅 · 신고 · 차단.
 * 서버(Supabase)가 설정돼 있으면 [SupabaseCommunity], 아니면 기기 안에서만 도는 [DemoCommunity]를 쓴다.
 */
interface CommunityRepository {
    /** true = 체험 모드 (다른 사용자와 연결되지 않음) */
    val isDemo: Boolean
    val me: StateFlow<Profile?>

    /** 익명 로그인 후 내 프로필을 불러온다. 프로필이 없으면 null (닉네임 설정 필요) */
    suspend fun signIn(): Profile?
    suspend fun saveProfile(nickname: String, bio: String): Profile

    suspend fun feed(sort: FeedSort, genre: Genre? = null): List<Track>
    suspend fun track(id: String): Track?
    suspend fun tracksBy(userId: String): List<Track>
    suspend fun profile(userId: String): Profile?
    suspend fun publish(composition: Composition, description: String, remixOf: String? = null): Track
    suspend fun deleteTrack(id: String)

    suspend fun setLiked(trackId: String, liked: Boolean)
    suspend fun rate(trackId: String, stars: Int)
    suspend fun recordPlay(trackId: String)

    suspend fun comments(trackId: String): List<Comment>
    suspend fun addComment(trackId: String, body: String): Comment
    suspend fun deleteComment(commentId: String)

    suspend fun report(target: ReportTarget, targetId: String, reason: ReportReason, detail: String = "")
    suspend fun block(userId: String)
    suspend fun unblock(userId: String)
    suspend fun blockedUsers(): List<Profile>

    suspend fun conversations(): List<Conversation>
    suspend fun openConversation(otherId: String, trackId: String? = null): String
    suspend fun messages(conversationId: String): List<Message>
    /** 새로 도착하는 메시지 (실시간) */
    fun incoming(conversationId: String): Flow<Message>
    suspend fun sendMessage(conversationId: String, body: String): Message
    suspend fun markRead(conversationId: String)
}

object Nickname {
    private val allowed = Regex("^[가-힣a-zA-Z0-9_]{2,12}$")
    fun validate(raw: String): String {
        val n = raw.trim()
        if (!allowed.matches(n) || ContentFilter.containsBadWord(n)) throw CommunityException.InvalidNickname()
        return n
    }
}

/** 댓글·메시지의 심한 욕설을 가린다 (서버 신고 기능의 보조 수단) */
object ContentFilter {
    private val badWords = listOf("시발", "씨발", "ㅅㅂ", "병신", "ㅂㅅ", "좆", "개새끼", "미친놈", "fuck", "shit")
    // 욕설 글자가 들어 있지만 정상적인 단어 (오탐 방지)
    private val allowed = listOf("시발점", "시발역", "시발택시", "병신년", "병신춘문예")

    private fun withoutAllowed(text: String): String {
        var out = text
        for (w in allowed) out = out.replace(w, " ".repeat(w.length))
        return out
    }

    fun containsBadWord(text: String): Boolean {
        val squashed = withoutAllowed(text).lowercase().replace(Regex("[\\s.·*_-]"), "")
        return badWords.any { squashed.contains(it) }
    }

    fun mask(text: String): String {
        val probe = withoutAllowed(text)
        val out = StringBuilder(text)
        for (w in badWords) {
            Regex(Regex.escape(w), RegexOption.IGNORE_CASE).findAll(probe).forEach { m ->
                for (i in m.range) out.setCharAt(i, '*')
            }
        }
        return out.toString()
    }
}
