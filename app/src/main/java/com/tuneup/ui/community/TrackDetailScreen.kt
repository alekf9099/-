package com.tuneup.ui.community

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.automirrored.filled.CallSplit
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.material3.TextButton
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
import com.tuneup.TuneUpApp
import com.tuneup.community.Comment
import com.tuneup.community.ReportTarget
import com.tuneup.community.ShareLinks
import com.tuneup.community.Track
import com.tuneup.studio.SavedComposition
import com.tuneup.ui.appViewModel
import com.tuneup.community.Visibility
import com.tuneup.ui.components.CoverArt
import com.tuneup.ui.components.FollowChip
import com.tuneup.ui.components.GradientButton
import com.tuneup.ui.components.LikeButton
import com.tuneup.ui.components.ReactionButton
import androidx.compose.material.icons.filled.ContentCut
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.RocketLaunch
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.outlined.RocketLaunch
import com.tuneup.ui.components.PlayerAvatar
import com.tuneup.ui.components.SectionTitle
import com.tuneup.ui.components.Tag
import com.tuneup.ui.theme.Neon
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class DetailUiState(
    val track: Track? = null,
    val comments: List<Comment> = emptyList(),
    val myId: String? = null,
    val loading: Boolean = true,
    val notFound: Boolean = false,
    val toast: String? = null,
    val recommendsLeft: Int = 3,
    val following: Boolean = false,
    /** 내 곡이고 이 폰에 원본이 있으면 원본 (공개 범위 다시 고르기용) */
    val original: SavedComposition? = null,
    /** 리믹스한 곡이면 원곡 */
    val remixSource: Track? = null,
) {
    val isMine get() = track != null && track.ownerId == myId
}

class TrackDetailViewModel(private val app: TuneUpApp, private val trackId: String) : ViewModel() {
    private val community = app.community
    private val _state = MutableStateFlow(DetailUiState(myId = community.me.value?.id))
    val state: StateFlow<DetailUiState> = _state

    init { load() }

    fun load() = viewModelScope.launch {
        val t = runCatching { community.track(trackId) }.getOrNull()
        val c = if (t != null) runCatching { community.comments(trackId) }.getOrDefault(emptyList()) else emptyList()
        val left = runCatching { community.recommendsLeft() }.getOrDefault(_state.value.recommendsLeft)
        val following = t != null && t.ownerId != community.me.value?.id && runCatching { community.isFollowing(t.ownerId) }.getOrDefault(false)
        val original = if (t != null && t.ownerId == community.me.value?.id) runCatching { app.studio.byTrack(t.id) }.getOrNull() else null
        val source = t?.remixOf?.let { runCatching { community.track(it) }.getOrNull() }
        _state.update {
            it.copy(
                track = t, comments = c, loading = false, notFound = t == null, recommendsLeft = left, following = following,
                original = original, myId = community.me.value?.id, remixSource = source,
            )
        }
    }

    fun recommend() {
        val s = _state.value
        val t = s.track ?: return
        when {
            s.isMine -> return _state.update { it.copy(toast = "내 곡은 추천할 수 없어요") }
            t.recommendedByMe -> return _state.update { it.copy(toast = "오늘 이미 추천한 곡이에요") }
            s.recommendsLeft <= 0 -> return _state.update { it.copy(toast = com.tuneup.community.CommunityException.RecommendLimit().message) }
        }
        _state.update { it.copy(track = t.copy(recommendedByMe = true, recommendCount = t.recommendCount + 1), recommendsLeft = it.recommendsLeft - 1) }
        act("추천했어요! 오늘 ${s.recommendsLeft - 1}번 더 추천할 수 있어요") { community.recommend(t.id) }
    }

    fun toggleFollow() {
        val t = _state.value.track ?: return
        val now = !_state.value.following
        _state.update { it.copy(following = now) }
        act(if (now) "${t.ownerNickname}님을 팔로우해요. 새 곡이 홈 '팔로잉'에 떠요" else null) { community.setFollowing(t.ownerId, now) }
    }

    private fun act(success: String? = null, block: suspend () -> Unit) = viewModelScope.launch {
        runCatching { block() }
            .onSuccess { load(); success?.let { msg -> _state.update { it.copy(toast = msg) } } }
            .onFailure { e -> _state.update { it.copy(toast = e.message) } }
    }

    fun toggleLike() {
        val t = _state.value.track ?: return
        // 누르자마자 반영하고 서버 결과로 다시 맞춘다
        _state.update { it.copy(track = t.copy(likedByMe = !t.likedByMe, likeCount = t.likeCount + if (t.likedByMe) -1 else 1)) }
        act { community.setLiked(t.id, !t.likedByMe) }
    }

    fun rate(stars: Int) = act("별점 ${stars}점을 남겼어요") { community.rate(trackId, stars) }
    fun comment(body: String) { if (body.isNotBlank()) act { community.addComment(trackId, body) } }
    fun deleteComment(id: String) = act { community.deleteComment(id) }
    fun report(target: ReportTarget, id: String, reason: com.tuneup.community.ReportReason, detail: String) =
        act("신고가 접수됐어요. 검토 후 조치할게요") { community.report(target, id, reason, detail) }
    fun block(userId: String, then: () -> Unit) = viewModelScope.launch { runCatching { community.block(userId) }.onSuccess { then() } }
    fun played(completed: Boolean = false) = viewModelScope.launch { runCatching { community.recordListen(trackId, completed) } }
    fun consumeToast() = _state.update { it.copy(toast = null) }

    suspend fun openChat(): String? = _state.value.track?.let { t ->
        runCatching { community.openConversation(t.ownerId, t.id) }.onFailure { e -> _state.update { it.copy(toast = e.message) } }.getOrNull()
    }

    /** 이 곡을 내 노래 목록으로 가져와 편집 (리믹스) */
    suspend fun remix(): Long? = _state.value.track?.takeIf { it.allowRemix || _state.value.isMine }?.let { t ->
        app.studio.create(t.composition.copy(title = "${t.composition.title} (리믹스)".take(30)), remixOf = t.id)
    }

    suspend fun delete() {
        runCatching { community.deleteTrack(trackId) }
        _state.value.original?.let { unlink(it.id) }
    }

    /** 공유를 취소하면 내 노래 목록의 '공유됨' 표시도 지운다 */
    suspend fun unlink(creationId: Long) = app.studio.markPublished(creationId, null)

    /** 노래방 화면에서 부를 수 있도록 임시 등록하고 곡 ID를 돌려준다 */
    fun prepareSing(): String? = _state.value.track?.takeIf { it.allowSing || _state.value.isMine }?.let { t ->
        val id = "community:${t.id}"
        app.songs.putTransient(t.composition.toSong(id, t.ownerNickname))
        id
    }
}

@Composable
fun TrackDetailScreen(
    trackId: String,
    onBack: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onChat: (String) -> Unit,
    onSing: (String) -> Unit,
    onRemixed: (Long) -> Unit,
    onOpenTrack: (String) -> Unit = {},
) {
    val vm = appViewModel("track:$trackId") { TrackDetailViewModel(it, trackId) }
    val s by vm.state.collectAsState()
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    var reportTarget by remember { mutableStateOf<Pair<ReportTarget, String>?>(null) }
    var confirmBlock by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var sharing by remember { mutableStateOf(false) }
    val guard = rememberProfileGuard()
    val context = androidx.compose.ui.platform.LocalContext.current
    val snackbar = remember { androidx.compose.material3.SnackbarHostState() }
    LaunchedEffect(s.toast) { s.toast?.let { snackbar.showSnackbar(it); vm.consumeToast() } }

    Box(Modifier.fillMaxSize()) {
        DetailContent(
            s,
            onBack = onBack,
            onLike = { guard(vm::toggleLike) },
            onRecommend = { guard(vm::recommend) },
            onFollow = { guard(vm::toggleFollow) },
            onShareSettings = { sharing = true },
            onShareLink = { s.track?.let { shareText(context, ShareLinks.trackMessage(it)) } },
            onOpenTrack = onOpenTrack,
            onRate = { n -> guard { vm.rate(n) } },
            onComment = { body -> guard { vm.comment(body) } },
            onDeleteComment = vm::deleteComment,
            onReportComment = { reportTarget = ReportTarget.COMMENT to it },
            onOpenProfile = onOpenProfile,
            onPlayed = { vm.played() },
            onCompleted = { vm.played(true) },
            onChat = { guard { scope.launch { vm.openChat()?.let(onChat) } } },
            onSing = { vm.prepareSing()?.let(onSing) },
            onRemix = { scope.launch { vm.remix()?.let(onRemixed) } },
            onReportTrack = { s.track?.let { reportTarget = ReportTarget.TRACK to it.id } },
            onBlock = { confirmBlock = true },
            onDelete = { confirmDelete = true },
        )
        androidx.compose.material3.SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).padding(bottom = 80.dp))
    }

    if (sharing) {
        s.track?.let { t ->
            ShareSheet(s.original?.composition, t, onDismiss = { sharing = false }) { id ->
                sharing = false
                if (id == null) {
                    scope.launch { s.original?.let { vm.unlink(it.id) }; onBack() }
                } else vm.load()
            }
        }
    }

    reportTarget?.let { (type, id) ->
        ReportDialog(if (type == ReportTarget.TRACK) "이 곡 신고하기" else "이 댓글 신고하기", onDismiss = { reportTarget = null }) { reason, detail ->
            vm.report(type, id, reason, detail); reportTarget = null
        }
    }
    if (confirmBlock) {
        val owner = s.track?.ownerNickname.orEmpty()
        AlertDialog(
            onDismissRequest = { confirmBlock = false },
            title = { Text("${owner}님을 차단할까요?") },
            text = { Text("서로의 곡·댓글이 보이지 않고 메시지를 주고받을 수 없어요. 내 정보 > 차단 목록에서 언제든 풀 수 있어요.") },
            confirmButton = { TextButton(onClick = { confirmBlock = false; s.track?.let { vm.block(it.ownerId, onBack) } }) { Text("차단", color = Neon.Red) } },
            dismissButton = { TextButton(onClick = { confirmBlock = false }) { Text("취소") } },
        )
    }
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("공유를 취소할까요?") },
            text = { Text("튠업에서 이 곡과 댓글·좋아요가 지워져요. 내 노래 목록의 원본은 그대로 남아요.") },
            confirmButton = { TextButton(onClick = { confirmDelete = false; scope.launch { vm.delete(); onBack() } }) { Text("삭제", color = Neon.Red) } },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("취소") } },
        )
    }
}

@Composable
fun DetailContent(
    s: DetailUiState,
    onBack: () -> Unit = {},
    onLike: () -> Unit = {},
    onRecommend: () -> Unit = {},
    onFollow: () -> Unit = {},
    onShareSettings: () -> Unit = {},
    onShareLink: () -> Unit = {},
    onOpenTrack: (String) -> Unit = {},
    onRate: (Int) -> Unit = {},
    onComment: (String) -> Unit = {},
    onDeleteComment: (String) -> Unit = {},
    onReportComment: (String) -> Unit = {},
    onOpenProfile: (String) -> Unit = {},
    onPlayed: () -> Unit = {},
    onCompleted: () -> Unit = {},
    onChat: () -> Unit = {},
    onSing: () -> Unit = {},
    onRemix: () -> Unit = {},
    onReportTrack: () -> Unit = {},
    onBlock: () -> Unit = {},
    onDelete: () -> Unit = {},
) {
    var menu by remember { mutableStateOf(false) }
    var draft by remember { mutableStateOf("") }
    val st by PreviewPlayer.state.collectAsState()
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "뒤로") }
            Spacer(Modifier.weight(1f))
            if (s.track != null) IconButton(onClick = onShareLink) { Icon(Icons.Filled.Share, contentDescription = "링크 공유") }
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, contentDescription = "더보기") }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    if (s.isMine) {
                        DropdownMenuItem(text = { Text("공유 취소 (삭제)") }, leadingIcon = { Icon(Icons.Filled.Delete, null) }, onClick = { menu = false; onDelete() })
                    } else {
                        DropdownMenuItem(text = { Text("곡 신고") }, leadingIcon = { Icon(Icons.Filled.Flag, null) }, onClick = { menu = false; onReportTrack() })
                        DropdownMenuItem(text = { Text("제작자 차단") }, leadingIcon = { Icon(Icons.Filled.Block, null) }, onClick = { menu = false; onBlock() })
                    }
                }
            }
        }
        val t = s.track
        when {
            s.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Neon.Pink) }
            t == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("곡을 찾을 수 없어요 (삭제됐거나 가려진 곡)", color = Neon.TextMid) }
            else -> {
                LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    item {
                        // 곡 헤더: 자동 커버 아트 위에 정보
                        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp))) {
                            CoverArt(t.id, t.composition, Modifier.matchParentSize(), melody = false)
                            Box(Modifier.matchParentSize().background(Color.Black.copy(alpha = 0.25f)))
                            Column(Modifier.fillMaxWidth().padding(20.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Tag(t.genre.label, Color.White)
                                    Spacer(Modifier.width(6.dp))
                                    Tag("${t.composition.key.label} · ${t.composition.bpm} BPM", Color.White)
                                    if (t.isPartial) {
                                        Spacer(Modifier.width(6.dp))
                                        Tag("하이라이트 ${t.composition.bars}/${t.fullBars}마디", Color.White, Icons.Filled.ContentCut)
                                    }
                                }
                                Text(t.title, style = MaterialTheme.typography.headlineLarge, color = Color.White, modifier = Modifier.padding(top = 12.dp), maxLines = 2, overflow = TextOverflow.Ellipsis)
                                Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Row(Modifier.weight(1f, fill = false).clickable { onOpenProfile(t.ownerId) }, verticalAlignment = Alignment.CenterVertically) {
                                        PlayerAvatar(t.ownerNickname, Color.White, 24)
                                        Text("  ${t.ownerNickname} · ${relativeTime(t.createdAt)}", color = Color.White.copy(alpha = 0.9f), style = MaterialTheme.typography.labelLarge, maxLines = 1)
                                    }
                                    if (!s.isMine) {
                                        Spacer(Modifier.width(8.dp))
                                        FollowChip(s.following, onFollow, onDark = true)
                                    }
                                }
                                MelodyShape(
                                    t.composition,
                                    Modifier.fillMaxWidth().padding(vertical = 14.dp).height(48.dp),
                                    progress = if (st.trackId == t.id) st.progress else null,
                                    color = Color.White,
                                )
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    PlayButton(t, 56.dp, onStarted = onPlayed, onCompleted = onCompleted)
                                    Column(Modifier.padding(start = 12.dp)) {
                                        Text("%d:%02d".format(t.composition.durationSec.toInt() / 60, t.composition.durationSec.toInt() % 60), color = Color.White, style = MaterialTheme.typography.titleMedium)
                                        Text("재생 ${t.playCount}회" + if (t.visibility == Visibility.UNLISTED) " · 링크 공개" else "", color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.labelMedium)
                                    }
                                }
                            }
                        }
                    }
                    s.remixSource?.let { src ->
                        item {
                            Row(
                                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Neon.Violet.copy(alpha = 0.12f))
                                    .clickable { onOpenTrack(src.id) }.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(Icons.AutoMirrored.Filled.CallSplit, contentDescription = null, tint = Neon.Violet, modifier = Modifier.size(18.dp))
                                Text("  원곡 ", color = Neon.TextMid, style = MaterialTheme.typography.labelLarge)
                                Text("「${src.title}」 · ${src.ownerNickname}", style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                Icon(Icons.Filled.ChevronRight, contentDescription = "원곡 보기", tint = Neon.TextLow)
                            }
                        }
                    }
                    if (t.description.isNotBlank()) item { Text(t.description, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(horizontal = 4.dp)) }
                    item {
                        // 반응: 좋아요 · 별점
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Neon.Surface).padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            LikeButton(t.likedByMe, t.likeCount, onLike, labelColor = Neon.TextHigh)
                            ReactionButton(
                                on = t.recommendedByMe, iconOn = Icons.Filled.RocketLaunch, iconOff = Icons.Outlined.RocketLaunch,
                                label = "추천", tint = Neon.Gold, onClick = onRecommend, labelColor = Neon.TextHigh, enabled = !s.isMine,
                                caption = "${t.recommendCount}", description = "추천 ${t.recommendCount}, 오늘 ${s.recommendsLeft}번 남음",
                            )
                            Box(Modifier.width(1.dp).height(44.dp).background(Neon.Outline).padding(horizontal = 8.dp))
                            Column(Modifier.weight(1f).padding(start = 14.dp)) {
                                Text(
                                    if (t.ratingCount == 0) "아직 별점이 없어요" else "평균 %.1f · %d명 참여".format(t.ratingAvg, t.ratingCount),
                                    color = Neon.TextMid, style = MaterialTheme.typography.labelMedium,
                                )
                                if (s.isMine) Text("내 곡에는 별점·추천을 줄 수 없어요", color = Neon.TextLow, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 4.dp))
                                else {
                                    StarRating(t.myRating, onRate)
                                    Text("오늘 남은 추천 ${s.recommendsLeft}번", color = Neon.TextLow, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp))
                                }
                            }
                        }
                    }
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            ActionTile(Icons.Filled.Mic, if (t.allowSing || s.isMine) "부르기" else "부르기 비허용", Modifier.weight(1f), onSing, enabled = t.allowSing || s.isMine)
                            ActionTile(Icons.AutoMirrored.Filled.CallSplit, if (t.allowRemix || s.isMine) "리믹스" else "리믹스 비허용", Modifier.weight(1f), onRemix, enabled = t.allowRemix || s.isMine)
                            if (s.isMine) ActionTile(Icons.Filled.Tune, "공개 설정", Modifier.weight(1f), onShareSettings)
                            else ActionTile(Icons.AutoMirrored.Filled.Chat, "메시지", Modifier.weight(1f), onChat)
                        }
                    }
                    item { SectionTitle("댓글 ${t.commentCount}") }
                    if (s.comments.isEmpty()) item { Text("첫 댓글을 남겨 보세요", color = Neon.TextLow, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = 4.dp)) }
                    items(s.comments, key = { it.id }) { c ->
                        CommentRow(c, canDelete = c.userId == s.myId || s.isMine, canReport = c.userId != s.myId, onProfile = { onOpenProfile(c.userId) }, onDelete = { onDeleteComment(c.id) }, onReport = { onReportComment(c.id) })
                    }
                    item { Spacer(Modifier.height(8.dp)) }
                }
                // 댓글 입력
                Row(Modifier.fillMaxWidth().background(Neon.Surface).padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(draft, { draft = it.take(300) }, placeholder = { Text("응원이나 의견을 남겨 주세요") }, maxLines = 3, modifier = Modifier.weight(1f))
                    IconButton(onClick = { onComment(draft); draft = "" }, enabled = draft.isNotBlank()) {
                        Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "댓글 등록", tint = if (draft.isNotBlank()) Neon.Pink else Neon.TextLow)
                    }
                }
            }
        }
    }
}

@Composable
private fun ActionTile(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, modifier: Modifier, onClick: () -> Unit, enabled: Boolean = true) {
    Column(
        modifier.clip(RoundedCornerShape(16.dp)).background(Neon.Surface).clickable(enabled = enabled, onClick = onClick).padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(if (enabled) icon else Icons.Filled.Lock, contentDescription = null, tint = if (enabled) Neon.Cyan else Neon.TextLow)
        Text(label, style = MaterialTheme.typography.labelMedium, color = if (enabled) Neon.TextHigh else Neon.TextLow, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun CommentRow(c: Comment, canDelete: Boolean, canReport: Boolean, onProfile: () -> Unit, onDelete: () -> Unit, onReport: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp)) {
        Box(Modifier.minimumInteractiveComponentSize().clip(CircleShape).clickable(onClick = onProfile), contentAlignment = Alignment.Center) { PlayerAvatar(c.nickname, Neon.Cyan, 34) }
        Column(Modifier.weight(1f).padding(start = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(c.nickname, style = MaterialTheme.typography.titleSmall)
                Text("  ${relativeTime(c.createdAt)}", color = Neon.TextLow, style = MaterialTheme.typography.labelSmall)
            }
            Text(c.body, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 2.dp))
        }
        if (canDelete || canReport) {
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, contentDescription = "댓글 메뉴", tint = Neon.TextLow, modifier = Modifier.size(18.dp)) }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    if (canDelete) DropdownMenuItem(text = { Text("삭제") }, onClick = { menu = false; onDelete() })
                    if (canReport) DropdownMenuItem(text = { Text("신고") }, onClick = { menu = false; onReport() })
                }
            }
        }
    }
}
