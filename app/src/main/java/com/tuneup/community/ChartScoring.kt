package com.tuneup.community

import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneId
import java.time.temporal.TemporalAdjusters

/**
 * 차트 점수 규칙 (서버 supabase/migrations 의 chart() 와 같은 규칙. 체험 모드에서 사용)
 * 점수 = Σ 반응 점수 × 새 계정 가중치 × 시간 감쇠
 */
object ChartScoring {
    const val LIKE = 1.0
    const val RECOMMEND = 5.0
    const val COMPLETED_LISTEN = 0.5
    const val DAILY_RECOMMENDS = 3
    private const val DAY = 24 * 3600_000L
    val KST: ZoneId = ZoneId.of("Asia/Seoul")

    data class Reaction(val trackId: String, val userId: String, val at: Long, val points: Double)

    /** 이번 주 월요일 0시 (한국 시간) */
    fun weekStart(now: Long): Long =
        Instant.ofEpochMilli(now).atZone(KST).toLocalDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
            .atStartOfDay(KST).toInstant().toEpochMilli()

    fun kstDay(t: Long): Long = Instant.ofEpochMilli(t).atZone(KST).toLocalDate().toEpochDay()

    fun window(kind: ChartKind, now: Long): LongRange = when (kind) {
        ChartKind.LAST_WEEK -> weekStart(now) - 7 * DAY until weekStart(now)
        ChartKind.RISING -> now - DAY until now + 1
        ChartKind.WEEKLY, ChartKind.ROOKIE -> weekStart(now) until now + 1
    }

    /**
     * @param accountCreated 반응한 사용자의 가입 시각 (7일 이내면 점수 절반)
     * @param firstTrackAt 제작자의 첫 곡 시각 (신인 차트: 30일 이내)
     */
    fun rank(
        kind: ChartKind,
        reactions: List<Reaction>,
        tracks: Map<String, Track>,
        accountCreated: (String) -> Long,
        firstTrackAt: (String) -> Long,
        now: Long,
        limit: Int = 50,
    ): List<Pair<Track, Double>> {
        val w = window(kind, now)
        val span = (w.last - w.first).coerceAtLeast(1).toDouble()
        val end = minOf(w.last, now)
        return reactions.asSequence()
            .filter { it.at in w }
            .mapNotNull { r -> tracks[r.trackId]?.let { t -> t to r } }
            .filter { (t, r) -> t.visibility == Visibility.PUBLIC && r.userId != t.ownerId }
            .filter { (t, _) -> kind != ChartKind.ROOKIE || firstTrackAt(t.ownerId) > now - 30 * DAY }
            .groupBy({ it.first.id }, { it })
            .map { (_, list) ->
                val t = list.first().first
                val score = list.sumOf { (_, r) ->
                    val fresh = if (accountCreated(r.userId) > now - 7 * DAY) 0.5 else 1.0
                    val decay = 1.0 - 0.5 * ((end - r.at).coerceAtLeast(0) / span)
                    r.points * fresh * decay
                }
                Triple(t, score, list.maxOf { it.second.at })
            }
            .sortedWith(compareByDescending<Triple<Track, Double, Long>> { it.second }.thenByDescending { it.third })
            .take(limit)
            .map { it.first to it.second }
    }

    /** 홈 '추천' 피드 순서: 반응이 많고 최근 올라온 곡일수록 위로 */
    fun hot(t: Track, now: Long): Double {
        val hours = ((now - t.createdAt).coerceAtLeast(0) / 3600_000.0)
        val pts = t.likeCount * LIKE + t.recommendCount * RECOMMEND + t.commentCount * 2 + t.playCount * 0.1
        return (pts + 1) / Math.pow(hours + 2, 1.2)
    }
}
