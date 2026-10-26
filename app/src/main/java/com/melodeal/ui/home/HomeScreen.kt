package com.melodeal.ui.home

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import com.melodeal.studio.SavedComposition
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.LazyRow
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
import com.melodeal.ui.app
import com.melodeal.ui.components.BrandMark
import com.melodeal.ui.components.IconTile
import com.melodeal.ui.components.NeonCard
import com.melodeal.ui.components.PlayerAvatar
import com.melodeal.ui.components.SectionTitle
import com.melodeal.ui.components.stageGlow
import com.melodeal.ui.ranking.weekStartMillis
import com.melodeal.ui.theme.Neon

@Composable
fun HomeScreen(
    onParty: () -> Unit,
    onSolo: () -> Unit,
    onRanking: () -> Unit,
    onSettings: () -> Unit,
    onCreate: () -> Unit = {},
    onOpenSong: (Long) -> Unit = {},
) {
    val app = app()
    val mySongs by app.studio.all.collectAsState(initial = emptyList())
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
                Text("멜로딜", style = MaterialTheme.typography.headlineMedium)
                Text("흥얼거리면 노래가 되는", color = Neon.TextMid, style = MaterialTheme.typography.bodySmall)
            }
            IconButton(onClick = onSettings) { Icon(Icons.Outlined.Settings, contentDescription = "설정", tint = Neon.TextMid) }
        }

        CreateHero(onCreate)

        SectionTitle("내 노래 ${if (mySongs.isEmpty()) "" else mySongs.size}", Modifier.padding(top = 12.dp))
        if (mySongs.isEmpty()) {
            NeonCard(onClick = onCreate, modifier = Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.LibraryMusic, contentDescription = null, tint = Neon.TextLow)
                    Text(
                        "아직 만든 노래가 없어요. 30초만 흥얼거려 첫 곡을 만들어 보세요",
                        color = Neon.TextMid, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = 12.dp),
                    )
                }
            }
        } else {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(mySongs, key = { it.id }) { saved -> SongCard(saved, onClick = { onOpenSong(saved.id) }) }
            }
        }

        SectionTitle("함께 부르기", Modifier.padding(top = 12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            MiniMenu(Icons.Filled.Groups, Neon.Hero, "파티 모드", "돌아가며 대결", onParty, Modifier.weight(1f))
            MiniMenu(Icons.Filled.Mic, Neon.Cool, "노래방", "내 곡·샘플곡", onSolo, Modifier.weight(1f))
            MiniMenu(Icons.Filled.EmojiEvents, Neon.Warm, "랭킹", "곡별·주간", onRanking, Modifier.weight(1f))
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

/** 메인 CTA: 마이크를 감싸는 호(브랜드 마크)를 크게 깔고 "흥얼거리면 노래가 된다"를 보여준다 */
@Composable
private fun CreateHero(onClick: () -> Unit) {
    Box(
        Modifier
            .fillMaxWidth()
            .height(204.dp)
            .clip(RoundedCornerShape(28.dp))
            .background(Neon.Hero)
            .clickable(onClick = onClick),
    ) {
        Canvas(Modifier.matchParentSize()) {
            val c = Offset(size.width * 0.84f, size.height * 0.45f)
            listOf(70f, 110f, 150f).forEachIndexed { i, r ->
                val rr = r.dp.toPx()
                val stroke = Stroke(width = (10 - i * 3).dp.toPx(), cap = StrokeCap.Round)
                val a = 0.22f - i * 0.05f
                drawArc(Color.White.copy(alpha = a), 110f, 140f, false, Offset(c.x - rr, c.y - rr), Size(rr * 2, rr * 2), style = stroke)
                drawArc(Color.White.copy(alpha = a), -70f, 140f, false, Offset(c.x - rr, c.y - rr), Size(rr * 2, rr * 2), style = stroke)
            }
            // 흥얼거림이 음표가 되는 모양의 작은 음정 막대
            val bars = listOf(0.62f to 0.10f, 0.52f to 0.08f, 0.44f to 0.12f, 0.56f to 0.07f, 0.36f to 0.14f)
            var x = size.width * 0.58f
            bars.forEach { (y, w) ->
                val bw = size.width * w
                drawRoundRect(Color.White.copy(alpha = 0.32f), Offset(x, size.height * y), Size(bw - 6.dp.toPx(), 9.dp.toPx()), CornerRadius(5.dp.toPx()))
                x += bw
            }
            drawRect(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.18f))))
        }
        Column(Modifier.matchParentSize().padding(22.dp)) {
            Row(
                Modifier.clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.18f)).padding(horizontal = 10.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(4.dp))
                Text("악보 · 코드 · 반주 자동", color = Color.White, style = MaterialTheme.typography.labelMedium)
            }
            Spacer(Modifier.weight(1f))
            Text("새 노래 만들기", color = Color.White, style = MaterialTheme.typography.headlineLarge)
            Text("떠오르는 멜로디를 흥얼거리기만 하세요", color = Color.White.copy(alpha = 0.85f), style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(14.dp))
            Row(
                Modifier.clip(RoundedCornerShape(50)).background(Color.White).padding(horizontal = 16.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Mic, contentDescription = null, tint = Color(0xFF3B1A8F), modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text("흥얼거리기", color = Color(0xFF3B1A8F), style = MaterialTheme.typography.labelLarge)
            }
        }
    }
}

/** 내 노래 카드: 멜로디 모양을 미니 그래프로 */
@Composable
private fun SongCard(saved: SavedComposition, onClick: () -> Unit) {
    val c = saved.composition
    Column(
        Modifier.width(156.dp).clip(RoundedCornerShape(20.dp)).background(Neon.Surface)
            .border(1.dp, Neon.Outline, RoundedCornerShape(20.dp)).clickable(onClick = onClick).padding(14.dp),
    ) {
        Canvas(Modifier.fillMaxWidth().height(44.dp).clip(RoundedCornerShape(10.dp)).background(Neon.SurfaceHigh)) {
            val notes = c.notes
            if (notes.isEmpty()) return@Canvas
            val lo = notes.minOf { it.midi } - 1
            val hi = notes.maxOf { it.midi } + 1
            val total = notes.maxOf { it.endBeat }
            notes.forEach { n ->
                val x = (n.startBeat / total * size.width).toFloat()
                val w = (n.beats / total * size.width).toFloat().coerceAtLeast(2f)
                val y = size.height * (1f - (n.midi - lo).toFloat() / (hi - lo))
                drawRoundRect(Neon.Pink, Offset(x, y - 3f), Size(w - 1f, 6f), CornerRadius(3f))
            }
        }
        Text(c.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 10.dp))
        Text(
            "${c.genre.label} · ${c.key.label} · ${"%d:%02d".format(c.durationSec.toInt() / 60, c.durationSec.toInt() % 60)}",
            color = Neon.TextMid, style = MaterialTheme.typography.labelSmall, maxLines = 1,
        )
    }
}

@Composable
private fun MiniMenu(icon: ImageVector, brush: Brush, title: String, subtitle: String, onClick: () -> Unit, modifier: Modifier) {
    NeonCard(onClick = onClick, modifier = modifier) {
        Column {
            IconTile(icon, brush, 40.dp)
            Spacer(Modifier.height(12.dp))
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(subtitle, color = Neon.TextMid, style = MaterialTheme.typography.bodySmall)
        }
    }
}
