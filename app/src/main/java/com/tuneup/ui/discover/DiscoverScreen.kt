package com.tuneup.ui.discover

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.pager.VerticalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.ContentCut
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.RocketLaunch
import androidx.compose.material.icons.filled.SwipeVertical
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.outlined.RocketLaunch
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.People
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tuneup.TuneUpApp
import com.tuneup.community.CommunityException
import com.tuneup.community.Profile
import com.tuneup.community.Track
import com.tuneup.ui.appViewModel
import com.tuneup.ui.community.CommunityGate
import com.tuneup.ui.community.DemoBanner
import com.tuneup.ui.community.MelodyShape
import com.tuneup.ui.community.PreviewPlayer
import com.tuneup.ui.community.rememberProfileGuard
import com.tuneup.ui.components.CoverArt
import com.tuneup.ui.components.EmptyState
import com.tuneup.ui.components.FollowChip
import com.tuneup.ui.components.GradientButton
import com.tuneup.ui.components.LikeButton
import com.tuneup.ui.components.PlayerAvatar
import com.tuneup.ui.components.ReactionButton
import com.tuneup.ui.components.SegmentTabs
import com.tuneup.ui.components.Tag
import com.tuneup.ui.components.compactCount
import com.tuneup.ui.theme.Neon
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class DiscoverUiState(
    val tab: Int = 0,
    val forYou: List<Track> = emptyList(),
    val following: List<Track> = emptyList(),
    /** 팔로잉 탭이 비었을 때 추천할 제작자 */
    val suggestions: List<Profile> = emptyList(),
    val followingIds: Set<String> = emptySet(),
    val recommendsLeft: Int = 3,
    val myId: String? = null,
    val loading: Boolean = true,
    val toast: String? = null,
) {
    val tracks get() = if (tab == 0) forYou else following
}

class DiscoverViewModel(private val app: TuneUpApp) : ViewModel() {
    private val community = app.community
    private val _state = MutableStateFlow(DiscoverUiState(myId = community.me.value?.id))
    val state: StateFlow<DiscoverUiState> = _state

    fun refresh() = viewModelScope.launch {
        _state.update { it.copy(loading = it.tracks.isEmpty()) }
        runCatching {
            val forYou = community.discover()
            val following = community.followingFeed()
            val owners = (forYou + following).map { it.ownerId }.distinct()
            val followingIds = owners.filter { community.isFollowing(it) }.toSet()
            val me = community.me.value?.id
            val suggestions = forYou.map { it.ownerId }.distinct().filter { it != me && it !in followingIds }.take(4).mapNotNull { community.profile(it) }
            _state.update {
                it.copy(
                    forYou = forYou, following = following, followingIds = followingIds, suggestions = suggestions,
                    recommendsLeft = community.recommendsLeft(), myId = me, loading = false,
                )
            }
        }.onFailure { e -> _state.update { it.copy(loading = false, toast = e.message) } }
    }

    fun setTab(i: Int) = _state.update { it.copy(tab = i) }

    private fun patch(id: String, f: (Track) -> Track) = _state.update { s ->
        s.copy(forYou = s.forYou.map { if (it.id == id) f(it) else it }, following = s.following.map { if (it.id == id) f(it) else it })
    }

    fun toggleLike(t: Track) {
        patch(t.id) { it.copy(likedByMe = !t.likedByMe, likeCount = t.likeCount + if (t.likedByMe) -1 else 1) }
        viewModelScope.launch { runCatching { community.setLiked(t.id, !t.likedByMe) }.onFailure { e -> patch(t.id) { t }; toast(e.message) } }
    }

    fun recommend(t: Track) {
        val s = _state.value
        when {
            t.ownerId == s.myId -> return toast("내 곡은 추천할 수 없어요")
            t.recommendedByMe -> return toast("오늘 이미 추천한 곡이에요")
            s.recommendsLeft <= 0 -> return toast(CommunityException.RecommendLimit().message)
        }
        patch(t.id) { it.copy(recommendedByMe = true, recommendCount = t.recommendCount + 1) }
        _state.update { it.copy(recommendsLeft = it.recommendsLeft - 1) }
        viewModelScope.launch {
            runCatching { community.recommend(t.id) }
                .onSuccess { toast("추천했어요! 오늘 ${_state.value.recommendsLeft}번 더 추천할 수 있어요") }
                .onFailure { e ->
                    patch(t.id) { t }
                    _state.update { it.copy(recommendsLeft = (it.recommendsLeft + 1).coerceAtMost(3)) }
                    toast(e.message)
                }
        }
    }

    fun toggleFollow(userId: String) {
        val now = userId !in _state.value.followingIds
        _state.update { it.copy(followingIds = if (now) it.followingIds + userId else it.followingIds - userId) }
        viewModelScope.launch {
            runCatching { community.setFollowing(userId, now) }
                .onSuccess { if (_state.value.tab == 1 || _state.value.following.isEmpty()) _state.update { it.copy(following = runCatching { community.followingFeed() }.getOrDefault(it.following)) } }
                .onFailure { e -> _state.update { it.copy(followingIds = if (now) it.followingIds - userId else it.followingIds + userId) }; toast(e.message) }
        }
    }

    fun listened(id: String, completed: Boolean) = viewModelScope.launch { runCatching { community.recordListen(id, completed) } }

    private fun toast(msg: String?) = _state.update { it.copy(toast = msg) }
    fun consumeToast() = _state.update { it.copy(toast = null) }
}

class DiscoverActions(
    val onTab: (Int) -> Unit = {},
    val onOpenTrack: (String) -> Unit = {},
    val onOpenProfile: (String) -> Unit = {},
    val onLike: (Track) -> Unit = {},
    val onRecommend: (Track) -> Unit = {},
    val onFollow: (String) -> Unit = {},
    val onSing: (Track) -> Unit = {},
    val onShare: (Track) -> Unit = {},
    val onSearch: () -> Unit = {},
    val onListened: (String, Boolean) -> Unit = { _, _ -> },
)

@Composable
fun DiscoverScreen(onOpenTrack: (String) -> Unit, onOpenProfile: (String) -> Unit, onSing: (Track) -> Unit, onSearch: () -> Unit = {}) {
    CommunityGate(requireProfile = false) {
        val vm = appViewModel("discover") { DiscoverViewModel(it) }
        val guard = rememberProfileGuard()
        val context = androidx.compose.ui.platform.LocalContext.current
        val s by vm.state.collectAsState()
        val snackbar = remember { SnackbarHostState() }
        LaunchedEffect(Unit) { vm.refresh() }
        LaunchedEffect(s.toast) { s.toast?.let { snackbar.showSnackbar(it); vm.consumeToast() } }
        DisposableEffect(Unit) { onDispose { PreviewPlayer.stop() } }
        Box(Modifier.fillMaxSize()) {
            DiscoverContent(
                s,
                DiscoverActions(
                    onTab = vm::setTab, onOpenTrack = onOpenTrack, onOpenProfile = onOpenProfile,
                    onLike = { t -> guard { vm.toggleLike(t) } },
                    onRecommend = { t -> guard { vm.recommend(t) } },
                    onFollow = { id -> guard { vm.toggleFollow(id) } },
                    onSing = onSing,
                    onShare = { t -> com.tuneup.ui.community.shareText(context, com.tuneup.community.ShareLinks.trackMessage(t)) },
                    onSearch = onSearch,
                    onListened = { id, done -> vm.listened(id, done) },
                ),
                autoplay = true,
            )
            SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).padding(bottom = 16.dp))
        }
    }
}

/** 홈: 한 곡씩 세로로 넘기며 하이라이트를 바로 듣는다 */
@Composable
fun DiscoverContent(s: DiscoverUiState, a: DiscoverActions = DiscoverActions(), autoplay: Boolean = false) {
    Box(Modifier.fillMaxSize().background(Neon.Bg)) {
        val tracks = s.tracks
        when {
            s.loading -> CircularProgressIndicator(color = Neon.Pink, modifier = Modifier.align(Alignment.Center))
            tracks.isEmpty() && s.tab == 1 -> FollowingEmpty(s, a)
            tracks.isEmpty() -> Box(Modifier.align(Alignment.Center).padding(24.dp)) {
                EmptyState(Icons.Filled.LibraryMusic, "아직 공개된 곡이 없어요", "＋ 버튼으로 첫 곡을 만들어 공유해 보세요")
            }
            else -> {
                val pager = rememberPagerState { tracks.size }
                // 넘긴 곡의 하이라이트를 자동으로 재생
                if (autoplay) {
                    LaunchedEffect(pager.settledPage, s.tab) {
                        val t = tracks.getOrNull(pager.settledPage) ?: return@LaunchedEffect
                        PreviewPlayer.play(t.id, t.composition, onStarted = { a.onListened(t.id, false) }, onCompleted = { a.onListened(t.id, true) })
                    }
                }
                VerticalPager(pager, Modifier.fillMaxSize(), key = { tracks[it].id }, beyondViewportPageCount = 1) { page ->
                    TrackPage(tracks[page], s, a, isFirst = page == 0)
                }
            }
        }
        // 상단: 추천 | 팔로잉, 오른쪽에 검색
        SegmentTabs(
            listOf("추천", "팔로잉"), s.tab, a.onTab,
            Modifier.align(Alignment.TopCenter).padding(top = 8.dp), onDark = true,
        )
        androidx.compose.material3.IconButton(onClick = a.onSearch, modifier = Modifier.align(Alignment.TopEnd).padding(top = 6.dp, end = 6.dp)) {
            Icon(Icons.Filled.Search, contentDescription = "검색", tint = Color.White)
        }
    }
}

@Composable
private fun TrackPage(t: Track, s: DiscoverUiState, a: DiscoverActions, isFirst: Boolean) {
    val st by PreviewPlayer.state.collectAsState()
    val playing = st.trackId == t.id
    Box(Modifier.fillMaxSize()) {
        // 배경: 커버 아트를 크게 깔고 어둡게
        CoverArt(t.id, t.composition, Modifier.fillMaxSize(), melody = false)
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.45f), Color.Black.copy(alpha = 0.15f), Color.Black.copy(alpha = 0.75f)))))

        Column(Modifier.fillMaxSize().padding(top = 64.dp, bottom = 16.dp)) {
            // 가운데 커버 (누르면 재생/멈춤)
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Box(
                    Modifier.fillMaxWidth(0.72f).widthIn(max = 360.dp).aspectRatio(1f).clip(RoundedCornerShape(28.dp))
                        .clickable { PreviewPlayer.toggle(t, onStarted = { a.onListened(t.id, false) }, onCompleted = { a.onListened(t.id, true) }) },
                    contentAlignment = Alignment.Center,
                ) {
                    CoverArt(t.id, t.composition, Modifier.fillMaxSize(), progress = if (playing) st.progress else null)
                    Box(Modifier.size(64.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.35f)), contentAlignment = Alignment.Center) {
                        when {
                            playing && st.loading -> CircularProgressIndicator(Modifier.size(28.dp), color = Color.White, strokeWidth = 2.dp)
                            playing -> Icon(Icons.Filled.Pause, contentDescription = "멈추기", tint = Color.White, modifier = Modifier.size(36.dp))
                            else -> Icon(Icons.Filled.PlayArrow, contentDescription = "듣기", tint = Color.White, modifier = Modifier.size(40.dp))
                        }
                    }
                    if (t.isPartial) {
                        Row(
                            Modifier.align(Alignment.TopStart).padding(12.dp).clip(RoundedCornerShape(50)).background(Color.Black.copy(alpha = 0.45f)).padding(horizontal = 10.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.Filled.ContentCut, contentDescription = null, tint = Color.White, modifier = Modifier.size(12.dp))
                            Text(" 하이라이트 ${t.composition.bars}/${t.fullBars}마디", color = Color.White, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }

            // 아래: 곡 정보 + 오른쪽 액션
            Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp), verticalAlignment = Alignment.Bottom) {
                Column(Modifier.weight(1f).clickable { a.onOpenTrack(t.id) }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Row(Modifier.clickable { a.onOpenProfile(t.ownerId) }, verticalAlignment = Alignment.CenterVertically) {
                            PlayerAvatar(t.ownerNickname, Color.White, 30)
                            Text(" ${t.ownerNickname}", color = Color.White, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 150.dp))
                        }
                        if (t.ownerId != s.myId) {
                            Spacer(Modifier.width(8.dp))
                            FollowChip(t.ownerId in s.followingIds, { a.onFollow(t.ownerId) }, onDark = true)
                        }
                    }
                    Text(t.title, color = Color.White, style = MaterialTheme.typography.headlineMedium, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp))
                    if (t.description.isNotBlank()) {
                        Text(t.description, color = Color.White.copy(alpha = 0.88f), style = MaterialTheme.typography.bodyMedium, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
                    }
                    Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Tag(t.genre.label, Color.White)
                        Tag("${t.composition.key.label} · ${t.composition.bpm}", Color.White)
                        if (t.hasLyrics) Tag("가사", Color.White)
                    }
                    MelodyShape(
                        t.composition, Modifier.fillMaxWidth().padding(top = 12.dp).height(26.dp),
                        progress = if (playing) st.progress else 0f, color = Color.White,
                    )
                }
                // 오른쪽 액션 바
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    LikeButton(t.likedByMe, t.likeCount, { a.onLike(t) })
                    ReactionButton(
                        on = t.recommendedByMe, iconOn = Icons.Filled.RocketLaunch, iconOff = Icons.Outlined.RocketLaunch,
                        label = "추천", tint = Neon.Gold, onClick = { a.onRecommend(t) },
                        caption = compactCount(t.recommendCount),
                        description = "추천 ${t.recommendCount}, 오늘 ${s.recommendsLeft}번 남음",
                    )
                    ReactionButton(
                        on = false, iconOn = Icons.AutoMirrored.Filled.Chat, iconOff = Icons.AutoMirrored.Filled.Chat,
                        label = "댓글", tint = Color.White, onClick = { a.onOpenTrack(t.id) }, caption = compactCount(t.commentCount),
                        description = "댓글 ${t.commentCount}",
                    )
                    if (t.allowSing) {
                        ReactionButton(on = false, iconOn = Icons.Filled.Mic, iconOff = Icons.Filled.Mic, label = "부르기", tint = Color.White, onClick = { a.onSing(t) })
                    }
                    ReactionButton(on = false, iconOn = Icons.Filled.Share, iconOff = Icons.Filled.Share, label = "공유", tint = Color.White, onClick = { a.onShare(t) }, description = "링크 공유")
                }
            }
            if (isFirst) {
                Row(Modifier.align(Alignment.CenterHorizontally).padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.SwipeVertical, contentDescription = null, tint = Color.White.copy(alpha = 0.7f), modifier = Modifier.size(14.dp))
                    Text(" 위로 넘기면 다음 곡", color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

@Composable
private fun FollowingEmpty(s: DiscoverUiState, a: DiscoverActions) {
    Column(Modifier.fillMaxSize().padding(horizontal = 24.dp).padding(top = 80.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(Icons.Filled.People, contentDescription = null, tint = Neon.TextLow, modifier = Modifier.size(48.dp))
        Text("팔로우한 제작자의 새 곡이 여기 모여요", style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 12.dp))
        Text("마음에 드는 제작자를 팔로우해 보세요", color = Neon.TextMid, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 4.dp, bottom = 20.dp))
        s.suggestions.forEach { p ->
            Row(
                Modifier.fillMaxWidth().padding(vertical = 4.dp).clip(RoundedCornerShape(18.dp)).background(Neon.Surface).clickable { a.onOpenProfile(p.id) }.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                PlayerAvatar(p.nickname, Neon.Pink, 40)
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text(p.nickname, style = MaterialTheme.typography.titleSmall)
                    Text(if (p.bio.isNotBlank()) p.bio else "팔로워 ${p.followerCount}", color = Neon.TextMid, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                FollowChip(p.id in s.followingIds, { a.onFollow(p.id) })
            }
        }
        Spacer(Modifier.height(16.dp))
        GradientButton("추천 곡 보러 가기", Neon.Hero, onClick = { a.onTab(0) }, modifier = Modifier.fillMaxWidth())
        DemoBanner(Modifier.padding(top = 16.dp))
    }
}
