package com.melodeal.ui.sing

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Headphones
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import com.melodeal.ui.theme.Pretendard
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.melodeal.ui.components.rememberMicPermission
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.melodeal.data.song.Song
import com.melodeal.scoring.Judgement
import com.melodeal.ui.appViewModel
import com.melodeal.ui.components.GradientButton
import com.melodeal.ui.theme.Neon
import kotlin.math.ceil
import kotlin.math.abs

@Composable
fun SingScreen(songId: String, playerName: String, onClose: () -> Unit, onFinished: (scoreId: Long, total: Int) -> Unit) {
    val vm = appViewModel("sing:$songId:$playerName") { SingViewModel(it, songId, playerName) }
    val s by vm.state.collectAsState()
    val context = LocalContext.current
    var askExit by remember { mutableStateOf(false) }
    val headset = remember { headsetKind(context) }

    val start = rememberMicPermission("노래를 듣고 점수를 매기려면", vm::start)

    // 앱이 백그라운드로 가면 일시정지
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_STOP) vm.pause() }
        lifecycle.addObserver(obs)
        onDispose { lifecycle.removeObserver(obs) }
    }

    LaunchedEffect(s.phase, s.savedScoreId) {
        if (s.phase == Phase.DONE) {
            val id = s.savedScoreId
            if (id != null) onFinished(id, s.savedTotal) else onClose()
        }
    }

    val playing = s.phase == Phase.PLAYING || s.phase == Phase.PAUSED
    val requestExit = { if (playing) { vm.pause(); askExit = true } else onClose() }
    BackHandler { requestExit() }

    SingContent(
        s = s,
        playerName = playerName,
        headset = headset,
        actions = SingActions(
            onClose = requestExit,
            onStart = start,
            onChangeKey = vm::changeKey,
            onGuide = vm::setGuide,
            onGuideVolume = vm::setGuideVolume,
            onPause = vm::pause,
            onResume = vm::resume,
            onStop = { vm.pause(); askExit = true },
        ),
    )

    if (askExit) {
        AlertDialog(
            onDismissRequest = { askExit = false; vm.resume() },
            title = { Text("그만 부를까요?") },
            text = { Text("지금까지 부른 부분으로 채점하거나, 점수 없이 나갈 수 있어요.") },
            confirmButton = { TextButton(onClick = { askExit = false; vm.finish(save = true) }) { Text("여기까지 채점") } },
            dismissButton = {
                Row {
                    TextButton(onClick = { askExit = false; vm.finish(save = false) }) { Text("나가기", color = Neon.Red) }
                    TextButton(onClick = { askExit = false; vm.resume() }) { Text("계속 부르기") }
                }
            },
        )
    }
}

class SingActions(
    val onClose: () -> Unit = {},
    val onStart: () -> Unit = {},
    val onChangeKey: (Int) -> Unit = {},
    val onGuide: (Boolean) -> Unit = {},
    val onGuideVolume: (Float) -> Unit = {},
    val onPause: () -> Unit = {},
    val onResume: () -> Unit = {},
    val onStop: () -> Unit = {},
)

/** 상태만으로 그리는 노래 화면 (스크린샷 테스트에서도 사용) */
@Composable
fun SingContent(s: SingUiState, playerName: String, headset: Headset, actions: SingActions) {
    Column(Modifier.fillMaxSize().background(Neon.Bg)) {
        // 상단: 곡 정보 + 실시간 점수
        Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 16.dp, top = 4.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = actions.onClose) { Icon(Icons.Filled.Close, contentDescription = "닫기") }
            Column(Modifier.weight(1f)) {
                Text(s.song?.title ?: "", style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 2.dp)) {
                    Icon(Icons.Filled.Mic, contentDescription = null, tint = Neon.Pink, modifier = Modifier.size(14.dp))
                    Text(
                        " $playerName" + if (s.keyShift != 0) " · 키 ${"%+d".format(s.keyShift)}" else "",
                        color = Neon.TextMid, style = MaterialTheme.typography.labelMedium,
                    )
                }
            }
            Column(
                Modifier.clip(RoundedCornerShape(14.dp)).background(Neon.Surface).border(1.dp, Neon.Outline, RoundedCornerShape(14.dp))
                    .padding(horizontal = 14.dp, vertical = 6.dp),
                horizontalAlignment = Alignment.End,
            ) {
                Text(if (s.song?.hasReference == false) "참고 점수" else "SCORE", color = Neon.TextLow, style = MaterialTheme.typography.labelSmall)
                Text("${s.liveScore}", style = MaterialTheme.typography.headlineMedium, color = Neon.TextHigh)
            }
        }
        if (s.durationSec > 0) {
            LinearProgressIndicator(
                progress = { (s.t / s.durationSec).toFloat().coerceIn(0f, 1f) },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).height(4.dp).clip(RoundedCornerShape(2.dp)),
                color = Neon.Pink, trackColor = Neon.SurfaceHigh, drawStopIndicator = {},
            )
        }

        // 음정 레인
        Box(Modifier.weight(1f).fillMaxWidth().padding(top = 8.dp)) {
            s.song?.let { PitchLane(it, s.t, s.trace, Modifier.fillMaxSize()) }
            JudgementPopup(s, Modifier.align(Alignment.TopCenter).padding(top = 20.dp))
            if (s.phase == Phase.PLAYING && s.t < 0) {
                val beats = s.song?.let { ceil(-s.t / it.secPerBeat).toInt() } ?: 0
                Text("$beats", fontSize = 96.sp, fontWeight = FontWeight.Black, color = Neon.Pink.copy(alpha = 0.85f), modifier = Modifier.align(Alignment.Center))
            }
            if (s.phase == Phase.PREPARING || s.phase == Phase.LOADING || s.phase == Phase.SAVING) {
                Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator(color = Neon.Pink)
                    Text(if (s.phase == Phase.SAVING) "채점 중…" else "반주 준비 중…", color = Neon.TextMid, modifier = Modifier.padding(top = 12.dp))
                }
            }
            if (s.phase == Phase.ERROR) {
                Text(s.error ?: "오류가 발생했어요", color = Neon.Red, textAlign = TextAlign.Center, modifier = Modifier.align(Alignment.Center).padding(24.dp))
            }
        }

        // 가사
        s.song?.let { Lyrics(it, s.t, Modifier.fillMaxWidth().heightIn(min = 128.dp).padding(horizontal = 20.dp, vertical = 12.dp)) }

        // 하단 컨트롤
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)).background(Neon.Surface)
                .padding(horizontal = 20.dp, vertical = 16.dp),
        ) {
            when (s.phase) {
                Phase.READY -> ReadyControls(s, headset, actions)
                Phase.PLAYING, Phase.PAUSED -> PlayingControls(s, actions)
                else -> Spacer(Modifier.height(56.dp))
            }
        }
    }
}

enum class Headset { NONE, WIRED, BLUETOOTH }

private fun headsetKind(context: Context): Headset {
    val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val types = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).map { it.type }
    return when {
        types.any { it == AudioDeviceInfo.TYPE_WIRED_HEADSET || it == AudioDeviceInfo.TYPE_WIRED_HEADPHONES || it == AudioDeviceInfo.TYPE_USB_HEADSET } -> Headset.WIRED
        types.any { it == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP || it == AudioDeviceInfo.TYPE_BLE_HEADSET } -> Headset.BLUETOOTH
        else -> Headset.NONE
    }
}

@Composable
private fun ReadyControls(s: SingUiState, headset: Headset, actions: SingActions) {
    val song = s.song ?: return
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        val tip = when (headset) {
            Headset.NONE -> "이어폰을 끼면 반주 소리가 마이크에 섞이지 않아 채점이 정확해져요"
            Headset.BLUETOOTH -> "블루투스 이어폰은 지연이 커요. 설정에서 지연 보정을 해 주세요"
            Headset.WIRED -> null
        }
        tip?.let {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Neon.Cyan.copy(alpha = 0.1f)).padding(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Headphones, contentDescription = null, tint = Neon.Cyan, modifier = Modifier.size(18.dp))
                Text(it, color = Neon.Cyan, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(start = 8.dp))
            }
        }
        if (song.hasReference) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("키", style = MaterialTheme.typography.titleMedium, modifier = Modifier.width(56.dp))
                FilledTonalIconButton(onClick = { actions.onChangeKey(-1) }) { Icon(Icons.Filled.Remove, contentDescription = "키 내리기") }
                Text("%+d".format(s.keyShift), style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center, modifier = Modifier.width(56.dp))
                FilledTonalIconButton(onClick = { actions.onChangeKey(1) }) { Icon(Icons.Filled.Add, contentDescription = "키 올리기") }
                Spacer(Modifier.weight(1f))
                Text("가이드", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(end = 8.dp))
                Switch(checked = s.guideOn, onCheckedChange = actions.onGuide)
            }
        }
        GradientButton("노래 시작", Neon.Hero, icon = Icons.Filled.Mic, onClick = actions.onStart, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun PlayingControls(s: SingUiState, actions: SingActions) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        FilledIconButton(
            onClick = { if (s.phase == Phase.PLAYING) actions.onPause() else actions.onResume() },
            modifier = Modifier.size(56.dp),
            colors = IconButtonDefaults.filledIconButtonColors(containerColor = Neon.Pink),
        ) {
            Icon(if (s.phase == Phase.PLAYING) Icons.Filled.Pause else Icons.Filled.PlayArrow, contentDescription = if (s.phase == Phase.PLAYING) "일시정지" else "계속")
        }
        Spacer(Modifier.width(12.dp))
        if (s.song?.hasReference == true) {
            Column(Modifier.weight(1f)) {
                Text("가이드 멜로디 ${if (s.guideOn) "${(s.guideVolume * 100).toInt()}%" else "꺼짐"}", color = Neon.TextMid, style = MaterialTheme.typography.labelMedium)
                Slider(value = if (s.guideOn) s.guideVolume else 0f, onValueChange = { actions.onGuide(it > 0f); if (it > 0f) actions.onGuideVolume(it) })
            }
        } else {
            Spacer(Modifier.weight(1f))
        }
        Spacer(Modifier.width(12.dp))
        FilledTonalIconButton(onClick = actions.onStop, modifier = Modifier.size(48.dp)) { Icon(Icons.Filled.Stop, contentDescription = "그만 부르기") }
    }
}

@Composable
private fun JudgementPopup(s: SingUiState, modifier: Modifier) {
    AnimatedContent(
        targetState = s.judgementSeq,
        transitionSpec = { (scaleIn(tween(150), initialScale = 1.6f) + fadeIn(tween(100))) togetherWith fadeOut(tween(300)) },
        label = "judge",
        modifier = modifier,
    ) { seq ->
        val j = s.judgement
        if (seq > 0 && j != null) {
            val color = when (j) {
                Judgement.PERFECT -> Neon.Gold
                Judgement.GREAT -> Neon.Lime
                Judgement.GOOD -> Neon.Cyan
                Judgement.MISS -> Neon.TextLow
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(j.label, color = color, fontSize = 28.sp, fontWeight = FontWeight.Black)
                if (s.combo >= 3) Text("${s.combo} COMBO", color = Neon.Pink, style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

/** 노래방 화면처럼 시간에 따라 흘러가는 음정 막대 + 내 목소리 궤적 */
@Composable
private fun PitchLane(song: Song, t: Double, trace: List<TracePoint>, modifier: Modifier) {
    val measurer = rememberTextMeasurer()
    val range = remember(song) {
        if (song.hasReference) {
            val lo = song.notes.minOf { it.midi } - 3
            val hi = song.notes.maxOf { it.midi } + 3
            lo.toDouble() to maxOf(hi, lo + 14).toDouble()
        } else {
            45.0 to 80.0
        }
    }
    val before = 2.0
    val after = 3.6
    Canvas(modifier) {
        val (lo, hi) = range
        val playX = size.width * before.toFloat() / (before + after).toFloat()
        fun x(time: Double) = playX + ((time - t) / (before + after) * size.width).toFloat()
        fun y(midi: Double) = (size.height * (1 - (midi - lo) / (hi - lo))).toFloat()
        val rowH = (size.height / (hi - lo)).toFloat()

        // 옥타브(도) 기준선
        for (m in lo.toInt()..hi.toInt()) {
            if (m % 12 == 0) drawLine(Neon.Outline, Offset(0f, y(m.toDouble())), Offset(size.width, y(m.toDouble())), 1f)
        }
        // 이미 지나간 구간은 살짝 어둡게
        drawRect(Color.Black.copy(alpha = 0.22f), size = Size(playX, size.height))

        // 목표 음
        for (n in song.notes) {
            if (n.endSec < t - before || n.startSec > t + after) continue
            val active = t >= n.startSec && t < n.endSec
            val past = n.endSec <= t
            val left = x(n.startSec)
            val w = (x(n.endSec) - left - 3f).coerceAtLeast(4f)
            // 반음 칸이 넓어도 막대는 얇고 길게: 둥근 "방울"이 아닌 노래방식 음정 바
            val h = minOf(rowH * 0.8f, 13.dp.toPx())
            val top = y(n.midi.toDouble()) - h / 2
            val r = CornerRadius(h / 2)
            when {
                active -> {
                    drawRoundRect(Neon.Pink.copy(alpha = 0.22f), Offset(left - 5f, top - 5f), Size(w + 10f, h + 10f), CornerRadius(h))
                    drawRoundRect(Brush.horizontalGradient(listOf(Neon.Pink, Neon.Violet), startX = left, endX = left + w), Offset(left, top), Size(w, h), r)
                }
                past -> drawRoundRect(Neon.SurfaceHigh, Offset(left, top), Size(w, h), r)
                else -> {
                    drawRoundRect(Neon.Cyan.copy(alpha = 0.16f), Offset(left, top), Size(w, h), r)
                    drawRoundRect(Neon.Cyan.copy(alpha = 0.7f), Offset(left, top), Size(w, h), r, style = Stroke(2f))
                }
            }
            // drawText는 남은 폭이 음수면 예외를 던지므로 화면 안쪽일 때만 그린다
            if (n.lyric.isNotEmpty() && w > 18f && left + 4f < size.width - 48f && top - 40f < size.height) {
                drawText(measurer, n.lyric, Offset(left + 2f, top - 40f), TextStyle(color = if (past) Neon.TextLow else Neon.TextMid, fontSize = 12.sp, fontFamily = Pretendard))
            }
        }

        // 내 목소리 궤적: 이어진 점은 선으로 연결해 부드럽게
        val visible = trace.filter { x(it.t) in 0f..(playX + 4f) }
        visible.zipWithNext().forEach { (a, b) ->
            val color = if (b.hit) Neon.Lime else Neon.Gold.copy(alpha = 0.75f)
            if (b.t - a.t < 0.07 && abs(b.midi - a.midi) < 1.5) {
                drawLine(color, Offset(x(a.t), y(a.midi)), Offset(x(b.t), y(b.midi)), strokeWidth = 7f, cap = StrokeCap.Round)
            } else {
                drawCircle(color, radius = 3.5f, center = Offset(x(b.t), y(b.midi)))
            }
        }

        // 재생선
        drawRect(
            Brush.horizontalGradient(listOf(Color.Transparent, Color.White.copy(alpha = 0.06f)), startX = playX - 40f, endX = playX),
            topLeft = Offset(playX - 40f, 0f), size = Size(40f, size.height),
        )
        drawLine(Color.White.copy(alpha = 0.75f), Offset(playX, 0f), Offset(playX, size.height), 2f)
        trace.lastOrNull()?.takeIf { t - it.t < 0.25 }?.let {
            val c = if (it.hit) Neon.Lime else Neon.Gold
            drawCircle(c.copy(alpha = 0.25f), radius = 20f, center = Offset(playX, y(it.midi)))
            drawCircle(c, radius = 9f, center = Offset(playX, y(it.midi)))
            drawCircle(Color.White, radius = 3.5f, center = Offset(playX, y(it.midi)))
        }
    }
}

/** 지금 부를 줄 + 다음 줄. 부른 음절은 색이 바뀐다. */
@Composable
private fun Lyrics(song: Song, t: Double, modifier: Modifier) {
    if (song.lines.isEmpty()) {
        Box(modifier, contentAlignment = Alignment.Center) {
            Text("가사 없이 부르는 곡이에요", color = Neon.TextLow)
        }
        return
    }
    val idx = song.lines.indexOfFirst { it.endSec > t }.let { if (it < 0) song.lines.lastIndex else it }
    val current = song.lines[idx]
    val next = song.lines.getOrNull(idx + 1)
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text(
            buildAnnotatedString {
                current.syllables.forEach { syl ->
                    withStyle(SpanStyle(color = if (t >= syl.startSec) Neon.Pink else Neon.TextHigh)) { append(syl.text) }
                }
            },
            fontSize = 26.sp, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center, lineHeight = 34.sp,
        )
        Spacer(Modifier.height(8.dp))
        Text(next?.text ?: "", fontSize = 18.sp, color = Neon.TextLow, textAlign = TextAlign.Center)
    }
}
