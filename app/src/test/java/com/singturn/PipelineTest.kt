package com.singturn

import com.singturn.audio.PitchDetector
import com.singturn.audio.Synth
import com.singturn.data.song.SongParser
import com.singturn.scoring.Scorer
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** 합성 → 음정 검출 → 채점 전체 경로 검증: 앱이 만든 가이드 멜로디를 그대로 "부르면" 고득점이어야 한다. */
class PipelineTest {
    private val songs = SongParser.parseCatalog(File("src/main/assets/songs.json").readText())

    @Test
    fun guideMelodyScoresNearPerfect() {
        for (song in songs) {
            for (key in listOf(0, -5)) {
                val s = song.transposed(key)
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
    fun backingTrackIsNotClipped() {
        for (song in songs) {
            val r = Synth.render(song)
            val peak = r.backing.indices.maxOf { kotlin.math.abs(r.backing[it] + r.guide[it]) }
            assertTrue("${song.id} peak=$peak", peak <= 1.0f)
        }
    }
}
