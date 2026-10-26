package com.singturn.ui.home

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Headphones
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.singturn.ui.app
import com.singturn.ui.components.NeonCard
import com.singturn.ui.theme.Neon

@Composable
fun HomeScreen(onParty: () -> Unit, onSolo: () -> Unit, onRanking: () -> Unit, onSettings: () -> Unit) {
    val settings by app().settings.state.collectAsState()
    val pulse by rememberInfiniteTransition(label = "pulse").animateFloat(
        initialValue = 1f, targetValue = 1.08f,
        animationSpec = infiniteRepeatable(tween(1200), RepeatMode.Reverse), label = "pulse",
    )

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
    ) {
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.End) {
            IconButton(onClick = onSettings) { Icon(Icons.Filled.Settings, contentDescription = "설정", tint = Neon.TextMid) }
        }
        Box(
            Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 28.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    Modifier.size(96.dp).scale(pulse).clip(RoundedCornerShape(32.dp)).background(Neon.Hero),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.Mic, contentDescription = null, tint = Color.White, modifier = Modifier.size(52.dp))
                }
                Spacer(Modifier.height(16.dp))
                Text("싱턴 노래방", style = MaterialTheme.typography.headlineLarge)
                Text("돌아가며 부르고, 점수로 겨루자", color = Neon.TextMid, style = MaterialTheme.typography.bodyLarge)
            }
        }

        BigMenu(
            icon = Icons.Filled.Groups, brush = Neon.Hero,
            title = "파티 모드", subtitle = "한 폰으로 번갈아 부르기 · 순서 자동 진행", onClick = onParty,
        )
        Spacer(Modifier.height(12.dp))
        BigMenu(
            icon = Icons.Filled.Mic, brush = Neon.Cool,
            title = "혼자 부르기", subtitle = "연습하고 내 최고 기록 갱신하기", onClick = onSolo,
        )
        Spacer(Modifier.height(12.dp))
        BigMenu(
            icon = Icons.Filled.EmojiEvents, brush = Neon.Warm,
            title = "랭킹", subtitle = "곡별 · 이번 주 · 플레이어 순위", onClick = onRanking,
        )

        if (!settings.latencyCalibrated) {
            Spacer(Modifier.height(20.dp))
            NeonCard(onClick = onSettings, border = Neon.Cyan.copy(alpha = 0.5f), modifier = Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Headphones, contentDescription = null, tint = Neon.Cyan)
                    Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                        Text("채점 정확도 높이기", style = MaterialTheme.typography.titleMedium)
                        Text("10초 지연 보정을 하면 박자 채점이 정확해져요", color = Neon.TextMid, style = MaterialTheme.typography.bodyMedium)
                    }
                    Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = Neon.TextLow)
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun BigMenu(icon: ImageVector, brush: Brush, title: String, subtitle: String, onClick: () -> Unit) {
    NeonCard(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(56.dp).clip(RoundedCornerShape(18.dp)).background(brush), contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(30.dp))
            }
            Column(Modifier.weight(1f).padding(horizontal = 16.dp)) {
                Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold)
                Text(subtitle, color = Neon.TextMid, style = MaterialTheme.typography.bodyMedium)
            }
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = Neon.TextLow)
        }
    }
}
