package com.melodeal.ui.studio

import android.content.Intent
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
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.IosShare
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.melodeal.data.song.Genre
import com.melodeal.studio.ChordSymbol
import com.melodeal.studio.LyricsFitter
import com.melodeal.studio.noteName
import com.melodeal.ui.appViewModel
import com.melodeal.ui.community.PublishDialog
import com.melodeal.ui.components.GradientButton
import com.melodeal.ui.components.NeonCard
import com.melodeal.ui.components.SectionTitle
import com.melodeal.ui.theme.Neon
import kotlinx.coroutines.launch

/** 편집 화면에서 쓰는 동작 묶음 */
class EditorActions(
    val onBack: () -> Unit = {},
    val onUndo: () -> Unit = {},
    val onRename: () -> Unit = {},
    val onDelete: () -> Unit = {},
    val onTapNote: (Int) -> Unit = {},
    val onTapEmpty: (Double, Int) -> Unit = { _, _ -> },
    val onTapChord: (Int) -> Unit = {},
    val onPitch: (Int) -> Unit = {},
    val onTime: (Int) -> Unit = {},
    val onResize: (Int) -> Unit = {},
    val onDeleteNote: () -> Unit = {},
    val onTranspose: (Int) -> Unit = {},
    val onGenre: (Genre) -> Unit = {},
    val onBpm: (Int) -> Unit = {},
    val onAutoChords: () -> Unit = {},
    val onChordBeats: (Int) -> Unit = {},
    val onLyrics: (String) -> Unit = {},
    val onPreview: () -> Unit = {},
    val onMelody: (Boolean) -> Unit = {},
    val onSing: () -> Unit = {},
    val onExport: () -> Unit = {},
    val onPublish: () -> Unit = {},
)

@Composable
fun EditorScreen(id: Long, onBack: () -> Unit, onSing: (songId: String) -> Unit, onPublished: (trackId: String) -> Unit = {}) {
    val vm = appViewModel("editor:$id") { EditorViewModel(it, id) }
    val s by vm.state.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var chordSlot by remember { mutableStateOf<Int?>(null) }
    var renaming by remember { mutableStateOf(false) }
    var exporting by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    var publishing by remember { mutableStateOf(false) }

    // 내보낸 파일을 공유 시트로
    LaunchedEffect(s.exportedFile) {
        val file = s.exportedFile ?: return@LaunchedEffect
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        val send = Intent(Intent.ACTION_SEND).setType("audio/wav").putExtra(Intent.EXTRA_STREAM, uri)
            .putExtra(Intent.EXTRA_TITLE, file.nameWithoutExtension).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        context.startActivity(Intent.createChooser(send, "내 노래 공유하기"))
        vm.consumeExport()
    }

    EditorContent(
        s,
        EditorActions(
            onBack = { vm.stopPreview(); onBack() },
            onUndo = vm::undo,
            onRename = { renaming = true },
            onDelete = { deleting = true },
            onTapNote = { if (it < 0) vm.select(null) else vm.select(it) },
            onTapEmpty = vm::addNote,
            onTapChord = { chordSlot = it },
            onPitch = vm::shiftPitch, onTime = vm::shiftTime, onResize = vm::resize, onDeleteNote = vm::deleteSelected,
            onTranspose = vm::transpose, onGenre = vm::setGenre, onBpm = vm::setBpm,
            onAutoChords = vm::autoChords, onChordBeats = vm::setChordBeats, onLyrics = vm::setLyrics,
            onPreview = vm::togglePreview, onMelody = vm::setMelodyOn,
            onSing = { vm.stopPreview(); scope.launch { onSing(vm.songId) } },
            onExport = { exporting = true },
            onPublish = { vm.stopPreview(); publishing = true },
        ),
    )

    if (publishing) {
        PublishDialog(s.comp, onDismiss = { publishing = false }) { trackId ->
            publishing = false
            onPublished(trackId)
        }
    }

    chordSlot?.let { slot ->
        val comp = s.comp
        AlertDialog(
            onDismissRequest = { chordSlot = null },
            title = { Text("${slot * comp.chordBeats / comp.beatsPerBar + 1}마디 코드") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${comp.key.label}에 어울리는 코드예요", color = Neon.TextMid, style = MaterialTheme.typography.bodySmall)
                    comp.key.chordChoices.chunked(4).forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            row.forEach { chord ->
                                val current = comp.chords.getOrNull(slot) == chord
                                ChordOption(chord, current, Modifier.weight(1f)) { vm.setChord(slot, chord); chordSlot = null }
                            }
                            repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { chordSlot = null }) { Text("닫기") } },
        )
    }
    if (renaming) {
        var title by remember { mutableStateOf(s.comp.title) }
        AlertDialog(
            onDismissRequest = { renaming = false },
            title = { Text("곡 제목") },
            text = { OutlinedTextField(value = title, onValueChange = { title = it.take(30) }, singleLine = true) },
            confirmButton = { TextButton(onClick = { vm.setTitle(title); renaming = false }) { Text("저장") } },
            dismissButton = { TextButton(onClick = { renaming = false }) { Text("취소") } },
        )
    }
    if (exporting) {
        AlertDialog(
            onDismissRequest = { exporting = false },
            title = { Text("음원으로 내보내기") },
            text = { Text("WAV 파일로 저장해 메신저·SNS로 공유할 수 있어요. 반주만(MR) 내보내면 다른 앱에서 내 목소리를 얹어 녹음할 수 있어요.") },
            confirmButton = { TextButton(onClick = { vm.export(withMelody = true); exporting = false }) { Text("멜로디 포함") } },
            dismissButton = { TextButton(onClick = { vm.export(withMelody = false); exporting = false }) { Text("반주만 (MR)") } },
        )
    }
    if (deleting) {
        AlertDialog(
            onDismissRequest = { deleting = false },
            title = { Text("이 곡을 지울까요?") },
            text = { Text("'${s.comp.title}'의 악보·코드·가사가 모두 지워지고 되돌릴 수 없어요.") },
            confirmButton = { TextButton(onClick = { deleting = false; scope.launch { vm.delete(); onBack() } }) { Text("삭제", color = Neon.Red) } },
            dismissButton = { TextButton(onClick = { deleting = false }) { Text("취소") } },
        )
    }
}

@Composable
private fun ChordOption(chord: ChordSymbol, current: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Text(
        chord.name,
        textAlign = TextAlign.Center,
        style = MaterialTheme.typography.titleMedium,
        color = if (current) Color.White else Neon.Cyan,
        modifier = modifier.clip(RoundedCornerShape(12.dp)).background(if (current) Neon.Violet else Neon.SurfaceHigh)
            .clickable(onClick = onClick).padding(vertical = 12.dp),
    )
}

/** 상태만으로 그리는 편집 화면 (스크린샷 테스트에서도 사용) */
@Composable
fun EditorContent(s: EditorUiState, a: EditorActions) {
    val comp = s.comp
    Column(Modifier.fillMaxSize()) {
        // 상단 바
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = a.onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "뒤로") }
            Row(Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).clickable(onClick = a.onRename).padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(comp.title, style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                Icon(Icons.Filled.Edit, contentDescription = "제목 바꾸기", tint = Neon.TextLow, modifier = Modifier.padding(start = 6.dp).size(16.dp))
            }
            IconButton(onClick = a.onUndo, enabled = s.canUndo) { Icon(Icons.AutoMirrored.Filled.Undo, contentDescription = "되돌리기") }
            IconButton(onClick = a.onExport) { Icon(Icons.Filled.IosShare, contentDescription = "음원 내보내기", tint = Neon.TextMid) }
            IconButton(onClick = a.onDelete) { Icon(Icons.Filled.DeleteOutline, contentDescription = "곡 삭제", tint = Neon.TextMid) }
        }
        if (!s.loaded) {
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                if (s.message != null) Text(s.message, color = Neon.TextMid) else CircularProgressIndicator(color = Neon.Pink)
            }
            return@Column
        }

        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
            // 곡 정보: 조성 · 빠르기 · 장르
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                InfoStepper("조성", comp.key.label, Modifier.weight(1f), onMinus = { a.onTranspose(-1) }, onPlus = { a.onTranspose(1) })
                InfoStepper("빠르기", "${comp.bpm} BPM", Modifier.weight(1f), onMinus = { a.onBpm(comp.bpm - 4) }, onPlus = { a.onBpm(comp.bpm + 4) })
            }
            Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Genre.entries.forEach { g ->
                    FilterChip(
                        selected = comp.genre == g, onClick = { a.onGenre(g) }, label = { Text(g.label) },
                        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = Neon.Violet.copy(alpha = 0.4f), selectedLabelColor = Color.White),
                    )
                }
            }

            SectionTitle("멜로디 · 코드")
            PianoRoll(comp, s.selected, s.playheadBeat, a.onTapNote, a.onTapEmpty, a.onTapChord)

            // 선택한 음표 편집 도구
            val sel = s.selectedNote
            if (sel != null) {
                NeonCard(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), background = Neon.SurfaceHigh, border = Neon.Pink.copy(alpha = 0.4f)) {
                    Column {
                        Text("${noteName(sel.midi)} · ${formatBeats(sel.beats)}", style = MaterialTheme.typography.titleSmall, color = Neon.Pink)
                        Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                            ToolButton(Icons.Filled.KeyboardArrowUp, "음 올리기") { a.onPitch(1) }
                            ToolButton(Icons.Filled.KeyboardArrowDown, "음 내리기") { a.onPitch(-1) }
                            ToolButton(Icons.AutoMirrored.Filled.KeyboardArrowLeft, "앞으로") { a.onTime(-1) }
                            ToolButton(Icons.AutoMirrored.Filled.KeyboardArrowRight, "뒤로") { a.onTime(1) }
                            ToolButton(Icons.Filled.Remove, "짧게") { a.onResize(-1) }
                            ToolButton(Icons.Filled.Add, "길게") { a.onResize(1) }
                            ToolButton(Icons.Filled.Delete, "삭제", Neon.Red, a.onDeleteNote)
                        }
                    }
                }
            } else {
                Text(
                    "빈 칸을 누르면 음표가 생기고, 음표를 누르면 높이·길이를 바꿀 수 있어요. 아래 코드를 누르면 다른 코드로 바꿀 수 있어요.",
                    color = Neon.TextLow, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp, start = 4.dp),
                )
            }

            Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Row(
                    Modifier.clip(RoundedCornerShape(12.dp)).background(Neon.Cyan.copy(alpha = 0.12f)).clickable(onClick = a.onAutoChords).padding(horizontal = 12.dp, vertical = 9.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Filled.AutoAwesome, contentDescription = null, tint = Neon.Cyan, modifier = Modifier.size(16.dp))
                    Text(" 코드 자동으로 다시", color = Neon.Cyan, style = MaterialTheme.typography.labelLarge)
                }
                if (comp.beatsPerBar == 4) {
                    Spacer(Modifier.weight(1f))
                    Text("코드 바뀜", color = Neon.TextLow, style = MaterialTheme.typography.labelMedium)
                    listOf(2 to "반 마디", 4 to "한 마디").forEach { (b, label) ->
                        val on = comp.chordBeats == b
                        Text(
                            label, style = MaterialTheme.typography.labelMedium, color = if (on) Color.White else Neon.TextMid,
                            modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(if (on) Neon.Violet.copy(alpha = 0.5f) else Neon.SurfaceHigh)
                                .clickable { a.onChordBeats(b) }.padding(horizontal = 10.dp, vertical = 7.dp),
                        )
                    }
                }
            }

            SectionTitle("가사")
            OutlinedTextField(
                value = comp.lyrics,
                onValueChange = a.onLyrics,
                placeholder = { Text("한 글자에 한 음씩 붙어요. 줄을 바꾸면 노래방 화면도 줄이 바뀌어요.") },
                minLines = 3,
                modifier = Modifier.fillMaxWidth(),
            )
            val diff = LyricsFitter.mismatch(comp.lyrics, comp.notes.size)
            Text(
                when {
                    comp.lyrics.isBlank() -> "음표 ${comp.notes.size}개 · 가사를 쓰면 음표 위에 글자가 붙어요"
                    diff == 0 -> "음표 ${comp.notes.size}개에 가사가 딱 맞아요"
                    diff > 0 -> "가사가 ${diff}글자 남아요 (음표를 더하거나 가사를 줄여 주세요)"
                    else -> "가사가 ${-diff}글자 모자라요 (뒷부분 음표는 가사 없이 불러요)"
                },
                color = if (diff == 0 || comp.lyrics.isBlank()) Neon.TextLow else Neon.Gold,
                style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp, start = 4.dp, bottom = 24.dp),
            )
        }

        // 하단: 미리듣기 · 부르기 · 내보내기
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)).background(Neon.Surface).padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            FilledIconButton(
                onClick = a.onPreview, modifier = Modifier.size(52.dp),
                colors = IconButtonDefaults.filledIconButtonColors(containerColor = Neon.SurfaceHigh),
            ) {
                when {
                    s.preparing -> CircularProgressIndicator(Modifier.size(20.dp), color = Neon.Pink, strokeWidth = 2.dp)
                    s.playing -> Icon(Icons.Filled.Stop, contentDescription = "멈추기", tint = Neon.Pink)
                    else -> Icon(Icons.Filled.PlayArrow, contentDescription = "미리듣기", tint = Neon.Pink)
                }
            }
            Column(Modifier.padding(horizontal = 10.dp).clickable { a.onMelody(!s.melodyOn) }) {
                Text("미리듣기", style = MaterialTheme.typography.labelLarge)
                Text(if (s.melodyOn) "멜로디 켜짐" else "반주만", color = Neon.TextLow, style = MaterialTheme.typography.labelSmall)
            }
            GradientButton("부르기", Neon.Hero, icon = Icons.Filled.Mic, onClick = a.onSing, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(8.dp))
            Column(
                Modifier.clip(RoundedCornerShape(16.dp)).background(Neon.SurfaceHigh).clickable(onClick = a.onPublish).padding(horizontal = 10.dp, vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(Icons.Filled.Public, contentDescription = null, tint = Neon.Cyan)
                Text("공유", style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

private fun formatBeats(b: Double) = when (b) {
    0.5 -> "8분음표"; 1.0 -> "4분음표"; 1.5 -> "점4분음표"; 2.0 -> "2분음표"; 3.0 -> "점2분음표"; 4.0 -> "온음표"
    else -> "${b}박"
}

@Composable
private fun InfoStepper(label: String, value: String, modifier: Modifier, onMinus: () -> Unit, onPlus: () -> Unit) {
    Row(
        modifier.clip(RoundedCornerShape(16.dp)).background(Neon.Surface).border(1.dp, Neon.Outline, RoundedCornerShape(16.dp)).padding(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onMinus, modifier = Modifier.size(36.dp)) { Icon(Icons.Filled.Remove, contentDescription = "$label 내리기", tint = Neon.TextMid, modifier = Modifier.size(18.dp)) }
        Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(label, color = Neon.TextLow, style = MaterialTheme.typography.labelSmall)
            Text(value, style = MaterialTheme.typography.titleSmall, maxLines = 1)
        }
        IconButton(onClick = onPlus, modifier = Modifier.size(36.dp)) { Icon(Icons.Filled.Add, contentDescription = "$label 올리기", tint = Neon.TextMid, modifier = Modifier.size(18.dp)) }
    }
}

@Composable
private fun ToolButton(icon: ImageVector, label: String, tint: Color = Neon.TextHigh, onClick: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.clip(RoundedCornerShape(10.dp)).clickable(onClick = onClick).padding(4.dp)) {
        Icon(icon, contentDescription = label, tint = tint, modifier = Modifier.size(24.dp))
        Text(label, color = Neon.TextLow, style = MaterialTheme.typography.labelSmall)
    }
}
