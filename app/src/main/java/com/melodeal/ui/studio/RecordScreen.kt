package com.melodeal.ui.studio

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Headphones
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.melodeal.ui.components.rememberMicPermission
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.melodeal.data.song.Genre
import com.melodeal.studio.PitchFrame
import com.melodeal.ui.appViewModel
import com.melodeal.ui.components.NeonCard
import com.melodeal.ui.components.SectionTitle
import com.melodeal.ui.components.SingTopBar
import com.melodeal.ui.theme.Neon
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor

@Composable
fun RecordScreen(onBack: () -> Unit, onCreated: (Long) -> Unit) {
    val vm = appViewModel("record") { RecordViewModel(it) }
    val s by vm.state.collectAsState()
    val context = LocalContext.current
    val start = rememberMicPermission("흥얼거린 멜로디를 악보로 바꾸려면", vm::start)
    LaunchedEffect(s.createdId) { s.createdId?.let(onCreated) }
    BackHandler { if (s.phase == RecPhase.RECORDING) vm.cancel() else onBack() }

    RecordContent(
        s = s,
        onBack = { if (s.phase == RecPhase.RECORDING) vm.cancel() else onBack() },
        onGenre = vm::setGenre, onBpm = vm::setBpm, onMeter = vm::setMeter,
        onStart = start, onStop = vm::stop, onCancel = vm::cancel,
    )

    s.message?.let { msg ->
        AlertDialog(
            onDismissRequest = vm::dismissMessage,
            title = { Text("다시 불러 볼까요?") },
            text = { Text(msg) },
            confirmButton = { TextButton(onClick = vm::dismissMessage) { Text("확인") } },
        )
    }
}

/** 상태만으로 그리는 녹음 화면 (스크린샷 테스트에서도 사용) */
@Composable
fun RecordContent(
    s: RecordUiState,
    onBack: () -> Unit = {},
    onGenre: (Genre) -> Unit = {},
    onBpm: (Int) -> Unit = {},
    onMeter: (Int) -> Unit = {},
    onStart: () -> Unit = {},
    onStop: () -> Unit = {},
    onCancel: () -> Unit = {},
) {
    Column(Modifier.fillMaxSize()) {
        SingTopBar(if (s.phase == RecPhase.SETUP) "새 노래 만들기" else "흥얼거리는 중", onBack)
        when (s.phase) {
            RecPhase.SETUP -> Setup(s, onGenre, onBpm, onMeter, onStart)
            RecPhase.RECORDING -> Recording(s, onStop, onCancel)
            RecPhase.PROCESSING, RecPhase.DONE -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Neon.Pink)
                    Text("멜로디를 악보로 옮기는 중…", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 16.dp))
                    Text("음 높이를 정리하고 어울리는 코드를 붙이고 있어요", color = Neon.TextMid, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
private fun Setup(s: RecordUiState, onGenre: (Genre) -> Unit, onBpm: (Int) -> Unit, onMeter: (Int) -> Unit, onStart: () -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp)) {
        NeonCard(modifier = Modifier.fillMaxWidth(), background = Neon.SurfaceHigh) {
            Column {
                Text("떠오르는 멜로디를 흥얼거려 보세요", style = MaterialTheme.typography.titleMedium)
                Text(
                    "메트로놈 ${s.beatsPerBar}번이 울린 뒤 \"라라라\"나 \"음~\"으로 불러요. 최대 ${s.maxBars}마디까지 녹음되고, 끝나면 악보와 반주가 자동으로 만들어져요.",
                    color = Neon.TextMid, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 6.dp),
                )
            }
        }

        SectionTitle("장르", Modifier.padding(top = 8.dp))
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Genre.entries.chunked(2).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { g -> GenreCard(g, g == s.genre, Modifier.weight(1f)) { onGenre(g) } }
                }
            }
        }

        SectionTitle("빠르기 · 박자", Modifier.padding(top = 8.dp))
        NeonCard(modifier = Modifier.fillMaxWidth()) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    FilledTonalIconButton(onClick = { onBpm(s.bpm - 2) }) { Icon(Icons.Filled.Remove, contentDescription = "느리게") }
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("${s.bpm}", style = MaterialTheme.typography.headlineLarge)
                        Text("BPM · ${tempoName(s.bpm)}", color = Neon.TextMid, style = MaterialTheme.typography.labelMedium)
                    }
                    FilledTonalIconButton(onClick = { onBpm(s.bpm + 2) }) { Icon(Icons.Filled.Add, contentDescription = "빠르게") }
                }
                Slider(value = s.bpm.toFloat(), onValueChange = { onBpm(it.toInt()) }, valueRange = 60f..160f)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(4 to "4/4 박자", 3 to "3/4 박자 (왈츠)").forEach { (b, label) ->
                        val sel = s.beatsPerBar == b
                        Text(
                            label,
                            textAlign = TextAlign.Center,
                            style = MaterialTheme.typography.labelLarge,
                            color = if (sel) Color.White else Neon.TextMid,
                            modifier = Modifier.weight(1f).clip(RoundedCornerShape(12.dp))
                                .background(if (sel) Neon.Violet.copy(alpha = 0.35f) else Neon.SurfaceHigh)
                                .border(1.dp, if (sel) Neon.Violet else Color.Transparent, RoundedCornerShape(12.dp))
                                .clickable { onMeter(b) }.padding(vertical = 12.dp),
                        )
                    }
                }
            }
        }

        Row(
            Modifier.fillMaxWidth().padding(top = 16.dp).clip(RoundedCornerShape(12.dp)).background(Neon.Cyan.copy(alpha = 0.08f)).padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Headphones, contentDescription = null, tint = Neon.Cyan, modifier = Modifier.size(18.dp))
            Text("이어폰을 끼면 메트로놈 소리가 녹음에 섞이지 않아요", color = Neon.Cyan, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(start = 8.dp))
        }

        Box(Modifier.fillMaxWidth().padding(vertical = 28.dp), contentAlignment = Alignment.Center) {
            RecordButton(recording = false, onClick = onStart)
        }
    }
}

private fun tempoName(bpm: Int) = when {
    bpm < 76 -> "느리게"
    bpm < 96 -> "보통 느리게"
    bpm < 116 -> "보통"
    bpm < 136 -> "빠르게"
    else -> "아주 빠르게"
}

@Composable
private fun GenreCard(g: Genre, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val brush = when (g) {
        Genre.BALLAD -> Brush.linearGradient(listOf(Color(0xFF6A5BFF), Color(0xFFB18CFF)))
        Genre.POP -> Neon.Hero
        Genre.DANCE -> Neon.Cool
        Genre.ACOUSTIC -> Neon.Warm
    }
    Column(
        modifier
            .clip(RoundedCornerShape(18.dp))
            .background(if (selected) brush else Brush.linearGradient(listOf(Neon.Surface, Neon.Surface)))
            .border(1.dp, if (selected) Color.White.copy(alpha = 0.25f) else Neon.Outline, RoundedCornerShape(18.dp))
            .clickable(onClick = onClick)
            .padding(14.dp),
    ) {
        Text(g.label, style = MaterialTheme.typography.titleMedium, color = Color.White)
        Text(g.description, style = MaterialTheme.typography.bodySmall, color = if (selected) Color.White.copy(alpha = 0.85f) else Neon.TextMid)
    }
}

@Composable
private fun RecordButton(recording: Boolean, onClick: () -> Unit) {
    val pulse by rememberInfiniteTransition(label = "rec").animateFloat(
        1f, if (recording) 1.12f else 1.05f, infiniteRepeatable(tween(700), RepeatMode.Reverse), label = "rec",
    )
    Box(contentAlignment = Alignment.Center) {
        Box(Modifier.size(112.dp).scale(pulse).clip(CircleShape).background(Neon.Pink.copy(alpha = 0.18f)))
        Box(
            Modifier.size(84.dp).clip(CircleShape).background(if (recording) Brush.linearGradient(listOf(Neon.Red, Neon.Red)) else Neon.Hero)
                .border(2.dp, Color.White.copy(alpha = 0.3f), CircleShape).clickable(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (recording) Icons.Filled.Stop else Icons.Filled.Mic,
                contentDescription = if (recording) "녹음 끝내기" else "녹음 시작",
                tint = Color.White, modifier = Modifier.size(38.dp),
            )
        }
    }
}

@Composable
private fun Recording(s: RecordUiState, onStop: () -> Unit, onCancel: () -> Unit) {
    val bar = floor(s.beat / s.beatsPerBar).toInt() + 1
    Column(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            if (s.t < 0) {
                Text("준비…", color = Neon.TextMid, style = MaterialTheme.typography.titleMedium)
                Text("${ceil(-s.beat).toInt()}", fontSize = 64.sp, fontWeight = FontWeight.ExtraBold, color = Neon.Pink)
            } else {
                Text("${bar.coerceAtMost(s.maxBars)} / ${s.maxBars} 마디", color = Neon.TextMid, style = MaterialTheme.typography.titleMedium)
                Text(
                    "%d:%02d".format(s.t.toInt() / 60, s.t.toInt() % 60),
                    fontSize = 64.sp, fontWeight = FontWeight.ExtraBold, color = Neon.TextHigh,
                )
            }
            LevelMeter(s.level)
        }
        HumLane(s, Modifier.weight(1f).fillMaxWidth().padding(vertical = 12.dp))
        Row(
            Modifier.fillMaxWidth().padding(bottom = 28.dp, start = 20.dp, end = 20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onCancel, modifier = Modifier.weight(1f)) { Text("처음부터", color = Neon.TextMid) }
            RecordButton(recording = true, onClick = onStop)
            Text("다 불렀으면\n눌러 주세요", color = Neon.TextLow, style = MaterialTheme.typography.labelMedium, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun LevelMeter(level: Float) {
    Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.CenterVertically) {
        repeat(16) { i ->
            val on = level * 16 > i
            Box(
                Modifier.width(6.dp).height((8 + (i % 4) * 2).dp).clip(RoundedCornerShape(3.dp))
                    .background(if (on) (if (i > 12) Neon.Gold else Neon.Lime) else Neon.SurfaceHigh),
            )
        }
    }
}

/** 실시간 허밍 궤적: 박/마디 격자 위로 내 목소리 음높이가 흘러간다 */
@Composable
private fun HumLane(s: RecordUiState, modifier: Modifier) {
    val voiced = s.trace.mapNotNull { it.midi }
    val lo = (voiced.minOrNull()?.minus(4) ?: 50.0).coerceAtMost(55.0)
    val hi = maxOf(voiced.maxOrNull()?.plus(4) ?: 74.0, lo + 18)
    Canvas(modifier.background(Neon.Surface)) {
        val window = 6.0
        val nowX = size.width * 0.75f
        fun x(t: Double) = nowX - ((s.t - t) / window * size.width).toFloat()
        fun y(m: Double) = (size.height * (1 - (m - lo) / (hi - lo))).toFloat()
        val spb = s.secPerBeat
        // 격자
        var b = floor((s.t - window) / spb).toInt()
        while (b * spb < s.t + window * 0.4) {
            val gx = x(b * spb)
            val barLine = b % s.beatsPerBar == 0
            drawLine(if (barLine) Neon.OutlineStrong else Neon.Outline.copy(alpha = 0.5f), Offset(gx, 0f), Offset(gx, size.height), if (barLine) 2f else 1f)
            b++
        }
        // 궤적
        val pts = s.trace.filter { it.t > s.t - window }
        pts.zipWithNext().forEach { (a: PitchFrame, c: PitchFrame) ->
            val am = a.midi
            val cm = c.midi
            if (am != null && cm != null && c.t - a.t < 0.07 && abs(cm - am) < 2) {
                drawLine(Neon.Pink, Offset(x(a.t), y(am)), Offset(x(c.t), y(cm)), 8f, cap = StrokeCap.Round)
            }
        }
        drawLine(Color.White.copy(alpha = 0.7f), Offset(nowX, 0f), Offset(nowX, size.height), 2f)
        pts.lastOrNull()?.midi?.let {
            drawCircle(Neon.Pink.copy(alpha = 0.3f), 22f, Offset(nowX, y(it)))
            drawCircle(Color.White, 8f, Offset(nowX, y(it)))
        }
    }
}
