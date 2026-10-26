package com.tuneup.ui.search

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tuneup.TuneUpApp
import com.tuneup.community.ChartKind
import com.tuneup.community.Profile
import com.tuneup.community.SearchQuery
import com.tuneup.community.SearchResult
import com.tuneup.community.Track
import com.tuneup.ui.appViewModel
import com.tuneup.ui.community.CommunityGate
import com.tuneup.ui.community.PlayButton
import com.tuneup.ui.components.CoverArt
import com.tuneup.ui.components.EmptyState
import com.tuneup.ui.components.PlayerAvatar
import com.tuneup.ui.components.SectionTitle
import com.tuneup.ui.components.compactCount
import com.tuneup.ui.theme.Neon
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SearchUiState(
    val query: String = "",
    val result: SearchResult? = null,
    val searching: Boolean = false,
    /** 검색어가 비었을 때 보여줄 지금 뜨는 곡 */
    val trending: List<Track> = emptyList(),
)

class SearchViewModel(private val app: TuneUpApp) : ViewModel() {
    private val _state = MutableStateFlow(SearchUiState())
    val state: StateFlow<SearchUiState> = _state
    private var job: Job? = null

    init {
        viewModelScope.launch {
            val t = runCatching { app.community.chart(ChartKind.RISING) }.getOrDefault(emptyList()).take(6).map { it.track }
            _state.update { it.copy(trending = t) }
        }
    }

    /** 입력할 때마다 0.3초 기다렸다가 검색 (타자 칠 때마다 서버에 묻지 않도록) */
    fun setQuery(q: String) {
        _state.update { it.copy(query = q) }
        job?.cancel()
        if (SearchQuery.clean(q) == null) { _state.update { it.copy(result = null, searching = false) }; return }
        job = viewModelScope.launch {
            delay(300)
            _state.update { it.copy(searching = true) }
            val r = runCatching { app.community.search(q) }.getOrDefault(SearchResult())
            _state.update { it.copy(result = r, searching = false) }
        }
    }

    /** 결과를 눌렀을 때 최근 검색어에 남긴다 */
    fun remember() {
        val q = SearchQuery.clean(_state.value.query) ?: return
        app.settings.update { it.withSearch(q) }
    }

    fun clearRecent() = app.settings.update { it.copy(recentSearches = emptyList()) }
}

@Composable
fun SearchScreen(onBack: () -> Unit, onOpenTrack: (String) -> Unit, onOpenProfile: (String) -> Unit) {
    CommunityGate(requireProfile = false) {
        val vm = appViewModel("search") { SearchViewModel(it) }
        val s by vm.state.collectAsState()
        val app = com.tuneup.ui.app()
        val settings by app.settings.state.collectAsState()
        SearchContent(
            s, settings.recentSearches,
            onQuery = vm::setQuery, onBack = onBack, onClearRecent = vm::clearRecent,
            onOpenTrack = { vm.remember(); onOpenTrack(it) },
            onOpenProfile = { vm.remember(); onOpenProfile(it) },
            autoFocus = true,
        )
    }
}

@Composable
fun SearchContent(
    s: SearchUiState,
    recent: List<String> = emptyList(),
    onQuery: (String) -> Unit = {},
    onBack: () -> Unit = {},
    onClearRecent: () -> Unit = {},
    onOpenTrack: (String) -> Unit = {},
    onOpenProfile: (String) -> Unit = {},
    autoFocus: Boolean = false,
) {
    val focus = remember { FocusRequester() }
    if (autoFocus) LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    Column(Modifier.fillMaxSize().background(Neon.Bg)) {
        Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 12.dp, top = 8.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "뒤로") }
            OutlinedTextField(
                s.query, onQuery, singleLine = true,
                placeholder = { Text("곡 제목, 제작자 닉네임") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, tint = Neon.TextMid) },
                trailingIcon = { if (s.query.isNotEmpty()) IconButton(onClick = { onQuery("") }) { Icon(Icons.Filled.Close, contentDescription = "지우기") } },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { onQuery(s.query) }),
                shape = RoundedCornerShape(50),
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Neon.Pink, unfocusedBorderColor = Neon.Outline, focusedContainerColor = Neon.Surface, unfocusedContainerColor = Neon.Surface),
                modifier = Modifier.weight(1f).focusRequester(focus),
            )
        }
        val r = s.result
        LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            when {
                r == null -> {
                    if (recent.isNotEmpty()) {
                        item {
                            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                SectionTitle("최근 검색", Modifier.weight(1f))
                                TextButton(onClick = onClearRecent) { Text("모두 지우기", color = Neon.TextMid) }
                            }
                        }
                        item {
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                items(recent) { q ->
                                    Row(
                                        Modifier.clip(RoundedCornerShape(50)).background(Neon.Surface).clickable { onQuery(q) }.padding(horizontal = 14.dp, vertical = 10.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Icon(Icons.Filled.History, contentDescription = null, tint = Neon.TextLow, modifier = Modifier.size(14.dp))
                                        Text(" $q", style = MaterialTheme.typography.labelLarge)
                                    }
                                }
                            }
                        }
                    }
                    if (s.trending.isNotEmpty()) {
                        item {
                            Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.AutoMirrored.Filled.TrendingUp, contentDescription = null, tint = Neon.Gold, modifier = Modifier.size(18.dp))
                                SectionTitle("  지금 뜨는 곡")
                            }
                        }
                        items(s.trending, key = { "tr" + it.id }) { t -> TrackRow(t, onOpenTrack) }
                    }
                }
                s.searching && r.isEmpty -> item { Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Neon.Pink) } }
                r.isEmpty -> item {
                    EmptyState(Icons.Filled.Search, "「${s.query.trim()}」 검색 결과가 없어요", "다른 단어로 찾아보거나, 차트에서 인기곡을 둘러보세요")
                }
                else -> {
                    if (r.people.isNotEmpty()) {
                        item { SectionTitle("제작자 ${r.people.size}", Modifier.padding(top = 8.dp)) }
                        item {
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) { items(r.people, key = { it.id }) { p -> PersonChip(p, onOpenProfile) } }
                        }
                    }
                    if (r.tracks.isNotEmpty()) {
                        item { SectionTitle("곡 ${r.tracks.size}", Modifier.padding(top = 8.dp)) }
                        items(r.tracks, key = { it.id }) { t -> TrackRow(t, onOpenTrack) }
                    }
                }
            }
        }
    }
}

@Composable
private fun PersonChip(p: Profile, onOpen: (String) -> Unit) {
    Column(
        Modifier.width(96.dp).clip(RoundedCornerShape(18.dp)).background(Neon.Surface).clickable { onOpen(p.id) }.padding(vertical = 12.dp, horizontal = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        PlayerAvatar(p.nickname, Neon.Pink, 48)
        Text(p.nickname, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp))
        Text("팔로워 ${compactCount(p.followerCount)}", color = Neon.TextLow, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun TrackRow(t: Track, onOpen: (String) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Neon.Surface).clickable { onOpen(t.id) }.padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CoverArt(t.id, t.composition, Modifier.size(52.dp), RoundedCornerShape(12.dp))
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(t.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("${t.ownerNickname} · ${t.genre.label} · 좋아요 ${compactCount(t.likeCount)}", color = Neon.TextMid, style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        PlayButton(t, 40.dp)
    }
}
