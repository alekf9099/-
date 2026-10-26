package com.tuneup.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tuneup.R
import com.tuneup.ui.theme.Neon

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SingTopBar(title: String, onBack: (() -> Unit)?, actions: @Composable RowScope.() -> Unit = {}) {
    CenterAlignedTopAppBar(
        title = { Text(title, style = MaterialTheme.typography.titleLarge) },
        navigationIcon = {
            if (onBack != null) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "뒤로") }
            }
        },
        actions = actions,
        colors = TopAppBarDefaults.centerAlignedTopAppBarColors(containerColor = Color.Transparent),
    )
}

/** 화면 상단에 은은하게 퍼지는 무대 조명. 평평한 검정 배경보다 깊이감을 준다. */
fun Modifier.stageGlow(color: Color = Neon.Violet, alpha: Float = 0.28f): Modifier = drawBehind {
    drawRect(
        Brush.radialGradient(
            listOf(color.copy(alpha = alpha), Color.Transparent),
            center = Offset(size.width * 0.5f, -size.width * 0.15f),
            radius = size.width * 1.1f,
        ),
    )
}

/** 앱 아이콘과 같은 브랜드 마크 */
@Composable
fun BrandMark(size: Dp, modifier: Modifier = Modifier) {
    Box(
        modifier
            .size(size)
            .clip(RoundedCornerShape(size * 0.3f))
            .background(Brush.radialGradient(listOf(Color(0xFF2C1460), Color(0xFF150B33)))),
    ) {
        Image(painterResource(R.drawable.ic_brand_mark), contentDescription = null, modifier = Modifier.size(size))
    }
}

/** 그라디언트 배경의 큰 버튼 (최소 56dp 터치 영역) */
@Composable
fun GradientButton(
    text: String,
    brush: Brush,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Row(
        modifier = modifier
            .heightIn(min = 56.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(if (enabled) brush else Brush.linearGradient(listOf(Neon.SurfaceHigh, Neon.SurfaceHigh)))
            .border(1.dp, Color.White.copy(alpha = if (enabled) 0.14f else 0f), RoundedCornerShape(16.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        val tint = if (enabled) Color.White else Neon.TextLow
        if (icon != null) {
            Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
            Box(Modifier.size(8.dp))
        }
        Text(text, color = tint, style = MaterialTheme.typography.labelLarge)
    }
}

/** 기본 패널. 테두리는 아주 옅게, 강조가 필요할 때만 border 색을 준다. */
@Composable
fun NeonCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    border: Color = Neon.Outline,
    background: Color = Neon.Surface,
    content: @Composable () -> Unit,
) {
    Box(
        modifier
            .clip(RoundedCornerShape(20.dp))
            .background(background)
            .border(1.dp, border, RoundedCornerShape(20.dp))
            .let { if (onClick != null) it.clickable(onClick = onClick) else it }
            .padding(16.dp),
    ) { content() }
}

@Composable
fun Tag(text: String, color: Color, icon: ImageVector? = null) {
    Row(
        Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(color.copy(alpha = 0.12f))
            .padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(13.dp))
            Box(Modifier.size(4.dp))
        }
        Text(text, color = color, style = MaterialTheme.typography.labelMedium)
    }
}

/** 이니셜 아바타: 참가자 색의 그라디언트 링 */
@Composable
fun PlayerAvatar(name: String, color: Color, size: Int = 40) {
    Box(
        Modifier
            .size(size.dp)
            .clip(CircleShape)
            .background(Brush.linearGradient(listOf(color, color.copy(alpha = 0.35f))))
            .padding((size / 18f).coerceAtLeast(2f).dp)
            .clip(CircleShape)
            .background(Neon.SurfaceHigh),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            name.take(1),
            color = color,
            fontWeight = FontWeight.ExtraBold,
            fontSize = (size * 0.4f).sp,
        )
    }
}

/** 1~3위는 메달 배지, 그 아래는 숫자만 */
@Composable
fun RankBadge(rank: Int, size: Dp = 32.dp) {
    val medal = when (rank) {
        1 -> Neon.MedalGold
        2 -> Neon.MedalSilver
        3 -> Neon.MedalBronze
        else -> null
    }
    Box(
        Modifier
            .size(size)
            .clip(CircleShape)
            .let { if (medal != null) it.background(medal) else it.background(Neon.SurfaceHigh) },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            "$rank",
            color = if (medal != null) Color(0xFF2A1F0A) else Neon.TextMid,
            fontWeight = FontWeight.ExtraBold,
            fontSize = (size.value * 0.44f).sp,
        )
    }
}

fun medalColor(rank: Int): Color = when (rank) {
    1 -> Color(0xFFF5C451); 2 -> Color(0xFFD5DCE8); 3 -> Color(0xFFE09A62); else -> Neon.TextHigh
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = MaterialTheme.typography.titleSmall,
        color = Neon.TextMid,
        modifier = modifier.padding(top = 12.dp, bottom = 8.dp),
    )
}

@Composable
fun IconTile(icon: ImageVector, brush: Brush, size: Dp = 48.dp) {
    Box(
        Modifier.size(size).clip(RoundedCornerShape(size * 0.32f)).background(brush),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(size * 0.5f))
    }
}

@Composable
fun EmptyState(icon: ImageVector, title: String, body: String) {
    Column(Modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(64.dp).clip(CircleShape).background(Neon.SurfaceHigh), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = Neon.TextLow, modifier = Modifier.size(30.dp))
        }
        Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 14.dp))
        Text(body, style = MaterialTheme.typography.bodyMedium, color = Neon.TextMid, modifier = Modifier.padding(top = 4.dp))
    }
}
