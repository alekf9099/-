package com.melodeal.ui.chart

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.RocketLaunch
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.melodeal.MelodealApp
import com.melodeal.community.ChartEntry
import com.melodeal.community.ChartKind
import com.melodeal.community.ChartScoring
import com.melodeal.data.song.Genre
import com.melodeal.ui.appViewModel
import com.melodeal.ui.community.CommunityGate
import com.melodeal.ui.community.DemoBanner
import com.melodeal.ui.community.PlayButton
import com.melodeal.ui.components.CoverArt
import com.melodeal.ui.components.EmptyState
import com.melodeal.ui.components.RankBadge
import com.melodeal.ui.components.compactCount
import com.melodeal.ui.components.stageGlow
import com.melodeal.ui.theme.Neon
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant

data class ChartUiState(
    val kind: ChartKind = ChartKind.WEEKLY,
    val genre: Genre? = null,
    val entries: List<ChartEntry> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
)

class ChartViewModel(private val app: MelodealApp) : ViewModel() {
    private val _state = MutableStateFlow(ChartUiState())
    val state: StateFlow<ChartUiState> = _state

    fun refresh() {
        val s = _state.value
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            runCatching { app.community.chart(s.kind, s.genre) }
                .onSuccess { e -> _state.update { it.copy(entries = e, loading = false) } }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }

    fun setKind(k: ChartKind) { _state.update { it.copy(kind = k) }; refresh() }
    fun setGenre(g: Genre?) { _state.update { it.copy(genre = g) }; refresh() }
    fun listened(id: String, done: Boolean) = viewModelScope.launch { runCatching { app.community.recordListen(id, done) } }
}

@Composable
fun ChartScreen(onOpenTrack: (String) -> Unit) {
    CommunityGate(requireProfile = false) {
        val vm = appViewModel("chart") { ChartViewModel(it) }
        val s by vm.state.collectAsState()
        LaunchedEffect(Unit) { vm.refresh() }
        ChartContent(s, vm::setKind, vm::setGenre, onOpenTrack, vm::listened)
    }
}

/** "10월 4주차" (한국 시간, 월요일 시작) */
fun seasonLabel(now: Long = System.currentTimeMillis()): String {
    val d = Instant.ofEpochMilli(ChartScoring.weekStart(now)).atZone(ChartScoring.KST).toLocalDate()
    val week = (d.dayOfMonth - 1) / 7 + 1
    return "${d.monthValue}월 ${week}주차"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChartContent(
    s: ChartUiState,
    onKind: (ChartKind) -> Unit = {},
    onGenre: (Genre?) -> Unit = {},
    onOpenTrack: (String) -> Unit = {},
    onListened: (String, Boolean) -> Unit = { _, _ -> },
) {
    var rules by remember { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize().stageGlow(Neon.Gold, 0.12f), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Row(Modifier.fillMaxWidth().padding(top = 16.dp, start = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("차트", style = MaterialTheme.typography.headlineLarge)
                    Text(
                        if (s.kind == ChartKind.LAST_WEEK) "${seasonLabel(System.currentTimeMillis() - 7 * 24 * 3600_000L)} 최종" else "${seasonLabel()} 시즌 · ${s.kind.caption}",
                        color = Neon.TextMid, style = MaterialTheme.typography.bodyMedium,
                    )
                }
                IconButton(onClick = { rules = true }) { Icon(Icons.Outlined.Info, contentDescription = "순위는 이렇게 정해요", tint = Neon.TextMid) }
            }
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(ChartKind.entries) { k ->
                    val on = k == s.kind
                    Text(
                        k.label, style = MaterialTheme.typography.labelLarge, color = if (on) Color.White else Neon.TextMid,
                        modifier = Modifier.clip(RoundedCornerShape(50))
                            .background(if (on) Neon.Hero else androidx.compose.ui.graphics.Brush.linearGradient(listOf(Neon.Surface, Neon.Surface)))
                            .border(1.dp, if (on) Color.Transparent else Neon.Outline, RoundedCornerShape(50))
                            .clickable { onKind(k) }.padding(horizontal = 16.dp, vertical = 12.dp),
                    )
                }
            }
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                item { GenreChip("전체 장르", s.genre == null) { onGenre(null) } }
                items(Genre.entries) { g -> GenreChip(g.label, s.genre == g) { onGenre(g) } }
            }
        }
        when {
            s.loading && s.entries.isEmpty() -> item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Neon.Pink) } }
            s.error != null -> item { EmptyState(Icons.Filled.EmojiEvents, "차트를 불러오지 못했어요", s.error) }
            s.entries.isEmpty() -> item {
                EmptyState(Icons.Filled.EmojiEvents, "아직 순위에 오른 곡이 없어요", "좋아요·추천을 받으면 바로 차트에 올라가요. 첫 1위를 노려 보세요!")
            }
            else -> {
                item { Podium(s.entries.take(3), onOpenTrack, onListened) }
                items(s.entries.drop(3), key = { it.track.id }) { e -> ChartRow(e, onOpenTrack, onListened) }
            }
        }
        item { DemoBanner(Modifier.padding(top = 8.dp)) }
    }
    if (rules) {
        ModalBottomSheet(onDismissRequest = { rules = false }, containerColor = Neon.Surface) {
            Column(Modifier.padding(horizontal = 24.dp).padding(bottom = 32.dp)) {
                Text("순위는 이렇게 정해요", style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.height(12.dp))
                RuleRow("좋아요", "1점 · 곡마다 한 번")
                RuleRow("추천", "5점 · 하루 3번만 쓸 수 있어요")
                RuleRow("끝까지 듣기", "0.5점 · 하루 한 번")
                Spacer(Modifier.height(8.dp))
                Text(
                    "· 이번 주 차트는 매주 월요일 0시(한국 시간)에 새로 시작해요\n" +
                        "· 가입 7일 이내 계정의 반응은 절반만 반영해요 (부계정 몰아주기 방지)\n" +
                        "· 오래된 반응일수록 조금씩 덜 반영돼요 (최근 인기 우선)\n" +
                        "· 내 곡에 내가 한 반응, 링크 공개 곡은 차트에 들어가지 않아요\n" +
                        "· 신인 차트: 첫 곡을 올린 지 30일 이내인 제작자",
                    color = Neon.TextMid, style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    }
}

@Composable
private fun RuleRow(name: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(name, style = MaterialTheme.typography.titleSmall, modifier = Modifier.width(96.dp))
        Text(value, color = Neon.TextMid, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun GenreChip(label: String, selected: Boolean, onClick: () -> Unit) {
    FilterChip(
        selected = selected, onClick = onClick, label = { Text(label) },
        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Neon.Violet.copy(alpha = 0.4f), selectedLabelColor = Color.White),
    )
}

/** 1~3위: 큰 커버 카드 (1위는 가운데, 크게) */
@Composable
private fun Podium(top: List<ChartEntry>, onOpen: (String) -> Unit, onListened: (String, Boolean) -> Unit) {
    val order = listOfNotNull(top.getOrNull(1), top.getOrNull(0), top.getOrNull(2))
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
        order.forEach { e ->
            val first = e.rank == 1
            Column(
                Modifier.weight(if (first) 1.2f else 1f).clip(RoundedCornerShape(22.dp)).background(Neon.Surface)
                    .border(1.dp, if (first) Neon.Gold.copy(alpha = 0.5f) else Neon.Outline, RoundedCornerShape(22.dp))
                    .clickable { onOpen(e.track.id) }.padding(8.dp),
            ) {
                Box {
                    CoverArt(e.track.id, e.track.composition, Modifier.fillMaxWidth().aspectRatio(1f), RoundedCornerShape(16.dp))
                    Box(Modifier.align(Alignment.TopStart).padding(6.dp)) { RankBadge(e.rank, if (first) 34.dp else 28.dp) }
                    Box(Modifier.align(Alignment.BottomEnd).padding(6.dp)) {
                        PlayButton(e.track, 36.dp, onStarted = { onListened(e.track.id, false) }, onCompleted = { onListened(e.track.id, true) })
                    }
                }
                Text(e.track.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 8.dp, start = 2.dp))
                Text(e.track.ownerNickname, color = Neon.TextMid, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 2.dp))
                Text("%.1f점".format(e.score), color = if (first) Neon.Gold else Neon.TextMid, style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(start = 2.dp, top = 2.dp))
            }
        }
    }
}

@Composable
private fun ChartRow(e: ChartEntry, onOpen: (String) -> Unit, onListened: (String, Boolean) -> Unit) {
    val t = e.track
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Neon.Surface).clickable { onOpen(t.id) }.padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("${e.rank}", style = MaterialTheme.typography.titleLarge, color = Neon.TextMid, modifier = Modifier.width(34.dp).padding(start = 4.dp))
        CoverArt(t.id, t.composition, Modifier.size(52.dp), RoundedCornerShape(12.dp))
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(t.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${t.ownerNickname} · ${t.genre.label}", color = Neon.TextMid, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(Modifier.padding(top = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Favorite, contentDescription = null, tint = Neon.Pink, modifier = Modifier.size(12.dp))
                Text(" ${compactCount(t.likeCount)}   ", color = Neon.TextMid, style = MaterialTheme.typography.labelSmall)
                Icon(Icons.Filled.RocketLaunch, contentDescription = null, tint = Neon.Gold, modifier = Modifier.size(12.dp))
                Text(" ${compactCount(t.recommendCount)}", color = Neon.TextMid, style = MaterialTheme.typography.labelSmall)
            }
        }
        PlayButton(t, 40.dp, onStarted = { onListened(t.id, false) }, onCompleted = { onListened(t.id, true) })
    }
}
