package com.tuneup

import com.tuneup.data.song.LrcParser
import com.tuneup.data.song.SongParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class SongParserTest {
    private val catalog = File("src/main/assets/songs.json").readText()

    @Test
    fun parsesMidiNames() {
        assertEquals(60, SongParser.parseMidi("C4"))
        assertEquals(69, SongParser.parseMidi("A4"))
        assertEquals(61, SongParser.parseMidi("C#4"))
        assertEquals(70, SongParser.parseMidi("Bb4"))
    }

    @Test
    fun builtInCatalogIsConsistent() {
        val songs = SongParser.parseCatalog(catalog)
        assertTrue(songs.size >= 7)
        assertEquals("곡 id 중복", songs.size, songs.map { it.id }.toSet().size)
        for (song in songs) {
            assertTrue(song.id, song.notes.isNotEmpty())
            // 코드 진행 길이가 멜로디 길이와 맞아야 반주가 어긋나지 않는다
            val chordEnd = song.chords.last().let { it.startSec + it.durSec }
            assertEquals("${song.id} 코드 길이", song.durationSec, chordEnd, 1e-6)
            // 음표는 겹치지 않고 시간순
            song.notes.zipWithNext().forEach { (a, b) -> assertTrue(song.id, b.startSec >= a.endSec - 1e-9) }
            // 마디 단위로 끝나지 않는 곡(못갖춘마디 시작)도 있으므로 길이만 양수 확인
            assertTrue(song.durationSec > 10)
            assertTrue(song.notes.all { it.midi in 55..84 })
        }
    }

    @Test
    fun joinsSyllablesIntoWords() {
        val twinkle = SongParser.parseCatalog(catalog).first { it.id == "twinkle" }
        assertEquals("Twinkle twinkle little star", twinkle.lines.first().text)
        val ko = SongParser.parseCatalog(catalog).first { it.id == "birthday-ko" }
        assertEquals("생일 축하합니다", ko.lines.first().text)
        assertEquals("사랑하는 친구의", ko.lines[2].text)
    }

    @Test
    fun transposeShiftsNotesAndChords() {
        val song = SongParser.parseCatalog(catalog).first { it.id == "twinkle" }
        val up = song.transposed(2)
        assertEquals(song.notes.first().midi + 2, up.notes.first().midi)
        assertEquals(song.chords.first().rootMidi!! + 2, up.chords.first().rootMidi)
    }

    @Test
    fun parsesLrc() {
        val lines = LrcParser.parse("[ti:test]\n[00:01.50]첫 줄\n[00:04.00]둘째 줄\n[00:07.25]", songEndSec = 10.0)
        assertEquals(2, lines.size)
        assertEquals(1.5, lines[0].startSec, 1e-9)
        assertEquals(4.0, lines[0].endSec, 1e-9)
        assertEquals(7.25, lines[1].endSec, 1e-9)
        assertEquals("둘째 줄", lines[1].text)
    }
}
