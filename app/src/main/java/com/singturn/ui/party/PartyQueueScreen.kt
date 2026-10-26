package com.singturn.ui.party

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Casino
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.WorkspacePremium
import com.singturn.ui.components.RankBadge
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.singturn.party.Reservation
import com.singturn.ui.AppViewModel
import com.singturn.ui.components.EmptyState
import com.singturn.ui.components.GradientButton
import com.singturn.ui.components.NeonCard
import com.singturn.ui.components.PlayerAvatar
import com.singturn.ui.components.SectionTitle
import com.singturn.ui.components.SingTopBar
import com.singturn.ui.theme.Neon
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val penalties = listOf(
    "다음 곡은 옆 사람이 골라주기", "애교 한 번", "음료수 쏘기", "다음 곡 키 +3으로 부르기",
    "랩처럼 부르기", "성대모사로 한 소절", "칭찬 3개 하기", "다음 사람 탬버린 담당",
)

@Composable
fun PartyQueueScreen(
    vm: AppViewModel,
    onBack: () -> Unit,
    onEditPlayers: () -> Unit,
    onReserve: (playerId: Int) -> Unit,
    onSing: (Reservation) -> Unit,
) {
    val party by vm.party.collectAsState()
    val upNext by vm.upNext.collectAsState()
    var countdown by remember { mutableStateOf<Int?>(null) }
    var showRoulette by remember { mutableStateOf(false) }
    var confirmEnd by remember { mutableStateOf(false) }
    val haptics = LocalHapticFeedback.current

    // 차례가 바뀌면 진동으로 알림
    LaunchedEffect(upNext?.id) { if (upNext != null) haptics.performHapticFeedback(HapticFeedbackType.LongPress) }

    LaunchedEffect(countdown) {
        val c = countdown ?: return@LaunchedEffect
        if (c == 0) {
            delay(500)
            countdown = null
            upNext?.let(onSing)
        } else {
            delay(800)
            countdown = c - 1
        }
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            SingTopBar("파티 진행", onBack) {
                IconButton(onClick = onEditPlayers) { Icon(Icons.Filled.Edit, contentDescription = "참가자 편집") }
                TextButton(onClick = { confirmEnd = true }) { Text("종료", color = Neon.Red) }
            }
            LazyColumn(Modifier.fillMaxSize().padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item { UpNextCard(vm, upNext, onStart = { countdown = 3 }) }

                val standings = party.standings()
                if (party.history.isNotEmpty()) {
                    item {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            SectionTitle("오늘의 순위", Modifier.weight(1f))
                            TextButton(onClick = { showRoulette = true }) {
                                Icon(Icons.Filled.Casino, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("벌칙 룰렛")
                            }
                        }
                    }
                    items(standings, key = { "s${it.player.id}" }) { s ->
                        val rank = standings.indexOf(s) + 1
                        NeonCard(modifier = Modifier.fillMaxWidth(), border = if (rank == 1 && s.sung > 0) Neon.Gold else Neon.Outline) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                if (s.sung == 0) {
                                    Box(Modifier.size(32.dp), contentAlignment = Alignment.Center) { Text("-", color = Neon.TextLow) }
                                } else {
                                    RankBadge(rank)
                                }
                                Spacer(Modifier.width(10.dp))
                                PlayerAvatar(s.player.name, Neon.PlayerColors[s.player.colorIndex], 36)
                                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(s.player.name, style = MaterialTheme.typography.titleMedium)
                                        if (rank == 1 && s.sung > 0) {
                                            Icon(Icons.Filled.WorkspacePremium, contentDescription = "1위", tint = Neon.Gold, modifier = Modifier.padding(start = 4.dp).size(18.dp))
                                        }
                                    }
                                    Text("${s.sung}곡 · 최고 ${s.best}점", color = Neon.TextMid, style = MaterialTheme.typography.bodyMedium)
                                }
                                Text(
                                    if (s.sung == 0) "-" else "%.1f".format(s.average),
                                    style = MaterialTheme.typography.titleLarge,
                                    color = Neon.TextHigh,
                                )
                            }
                        }
                    }
                }

                item { SectionTitle("예약 목록") }
                items(party.players, key = { "p${it.id}" }) { p ->
                    val mine = party.reservationsOf(p.id)
                    val color = Neon.PlayerColors[p.colorIndex]
                    NeonCard(modifier = Modifier.fillMaxWidth()) {
                        Column {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                PlayerAvatar(p.name, color, 32)
                                Text(p.name, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f).padding(horizontal = 10.dp))
                                OutlinedButton(onClick = { onReserve(p.id) }) {
                                    Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                                    Text("곡 예약")
                                }
                            }
                            if (mine.isEmpty()) {
                                Text("예약한 곡이 없어요", color = Neon.TextLow, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 8.dp))
                            }
                            mine.forEach { r ->
                                Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.AutoMirrored.Filled.QueueMusic, contentDescription = null, tint = color, modifier = Modifier.size(18.dp))
                                    Text(
                                        r.songTitle, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                        modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
                                        fontWeight = if (r.id == upNext?.id) FontWeight.Bold else FontWeight.Normal,
                                    )
                                    IconButton(onClick = { vm.cancel(r.id) }, modifier = Modifier.size(36.dp)) {
                                        Icon(Icons.Filled.Close, contentDescription = "예약 취소", tint = Neon.TextLow, modifier = Modifier.size(18.dp))
                                    }
                                }
                            }
                        }
                    }
                }
                item { Spacer(Modifier.height(24.dp)) }
            }
        }

        countdown?.let { c -> CountdownOverlay(c, upNext?.let { r -> party.players.firstOrNull { it.id == r.playerId }?.name } ?: "") }
    }

    if (showRoulette) {
        val loser = party.standings().lastOrNull { it.sung > 0 }
        RouletteDialog(loserName = loser?.player?.name ?: "", onDismiss = { showRoulette = false })
    }
    if (confirmEnd) {
        AlertDialog(
            onDismissRequest = { confirmEnd = false },
            title = { Text("파티를 끝낼까요?") },
            text = { Text("참가자와 예약 목록이 초기화돼요. 점수 기록은 랭킹에 남아요.") },
            confirmButton = { TextButton(onClick = { confirmEnd = false; vm.endParty(); onBack() }) { Text("끝내기", color = Neon.Red) } },
            dismissButton = { TextButton(onClick = { confirmEnd = false }) { Text("계속하기") } },
        )
    }
}

@Composable
private fun UpNextCard(vm: AppViewModel, upNext: Reservation?, onStart: () -> Unit) {
    val party by vm.party.collectAsState()
    AnimatedContent(
        targetState = upNext,
        transitionSpec = { (fadeIn() + scaleIn(initialScale = 0.92f)) togetherWith fadeOut() },
        label = "upNext",
    ) { r ->
        if (r == null) {
            NeonCard(modifier = Modifier.fillMaxWidth()) {
                EmptyState(Icons.AutoMirrored.Filled.QueueMusic, "예약된 곡이 없어요", "아래에서 참가자별로 곡을 예약해 주세요")
            }
        } else {
            // 퇴장 애니메이션 중에는 이미 삭제된 참가자의 예약이 그려질 수 있다
            val p = party.players.firstOrNull { it.id == r.playerId } ?: return@AnimatedContent
            val color = Neon.PlayerColors[p.colorIndex]
            NeonCard(modifier = Modifier.fillMaxWidth(), border = color) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Text("다음 차례 · ${party.mode.label}", color = Neon.TextMid, style = MaterialTheme.typography.labelMedium)
                    Spacer(Modifier.height(10.dp))
                    PlayerAvatar(p.name, color, 72)
                    Spacer(Modifier.height(8.dp))
                    Text("${p.name}님!", style = MaterialTheme.typography.headlineMedium, color = color)
                    Text(r.songTitle, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center, maxLines = 2)
                    Spacer(Modifier.height(16.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedButton(onClick = { vm.skip(r.id) }, modifier = Modifier.height(56.dp)) {
                            Icon(Icons.Filled.SkipNext, contentDescription = null)
                            Text("넘기기")
                        }
                        GradientButton("마이크 받기", Neon.Hero, icon = Icons.Filled.Mic, onClick = onStart, modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun CountdownOverlay(count: Int, name: String) {
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.85f)), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("$name 님 준비!", style = MaterialTheme.typography.headlineMedium)
            AnimatedContent(targetState = count, transitionSpec = { scaleIn(initialScale = 2f) + fadeIn() togetherWith fadeOut() }, label = "count") {
                Text(if (it == 0) "GO!" else "$it", fontSize = 120.sp, fontWeight = FontWeight.Black, color = Neon.Pink)
            }
        }
    }
}

@Composable
private fun RouletteDialog(loserName: String, onDismiss: () -> Unit) {
    val angle = remember { Animatable(0f) }
    var result by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("벌칙 룰렛") },
        text = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                if (loserName.isNotEmpty()) Text("현재 꼴찌: $loserName", color = Neon.TextMid)
                Spacer(Modifier.height(12.dp))
                Box(
                    Modifier.size(120.dp).rotate(angle.value).clip(RoundedCornerShape(60.dp))
                        .background(Neon.Hero).border(3.dp, Neon.Gold, RoundedCornerShape(60.dp)),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.Casino, contentDescription = null, tint = Color.White, modifier = Modifier.size(56.dp)) }
                Spacer(Modifier.height(16.dp))
                Text(result ?: "돌려서 벌칙을 정해요", style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center, color = if (result != null) Neon.Gold else Neon.TextMid)
            }
        },
        confirmButton = {
            TextButton(onClick = {
                result = null
                scope.launch {
                    angle.animateTo(angle.value + 1440f + (0..359).random(), tween(1800, easing = FastOutSlowInEasing))
                    result = penalties.random()
                }
            }) { Text("돌리기") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("닫기") } },
    )
}
