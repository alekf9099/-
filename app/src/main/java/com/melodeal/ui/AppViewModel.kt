package com.melodeal.ui

import androidx.lifecycle.ViewModel
import com.melodeal.party.OrderMode
import com.melodeal.party.PartySession
import com.melodeal.party.Reservation
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** 액티비티 범위에서 공유하는 파티 진행 상태 */
class AppViewModel : ViewModel() {
    private val _party = MutableStateFlow(PartySession())
    val party: StateFlow<PartySession> = _party.asStateFlow()

    /** 다음 차례. 랜덤 모드에서도 화면이 다시 그려질 때마다 바뀌지 않도록 한 번 정하면 유지한다. */
    private val _upNext = MutableStateFlow<Reservation?>(null)
    val upNext: StateFlow<Reservation?> = _upNext.asStateFlow()

    private fun change(newTurn: Boolean = false, transform: (PartySession) -> PartySession) {
        val s = transform(_party.value)
        _party.value = s
        val cur = _upNext.value
        val keep = !newTurn && s.mode == OrderMode.RANDOM && cur != null && s.queue.any { it.id == cur.id }
        _upNext.value = if (keep) cur else s.nextTurn()
    }

    fun addPlayer(name: String) = change { if (name.isBlank()) it else it.addPlayer(name) }
    fun removePlayer(id: Int) = change { it.removePlayer(id) }
    fun setMode(mode: OrderMode) = change(newTurn = true) { it.copy(mode = mode) }
    fun reserve(playerId: Int, songId: String, title: String) = change { it.reserve(playerId, songId, title) }
    fun cancel(reservationId: Long) = change { it.cancel(reservationId) }
    fun skip(reservationId: Long) = change(newTurn = true) { it.skip(reservationId) }
    fun complete(reservationId: Long, score: Int) = change(newTurn = true) { it.complete(reservationId, score) }
    fun endParty() {
        _party.value = PartySession()
        _upNext.value = null
    }
}
