package com.melodeal.ui.community

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Headphones
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.melodeal.MelodealApp
import com.melodeal.community.FeedSort
import com.melodeal.community.Track
import com.melodeal.data.song.Genre
import com.melodeal.ui.appViewModel
import com.melodeal.ui.components.EmptyState
import com.melodeal.ui.components.NeonCard
import com.melodeal.ui.components.stageGlow
import com.melodeal.ui.theme.Neon
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class FeedUiState(
    val sort: FeedSort = FeedSort.LATEST,
    val genre: Genre? = null,
    val tracks: List<Track> = emptyList(),
    val loading: Boolean = true,
    val error: String? = null,
)

class FeedViewModel(private val app: MelodealApp) : ViewModel() {
    private val _state = MutableStateFlow(FeedUiState())
    val state: StateFlow<FeedUiState> = _state

    fun refresh() {
        val s = _state.value
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            runCatching { app.community.feed(s.sort, s.genre) }
                .onSuccess { list -> _state.update { it.copy(tracks = list, loading = false) } }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }

    fun setSort(sort: FeedSort) { _state.update { it.copy(sort = sort) }; refresh() }
    fun setGenre(g: Genre?) { _state.update { it.copy(genre = g) }; refresh() }
    fun played(id: String) = viewModelScope.launch { runCatching { app.community.recordPlay(id) } }
}

@Composable
fun FeedScreen(onOpenTrack: (String) -> Unit, onOpenProfile: (String) -> Unit) {
    CommunityGate {
        val vm = appViewModel("feed") { FeedViewModel(it) }
        val s by vm.state.collectAsState()
        LaunchedEffect(Unit) { vm.refresh() }
        FeedContent(s, vm::setSort, vm::setGenre, onOpenTrack, onOpenProfile, onPlayed = vm::played)
    }
}

@Composable
fun FeedContent(
    s: FeedUiState,
    onSort: (FeedSort) -> Unit = {},
    onGenre: (Genre?) -> Unit = {},
    onOpenTrack: (String) -> Unit = {},
    onOpenProfile: (String) -> Unit = {},
    onPlayed: (String) -> Unit = {},
) {
    LazyColumn(Modifier.fillMaxSize().stageGlow(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Column(Modifier.padding(top = 16.dp, start = 4.dp)) {
                Text("둘러보기", style = MaterialTheme.typography.headlineLarge)
                Text("사람들이 흥얼거려 만든 노래를 들어보세요", color = Neon.TextMid, style = MaterialTheme.typography.bodyMedium)
            }
        }
        item { DemoBanner() }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FeedSort.entries.forEach { sort ->
                    val on = s.sort == sort
                    Text(
                        sort.label, style = MaterialTheme.typography.labelLarge, color = if (on) Color.White else Neon.TextMid,
                        modifier = Modifier.minimumInteractiveComponentSize().clip(RoundedCornerShape(50)).background(if (on) Neon.Hero else androidx.compose.ui.graphics.Brush.linearGradient(listOf(Neon.Surface, Neon.Surface)))
                            .border(1.dp, if (on) Color.Transparent else Neon.Outline, RoundedCornerShape(50))
                            .clickable { onSort(sort) }.padding(horizontal = 14.dp, vertical = 8.dp),
                    )
                }
            }
        }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                item { GenreChip("전체", s.genre == null) { onGenre(null) } }
                items(Genre.entries) { g -> GenreChip(g.label, s.genre == g) { onGenre(g) } }
            }
        }
        when {
            s.loading && s.tracks.isEmpty() -> item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Neon.Pink) } }
            s.error != null -> item { EmptyState(Icons.Filled.LibraryMusic, "불러오지 못했어요", s.error) }
            s.tracks.isEmpty() -> item {
                EmptyState(
                    Icons.Filled.LibraryMusic,
                    if (s.sort == FeedSort.WEEKLY) "이번 주 인기곡이 아직 없어요" else "아직 공유된 곡이 없어요",
                    "내 노래를 만들고 '멜로딜에 공유'를 눌러 첫 곡을 올려 보세요",
                )
            }
            else -> items(s.tracks, key = { it.id }) { t ->
                val rank = if (s.sort == FeedSort.WEEKLY) s.tracks.indexOf(t) + 1 else null
                TrackCard(t, rank, onClick = { onOpenTrack(t.id) }, onProfile = { onOpenProfile(t.ownerId) }, onPlayed = { onPlayed(t.id) })
            }
        }
    }
}

@Composable
private fun GenreChip(label: String, selected: Boolean, onClick: () -> Unit) {
    FilterChip(
        selected = selected, onClick = onClick, label = { Text(label) },
        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Neon.Violet.copy(alpha = 0.4f), selectedLabelColor = Color.White),
    )
}

@Composable
fun TrackCard(t: Track, rank: Int? = null, onClick: () -> Unit, onProfile: () -> Unit, onPlayed: () -> Unit = {}) {
    val st by PreviewPlayer.state.collectAsState()
    NeonCard(onClick = onClick, modifier = Modifier.fillMaxWidth(), border = if (st.trackId == t.id) Neon.Pink.copy(alpha = 0.5f) else Neon.Outline) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (rank != null) {
                    Text("$rank", style = MaterialTheme.typography.headlineSmall, color = if (rank <= 3) Neon.Gold else Neon.TextLow, modifier = Modifier.width(30.dp))
                }
                PlayButton(t, onStarted = onPlayed)
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text(t.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Row(Modifier.clickable(onClick = onProfile), verticalAlignment = Alignment.CenterVertically) {
                        Text(t.ownerNickname, color = Neon.Cyan, style = MaterialTheme.typography.labelLarge, maxLines = 1)
                        Text(" · ${t.genre.label} · ${relativeTime(t.createdAt)}", color = Neon.TextMid, style = MaterialTheme.typography.labelMedium, maxLines = 1)
                    }
                }
            }
            MelodyShape(
                t.composition,
                Modifier.fillMaxWidth().padding(top = 10.dp).height(36.dp).clip(RoundedCornerShape(8.dp)),
                progress = if (st.trackId == t.id) st.progress else null,
            )
            if (t.description.isNotBlank()) {
                Text(t.description, color = Neon.TextMid, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 8.dp))
            }
            Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Stat(Icons.Filled.Favorite, "${t.likeCount}", if (t.likedByMe) Neon.Pink else Neon.TextLow)
                Stat(Icons.Filled.Star, if (t.ratingCount == 0) "-" else "%.1f".format(t.ratingAvg), Neon.Gold)
                Stat(Icons.AutoMirrored.Filled.Chat, "${t.commentCount}", Neon.TextLow)
                Stat(Icons.Filled.Headphones, "${t.playCount}", Neon.TextLow)
            }
        }
    }
}

@Composable
private fun Stat(icon: ImageVector, value: String, tint: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(15.dp))
        Spacer(Modifier.width(4.dp))
        Text(value, color = Neon.TextMid, style = MaterialTheme.typography.labelMedium)
    }
}
