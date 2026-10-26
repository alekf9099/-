package com.tuneup.audio

import com.tuneup.data.song.Chord
import com.tuneup.data.song.Genre
import com.tuneup.data.song.Song
import kotlin.math.PI
import kotlin.math.ceil
import kotlin.math.exp
import kotlin.math.sin
import kotlin.random.Random

/**
 * 장르별 반주 편곡. 8분음표 단위로 곡을 훑으며 장르마다 정해진 악기·리듬 패턴을 깐다.
 *
 * | 장르 | 화음 | 베이스 | 드럼 |
 * |---|---|---|---|
 * | 발라드 | 피아노 아르페지오 + 패드 | 온음표 근음 | 킥(1박)·약한 스네어 |
 * | 팝 | 피아노 블록 코드(매 박) | 근음·5음 4분음표 | 킥 1·3박, 스네어 2·4박, 8비트 하이햇 |
 * | 댄스 | 신스 스탭(엇박) + 패드 | 엇박 옥타브 | 4비트 킥, 클랩 2·4박, 오픈 하이햇 |
 * | 어쿠스틱 | 통기타 스트럼(D-DU-UDU) | 근음 | 카혼 |
 */
internal class Arranger(
    private val song: Song,
    private val out: FloatArray,
    private val sr: Int,
    private val offsetSec: Double,
) {
    private val spb = song.secPerBeat
    private val step = spb / 2
    private val bpb = song.beatsPerBar
    private val rnd = Random(7)

    fun arrange() {
        val steps = ceil(song.durationSec / step - 1e-9).toInt()
        for (k in 0 until steps) {
            val t = k * step
            val beatInBar = (k / 2) % bpb
            val offbeat = k % 2 == 1
            drums(t, beatInBar, offbeat)
            val chord = song.chords.firstOrNull { t >= it.startSec - 1e-9 && t < it.startSec + it.durSec - 1e-9 } ?: continue
            val root = chord.rootMidi ?: continue
            val first = t - chord.startSec < 1e-6
            harmony(t, k, chord, root, beatInBar, offbeat, first)
        }
    }

    private fun at(t: Double) = offsetSec + t

    private fun triad(root: Int, c: Chord): List<Int> {
        val third = root + if (c.minor) 3 else 4
        val tones = mutableListOf(root, third, root + 7)
        if (c.seventh) tones += root + 10
        return tones
    }

    private fun harmony(t: Double, k: Int, c: Chord, root: Int, beat: Int, offbeat: Boolean, first: Boolean) {
        val chordEnd = c.startSec + c.durSec
        val mid = triad(root + 12, c).map { if (it > 72) it - 12 else it } // C4 부근 보이싱
        when (song.genre) {
            Genre.BALLAD -> {
                if (first) {
                    mid.forEach { Synth.tone(out, at(t), c.durSec, Synth.midiToHz(it + 12), 0.025f, sr, Synth.Wave.PAD) }
                    Synth.tone(out, at(t), c.durSec * 0.97, Synth.midiToHz(root), 0.15f, sr, Synth.Wave.BASS)
                }
                val arp = listOf(root, root + 7, root + 12, mid[1] + 12, root + 19, mid[1] + 12, root + 12, root + 7)
                val idx = ((t - c.startSec) / step).toInt() % arp.size
                piano(at(t), minOf(step * 2.5, chordEnd - t + 0.3), Synth.midiToHz(arp[idx] + 12), 0.11f)
            }
            Genre.POP -> {
                if (!offbeat) {
                    val accent = if (beat == 0) 1.0f else 0.8f
                    mid.forEach { piano(at(t), spb * 0.85, Synth.midiToHz(it), 0.065f * accent) }
                    val bass = if (beat % 2 == 0) root else if (beat == 1) root + 12 else root + 7
                    Synth.tone(out, at(t), spb * 0.8, Synth.midiToHz(bass), 0.16f, sr, Synth.Wave.BASS)
                } else if (beat == bpb - 1) {
                    // 마디 끝 엇박에 가볍게 당김음
                    mid.forEach { piano(at(t), step * 0.8, Synth.midiToHz(it), 0.035f) }
                }
            }
            Genre.DANCE -> {
                if (first) mid.forEach { Synth.tone(out, at(t), c.durSec, Synth.midiToHz(it), 0.02f, sr, Synth.Wave.PAD) }
                if (offbeat) {
                    mid.forEach { saw(at(t), step * 0.7, Synth.midiToHz(it + 12), 0.03f) }
                    Synth.tone(out, at(t), step * 0.8, Synth.midiToHz(root + if (k % 4 == 1) 12 else 0), 0.17f, sr, Synth.Wave.BASS)
                }
            }
            Genre.ACOUSTIC -> {
                // D - D U - U D U
                val pos = (k % (bpb * 2))
                val down = pos == 0 || pos == 2 || pos == 6
                val up = pos == 3 || pos == 5 || pos == 7
                val strings = guitarVoicing(root, c)
                val ring = minOf(spb * 1.2, chordEnd - t + 0.25)
                if (down) strum(at(t), strings, ring, 0.075f, ascending = true)
                if (up) strum(at(t), strings.drop(2), ring * 0.8, 0.05f, ascending = false)
                if (pos == 0 || (bpb >= 4 && pos == 4)) {
                    Synth.tone(out, at(t), spb * 1.6, Synth.midiToHz(if (pos == 0) root else root + 7), 0.12f, sr, Synth.Wave.BASS)
                }
            }
        }
    }

    private fun drums(t: Double, beat: Int, offbeat: Boolean) {
        val s = (at(t) * sr).toInt()
        val backbeat = bpb >= 4 && beat % 2 == 1 || bpb == 3 && beat == 2
        when (song.genre) {
            Genre.BALLAD -> {
                if (!offbeat && beat == 0) Synth.kick(out, s, 0.22f, sr)
                // 4/4는 3박에만 부드러운 스네어, 3/4는 킥과 하이햇만
                if (!offbeat && bpb >= 4 && beat == 2) snare(s, 0.06f, brushy = true)
                if (!offbeat) Synth.hat(out, s, 0.025f, sr, rnd)
            }
            Genre.POP -> {
                if (!offbeat && beat % 2 == 0) Synth.kick(out, s, 0.32f, sr)
                if (offbeat && beat == 2 && bpb >= 4) Synth.kick(out, s, 0.18f, sr)
                if (!offbeat && backbeat) snare(s, 0.13f, brushy = false)
                Synth.hat(out, s, if (offbeat) 0.03f else 0.045f, sr, rnd)
            }
            Genre.DANCE -> {
                if (!offbeat) Synth.kick(out, s, 0.4f, sr)
                if (!offbeat && backbeat) clap(s, 0.12f)
                if (offbeat) openHat(s, 0.05f)
            }
            Genre.ACOUSTIC -> {
                if (!offbeat && beat == 0) cajonLow(s, 0.25f)
                if (!offbeat && backbeat) snare(s, 0.07f, brushy = true)
            }
        }
    }

    private fun guitarVoicing(root: Int, c: Chord): List<Int> {
        val low = if (root - 12 >= 40) root - 12 else root // 기타 6번 줄 음역 (E2=40)
        val third = if (c.minor) 3 else 4
        val tones = mutableListOf(low, low + 7, low + 12, low + 12 + third, low + 19)
        if (c.seventh) tones[2] = low + 10
        return tones
    }

    private fun strum(startSec: Double, notes: List<Int>, dur: Double, amp: Float, ascending: Boolean) {
        val ordered = if (ascending) notes else notes.reversed()
        ordered.forEachIndexed { i, m -> pluck(startSec + i * 0.012, Synth.midiToHz(m), amp, dur) }
    }

    /** Karplus–Strong 현 진동 합성: 잡음을 짧은 지연선에 돌리며 평균내면 기타 줄 소리가 된다 */
    private fun pluck(startSec: Double, hz: Double, amp: Float, durSec: Double) {
        val n = (sr / hz).toInt().coerceAtLeast(2)
        val ring = DoubleArray(n) { rnd.nextDouble(-1.0, 1.0) }
        // 처음 잡음을 한 번 부드럽게 해서 쇳소리를 줄인다
        for (i in 1 until n) ring[i] = 0.5 * (ring[i] + ring[i - 1])
        val s0 = (startSec * sr).toInt()
        val len = (durSec * sr).toInt()
        val fade = (0.05 * sr).toInt()
        var idx = 0
        for (i in 0 until len) {
            val p = s0 + i
            if (p !in out.indices) break
            val cur = ring[idx]
            val next = ring[(idx + 1) % n]
            ring[idx] = 0.5 * (cur + next) * 0.996
            idx = (idx + 1) % n
            val env = if (i > len - fade) (len - i).toDouble() / fade else 1.0
            out[p] += (amp * cur * env).toFloat()
        }
    }

    /** 배음이 빨리 사라지는 전자 피아노풍 음색 (감쇠는 곱셈으로 계산해 빠르게) */
    private fun piano(startSec: Double, durSec: Double, hz: Double, amp: Float) {
        val s0 = (startSec * sr).toInt()
        val len = (durSec * sr).toInt()
        val release = (0.08 * sr).toInt()
        val attack = (0.004 * sr).toInt()
        val w = 2 * PI * hz / sr
        val d1 = exp(-(1.1 + hz / 900) / sr)
        val d2 = exp(-3.0 / sr)
        var e1 = 1.0
        var e2 = 1.0
        for (i in 0 until len + release) {
            val p = s0 + i
            if (p !in out.indices) break
            val ph = w * i
            val shape = when {
                i < attack -> i.toDouble() / attack
                i < len -> 1.0
                else -> 1.0 - (i - len).toDouble() / release
            }
            val v = e1 * (sin(ph) + e2 * (0.45 * sin(2 * ph) + 0.18 * sin(3 * ph) + 0.08 * sin(4 * ph)))
            out[p] += (amp * shape * v).toFloat()
            e1 *= d1
            e2 *= d2
        }
    }

    private fun saw(startSec: Double, durSec: Double, hz: Double, amp: Float) {
        val s0 = (startSec * sr).toInt()
        val len = (durSec * sr).toInt()
        val w = 2 * PI * hz / sr
        val d = exp(-9.0 / sr)
        var e = 1.0
        for (i in 0 until len) {
            val p = s0 + i
            if (p !in out.indices) break
            val ph = w * i
            var v = 0.0
            for (h in 1..6) v += sin(h * ph) / h
            val tail = if (i > len - 200) (len - i) / 200.0 else 1.0
            out[p] += (amp * e * tail * v).toFloat()
            e *= d
        }
    }

    private fun noiseBurst(s: Int, amp: Float, decaySec: Double, lenSec: Double, highpass: Boolean) {
        val len = (lenSec * sr).toInt()
        val d = exp(-1.0 / (decaySec * sr))
        var e = 1.0
        var prev = 0.0
        for (i in 0 until len) {
            val p = s + i
            if (p !in out.indices) break
            val n = rnd.nextDouble(-1.0, 1.0)
            val v = if (highpass) n - prev else n
            prev = n
            out[p] += (amp * e * v).toFloat()
            e *= d
        }
    }

    private fun snare(s: Int, amp: Float, brushy: Boolean) {
        noiseBurst(s, amp, if (brushy) 0.06 else 0.045, 0.2, highpass = !brushy)
        if (!brushy) {
            val len = (0.06 * sr).toInt()
            for (i in 0 until len) {
                val p = s + i
                if (p !in out.indices) break
                out[p] += (amp * 0.8 * exp(-i / (0.015 * sr)) * sin(2 * PI * 190.0 * i / sr)).toFloat()
            }
        }
    }

    private fun clap(s: Int, amp: Float) {
        for (j in 0 until 3) noiseBurst(s + (j * 0.009 * sr).toInt(), amp * 0.7f, 0.006, 0.02, highpass = true)
        noiseBurst(s + (0.027 * sr).toInt(), amp, 0.05, 0.18, highpass = true)
    }

    private fun openHat(s: Int, amp: Float) = noiseBurst(s, amp, 0.07, 0.2, highpass = true)

    private fun cajonLow(s: Int, amp: Float) {
        val len = (0.2 * sr).toInt()
        var phase = 0.0
        for (i in 0 until len) {
            val p = s + i
            if (p !in out.indices) break
            val f = 70.0 + 50.0 * exp(-i / (0.02 * sr))
            phase += 2 * PI * f / sr
            out[p] += (amp * exp(-i / (0.07 * sr)) * sin(phase)).toFloat()
        }
        noiseBurst(s, amp * 0.15f, 0.01, 0.03, highpass = false)
    }
}
