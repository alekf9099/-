package com.melodeal

import com.melodeal.data.song.Genre
import com.melodeal.data.song.SongParser
import com.melodeal.studio.ChordSymbol
import com.melodeal.studio.Composition
import com.melodeal.studio.Harmonizer
import com.melodeal.studio.LyricsFitter
import com.melodeal.studio.MelodyNote
import com.melodeal.studio.MusicKey
import com.melodeal.studio.PitchFrame
import com.melodeal.studio.Quality
import com.melodeal.studio.Transcriber
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.math.sin
import kotlin.random.Random

class StudioTest {
    private val twinkle = SongParser.parseCatalog(File("src/main/assets/songs.json").readText()).first { it.id == "twinkle" }
    private val bpm = twinkle.bpm
    private val spb = 60.0 / bpm
    private val melody = twinkle.notes.map { MelodyNote(it.startSec / spb, it.durSec / spb, it.midi) }

    /** 사람이 흥얼거린 것처럼: 전체적으로 음이 살짝 높고, 비브라토, 음 끝은 숨 쉬느라 끊기고, 가끔 튀는 값 */
    private fun hum(notes: List<MelodyNote>, detune: Double = 0.3, octave: Int = 0, lateSec: Double = 0.04, seed: Int = 1): List<PitchFrame> {
        val rnd = Random(seed)
        val hop = 1024.0 / 44100
        val end = notes.maxOf { it.endBeat } * spb + 0.5
        return generateSequence(0.0) { it + hop }.takeWhile { it < end }.map { t ->
            val n = notes.firstOrNull { t >= it.startBeat * spb + lateSec && t < it.endBeat * spb - 0.08 }
            val glitch = rnd.nextDouble() < 0.03
            PitchFrame(t, if (n == null || glitch) null else n.midi + 12.0 * octave + detune + 0.25 * sin(t * 2 * Math.PI * 5.5) + rnd.nextDouble(-0.1, 0.1))
        }.toList()
    }

    @Test
    fun transcribesHummedMelodyBackToTheScore() {
        val r = Transcriber.transcribe(hum(melody), bpm, 4)
        assertEquals(MusicKey(0, false), r.key)
        assertEquals(melody.size, r.notes.size)
        r.notes.zip(melody).forEach { (got, want) ->
            assertEquals("pitch at ${want.startBeat}", want.midi, got.midi)
            assertEquals("start", want.startBeat, got.startBeat, 1e-9)
            // 숨 쉬는 끊김 때문에 길이는 한 칸(0.5박)까지 짧아질 수 있다
            assertTrue("dur ${got.beats} vs ${want.beats}", got.beats in (want.beats - 0.5)..want.beats)
        }
    }

    @Test
    fun keepsOctaveAndTrimsLeadingSilence() {
        // 한 마디 반 쉬고 시작해도 첫 음이 있는 마디부터 시작
        val delayed = melody.map { it.copy(startBeat = it.startBeat + 6.0) }
        val r = Transcriber.transcribe(hum(delayed, detune = -0.35, octave = -1), bpm, 4)
        assertEquals(2.0, r.notes.first().startBeat, 1e-9)
        assertEquals(melody.first().midi - 12, r.notes.first().midi)
    }

    @Test
    fun silenceGivesNoNotes() {
        val r = Transcriber.transcribe(List(100) { PitchFrame(it * 0.023, null) }, 100.0, 4)
        assertTrue(r.notes.isEmpty())
    }

    @Test
    fun detectsMinorKey() {
        // A 단조: A C E A G E D C B A (화성단음계 G# 없이)
        val minorMelody = listOf(69, 72, 76, 81, 79, 76, 74, 72, 71, 69, 64, 69).mapIndexed { i, m -> MelodyNote(i.toDouble(), 1.0, m) }
        val hist = DoubleArray(12).also { h -> minorMelody.forEach { h[it.midi % 12] += it.beats } }
        assertEquals(MusicKey(9, true), MusicKey.detect(hist))
    }

    @Test
    fun harmonizesTwinkleNaturally() {
        val key = MusicKey(0, false)
        // 반 마디(2박)마다 코드 하나, 12마디 = 24칸
        val chords = Harmonizer.harmonize(melody, key, 2, 24)
        assertEquals(24, chords.size)
        assertEquals("첫 마디는 으뜸화음", ChordSymbol(0, Quality.MAJOR), chords.first())
        assertEquals("끝 마디는 으뜸화음", ChordSymbol(0, Quality.MAJOR), chords.last())
        assertTrue(chords.all { it in key.diatonicChords })
        // 멜로디 음의 대부분(길이 기준 85% 이상)이 그 마디 코드 구성음
        var inChord = 0.0
        var total = 0.0
        for (n in melody) {
            val bar = (n.startBeat / 2).toInt()
            total += n.beats
            if (n.midi % 12 in chords[bar].tones) inChord += n.beats
        }
        assertTrue("코드 적합도 ${inChord / total}", inChord / total >= 0.85)
    }

    @Test
    fun splitsKoreanAndEnglishLyrics() {
        val s = LyricsFitter.split("사랑해 너를\ntwin-kle star!")
        assertEquals(listOf("사", "랑", "해", "너", "를", "twin", "kle", "star!"), s.map { it.text })
        assertEquals(listOf(true, true, false, true, false, true, false, false), s.map { it.joinNext })
        assertTrue(s[4].lineBreakAfter)
        assertEquals(1, s.count { it.lineBreakAfter })
        assertEquals(-2, LyricsFitter.mismatch("사랑해", 5))
    }

    @Test
    fun compositionRoundTripsAndBecomesASingableSong() {
        val c = Composition(
            title = "첫 노래", genre = Genre.BALLAD, bpm = 80, key = MusicKey(0, false),
            notes = listOf(MelodyNote(0.0, 1.0, 60), MelodyNote(1.0, 1.0, 62), MelodyNote(2.0, 2.0, 64), MelodyNote(4.0, 4.0, 67)),
            chordBeats = 4,
            chords = listOf(ChordSymbol(0, Quality.MAJOR), ChordSymbol(7, Quality.DOM7)),
            lyrics = "우리\n노래",
        )
        assertEquals(c, Composition.fromJson(c.toJson()))
        assertEquals(2, c.bars)
        val song = c.toSong("mine:1")
        assertEquals(Genre.BALLAD, song.genre)
        assertEquals(4, song.notes.size)
        assertEquals(6.0, song.durationSec, 1e-9) // 8박 × 0.75초
        assertEquals(listOf("우리", "노래"), song.lines.map { it.text })
        assertTrue(song.chords[1].seventh)
        // 반 마디 코드로 바꾸고 칸 수 맞추기: 2마디 = 4칸
        val fitted = c.copy(chordBeats = 2).withFittedChords()
        assertEquals(4, fitted.chords.size)
        assertEquals(c.chords.take(2), fitted.chords.take(2))
        assertEquals(55, song.chords[1].rootMidi)
    }
}
