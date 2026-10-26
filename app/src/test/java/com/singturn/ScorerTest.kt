package com.singturn

import com.singturn.data.song.SongParser
import com.singturn.scoring.Judgement
import com.singturn.scoring.Scorer
import com.singturn.scoring.pitchClassDistance
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.random.Random

class ScorerTest {
    private val song = SongParser.parseCatalog(File("src/main/assets/songs.json").readText()).first { it.id == "twinkle" }
    private val hop = 1024.0 / 44100

    /** 곡 전체를 hop 간격으로 흉내 내어 부른다 */
    private fun sing(sung: (t: Double, target: Int?) -> Double?): Scorer {
        val s = Scorer(song.notes)
        var t = 0.0
        while (t < song.durationSec) {
            val target = song.notes.firstOrNull { t >= it.startSec && t < it.endSec }?.midi
            s.addFrame(t, sung(t, target), 0.1)
            t += hop
        }
        s.finish(song.durationSec)
        return s
    }

    @Test
    fun octaveIsIgnored() {
        assertEquals(0.0, pitchClassDistance(48.0, 60.0), 1e-9)
        assertEquals(1.0, pitchClassDistance(61.0, 48.0), 1e-9)
        assertEquals(6.0, pitchClassDistance(66.0, 60.0), 1e-9)
    }

    @Test
    fun perfectSingingScoresHigh() {
        val r = sing { _, target -> target?.toDouble() }.result()
        assertTrue("total=${r.total}", r.total >= 95)
        assertEquals(0, r.miss)
        assertEquals(song.notes.size, r.perfect)
        assertEquals(song.notes.size, r.maxCombo)
    }

    @Test
    fun maleOctaveLowerStillScoresHigh() {
        val r = sing { _, target -> target?.let { it - 12.0 } }.result()
        assertTrue("total=${r.total}", r.total >= 95)
    }

    @Test
    fun slightlyFlatWithVibratoIsGoodButNotPerfect() {
        val rnd = Random(3)
        val r = sing { _, target -> target?.let { it - 0.7 + rnd.nextDouble(-0.3, 0.3) } }.result()
        assertTrue("total=${r.total}", r.total in 60..92)
    }

    @Test
    fun silenceScoresZero() {
        val r = sing { _, _ -> null }.result()
        assertEquals(0, r.total)
        assertEquals(song.notes.size, r.miss)
    }

    @Test
    fun wrongNotesScoreLow() {
        val r = sing { _, target -> target?.let { it + 5.0 } }.result()
        assertTrue("total=${r.total}", r.total < 40)
    }

    @Test
    fun lateEntranceLowersRhythm() {
        val onTime = sing { _, target -> target?.toDouble() }.result()
        val late = sing { t, target ->
            val n = song.notes.firstOrNull { t >= it.startSec && t < it.endSec }
            if (n != null && t - n.startSec < 0.3) null else target?.toDouble()
        }.result()
        assertTrue(late.rhythm < onTime.rhythm)
    }

    @Test
    fun freeModeWithoutReference() {
        val s = Scorer(emptyList())
        repeat(400) { i -> s.addFrame(i * hop, if (i % 3 == 0) null else 60.0 + (i / 40), 0.05 + (i % 40) / 200.0) }
        val r = s.result()
        assertFalse(r.hasReference)
        assertTrue(r.total in 1..100)
    }

    @Test
    fun judgementThresholds() {
        assertEquals(Judgement.PERFECT, Judgement.of(0.9))
        assertEquals(Judgement.GREAT, Judgement.of(0.7))
        assertEquals(Judgement.GOOD, Judgement.of(0.5))
        assertEquals(Judgement.MISS, Judgement.of(0.1))
    }
}
