package com.melodeal.ui.community

import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.unit.dp
import com.melodeal.community.Profile
import com.melodeal.community.ReportTarget
import com.melodeal.community.Track
import com.melodeal.ui.app
import com.melodeal.ui.components.EmptyState
import com.melodeal.ui.components.GradientButton
import com.melodeal.ui.components.PlayerAvatar
import com.melodeal.ui.components.SectionTitle
import com.melodeal.ui.components.stageGlow
import com.melodeal.ui.theme.Neon
import kotlinx.coroutines.launch

/**
 * userId == null 이면 내 정보 탭, 아니면 다른 사람 프로필.
 */
@Composable
fun ProfileScreen(
    userId: String?,
    onBack: (() -> Unit)?,
    onOpenTrack: (String) -> Unit,
    onChat: (String) -> Unit,
    onSettings: () -> Unit = {},
) {
    CommunityGate {
        val community = app().community
        val me by community.me.collectAsState()
        val targetId = userId ?: me!!.id
        val isMe = targetId == me?.id
        var profile by remember { mutableStateOf<Profile?>(null) }
        var tracks by remember { mutableStateOf<List<Track>>(emptyList()) }
        var blocked by remember { mutableStateOf<List<Profile>>(emptyList()) }
        var reload by remember { mutableIntStateOf(0) }
        var editing by remember { mutableStateOf(false) }
        var reporting by remember { mutableStateOf(false) }
        var confirmBlock by remember { mutableStateOf(false) }
        var toast by remember { mutableStateOf<String?>(null) }
        val scope = rememberCoroutineScope()
        LaunchedEffect(targetId, reload, me) {
            profile = if (isMe) me else runCatching { community.profile(targetId) }.getOrNull()
            tracks = runCatching { community.tracksBy(targetId) }.getOrDefault(emptyList())
            if (isMe) blocked = runCatching { community.blockedUsers() }.getOrDefault(emptyList())
        }
        ProfileContent(
            profile = profile, tracks = tracks, isMe = isMe, blocked = blocked,
            onBack = onBack, onOpenTrack = onOpenTrack, onSettings = onSettings,
            onEdit = { editing = true },
            onChat = { scope.launch { runCatching { community.openConversation(targetId) }.onSuccess(onChat).onFailure { toast = it.message } } },
            onReport = { reporting = true },
            onBlock = { confirmBlock = true },
            onUnblock = { p -> scope.launch { community.unblock(p.id); reload++ } },
        )
        if (editing && me != null) {
            var nick by remember { mutableStateOf(me!!.nickname) }
            var bio by remember { mutableStateOf(me!!.bio) }
            var err by remember { mutableStateOf<String?>(null) }
            AlertDialog(
                onDismissRequest = { editing = false },
                title = { Text("프로필 수정") },
                text = {
                    Column {
                        OutlinedTextField(nick, { nick = it.take(12) }, label = { Text("닉네임") }, singleLine = true, isError = err != null, supportingText = { err?.let { Text(it) } })
                        OutlinedTextField(bio, { bio = it.take(80) }, label = { Text("한 줄 소개") }, singleLine = true)
                    }
                },
                confirmButton = {
                    TextButton(onClick = { scope.launch { runCatching { community.saveProfile(nick, bio) }.onSuccess { editing = false }.onFailure { err = it.message } } }) { Text("저장") }
                },
                dismissButton = { TextButton(onClick = { editing = false }) { Text("취소") } },
            )
        }
        if (reporting) {
            ReportDialog("${profile?.nickname ?: ""}님 신고하기", onDismiss = { reporting = false }) { reason, detail ->
                reporting = false
                scope.launch { runCatching { community.report(ReportTarget.USER, targetId, reason, detail) }.onSuccess { toast = "신고가 접수됐어요" } }
            }
        }
        if (confirmBlock) {
            AlertDialog(
                onDismissRequest = { confirmBlock = false },
                title = { Text("${profile?.nickname ?: ""}님을 차단할까요?") },
                text = { Text("서로의 곡·댓글이 보이지 않고 메시지를 주고받을 수 없어요.") },
                confirmButton = { TextButton(onClick = { confirmBlock = false; scope.launch { community.block(targetId); onBack?.invoke() } }) { Text("차단", color = Neon.Red) } },
                dismissButton = { TextButton(onClick = { confirmBlock = false }) { Text("취소") } },
            )
        }
        toast?.let { msg ->
            AlertDialog(onDismissRequest = { toast = null }, text = { Text(msg) }, confirmButton = { TextButton(onClick = { toast = null }) { Text("확인") } })
        }
    }
}

@Composable
fun ProfileContent(
    profile: Profile?,
    tracks: List<Track>,
    isMe: Boolean,
    blocked: List<Profile> = emptyList(),
    onBack: (() -> Unit)? = null,
    onOpenTrack: (String) -> Unit = {},
    onSettings: () -> Unit = {},
    onEdit: () -> Unit = {},
    onChat: () -> Unit = {},
    onReport: () -> Unit = {},
    onBlock: () -> Unit = {},
    onUnblock: (Profile) -> Unit = {},
) {
    LazyColumn(Modifier.fillMaxSize().stageGlow(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                if (onBack != null) IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "뒤로") }
                else Text("내 정보", style = MaterialTheme.typography.headlineLarge, modifier = Modifier.padding(start = 4.dp, top = 12.dp))
                Spacer(Modifier.weight(1f))
                if (isMe) IconButton(onClick = onSettings) { Icon(Icons.Outlined.Settings, contentDescription = "설정", tint = Neon.TextMid) }
            }
        }
        item {
            Column(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                PlayerAvatar(profile?.nickname ?: "?", Neon.Pink, 84)
                Text(profile?.nickname ?: "", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(top = 10.dp))
                if (!profile?.bio.isNullOrBlank()) Text(profile!!.bio, color = Neon.TextMid, style = MaterialTheme.typography.bodyMedium)
                Row(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(28.dp)) {
                    StatBlock("${tracks.size}", "공유한 곡")
                    StatBlock("${tracks.sumOf { it.likeCount }}", "받은 좋아요")
                    StatBlock(tracks.filter { it.ratingCount > 0 }.let { r -> if (r.isEmpty()) "-" else "%.1f".format(r.sumOf { it.ratingSum }.toDouble() / r.sumOf { it.ratingCount }) }, "평균 별점")
                }
                Spacer(Modifier.height(14.dp))
                if (isMe) {
                    OutlinedButton(onClick = onEdit) { Icon(Icons.Filled.Edit, contentDescription = null); Text("  프로필 수정") }
                } else {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        GradientButton("메시지", Neon.Hero, icon = Icons.AutoMirrored.Filled.Chat, onClick = onChat, modifier = Modifier.width(160.dp))
                        IconButton(onClick = onReport) { Icon(Icons.Filled.Flag, contentDescription = "신고", tint = Neon.TextMid) }
                        IconButton(onClick = onBlock) { Icon(Icons.Filled.Block, contentDescription = "차단", tint = Neon.TextMid) }
                    }
                }
            }
        }
        if (isMe) item { DemoBanner() }
        item { SectionTitle(if (isMe) "내가 공유한 곡" else "공유한 곡") }
        if (tracks.isEmpty()) {
            item { EmptyState(Icons.Filled.LibraryMusic, "아직 공유한 곡이 없어요", if (isMe) "곡 편집 화면에서 '멜로딜에 공유'를 눌러 보세요" else "") }
        }
        items(tracks, key = { it.id }) { t -> TrackCard(t, onClick = { onOpenTrack(t.id) }, onProfile = {}) }
        if (isMe && blocked.isNotEmpty()) {
            item { SectionTitle("차단한 사용자") }
            items(blocked, key = { "b" + it.id }) { p ->
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Neon.Surface).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    PlayerAvatar(p.nickname, Neon.TextLow, 32)
                    Text(p.nickname, modifier = Modifier.weight(1f).padding(start = 10.dp))
                    TextButton(onClick = { onUnblock(p) }) { Text("차단 풀기") }
                }
            }
        }
    }
}

@Composable
private fun StatBlock(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleLarge)
        Text(label, color = Neon.TextLow, style = MaterialTheme.typography.labelSmall)
    }
}
