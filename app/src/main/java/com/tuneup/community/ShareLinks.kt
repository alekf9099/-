package com.tuneup.community

import com.tuneup.BuildConfig

/**
 * 곡·프로필 공유 링크.
 * tuneup:// 링크는 튠업이 설치된 폰에서 바로 그 곡을 연다. 앱이 없는 사람을 위해 받는 곳 주소도 함께 보낸다.
 * (웹 도메인이 생기면 https 앱 링크로 바꾸면 앱이 없어도 미리보기 페이지를 보여줄 수 있다)
 */
object ShareLinks {
    const val SCHEME = "tuneup"
    private val idPattern = Regex("^[A-Za-z0-9-]{1,64}$")

    fun track(id: String) = "$SCHEME://track/$id"
    fun profile(id: String) = "$SCHEME://profile/$id"

    sealed interface Target {
        data class TrackLink(val id: String) : Target
        data class ProfileLink(val id: String) : Target
    }

    /** 링크를 해석한다. 모르는 모양이거나 id 가 이상하면 null */
    fun parse(link: String): Target? {
        val m = Regex("^$SCHEME://(track|profile)/([^/?#]+)/?$").find(link.trim()) ?: return null
        val id = m.groupValues[2].takeIf { idPattern.matches(it) } ?: return null
        return if (m.groupValues[1] == "track") Target.TrackLink(id) else Target.ProfileLink(id)
    }

    fun trackMessage(t: Track, download: String = BuildConfig.DOWNLOAD_URL): String = buildString {
        append("튠업에서 ${t.ownerNickname}님의 「${t.title}」 들어보기")
        if (t.isPartial) append(" (하이라이트 공개)")
        append('\n').append(track(t.id))
        if (download.isNotBlank()) append("\n\n튠업이 없다면 여기서 받아요: ").append(download)
    }

    fun profileMessage(p: Profile, download: String = BuildConfig.DOWNLOAD_URL): String = buildString {
        append("튠업에서 ${p.nickname}님의 노래 보기\n").append(profile(p.id))
        if (download.isNotBlank()) append("\n\n튠업이 없다면 여기서 받아요: ").append(download)
    }
}
