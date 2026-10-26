package com.singturn.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

object Neon {
    val Bg = Color(0xFF0E0B1A)
    val Surface = Color(0xFF1A1430)
    val SurfaceHigh = Color(0xFF261D45)
    val Outline = Color(0xFF3A2F63)
    val Pink = Color(0xFFFF4FD8)
    val Cyan = Color(0xFF3EE6FF)
    val Gold = Color(0xFFFFD166)
    val Lime = Color(0xFF9BFF6A)
    val Red = Color(0xFFFF5C7A)
    val TextHigh = Color(0xFFF4F0FF)
    val TextMid = Color(0xFFB9B0D9)
    val TextLow = Color(0xFF7C7399)

    val Hero = Brush.linearGradient(listOf(Color(0xFF7B2FF7), Pink))
    val Cool = Brush.linearGradient(listOf(Color(0xFF2F6BFF), Cyan))
    val Warm = Brush.linearGradient(listOf(Color(0xFFFF8A3D), Gold))

    /** 파티 참가자 구분 색 */
    val PlayerColors = listOf(Pink, Cyan, Gold, Lime, Color(0xFFB18CFF), Color(0xFFFF8A3D))
}

private val Colors = darkColorScheme(
    primary = Neon.Pink,
    onPrimary = Color.White,
    secondary = Neon.Cyan,
    onSecondary = Color.Black,
    tertiary = Neon.Gold,
    background = Neon.Bg,
    onBackground = Neon.TextHigh,
    surface = Neon.Surface,
    onSurface = Neon.TextHigh,
    surfaceVariant = Neon.SurfaceHigh,
    onSurfaceVariant = Neon.TextMid,
    surfaceContainer = Neon.Surface,
    surfaceContainerHigh = Neon.SurfaceHigh,
    surfaceContainerHighest = Neon.SurfaceHigh,
    outline = Neon.Outline,
    error = Neon.Red,
)

private val Type = Typography(
    displayLarge = TextStyle(fontSize = 64.sp, fontWeight = FontWeight.Black, letterSpacing = (-1).sp),
    headlineLarge = TextStyle(fontSize = 30.sp, fontWeight = FontWeight.ExtraBold),
    headlineMedium = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.Bold),
    titleLarge = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.Bold),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    labelLarge = TextStyle(fontSize = 15.sp, fontWeight = FontWeight.Bold),
    labelMedium = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.SemiBold),
)

@Composable
fun SingTurnTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Colors, typography = Type, content = content)
}
