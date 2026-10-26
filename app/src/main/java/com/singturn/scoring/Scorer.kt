package com.singturn.scoring

import com.singturn.data.song.Note
import kotlin.math.abs
import kotlin.math.roundToInt

enum class Judgement(val label: String, val minScore: Double) {
    PERFECT("PERFECT", 0.85), GREAT("GREAT", 0.65), GOOD("GOOD", 0.4), MISS("MISS", 0.0);

    companion object {
        fun of(score: Double) = entries.first { score >= it.minScore }
    }
}

data class ScoreResult(
    val total: Int,
    val pitch: Int,
    val rhythm: Int,
    val stability: Int,
    val hasReference: Boolean,
    val perfect: Int = 0,
    val great: Int = 0,
    val good: Int = 0,
    val miss: Int = 0,
    val maxCombo: Int = 0,
) {
    val grade: String
        get() = when {
            total >= 95 -> "S+"
            total >= 90 -> "S"
            total >= 80 -> "A"
            total >= 70 -> "B"
            total >= 55 -> "C"
            else -> "D"
        }
}

/** 성별·음역 차이를 허용하기 위해 옥타브를 무시한 반음 거리 (0..6). */
fun pitchClassDistance(sung: Double, target: Double): Double {
    val d = ((sung - target) % 12.0 + 12.0) % 12.0
    return if (d > 6.0) 12.0 - d else d
}

/** 표시용: 노래한 음을 목표 음과 가장 가까운 옥타브로 옮긴다. */
fun foldToOctaveOf(sung: Double, target: Double): Double {
    var s = sung
    while (s - target > 6.0) s -= 12.0
    while (target - s > 6.0) s += 12.0
    return s
}

/**
 * 프레임 단위로 들어오는 음정을 기준 멜로디와 비교해 점수를 매긴다.
 * 기준 멜로디가 없는 곡(사용자 MR)은 음정 안정도·발성 비율·성량 변화로 참고용 점수를 매긴다.
 */
class Scorer(private val notes: List<Note>) {

    private class NoteStat {
        var frames = 0
        var voiced = 0
        var pitchSum = 0.0
        var firstVoicedAt = Double.NaN
        val cents = ArrayList<Double>()
    }

    private val stats = Array(notes.size) { NoteStat() }
    private var cursor = 0
    private var judgedCount = 0

    private var combo = 0
    var maxCombo = 0; private set
    private val counts = IntArray(Judgement.entries.size)

    // 기준 멜로디가 없을 때 사용
    private var freeFrames = 0
    private var freeVoiced = 0
    private var lastVoicedMidi: Double? = null
    private var jitterSum = 0.0
    private var jitterCount = 0
    private val rmsSamples = ArrayList<Double>()

    /** 판정이 새로 확정된 음 (UI 효과용). 읽으면 비워진다. */
    var latestJudgement: Judgement? = null
        private set

    fun consumeJudgement(): Judgement? = latestJudgement.also { latestJudgement = null }

    /** 현재 시간에 불러야 할 음 */
    fun targetAt(t: Double): Note? {
        while (cursor < notes.size && notes[cursor].endSec <= t) cursor++
        val n = notes.getOrNull(cursor) ?: return null
        return if (t >= n.startSec) n else null
    }

    fun addFrame(t: Double, sungMidi: Double?, rms: Double) {
        if (notes.isEmpty()) {
            addFreeFrame(sungMidi, rms)
            return
        }
        judgeFinishedNotes(t)
        val idx = indexAt(t) ?: return
        val note = notes[idx]
        val s = stats[idx]
        s.frames++
        if (sungMidi != null) {
            s.voiced++
            s.pitchSum += framePitchScore(pitchClassDistance(sungMidi, note.midi.toDouble()))
            s.cents += foldToOctaveOf(sungMidi, note.midi.toDouble()) * 100.0
            if (s.firstVoicedAt.isNaN()) s.firstVoicedAt = t
        }
    }

    private fun indexAt(t: Double): Int? {
        targetAt(t)
        return if (cursor < notes.size && t >= notes[cursor].startSec && t < notes[cursor].endSec) cursor else null
    }

    private fun judgeFinishedNotes(t: Double) {
        while (judgedCount < notes.size && notes[judgedCount].endSec <= t) {
            val i = judgedCount++
            val j = Judgement.of(noteScore(i))
            counts[j.ordinal]++
            latestJudgement = j
            if (j == Judgement.MISS) combo = 0 else {
                combo++
                maxCombo = maxOf(maxCombo, combo)
            }
        }
    }

    val currentCombo get() = combo

    private fun framePitchScore(semitones: Double): Double = when {
        semitones <= 0.5 -> 1.0
        semitones >= 2.0 -> 0.0
        else -> 1.0 - (semitones - 0.5) / 1.5
    }

    private fun notePitch(i: Int) = stats[i].let { if (it.voiced == 0) 0.0 else it.pitchSum / it.voiced }
    private fun noteCoverage(i: Int) = stats[i].let { if (it.frames == 0) 0.0 else it.voiced.toDouble() / it.frames }

    private fun noteOnset(i: Int): Double {
        val s = stats[i]
        if (s.firstVoicedAt.isNaN()) return 0.0
        val late = s.firstVoicedAt - notes[i].startSec
        return when {
            late <= 0.15 -> 1.0
            late >= 0.5 -> 0.0
            else -> 1.0 - (late - 0.15) / 0.35
        }
    }

    private fun noteStability(i: Int): Double? {
        val c = stats[i].cents
        if (c.size < 3) return null
        // 음 사이를 미끄러지는 구간(앞 음이 섞인 프레임)에 흔들리지 않도록 중앙값 기반 편차(MAD)를 쓴다
        val median = c.sorted()[c.size / 2]
        val mad = c.map { abs(it - median) }.sorted()[c.size / 2]
        val sd = 1.4826 * mad
        return (1.0 - sd / 80.0).coerceIn(0.0, 1.0)
    }

    private fun noteScore(i: Int): Double {
        val coverage = (noteCoverage(i) / 0.6).coerceAtMost(1.0)
        return notePitch(i) * coverage
    }

    /** 지금까지 끝난(또는 진행 중인) 음 기준 실시간 점수 */
    fun liveScore(t: Double): Int = compute(upTo = t).total

    fun result(): ScoreResult = compute(upTo = Double.MAX_VALUE)

    private fun compute(upTo: Double): ScoreResult {
        if (notes.isEmpty()) return freeResult()
        var weight = 0.0
        var pitch = 0.0
        var rhythm = 0.0
        var stabSum = 0.0
        var stabWeight = 0.0
        for (i in notes.indices) {
            val n = notes[i]
            if (n.startSec >= upTo) break
            if (stats[i].frames == 0 && n.endSec > upTo) continue
            val w = n.durSec
            val np = notePitch(i)
            weight += w
            pitch += w * np
            // 틀린 음을 박자만 맞춰 부르면 점수가 쌓이지 않도록, 음정이 어느 정도 맞은 음에만 박자·안정감을 준다
            val gate = (np / 0.5).coerceAtMost(1.0)
            val coverage = (noteCoverage(i) / 0.6).coerceAtMost(1.0)
            rhythm += w * gate * (0.5 * coverage + 0.5 * noteOnset(i))
            noteStability(i)?.let { stabSum += w * gate * it; stabWeight += w }
        }
        if (weight == 0.0) return ScoreResult(0, 0, 0, 0, hasReference = true)
        val p = pitch / weight
        val r = rhythm / weight
        val st = if (stabWeight == 0.0) 0.0 else stabSum / stabWeight
        val total = 100 * (0.6 * p + 0.25 * r + 0.15 * st)
        return ScoreResult(
            total = total.roundToInt().coerceIn(0, 100),
            pitch = (p * 100).roundToInt(),
            rhythm = (r * 100).roundToInt(),
            stability = (st * 100).roundToInt(),
            hasReference = true,
            perfect = counts[Judgement.PERFECT.ordinal],
            great = counts[Judgement.GREAT.ordinal],
            good = counts[Judgement.GOOD.ordinal],
            miss = counts[Judgement.MISS.ordinal],
            maxCombo = maxCombo,
        )
    }

    /** 곡이 끝난 뒤 남은 음을 모두 판정 */
    fun finish(endSec: Double) = judgeFinishedNotes(endSec + 1.0)

    private fun addFreeFrame(sungMidi: Double?, rms: Double) {
        freeFrames++
        if (sungMidi != null) {
            freeVoiced++
            rmsSamples += rms
            lastVoicedMidi?.let { prev ->
                val jump = abs(sungMidi - prev)
                // 1.5반음 넘는 변화는 음 이동으로 보고, 그 이하의 흔들림만 불안정으로 본다
                if (jump < 1.5) {
                    jitterSum += jump
                    jitterCount++
                }
            }
            lastVoicedMidi = sungMidi
        } else {
            lastVoicedMidi = null
        }
    }

    private fun freeResult(): ScoreResult {
        if (freeFrames == 0) return ScoreResult(0, 0, 0, 0, hasReference = false)
        val voicedRatio = freeVoiced.toDouble() / freeFrames
        val sing = (voicedRatio / 0.5).coerceAtMost(1.0)
        val stab = if (jitterCount == 0) 0.0 else (1.0 - (jitterSum / jitterCount) / 0.6).coerceIn(0.0, 1.0)
        val dyn = if (rmsSamples.size < 10) 0.0 else {
            val sorted = rmsSamples.sorted()
            val lo = sorted[sorted.size / 10]
            val hi = sorted[sorted.size * 9 / 10]
            ((hi / lo.coerceAtLeast(1e-4) - 1.0) / 2.0).coerceIn(0.0, 1.0)
        }
        val total = 100 * (0.5 * stab + 0.3 * sing + 0.2 * dyn)
        return ScoreResult(
            total = total.roundToInt().coerceIn(0, 100),
            pitch = (stab * 100).roundToInt(),
            rhythm = (sing * 100).roundToInt(),
            stability = (dyn * 100).roundToInt(),
            hasReference = false,
        )
    }
}
