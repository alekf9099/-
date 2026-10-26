package com.melodeal.ui.studio

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.melodeal.studio.Composition
import com.melodeal.studio.LyricsFitter
import com.melodeal.studio.NOTE_NAMES
import com.melodeal.studio.pitchClass
import com.melodeal.ui.theme.Neon
import com.melodeal.ui.theme.Pretendard

private val BEAT_W = 44.dp
private val KEYS_W = 40.dp

/**
 * 피아노 롤: 가로 = 시간(박), 세로 = 음높이. 음계에 속한 줄은 밝게 칠해 어디에 음을 둬야 할지 보여준다.
 * 빈 칸을 누르면 음표 추가, 음표를 누르면 선택. 아래 줄은 코드 칸.
 */
@Composable
fun PianoRoll(
    comp: Composition,
    selected: Int?,
    playheadBeat: Double?,
    onTapNote: (Int) -> Unit,
    onTapEmpty: (beat: Double, midi: Int) -> Unit,
    onTapChord: (slot: Int) -> Unit,
    height: Dp = 300.dp,
) {
    val notes = comp.notes
    val lo = minOf(notes.minOfOrNull { it.midi } ?: 60, 60) - 3
    val hi = maxOf(notes.maxOfOrNull { it.midi } ?: 72, lo + 16) + 3
    val rows = hi - lo + 1
    val beats = comp.totalBeats + comp.beatsPerBar // 뒤에 한 마디 여유: 음을 이어 붙일 수 있게
    val scroll = rememberScrollState()
    val density = LocalDensity.current
    val measurer = rememberTextMeasurer()
    val lyrics = remember(comp.lyrics) { LyricsFitter.split(comp.lyrics) }

    // 미리듣기 중엔 재생 위치를 따라 스크롤
    LaunchedEffect(playheadBeat?.let { (it / comp.beatsPerBar).toInt() }) {
        val b = playheadBeat ?: return@LaunchedEffect
        val px = with(density) { (BEAT_W * b.toFloat()).toPx() }.toInt()
        if (px > scroll.value + scroll.viewportSize * 0.7 || px < scroll.value) scroll.animateScrollTo((px - scroll.viewportSize / 4).coerceAtLeast(0))
    }

    Row(Modifier.clip(RoundedCornerShape(20.dp)).background(Neon.Surface).border(1.dp, Neon.Outline, RoundedCornerShape(20.dp))) {
        // 왼쪽 건반 이름
        Column(Modifier.width(KEYS_W).height(height + 44.dp)) {
            Canvas(Modifier.width(KEYS_W).height(height)) {
                val rh = size.height / rows
                for (r in 0 until rows) {
                    val midi = hi - r
                    val inScale = comp.key.inScale(midi)
                    drawRect(if (inScale) Neon.SurfaceHigh else Neon.Bg, Offset(0f, r * rh), Size(size.width, rh - 1f))
                    if (pitchClass(midi) == 0 || midi == hi) {
                        drawText(measurer, NOTE_NAMES[pitchClass(midi)] + (midi / 12 - 1), Offset(6f, (r * rh + rh / 2 - 16f).coerceIn(0f, size.height - 32f)), TextStyle(color = Neon.TextMid, fontSize = 10.sp, fontFamily = Pretendard))
                    }
                }
            }
            Box(Modifier.height(44.dp).width(KEYS_W), contentAlignment = Alignment.Center) {
                Text("코드", color = Neon.TextLow, style = MaterialTheme.typography.labelSmall)
            }
        }
        Box(Modifier.horizontalScroll(scroll)) {
            Column {
                Canvas(
                    Modifier.width(BEAT_W * beats).height(height).pointerInput(comp, selected) {
                        detectTapGestures { pos ->
                            val beatPx = BEAT_W.toPx()
                            val rh = size.height.toFloat() / rows
                            val beat = pos.x / beatPx
                            val midi = hi - (pos.y / rh).toInt()
                            val hit = notes.indexOfFirst { beat >= it.startBeat && beat < it.endBeat && it.midi == midi }
                                .takeIf { it >= 0 }
                                ?: notes.indexOfFirst { beat >= it.startBeat && beat < it.endBeat && kotlin.math.abs(it.midi - midi) <= 1 }
                            when {
                                hit >= 0 -> onTapNote(hit)
                                selected != null -> onTapNote(-1)
                                else -> onTapEmpty(beat.toDouble(), midi)
                            }
                        }
                    },
                ) {
                    val bw = BEAT_W.toPx()
                    val rh = size.height / rows
                    // 줄 배경 (음계음은 밝게)
                    for (r in 0 until rows) {
                        val midi = hi - r
                        if (comp.key.inScale(midi)) drawRect(Color.White.copy(alpha = 0.035f), Offset(0f, r * rh), Size(size.width, rh))
                        if (pitchClass(midi) == comp.key.tonic) drawRect(Neon.Violet.copy(alpha = 0.08f), Offset(0f, r * rh), Size(size.width, rh))
                    }
                    // 박·마디 선
                    for (b in 0..beats) {
                        val bar = b % comp.beatsPerBar == 0
                        drawLine(if (bar) Neon.OutlineStrong else Neon.Outline.copy(alpha = 0.6f), Offset(b * bw, 0f), Offset(b * bw, size.height), if (bar) 2f else 1f)
                    }
                    // 곡 끝 이후는 어둡게
                    drawRect(Color.Black.copy(alpha = 0.25f), Offset(comp.totalBeats * bw, 0f), Size(size.width - comp.totalBeats * bw, size.height))
                    // 음표
                    notes.forEachIndexed { i, n ->
                        val left = (n.startBeat * bw).toFloat() + 1.5f
                        val top = (hi - n.midi) * rh + 1.5f
                        val w = (n.beats * bw).toFloat() - 3f
                        val h = rh - 3f
                        val sel = i == selected
                        val playingNow = playheadBeat != null && playheadBeat >= n.startBeat && playheadBeat < n.endBeat
                        if (sel) drawRoundRect(Neon.Pink.copy(alpha = 0.3f), Offset(left - 4f, top - 4f), Size(w + 8f, h + 8f), CornerRadius(10f))
                        drawRoundRect(
                            if (sel || playingNow) Brush.horizontalGradient(listOf(Neon.Pink, Neon.Violet), left, left + w)
                            else Brush.horizontalGradient(listOf(Color(0xFF8C6CFF), Color(0xFF6A4FE0)), left, left + w),
                            Offset(left, top), Size(w, h), CornerRadius(8f),
                        )
                        if (sel) drawRoundRect(Color.White, Offset(left, top), Size(w, h), CornerRadius(8f), style = Stroke(2.5f))
                        val lyric = lyrics.getOrNull(i)?.text
                        if (lyric != null && w > 14f && h > 22f) {
                            drawText(measurer, lyric, Offset(left + 6f, top + h / 2 - 17f), TextStyle(color = Color.White, fontSize = 11.sp, fontFamily = Pretendard), maxLines = 1, size = Size(w - 8f, h))
                        }
                    }
                    // 재생선
                    playheadBeat?.takeIf { it >= 0 }?.let { b ->
                        val x = (b * bw).toFloat()
                        drawLine(Color.White, Offset(x, 0f), Offset(x, size.height), 3f)
                    }
                }
                // 코드 칸
                Row(Modifier.height(44.dp).padding(vertical = 5.dp)) {
                    comp.chords.forEachIndexed { slot, chord ->
                        Box(
                            Modifier.width(BEAT_W * comp.chordBeats).fillMaxHeight().padding(horizontal = 2.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (slot * comp.chordBeats % comp.beatsPerBar == 0) Neon.SurfaceHigh else Neon.SurfaceHigh.copy(alpha = 0.6f))
                                .clickable { onTapChord(slot) },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(chord.name, color = Neon.Cyan, style = MaterialTheme.typography.titleSmall, textAlign = TextAlign.Center)
                        }
                    }
                }
            }
        }
    }
}
