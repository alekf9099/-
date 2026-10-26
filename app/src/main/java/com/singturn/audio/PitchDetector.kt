package com.singturn.audio

import kotlin.math.ln
import kotlin.math.sqrt

/**
 * YIN 음정 검출 (de Cheveigné & Kawahara, 2002).
 * 사람 목소리 범위(약 70Hz ~ 1100Hz)에 맞춰 탐색 범위를 제한해 연산량을 줄인다.
 */
class PitchDetector(
    private val sampleRate: Int,
    private val windowSize: Int = 2048,
    minFreq: Double = 70.0,
    maxFreq: Double = 1100.0,
    private val threshold: Double = 0.15,
    private val silenceRms: Double = 0.012,
) {
    private val tauMin = (sampleRate / maxFreq).toInt().coerceAtLeast(2)
    private val tauMax = (sampleRate / minFreq).toInt().coerceAtMost(windowSize / 2)
    private val diff = DoubleArray(tauMax + 1)

    data class Result(val frequency: Double?, val rms: Double) {
        val midi: Double? get() = frequency?.let { 69.0 + 12.0 * ln(it / 440.0) / ln(2.0) }
    }

    fun detect(frame: FloatArray): Result {
        require(frame.size >= windowSize)
        var sumSq = 0.0
        for (i in 0 until windowSize) sumSq += frame[i] * frame[i]
        val rms = sqrt(sumSq / windowSize)
        if (rms < silenceRms) return Result(null, rms)

        val half = windowSize / 2
        // 1) 차이 함수
        for (tau in 1..tauMax) {
            var s = 0.0
            for (j in 0 until half) {
                val d = frame[j] - frame[j + tau]
                s += d * d
            }
            diff[tau] = s
        }
        // 2) 누적 평균 정규화
        diff[0] = 1.0
        var running = 0.0
        for (tau in 1..tauMax) {
            running += diff[tau]
            diff[tau] = if (running == 0.0) 1.0 else diff[tau] * tau / running
        }
        // 3) 임계값 이하 첫 극소점
        var tau = tauMin
        var found = -1
        while (tau <= tauMax) {
            if (diff[tau] < threshold) {
                while (tau + 1 <= tauMax && diff[tau + 1] < diff[tau]) tau++
                found = tau
                break
            }
            tau++
        }
        if (found < 0) return Result(null, rms)
        // 4) 포물선 보간
        val betterTau = if (found in 1 until tauMax) {
            val s0 = diff[found - 1]
            val s1 = diff[found]
            val s2 = diff[found + 1]
            val denom = 2 * (2 * s1 - s2 - s0)
            if (denom != 0.0) found + (s2 - s0) / denom else found.toDouble()
        } else {
            found.toDouble()
        }
        return Result(sampleRate / betterTau, rms)
    }
}
