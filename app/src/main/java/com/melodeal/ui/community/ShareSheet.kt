package com.melodeal.ui.community

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Celebration
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RangeSlider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.melodeal.community.ShareCut
import com.melodeal.community.ShareSettings
import com.melodeal.community.Track
import com.melodeal.community.Visibility
import com.melodeal.studio.Composition
import com.melodeal.ui.app
import com.melodeal.ui.components.CoverArt
import com.melodeal.ui.components.GradientButton
import com.melodeal.ui.theme.Neon
import kotlinx.coroutines.launch
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

/** 공개 범위: 전체 공개 · 링크 공개 · 비공개(서버에 올리지 않음) */
enum class ShareMode(val label: String, val caption: String, val icon: ImageVector) {
    PUBLIC("전체 공개", "홈 · 차트에 올라가요", Icons.Filled.Public),
    LINK("링크 공개", "링크를 받은 사람만 · 차트 제외", Icons.Filled.Link),
    PRIVATE("비공개", "내 폰에만 두기 (올리지 않음)", Icons.Filled.Lock),
}

data class ShareDraft(
    val mode: ShareMode = ShareMode.PUBLIC,
    val settings: ShareSettings,
    val description: String = "",
    val nickname: String = "",
) {
    val visibility get() = if (mode == ShareMode.LINK) Visibility.UNLISTED else Visibility.PUBLIC

    companion object {
        fun of(original: Composition?, existing: Track?): ShareDraft {
            if (existing == null) return ShareDraft(settings = ShareSettings.full(original!!))
            val c = existing.composition
            return ShareDraft(
                mode = if (existing.visibility == Visibility.UNLISTED) ShareMode.LINK else ShareMode.PUBLIC,
                settings = ShareSettings(
                    visibility = existing.visibility, startBar = existing.highlightStartBar, bars = c.bars,
                    includeLyrics = existing.hasLyrics, includeChords = c.chords.isNotEmpty(),
                    allowRemix = existing.allowRemix, allowSing = existing.allowSing,
                ),
                description = existing.description,
            )
        }
    }
}

/**
 * 공유 설정 시트.
 * @param original 내 폰에 있는 원본 (없으면 범위는 못 바꾸고 공개 범위·허용만 바꿀 수 있다)
 * @param existing 이미 공유한 곡이면 그 곡 (설정 바꾸기)
 * @param onDone 공유된 곡 id (공유 취소·비공개면 null)
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareSheet(original: Composition?, existing: Track?, onDismiss: () -> Unit, onDone: (trackId: String?) -> Unit) {
    val community = app().community
    val me by community.me.collectAsState()
    var draft by remember { mutableStateOf(ShareDraft.of(original, existing)) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var celebrate by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    LaunchedEffect(Unit) { if (me == null) runCatching { community.signIn() } }

    fun submit() {
        busy = true; error = null
        scope.launch {
            runCatching {
                val s = draft.settings.copy(visibility = draft.visibility)
                when {
                    draft.mode == ShareMode.PRIVATE -> { existing?.let { community.deleteTrack(it.id) }; null to false }
                    existing != null -> community.updateShare(existing.id, s, original, draft.description).id to false
                    else -> {
                        if (community.me.value == null) community.saveProfile(draft.nickname, "")
                        val first = runCatching { community.tracksBy(community.me.value!!.id).isEmpty() }.getOrDefault(false)
                        community.publish(original!!, draft.description, s).id to first
                    }
                }
            }.onSuccess { (id, first) ->
                PreviewPlayer.stop()
                if (first && id != null) celebrate = id else onDone(id)
            }.onFailure { error = it.message }
            busy = false
        }
    }

    if (celebrate != null) {
        FirstShareCelebration(onClose = { val id = celebrate; celebrate = null; onDone(id) })
        return
    }
    ModalBottomSheet(onDismissRequest = { PreviewPlayer.stop(); if (!busy) onDismiss() }, sheetState = sheet, containerColor = Neon.Surface) {
        ShareSheetContent(
            original = original, existing = existing, draft = draft, needNickname = me == null && existing == null,
            busy = busy, error = error, onChange = { draft = it }, onSubmit = ::submit,
        )
    }
}

@Composable
fun ShareSheetContent(
    original: Composition?,
    existing: Track?,
    draft: ShareDraft,
    needNickname: Boolean = false,
    busy: Boolean = false,
    error: String? = null,
    onChange: (ShareDraft) -> Unit = {},
    onSubmit: () -> Unit = {},
) {
    val s = draft.settings
    val st by PreviewPlayer.state.collectAsState()
    val title = original?.title ?: existing?.title.orEmpty()
    val previewId = "share-preview"
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).navigationBarsPadding().padding(bottom = 16.dp)) {
        // 머리: 커버 + 제목
        Row(verticalAlignment = Alignment.CenterVertically) {
            CoverArt(existing?.id ?: title, original ?: existing!!.composition, Modifier.size(56.dp), RoundedCornerShape(14.dp))
            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                Text(if (existing == null) "멜로딜에 공유하기" else "공유 설정", style = MaterialTheme.typography.titleLarge)
                Text("「$title」", color = Neon.TextMid, style = MaterialTheme.typography.bodyMedium, maxLines = 1)
            }
        }

        Label("누구에게 보여줄까요?")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ShareMode.entries.forEach { m ->
                val on = draft.mode == m
                Column(
                    Modifier.weight(1f).clip(RoundedCornerShape(16.dp))
                        .background(if (on) Neon.Pink.copy(alpha = 0.14f) else Neon.SurfaceHigh)
                        .border(1.5.dp, if (on) Neon.Pink else Color.Transparent, RoundedCornerShape(16.dp))
                        .clickable { onChange(draft.copy(mode = m)) }.padding(10.dp),
                ) {
                    Icon(m.icon, contentDescription = null, tint = if (on) Neon.Pink else Neon.TextMid, modifier = Modifier.size(20.dp))
                    Text(m.label, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 6.dp))
                    Text(m.caption, color = Neon.TextMid, style = MaterialTheme.typography.labelSmall, minLines = 2)
                }
            }
        }

        if (draft.mode != ShareMode.PRIVATE) {
            Label("어디까지 들려줄까요?")
            if (original == null) {
                Text(
                    "원본이 이 폰에 없어서 공개 구간은 바꿀 수 없어요. 지금은 ${s.bars}마디가 공개돼 있어요.",
                    color = Neon.TextMid, style = MaterialTheme.typography.bodySmall,
                )
            } else {
                val total = original.bars
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    QuickChip("전체", s.startBar == 0 && s.bars == total) { onChange(draft.copy(settings = s.copy(startBar = 0, bars = total))) }
                    if (total > 4) {
                        val h = ShareSettings.highlight(original)
                        QuickChip("하이라이트 추천", s.startBar == h.startBar && s.bars == h.bars, Icons.Filled.AutoAwesome) {
                            onChange(draft.copy(settings = s.copy(startBar = h.startBar, bars = h.bars)))
                        }
                        QuickChip("앞부분 4마디", s.startBar == 0 && s.bars == 4) { onChange(draft.copy(settings = s.copy(startBar = 0, bars = 4))) }
                    }
                }
                RangePreview(original, s, if (st.trackId == previewId) st.progress else null, Modifier.fillMaxWidth().padding(top = 12.dp).height(56.dp))
                if (total > 1) {
                    RangeSlider(
                        value = s.startBar.toFloat()..(s.startBar + s.bars).toFloat(),
                        onValueChange = { r ->
                            val a = r.start.roundToInt().coerceIn(0, total - 1)
                            val b = r.endInclusive.roundToInt().coerceIn(a + 1, total)
                            onChange(draft.copy(settings = s.copy(startBar = a, bars = b - a)))
                        },
                        valueRange = 0f..total.toFloat(),
                        steps = (total - 1).coerceAtLeast(0),
                        colors = SliderDefaults.colors(thumbColor = Neon.Pink, activeTrackColor = Neon.Pink, inactiveTrackColor = Neon.OutlineStrong, activeTickColor = Color.White.copy(alpha = 0.5f), inactiveTickColor = Neon.TextLow),
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        if (s.isPartial(total)) "${s.startBar + 1}~${s.startBar + s.bars}마디 공개 · 전체 ${total}마디 중 ${s.bars}마디" else "전체 ${total}마디 공개",
                        style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f),
                    )
                    val playing = st.trackId == previewId
                    Row(
                        Modifier.clip(RoundedCornerShape(50)).background(Neon.SurfaceHigh)
                            .clickable { if (playing) PreviewPlayer.stop() else PreviewPlayer.play(previewId, ShareCut.apply(original, s)) }
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, contentDescription = null, tint = Neon.Pink, modifier = Modifier.size(18.dp))
                        Text(if (playing) " 멈추기" else " 공개 부분 듣기", style = MaterialTheme.typography.labelLarge)
                    }
                }
            }

            Label("함께 공개 · 허용")
            Toggle("가사 공개", "끄면 멜로디만 올라가요", s.includeLyrics, enabled = original != null) { onChange(draft.copy(settings = s.copy(includeLyrics = it))) }
            Toggle("코드·반주 공개", "끄면 듣는 사람에게 멜로디만 들려요", s.includeChords, enabled = original != null) { onChange(draft.copy(settings = s.copy(includeChords = it))) }
            Toggle("리믹스 허용", "다른 사람이 내 곡을 가져와 고쳐 만들 수 있어요", s.allowRemix) { onChange(draft.copy(settings = s.copy(allowRemix = it))) }
            Toggle("부르기 허용", "다른 사람이 노래방으로 불러볼 수 있어요", s.allowSing) { onChange(draft.copy(settings = s.copy(allowSing = it))) }

            if (needNickname) {
                OutlinedTextField(
                    draft.nickname, { onChange(draft.copy(nickname = it.take(12))) }, label = { Text("활동할 닉네임 (2~12자)") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                )
            }
            OutlinedTextField(
                draft.description, { onChange(draft.copy(description = it.take(200))) },
                label = { Text("곡 소개 (선택)") }, placeholder = { Text("예) 후렴만 먼저 공개해요! 가사 붙여 주실 분?") },
                maxLines = 3, modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            )
        }

        // 안심 안내
        Row(Modifier.fillMaxWidth().padding(top = 14.dp).clip(RoundedCornerShape(14.dp)).background(Neon.Cyan.copy(alpha = 0.08f)).padding(12.dp)) {
            Icon(Icons.Filled.Shield, contentDescription = null, tint = Neon.Cyan, modifier = Modifier.size(18.dp))
            Text(
                when (draft.mode) {
                    ShareMode.PRIVATE -> if (existing != null) "공유를 취소하면 멜로딜에서 곡과 반응이 지워져요. 원본은 내 폰에 그대로 있어요." else "비공개 곡은 서버에 올라가지 않고 내 폰에만 저장돼요."
                    else -> "공개한 구간만 서버에 올라가요. 원본 전체는 내 폰에만 남아요. 직접 만든 멜로디만 공유해 주세요."
                },
                color = Neon.TextMid, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(start = 8.dp),
            )
        }
        if (original != null && original.notes.size < 4 && draft.mode != ShareMode.PRIVATE) {
            Text("음표가 너무 적어요. 조금 더 만들어 주세요", color = Neon.Gold, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 8.dp))
        }
        error?.let { Text(it, color = Neon.Red, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 8.dp)) }
        val canSubmit = !busy && when {
            draft.mode == ShareMode.PRIVATE -> true
            original != null && original.notes.size < 4 -> false
            needNickname -> draft.nickname.trim().length >= 2
            else -> true
        }
        Spacer(Modifier.height(14.dp))
        GradientButton(
            when {
                busy -> "저장 중…"
                draft.mode == ShareMode.PRIVATE -> if (existing != null) "공유 취소하기" else "내 폰에만 두기"
                existing != null -> "변경 저장"
                else -> "공유하기"
            },
            if (draft.mode == ShareMode.PRIVATE && existing != null) androidx.compose.ui.graphics.Brush.linearGradient(listOf(Color(0xFFB3263E), Color(0xFF8A1F45))) else Neon.Hero,
            enabled = canSubmit, modifier = Modifier.fillMaxWidth(), onClick = onSubmit,
        )
    }
}

@Composable
private fun Label(text: String) {
    Text(text, style = MaterialTheme.typography.titleSmall, color = Neon.TextHigh, modifier = Modifier.padding(top = 18.dp, bottom = 8.dp))
}

@Composable
private fun QuickChip(label: String, on: Boolean, icon: ImageVector? = null, onClick: () -> Unit) {
    Row(
        Modifier.clip(RoundedCornerShape(50)).background(if (on) Neon.Violet.copy(alpha = 0.35f) else Neon.SurfaceHigh)
            .border(1.dp, if (on) Neon.Violet else Color.Transparent, RoundedCornerShape(50))
            .clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) Icon(icon, contentDescription = null, tint = Neon.Gold, modifier = Modifier.size(14.dp).padding(end = 2.dp))
        Text(label, style = MaterialTheme.typography.labelLarge, color = if (on) Color.White else Neon.TextMid)
    }
}

@Composable
private fun Toggle(title: String, caption: String, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(enabled = enabled) { onChange(!checked) }.padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, color = if (enabled) Neon.TextHigh else Neon.TextLow)
            Text(caption, color = Neon.TextLow, style = MaterialTheme.typography.labelSmall)
        }
        Switch(
            checked = checked, onCheckedChange = onChange, enabled = enabled,
            colors = SwitchDefaults.colors(checkedTrackColor = Neon.Pink, checkedThumbColor = Color.White, uncheckedTrackColor = Neon.SurfaceHigh),
        )
    }
}

/** 원본 전체 멜로디 위에 공개 구간을 밝게 표시 */
@Composable
private fun RangePreview(comp: Composition, s: ShareSettings, progress: Float?, modifier: Modifier) {
    Canvas(modifier.clip(RoundedCornerShape(12.dp)).background(Neon.SurfaceHigh)) {
        val total = comp.totalBeats.toDouble()
        val from = (s.startBar * comp.beatsPerBar / total).toFloat()
        val to = ((s.startBar + s.bars) * comp.beatsPerBar / total).toFloat()
        drawRoundRect(Neon.Pink.copy(alpha = 0.16f), Offset(size.width * from, 0f), Size(size.width * (to - from), size.height), CornerRadius(8.dp.toPx()))
        // 마디 구분선
        for (b in 1 until comp.bars) {
            val x = size.width * (b * comp.beatsPerBar / total).toFloat()
            drawLine(Color.White.copy(alpha = 0.06f), Offset(x, 0f), Offset(x, size.height), 1f)
        }
        val notes = comp.notes
        if (notes.isEmpty()) return@Canvas
        val lo = notes.minOf { it.midi } - 1
        val hi = notes.maxOf { it.midi } + 1
        val h = 5.dp.toPx()
        notes.forEach { n ->
            val x = (n.startBeat / total * size.width).toFloat()
            val w = (n.beats / total * size.width).toFloat().coerceAtLeast(2f)
            val y = 6.dp.toPx() + (size.height - 12.dp.toPx()) * (1f - (n.midi - lo).toFloat() / (hi - lo))
            val pos = (n.startBeat / total).toFloat()
            val inside = pos >= from - 1e-4f && pos < to - 1e-4f
            drawRoundRect(if (inside) Neon.Pink else Neon.TextLow.copy(alpha = 0.35f), Offset(x, y - h / 2), Size(w - 1.5f, h), CornerRadius(h / 2))
        }
        if (progress != null) {
            val x = size.width * (from + (to - from) * progress)
            drawLine(Color.White, Offset(x, 0f), Offset(x, size.height), 2f)
        }
    }
}

/** 첫 곡을 공유했을 때 축하 화면 */
@Composable
fun FirstShareCelebration(onClose: () -> Unit) {
    val t = remember { Animatable(0f) }
    LaunchedEffect(Unit) { t.animateTo(1f, tween(1400, easing = LinearEasing)) }
    val haptic = androidx.compose.ui.platform.LocalHapticFeedback.current
    LaunchedEffect(Unit) { haptic.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.LongPress) }
    Dialog(onDismissRequest = onClose) {
        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(Neon.Hero), contentAlignment = Alignment.Center) {
            Canvas(Modifier.matchParentSize()) {
                // 퍼지는 색종이
                val colors = listOf(Color.White, Neon.Gold, Neon.Cyan, Neon.Lime)
                for (i in 0 until 28) {
                    val a = i * 0.7f
                    val r = size.minDimension * (0.15f + 0.45f * t.value) * (0.6f + (i % 5) * 0.1f)
                    val c = Offset(size.width / 2 + cos(a) * r, size.height * 0.32f + sin(a) * r * 0.8f + t.value * 40f)
                    drawRoundRect(colors[i % colors.size].copy(alpha = 1f - t.value * 0.7f), c, Size(10f, 18f), CornerRadius(3f))
                }
            }
            Column(Modifier.padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(72.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.18f)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Celebration, contentDescription = null, tint = Color.White, modifier = Modifier.size(40.dp))
                }
                Text("첫 곡이 무대에 올랐어요!", color = Color.White, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 16.dp))
                Text(
                    "좋아요와 추천을 받으면 이번 주 차트에 올라가요. 첫 곡을 올린 지 30일 동안은 신인 차트에도 들어가요.",
                    color = Color.White.copy(alpha = 0.9f), style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 8.dp),
                )
                Spacer(Modifier.height(20.dp))
                Box(
                    Modifier.clip(RoundedCornerShape(50)).background(Color.White).clickable(onClick = onClose).padding(horizontal = 24.dp, vertical = 12.dp),
                ) { Text("내 곡 보러 가기", color = Color(0xFF3B1A8F), style = MaterialTheme.typography.labelLarge) }
            }
        }
    }
}
