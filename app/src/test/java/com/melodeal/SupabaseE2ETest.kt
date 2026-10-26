package com.melodeal

import com.melodeal.community.FeedSort
import com.melodeal.community.ReportReason
import com.melodeal.community.ReportTarget
import com.melodeal.community.SupabaseCommunity
import com.melodeal.data.song.Genre
import com.melodeal.studio.Composition
import com.melodeal.studio.MelodyGenerator
import com.melodeal.studio.MusicKey
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.MemoryCodeVerifierCache
import io.github.jan.supabase.auth.MemorySessionManager
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import kotlin.random.Random

/**
 * 실제 Supabase 서버에 두 사용자로 붙어 공유·평가·댓글·실시간 채팅·차단까지 확인한다.
 * MELODEAL_E2E=1 일 때만 실행 (평소 테스트에서는 건너뜀). 만든 데이터 닉네임은 'e2e' 로 시작.
 */
class SupabaseE2ETest {
    private fun client() = SupabaseCommunity(
        createSupabaseClient(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON_KEY) {
            install(Auth) {
                // JVM 테스트에는 안드로이드 저장소가 없으므로 메모리에만 세션 보관
                sessionManager = MemorySessionManager()
                codeVerifierCache = MemoryCodeVerifierCache()
                alwaysAutoRefresh = false
                enableLifecycleCallbacks = false
            }
            install(Postgrest)
            install(Realtime)
        },
    )

    @Test
    fun twoUsersShareRateChatAndBlock() = runBlocking {
        assumeTrue(System.getenv("MELODEAL_E2E") == "1" && BuildConfig.SUPABASE_URL.isNotBlank())
        val tag = Random.nextInt(1000, 9999)
        val alice = client()
        val bob = client()
        assertNull("새 익명 사용자는 프로필이 없어야 함", alice.signIn())
        bob.signIn()
        val a = alice.saveProfile("e2e하늘$tag", "작곡가")
        val b = bob.saveProfile("e2e바다$tag", "")

        // 공유
        val comp = Composition("E2E 테스트 곡 $tag", Genre.BALLAD, key = MusicKey(0, false), notes = MelodyGenerator.generate(MusicKey(0, false), tag.toLong())).autoChords()
        val t = alice.publish(comp, "자동 테스트")
        assertEquals(comp, t.composition)
        assertTrue(bob.feed(FeedSort.LATEST).any { it.id == t.id })

        // 평가 · 댓글 · 재생 수
        bob.setLiked(t.id, true)
        bob.rate(t.id, 4)
        bob.addComment(t.id, "좋아요!")
        bob.recordListen(t.id, completed = true)
        val seen = alice.track(t.id)!!
        assertEquals(1, seen.likeCount)
        assertEquals(4.0, seen.ratingAvg, 1e-9)
        assertEquals(1, seen.commentCount)
        assertEquals(1, seen.playCount)
        assertTrue(bob.feed(FeedSort.WEEKLY).any { it.id == t.id })
        assertTrue("내 곡 별점은 서버가 거부해야 함", runCatching { alice.rate(t.id, 5) }.isFailure)
        assertEquals("좋아요!", alice.comments(t.id).single().body)

        // 실시간 채팅: 밥이 곡을 보고 대화를 열고, 앨리스는 실시간으로 받는다
        val conv = bob.openConversation(a.id, t.id)
        assertEquals(conv, alice.openConversation(b.id))
        val incoming = async(start = kotlinx.coroutines.CoroutineStart.UNDISPATCHED) { withTimeout(15_000) { alice.incoming(conv).first() } }
        delay(2500) // 실시간 구독이 붙을 시간
        bob.sendMessage(conv, "가사 붙여봐도 될까요?")
        assertEquals("가사 붙여봐도 될까요?", incoming.await().body)
        val list = alice.conversations()
        assertEquals(1, list.single { it.id == conv }.unread)
        assertEquals(comp.title, list.single { it.id == conv }.trackTitle)
        alice.markRead(conv)
        assertEquals(0, alice.conversations().single { it.id == conv }.unread)

        // 신고 · 차단
        alice.report(ReportTarget.USER, b.id, ReportReason.SPAM, "e2e")
        alice.block(b.id)
        assertEquals(listOf(b.nickname), alice.blockedUsers().map { it.nickname })
        assertTrue("차단당하면 곡이 안 보임", bob.feed(FeedSort.LATEST).none { it.id == t.id })
        assertTrue("차단 후 메시지 불가", runCatching { bob.sendMessage(conv, "...") }.isFailure)
        alice.unblock(b.id)
        assertTrue(bob.feed(FeedSort.LATEST).any { it.id == t.id })

        // 정리: 곡 삭제 (프로필·대화는 운영 DB에서 e2e 접두사로 정리)
        alice.deleteTrack(t.id)
        assertNull(bob.track(t.id))
        println("E2E 통과: ${a.nickname} / ${b.nickname}")
    }
}
