package com.melodeal.community

import com.melodeal.data.song.Genre
import com.melodeal.studio.Composition

data class Profile(val id: String, val nickname: String, val bio: String = "")

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
) {
    val ratingAvg: Double get() = if (ratingCount == 0) 0.0 else ratingSum.toDouble() / ratingCount
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
    class ServerConfig(detail: String) : CommunityException("서버 설정 문제로 이용할 수 없어요: $detail")
    class Network(detail: String?) : CommunityException("서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요" + (detail?.let { " ($it)" } ?: ""))
}
