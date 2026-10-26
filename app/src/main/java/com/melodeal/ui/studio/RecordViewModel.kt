package com.melodeal.ui.studio

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.melodeal.MelodealApp
import com.melodeal.audio.MicCapture
import com.melodeal.audio.PitchDetector
import com.melodeal.audio.Synth
import com.melodeal.audio.SynthPlayer
import com.melodeal.data.song.Genre
import com.melodeal.studio.Composition
import com.melodeal.studio.PitchFrame
import com.melodeal.studio.Transcriber
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

enum class RecPhase { SETUP, RECORDING, PROCESSING, DONE }

data class RecordUiState(
    val phase: RecPhase = RecPhase.SETUP,
    val genre: Genre = Genre.POP,
    val bpm: Int = Genre.POP.defaultBpm,
    val beatsPerBar: Int = 4,
    val maxBars: Int = 16,
    /** 녹음 시작(카운트인 이후) 기준 초. 카운트인 중엔 음수 */
    val t: Double = 0.0,
    val trace: List<PitchFrame> = emptyList(),
    val level: Float = 0f,
    val message: String? = null,
    val createdId: Long? = null,
) {
    val secPerBeat get() = 60.0 / bpm
    val beat get() = t / secPerBeat
}

class RecordViewModel(private val app: MelodealApp) : ViewModel() {
    private val _state = MutableStateFlow(RecordUiState())
    val state: StateFlow<RecordUiState> = _state.asStateFlow()

    private var player: SynthPlayer? = null
    private var mic: MicCapture? = null
    private var ticker: Job? = null
    private val lock = Any()
    private val frames = ArrayList<PitchFrame>()
    @Volatile private var level = 0f

    fun setGenre(g: Genre) = _state.update { it.copy(genre = g, bpm = g.defaultBpm) }
    fun setBpm(b: Int) = _state.update { it.copy(bpm = b.coerceIn(60, 160)) }
    fun setMeter(beats: Int) = _state.update { it.copy(beatsPerBar = beats) }
    fun dismissMessage() = _state.update { it.copy(message = null) }

    /** 마이크 권한 확인 후 호출 */
    fun start() {
        val s = _state.value
        if (s.phase != RecPhase.SETUP) return
        synchronized(lock) { frames.clear() }
        val metronome = Synth.metronome(s.bpm.toDouble(), s.beatsPerBar, s.maxBars)
        val p = SynthPlayer(metronome).also { it.guideVolume = 0f }
        val latency = app.settings.state.value.latencyMs / 1000.0
        val windowCenter = 1024.0 / Synth.SAMPLE_RATE
        val detector = PitchDetector(Synth.SAMPLE_RATE)
        val m = MicCapture()
        val started = runCatching {
            m.start { frame ->
                val t = p.positionSec - latency - windowCenter
                if (t < 0) return@start
                val r = detector.detect(frame)
                level = (r.rms * 8).toFloat().coerceIn(0f, 1f)
                synchronized(lock) { frames += PitchFrame(t, r.midi) }
            }
        }
        if (started.isFailure) {
            p.release()
            _state.update { it.copy(message = "마이크를 쓸 수 없어요. 다른 앱이 마이크를 쓰고 있는지 확인해 주세요.") }
            return
        }
        player = p
        mic = m
        p.start()
        _state.update { it.copy(phase = RecPhase.RECORDING, trace = emptyList(), t = -s.beatsPerBar * s.secPerBeat) }
        val endSec = s.maxBars * s.beatsPerBar * s.secPerBeat
        ticker = viewModelScope.launch {
            while (isActive) {
                delay(33)
                val t = p.positionSec
                val trace = synchronized(lock) { frames.toList() }
                _state.update { it.copy(t = t, trace = trace, level = level) }
                if (t >= endSec) { stop(); break }
            }
        }
    }

    /** 녹음을 끝내고 악보로 옮겨 새 곡으로 저장 */
    fun stop() {
        if (_state.value.phase != RecPhase.RECORDING) return
        ticker?.cancel()
        mic?.stop(); mic = null
        player?.release(); player = null
        val s = _state.value
        val recorded = synchronized(lock) { frames.toList() }
        _state.update { it.copy(phase = RecPhase.PROCESSING) }
        viewModelScope.launch {
            val voiced = recorded.count { it.midi != null }
            val result = withContext(Dispatchers.Default) {
                if (voiced < 15) null else Transcriber.transcribe(recorded, s.bpm.toDouble(), s.beatsPerBar)
            }
            if (result == null || result.notes.size < 2) {
                _state.update {
                    it.copy(
                        phase = RecPhase.SETUP, trace = emptyList(),
                        message = "목소리가 잘 안 들렸어요. 마이크 가까이에서 \"라라라\" 또는 \"음~\"으로 또렷하게 불러 주세요.",
                    )
                }
                return@launch
            }
            val draft = Composition(
                title = app.studio.nextTitle(),
                genre = s.genre,
                bpm = s.bpm,
                beatsPerBar = s.beatsPerBar,
                key = result.key,
                notes = result.notes,
            ).autoChords()
            val id = app.studio.create(draft)
            _state.update { it.copy(phase = RecPhase.DONE, createdId = id) }
        }
    }

    /** 녹음을 버리고 처음으로 */
    fun cancel() {
        ticker?.cancel()
        mic?.stop(); mic = null
        player?.release(); player = null
        _state.update { it.copy(phase = RecPhase.SETUP, trace = emptyList(), t = 0.0) }
    }

    override fun onCleared() {
        mic?.stop()
        player?.release()
    }
}
