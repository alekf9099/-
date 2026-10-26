package com.tuneup.data.song

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class SongCatalogJson(val songs: List<SongJson>)

@Serializable
data class SongJson(
    val id: String,
    val title: String,
    val credit: String,
    val license: String,
    val bpm: Double,
    val beatsPerBar: Int,
    val lines: List<String>,
    val chords: String = "",
)

object SongParser {
    private val json = Json { ignoreUnknownKeys = true }
    private val noteNames = mapOf('C' to 0, 'D' to 2, 'E' to 4, 'F' to 5, 'G' to 7, 'A' to 9, 'B' to 11)

    fun parseCatalog(text: String): List<Song> =
        json.decodeFromString<SongCatalogJson>(text).songs.map(::toSong)

    fun toSong(src: SongJson): Song {
        val spb = 60.0 / src.bpm
        var beat = 0.0
        val notes = mutableListOf<Note>()
        val lines = mutableListOf<LyricLine>()
        for (lineText in src.lines) {
            val syllables = mutableListOf<Syllable>()
            for (token in lineText.trim().split(Regex("\\s+"))) {
                val parts = token.split('/', limit = 3)
                require(parts.size >= 2) { "잘못된 음표 토큰: $token (${src.id})" }
                val beats = parts[1].toDouble()
                if (parts[0] != "R") {
                    val raw = parts.getOrElse(2) { "" }
                    val joinsNext = raw.endsWith("-")
                    val lyric = raw.removeSuffix("-")
                    val note = Note(beat * spb, beats * spb, parseMidi(parts[0]), lyric)
                    notes += note
                    if (lyric.isNotEmpty()) {
                        syllables += Syllable(if (joinsNext) lyric else "$lyric ", note.startSec, note.endSec)
                    }
                }
                beat += beats
            }
            if (syllables.isNotEmpty()) {
                val last = syllables.last()
                syllables[syllables.lastIndex] = last.copy(text = last.text.trimEnd())
                lines += LyricLine(syllables)
            }
        }
        return Song(
            id = src.id,
            title = src.title,
            credit = src.credit,
            license = src.license,
            source = SongSource.Synth,
            bpm = src.bpm,
            beatsPerBar = src.beatsPerBar,
            notes = notes,
            lines = lines,
            chords = parseChords(src.chords, spb),
            durationSec = beat * spb,
        )
    }

    /** "C4", "F#3", "Bb4" → MIDI 번호 (C4 = 60). */
    fun parseMidi(name: String): Int {
        val pc = noteNames[name[0]] ?: error("잘못된 음이름: $name")
        var i = 1
        var acc = 0
        while (i < name.length && (name[i] == '#' || name[i] == 'b')) {
            acc += if (name[i] == '#') 1 else -1
            i++
        }
        val octave = name.substring(i).toInt()
        return (octave + 1) * 12 + pc + acc
    }

    private fun parseChords(text: String, spb: Double): List<Chord> {
        if (text.isBlank()) return emptyList()
        var beat = 0.0
        return text.trim().split(Regex("\\s+")).map { token ->
            val (name, len) = token.split('/')
            val beats = len.toDouble()
            val chord = if (name == "N") {
                Chord(beat * spb, beats * spb, null, minor = false, seventh = false)
            } else {
                var i = 1
                var acc = 0
                if (i < name.length && (name[i] == '#' || name[i] == 'b')) {
                    acc = if (name[i] == '#') 1 else -1; i++
                }
                val rest = name.substring(i)
                // 반주 베이스 음역(C3 = 48) 기준 근음
                val root = 48 + (noteNames[name[0]] ?: error("잘못된 코드: $name")) + acc
                Chord(beat * spb, beats * spb, root, minor = rest.startsWith("m"), seventh = rest.endsWith("7"))
            }
            beat += beats
            chord
        }
    }
}

/** LRC 가사 파일(`[mm:ss.xx]가사`)을 줄 단위 가사로 변환. 불러온 MR 곡에서 사용한다. */
object LrcParser {
    private val tag = Regex("""\[(\d{1,2}):(\d{1,2}(?:[.:]\d{1,3})?)]""")

    fun parse(text: String, songEndSec: Double = Double.NaN): List<LyricLine> {
        val stamped = text.lineSequence().flatMap { raw ->
            val times = tag.findAll(raw).map { m ->
                m.groupValues[1].toInt() * 60 + m.groupValues[2].replace(':', '.').toDouble()
            }.toList()
            val lyric = raw.replace(tag, "").trim()
            times.map { it to lyric }
        }.sortedBy { it.first }.toList()

        return stamped.mapIndexedNotNull { i, (start, lyric) ->
            if (lyric.isEmpty()) return@mapIndexedNotNull null
            val end = stamped.getOrNull(i + 1)?.first
                ?: if (songEndSec.isNaN()) start + 5.0 else maxOf(start + 1.0, songEndSec)
            LyricLine(listOf(Syllable(lyric, start, end)))
        }
    }
}
