package com.melodeal

import com.melodeal.audio.PitchDetector
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import kotlin.math.PI
import kotlin.math.sin
import kotlin.random.Random

class PitchDetectorTest {
    private val sr = 44100
    private val detector = PitchDetector(sr)

    private fun voice(hz: Double, amp: Double = 0.3) = FloatArray(2048) { i ->
        // 배음이 섞인 목소리 비슷한 신호
        val p = 2 * PI * hz * i / sr
        (amp * (sin(p) + 0.5 * sin(2 * p) + 0.25 * sin(3 * p))).toFloat()
    }

    @Test
    fun detectsSungNotes() {
        for (hz in listOf(98.0, 196.0, 261.63, 440.0, 880.0)) {
            val f = detector.detect(voice(hz)).frequency!!
            assertEquals("$hz Hz", hz, f, hz * 0.01)
        }
    }

    @Test
    fun midiConversion() {
        assertEquals(69.0, detector.detect(voice(440.0)).midi!!, 0.1)
        assertEquals(60.0, detector.detect(voice(261.63)).midi!!, 0.1)
    }

    @Test
    fun silenceAndNoiseAreUnvoiced() {
        assertNull(detector.detect(FloatArray(2048)).frequency)
        val rnd = Random(1)
        assertNull(detector.detect(FloatArray(2048) { rnd.nextDouble(-0.3, 0.3).toFloat() }).frequency)
    }
}
