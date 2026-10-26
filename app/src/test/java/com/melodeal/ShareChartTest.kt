package com.melodeal

import com.melodeal.community.ChartKind
import com.melodeal.community.ChartScoring
import com.melodeal.community.CommunityException
import com.melodeal.community.DemoCommunity
import com.melodeal.community.FeedSort
import com.melodeal.community.NotificationKind
import com.melodeal.community.ShareCut
import com.melodeal.community.ShareSettings
import com.melodeal.community.Track
import com.melodeal.community.Visibility
import com.melodeal.data.song.Genre
import com.melodeal.studio.ChordSymbol
import com.melodeal.studio.Composition
import com.melodeal.studio.LyricsFitter
import com.melodeal.studio.MelodyNote
import com.melodeal.studio.MusicKey
import com.melodeal.studio.Quality
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class ShareChartTest {
    /** 8마디, 마디마다 4분음표 4개 (마디 번호가 음높이에 드러나게) */
    private val song = Composition(
        title = "공유 테스트",
        genre = Genre.POP,
        key = MusicKey(0, false),
        notes = (0 until 8).flatMap { bar -> (0 until 4).map { b -> MelodyNote(bar * 4.0 + b, 1.0, 60 + bar) } },
        chords = (0 until 16).map { ChordSymbol(it % 12, Quality.MAJOR) },
        lyrics = (0 until 8).joinToString("\n") { bar -> "가나다${"라마바사아자차카타파하".getOrElse(bar) { '하' }}" },
    )

    private inline fun <reified E : Throwable> assertThrows(block: () -> Unit) {
        try { block(); fail("${E::class.simpleName} 예외가 나야 함") } catch (e: Throwable) { if (e !is E) throw e }
    }

    @Test
    fun cutKeepsOnlyChosenBarsShiftedToZero() {
        val cut = ShareCut.apply(song, ShareSettings(startBar = 2, bars = 3))
        assertEquals(12, cut.notes.size)
        assertEquals(0.0, cut.notes.first().startBeat, 1e-9)
        assertEquals(62, cut.notes.first().midi)      // 3번째 마디부터
        assertEquals(64, cut.notes.last().midi)
        assertEquals(3, cut.bars)
        assertEquals((4 until 10).map { it % 12 }, cut.chords.map { it.root })  // 반 마디 코드 6칸
        val syl = LyricsFitter.split(cut.lyrics)
        assertEquals(12, syl.size)
        assertEquals(LyricsFitter.split(song.lyrics).subList(8, 20).map { it.text }, syl.map { it.text })
    }

    @Test
    fun hiddenLyricsAndChordsAreNotUploaded() {
        val cut = ShareCut.apply(song, ShareSettings(bars = 8, includeLyrics = false, includeChords = false))
        assertEquals("", cut.lyrics)
        assertTrue(cut.chords.isEmpty())
        assertEquals(32, cut.notes.size)
    }

    @Test
    fun noteCrossingTheEndIsTrimmed() {
        val long = song.copy(notes = listOf(MelodyNote(3.0, 3.0, 60), MelodyNote(7.0, 2.0, 62)))
        val cut = ShareCut.apply(long, ShareSettings(bars = 1))
        assertEquals(1, cut.notes.size)
        assertEquals(1.0, cut.notes[0].beats, 1e-9)
    }

    @Test
    fun rangeIsCoercedAndPartialDetected() {
        val s = ShareSettings(startBar = 7, bars = 5).coerceTo(song)
        assertEquals(1, s.bars)
        assertTrue(s.isPartial(song.bars))
        assertFalse(ShareSettings.full(song).isPartial(song.bars))
    }

    @Test
    fun highlightPicksDensestWindow() {
        val dense = song.copy(notes = song.notes.filter { it.startBeat < 16 || it.startBeat >= 24 } +
            (0 until 8).map { MelodyNote(24.0 + it * 0.5, 0.5, 70) })
        val h = ShareSettings.highlight(dense, 2)
        assertEquals(6, h.startBar)
        assertEquals(2, h.bars)
    }

    @Test
    fun lyricsRoundTripWithLatinWords() {
        val text = "twin-kle twin-kle\n작은 별"
        assertEquals(text, ShareCut.join(LyricsFitter.split(text)))
    }

    private fun track(id: String, owner: String, vis: Visibility = Visibility.PUBLIC) =
        Track(id, owner, owner, id, "", Genre.POP, song, visibility = vis)

    @Test
    fun chartWeightsRecommendsNewAccountsAndExcludesOwnerAndUnlisted() {
        val now = ChartScoring.weekStart(System.currentTimeMillis()) + 3 * 24 * 3600_000L
        val tracks = listOf(track("a", "o1"), track("b", "o2"), track("c", "o3", Visibility.UNLISTED)).associateBy { it.id }
        val old = now - 100L * 24 * 3600_000
        val reactions = listOf(
            ChartScoring.Reaction("a", "u1", now, ChartScoring.LIKE),
            ChartScoring.Reaction("a", "u2", now, ChartScoring.LIKE),
            ChartScoring.Reaction("a", "o1", now, ChartScoring.RECOMMEND),        // 주인 본인 → 제외
            ChartScoring.Reaction("b", "u1", now, ChartScoring.RECOMMEND),
            ChartScoring.Reaction("b", "new", now, ChartScoring.RECOMMEND),       // 새 계정 → 절반
            ChartScoring.Reaction("c", "u1", now, ChartScoring.RECOMMEND),        // 링크 공개 → 제외
        )
        val joined = mapOf("u1" to old, "u2" to old, "new" to now - 3600_000L, "o1" to old)
        val ranked = ChartScoring.rank(ChartKind.WEEKLY, reactions, tracks, { joined[it] ?: old }, { old }, now)
        assertEquals(listOf("b", "a"), ranked.map { it.first.id })
        assertEquals(7.5, ranked[0].second, 1e-6)
        assertEquals(2.0, ranked[1].second, 1e-6)
    }

    @Test
    fun olderReactionsDecayUpToHalf() {
        val start = ChartScoring.weekStart(System.currentTimeMillis())
        val now = start + 4 * 24 * 3600_000L
        val tracks = mapOf("a" to track("a", "o"))
        val score = ChartScoring.rank(ChartKind.WEEKLY, listOf(ChartScoring.Reaction("a", "u", start, 1.0)), tracks, { 0L }, { 0L }, now)
        assertEquals(0.5, score.single().second, 1e-6)
        val lastWeek = ChartScoring.rank(ChartKind.LAST_WEEK, listOf(ChartScoring.Reaction("a", "u", start - 1000, 1.0)), tracks, { 0L }, { 0L }, now)
        assertEquals("a", lastWeek.single().first.id)
        assertTrue(ChartScoring.rank(ChartKind.WEEKLY, listOf(ChartScoring.Reaction("a", "u", start - 1000, 1.0)), tracks, { 0L }, { 0L }, now).isEmpty())
    }

    @Test
    fun demoRecommendLimitAndOwnTrack() = runBlocking {
        val c = DemoCommunity(reactionDelayMs = 0)
        c.saveProfile("흥얼러", "")
        assertEquals(3, c.recommendsLeft())
        listOf("t1", "t2", "t3").forEach { c.recommend(it) }
        assertTrue(c.track("t1")!!.recommendedByMe)
        c.recommend("t1")                         // 같은 곡 다시 누르면 그대로
        assertEquals(0, c.recommendsLeft())
        assertThrows<CommunityException.RecommendLimit> { runBlocking { c.recommend("t4") } }
        val mine = c.publish(song, "", ShareSettings.highlight(song))
        assertTrue(mine.isPartial)
        assertEquals(4, mine.composition.bars)
        assertEquals(8, mine.fullBars)
        assertThrows<CommunityException.OwnTrack> { runBlocking { c.recommend(mine.id) } }
    }

    @Test
    fun demoListenCountsOncePerDay() = runBlocking {
        val c = DemoCommunity(reactionDelayMs = 0)
        c.saveProfile("흥얼러", "")
        val before = c.track("t6")!!.playCount
        c.recordListen("t6")
        c.recordListen("t6", completed = true)
        assertEquals(before + 1, c.track("t6")!!.playCount)
        assertTrue(c.chart(ChartKind.RISING).any { it.track.id == "t6" })
    }

    @Test
    fun demoChartsHaveEntries() = runBlocking {
        val c = DemoCommunity(reactionDelayMs = 0)
        for (k in ChartKind.entries) {
            val e = c.chart(k)
            assertTrue("$k 차트가 비어 있음", e.isNotEmpty())
            assertEquals((1..e.size).toList(), e.map { it.rank })
            assertTrue(e.zipWithNext().all { (a, b) -> a.score >= b.score })
        }
        assertTrue(c.chart(ChartKind.ROOKIE).all { it.track.ownerId in setOf("u3", "u4") })
        assertTrue(c.chart(ChartKind.WEEKLY, Genre.BALLAD).all { it.track.genre == Genre.BALLAD })
    }

    @Test
    fun unlistedTrackIsHiddenFromFeedsButOpenableByLink() = runBlocking {
        val c = DemoCommunity(reactionDelayMs = 0)
        c.saveProfile("흥얼러", "")
        val t = c.publish(song, "", ShareSettings.full(song).copy(visibility = Visibility.UNLISTED, allowRemix = false))
        assertTrue(c.discover().none { it.id == t.id })
        assertTrue(c.feed(FeedSort.LATEST).none { it.id == t.id })
        assertFalse(c.track(t.id)!!.allowRemix)
        val pub = c.updateShare(t.id, ShareSettings(visibility = Visibility.PUBLIC, startBar = 0, bars = 2), song)
        assertEquals(2, pub.composition.bars)
        assertTrue(c.discover().any { it.id == t.id })
    }

    @Test
    fun demoFollowFeedAndNotifications() = runBlocking {
        val c = DemoCommunity(reactionDelayMs = 5)
        c.saveProfile("흥얼러", "")
        assertTrue(c.followingFeed().isEmpty())
        c.setFollowing("u1", true)
        assertTrue(c.isFollowing("u1"))
        assertEquals(3, c.profile("u1")!!.followerCount)
        assertTrue(c.followingFeed().all { it.ownerId == "u1" } && c.followingFeed().isNotEmpty())

        val t = c.publish(song, "첫 공유")
        val first = withTimeout(3000) { c.notificationEvents().first() }
        assertEquals(NotificationKind.LIKE, first.kind)
        withTimeout(3000) { while (c.notifications().size < 4) kotlinx.coroutines.delay(5) }
        val kinds = c.notifications().map { it.kind }.toSet()
        assertEquals(NotificationKind.entries.toSet(), kinds)
        assertTrue(c.notifications().all { !it.read })
        c.markNotificationsRead()
        assertTrue(c.notifications().all { it.read })
        assertEquals(1, c.track(t.id)!!.recommendCount)

        c.block("u1")
        assertFalse(c.isFollowing("u1"))
        assertTrue(c.notifications().none { it.actor?.id == "u1" })
    }
}

class ParticleTest {
    @Test fun objectParticleFollowsFinalConsonant() {
        assertEquals("을", com.melodeal.community.objectParticle("밤하늘 산책"))
        assertEquals("를", com.melodeal.community.objectParticle("불금 파티"))
        assertEquals("을(를)", com.melodeal.community.objectParticle("Summer"))
    }
}
