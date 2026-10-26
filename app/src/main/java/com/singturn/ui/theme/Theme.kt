package com.singturn.ui.theme

import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.singturn.R

/**
 * 브랜드 팔레트. 런처 아이콘(Canva 시안)의 마젠타→바이올렛 그라디언트를 기준으로,
 * 채도 높은 색은 강조에만 쓰고 바탕은 차분한 남보라 톤으로 맞췄다.
 */
object Neon {
    val Bg = Color(0xFF0B0A12)
    val Surface = Color(0xFF15131F)
    val SurfaceHigh = Color(0xFF1F1C2D)
    val Outline = Color(0xFF2A2639)
    val OutlineStrong = Color(0xFF3A3452)

    val Pink = Color(0xFFF048D8)
    val Violet = Color(0xFF7B4DFF)
    val Cyan = Color(0xFF45D9F5)
    val Gold = Color(0xFFF5C451)
    val Lime = Color(0xFF7EE787)
    val Red = Color(0xFFFF6B81)

    val TextHigh = Color(0xFFF5F3FF)
    val TextMid = Color(0xFFA9A3C2)
    val TextLow = Color(0xFF6E6888)

    /** 메인 액션 (아이콘과 같은 그라디언트) */
    val Hero = Brush.linearGradient(listOf(Color(0xFFFF5FD9), Color(0xFFB24DFF), Violet))
    val Cool = Brush.linearGradient(listOf(Color(0xFF3D7BFF), Cyan))
    val Warm = Brush.linearGradient(listOf(Color(0xFFFF9150), Gold))

    val MedalGold = Brush.linearGradient(listOf(Color(0xFFFFE7A3), Color(0xFFE2A52B)))
    val MedalSilver = Brush.linearGradient(listOf(Color(0xFFF1F4FA), Color(0xFFA3ADBF)))
    val MedalBronze = Brush.linearGradient(listOf(Color(0xFFF6C29A), Color(0xFFB0683A)))

    /** 파티 참가자 구분 색 */
    val PlayerColors = listOf(Pink, Cyan, Gold, Lime, Color(0xFFB18CFF), Color(0xFFFF9150))
}

/** Pretendard (SIL OFL 1.1) – KS X 1001 한글 2,350자 + 라틴 서브셋. 없는 글자는 시스템 글꼴로 대체된다. */
val Pretendard = FontFamily(
    Font(R.font.pretendard_regular, FontWeight.Normal),
    Font(R.font.pretendard_semibold, FontWeight.SemiBold),
    Font(R.font.pretendard_bold, FontWeight.Bold),
    Font(R.font.pretendard_extrabold, FontWeight.ExtraBold),
    Font(R.font.pretendard_extrabold, FontWeight.Black),
)

private val Colors = darkColorScheme(
    primary = Neon.Pink,
    onPrimary = Color.White,
    primaryContainer = Neon.SurfaceHigh,
    onPrimaryContainer = Neon.TextHigh,
    secondary = Neon.Cyan,
    onSecondary = Color.Black,
    secondaryContainer = Neon.SurfaceHigh,
    onSecondaryContainer = Neon.TextHigh,
    tertiary = Neon.Gold,
    background = Neon.Bg,
    onBackground = Neon.TextHigh,
    surface = Neon.Surface,
    onSurface = Neon.TextHigh,
    surfaceVariant = Neon.SurfaceHigh,
    onSurfaceVariant = Neon.TextMid,
    surfaceContainerLowest = Neon.Bg,
    surfaceContainerLow = Neon.Surface,
    surfaceContainer = Neon.Surface,
    surfaceContainerHigh = Neon.SurfaceHigh,
    surfaceContainerHighest = Neon.SurfaceHigh,
    outline = Neon.OutlineStrong,
    outlineVariant = Neon.Outline,
    error = Neon.Red,
)

private fun style(size: Int, weight: FontWeight, spacing: Double = 0.0, line: Int? = null) = TextStyle(
    fontFamily = Pretendard,
    fontSize = size.sp,
    fontWeight = weight,
    letterSpacing = spacing.sp,
    lineHeight = (line ?: (size * 1.4).toInt()).sp,
)

private val Type = Typography(
    displayLarge = style(64, FontWeight.ExtraBold, -2.0, 68),
    displayMedium = style(44, FontWeight.ExtraBold, -1.2, 50),
    headlineLarge = style(28, FontWeight.ExtraBold, -0.8, 36),
    headlineMedium = style(22, FontWeight.Bold, -0.5, 30),
    headlineSmall = style(20, FontWeight.Bold, -0.4),
    titleLarge = style(18, FontWeight.Bold, -0.3),
    titleMedium = style(16, FontWeight.SemiBold, -0.2),
    titleSmall = style(14, FontWeight.SemiBold, -0.1),
    bodyLarge = style(16, FontWeight.Normal, -0.2, 24),
    bodyMedium = style(14, FontWeight.Normal, -0.1, 20),
    bodySmall = style(12, FontWeight.Normal, 0.0, 17),
    labelLarge = style(15, FontWeight.Bold, -0.2),
    labelMedium = style(12, FontWeight.SemiBold, 0.0),
    labelSmall = style(11, FontWeight.SemiBold, 0.2),
)

@Composable
fun SingTurnTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Colors, typography = Type) {
        // Surface 밖에 놓인 Text도 어두운 배경에서 보이도록 기본 글자색을 밝게 지정
        CompositionLocalProvider(LocalContentColor provides Neon.TextHigh, content = content)
    }
}
