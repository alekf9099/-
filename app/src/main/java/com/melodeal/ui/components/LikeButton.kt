package com.melodeal.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.melodeal.ui.theme.Neon
import kotlinx.coroutines.launch
import kotlin.math.cos
import kotlin.math.sin

/**
 * 반응 버튼 (좋아요·추천): 누르면 통 튀고 작은 조각이 퍼지며 진동이 온다.
 * 세로 액션 바와 상세 화면에서 같이 쓴다.
 */
@Composable
fun ReactionButton(
    on: Boolean,
    iconOn: ImageVector,
    iconOff: ImageVector,
    label: String,
    tint: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 32.dp,
    caption: String? = null,
    enabled: Boolean = true,
    labelColor: Color = Color.White,
    description: String = label,
) {
    val scale = remember { Animatable(1f) }
    val burst = remember { Animatable(1f) }
    val scope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current
    Column(
        modifier
            .semantics {
                contentDescription = description
                stateDescription = if (on) "선택됨" else "선택 안 됨"
            }
            .clickable(enabled = enabled, interactionSource = remember { MutableInteractionSource() }, indication = null, role = Role.Button) {
                if (!on) {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    scope.launch {
                        scale.snapTo(0.6f)
                        scale.animateTo(1f, spring(dampingRatio = Spring.DampingRatioHighBouncy, stiffness = Spring.StiffnessMedium))
                    }
                    scope.launch { burst.snapTo(0f); burst.animateTo(1f, tween(520, easing = LinearOutSlowInEasing)) }
                }
                onClick()
            }
            .size(width = 64.dp, height = size + 30.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.size(size + 16.dp), contentAlignment = Alignment.Center) {
            Canvas(Modifier.size(size + 16.dp)) {
                val p = burst.value
                if (p < 1f) {
                    val r = this.size.minDimension / 2 * (0.4f + 0.6f * p)
                    for (i in 0 until 8) {
                        val a = i * (Math.PI / 4).toFloat()
                        drawCircle(
                            (if (i % 2 == 0) tint else Neon.Gold).copy(alpha = 1f - p),
                            radius = 3.dp.toPx() * (1f - p * 0.5f),
                            center = Offset(center.x + cos(a) * r, center.y + sin(a) * r),
                        )
                    }
                }
            }
            Icon(
                if (on) iconOn else iconOff, contentDescription = null, tint = if (on) tint else labelColor,
                modifier = Modifier.size(size).graphicsLayer { scaleX = scale.value; scaleY = scale.value },
            )
        }
        Text(caption ?: label, color = labelColor, style = MaterialTheme.typography.labelMedium, maxLines = 1)
    }
}

@Composable
fun LikeButton(liked: Boolean, count: Int, onToggle: () -> Unit, modifier: Modifier = Modifier, labelColor: Color = Color.White) =
    ReactionButton(
        on = liked, iconOn = Icons.Filled.Favorite, iconOff = Icons.Filled.FavoriteBorder, label = "좋아요",
        tint = Neon.Pink, onClick = onToggle, modifier = modifier, caption = compactCount(count), labelColor = labelColor,
        description = "좋아요 $count",
    )

/** 1234 → 1.2천, 12345 → 1.2만 */
fun compactCount(n: Int): String = when {
    n >= 10_000 -> "%.1f만".format(n / 10_000.0).replace(".0만", "만")
    n >= 1_000 -> "%.1f천".format(n / 1_000.0).replace(".0천", "천")
    else -> "$n"
}
