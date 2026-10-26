package com.tuneup.community

import com.tuneup.data.song.Genre
import com.tuneup.studio.Composition

data class Profile(
    val id: String,
    val nickname: String,
    val bio: String = "",
    val followerCount: Int = 0,
    val followingCount: Int = 0,
    val createdAt: Long = 0,
)

/** 커뮤니티에 공유된 곡 */
data class Track(
    val id: String,
    val ownerId: String,
    val ownerNickname: String,
    val title: String,
    val description: String,
    val genre: Genre,
    val composition: Composition,
    val likeCount: Int = 0,
    val ratingSum: Int = 0,
    val ratingCount: Int = 0,
    val commentCount: Int = 0,
    val playCount: Int = 0,
    val createdAt: Long = 0,
    val remixOf: String? = null,
    val likedByMe: Boolean = false,
    val myRating: Int? = null,
    val recommendCount: Int = 0,
    /** 오늘 내가 이 곡을 추천했는지 */
    val recommendedByMe: Boolean = false,
    val visibility: Visibility = Visibility.PUBLIC,
    val allowRemix: Boolean = true,
    val allowSing: Boolean = true,
    /** 곡의 일부만 공개했는지 (원본 [fullBars]마디 중 [highlightStartBar]마디부터 공개) */
    val isPartial: Boolean = false,
    val highlightStartBar: Int = 0,
    val fullBars: Int = 0,
) {
    val ratingAvg: Double get() = if (ratingCount == 0) 0.0 else ratingSum.toDouble() / ratingCount
    val hasLyrics: Boolean get() = composition.lyrics.isNotBlank()
}

data class Comment(val id: String, val trackId: String, val userId: String, val nickname: String, val body: String, val createdAt: Long)

data class Conversation(
    val id: String,
    val other: Profile,
    val trackId: String?,
    val trackTitle: String?,
    val lastMessage: String,
    val lastMessageAt: Long,
    val unread: Int,
)

data class Message(val id: String, val conversationId: String, val senderId: String, val body: String, val createdAt: Long, val readAt: Long? = null)

enum class FeedSort(val label: String) { LATEST("최신"), WEEKLY("이번 주 인기"), TOP_RATED("별점 높은") }

enum class ChartKind(val dbValue: String, val label: String, val caption: String) {
    WEEKLY("weekly", "이번 주", "월요일 0시부터 받은 반응"),
    RISING("rising", "급상승", "최근 24시간 동안 빠르게 오른 곡"),
    ROOKIE("rookie", "신인", "첫 곡을 올린 지 30일 이내인 제작자"),
    LAST_WEEK("last_week", "지난주", "지난주 최종 순위"),
}

data class SearchResult(val tracks: List<Track> = emptyList(), val people: List<Profile> = emptyList()) {
    val isEmpty get() = tracks.isEmpty() && people.isEmpty()
}

data class ChartEntry(val rank: Int, val track: Track, val score: Double)

enum class NotificationKind(val dbValue: String) { LIKE("like"), RECOMMEND("recommend"), COMMENT("comment"), FOLLOW("follow") }

data class AppNotification(
    val id: String,
    val kind: NotificationKind,
    val actor: Profile?,
    val trackId: String?,
    val trackTitle: String?,
    val createdAt: Long,
    val read: Boolean,
) {
    val text: String get() {
        val who = actor?.nickname ?: "누군가"
        val what = trackTitle?.let { "「$it」" } ?: "내 곡"
        val obj = objectParticle(trackTitle ?: "곡")
        return when (kind) {
            NotificationKind.LIKE -> "${who}님이 $what$obj 좋아해요"
            NotificationKind.RECOMMEND -> "${who}님이 $what$obj 추천했어요"
            NotificationKind.COMMENT -> "${who}님이 ${what}에 댓글을 남겼어요"
            NotificationKind.FOLLOW -> "${who}님이 나를 팔로우해요"
        }
    }
}

/** 마지막 글자 받침에 맞춘 목적격 조사: 산책 → 을, 파티 → 를 (한글이 아니면 을/를) */
fun objectParticle(word: String): String {
    val c = word.trimEnd().lastOrNull() ?: return "을(를)"
    if (c !in '가'..'힣') return "을(를)"
    return if ((c - '가') % 28 != 0) "을" else "를"
}

enum class ReportTarget(val dbValue: String) { TRACK("track"), COMMENT("comment"), USER("user"), MESSAGE("message") }

enum class ReportReason(val dbValue: String, val label: String) {
    PLAGIARISM("plagiarism", "다른 곡을 베꼈어요"),
    SPAM("spam", "스팸 · 광고"),
    ABUSE("abuse", "욕설 · 괴롭힘"),
    SEXUAL("sexual", "선정적인 내용"),
    SCAM("scam", "사기 · 외부 거래 유도"),
    OTHER("other", "기타"),
}

/** 화면에 그대로 보여줄 수 있는 오류 */
sealed class CommunityException(message: String) : Exception(message) {
    class NicknameTaken : CommunityException("이미 쓰고 있는 닉네임이에요")
    class InvalidNickname : CommunityException("닉네임은 2~12글자로 정해 주세요")
    class Blocked : CommunityException("차단 관계라 이용할 수 없어요")
    class NeedProfile : CommunityException("먼저 닉네임을 정해 주세요")
    class RecommendLimit : CommunityException("오늘 추천은 모두 썼어요. 내일 다시 3번 추천할 수 있어요")
    class OwnTrack : CommunityException("내 곡은 추천할 수 없어요")
    class RemixNotAllowed : CommunityException("원곡 제작자가 리믹스 공유를 허용하지 않았어요")
    class ServerConfig(detail: String) : CommunityException("서버 설정 문제로 이용할 수 없어요: $detail")
    class Network(detail: String?) : CommunityException("서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요" + (detail?.let { " ($it)" } ?: ""))
}
