package com.melodeal.ui.activity

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.RocketLaunch
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.melodeal.community.AppNotification
import com.melodeal.community.Conversation
import com.melodeal.community.NotificationKind
import com.melodeal.ui.app
import com.melodeal.ui.community.ChatListContent
import com.melodeal.ui.community.CommunityGate
import com.melodeal.ui.community.relativeTime
import com.melodeal.ui.components.EmptyState
import com.melodeal.ui.components.PlayerAvatar
import com.melodeal.ui.components.SectionTitle
import com.melodeal.ui.components.SegmentTabs
import com.melodeal.ui.components.stageGlow
import com.melodeal.ui.theme.Neon
import kotlinx.coroutines.delay

/** 활동 탭: 내 곡에 온 반응(알림) + 1:1 메시지 */
@Composable
fun ActivityScreen(onOpenTrack: (String) -> Unit, onOpenProfile: (String) -> Unit, onOpenChat: (String) -> Unit, onSeen: () -> Unit = {}) {
    CommunityGate {
        val community = app().community
        var tab by rememberSaveable { mutableIntStateOf(0) }
        var notifications by remember { mutableStateOf<List<AppNotification>?>(null) }
        var chats by remember { mutableStateOf<List<Conversation>?>(null) }
        LaunchedEffect(Unit) {
            notifications = runCatching { community.notifications() }.getOrDefault(emptyList())
            community.notificationEvents().collect { n -> notifications = listOf(n) + (notifications ?: emptyList()).filter { it.id != n.id } }
        }
        LaunchedEffect(Unit) {
            while (true) {
                chats = runCatching { community.conversations() }.getOrDefault(chats ?: emptyList())
                delay(5000)
            }
        }
        // 알림 탭을 보고 있으면 잠시 뒤 읽음 처리 (안 읽은 표시는 이번 화면에선 그대로 둔다)
        LaunchedEffect(tab, notifications?.count { !it.read }) {
            if (tab == 0 && notifications.orEmpty().any { !it.read }) {
                delay(1500)
                runCatching { community.markNotificationsRead() }
                onSeen()
            }
        }
        ActivityContent(tab, { tab = it }, notifications, chats, onOpenTrack, onOpenProfile, onOpenChat)
    }
}

@Composable
fun ActivityContent(
    tab: Int,
    onTab: (Int) -> Unit,
    notifications: List<AppNotification>?,
    chats: List<Conversation>?,
    onOpenTrack: (String) -> Unit = {},
    onOpenProfile: (String) -> Unit = {},
    onOpenChat: (String) -> Unit = {},
) {
    Column(Modifier.fillMaxSize().stageGlow()) {
        Column(Modifier.padding(start = 20.dp, end = 16.dp, top = 16.dp)) {
            Text("활동", style = MaterialTheme.typography.headlineLarge)
            SegmentTabs(
                listOf("알림", "메시지"), tab, onTab, Modifier.padding(top = 8.dp, bottom = 4.dp),
                badges = listOf(notifications.orEmpty().count { !it.read }, chats.orEmpty().sumOf { it.unread }),
            )
        }
        if (tab == 1) {
            ChatListContent(chats, onOpenChat, showHeader = false)
            return@Column
        }
        when {
            notifications == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Neon.Pink) }
            notifications.isEmpty() -> Box(Modifier.padding(16.dp)) {
                EmptyState(Icons.Filled.NotificationsNone, "아직 알림이 없어요", "곡을 공유하면 좋아요·추천·댓글·팔로우 소식이 여기로 와요")
            }
            else -> {
                val now = System.currentTimeMillis()
                val groups = notifications.groupBy {
                    val age = now - it.createdAt
                    when {
                        age < 24 * 3600_000L -> "오늘"
                        age < 7 * 24 * 3600_000L -> "이번 주"
                        else -> "이전"
                    }
                }
                LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("오늘", "이번 주", "이전").forEach { g ->
                        val list = groups[g] ?: return@forEach
                        item(key = "h$g") { SectionTitle(g, Modifier.padding(top = 8.dp)) }
                        items(list, key = { it.id }) { n ->
                            NotificationRow(n) {
                                if (n.kind == NotificationKind.FOLLOW || n.trackId == null) n.actor?.let { onOpenProfile(it.id) } else onOpenTrack(n.trackId)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationRow(n: AppNotification, onClick: () -> Unit) {
    val (icon, tint) = when (n.kind) {
        NotificationKind.LIKE -> Icons.Filled.Favorite to Neon.Pink
        NotificationKind.RECOMMEND -> Icons.Filled.RocketLaunch to Neon.Gold
        NotificationKind.COMMENT -> Icons.AutoMirrored.Filled.Chat to Neon.Cyan
        NotificationKind.FOLLOW -> Icons.Filled.PersonAdd to Neon.Lime
    }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
            .background(if (n.read) Color.Transparent else Neon.Pink.copy(alpha = 0.07f))
            .clickable(onClick = onClick).padding(horizontal = 10.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
            PlayerAvatar(n.actor?.nickname ?: "?", Neon.Violet, 44)
            Box(
                Modifier.align(Alignment.BottomEnd).size(20.dp).clip(CircleShape).background(Neon.Bg).padding(2.dp).clip(CircleShape).background(tint.copy(alpha = 0.25f)),
                contentAlignment = Alignment.Center,
            ) { Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(11.dp)) }
        }
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Text(n.text, style = MaterialTheme.typography.bodyMedium, maxLines = 2)
            Text(relativeTime(n.createdAt), color = Neon.TextLow, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp))
        }
        if (!n.read) Box(Modifier.size(8.dp).clip(CircleShape).background(Neon.Pink))
    }
}
