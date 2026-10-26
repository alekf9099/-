package com.singturn.ui.home

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.singturn.ui.app
import com.singturn.ui.components.BrandMark
import com.singturn.ui.components.IconTile
import com.singturn.ui.components.NeonCard
import com.singturn.ui.components.PlayerAvatar
import com.singturn.ui.components.SectionTitle
import com.singturn.ui.components.stageGlow
import com.singturn.ui.ranking.weekStartMillis
import com.singturn.ui.theme.Neon

@Composable
fun HomeScreen(onParty: () -> Unit, onSolo: () -> Unit, onRanking: () -> Unit, onSettings: () -> Unit) {
    val app = app()
    val settings by app.settings.state.collectAsState()
    val since = remember { weekStartMillis() }
    val weeklyTop by remember { app.db.scores().topSince(since, 1) }.collectAsState(initial = emptyList())

    Column(
        Modifier.fillMaxSize().stageGlow().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
    ) {
        // 헤더
        Row(Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 20.dp), verticalAlignment = Alignment.CenterVertically) {
            BrandMark(40.dp)
            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                Text("싱턴", style = MaterialTheme.typography.headlineMedium)
                Text("돌아가며 부르는 노래방", color = Neon.TextMid, style = MaterialTheme.typography.bodySmall)
            }
            IconButton(onClick = onSettings) { Icon(Icons.Outlined.Settings, contentDescription = "설정", tint = Neon.TextMid) }
        }

        PartyHero(onParty)
        Spacer(Modifier.height(12.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            MiniMenu(Icons.Filled.Mic, Neon.Cool, "혼자 부르기", "연습하고 기록 갱신", onSolo, Modifier.weight(1f))
            MiniMenu(Icons.Filled.EmojiEvents, Neon.Warm, "랭킹", "곡별 · 주간 순위", onRanking, Modifier.weight(1f))
        }

        SectionTitle("이번 주 최고 기록", Modifier.padding(top = 12.dp))
        val top = weeklyTop.firstOrNull()
        NeonCard(onClick = onRanking, modifier = Modifier.fillMaxWidth()) {
            if (top == null) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.EmojiEvents, contentDescription = null, tint = Neon.TextLow)
                    Text(
                        "아직 이번 주 기록이 없어요. 첫 1위를 차지해 보세요",
                        color = Neon.TextMid, style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(start = 12.dp),
                    )
                }
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    PlayerAvatar(top.playerName, Neon.Gold, 44)
                    Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                        Text(top.playerName, style = MaterialTheme.typography.titleMedium)
                        Text(top.songTitle, color = Neon.TextMid, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                    }
                    Text("${top.total}", style = MaterialTheme.typography.headlineLarge, color = Neon.Gold)
                    Text("점", color = Neon.TextLow, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(start = 2.dp, top = 8.dp))
                }
            }
        }

        if (!settings.latencyCalibrated) {
            Spacer(Modifier.height(12.dp))
            Row(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(Neon.Cyan.copy(alpha = 0.08f))
                    .border(1.dp, Neon.Cyan.copy(alpha = 0.2f), RoundedCornerShape(16.dp))
                    .clickable(onClick = onSettings)
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.GraphicEq, contentDescription = null, tint = Neon.Cyan, modifier = Modifier.size(20.dp))
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text("박자 채점 정확도 높이기", style = MaterialTheme.typography.titleSmall)
                    Text("6초 지연 보정으로 내 폰·이어폰에 맞춰요", color = Neon.TextMid, style = MaterialTheme.typography.bodySmall)
                }
                Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = Neon.TextLow)
            }
        }
        Spacer(Modifier.height(28.dp))
    }
}

/** 메인 CTA: 브랜드 마크의 회전 호를 크게 깔아 "번갈아 부르기"를 시각화 */
@Composable
private fun PartyHero(onClick: () -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .height(196.dp)
            .clip(RoundedCornerShape(28.dp))
            .background(Neon.Hero)
            .clickable(onClick = onClick),
    ) {
        Canvas(Modifier.matchParentSize()) {
            val c = Offset(size.width * 0.86f, size.height * 0.42f)
            listOf(70f, 110f, 150f).forEachIndexed { i, r ->
                val rr = r.dp.toPx()
                val stroke = Stroke(width = (10 - i * 3).dp.toPx(), cap = StrokeCap.Round)
                val a = 0.22f - i * 0.05f
                drawArc(Color.White.copy(alpha = a), 110f, 140f, false, Offset(c.x - rr, c.y - rr), Size(rr * 2, rr * 2), style = stroke)
                drawArc(Color.White.copy(alpha = a), -70f, 140f, false, Offset(c.x - rr, c.y - rr), Size(rr * 2, rr * 2), style = stroke)
            }
            drawRect(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.18f))))
        }
        Column(Modifier.matchParentSize().padding(22.dp)) {
            Row(
                Modifier.clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.18f)).padding(horizontal = 10.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Groups, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(4.dp))
                Text("2~12명", color = Color.White, style = MaterialTheme.typography.labelMedium)
            }
            Spacer(Modifier.weight(1f))
            Text("파티 모드", color = Color.White, style = MaterialTheme.typography.headlineLarge)
            Text("한 폰으로 순서대로 마이크를 넘겨요", color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(14.dp))
            Row(
                Modifier.clip(RoundedCornerShape(50)).background(Color.White).padding(horizontal = 16.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("시작하기", color = Color(0xFF3B1A8F), style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.width(6.dp))
                Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = Color(0xFF3B1A8F), modifier = Modifier.size(16.dp))
            }
        }
    }
}

@Composable
private fun MiniMenu(icon: ImageVector, brush: Brush, title: String, subtitle: String, onClick: () -> Unit, modifier: Modifier) {
    NeonCard(onClick = onClick, modifier = modifier) {
        Column {
            IconTile(icon, brush, 44.dp)
            Spacer(Modifier.height(14.dp))
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(subtitle, color = Neon.TextMid, style = MaterialTheme.typography.bodySmall)
        }
    }
}
