package com.tuneup.studio

import com.tuneup.data.song.Chord
import com.tuneup.data.song.Genre
import com.tuneup.data.song.LyricLine
import com.tuneup.data.song.Note
import com.tuneup.data.song.Song
import com.tuneup.data.song.SongSource
import com.tuneup.data.song.Syllable
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlin.math.ceil

/** 멜로디의 한 음. 시간 단위는 박(beat). */
@Serializable
data class MelodyNote(val startBeat: Double, val beats: Double, val midi: Int) {
    val endBeat get() = startBeat + beats
}

/** 사용자가 만든 곡 한 곡. Room에는 JSON으로 저장한다. */
@Serializable
data class Composition(
    val title: String,
    val genre: Genre = Genre.POP,
    val bpm: Int = genre.defaultBpm,
    val beatsPerBar: Int = 4,
    val key: MusicKey = MusicKey(0, false),
    val notes: List<MelodyNote> = emptyList(),
    /** 코드 하나가 차지하는 박 수. 4/4는 기본 반 마디(2박)마다 코드가 바뀐다 */
    val chordBeats: Int = if (beatsPerBar == 4) 2 else beatsPerBar,
    /** 코드 칸마다 코드 하나 */
    val chords: List<ChordSymbol> = emptyList(),
    val lyrics: String = "",
) {
    val bars: Int get() = maxOf(1, ceil((notes.maxOfOrNull { it.endBeat } ?: 0.0) / beatsPerBar - 1e-9).toInt())
    val totalBeats: Int get() = bars * beatsPerBar
    val durationSec: Double get() = totalBeats * 60.0 / bpm
    val chordSlots: Int get() = totalBeats / chordBeats

    /** 코드 칸 수를 곡 길이에 맞춘다: 모자라면 자동 반주로 채우고, 남으면 자른다 */
    fun withFittedChords(): Composition {
        val slots = chordSlots
        if (chords.size == slots) return this
        if (chords.size > slots) return copy(chords = chords.take(slots))
        val auto = Harmonizer.harmonize(notes, key, chordBeats, slots)
        return copy(chords = chords + auto.drop(chords.size))
    }

    fun autoChords(): Composition = copy(chords = Harmonizer.harmonize(notes, key, chordBeats, chordSlots))

    fun toJson(): String = json.encodeToString(this)

    /** 노래방·파티·랭킹에서 그대로 쓸 수 있는 Song으로 변환 */
    fun toSong(id: String, author: String = "나"): Song {
        val spb = 60.0 / bpm
        val sorted = notes.sortedBy { it.startBeat }
        val syllables = LyricsFitter.split(lyrics)
        val songNotes = sorted.mapIndexed { i, n ->
            Note(n.startBeat * spb, n.beats * spb, n.midi, syllables.getOrNull(i)?.text.orEmpty())
        }
        return Song(
            id = id,
            title = title,
            credit = "작곡 $author",
            license = "내가 만든 곡",
            source = SongSource.Synth,
            bpm = bpm.toDouble(),
            beatsPerBar = beatsPerBar,
            notes = songNotes,
            lines = buildLines(songNotes, syllables, spb),
            chords = chords.take(chordSlots).mapIndexed { slot, c ->
                Chord(slot * chordBeats * spb, chordBeats * spb, 48 + c.root, c.quality == Quality.MINOR, c.quality == Quality.DOM7)
            },
            durationSec = durationSec,
            genre = genre,
        )
    }

    /** 가사 줄바꿈 위치로 줄을 나누고, 줄바꿈이 없으면 두 마디마다 나눈다 */
    private fun buildLines(songNotes: List<Note>, syllables: List<LyricsFitter.Syl>, spb: Double): List<LyricLine> {
        val hasBreaks = syllables.any { it.lineBreakAfter }
        val lines = mutableListOf<LyricLine>()
        var current = mutableListOf<Syllable>()
        var currentBlock = -1
        songNotes.forEachIndexed { i, n ->
            val syl = syllables.getOrNull(i) ?: return@forEachIndexed
            val block = (n.startSec / spb / (beatsPerBar * 2)).toInt()
            if (!hasBreaks && current.isNotEmpty() && block != currentBlock) {
                lines += LyricLine(current); current = mutableListOf()
            }
            currentBlock = block
            current += Syllable(if (syl.joinNext) syl.text else syl.text + " ", n.startSec, n.endSec)
            if (hasBreaks && syl.lineBreakAfter) {
                lines += LyricLine(current); current = mutableListOf()
            }
        }
        if (current.isNotEmpty()) lines += LyricLine(current)
        return lines.map { line -> LyricLine(line.syllables.dropLast(1) + line.syllables.last().let { it.copy(text = it.text.trimEnd()) }) }
    }

    companion object {
        private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
        fun fromJson(text: String): Composition = json.decodeFromString(text)
    }
}
