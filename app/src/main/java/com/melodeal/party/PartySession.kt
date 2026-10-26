package com.melodeal.party

import kotlin.random.Random

enum class OrderMode(val label: String, val description: String) {
    ROUND_ROBIN("차례대로", "등록한 순서대로 한 곡씩 돌아가며 불러요"),
    RANDOM("랜덤", "다음 사람을 무작위로 뽑아요 (같은 사람 연속 X)"),
    LOWEST_FIRST("꼴찌 먼저", "평균 점수가 가장 낮은 사람이 먼저 불러요"),
}

data class Player(val id: Int, val name: String, val colorIndex: Int)

data class Reservation(val id: Long, val playerId: Int, val songId: String, val songTitle: String)

data class TurnRecord(val playerId: Int, val songId: String, val songTitle: String, val score: Int)

data class PlayerStanding(val player: Player, val sung: Int, val total: Int, val best: Int) {
    val average: Double get() = if (sung == 0) 0.0 else total.toDouble() / sung
}

/**
 * 한 기기를 돌려가며 부르는 파티 모드의 진행 규칙. UI와 무관한 순수 로직이라 테스트로 검증한다.
 * 불변 객체로 두고 변경 시 새 인스턴스를 반환한다.
 */
data class PartySession(
    val players: List<Player> = emptyList(),
    val mode: OrderMode = OrderMode.ROUND_ROBIN,
    val queue: List<Reservation> = emptyList(),
    val history: List<TurnRecord> = emptyList(),
    val lastPlayerId: Int? = null,
    private val nextId: Long = 1,
) {
    fun addPlayer(name: String): PartySession {
        val id = (players.maxOfOrNull { it.id } ?: 0) + 1
        return copy(players = players + Player(id, name.trim(), (id - 1) % 6))
    }

    fun removePlayer(id: Int) = copy(
        players = players.filterNot { it.id == id },
        queue = queue.filterNot { it.playerId == id },
    )

    fun reserve(playerId: Int, songId: String, songTitle: String) =
        copy(queue = queue + Reservation(nextId, playerId, songId, songTitle), nextId = nextId + 1)

    fun cancel(reservationId: Long) = copy(queue = queue.filterNot { it.id == reservationId })

    fun reservationsOf(playerId: Int) = queue.filter { it.playerId == playerId }

    /** 순서 규칙에 따라 다음에 부를 예약. 예약이 없으면 null. */
    fun nextTurn(random: Random = Random.Default): Reservation? {
        val ready = players.filter { p -> queue.any { it.playerId == p.id } }
        if (ready.isEmpty()) return null
        val player = when (mode) {
            OrderMode.ROUND_ROBIN -> {
                val lastIdx = players.indexOfFirst { it.id == lastPlayerId }
                // 마지막으로 부른 사람 다음부터 한 바퀴 돌며 예약이 있는 사람
                (1..players.size).map { players[(lastIdx + it).mod(players.size)] }.first { it in ready }
            }
            OrderMode.RANDOM -> {
                val pool = ready.filter { it.id != lastPlayerId }.ifEmpty { ready }
                pool[random.nextInt(pool.size)]
            }
            OrderMode.LOWEST_FIRST -> {
                val byId = standings().associateBy { it.player.id }
                // 아직 안 부른 사람(-1)이 가장 먼저, 동점이면 등록 순
                ready.minWith(
                    compareBy<Player> { p -> byId[p.id]?.takeIf { it.sung > 0 }?.average ?: -1.0 }
                        .thenBy { players.indexOf(it) },
                )
            }
        }
        return queue.first { it.playerId == player.id }
    }

    /** 노래가 끝나고 점수가 나오면 기록하고 예약을 소진한다. */
    fun complete(reservationId: Long, score: Int): PartySession {
        val r = queue.firstOrNull { it.id == reservationId } ?: return this
        return copy(
            queue = queue - r,
            history = history + TurnRecord(r.playerId, r.songId, r.songTitle, score),
            lastPlayerId = r.playerId,
        )
    }

    /** 차례 넘기기: 이번 예약을 맨 뒤로 보내고 다음 사람에게 차례를 넘긴다. */
    fun skip(reservationId: Long): PartySession {
        val r = queue.firstOrNull { it.id == reservationId } ?: return this
        return copy(queue = queue - r + r, lastPlayerId = r.playerId)
    }

    fun standings(): List<PlayerStanding> = players.map { p ->
        val mine = history.filter { it.playerId == p.id }
        PlayerStanding(p, mine.size, mine.sumOf { it.score }, mine.maxOfOrNull { it.score } ?: 0)
    }.sortedWith(compareByDescending<PlayerStanding> { it.average }.thenByDescending { it.best })

    fun player(id: Int) = players.first { it.id == id }
}
