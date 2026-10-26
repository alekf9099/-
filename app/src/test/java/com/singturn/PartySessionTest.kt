package com.singturn

import com.singturn.party.OrderMode
import com.singturn.party.PartySession
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test
import kotlin.random.Random

class PartySessionTest {
    /** A, B, C 가 각자 2곡씩 예약 */
    private fun party(mode: OrderMode = OrderMode.ROUND_ROBIN): PartySession {
        var p = PartySession(mode = mode).addPlayer("A").addPlayer("B").addPlayer("C")
        for (round in 1..2) for (id in 1..3) p = p.reserve(id, "s$id$round", "곡 $id-$round")
        return p
    }

    private fun PartySession.playThrough(score: (playerId: Int) -> Int = { 80 }, random: Random = Random(0)): List<Int> {
        var p = this
        val order = mutableListOf<Int>()
        while (true) {
            val next = p.nextTurn(random) ?: break
            order += next.playerId
            p = p.complete(next.id, score(next.playerId))
        }
        return order
    }

    @Test
    fun roundRobinAlternates() {
        assertEquals(listOf(1, 2, 3, 1, 2, 3), party().playThrough())
    }

    @Test
    fun roundRobinSkipsPlayersWithoutReservations() {
        var p = PartySession().addPlayer("A").addPlayer("B").addPlayer("C")
        p = p.reserve(1, "x", "x").reserve(3, "y", "y").reserve(1, "z", "z")
        assertEquals(listOf(1, 3, 1), p.playThrough())
    }

    @Test
    fun skipPassesTurnToNextPlayer() {
        var p = party()
        val first = p.nextTurn()!!
        assertEquals(1, first.playerId)
        p = p.skip(first.id)
        assertEquals(2, p.nextTurn()!!.playerId)
        // 넘긴 곡은 사라지지 않고 뒤로 간다
        assertEquals(6, p.queue.size)
    }

    @Test
    fun randomNeverRepeatsSamePlayerWhenOthersAreWaiting() {
        val order = party(OrderMode.RANDOM).playThrough(random = Random(42))
        assertEquals(6, order.size)
        order.zipWithNext().forEach { (a, b) -> assertNotEquals(a, b) }
    }

    @Test
    fun lowestFirstPrioritisesUnsungThenLowestAverage() {
        val scores = mapOf(1 to 90, 2 to 50, 3 to 70)
        val order = party(OrderMode.LOWEST_FIRST).playThrough(score = { scores.getValue(it) })
        // 처음엔 안 부른 사람 순서대로, 그다음엔 평균 낮은 순 (B 50 → C 70 → A 90)
        assertEquals(listOf(1, 2, 3, 2, 3, 1), order)
    }

    @Test
    fun standingsSortedByAverage() {
        var p = party()
        val scores = mapOf(1 to 60, 2 to 95, 3 to 75)
        while (true) {
            val n = p.nextTurn() ?: break
            p = p.complete(n.id, scores.getValue(n.playerId))
        }
        assertEquals(listOf("B", "C", "A"), p.standings().map { it.player.name })
        assertEquals(2, p.standings().first().sung)
        assertNull(p.nextTurn())
    }

    @Test
    fun removingPlayerDropsTheirReservations() {
        val p = party().removePlayer(2)
        assertEquals(4, p.queue.size)
        assertEquals(listOf(1, 3, 1, 3), p.playThrough())
    }
}
