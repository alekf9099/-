package com.singturn.ui.sing

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.singturn.SingTurnApp
import com.singturn.audio.FilePlayer
import com.singturn.audio.MicCapture
import com.singturn.audio.PitchDetector
import com.singturn.audio.SongPlayer
import com.singturn.audio.Synth
import com.singturn.audio.SynthPlayer
import com.singturn.data.db.ScoreEntity
import com.singturn.data.song.Song
import com.singturn.data.song.SongSource
import com.singturn.scoring.Judgement
import com.singturn.scoring.Scorer
import com.singturn.scoring.foldToOctaveOf
import com.singturn.scoring.pitchClassDistance
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

enum class Phase { LOADING, READY, PREPARING, PLAYING, PAUSED, SAVING, DONE, ERROR }

data class TracePoint(val t: Double, val midi: Double, val hit: Boolean)

data class SingUiState(
    val phase: Phase = Phase.LOADING,
    val song: Song? = null,
    val keyShift: Int = 0,
    val guideOn: Boolean = true,
    val guideVolume: Float = 0.5f,
    val t: Double = 0.0,
    val durationSec: Double = 0.0,
    val liveScore: Int = 0,
    val combo: Int = 0,
    val judgement: Judgement? = null,
    val judgementSeq: Int = 0,
    val trace: List<TracePoint> = emptyList(),
    val error: String? = null,
    val savedScoreId: Long? = null,
    val savedTotal: Int = 0,
)

class SingViewModel(
    private val app: SingTurnApp,
    private val songId: String,
    private val playerName: String,
) : ViewModel() {

    private val _state = MutableStateFlow(SingUiState(guideVolume = app.settings.state.value.guideVolume))
    val state: StateFlow<SingUiState> = _state.asStateFlow()

    private var baseSong: Song? = null
    private var player: SongPlayer? = null
    private var mic: MicCapture? = null
    private var scorer: Scorer? = null
    private var ticker: Job? = null
    private val lock = Any()
    private val trace = ArrayDeque<TracePoint>()
    private var judgementSeq = 0

    @Volatile private var listening = false

    init {
        viewModelScope.launch {
            val song = app.songs.find(songId)
            if (song == null) {
                _state.update { it.copy(phase = Phase.ERROR, error = "곡을 찾을 수 없어요") }
            } else {
                baseSong = song
                _state.update { it.copy(phase = Phase.READY, song = song, durationSec = song.durationSec) }
            }
        }
    }

    fun changeKey(delta: Int) {
        val base = baseSong ?: return
        if (_state.value.phase != Phase.READY || !base.hasReference) return
        val k = (_state.value.keyShift + delta).coerceIn(-6, 6)
        _state.update { it.copy(keyShift = k, song = base.transposed(k)) }
    }

    fun setGuide(on: Boolean) {
        _state.update { it.copy(guideOn = on) }
        player?.guideVolume = if (on) _state.value.guideVolume else 0f
    }

    fun setGuideVolume(v: Float) {
        _state.update { it.copy(guideVolume = v) }
        if (_state.value.guideOn) player?.guideVolume = v
        app.settings.update { it.copy(guideVolume = v) }
    }

    /** 마이크 권한이 확인된 뒤 호출 */
    fun start() {
        val song = _state.value.song ?: return
        if (_state.value.phase != Phase.READY) return
        _state.update { it.copy(phase = Phase.PREPARING) }
        viewModelScope.launch {
            val p = runCatching {
                withContext(Dispatchers.Default) {
                    when (val src = song.source) {
                        is SongSource.Synth -> SynthPlayer(Synth.render(song))
                        is SongSource.UserFile -> FilePlayer(app, Uri.parse(src.uri))
                    }
                }
            }.getOrElse {
                _state.update { s -> s.copy(phase = Phase.ERROR, error = "음원을 열 수 없어요. 파일이 옮겨졌거나 지원하지 않는 형식일 수 있어요.") }
                return@launch
            }
            val duration = if (p is FilePlayer) p.durationSec else song.durationSec
            p.guideVolume = if (_state.value.guideOn) _state.value.guideVolume else 0f
            player = p
            scorer = Scorer(song.notes)
            if (runCatching { startMic(song, p) }.isFailure) {
                p.release()
                player = null
                _state.update { it.copy(phase = Phase.ERROR, error = "마이크를 쓸 수 없어요. 다른 앱이 마이크를 쓰고 있는지 확인해 주세요.") }
                return@launch
            }
            p.start()
            listening = true
            _state.update { it.copy(phase = Phase.PLAYING, durationSec = duration) }
            startTicker(song, duration)
        }
    }

    private fun startMic(song: Song, p: SongPlayer) {
        val detector = PitchDetector(Synth.SAMPLE_RATE)
        val latency = app.settings.state.value.latencyMs / 1000.0
        // 분석 창의 중심은 읽은 시점보다 창 길이의 절반만큼 과거
        val windowCenter = 1024.0 / Synth.SAMPLE_RATE
        val sc = scorer!!
        mic = MicCapture().also { m ->
            m.start { frame ->
                if (!listening) return@start
                val t = p.positionSec - latency - windowCenter
                if (t < 0) return@start
                val r = detector.detect(frame)
                val midi = r.midi
                synchronized(lock) {
                    sc.addFrame(t, midi, r.rms)
                    if (midi != null) {
                        val target = if (song.hasReference) sc.targetAt(t) else null
                        val shown = when {
                            target != null -> foldToOctaveOf(midi, target.midi.toDouble())
                            trace.isNotEmpty() -> foldToOctaveOf(midi, trace.last().midi)
                            else -> midi
                        }
                        val hit = target != null && pitchClassDistance(midi, target.midi.toDouble()) <= 0.75
                        trace.addLast(TracePoint(t, shown, hit))
                        while (trace.size > 400) trace.removeFirst()
                    }
                }
            }
        }
    }

    private fun startTicker(song: Song, duration: Double) {
        ticker?.cancel()
        ticker = viewModelScope.launch {
            val latency = app.settings.state.value.latencyMs / 1000.0
            while (isActive) {
                delay(16)
                val p = player ?: break
                val t = p.positionSec
                val sc = scorer ?: break
                val snapshot = synchronized(lock) {
                    val j = sc.consumeJudgement()
                    if (j != null) judgementSeq++
                    Triple(sc.liveScore(t - latency), j, trace.filter { it.t > t - 3.0 })
                }
                _state.update {
                    it.copy(
                        t = t,
                        liveScore = snapshot.first,
                        combo = sc.currentCombo,
                        judgement = snapshot.second ?: it.judgement,
                        judgementSeq = judgementSeq,
                        trace = snapshot.third,
                    )
                }
                val ended = p.isFinished || (song.source is SongSource.Synth && t > duration + 0.8)
                if (ended && _state.value.phase == Phase.PLAYING) {
                    finish(save = true)
                    break
                }
            }
        }
    }

    fun pause() {
        if (_state.value.phase != Phase.PLAYING) return
        listening = false
        player?.pause()
        _state.update { it.copy(phase = Phase.PAUSED) }
    }

    fun resume() {
        if (_state.value.phase != Phase.PAUSED) return
        player?.resume()
        listening = true
        _state.update { it.copy(phase = Phase.PLAYING) }
    }

    /** save = false 면 점수를 남기지 않고 종료 */
    fun finish(save: Boolean) {
        val song = _state.value.song ?: return
        listening = false
        ticker?.cancel()
        mic?.stop(); mic = null
        player?.release(); player = null
        if (!save) {
            _state.update { it.copy(phase = Phase.DONE) }
            return
        }
        _state.update { it.copy(phase = Phase.SAVING) }
        val result = synchronized(lock) {
            scorer?.finish(_state.value.durationSec)
            scorer?.result()
        } ?: return
        viewModelScope.launch {
            val id = app.db.scores().insert(
                ScoreEntity(
                    songId = song.id,
                    songTitle = song.title,
                    playerName = playerName,
                    total = result.total,
                    pitch = result.pitch,
                    rhythm = result.rhythm,
                    stability = result.stability,
                    ranked = result.hasReference,
                    keyShift = _state.value.keyShift,
                    createdAt = System.currentTimeMillis(),
                    perfect = result.perfect,
                    great = result.great,
                    good = result.good,
                    miss = result.miss,
                    maxCombo = result.maxCombo,
                ),
            )
            _state.update { it.copy(phase = Phase.DONE, savedScoreId = id, savedTotal = result.total) }
        }
    }

    override fun onCleared() {
        listening = false
        mic?.stop()
        player?.release()
    }
}
