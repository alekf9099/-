package com.tuneup.ui.my

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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCut
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.IosShare
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tuneup.community.ChartKind
import com.tuneup.community.Profile
import com.tuneup.community.Track
import com.tuneup.community.Visibility
import com.tuneup.studio.SavedComposition
import com.tuneup.ui.app
import com.tuneup.ui.community.DemoBanner
import com.tuneup.ui.community.ShareSheet
import com.tuneup.ui.components.CoverArt
import com.tuneup.ui.components.IconTile
import com.tuneup.ui.components.NeonCard
import com.tuneup.ui.components.PlayerAvatar
import com.tuneup.ui.components.SectionTitle
import com.tuneup.ui.components.compactCount
import com.tuneup.ui.components.stageGlow
import com.tuneup.ui.theme.Neon
import kotlinx.coroutines.launch

data class MyUiState(
    val me: Profile? = null,
    val songs: List<SavedComposition> = emptyList(),
    /** 공유한 곡 (trackId → 곡) */
    val published: Map<String, Track> = emptyMap(),
    /** 이번 주 차트 순위 (trackId → 순위) */
    val ranks: Map<String, Int> = emptyMap(),
    val blocked: List<Profile> = emptyList(),
) {
    val totalLikes get() = published.values.sumOf { it.likeCount }
    val totalRecommends get() = published.values.sumOf { it.recommendCount }
    val bestRank get() = ranks.minByOrNull { it.value }
}

class MyActions(
    val onOpenSong: (Long) -> Unit = {},
    val onShare: (SavedComposition) -> Unit = {},
    val onOpenTrack: (String) -> Unit = {},
    val onCreate: () -> Unit = {},
    val onSing: () -> Unit = {},
    val onParty: () -> Unit = {},
    val onRanking: () -> Unit = {},
    val onSettings: () -> Unit = {},
    val onEditProfile: () -> Unit = {},
    val onUnblock: (Profile) -> Unit = {},
)

/** MY: 내 스튜디오. 만든 노래와 공개 상태, 받은 반응, 노래방·파티 */
@Composable
fun MyScreen(
    onOpenSong: (Long) -> Unit,
    onOpenTrack: (String) -> Unit,
    onCreate: () -> Unit,
    onSing: () -> Unit,
    onParty: () -> Unit,
    onRanking: () -> Unit,
    onSettings: () -> Unit,
) {
    val app = app()
    val community = app.community
    val me by community.me.collectAsState()
    val songs by app.studio.all.collectAsState(initial = emptyList())
    var published by remember { mutableStateOf<Map<String, Track>>(emptyMap()) }
    var ranks by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }
    var blocked by remember { mutableStateOf<List<Profile>>(emptyList()) }
    var profile by remember { mutableStateOf<Profile?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    var sharing by remember { mutableStateOf<SavedComposition?>(null) }
    var editing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) { if (me == null) runCatching { community.signIn() } }
    LaunchedEffect(me, reload, songs.size) {
        val p = me ?: return@LaunchedEffect
        profile = runCatching { community.profile(p.id) }.getOrNull() ?: p
        published = runCatching { community.tracksBy(p.id) }.getOrDefault(emptyList()).associateBy { it.id }
        ranks = runCatching { community.chart(ChartKind.WEEKLY) }.getOrDefault(emptyList()).filter { it.track.ownerId == p.id }.associate { it.track.id to it.rank }
        blocked = runCatching { community.blockedUsers() }.getOrDefault(emptyList())
    }

    MyContent(
        MyUiState(profile ?: me, songs, published, ranks, blocked),
        MyActions(
            onOpenSong = onOpenSong, onShare = { sharing = it }, onOpenTrack = onOpenTrack, onCreate = onCreate,
            onSing = onSing, onParty = onParty, onRanking = onRanking, onSettings = onSettings, onEditProfile = { editing = true },
            onUnblock = { p -> scope.launch { runCatching { community.unblock(p.id) }; reload++ } },
        ),
    )

    sharing?.let { saved ->
        val existing = saved.publishedTrackId?.let { published[it] }
        ShareSheet(saved.composition, existing, onDismiss = { sharing = null }, remixOf = saved.remixOf) { trackId ->
            sharing = null
            scope.launch { app.studio.markPublished(saved.id, trackId); reload++ }
        }
    }
    if (editing) {
        var nick by remember { mutableStateOf(me?.nickname.orEmpty()) }
        var bio by remember { mutableStateOf(me?.bio.orEmpty()) }
        var err by remember { mutableStateOf<String?>(null) }
        AlertDialog(
            onDismissRequest = { editing = false },
            title = { Text(if (me == null) "닉네임 정하기" else "프로필 수정") },
            text = {
                Column {
                    OutlinedTextField(nick, { nick = it.take(12); err = null }, label = { Text("닉네임 (2~12자)") }, singleLine = true, isError = err != null, supportingText = { err?.let { Text(it) } })
                    OutlinedTextField(bio, { bio = it.take(80) }, label = { Text("한 줄 소개") }, singleLine = true)
                }
            },
            confirmButton = {
                TextButton(onClick = { scope.launch { runCatching { community.saveProfile(nick, bio) }.onSuccess { editing = false; reload++ }.onFailure { err = it.message } } }) { Text("저장") }
            },
            dismissButton = { TextButton(onClick = { editing = false }) { Text("취소") } },
        )
    }
}

@Composable
fun MyContent(s: MyUiState, a: MyActions = MyActions()) {
    LazyColumn(Modifier.fillMaxSize().stageGlow(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Row(Modifier.fillMaxWidth().padding(top = 12.dp, start = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("MY", style = MaterialTheme.typography.headlineLarge, modifier = Modifier.weight(1f))
                IconButton(onClick = a.onSettings) { Icon(Icons.Outlined.Settings, contentDescription = "설정", tint = Neon.TextMid) }
            }
        }
        // 프로필 카드
        item {
            NeonCard(modifier = Modifier.fillMaxWidth(), onClick = a.onEditProfile) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        PlayerAvatar(s.me?.nickname ?: "?", Neon.Pink, 56)
                        Column(Modifier.weight(1f).padding(start = 14.dp)) {
                            Text(s.me?.nickname ?: "닉네임을 정해 주세요", style = MaterialTheme.typography.titleLarge)
                            Text(
                                s.me?.bio?.takeIf { it.isNotBlank() } ?: if (s.me == null) "닉네임을 정하면 곡을 공유하고 차트에 도전할 수 있어요" else "한 줄 소개를 남겨 보세요",
                                color = Neon.TextMid, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis,
                            )
                        }
                        Icon(Icons.Filled.Edit, contentDescription = "프로필 수정", tint = Neon.TextLow, modifier = Modifier.size(18.dp))
                    }
                    if (s.me != null) {
                        Row(Modifier.fillMaxWidth().padding(top = 14.dp), horizontalArrangement = Arrangement.SpaceAround) {
                            Stat(compactCount(s.me.followerCount), "팔로워")
                            Stat(compactCount(s.me.followingCount), "팔로잉")
                            Stat(compactCount(s.totalLikes), "받은 좋아요")
                            Stat(compactCount(s.totalRecommends), "받은 추천")
                        }
                    }
                }
            }
        }
        // 차트 진입 소식
        s.bestRank?.let { (trackId, rank) ->
            val t = s.published[trackId]
            item {
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Brush.linearGradient(listOf(Color(0xFF7A5200), Color(0xFF8E2A3C))))
                        .clickable { a.onOpenTrack(trackId) }.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.EmojiEvents, contentDescription = null, tint = Neon.Gold, modifier = Modifier.size(28.dp))
                    Column(Modifier.weight(1f).padding(start = 12.dp)) {
                        Text("이번 주 차트 ${rank}위!", color = Color.White, style = MaterialTheme.typography.titleMedium)
                        Text("「${t?.title ?: ""}」이(가) 차트에 올랐어요", color = Color.White.copy(alpha = 0.9f), style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        item { SectionTitle("내 노래 ${if (s.songs.isEmpty()) "" else s.songs.size}", Modifier.padding(top = 4.dp)) }
        if (s.songs.isEmpty()) {
            item {
                NeonCard(onClick = a.onCreate, modifier = Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.LibraryMusic, contentDescription = null, tint = Neon.TextLow)
                        Text("아직 만든 노래가 없어요. ＋ 버튼으로 30초만 흥얼거려 보세요", color = Neon.TextMid, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = 12.dp))
                    }
                }
            }
        }
        items(s.songs, key = { it.id }) { saved -> SongRow(saved, saved.publishedTrackId?.let { s.published[it] }, saved.publishedTrackId?.let { s.ranks[it] }, a) }

        item { SectionTitle("함께 즐기기", Modifier.padding(top = 8.dp)) }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Mini(Icons.Filled.Mic, Neon.Cool, "노래방", "내 곡·샘플곡 채점", a.onSing, Modifier.weight(1f))
                Mini(Icons.Filled.Groups, Neon.Hero, "파티 모드", "돌아가며 대결", a.onParty, Modifier.weight(1f))
                Mini(Icons.Filled.EmojiEvents, Neon.Warm, "노래방 랭킹", "곡별 · 주간", a.onRanking, Modifier.weight(1f))
            }
        }
        if (s.blocked.isNotEmpty()) {
            item { SectionTitle("차단한 사용자", Modifier.padding(top = 8.dp)) }
            items(s.blocked, key = { "b" + it.id }) { p ->
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Neon.Surface).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    PlayerAvatar(p.nickname, Neon.TextLow, 32)
                    Text(p.nickname, modifier = Modifier.weight(1f).padding(start = 10.dp))
                    TextButton(onClick = { a.onUnblock(p) }) { Text("차단 풀기") }
                }
            }
        }
        item { DemoBanner(Modifier.padding(top = 8.dp)) }
    }
}

@Composable
private fun Stat(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleLarge)
        Text(label, color = Neon.TextLow, style = MaterialTheme.typography.labelSmall)
    }
}

/** 내 노래 한 줄: 커버 · 제목 · 공개 상태 · 공유 버튼 */
@Composable
private fun SongRow(saved: SavedComposition, track: Track?, rank: Int?, a: MyActions) {
    val c = saved.composition
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Neon.Surface).border(1.dp, Neon.Outline, RoundedCornerShape(18.dp))
            .clickable { a.onOpenSong(saved.id) }.padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CoverArt(saved.publishedTrackId ?: "local-${saved.id}", c, Modifier.size(56.dp), RoundedCornerShape(14.dp))
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(c.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                "${c.genre.label} · ${c.bars}마디 · ${"%d:%02d".format(c.durationSec.toInt() / 60, c.durationSec.toInt() % 60)}",
                color = Neon.TextMid, style = MaterialTheme.typography.labelSmall,
            )
            Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                when {
                    track == null -> Badge(Icons.Filled.Lock, "비공개", Neon.TextMid)
                    track.visibility == Visibility.UNLISTED -> Badge(Icons.Filled.Link, "링크 공개", Neon.Cyan)
                    else -> Badge(Icons.Filled.Public, "전체 공개", Neon.Lime)
                }
                if (track?.isPartial == true) Badge(Icons.Filled.ContentCut, "${track.composition.bars}/${track.fullBars}마디", Neon.Violet)
                if (rank != null) Badge(Icons.Filled.EmojiEvents, "${rank}위", Neon.Gold)
                if (track != null && rank == null) Text("좋아요 ${track.likeCount} · 추천 ${track.recommendCount}", color = Neon.TextLow, style = MaterialTheme.typography.labelSmall)
            }
        }
        IconButton(onClick = { a.onShare(saved) }) {
            Icon(Icons.Filled.IosShare, contentDescription = if (track == null) "공유하기" else "공유 설정", tint = if (track == null) Neon.Pink else Neon.TextMid)
        }
    }
}

@Composable
private fun Badge(icon: ImageVector, text: String, color: Color) {
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(color.copy(alpha = 0.14f)).padding(horizontal = 7.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(11.dp))
        Spacer(Modifier.width(3.dp))
        Text(text, color = color, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun Mini(icon: ImageVector, brush: Brush, title: String, subtitle: String, onClick: () -> Unit, modifier: Modifier) {
    NeonCard(onClick = onClick, modifier = modifier) {
        Column {
            IconTile(icon, brush, 40.dp)
            Spacer(Modifier.height(10.dp))
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(subtitle, color = Neon.TextMid, style = MaterialTheme.typography.labelSmall)
        }
    }
}
