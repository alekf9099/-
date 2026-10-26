package com.melodeal.ui.community

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.RadioButtonChecked
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.melodeal.audio.Synth
import com.melodeal.audio.SynthPlayer
import com.melodeal.community.CommunityException
import com.melodeal.community.ReportReason
import com.melodeal.community.Track
import com.melodeal.studio.Composition
import com.melodeal.ui.app
import com.melodeal.ui.components.BrandMark
import com.melodeal.ui.components.GradientButton
import com.melodeal.ui.theme.Neon
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 피드·상세·프로필에서 함께 쓰는 곡 미리듣기. 한 번에 한 곡만 재생한다.
 * 곡은 음원 파일이 아니라 악보 데이터라서, 누를 때 바로 합성해 재생한다.
 */
object PreviewPlayer {
    data class State(val trackId: String? = null, val loading: Boolean = false, val progress: Float = 0f)

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state
    private var player: SynthPlayer? = null
    private var job: Job? = null

    fun toggle(track: Track, onStarted: () -> Unit = {}, onCompleted: () -> Unit = {}) {
        if (_state.value.trackId == track.id) stop() else play(track.id, track.composition, onStarted, onCompleted)
    }

    /** [onCompleted]: 끝까지 들었을 때 (차트 점수에 반영) */
    fun play(id: String, comp: Composition, onStarted: () -> Unit = {}, onCompleted: () -> Unit = {}) {
        stop()
        _state.value = State(id, loading = true)
        job = scope.launch {
            val rendered = withContext(Dispatchers.Default) { Synth.render(comp.toSong(id)) }
            val p = SynthPlayer(rendered).also { it.guideVolume = 0.8f }
            player = p
            p.start()
            onStarted()
            _state.value = State(id)
            val total = comp.durationSec
            while (isActive) {
                delay(100)
                _state.value = State(id, progress = (p.positionSec / total).toFloat().coerceIn(0f, 1f))
                if (p.isFinished) { onCompleted(); break }
            }
            stop()
        }
    }

    fun stop() {
        job?.cancel()
        player?.release()
        player = null
        _state.value = State()
    }
}

@Composable
fun PlayButton(track: Track, size: Dp = 44.dp, onStarted: () -> Unit = {}, onCompleted: () -> Unit = {}) {
    val st by PreviewPlayer.state.collectAsState()
    val mine = st.trackId == track.id
    Box(
        Modifier.size(size).clip(CircleShape).background(if (mine) Neon.Hero else androidx.compose.ui.graphics.Brush.linearGradient(listOf(Neon.SurfaceHigh, Neon.SurfaceHigh)))
            .clickable { PreviewPlayer.toggle(track, onStarted, onCompleted) },
        contentAlignment = Alignment.Center,
    ) {
        when {
            mine && st.loading -> CircularProgressIndicator(Modifier.size(size * 0.45f), color = Color.White, strokeWidth = 2.dp)
            mine -> Icon(Icons.Filled.Pause, contentDescription = "멈추기", tint = Color.White)
            else -> Icon(Icons.Filled.PlayArrow, contentDescription = "듣기", tint = Neon.Pink)
        }
    }
}

/** 멜로디 모양 미니 그래프 (재생 중이면 진행 부분을 밝게) */
@Composable
fun MelodyShape(comp: Composition, modifier: Modifier, progress: Float? = null, color: Color = Neon.Pink) {
    Canvas(modifier) {
        val notes = comp.notes
        if (notes.isEmpty()) return@Canvas
        val lo = notes.minOf { it.midi } - 1
        val hi = notes.maxOf { it.midi } + 1
        val total = notes.maxOf { it.endBeat }
        val h = (size.height / (hi - lo + 1) * 1.6f).coerceIn(6f, 14f)
        notes.forEach { n ->
            val x = (n.startBeat / total * size.width).toFloat()
            val w = (n.beats / total * size.width).toFloat().coerceAtLeast(2f)
            val y = size.height * (1f - (n.midi - lo).toFloat() / (hi - lo))
            val played = progress != null && (n.startBeat / total) <= progress
            drawRoundRect(if (progress == null || played) color else color.copy(alpha = 0.35f), Offset(x, y - h / 2), Size(w - 1.5f, h), CornerRadius(h / 2))
        }
        if (progress != null && progress > 0f) drawLine(Color.White, Offset(size.width * progress, 0f), Offset(size.width * progress, size.height), 2f)
    }
}

@Composable
fun StarRating(value: Int?, onRate: ((Int) -> Unit)?, size: Dp = 28.dp) {
    Row {
        for (i in 1..5) {
            val on = value != null && i <= value
            Icon(
                if (on) Icons.Filled.Star else Icons.Filled.StarBorder,
                contentDescription = "별 ${i}개",
                tint = if (on) Neon.Gold else Neon.TextLow,
                modifier = Modifier.size(size).let { m -> if (onRate != null) m.clip(CircleShape).clickable { onRate(i) } else m },
            )
        }
    }
}

fun relativeTime(epochMs: Long, now: Long = System.currentTimeMillis()): String {
    val d = (now - epochMs) / 1000
    return when {
        d < 60 -> "방금"
        d < 3600 -> "${d / 60}분 전"
        d < 86400 -> "${d / 3600}시간 전"
        d < 86400 * 7 -> "${d / 86400}일 전"
        else -> java.text.SimpleDateFormat("M월 d일", java.util.Locale.KOREA).format(java.util.Date(epochMs))
    }
}

/** 체험 모드 안내 띠 */
@Composable
fun DemoBanner(modifier: Modifier = Modifier) {
    if (!app().community.isDemo) return
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Neon.Gold.copy(alpha = 0.1f)).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Info, contentDescription = null, tint = Neon.Gold, modifier = Modifier.size(16.dp))
        Text(
            "체험 모드: 예시 사용자와 곡이에요. 서버를 연결하면 실제 사람들과 공유·대화할 수 있어요.",
            color = Neon.Gold, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(start = 8.dp),
        )
    }
}

@Composable
fun ReportDialog(title: String, onDismiss: () -> Unit, onSubmit: (ReportReason, String) -> Unit) {
    var reason by remember { mutableStateOf<ReportReason?>(null) }
    var detail by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column {
                ReportReason.entries.forEach { r ->
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { reason = r }.padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            if (reason == r) Icons.Filled.RadioButtonChecked else Icons.Filled.RadioButtonUnchecked,
                            contentDescription = null, tint = if (reason == r) Neon.Pink else Neon.TextLow,
                        )
                        Text(r.label, modifier = Modifier.padding(start = 10.dp))
                    }
                }
                OutlinedTextField(detail, { detail = it.take(300) }, placeholder = { Text("자세한 내용 (선택)") }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                Text("신고는 익명으로 처리되고, 여러 번 신고된 콘텐츠는 자동으로 가려져요.", color = Neon.TextLow, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 6.dp))
            }
        },
        confirmButton = { TextButton(enabled = reason != null, onClick = { onSubmit(reason!!, detail) }) { Text("신고하기", color = Neon.Red) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("취소") } },
    )
}

/**
 * 커뮤니티 탭 공통 관문: 로그인 → 닉네임이 없으면 닉네임 정하기 화면, 있으면 content.
 */
@Composable
fun CommunityGate(requireProfile: Boolean = true, content: @Composable () -> Unit) {
    val community = app().community
    val me by community.me.collectAsState()
    var checked by remember { mutableStateOf(me != null) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    androidx.compose.runtime.LaunchedEffect(Unit) {
        if (me == null) {
            runCatching { community.signIn() }.onFailure { error = it.message }
            checked = true
        }
    }
    when {
        me != null -> content()
        !checked -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Neon.Pink) }
        error != null -> Box(Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(error!!, color = Neon.TextMid, textAlign = TextAlign.Center)
                TextButton(onClick = {
                    error = null; checked = false
                    scope.launch { runCatching { community.signIn() }.onFailure { error = it.message }; checked = true }
                }) { Text("다시 시도") }
            }
        }
        !requireProfile -> content()
        else -> NicknameSetup()
    }
}

/**
 * 둘러보기는 닉네임 없이 하고, 좋아요·추천·팔로우처럼 활동할 때만 닉네임을 묻는다.
 * 돌려준 함수로 감싼 동작은 닉네임이 있으면 바로, 없으면 닉네임을 정한 뒤 실행된다.
 */
@Composable
fun rememberProfileGuard(): (() -> Unit) -> Unit {
    val community = app().community
    var pending by remember { mutableStateOf<(() -> Unit)?>(null) }
    pending?.let { action ->
        var nickname by remember { mutableStateOf("") }
        var error by remember { mutableStateOf<String?>(null) }
        val scope = rememberCoroutineScope()
        AlertDialog(
            onDismissRequest = { pending = null },
            title = { Text("닉네임을 정해 주세요") },
            text = {
                Column {
                    Text("좋아요·추천·팔로우는 닉네임을 정한 뒤 할 수 있어요. 언제든 MY에서 바꿀 수 있어요.", color = Neon.TextMid, style = MaterialTheme.typography.bodySmall)
                    OutlinedTextField(
                        nickname, { nickname = it.take(12); error = null }, label = { Text("닉네임 (2~12자)") }, singleLine = true,
                        isError = error != null, supportingText = { error?.let { Text(it) } }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    )
                }
            },
            confirmButton = {
                TextButton(enabled = nickname.trim().length >= 2, onClick = {
                    scope.launch {
                        runCatching { community.saveProfile(nickname, "") }
                            .onSuccess { pending = null; action() }
                            .onFailure { error = (it as? CommunityException)?.message ?: it.message }
                    }
                }) { Text("시작하기") }
            },
            dismissButton = { TextButton(onClick = { pending = null }) { Text("나중에") } },
        )
    }
    return { action -> if (community.me.value != null) action() else pending = action }
}

@Composable
private fun NicknameSetup() {
    val community = app().community
    var nickname by remember { mutableStateOf("") }
    var bio by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        BrandMark(72.dp)
        Text("멜로딜에 오신 걸 환영해요", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(top = 16.dp))
        Text(
            "만든 노래를 공유하고, 다른 사람의 노래를 듣고 평가하고, 제작자와 대화해 보세요. 먼저 활동할 닉네임을 정해 주세요.",
            color = Neon.TextMid, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 8.dp, bottom = 20.dp),
        )
        OutlinedTextField(
            nickname, { nickname = it.take(12); error = null }, label = { Text("닉네임 (2~12자, 한글·영문·숫자)") }, singleLine = true,
            isError = error != null, supportingText = { error?.let { Text(it) } }, modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(bio, { bio = it.take(80) }, label = { Text("한 줄 소개 (선택)") }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 4.dp))
        Spacer(Modifier.height(20.dp))
        GradientButton(if (saving) "저장 중…" else "시작하기", Neon.Hero, enabled = !saving && nickname.trim().length >= 2, modifier = Modifier.fillMaxWidth()) {
            saving = true
            scope.launch {
                runCatching { community.saveProfile(nickname, bio) }.onFailure { error = (it as? CommunityException)?.message ?: it.message }
                saving = false
            }
        }
        DemoBanner(Modifier.padding(top = 16.dp))
    }
}
