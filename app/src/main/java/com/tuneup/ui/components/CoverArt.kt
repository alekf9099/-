package com.tuneup.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.RectangleShape
import com.tuneup.data.song.Genre
import com.tuneup.studio.Composition
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin

/**
 * 곡마다 자동으로 만드는 커버 아트.
 * 같은 곡이면 항상 같은 그림: 곡 id로 색 조합·무늬를 고르고, 실제 멜로디 모양을 물결로 그린다.
 * 장르마다 무늬가 다르다 (발라드 = 둥근 빛, 팝 = 띠, 댄스 = 사선 줄무늬, 어쿠스틱 = 나이테).
 */
object CoverPalette {
    // 흰 글씨를 올려도 대비 4.5:1 이상이 되도록 고른 짙은 색 조합
    val pairs = listOf(
        Color(0xFFB0247F) to Color(0xFF4A2BB8),
        Color(0xFF2343B8) to Color(0xFF0E6E7E),
        Color(0xFF8A2BB5) to Color(0xFF2D2A8F),
        Color(0xFFB2431A) to Color(0xFF7A1F5C),
        Color(0xFF0F6B5A) to Color(0xFF214A9A),
        Color(0xFF6B2FD1) to Color(0xFFB0247F),
        Color(0xFF7A5200) to Color(0xFF8E2A3C),
        Color(0xFF1E5AA8) to Color(0xFF6A2BA8),
    )

    fun of(seed: String) = pairs[abs(seed.hashCode()) % pairs.size]
}

@Composable
fun CoverArt(seed: String, comp: Composition, modifier: Modifier = Modifier, shape: Shape = RectangleShape, progress: Float? = null, melody: Boolean = true) {
    val (a, b) = remember(seed) { CoverPalette.of(seed) }
    val salt = remember(seed) { (abs(seed.hashCode()) % 1000) / 1000f }
    Box(modifier.clip(shape).background(Brush.linearGradient(listOf(a, b)))) {
        Canvas(Modifier.matchParentSize()) {
            val w = size.width
            val h = size.height
            // 장르 무늬
            when (comp.genre) {
                Genre.BALLAD -> {
                    drawCircle(Color.White.copy(alpha = 0.10f), radius = w * 0.55f, center = Offset(w * (0.2f + salt * 0.6f), h * 0.18f))
                    drawCircle(Color.White.copy(alpha = 0.07f), radius = w * 0.32f, center = Offset(w * 0.85f, h * (0.5f + salt * 0.2f)))
                }
                Genre.POP -> for (i in 0 until 4) {
                    val y = h * (0.12f + i * 0.17f + salt * 0.05f)
                    drawRoundRect(Color.White.copy(alpha = 0.06f + i * 0.015f), Offset(-w * 0.1f, y), Size(w * 1.2f, h * 0.07f), CornerRadius(h * 0.035f))
                }
                Genre.DANCE -> {
                    val step = w / 6f
                    for (i in -6..12) {
                        val x = i * step + salt * step
                        drawLine(Color.White.copy(alpha = 0.08f), Offset(x, 0f), Offset(x + h * 0.6f, h), strokeWidth = step * 0.28f)
                    }
                }
                Genre.ACOUSTIC -> for (i in 1..5) {
                    drawCircle(Color.White.copy(alpha = 0.08f), radius = w * 0.16f * i, center = Offset(w * (0.75f - salt * 0.3f), h * 0.3f), style = Stroke(width = w * 0.012f))
                }
            }
            // 멜로디 물결: 음 높이를 따라가는 부드러운 선 (아래쪽 1/3)
            val notes = comp.notes.sortedBy { it.startBeat }
            if (melody && notes.isNotEmpty()) {
                val lo = notes.minOf { it.midi } - 2
                val hi = notes.maxOf { it.midi } + 2
                val total = notes.maxOf { it.endBeat }.coerceAtLeast(1.0)
                val base = h * 0.78f
                val amp = h * 0.20f
                val path = Path()
                notes.forEachIndexed { i, n ->
                    val x = (n.startBeat / total * w).toFloat()
                    val y = base - (n.midi - lo).toFloat() / (hi - lo) * amp
                    if (i == 0) path.moveTo(0f, y)
                    path.lineTo(x, y)
                    path.lineTo((n.endBeat / total * w).toFloat(), y)
                }
                path.lineTo(w, base - amp * 0.3f)
                drawPath(path, Color.White.copy(alpha = 0.55f), style = Stroke(width = h * 0.018f, cap = StrokeCap.Round))
                val fill = Path().apply { addPath(path); lineTo(w, h); lineTo(0f, h); close() }
                drawPath(fill, Brush.verticalGradient(listOf(Color.White.copy(alpha = 0.16f), Color.Transparent), startY = base - amp, endY = h))
                if (progress != null) {
                    drawRect(Color.Black.copy(alpha = 0.25f), Offset(w * progress, 0f), Size(w * (1 - progress), h))
                }
            }
            // 작은 반짝임 (곡마다 위치가 다름)
            for (i in 0 until 6) {
                val t = (salt * 7 + i * 0.37f) % 1f
                val x = w * ((t * 13.7f) % 1f)
                val y = h * (0.08f + 0.5f * ((t * 5.3f) % 1f))
                drawCircle(Color.White.copy(alpha = 0.25f + 0.2f * sin((t * 2 * PI).toFloat()).coerceAtLeast(0f)), radius = w * 0.008f, center = Offset(x, y))
            }
            // 아래쪽을 살짝 어둡게 해서 글씨가 잘 보이게
            drawRect(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.35f)), startY = h * 0.45f, endY = h))
        }
    }
}
