package com.tuneup.ui.studio

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tuneup.TuneUpApp
import com.tuneup.audio.Synth
import com.tuneup.audio.SynthPlayer
import com.tuneup.audio.WavWriter
import com.tuneup.data.song.Genre
import com.tuneup.data.song.SongRepository
import com.tuneup.studio.ChordSymbol
import com.tuneup.studio.Composition
import com.tuneup.studio.MelodyNote
import com.tuneup.studio.MusicKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

data class EditorUiState(
    val loaded: Boolean = false,
    val comp: Composition = Composition(title = ""),
    val selected: Int? = null,
    val playing: Boolean = false,
    val preparing: Boolean = false,
    val playheadBeat: Double? = null,
    val melodyOn: Boolean = true,
    val canUndo: Boolean = false,
    val exportedFile: File? = null,
    val message: String? = null,
) {
    val selectedNote: MelodyNote? get() = selected?.let { comp.notes.getOrNull(it) }
}

/** 편집 격자: 8분음표(0.5박) */
const val GRID = 0.5

class EditorViewModel(private val app: TuneUpApp, val id: Long) : ViewModel() {
    private val _state = MutableStateFlow(EditorUiState())
    val state: StateFlow<EditorUiState> = _state.asStateFlow()

    private val undo = ArrayDeque<Composition>()
    private var saveJob: Job? = null
    private var player: SynthPlayer? = null
    private var ticker: Job? = null

    val songId get() = "${SongRepository.MINE_PREFIX}$id"

    init {
        viewModelScope.launch {
            val c = app.studio.get(id)
            if (c == null) _state.update { it.copy(message = "곡을 찾을 수 없어요") }
            else _state.update { it.copy(loaded = true, comp = c.withFittedChords()) }
        }
    }

    /** 모든 편집은 여기를 거친다: 되돌리기 기록 → 음표 정렬 → 코드 칸 맞춤 → 자동 저장 */
    private fun edit(keepSelection: MelodyNote? = null, record: Boolean = true, transform: (Composition) -> Composition) {
        val before = _state.value.comp
        val after = transform(before).let { c -> c.copy(notes = c.notes.sortedBy { it.startBeat }) }.withFittedChords()
        if (after == before) return
        if (record) {
            undo.addLast(before)
            while (undo.size > 50) undo.removeFirst()
        }
        stopPreview()
        _state.update {
            it.copy(
                comp = after,
                selected = keepSelection?.let { n -> after.notes.indexOf(n).takeIf { i -> i >= 0 } },
                canUndo = undo.isNotEmpty(),
            )
        }
        scheduleSave()
    }

    private fun scheduleSave() {
        saveJob?.cancel()
        saveJob = viewModelScope.launch {
            delay(400)
            app.studio.save(id, _state.value.comp)
        }
    }

    fun undo() {
        val prev = undo.removeLastOrNull() ?: return
        stopPreview()
        _state.update { it.copy(comp = prev, selected = null, canUndo = undo.isNotEmpty()) }
        scheduleSave()
    }

    // ── 음표 편집 ──────────────────────────────────────────────

    fun select(index: Int?) = _state.update { it.copy(selected = index) }

    fun addNote(beat: Double, midi: Int) {
        val notes = _state.value.comp.notes
        val start = (beat / GRID).toInt() * GRID
        if (notes.any { start >= it.startBeat && start < it.endBeat }) return
        val nextStart = notes.filter { it.startBeat > start }.minOfOrNull { it.startBeat } ?: Double.MAX_VALUE
        val note = MelodyNote(start, minOf(1.0, nextStart - start).coerceAtLeast(GRID), midi)
        edit(keepSelection = note) { it.copy(notes = it.notes + note) }
    }

    private fun modifySelected(change: (MelodyNote, prevEnd: Double, nextStart: Double) -> MelodyNote?) {
        val s = _state.value
        val i = s.selected ?: return
        val notes = s.comp.notes
        val n = notes.getOrNull(i) ?: return
        val prevEnd = notes.getOrNull(i - 1)?.endBeat ?: 0.0
        val nextStart = notes.getOrNull(i + 1)?.startBeat ?: Double.MAX_VALUE
        val changed = change(n, prevEnd, nextStart) ?: return
        edit(keepSelection = changed) { c -> c.copy(notes = c.notes.toMutableList().also { it[i] = changed }) }
    }

    fun shiftPitch(semitones: Int) = modifySelected { n, _, _ -> n.copy(midi = (n.midi + semitones).coerceIn(36, 96)) }

    fun shiftTime(direction: Int) = modifySelected { n, prevEnd, nextStart ->
        val start = n.startBeat + direction * GRID
        if (start < prevEnd - 1e-9 || start + n.beats > nextStart + 1e-9) null else n.copy(startBeat = start)
    }

    fun resize(direction: Int) = modifySelected { n, _, nextStart ->
        val beats = n.beats + direction * GRID
        if (beats < GRID - 1e-9 || n.startBeat + beats > nextStart + 1e-9) null else n.copy(beats = beats)
    }

    /** 끌어서 옮기기: 다른 음과 겹치면 높이만 바꾸고, 그것도 안 되면 그대로 둔다 */
    fun moveNote(index: Int, dBeats: Double, dSemis: Int) {
        val notes = _state.value.comp.notes
        val n = notes.getOrNull(index) ?: return
        val others = notes.filterIndexed { i, _ -> i != index }
        fun free(start: Double) = start >= 0 && others.none { start < it.endBeat - 1e-9 && start + n.beats > it.startBeat + 1e-9 }
        val midi = (n.midi + dSemis).coerceIn(36, 96)
        val start = (n.startBeat + dBeats).coerceAtLeast(0.0)
        val moved = when {
            free(start) -> n.copy(startBeat = start, midi = midi)
            dSemis != 0 -> n.copy(midi = midi)
            else -> return
        }
        edit(keepSelection = moved) { c -> c.copy(notes = c.notes.toMutableList().also { it[index] = moved }) }
    }

    fun dismissHint() = app.settings.update { it.copy(editorHintSeen = true) }

    fun deleteSelected() {
        val i = _state.value.selected ?: return
        edit { c -> c.copy(notes = c.notes.filterIndexed { idx, _ -> idx != i }) }
        _state.update { it.copy(selected = null) }
    }

    /** 곡 전체 키 바꾸기 (내 음역에 맞추기) */
    fun transpose(semitones: Int) = edit { c ->
        c.copy(
            key = MusicKey((c.key.tonic + semitones).mod(12), c.key.minor),
            notes = c.notes.map { it.copy(midi = it.midi + semitones) },
            chords = c.chords.map { it.copy(root = (it.root + semitones).mod(12)) },
        )
    }

    // ── 코드 · 곡 정보 ─────────────────────────────────────────

    fun setChord(slot: Int, chord: ChordSymbol) = edit { c -> c.copy(chords = c.chords.toMutableList().also { if (slot in it.indices) it[slot] = chord }) }
    fun autoChords() = edit { it.autoChords() }
    fun setChordBeats(beats: Int) = edit { it.copy(chordBeats = beats).autoChords() }
    fun setGenre(g: Genre) = edit { it.copy(genre = g) }
    fun setBpm(bpm: Int) = edit { it.copy(bpm = bpm.coerceIn(60, 160)) }
    fun setTitle(title: String) = edit(record = false) { it.copy(title = title.take(30).ifBlank { it.title }) }
    fun setLyrics(text: String) = edit(record = false) { it.copy(lyrics = text) }
    fun setMelodyOn(on: Boolean) {
        _state.update { it.copy(melodyOn = on) }
        player?.guideVolume = if (on) 0.8f else 0f
    }

    // ── 미리듣기 ───────────────────────────────────────────────

    fun togglePreview() = if (_state.value.playing || _state.value.preparing) stopPreview() else startPreview()

    private fun startPreview() {
        val c = _state.value.comp
        _state.update { it.copy(preparing = true) }
        viewModelScope.launch {
            val rendered = withContext(Dispatchers.Default) { Synth.render(c.toSong(songId)) }
            if (!_state.value.preparing) return@launch
            val p = SynthPlayer(rendered).also { it.guideVolume = if (_state.value.melodyOn) 0.8f else 0f }
            player = p
            p.start()
            _state.update { it.copy(preparing = false, playing = true) }
            val spb = 60.0 / c.bpm
            ticker = launch {
                while (isActive) {
                    delay(30)
                    _state.update { it.copy(playheadBeat = p.positionSec / spb) }
                    if (p.isFinished) { stopPreview(); break }
                }
            }
        }
    }

    fun stopPreview() {
        ticker?.cancel()
        player?.release()
        player = null
        _state.update { it.copy(playing = false, preparing = false, playheadBeat = null) }
    }

    // ── 내보내기 · 삭제 ────────────────────────────────────────

    /** WAV로 렌더링해 공유용 파일을 만든다. withMelody = false 면 MR(반주만) */
    fun export(withMelody: Boolean) {
        val c = _state.value.comp
        viewModelScope.launch {
            val file = withContext(Dispatchers.Default) {
                val rendered = Synth.render(c.toSong(songId))
                val dir = File(app.cacheDir, "exports").apply { mkdirs() }
                val safe = c.title.replace(Regex("[^\\p{L}\\p{N} _-]"), "").trim().ifBlank { "my_song" }
                File(dir, "$safe${if (withMelody) "" else " (MR)"}.wav").also {
                    WavWriter.write(it, WavWriter.mix(rendered, if (withMelody) 0.8f else 0f), rendered.sampleRate)
                }
            }
            _state.update { it.copy(exportedFile = file) }
        }
    }

    fun consumeExport() = _state.update { it.copy(exportedFile = null) }

    suspend fun delete() {
        stopPreview()
        saveJob?.cancel()
        app.studio.delete(id)
    }

    override fun onCleared() {
        player?.release()
        // 화면을 나갈 때 마지막 편집을 바로 저장
        saveJob?.let { if (it.isActive) { it.cancel(); kotlinx.coroutines.runBlocking { app.studio.save(id, _state.value.comp) } } }
    }
}
