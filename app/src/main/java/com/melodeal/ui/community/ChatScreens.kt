package com.melodeal.ui.community

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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.melodeal.MelodealApp
import com.melodeal.community.Conversation
import com.melodeal.community.Message
import com.melodeal.community.ReportTarget
import com.melodeal.ui.app
import com.melodeal.ui.appViewModel
import com.melodeal.ui.components.EmptyState
import com.melodeal.ui.components.PlayerAvatar
import com.melodeal.ui.components.stageGlow
import com.melodeal.ui.theme.Neon
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

// ───────────────────────── 대화 목록 ─────────────────────────

@Composable
fun ChatListScreen(onOpen: (String) -> Unit) {
    CommunityGate {
        val community = app().community
        var list by remember { mutableStateOf<List<Conversation>?>(null) }
        LaunchedEffect(Unit) {
            // 목록 화면에 있는 동안 주기적으로 새 메시지 확인
            while (true) {
                list = runCatching { community.conversations() }.getOrDefault(list ?: emptyList())
                kotlinx.coroutines.delay(5000)
            }
        }
        ChatListContent(list, onOpen)
    }
}

@Composable
fun ChatListContent(list: List<Conversation>?, onOpen: (String) -> Unit = {}, showHeader: Boolean = true) {
    LazyColumn(Modifier.fillMaxSize().stageGlow(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (showHeader) item {
            Column(Modifier.padding(top = 16.dp, start = 4.dp, bottom = 4.dp)) {
                Text("메시지", style = MaterialTheme.typography.headlineLarge)
                Text("곡 제작자와 협업·가사·피드백을 나눠요", color = Neon.TextMid, style = MaterialTheme.typography.bodyMedium)
            }
        }
        item { DemoBanner() }
        item { SafetyNotice() }
        when {
            list == null -> item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Neon.Pink) } }
            list.isEmpty() -> item { EmptyState(Icons.AutoMirrored.Filled.Chat, "아직 대화가 없어요", "마음에 드는 곡 상세 화면에서 '메시지 보내기'를 눌러 보세요") }
            else -> items(list, key = { it.id }) { c -> ConversationRow(c) { onOpen(c.id) } }
        }
    }
}

@Composable
private fun SafetyNotice() {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Neon.Surface).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Shield, contentDescription = null, tint = Neon.Cyan, modifier = Modifier.size(18.dp))
        Text(
            "외부 메신저·계좌 거래 유도는 사기일 수 있어요. 불쾌한 대화는 오른쪽 위 메뉴에서 신고·차단할 수 있어요.",
            color = Neon.TextMid, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(start = 10.dp),
        )
    }
}

@Composable
private fun ConversationRow(c: Conversation, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Neon.Surface).clickable(onClick = onClick).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PlayerAvatar(c.other.nickname, Neon.Cyan, 46)
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(c.other.nickname, style = MaterialTheme.typography.titleMedium)
                if (c.trackTitle != null) {
                    Icon(Icons.Filled.MusicNote, contentDescription = null, tint = Neon.Pink, modifier = Modifier.padding(start = 6.dp).size(13.dp))
                    Text(c.trackTitle, color = Neon.Pink, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Text(
                c.lastMessage.ifBlank { "대화를 시작해 보세요" },
                color = if (c.unread > 0) Neon.TextHigh else Neon.TextMid, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(relativeTime(c.lastMessageAt), color = Neon.TextLow, style = MaterialTheme.typography.labelSmall)
            if (c.unread > 0) {
                Box(Modifier.padding(top = 4.dp).clip(CircleShape).background(Neon.Pink).padding(horizontal = 7.dp, vertical = 2.dp)) {
                    Text("${c.unread}", color = Color.White, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

// ───────────────────────── 대화방 ─────────────────────────

data class ChatUiState(
    val conversation: Conversation? = null,
    val messages: List<Message> = emptyList(),
    val myId: String? = null,
    val loading: Boolean = true,
    val error: String? = null,
)

class ChatRoomViewModel(private val app: MelodealApp, private val conversationId: String) : ViewModel() {
    private val community = app.community
    private val _state = MutableStateFlow(ChatUiState(myId = community.me.value?.id))
    val state: StateFlow<ChatUiState> = _state

    init {
        viewModelScope.launch {
            val conv = runCatching { community.conversations().firstOrNull { it.id == conversationId } }.getOrNull()
            val msgs = runCatching { community.messages(conversationId) }.getOrDefault(emptyList())
            _state.update { it.copy(conversation = conv, messages = msgs, loading = false) }
            runCatching { community.markRead(conversationId) }
        }
        // 실시간으로 도착하는 메시지
        viewModelScope.launch {
            runCatching {
                community.incoming(conversationId).collect { m ->
                    _state.update { s -> if (s.messages.any { it.id == m.id }) s else s.copy(messages = s.messages + m) }
                    if (m.senderId != _state.value.myId) runCatching { community.markRead(conversationId) }
                }
            }
        }
    }

    fun send(body: String) {
        if (body.isBlank()) return
        viewModelScope.launch {
            runCatching { community.sendMessage(conversationId, body) }
                .onSuccess { m -> _state.update { s -> if (s.messages.any { it.id == m.id }) s else s.copy(messages = s.messages + m, error = null) } }
                .onFailure { e -> _state.update { it.copy(error = e.message) } }
        }
    }

    fun report(messageOrUser: ReportTarget, id: String, reason: com.melodeal.community.ReportReason, detail: String) =
        viewModelScope.launch { runCatching { community.report(messageOrUser, id, reason, detail) } }

    fun block(then: () -> Unit) = viewModelScope.launch {
        _state.value.conversation?.let { c -> runCatching { community.block(c.other.id) }.onSuccess { then() } }
    }
}

@Composable
fun ChatRoomScreen(conversationId: String, onBack: () -> Unit, onOpenProfile: (String) -> Unit, onOpenTrack: (String) -> Unit) {
    val vm = appViewModel("chat:$conversationId") { ChatRoomViewModel(it, conversationId) }
    val s by vm.state.collectAsState()
    var reporting by remember { mutableStateOf<Pair<ReportTarget, String>?>(null) }
    var confirmBlock by remember { mutableStateOf(false) }
    ChatRoomContent(
        s, onBack = onBack, onSend = vm::send,
        onOpenProfile = { s.conversation?.let { onOpenProfile(it.other.id) } },
        onOpenTrack = { s.conversation?.trackId?.let(onOpenTrack) },
        onReportUser = { s.conversation?.let { reporting = ReportTarget.USER to it.other.id } },
        onReportMessage = { reporting = ReportTarget.MESSAGE to it },
        onBlock = { confirmBlock = true },
    )
    reporting?.let { (type, id) ->
        ReportDialog(if (type == ReportTarget.USER) "사용자 신고하기" else "메시지 신고하기", onDismiss = { reporting = null }) { reason, detail ->
            vm.report(type, id, reason, detail); reporting = null
        }
    }
    if (confirmBlock) {
        AlertDialog(
            onDismissRequest = { confirmBlock = false },
            title = { Text("${s.conversation?.other?.nickname ?: ""}님을 차단할까요?") },
            text = { Text("더 이상 메시지를 주고받을 수 없고, 서로의 곡·댓글이 보이지 않아요.") },
            confirmButton = { TextButton(onClick = { confirmBlock = false; vm.block(onBack) }) { Text("차단", color = Neon.Red) } },
            dismissButton = { TextButton(onClick = { confirmBlock = false }) { Text("취소") } },
        )
    }
}

@Composable
fun ChatRoomContent(
    s: ChatUiState,
    onBack: () -> Unit = {},
    onSend: (String) -> Unit = {},
    onOpenProfile: () -> Unit = {},
    onOpenTrack: () -> Unit = {},
    onReportUser: () -> Unit = {},
    onReportMessage: (String) -> Unit = {},
    onBlock: () -> Unit = {},
) {
    var draft by remember { mutableStateOf("") }
    var menu by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()
    LaunchedEffect(s.messages.size) { if (s.messages.isNotEmpty()) listState.animateScrollToItem(s.messages.lastIndex) }
    Column(Modifier.fillMaxSize().imePadding()) {
        Row(Modifier.fillMaxWidth().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "뒤로") }
            Row(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).clickable(onClick = onOpenProfile).padding(6.dp), verticalAlignment = Alignment.CenterVertically) {
                PlayerAvatar(s.conversation?.other?.nickname ?: "?", Neon.Cyan, 34)
                Text(s.conversation?.other?.nickname ?: "", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(start = 10.dp))
            }
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, contentDescription = "더보기") }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(text = { Text("사용자 신고") }, leadingIcon = { Icon(Icons.Filled.Flag, null) }, onClick = { menu = false; onReportUser() })
                    DropdownMenuItem(text = { Text("차단") }, leadingIcon = { Icon(Icons.Filled.Block, null) }, onClick = { menu = false; onBlock() })
                }
            }
        }
        s.conversation?.trackTitle?.let { title ->
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(12.dp)).background(Neon.Pink.copy(alpha = 0.1f))
                    .clickable(onClick = onOpenTrack).padding(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.MusicNote, contentDescription = null, tint = Neon.Pink, modifier = Modifier.size(16.dp))
                Text("「$title」을(를) 보고 시작한 대화예요", color = Neon.Pink, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(start = 6.dp))
            }
        }
        LazyColumn(Modifier.weight(1f), state = listState, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            if (!s.loading && s.messages.isEmpty()) {
                item { Text("첫 메시지를 보내 보세요. 예) \"이 곡에 가사를 붙여봐도 될까요?\"", color = Neon.TextLow, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 24.dp)) }
            }
            items(s.messages, key = { it.id }) { m -> Bubble(m, mine = m.senderId == s.myId, onReport = { onReportMessage(m.id) }) }
        }
        s.error?.let { Text(it, color = Neon.Red, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(horizontal = 16.dp)) }
        Row(Modifier.fillMaxWidth().background(Neon.Surface).padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(draft, { draft = it.take(1000) }, placeholder = { Text("메시지 입력") }, maxLines = 4, modifier = Modifier.weight(1f))
            IconButton(onClick = { onSend(draft); draft = "" }, enabled = draft.isNotBlank()) {
                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "보내기", tint = if (draft.isNotBlank()) Neon.Pink else Neon.TextLow)
            }
        }
    }
}

@Composable
private fun Bubble(m: Message, mine: Boolean, onReport: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start, verticalAlignment = Alignment.Bottom) {
        if (mine) {
            Text(
                (if (m.readAt != null) "읽음 · " else "") + relativeTime(m.createdAt),
                color = Neon.TextLow, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(end = 6.dp),
            )
        }
        Box {
            Text(
                m.body,
                color = Color.White,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.widthIn(max = 260.dp)
                    .clip(RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp, bottomStart = if (mine) 18.dp else 4.dp, bottomEnd = if (mine) 4.dp else 18.dp))
                    .background(if (mine) Neon.Hero else Brush.linearGradient(listOf(Neon.SurfaceHigh, Neon.SurfaceHigh)))
                    .let { if (!mine) it.clickable { menu = true } else it }
                    .padding(horizontal = 14.dp, vertical = 10.dp),
            )
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(text = { Text("이 메시지 신고") }, onClick = { menu = false; onReport() })
            }
        }
        if (!mine) Text(relativeTime(m.createdAt), color = Neon.TextLow, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(start = 6.dp))
        Spacer(Modifier.size(0.dp))
    }
}
