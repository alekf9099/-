package com.melodeal.studio

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.PI

/** 녹음 중 들어온 음정 프레임. midi == null 이면 무성(쉼). t는 녹음 시작(카운트인 이후) 기준 초. */
data class PitchFrame(val t: Double, val midi: Double?)

/**
 * 흥얼거린 소리를 악보로 옮긴다.
 *
 * 1. 짧은 끊김을 메우고 중앙값으로 흔들림(비브라토)을 누른다
 * 2. 음높이가 일정 시간 이상 바뀌면 새 음으로 자른다
 * 3. 전체 음정이 살짝 높거나 낮게 부른 경우를 보정하고 조성을 찾는다
 * 4. 조성 밖의 음은 가까운 음계음으로, 시작·길이는 박자 격자에 맞춘다
 */
object Transcriber {
    data class Result(val notes: List<MelodyNote>, val key: MusicKey)

    private class Segment(val startT: Double, var endT: Double, val values: MutableList<Double>) {
        val median get() = values.sorted()[values.size / 2]
        val dur get() = endT - startT
    }

    fun transcribe(
        frames: List<PitchFrame>,
        bpm: Double,
        beatsPerBar: Int,
        gridBeats: Double = 0.5,
        minNoteSec: Double = 0.09,
    ): Result {
        if (frames.size < 3) return Result(emptyList(), MusicKey(0, false))
        val hop = frames.zipWithNext { a, b -> b.t - a.t }.sorted().let { it[it.size / 2] }.coerceAtLeast(1e-3)
        val midi = smooth(fillGaps(frames.map { it.midi }))

        // 2) 음 단위로 자르기
        val segments = mutableListOf<Segment>()
        var cur: Segment? = null
        val pending = mutableListOf<Pair<Double, Double>>()
        fun flushPendingInto(seg: Segment) {
            pending.forEach { (t, v) -> seg.values += v; seg.endT = t + hop }
            pending.clear()
        }
        for (i in frames.indices) {
            val t = frames[i].t
            val v = midi[i]
            if (v == null) {
                cur?.let { flushPendingInto(it); segments += it }
                cur = null
                pending.clear()
                continue
            }
            val seg = cur
            if (seg == null) {
                cur = Segment(t, t + hop, mutableListOf(v))
                continue
            }
            if (abs(v - seg.median) <= 0.8 && pending.isEmpty()) {
                seg.values += v; seg.endT = t + hop
            } else {
                pending += t to v
                val consistent = pending.all { abs(it.second - pending.first().second) <= 0.8 }
                if (!consistent) {
                    flushPendingInto(seg)
                } else if (pending.size >= 3) {
                    // 3프레임 이상 다른 음이 유지되면 새 음
                    segments += seg
                    val first = pending.first()
                    cur = Segment(first.first, t + hop, pending.map { it.second }.toMutableList())
                    pending.clear()
                } else if (abs(v - seg.median) <= 0.8) {
                    flushPendingInto(seg)
                }
            }
        }
        cur?.let { flushPendingInto(it); segments += it }
        val notesRaw = segments.filter { it.dur >= minNoteSec }
        if (notesRaw.isEmpty()) return Result(emptyList(), MusicKey(0, false))

        // 3) 전체 음정 치우침 보정 (원형 평균) + 조성
        var sx = 0.0
        var sy = 0.0
        for (s in notesRaw) {
            val frac = s.median - s.median.roundToInt()
            sx += s.dur * cos(2 * PI * frac)
            sy += s.dur * sin(2 * PI * frac)
        }
        val offset = atan2(sy, sx) / (2 * PI)
        val pitches = notesRaw.map { it.median - offset }
        val histogram = DoubleArray(12)
        notesRaw.forEachIndexed { i, s -> histogram[pitchClass(pitches[i].roundToInt())] += s.dur }
        val key = MusicKey.detect(histogram)

        // 4) 음계·박자 격자에 맞추기
        val spb = 60.0 / bpm
        val quantized = notesRaw.mapIndexed { i, s ->
            val p = pitches[i]
            val r = p.roundToInt()
            val snapped = if (key.inScale(r)) r else listOf(r - 1, r + 1).filter { key.inScale(it) }.minByOrNull { abs(it - p) } ?: r
            val start = (s.startT / spb / gridBeats).roundToInt() * gridBeats
            var end = (s.endT / spb / gridBeats).roundToInt() * gridBeats
            if (end <= start) end = start + gridBeats
            MelodyNote(start, end - start, snapped)
        }

        // 겹침 정리: 같은 음이 겹치면 합치고, 다른 음이면 뒤 음을 민다
        val cleaned = mutableListOf<MelodyNote>()
        for (n in quantized.sortedBy { it.startBeat }) {
            val prev = cleaned.lastOrNull()
            if (prev == null || n.startBeat >= prev.endBeat) {
                cleaned += n
            } else if (n.midi == prev.midi) {
                cleaned[cleaned.lastIndex] = prev.copy(beats = maxOf(prev.endBeat, n.endBeat) - prev.startBeat)
            } else if (n.endBeat > prev.endBeat) {
                cleaned += MelodyNote(prev.endBeat, n.endBeat - prev.endBeat, n.midi)
            }
        }

        // 첫 음이 있는 마디가 1마디가 되도록 앞의 빈 마디를 잘라낸다
        val shift = floor(cleaned.first().startBeat / beatsPerBar) * beatsPerBar
        return Result(cleaned.map { it.copy(startBeat = it.startBeat - shift) }, key)
    }

    /** 2프레임 이하의 짧은 끊김은 앞뒤 음이 비슷하면 이어 붙인다 */
    private fun fillGaps(values: List<Double?>): List<Double?> {
        val out = values.toMutableList()
        var i = 0
        while (i < out.size) {
            if (out[i] == null) {
                var j = i
                while (j < out.size && out[j] == null) j++
                val before = out.getOrNull(i - 1)
                val after = out.getOrNull(j)
                if (j - i <= 2 && before != null && after != null && abs(before - after) < 1.0) {
                    for (k in i until j) out[k] = before
                }
                i = j
            } else {
                i++
            }
        }
        return out
    }

    /** 유성 구간 안에서만 5프레임 중앙값 필터 */
    private fun smooth(values: List<Double?>): List<Double?> = values.indices.map { i ->
        val v = values[i] ?: return@map null
        val window = (i - 2..i + 2).mapNotNull { values.getOrNull(it) }
        if (window.size < 3) v else window.sorted()[window.size / 2]
    }
}
