package com.singturn.ui.ranking

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Icon
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import com.singturn.ui.components.PlayerAvatar
import com.singturn.ui.components.RankBadge
import com.singturn.ui.components.medalColor
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

/** 이번 주 월요일 0시 (주간 시즌 시작) */
fun weekStartMillis(): Long =
    LocalDate.now().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        .atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RankingScreen(onBack: () -> Unit) {
    val app = app()
    val dao = app.db.scores()
    val mine by app.songs.mine.collectAsState(initial = emptyList())
    val songs = mine + app.songs.builtin
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var songId by rememberSaveable { mutableStateOf(app.songs.builtin.first().id) }

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
                RankList(rows.map { RankRow(it.playerName, "키 ${"%+d".format(it.keyShift)}", it.total) }, emptyHint = "이 곡을 불러 첫 번째 랭커가 되어 보세요")
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
private fun RankList(rows: List<RankRow>, emptyHint: String = "노래를 불러 첫 번째 랭커가 되어 보세요") {
    if (rows.isEmpty()) {
        EmptyState(Icons.Filled.EmojiEvents, "아직 기록이 없어요", emptyHint)
        return
    }
    LazyColumn(contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Podium(rows.take(3)) }
        itemsIndexed(rows.drop(3)) { i, r ->
            val rank = i + 4
            NeonCard(modifier = Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RankBadge(rank)
                    Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                        Text(r.name, style = MaterialTheme.typography.titleMedium)
                        Text(r.detail, color = Neon.TextMid, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Text("${r.score}", style = MaterialTheme.typography.headlineMedium)
                    Text(r.unit, color = Neon.TextLow, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(start = 3.dp, top = 6.dp))
                }
            }
        }
    }
}

/** 1·2·3위 시상대: 가운데가 1위, 단 높이로 순위를 보여준다 */
@Composable
private fun Podium(top: List<RankRow>) {
    val order = listOf(1, 0, 2).filter { it < top.size }
    Row(
        Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        order.forEach { idx ->
            val r = top[idx]
            val rank = idx + 1
            val height = when (rank) { 1 -> 112.dp; 2 -> 84.dp; else -> 68.dp }
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                if (rank == 1) {
                    Icon(Icons.Filled.WorkspacePremium, contentDescription = "1위", tint = Neon.Gold, modifier = Modifier.size(24.dp))
                }
                PlayerAvatar(r.name, medalColor(rank), if (rank == 1) 60 else 48)
                Text(r.name, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp))
                Text(r.detail, color = Neon.TextLow, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Box(
                    Modifier
                        .padding(top = 8.dp)
                        .fillMaxWidth()
                        .height(height)
                        .clip(RoundedCornerShape(topStart = 14.dp, topEnd = 14.dp))
                        .background(Brush.verticalGradient(listOf(medalColor(rank).copy(alpha = 0.32f), medalColor(rank).copy(alpha = 0.04f)))),
                    contentAlignment = Alignment.TopCenter,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(top = 10.dp)) {
                        RankBadge(rank, 26.dp)
                        Text("${r.score}", style = MaterialTheme.typography.headlineSmall, color = medalColor(rank), modifier = Modifier.padding(top = 4.dp))
                    }
                }
            }
        }
    }
}
