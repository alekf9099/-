package com.melodeal

import com.melodeal.community.CommunityException
import com.melodeal.community.ContentFilter
import com.melodeal.community.DemoCommunity
import com.melodeal.community.FeedSort
import com.melodeal.community.Nickname
import com.melodeal.community.ReportReason
import com.melodeal.community.ReportTarget
import com.melodeal.community.TrackRow
import com.melodeal.community.toTrack
import com.melodeal.data.song.Genre
import com.melodeal.studio.Composition
import com.melodeal.studio.MelodyGenerator
import com.melodeal.studio.MusicKey
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class CommunityTest {
    private fun demo() = DemoCommunity(replyDelayMs = 10)

    private inline fun <reified E : Throwable> assertThrows(block: () -> Unit) {
        try { block(); fail("${E::class.simpleName} 예외가 나야 함") } catch (e: Throwable) { if (e !is E) throw e }
    }

    @Test
    fun nicknameRules() = runBlocking {
        val c = demo()
        assertNull(c.signIn())
        assertThrows<CommunityException.InvalidNickname> { runBlocking { c.saveProfile("가", "") } }
        assertThrows<CommunityException.InvalidNickname> { runBlocking { c.saveProfile("공백 있음", "") } }
        assertThrows<CommunityException.NicknameTaken> { runBlocking { c.saveProfile("별빛작곡가", "") } }
        val me = c.saveProfile("흥얼러", "안녕하세요")
        assertEquals("흥얼러", c.me.value?.nickname)
        assertEquals(me, c.signIn())
    }

    @Test
    fun needsProfileBeforeActing() = runBlocking {
        val c = demo()
        assertThrows<CommunityException.NeedProfile> { runBlocking { c.setLiked("t1", true) } }
    }

    @Test
    fun likeRateCommentUpdateCounts() = runBlocking {
        val c = demo()
        c.saveProfile("흥얼러", "")
        val before = c.track("t4")!!
        c.setLiked("t4", true)
        c.rate("t4", 3)
        c.rate("t4", 5) // 다시 주면 바뀜
        c.addComment("t4", "좋아요  시발")
        val after = c.track("t4")!!
        assertTrue(after.likedByMe)
        assertEquals(before.likeCount + 1, after.likeCount)
        assertEquals(5, after.myRating)
        assertEquals(before.ratingCount + 1, after.ratingCount)
        assertEquals(before.commentCount + 1, after.commentCount)
        assertEquals("좋아요  **", c.comments("t4").last().body)
        c.setLiked("t4", false)
        assertEquals(before.likeCount, c.track("t4")!!.likeCount)
    }

    @Test
    fun weeklyFeedIsSortedByRecentLikes() = runBlocking {
        val c = demo()
        val weekly = c.feed(FeedSort.WEEKLY)
        assertTrue(weekly.isNotEmpty())
        // t1·t3가 좋아요 3개로 가장 많음
        assertTrue(weekly.first().id in setOf("t1", "t3"))
        assertTrue(c.feed(FeedSort.LATEST, Genre.BALLAD).all { it.genre == Genre.BALLAD })
        val top = c.feed(FeedSort.TOP_RATED)
        top.zipWithNext().forEach { (a, b) -> assertTrue(a.ratingAvg >= b.ratingAvg) }
    }

    @Test
    fun publishAndCannotRateOwnTrack() = runBlocking {
        val c = demo()
        c.saveProfile("흥얼러", "")
        val comp = Composition("내 첫 곡", Genre.POP, notes = MelodyGenerator.generate(MusicKey(0, false), 1)).autoChords()
        val t = c.publish(comp, "들어봐 주세요")
        assertEquals("흥얼러", t.ownerNickname)
        assertEquals(t.id, c.feed(FeedSort.LATEST).first().id)
        c.rate(t.id, 5)
        assertEquals(0, c.track(t.id)!!.ratingCount)
        assertEquals(1, c.tracksBy("me").size)
        c.deleteTrack(t.id)
        assertNull(c.track(t.id))
    }

    @Test
    fun blockingHidesContentAndStopsChat() = runBlocking {
        val c = demo()
        c.saveProfile("흥얼러", "")
        val conv = c.openConversation("u2", "t2")
        assertEquals(conv, c.openConversation("u2"))
        c.sendMessage(conv, "가사 붙여도 될까요?")
        val reply = withTimeout(2000) { c.incoming(conv).first() }
        assertEquals("u2", reply.senderId)
        assertEquals(1, c.conversations().first().unread)
        c.markRead(conv)
        assertEquals(0, c.conversations().first().unread)
        assertEquals("환승역에서", c.conversations().first().trackTitle)

        c.block("u2")
        assertTrue(c.feed(FeedSort.LATEST).none { it.ownerId == "u2" })
        assertNull(c.track("t2"))
        assertThrows<CommunityException.Blocked> { runBlocking { c.sendMessage(conv, "...") } }
        assertThrows<CommunityException.Blocked> { runBlocking { c.openConversation("u2") } }
        assertEquals(listOf("퇴근길피아노"), c.blockedUsers().map { it.nickname })
        c.unblock("u2")
        assertTrue(c.feed(FeedSort.LATEST).any { it.ownerId == "u2" })
        c.report(ReportTarget.TRACK, "t2", ReportReason.PLAGIARISM)
    }

    @Test
    fun contentFilter() {
        assertTrue(ContentFilter.containsBadWord("시 발"))
        // 정상 단어는 걸리지 않아야 한다
        assertFalse(ContentFilter.containsBadWord("시발점에서 출발"))
        assertEquals("시발점에서 출발", ContentFilter.mask("시발점에서 출발"))
        assertEquals("시발점에서 ** 출발", ContentFilter.mask("시발점에서 시발 출발"))
        assertEquals("멋져요", ContentFilter.mask("멋져요"))
        assertEquals("Nickname", runCatching { Nickname.validate("ㅂㅅ") }.exceptionOrNull()?.let { "Nickname" })
    }

    @Test
    fun generatedMelodyIsMusical() {
        val key = MusicKey(2, false)
        val notes = MelodyGenerator.generate(key, seed = 7)
        assertEquals(32.0, notes.last().endBeat, 1e-9) // 8마디
        assertTrue(notes.all { key.inScale(it.midi) })
        assertEquals(key.tonic, notes.last().midi % 12) // 으뜸음으로 끝남
        val leaps = notes.zipWithNext().count { (a, b) -> kotlin.math.abs(a.midi - b.midi) > 5 }
        assertTrue("도약이 너무 많음: $leaps", leaps <= notes.size / 5)
        assertEquals(notes, MelodyGenerator.generate(key, seed = 7)) // 같은 시드 = 같은 멜로디
    }

    @Test
    fun decodesPostgrestTrackRow() {
        val comp = Composition("서버 곡", Genre.DANCE, notes = MelodyGenerator.generate(MusicKey(0, false), 3)).autoChords()
        val json = """
            {"id":"6f1c","owner_id":"u-1","title":"서버 곡","description":"","genre":"DANCE",
             "composition":${comp.toJson()},"remix_of":null,"like_count":3,"rating_sum":9,"rating_count":2,
             "comment_count":1,"play_count":10,"report_count":0,"hidden":false,
             "created_at":"2026-10-26T05:19:46.335+00:00","profiles":{"nickname":"하늘"}}
        """.trimIndent()
        val t = Json { ignoreUnknownKeys = true }.decodeFromString<TrackRow>(json).toTrack(liked = true, myRating = 4)
        assertEquals("하늘", t.ownerNickname)
        assertEquals(4.5, t.ratingAvg, 1e-9)
        assertEquals(comp, t.composition)
        assertEquals(1792991986335L, t.createdAt)
        assertTrue(t.likedByMe)
    }
}
