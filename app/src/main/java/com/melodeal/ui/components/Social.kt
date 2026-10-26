package com.melodeal.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.melodeal.ui.theme.Neon

/** 팔로우 / 팔로잉 알약 버튼 */
@Composable
fun FollowChip(following: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, onDark: Boolean = false) {
    val shape = RoundedCornerShape(50)
    Row(
        modifier.minimumInteractiveComponentSize().clip(shape)
            .then(if (following) Modifier.border(1.dp, if (onDark) Color.White.copy(alpha = 0.6f) else Neon.OutlineStrong, shape) else Modifier.background(Neon.Hero))
            .clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(if (following) Icons.Filled.Check else Icons.Filled.PersonAdd, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
        Text(if (following) " 팔로잉" else " 팔로우", color = Color.White, style = MaterialTheme.typography.labelLarge)
    }
}

/** 두세 개 중 하나 고르는 상단 탭 (추천 | 팔로잉, 알림 | 메시지) */
@Composable
fun SegmentTabs(labels: List<String>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier, badges: List<Int> = emptyList(), onDark: Boolean = false) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        labels.forEachIndexed { i, label ->
            val on = i == selected
            Row(
                Modifier.minimumInteractiveComponentSize().clip(RoundedCornerShape(50))
                    .background(if (on) (if (onDark) Color.White.copy(alpha = 0.18f) else Neon.SurfaceHigh) else Color.Transparent)
                    .clickable { onSelect(i) }.padding(horizontal = 14.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    label, style = MaterialTheme.typography.titleSmall,
                    color = if (on) Color.White else if (onDark) Color.White.copy(alpha = 0.75f) else Neon.TextMid,
                )
                val b = badges.getOrNull(i) ?: 0
                if (b > 0) {
                    Text(
                        if (b > 99) "99+" else "$b", color = Color.White, style = MaterialTheme.typography.labelSmall,
                        modifier = Modifier.padding(start = 6.dp).clip(RoundedCornerShape(50)).background(Neon.Pink).padding(horizontal = 6.dp, vertical = 1.dp),
                    )
                }
            }
        }
    }
}
