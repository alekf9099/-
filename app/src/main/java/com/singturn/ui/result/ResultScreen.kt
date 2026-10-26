package com.singturn.ui.result

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.singturn.data.db.ScoreEntity
import com.singturn.ui.app
import com.singturn.ui.components.GradientButton
import com.singturn.ui.components.NeonCard
import com.singturn.ui.components.Tag
import com.singturn.ui.theme.Neon

private data class ResultInfo(val score: ScoreEntity, val previousBest: Int?, val rank: Int?)

private fun grade(total: Int) = when {
    total >= 95 -> "S+"; total >= 90 -> "S"; total >= 80 -> "A"; total >= 70 -> "B"; total >= 55 -> "C"; else -> "D"
}

private fun comment(total: Int) = when {
    total >= 95 -> "가수 데뷔 각! 🎉"
    total >= 85 -> "와, 진짜 잘 불렀어요!"
    total >= 70 -> "분위기 제대로 띄웠어요"
    total >= 50 -> "다음엔 더 잘할 수 있어요"
    else -> "용기 낸 게 제일 멋있어요"
}

@Composable
fun ResultScreen(
    scoreId: Long,
    party: Boolean,
    onNextTurn: () -> Unit,
    onRetry: (songId: String, player: String) -> Unit,
    onHome: () -> Unit,
    onRanking: () -> Unit,
) {
    val dao = app().db.scores()
    var info by remember { mutableStateOf<ResultInfo?>(null) }
    LaunchedEffect(scoreId) {
        val s = dao.byId(scoreId) ?: return@LaunchedEffect
        info = ResultInfo(
            s,
            if (s.ranked) dao.previousBest(s.songId, s.playerName, s.id) else null,
            if (s.ranked) dao.rankFor(s.songId, s.total) else null,
        )
    }
    val r = info
    if (r == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Neon.Pink) }
        return
    }
    val s = r.score
    val shown = remember { Animatable(0f) }
    LaunchedEffect(s.id) { shown.animateTo(s.total.toFloat(), tween(1400, easing = FastOutSlowInEasing)) }
    val newRecord = s.ranked && (r.previousBest == null || s.total > r.previousBest)

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(s.songTitle, style = MaterialTheme.typography.titleMedium, color = Neon.TextMid, textAlign = TextAlign.Center)
        Text("${s.playerName}님의 점수", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(12.dp))
        Text(grade(s.total), fontSize = 40.sp, fontWeight = FontWeight.Black, color = Neon.Pink)
        Text("${shown.value.toInt()}", style = MaterialTheme.typography.displayLarge, color = Neon.Gold)
        Text(comment(s.total), style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            if (newRecord && r.previousBest != null) Tag("개인 최고 기록! (이전 ${r.previousBest}점)", Neon.Lime)
            if (newRecord && r.previousBest == null) Tag("첫 기록", Neon.Lime)
            r.rank?.let { Tag("곡 랭킹 ${it}위", Neon.Gold) }
            if (!s.ranked) Tag("참고용 점수 · 랭킹 미반영", Neon.TextLow)
        }
        Spacer(Modifier.height(20.dp))

        NeonCard(modifier = Modifier.fillMaxWidth()) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (s.ranked) {
                    ScoreBar("음정", s.pitch, Neon.Pink)
                    ScoreBar("박자", s.rhythm, Neon.Cyan)
                    ScoreBar("안정감", s.stability, Neon.Gold)
                } else {
                    ScoreBar("음정 안정도", s.pitch, Neon.Pink)
                    ScoreBar("발성 비율", s.rhythm, Neon.Cyan)
                    ScoreBar("표현력(강약)", s.stability, Neon.Gold)
                }
            }
        }
        if (s.ranked) {
            Spacer(Modifier.height(10.dp))
            NeonCard(modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                    Count("PERFECT", s.perfect, Neon.Gold)
                    Count("GREAT", s.great, Neon.Lime)
                    Count("GOOD", s.good, Neon.Cyan)
                    Count("MISS", s.miss, Neon.TextLow)
                    Count("콤보", s.maxCombo, Neon.Pink)
                }
            }
        }
        Spacer(Modifier.height(24.dp))
        if (party) {
            GradientButton("다음 차례로", Neon.Hero, icon = Icons.Filled.SkipNext, onClick = onNextTurn, modifier = Modifier.fillMaxWidth())
        } else {
            GradientButton("다시 부르기", Neon.Hero, icon = Icons.Filled.Refresh, onClick = { onRetry(s.songId, s.playerName) }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedButton(onClick = onHome, modifier = Modifier.weight(1f).height(52.dp)) {
                    Icon(Icons.Filled.Home, contentDescription = null); Spacer(Modifier.width(6.dp)); Text("홈")
                }
                OutlinedButton(onClick = onRanking, modifier = Modifier.weight(1f).height(52.dp)) {
                    Icon(Icons.Filled.EmojiEvents, contentDescription = null); Spacer(Modifier.width(6.dp)); Text("랭킹")
                }
            }
        }
    }
}

@Composable
private fun ScoreBar(label: String, value: Int, color: Color) {
    val anim = remember { Animatable(0f) }
    LaunchedEffect(value) { anim.animateTo(value / 100f, tween(1200)) }
    Column {
        Row {
            Text(label, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            Text("$value", style = MaterialTheme.typography.titleMedium, color = color)
        }
        Spacer(Modifier.height(6.dp))
        Box(Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp)).background(Neon.SurfaceHigh)) {
            Box(Modifier.fillMaxWidth(anim.value).height(10.dp).clip(RoundedCornerShape(5.dp)).background(color))
        }
    }
}

@Composable
private fun Count(label: String, value: Int, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text("$value", style = MaterialTheme.typography.titleLarge, color = color)
        Text(label, style = MaterialTheme.typography.labelMedium, color = Neon.TextLow)
    }
}
