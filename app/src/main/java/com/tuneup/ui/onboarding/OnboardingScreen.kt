package com.tuneup.ui.onboarding

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.material3.Icon
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.border
import androidx.compose.foundation.background
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
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tuneup.ui.components.BrandMark
import com.tuneup.ui.components.GradientButton
import com.tuneup.ui.components.stageGlow
import com.tuneup.ui.theme.Neon
import com.tuneup.ui.theme.Pretendard
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.sin

private data class Page(val title: String, val body: String, val art: @Composable (Modifier) -> Unit)

/** 첫 실행 안내 3장: 흥얼거리기 → 자동 반주 → 공유·대화 */
@Composable
fun OnboardingScreen(onFinish: () -> Unit, startPage: Int = 0) {
    val pages = listOf(
        Page("흥얼거리면\n노래가 돼요", "떠오르는 멜로디를 \"라라라\" 하고 불러 보세요.\n음 높이와 박자를 알아서 악보로 옮겨요.") { HumToNotesArt(it) },
        Page("코드와 반주는\n알아서 붙여요", "발라드·팝·댄스·어쿠스틱 중에 고르면\n어울리는 코드와 반주가 바로 만들어져요.") { ChordsArt(it) },
        Page("튠업에서\n나누고 이야기해요", "만든 곡을 공유하고 좋아요·별점을 받아 보세요.\n마음에 드는 곡의 제작자와 대화할 수도 있어요.") { ShareArt(it) },
    )
    val pager = rememberPagerState(initialPage = startPage) { pages.size }
    val scope = rememberCoroutineScope()
    val last = pager.currentPage == pages.lastIndex

    Column(Modifier.fillMaxSize().stageGlow(alpha = 0.35f)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            BrandMark(32.dp)
            Text("튠업", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(start = 8.dp).weight(1f))
            if (!last) TextButton(onClick = onFinish) { Text("건너뛰기", color = Neon.TextMid) }
        }
        HorizontalPager(pager, modifier = Modifier.weight(1f)) { i ->
            val p = pages[i]
            Column(Modifier.fillMaxSize().padding(horizontal = 28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                p.art(Modifier.fillMaxWidth().weight(1f).padding(vertical = 16.dp))
                Text(p.title, style = MaterialTheme.typography.headlineLarge, textAlign = TextAlign.Center)
                Text(
                    p.body, color = Neon.TextMid, style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 12.dp, bottom = 24.dp),
                )
            }
        }
        // 페이지 표시
        Row(Modifier.fillMaxWidth().padding(bottom = 20.dp), horizontalArrangement = Arrangement.Center) {
            repeat(pages.size) { i ->
                val w by animateFloatAsState(if (i == pager.currentPage) 24f else 8f, label = "dot")
                Box(
                    Modifier.padding(horizontal = 4.dp).height(8.dp).width(w.dp).clip(RoundedCornerShape(4.dp))
                        .background(if (i == pager.currentPage) Neon.Pink else Neon.OutlineStrong),
                )
            }
        }
        GradientButton(
            if (last) "흥얼거리러 가기" else "다음",
            Neon.Hero,
            icon = if (last) Icons.Filled.Mic else Icons.AutoMirrored.Filled.ArrowForward,
            onClick = { if (last) onFinish() else scope.launch { pager.animateScrollToPage(pager.currentPage + 1) } },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 20.dp),
        )
    }
}

/** 흔들리는 목소리 곡선이 깔끔한 음표 막대로 바뀌는 그림 */
@Composable
private fun HumToNotesArt(modifier: Modifier) {
    val t by rememberInfiniteTransition(label = "hum").animateFloat(0f, 1f, infiniteRepeatable(tween(2400), RepeatMode.Restart), label = "t")
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        val mid = w * 0.5f
        val levels = listOf(0.62f, 0.5f, 0.42f, 0.56f, 0.36f, 0.46f)
        // 왼쪽: 흥얼거림 곡선
        val path = Path()
        for (i in 0..160) {
            val x = w * 0.02f + (mid - w * 0.08f) * i / 160f
            // 음 사이를 부드럽게 미끄러지는 목소리 + 살짝 떨리는 비브라토
            val pos = i / 160f * (levels.size - 1)
            val k = pos.toInt().coerceAtMost(levels.lastIndex - 1)
            val f = (pos - k).let { it * it * (3 - 2 * it) }
            val base = levels[k] + (levels[k + 1] - levels[k]) * f
            val y = h * base + sin((i / 160f * 6 + t) * 2 * PI).toFloat() * h * 0.012f
            if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
        }
        drawPath(path, Brush.horizontalGradient(listOf(Neon.Pink.copy(alpha = 0.45f), Neon.Pink)), style = Stroke(width = 6.dp.toPx(), cap = StrokeCap.Round))
        // 가운데 화살표
        val ay = h * 0.5f
        drawLine(Neon.TextLow, Offset(mid - w * 0.05f, ay), Offset(mid + w * 0.03f, ay), 3.dp.toPx(), StrokeCap.Round)
        drawLine(Neon.TextLow, Offset(mid + w * 0.03f, ay), Offset(mid, ay - 10.dp.toPx()), 3.dp.toPx(), StrokeCap.Round)
        drawLine(Neon.TextLow, Offset(mid + w * 0.03f, ay), Offset(mid, ay + 10.dp.toPx()), 3.dp.toPx(), StrokeCap.Round)
        // 오른쪽: 피아노 롤 음표 (곡선과 같은 높이의 막대)
        val left = mid + w * 0.06f
        val right = w * 0.98f
        val cell = (right - left) / levels.size
        drawRoundRect(Neon.Surface, Offset(left - 10.dp.toPx(), h * 0.24f), Size(right - left + 20.dp.toPx(), h * 0.52f), CornerRadius(16.dp.toPx()))
        levels.forEachIndexed { i, lv ->
            // 왼쪽부터 차례로 밝아진다
            val appear = 0.45f + 0.55f * ((t * levels.size * 1.4f) - i).coerceIn(0f, 1f)
            drawRoundRect(
                Brush.horizontalGradient(listOf(Neon.Pink, Neon.Violet)),
                Offset(left + i * cell + 1.dp.toPx(), h * lv - 8.dp.toPx()), Size(cell - 3.dp.toPx(), 16.dp.toPx()),
                CornerRadius(8.dp.toPx()), alpha = appear,
            )
        }
    }
}

/** 코드 칩과 장르 카드 */
@Composable
private fun ChordsArt(modifier: Modifier) {
    val measurer = rememberTextMeasurer()
    val pulse by rememberInfiniteTransition(label = "chord").animateFloat(0f, 4f, infiniteRepeatable(tween(3200), RepeatMode.Restart), label = "p")
    Canvas(modifier) {
        val chords = listOf("C", "G", "Am", "F")
        val cw = size.width * 0.2f
        val gap = (size.width - cw * 4) / 5
        val y = size.height * 0.28f
        chords.forEachIndexed { i, c ->
            val active = pulse.toInt() == i
            val x = gap + i * (cw + gap)
            drawRoundRect(if (active) Neon.Cyan.copy(alpha = 0.22f) else Neon.Surface, Offset(x, y), Size(cw, cw * 0.8f), CornerRadius(16.dp.toPx()))
            val layout = measurer.measure(c, TextStyle(color = if (active) Neon.Cyan else Neon.TextMid, fontSize = 22.sp, fontWeight = FontWeight.Bold, fontFamily = Pretendard))
            drawText(layout, topLeft = Offset(x + (cw - layout.size.width) / 2, y + (cw * 0.8f - layout.size.height) / 2))
        }
        val genres = listOf("발라드" to Neon.Violet, "팝" to Neon.Pink, "댄스" to Color(0xFF2F62E0), "어쿠스틱" to Color(0xFFC2541A))
        val gy = size.height * 0.62f
        val gw = (size.width - gap * 3) / 2
        genres.forEachIndexed { i, (label, color) ->
            val x = gap + (i % 2) * (gw + gap)
            val yy = gy + (i / 2) * 56.dp.toPx()
            drawRoundRect(color.copy(alpha = 0.85f), Offset(x, yy), Size(gw, 46.dp.toPx()), CornerRadius(14.dp.toPx()))
            val layout = measurer.measure(label, TextStyle(color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold, fontFamily = Pretendard))
            drawText(layout, topLeft = Offset(x + 16.dp.toPx(), yy + (46.dp.toPx() - layout.size.height) / 2))
        }
    }
}

/** 곡 카드 + 반응(좋아요·별점·말풍선) */
@Composable
private fun ShareArt(modifier: Modifier) {
    val bob by rememberInfiniteTransition(label = "share").animateFloat(0f, 8f, infiniteRepeatable(tween(1800), RepeatMode.Reverse), label = "f")
    Box(modifier, contentAlignment = Alignment.Center) {
        Box(Modifier.fillMaxWidth(0.8f).aspectRatio(1.35f)) {
            // 곡 카드
            Column(
                Modifier.fillMaxSize().padding(top = 18.dp, end = 18.dp).clip(RoundedCornerShape(28.dp)).background(Neon.Hero).padding(20.dp),
            ) {
                Text("밤하늘 산책", color = Color.White, style = MaterialTheme.typography.titleLarge)
                Text("별빛작곡가 · 발라드", color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.labelMedium)
                Canvas(Modifier.fillMaxWidth().weight(1f).padding(vertical = 12.dp)) {
                    val bars = listOf(0.7f, 0.45f, 0.55f, 0.25f, 0.5f, 0.35f, 0.6f)
                    val bw = size.width / bars.size
                    bars.forEachIndexed { i, b ->
                        drawRoundRect(Color.White.copy(alpha = 0.9f), Offset(i * bw, size.height * b), Size(bw - 6.dp.toPx(), 10.dp.toPx()), CornerRadius(5.dp.toPx()))
                    }
                }
            }
            // 좋아요 (오른쪽 위)
            Reaction(Icons.Filled.Favorite, "128", Neon.Pink, Modifier.align(Alignment.TopEnd).offset(y = (-bob).dp))
            // 별점 (왼쪽 아래)
            Reaction(Icons.Filled.Star, "4.8", Neon.Gold, Modifier.align(Alignment.BottomStart).offset(x = (-12).dp, y = (24 + bob).dp))
        }
        // 대화 말풍선
        Row(
            Modifier.align(Alignment.BottomEnd).offset(y = (-bob).dp).padding(end = 4.dp, bottom = 8.dp)
                .clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp, bottomStart = 20.dp, bottomEnd = 4.dp)).background(Neon.SurfaceHigh)
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.AutoMirrored.Filled.Chat, contentDescription = null, tint = Neon.Cyan, modifier = Modifier.size(16.dp))
            Text("  가사 붙여봐도 될까요?", style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
private fun Reaction(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, color: Color, modifier: Modifier) {
    Row(
        modifier.clip(RoundedCornerShape(50)).background(Neon.Surface).border(1.dp, color.copy(alpha = 0.4f), RoundedCornerShape(50))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(18.dp))
        Text(" $label", style = MaterialTheme.typography.labelLarge)
    }
}
