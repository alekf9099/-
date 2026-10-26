package com.singturn.data.song

/** 반주 음원의 출처. 내장곡은 앱이 직접 합성하고, 불러온 곡은 사용자 기기의 파일을 재생만 한다. */
sealed interface SongSource {
    data object Synth : SongSource
    data class UserFile(val uri: String) : SongSource
}

/** 기준 멜로디의 한 음. 시간은 본 곡 시작(카운트인 이후) 기준 초 단위. */
data class Note(
    val startSec: Double,
    val durSec: Double,
    val midi: Int,
    val lyric: String,
) {
    val endSec get() = startSec + durSec
}

data class Syllable(val text: String, val startSec: Double, val endSec: Double)

data class LyricLine(val syllables: List<Syllable>) {
    val startSec get() = syllables.first().startSec
    val endSec get() = syllables.last().endSec
    val text get() = syllables.joinToString("") { it.text }
}

/** rootMidi == null 이면 코드 없음. */
data class Chord(val startSec: Double, val durSec: Double, val rootMidi: Int?, val minor: Boolean, val seventh: Boolean)

data class Song(
    val id: String,
    val title: String,
    val credit: String,
    val license: String,
    val source: SongSource,
    val bpm: Double = 100.0,
    val beatsPerBar: Int = 4,
    val notes: List<Note> = emptyList(),
    val lines: List<LyricLine> = emptyList(),
    val chords: List<Chord> = emptyList(),
    val durationSec: Double = notes.lastOrNull()?.endSec ?: 0.0,
) {
    /** 기준 멜로디가 있어야 음정·박자 채점이 가능하다. 없으면 참고용 점수만 매긴다. */
    val hasReference get() = notes.isNotEmpty()
    val secPerBeat get() = 60.0 / bpm
    val countInSec get() = if (source is SongSource.Synth) beatsPerBar * secPerBeat else 0.0

    fun transposed(semitones: Int): Song = if (semitones == 0) this else copy(
        notes = notes.map { it.copy(midi = it.midi + semitones) },
        chords = chords.map { c -> c.copy(rootMidi = c.rootMidi?.plus(semitones)) },
    )
}
