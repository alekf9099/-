package com.melodeal.audio

import com.melodeal.data.song.Song
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.sin
import kotlin.random.Random

/** 합성된 반주. 가이드 멜로디는 따로 두어 재생 중 볼륨을 조절할 수 있다. */
class RenderedSong(val sampleRate: Int, val backing: FloatArray, val guide: FloatArray, val songStartSec: Double)

/**
 * 곡 데이터(멜로디·코드)만으로 반주를 직접 합성한다.
 * 외부 음원을 쓰지 않으므로 반주 녹음물에 대한 별도 권리 문제가 생기지 않는다.
 */
object Synth {
    const val SAMPLE_RATE = 44100

    internal fun midiToHz(m: Int) = 440.0 * 2.0.pow((m - 69) / 12.0)

    fun render(song: Song, sampleRate: Int = SAMPLE_RATE): RenderedSong {
        val start = song.countInSec
        val total = ((start + song.durationSec + 1.2) * sampleRate).toInt()
        val backing = FloatArray(total)
        val guide = FloatArray(total)
        val spb = song.secPerBeat

        // 카운트인: 한 마디 클릭 (첫 박 강하게)
        for (b in 0 until song.beatsPerBar) {
            click(backing, (b * spb * sampleRate).toInt(), if (b == 0) 0.55f else 0.35f, if (b == 0) 1600.0 else 1100.0, sampleRate)
        }

        Arranger(song, backing, sampleRate, start).arrange()

        // 가이드 멜로디
        for (n in song.notes) {
            tone(guide, start + n.startSec, n.durSec * 0.95, midiToHz(n.midi), 0.22f, sampleRate, Wave.LEAD)
        }

        normalize(backing, guide)
        return RenderedSong(sampleRate, backing, guide, start)
    }

    /** 지연 보정용 클릭 트랙 */
    fun clickTrack(clickTimes: List<Double>, lengthSec: Double, sampleRate: Int = SAMPLE_RATE): FloatArray {
        val out = FloatArray((lengthSec * sampleRate).toInt())
        for (t in clickTimes) click(out, (t * sampleRate).toInt(), 0.9f, 2000.0, sampleRate)
        return out
    }

    internal enum class Wave { PAD, BASS, LEAD }

    internal fun tone(buf: FloatArray, startSec: Double, durSec: Double, hz: Double, amp: Float, sr: Int, wave: Wave) {
        val s0 = (startSec * sr).toInt()
        val len = (durSec * sr).toInt()
        val attack = (sr * if (wave == Wave.PAD) 0.06 else 0.012).toInt()
        val release = (sr * if (wave == Wave.PAD) 0.15 else 0.06).toInt()
        val w = 2 * PI * hz / sr
        var leadPhase = 0.0
        for (i in 0 until len + release) {
            val idx = s0 + i
            if (idx !in buf.indices) break
            val env = when {
                i < attack -> i.toDouble() / attack
                i < len -> if (wave == Wave.LEAD) 1.0 - 0.25 * (i - attack).toDouble() / len else 1.0
                else -> (if (wave == Wave.LEAD) 0.75 else 1.0) * (1.0 - (i - len).toDouble() / release)
            }
            val ph = w * i
            val v = when (wave) {
                Wave.PAD -> sin(ph) + 0.3 * sin(2 * ph)
                Wave.BASS -> sin(ph) + 0.25 * sin(2 * ph) + 0.1 * sin(3 * ph)
                // 부드러운 삼각파에 가까운 배음 + 약한 비브라토
                Wave.LEAD -> {
                    // 비브라토는 주파수를 흔들어야 하므로 위상을 매 샘플 누적한다 (약 ±7센트, 음 후반으로 갈수록 깊어짐)
                    val depth = 0.004 * (i.toDouble() / (len + 1)).coerceAtMost(1.0)
                    leadPhase += w * (1.0 + depth * sin(2 * PI * 5.0 * i / sr))
                    sin(leadPhase) - sin(3 * leadPhase) / 9 + sin(5 * leadPhase) / 25
                }
            }
            buf[idx] += (amp * env * v).toFloat()
        }
    }

    internal fun click(buf: FloatArray, at: Int, amp: Float, hz: Double, sr: Int) {
        val len = (sr * 0.03).toInt()
        for (i in 0 until len) {
            val idx = at + i
            if (idx !in buf.indices) break
            buf[idx] += (amp * exp(-i / (sr * 0.004)) * sin(2 * PI * hz * i / sr)).toFloat()
        }
    }

    internal fun hat(buf: FloatArray, at: Int, amp: Float, sr: Int, rnd: Random) {
        val len = (sr * 0.04).toInt()
        var prev = 0.0
        for (i in 0 until len) {
            val idx = at + i
            if (idx !in buf.indices) break
            val n = rnd.nextDouble(-1.0, 1.0)
            val hp = n - prev // 간단한 고역 통과
            prev = n
            buf[idx] += (amp * exp(-i / (sr * 0.008)) * hp).toFloat()
        }
    }

    internal fun kick(buf: FloatArray, at: Int, amp: Float, sr: Int) {
        val len = (sr * 0.18).toInt()
        var phase = 0.0
        for (i in 0 until len) {
            val idx = at + i
            if (idx !in buf.indices) break
            val f = 45.0 + 90.0 * exp(-i / (sr * 0.03))
            phase += 2 * PI * f / sr
            buf[idx] += (amp * exp(-i / (sr * 0.06)) * sin(phase)).toFloat()
        }
    }

    /** 녹음용 메트로놈: 카운트인 한 마디 + bars 마디 (첫 박 강세) */
    fun metronome(bpm: Double, beatsPerBar: Int, bars: Int, sampleRate: Int = SAMPLE_RATE): RenderedSong {
        val spb = 60.0 / bpm
        val countIn = beatsPerBar * spb
        val total = ((countIn + bars * beatsPerBar * spb + 0.5) * sampleRate).toInt()
        val clicks = FloatArray(total)
        for (b in 0 until (bars + 1) * beatsPerBar) {
            val accent = b % beatsPerBar == 0
            val amp = if (b < beatsPerBar) (if (accent) 0.6f else 0.4f) else (if (accent) 0.32f else 0.2f)
            click(clicks, (b * spb * sampleRate).toInt(), amp, if (accent) 1600.0 else 1100.0, sampleRate)
        }
        return RenderedSong(sampleRate, clicks, FloatArray(total), countIn)
    }

    private fun normalize(a: FloatArray, b: FloatArray) {
        var peak = 0f
        for (i in a.indices) peak = maxOf(peak, abs(a[i]) + abs(b[i]))
        if (peak > 0.95f) {
            val g = 0.95f / peak
            for (i in a.indices) { a[i] *= g; b[i] *= g }
        }
    }
}
