package com.singturn.ui.ranking

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SecondaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.singturn.ui.app
import com.singturn.ui.components.EmptyState
import com.singturn.ui.components.NeonCard
import com.singturn.ui.components.SingTopBar
import com.singturn.ui.theme.Neon
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.TemporalAdjusters

private fun medal(rank: Int): Color = when (rank) {
    1 -> Neon.Gold; 2 -> Color(0xFFC9D1E0); 3 -> Color(0xFFE09A62); else -> Neon.TextMid
}

/** 이번 주 월요일 0시 (주간 시즌 시작) */
private fun weekStartMillis(): Long =
    LocalDate.now().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        .atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RankingScreen(onBack: () -> Unit) {
    val app = app()
    val dao = app.db.scores()
    val songs = app.songs.builtin
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var songId by rememberSaveable { mutableStateOf(songs.first().id) }

    Column(Modifier.fillMaxSize()) {
        SingTopBar("랭킹", onBack)
        SecondaryTabRow(selectedTabIndex = tab, containerColor = Neon.Bg) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("곡별") })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("이번 주") })
            Tab(selected = tab == 2, onClick = { tab = 2 }, text = { Text("플레이어") })
        }
        when (tab) {
            0 -> {
                LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(songs, key = { it.id }) { s ->
                        FilterChip(selected = s.id == songId, onClick = { songId = s.id }, label = { Text(s.title, maxLines = 1) })
                    }
                }
                val rows by remember(songId) { dao.topForSong(songId) }.collectAsState(initial = emptyList())
                RankList(rows.map { RankRow(it.playerName, "키 ${"%+d".format(it.keyShift)}", it.total) })
            }
            1 -> {
                val since = remember { weekStartMillis() }
                val rows by remember { dao.topSince(since) }.collectAsState(initial = emptyList())
                Text("매주 월요일 0시에 새 시즌이 시작돼요", color = Neon.TextLow, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
                RankList(rows.map { RankRow(it.playerName, it.songTitle, it.total) })
            }
            else -> {
                val rows by remember { dao.playerStats() }.collectAsState(initial = emptyList())
                RankList(rows.map { RankRow(it.playerName, "${it.plays}곡 · 최고 ${it.bestScore}점", it.avgScore.toInt(), "평균") })
            }
        }
    }
}

private data class RankRow(val name: String, val detail: String, val score: Int, val unit: String = "점")

@Composable
private fun RankList(rows: List<RankRow>) {
    if (rows.isEmpty()) {
        EmptyState(Icons.Filled.EmojiEvents, "아직 기록이 없어요", "내장곡을 불러 첫 번째 랭커가 되어 보세요")
        return
    }
    LazyColumn(contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        itemsIndexed(rows) { i, r ->
            val rank = i + 1
            NeonCard(modifier = Modifier.fillMaxWidth(), border = if (rank <= 3) medal(rank).copy(alpha = 0.6f) else Neon.Outline) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (rank <= 3) listOf("🥇", "🥈", "🥉")[rank - 1] else "$rank", style = MaterialTheme.typography.titleLarge, color = medal(rank), modifier = Modifier.width(40.dp))
                    Column(Modifier.weight(1f)) {
                        Text(r.name, style = MaterialTheme.typography.titleMedium)
                        Text(r.detail, color = Neon.TextMid, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text("${r.score}", style = MaterialTheme.typography.headlineMedium, color = medal(rank))
                        Text(r.unit, color = Neon.TextLow, style = MaterialTheme.typography.labelMedium)
                    }
                }
            }
        }
    }
}
