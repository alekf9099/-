package com.singturn.ui.songs

import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.FileOpen
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SecondaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.singturn.data.song.Song
import com.singturn.party.Player
import com.singturn.ui.app
import com.singturn.ui.components.EmptyState
import com.singturn.ui.components.GradientButton
import com.singturn.ui.components.NeonCard
import com.singturn.ui.components.SingTopBar
import com.singturn.ui.components.Tag
import com.singturn.ui.theme.Neon
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SongListScreen(reserveFor: Player?, onBack: () -> Unit, onPick: (Song, myName: String) -> Unit) {
    val app = app()
    val repo = app.songs
    val settings by app.settings.state.collectAsState()
    val imported by repo.imported.collectAsState(initial = emptyList())
    val mine by repo.mine.collectAsState(initial = emptyList())
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var query by rememberSaveable { mutableStateOf("") }
    var pendingImport by remember { mutableStateOf<Uri?>(null) }
    var toDelete by remember { mutableStateOf<Song?>(null) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val audioPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            // 앱을 다시 켜도 같은 파일을 재생할 수 있도록 읽기 권한을 유지
            runCatching { context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
            pendingImport = uri
        }
    }

    // 탭: 0 내 노래 · 1 샘플곡 · 2 내 MR
    val list = (when (tab) { 0 -> mine; 1 -> repo.builtin; else -> imported }).filter {
        query.isBlank() || it.title.contains(query.trim(), ignoreCase = true)
    }

    Column(Modifier.fillMaxSize()) {
        SingTopBar(reserveFor?.let { "${it.name}님 곡 예약" } ?: "곡 고르기", onBack)
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            placeholder = { Text("곡 제목 검색") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
        )
        SecondaryTabRow(selectedTabIndex = tab, containerColor = Neon.Bg, modifier = Modifier.padding(top = 8.dp)) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("내 노래 ${mine.size}") })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("샘플곡 ${repo.builtin.size}") })
            Tab(selected = tab == 2, onClick = { tab = 2 }, text = { Text("내 MR ${imported.size}") })
        }
        LazyColumn(
            Modifier.weight(1f).padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item { Spacer(Modifier.height(4.dp)) }
            if (tab == 2) {
                item {
                    NeonCard(modifier = Modifier.fillMaxWidth(), border = Neon.Cyan.copy(alpha = 0.4f)) {
                        Column {
                            Text("내 기기의 MR 파일로 부르기", style = MaterialTheme.typography.titleMedium)
                            Text(
                                "파일은 내 폰에서만 재생되고 업로드되지 않아요. 기준 멜로디가 없어 점수는 참고용이며 랭킹에 반영되지 않아요.",
                                color = Neon.TextMid, style = MaterialTheme.typography.bodyMedium,
                                modifier = Modifier.padding(vertical = 8.dp),
                            )
                            GradientButton("MR 파일 불러오기", Neon.Cool, icon = Icons.Filled.UploadFile, modifier = Modifier.fillMaxWidth()) {
                                audioPicker.launch(arrayOf("audio/*"))
                            }
                        }
                    }
                }
            }
            if (list.isEmpty()) {
                item {
                    EmptyState(
                        Icons.Filled.LibraryMusic,
                        if (query.isNotBlank()) "검색 결과가 없어요" else if (tab == 0) "아직 만든 노래가 없어요" else "곡이 없어요",
                        when { query.isNotBlank() -> "다른 검색어를 입력해 보세요"; tab == 0 -> "홈에서 '새 노래 만들기'로 첫 곡을 만들어 보세요"; else -> "위 버튼으로 MR을 추가해 보세요" },
                    )
                }
            }
            items(list, key = { it.id }) { song ->
                NeonCard(onClick = { onPick(song, settings.myName.ifBlank { "나" }) }, modifier = Modifier.fillMaxWidth()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(song.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(song.credit, color = Neon.TextMid, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                if (song.hasReference) Tag("정식 채점", Neon.Lime) else Tag("참고용 채점", Neon.Gold)
                                if (tab == 0) Tag("${song.genre.label} · 내가 만든 곡", Neon.Pink)
                                if (tab == 1) Tag("퍼블릭 도메인", Neon.Cyan)
                                if (song.lines.isEmpty()) Tag("가사 없음", Neon.TextLow)
                            }
                        }
                        if (tab == 2) {
                            IconButton(onClick = { toDelete = song }) { Icon(Icons.Filled.Delete, contentDescription = "삭제", tint = Neon.TextLow) }
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }

    pendingImport?.let { uri ->
        ImportDialog(
            uri = uri,
            onDismiss = { pendingImport = null },
            onConfirm = { title, lrc ->
                pendingImport = null
                scope.launch { repo.import(title, uri.toString(), lrc) }
            },
        )
    }
    toDelete?.let { song ->
        AlertDialog(
            onDismissRequest = { toDelete = null },
            title = { Text("목록에서 삭제할까요?") },
            text = { Text("'${song.title}'을(를) 목록에서 지워요. 기기의 원본 파일은 지워지지 않아요.") },
            confirmButton = { TextButton(onClick = { scope.launch { repo.deleteImported(song) }; toDelete = null }) { Text("삭제", color = Neon.Red) } },
            dismissButton = { TextButton(onClick = { toDelete = null }) { Text("취소") } },
        )
    }
}

@Composable
private fun ImportDialog(uri: Uri, onDismiss: () -> Unit, onConfirm: (title: String, lrc: String?) -> Unit) {
    val context = LocalContext.current
    val defaultTitle = remember(uri) {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst()) c.getString(0)?.substringBeforeLast('.') else null
        } ?: "내 MR"
    }
    var title by remember { mutableStateOf(defaultTitle) }
    var lrc by remember { mutableStateOf<String?>(null) }
    val lrcPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { picked ->
        if (picked != null) {
            lrc = runCatching {
                context.contentResolver.openInputStream(picked)?.bufferedReader()?.use { it.readText() }
            }.getOrNull()
        }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("MR 추가") },
        text = {
            Column {
                OutlinedTextField(value = title, onValueChange = { title = it.take(40) }, label = { Text("곡 제목") }, singleLine = true)
                Spacer(Modifier.height(12.dp))
                OutlinedButton(onClick = { lrcPicker.launch(arrayOf("*/*")) }, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Filled.FileOpen, contentDescription = null)
                    Spacer(Modifier.width(6.dp))
                    Text(if (lrc == null) "가사 파일(.lrc) 추가 (선택)" else "가사 파일 추가됨")
                }
                Text(
                    "직접 작성했거나 이용 허락을 받은 가사 파일만 사용해 주세요.",
                    color = Neon.TextLow, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 6.dp),
                )
            }
        },
        confirmButton = { TextButton(enabled = title.isNotBlank(), onClick = { onConfirm(title.trim(), lrc) }) { Text("추가") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("취소") } },
    )
}
