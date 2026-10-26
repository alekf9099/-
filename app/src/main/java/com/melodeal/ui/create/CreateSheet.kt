package com.melodeal.ui.create

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.QueueMusic
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.melodeal.studio.SavedComposition
import com.melodeal.ui.app
import com.melodeal.ui.components.CoverArt
import com.melodeal.ui.components.IconTile
import com.melodeal.ui.community.relativeTime
import com.melodeal.ui.theme.Neon

/** 가운데 ＋ 버튼: 무엇을 할지 고르는 시트 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateSheet(onDismiss: () -> Unit, onRecord: () -> Unit, onOpenSong: (Long) -> Unit, onSing: () -> Unit, onParty: () -> Unit) {
    val songs by app().studio.all.collectAsState(initial = emptyList())
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Neon.Surface) {
        CreateSheetContent(songs.take(3), onRecord, onOpenSong, onSing, onParty)
    }
}

@Composable
fun CreateSheetContent(recent: List<SavedComposition>, onRecord: () -> Unit = {}, onOpenSong: (Long) -> Unit = {}, onSing: () -> Unit = {}, onParty: () -> Unit = {}) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).navigationBarsPadding().padding(bottom = 16.dp)) {
        Text("만들기", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(bottom = 12.dp))
        // 메인: 흥얼거려 만들기
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Neon.Hero).clickable(onClick = onRecord).padding(18.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
                    Text(" 악보 · 코드 · 반주 자동", color = Color.White, style = MaterialTheme.typography.labelMedium)
                }
                Text("흥얼거려 새 노래 만들기", color = Color.White, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 6.dp))
                Text("떠오르는 멜로디를 30초만 불러 보세요", color = Color.White.copy(alpha = 0.88f), style = MaterialTheme.typography.bodySmall)
            }
            IconTile(Icons.Filled.Mic, Brush.linearGradient(listOf(Color.White.copy(alpha = 0.22f), Color.White.copy(alpha = 0.12f))), 52.dp)
        }
        if (recent.isNotEmpty()) {
            Text("이어서 편집", style = MaterialTheme.typography.titleSmall, color = Neon.TextMid, modifier = Modifier.padding(top = 18.dp, bottom = 6.dp))
            recent.forEach { s ->
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable { onOpenSong(s.id) }.padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    CoverArt(s.publishedTrackId ?: "local-${s.id}", s.composition, Modifier.size(44.dp), RoundedCornerShape(12.dp))
                    Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                        Text(s.composition.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${s.composition.genre.label} · ${relativeTime(s.updatedAt)} 수정", color = Neon.TextMid, style = MaterialTheme.typography.labelSmall)
                    }
                    Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = Neon.TextLow)
                }
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth()) {
            Option(Icons.Filled.QueueMusic, "노래방에서 부르기", onSing, Modifier.weight(1f))
            Spacer(Modifier.size(10.dp))
            Option(Icons.Filled.Groups, "파티 모드", onParty, Modifier.weight(1f))
        }
    }
}

@Composable
private fun Option(icon: ImageVector, label: String, onClick: () -> Unit, modifier: Modifier) {
    Row(
        modifier.clip(RoundedCornerShape(16.dp)).background(Neon.SurfaceHigh).clickable(onClick = onClick).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = Neon.Cyan)
        Text(label, style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(start = 8.dp))
    }
}
