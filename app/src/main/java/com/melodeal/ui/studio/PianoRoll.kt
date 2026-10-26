package com.melodeal.ui.studio

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.awaitTouchSlopOrCancellation
import androidx.compose.foundation.gestures.drag
import androidx.compose.foundation.gestures.waitForUpOrCancellation
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
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
import kotlin.math.roundToInt

/** 박 하나의 너비. 8분음표(0.5박)도 28dp라 손가락으로 집을 수 있다 */
private val BEAT_W = 56.dp
/** 반음 한 줄 높이 */
private val ROW_H = 30.dp
private val KEYS_W = 44.dp
private val CHORD_H = 52.dp

private data class DragPreview(val index: Int, val dBeats: Double, val dSemis: Int)

/**
 * 피아노 롤: 가로 = 시간(박), 세로 = 음높이. 음계에 속한 줄은 밝게 칠해 어디에 음을 둬야 할지 보여준다.
 * - 빈 칸 탭: 음표 추가 (선택 중이면 선택 해제)
 * - 음표 탭: 선택
 * - 음표 끌기: 높이·위치 이동 (반음·8분음표 단위로 맞춰짐)
 * - 빈 곳 끌기: 화면 스크롤
 */
@Composable
fun PianoRoll(
    comp: Composition,
    selected: Int?,
    playheadBeat: Double?,
    onTapNote: (Int) -> Unit,
    onTapEmpty: (beat: Double, midi: Int) -> Unit,
    onTapChord: (slot: Int) -> Unit,
    onMoveNote: (index: Int, dBeats: Double, dSemis: Int) -> Unit = { _, _, _ -> },
    viewportHeight: Dp = 330.dp,
) {
    val notes = comp.notes
    val hi = ((notes.maxOfOrNull { it.midi } ?: 72) + 7).coerceAtMost(96)
    val lo = minOf((notes.minOfOrNull { it.midi } ?: 60) - 7, hi - 23).coerceAtLeast(36)
    val rows = hi - lo + 1
    val beats = comp.totalBeats + comp.beatsPerBar // 뒤에 한 마디 여유: 음을 이어 붙일 수 있게
    val hScroll = rememberScrollState()
    val vScroll = rememberScrollState()
    val density = LocalDensity.current
    val haptics = LocalHapticFeedback.current
    val measurer = rememberTextMeasurer()
    val lyrics = remember(comp.lyrics) { LyricsFitter.split(comp.lyrics) }
    var preview by remember { mutableStateOf<DragPreview?>(null) }

    // 처음 열 때 음표들이 보이도록 세로 위치 맞추기
    LaunchedEffect(lo, hi) {
        val center = notes.map { it.midi }.sorted().getOrNull(notes.size / 2) ?: 66
        val y = with(density) { (ROW_H * (hi - center).toFloat()).toPx() - viewportHeight.toPx() / 2 }
        vScroll.scrollTo(y.roundToInt().coerceAtLeast(0))
    }
    // 미리듣기 중엔 재생 위치를 따라 가로 스크롤
    LaunchedEffect(playheadBeat?.let { (it / comp.beatsPerBar).toInt() }) {
        val b = playheadBeat ?: return@LaunchedEffect
        val px = with(density) { (BEAT_W * b.toFloat()).toPx() }.toInt()
        if (px > hScroll.value + hScroll.viewportSize * 0.7 || px < hScroll.value) hScroll.animateScrollTo((px - hScroll.viewportSize / 4).coerceAtLeast(0))
    }

    Column(Modifier.clip(RoundedCornerShape(20.dp)).background(Neon.Surface).border(1.dp, Neon.Outline, RoundedCornerShape(20.dp))) {
        Box(Modifier.height(viewportHeight)) {
            Row(Modifier.verticalScroll(vScroll)) {
                // 왼쪽 건반 이름
                Canvas(Modifier.width(KEYS_W).height(ROW_H * rows)) {
                    val rh = size.height / rows
                    for (r in 0 until rows) {
                        val midi = hi - r
                        val inScale = comp.key.inScale(midi)
                        drawRect(if (inScale) Neon.SurfaceHigh else Neon.Bg, Offset(0f, r * rh), Size(size.width, rh - 1f))
                        val label = NOTE_NAMES[pitchClass(midi)] + if (pitchClass(midi) == 0) "${midi / 12 - 1}" else ""
                        if (inScale) {
                            val layout = measurer.measure(label, TextStyle(color = if (pitchClass(midi) == comp.key.tonic) Neon.Pink else Neon.TextLow, fontSize = 11.sp, fontFamily = Pretendard))
                            drawText(layout, topLeft = Offset(8f, r * rh + (rh - layout.size.height) / 2))
                        }
                    }
                }
                Box(Modifier.horizontalScroll(hScroll)) {
                    Canvas(
                        Modifier.width(BEAT_W * beats).height(ROW_H * rows).pointerInput(comp, selected) {
                            val beatPx = BEAT_W.toPx()
                            val rowPx = ROW_H.toPx()
                            fun hit(pos: Offset): Int {
                                val beat = pos.x / beatPx
                                val midi = hi - (pos.y / rowPx).toInt()
                                return notes.indexOfFirst { beat >= it.startBeat && beat < it.endBeat && it.midi == midi }
                            }
                            awaitEachGesture {
                                val down = awaitFirstDown(requireUnconsumed = false)
                                val index = hit(down.position)
                                if (index < 0) {
                                    // 빈 칸: 끌면 부모(스크롤)가 가져가고, 그냥 떼면 탭
                                    val up = waitForUpOrCancellation() ?: return@awaitEachGesture
                                    up.consume()
                                    if (selected != null) onTapNote(-1)
                                    else onTapEmpty((down.position.x / beatPx).toDouble(), hi - (down.position.y / rowPx).toInt())
                                    return@awaitEachGesture
                                }
                                onTapNote(index)
                                var total = Offset.Zero
                                val start = awaitTouchSlopOrCancellation(down.id) { change, over ->
                                    change.consume()
                                    total += over
                                } ?: return@awaitEachGesture
                                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                fun snap(t: Offset) = DragPreview(index, (t.x / beatPx / GRID).roundToInt() * GRID, -(t.y / rowPx).roundToInt())
                                preview = snap(total)
                                val finished = drag(start.id) { change ->
                                    total += change.positionChange()
                                    change.consume()
                                    val next = snap(total)
                                    if (next != preview) haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    preview = next
                                }
                                val p = preview
                                preview = null
                                if (finished && p != null && (p.dBeats != 0.0 || p.dSemis != 0)) onMoveNote(p.index, p.dBeats, p.dSemis)
                            }
                        },
                    ) {
                        val bw = BEAT_W.toPx()
                        val rh = size.height / rows
                        // 줄 배경 (음계음은 밝게, 으뜸음은 보라)
                        for (r in 0 until rows) {
                            val midi = hi - r
                            if (comp.key.inScale(midi)) drawRect(Color.White.copy(alpha = 0.035f), Offset(0f, r * rh), Size(size.width, rh))
                            if (pitchClass(midi) == comp.key.tonic) drawRect(Neon.Violet.copy(alpha = 0.08f), Offset(0f, r * rh), Size(size.width, rh))
                            drawLine(Neon.Outline.copy(alpha = 0.35f), Offset(0f, r * rh), Offset(size.width, r * rh), 1f)
                        }
                        // 박·마디 선
                        for (b in 0..beats) {
                            val bar = b % comp.beatsPerBar == 0
                            drawLine(if (bar) Neon.OutlineStrong else Neon.Outline.copy(alpha = 0.6f), Offset(b * bw, 0f), Offset(b * bw, size.height), if (bar) 2f else 1f)
                        }
                        // 곡 끝 이후는 어둡게
                        drawRect(Color.Black.copy(alpha = 0.25f), Offset(comp.totalBeats * bw, 0f), Size(size.width - comp.totalBeats * bw, size.height))

                        fun drawNote(i: Int, startBeat: Double, beatsLen: Double, midi: Int, ghost: Boolean) {
                            val left = (startBeat * bw).toFloat() + 2f
                            val top = (hi - midi) * rh + 3f
                            val w = (beatsLen * bw).toFloat() - 4f
                            val h = rh - 6f
                            val sel = i == selected
                            val playingNow = playheadBeat != null && playheadBeat >= startBeat && playheadBeat < startBeat + beatsLen
                            if (ghost) {
                                drawRoundRect(Neon.Pink.copy(alpha = 0.25f), Offset(left, top), Size(w, h), CornerRadius(10f), style = Stroke(2f))
                                return
                            }
                            if (sel) drawRoundRect(Neon.Pink.copy(alpha = 0.3f), Offset(left - 5f, top - 5f), Size(w + 10f, h + 10f), CornerRadius(12f))
                            drawRoundRect(
                                if (sel || playingNow) Brush.horizontalGradient(listOf(Neon.Pink, Neon.Violet), left, left + w)
                                else Brush.horizontalGradient(listOf(Color(0xFF8C6CFF), Color(0xFF6A4FE0)), left, left + w),
                                Offset(left, top), Size(w, h), CornerRadius(10f),
                            )
                            if (sel) drawRoundRect(Color.White, Offset(left, top), Size(w, h), CornerRadius(10f), style = Stroke(3f))
                            val lyric = lyrics.getOrNull(i)?.text
                            if (lyric != null && w > 16f) {
                                val layout = measurer.measure(lyric, TextStyle(color = Color.White, fontSize = 12.sp, fontFamily = Pretendard), maxLines = 1)
                                if (layout.size.width < w - 8f) drawText(layout, topLeft = Offset(left + 8f, top + (h - layout.size.height) / 2))
                            }
                        }
                        val p = preview
                        notes.forEachIndexed { i, n ->
                            if (p != null && p.index == i) {
                                drawNote(i, n.startBeat, n.beats, n.midi, ghost = true)
                                drawNote(i, (n.startBeat + p.dBeats).coerceAtLeast(0.0), n.beats, (n.midi + p.dSemis).coerceIn(lo, hi), ghost = false)
                            } else {
                                drawNote(i, n.startBeat, n.beats, n.midi, ghost = false)
                            }
                        }
                        // 재생선
                        playheadBeat?.takeIf { it >= 0 }?.let { b ->
                            val x = (b * bw).toFloat()
                            drawLine(Color.White, Offset(x, 0f), Offset(x, size.height), 3f)
                        }
                    }
                }
            }
        }
        // 코드 칸 (세로 스크롤과 무관하게 항상 보이고, 가로는 롤과 같이 움직임)
        Row(Modifier.height(CHORD_H).background(Neon.Bg.copy(alpha = 0.4f))) {
            Box(Modifier.width(KEYS_W).fillMaxHeight(), contentAlignment = Alignment.Center) {
                Text("코드", color = Neon.TextLow, style = MaterialTheme.typography.labelSmall)
            }
            Row(Modifier.horizontalScroll(hScroll).padding(vertical = 4.dp)) {
                comp.chords.forEachIndexed { slot, chord ->
                    Box(
                        Modifier.width(BEAT_W * comp.chordBeats).fillMaxHeight().padding(horizontal = 2.dp)
                            .clip(RoundedCornerShape(12.dp))
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
