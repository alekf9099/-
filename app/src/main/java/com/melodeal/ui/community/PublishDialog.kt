package com.melodeal.ui.community

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.melodeal.studio.Composition
import com.melodeal.ui.app
import com.melodeal.ui.theme.Neon
import kotlinx.coroutines.launch

/** 내 노래를 멜로딜 피드에 공유. 닉네임이 없으면 같은 창에서 정한다 */
@Composable
fun PublishDialog(comp: Composition, onDismiss: () -> Unit, onPublished: (trackId: String) -> Unit) {
    val community = app().community
    val me by community.me.collectAsState()
    var signedIn by remember { mutableStateOf(me != null) }
    var nickname by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) {
        if (me == null) runCatching { community.signIn() }.onFailure { error = it.message }
        signedIn = true
    }
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text("멜로딜에 공유하기") },
        text = {
            Column {
                Text(
                    "「${comp.title}」을(를) 다른 사람들이 듣고 좋아요·별점·댓글을 남길 수 있어요. 멜로디·코드·가사가 공유되고, 언제든 공유를 취소할 수 있어요.",
                    color = Neon.TextMid, style = MaterialTheme.typography.bodySmall,
                )
                MelodyShape(comp, Modifier.fillMaxWidth().height(40.dp).padding(vertical = 10.dp).clip(RoundedCornerShape(8.dp)))
                if (!signedIn) {
                    CircularProgressIndicator(color = Neon.Pink)
                } else {
                    if (me == null) {
                        OutlinedTextField(nickname, { nickname = it.take(12); error = null }, label = { Text("활동할 닉네임") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    }
                    OutlinedTextField(
                        description, { description = it.take(200) },
                        label = { Text("곡 소개 (선택)") }, placeholder = { Text("예) 가사 붙여 주실 분 찾아요!") },
                        maxLines = 3, modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    )
                    if (comp.notes.size < 4) Text("음표가 너무 적어요. 조금 더 만들어 주세요", color = Neon.Gold, style = MaterialTheme.typography.labelMedium)
                    error?.let { Text(it, color = Neon.Red, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 6.dp)) }
                    Text("직접 만든 멜로디만 공유해 주세요. 다른 곡을 베낀 경우 신고되어 가려질 수 있어요.", color = Neon.TextLow, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 8.dp))
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = signedIn && !busy && comp.notes.size >= 4 && (me != null || nickname.trim().length >= 2),
                onClick = {
                    busy = true
                    scope.launch {
                        runCatching {
                            if (community.me.value == null) community.saveProfile(nickname, "")
                            community.publish(comp, description)
                        }.onSuccess { onPublished(it.id) }.onFailure { error = it.message }
                        busy = false
                    }
                },
            ) { Text(if (busy) "공유 중…" else "공유하기") }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text("취소") } },
    )
}
