package com.tuneup

import com.tuneup.audio.PitchDetector
import com.tuneup.audio.Synth
import com.tuneup.audio.WavWriter
import com.tuneup.data.song.Genre
import com.tuneup.data.song.SongParser
import com.tuneup.scoring.Scorer
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** 합성 → 음정 검출 → 채점 전체 경로 검증: 앱이 만든 가이드 멜로디를 그대로 "부르면" 고득점이어야 한다. */
class PipelineTest {
    private val songs = SongParser.parseCatalog(File("src/main/assets/songs.json").readText())

    @Test
    fun guideMelodyScoresNearPerfect() {
        for (song in songs) {
            for ((key, genre) in listOf(0 to Genre.POP, -5 to Genre.entries[song.id.length % Genre.entries.size])) {
                val s = song.transposed(key).copy(genre = genre)
                val rendered = Synth.render(s)
                val detector = PitchDetector(rendered.sampleRate)
                val scorer = Scorer(s.notes)
                val win = 2048
                val hop = 1024
                var pos = 0
                while (pos + win <= rendered.guide.size) {
                    val frame = FloatArray(win) { rendered.guide[pos + it] }
                    // 앱과 동일하게 분석 창의 중심 시각으로 채점
                    val t = (pos + win / 2).toDouble() / rendered.sampleRate - rendered.songStartSec
                    if (t >= 0) {
                        val r = detector.detect(frame)
                        scorer.addFrame(t, r.midi, r.rms)
                    }
                    pos += hop
                }
                scorer.finish(s.durationSec)
                val result = scorer.result()
                println("${song.id} key=$key → ${result.total} (음정 ${result.pitch}, 박자 ${result.rhythm}, 안정 ${result.stability}, miss ${result.miss})")
                assertTrue("${song.id} key=$key total=${result.total}", result.total >= 90)
            }
        }
    }

    @Test
    fun everyGenreRendersCleanly() {
        for (song in songs) for (genre in Genre.entries) {
            val g = song.copy(genre = genre)
            val started = System.nanoTime()
            val r = Synth.render(g)
            val ms = (System.nanoTime() - started) / 1_000_000
            val peak = r.backing.indices.maxOf { kotlin.math.abs(r.backing[it] + r.guide[it]) }
            val rms = kotlin.math.sqrt(r.backing.sumOf { it.toDouble() * it } / r.backing.size)
            assertTrue("${song.id}/$genre peak=$peak", peak <= 1.0f)
            assertTrue("${song.id}/$genre 반주가 너무 작음 rms=$rms", rms > 0.02)
            assertTrue("${song.id}/$genre 합성이 너무 느림 ${ms}ms", ms < 3000)
        }
    }

    @Test
    fun wavHeaderIsValid() {
        val bytes = java.io.ByteArrayOutputStream().also { WavWriter.write(it, FloatArray(1000) { 0.5f }, 44100) }.toByteArray()
        assertTrue(String(bytes, 0, 4) == "RIFF" && String(bytes, 8, 4) == "WAVE")
        assertTrue(bytes.size == 44 + 2000)
        val dataLen = java.nio.ByteBuffer.wrap(bytes, 40, 4).order(java.nio.ByteOrder.LITTLE_ENDIAN).int
        assertTrue(dataLen == 2000)
    }
}
