package com.tuneup.community

import com.tuneup.studio.Composition
import com.tuneup.studio.LyricsFitter

enum class Visibility(val dbValue: String, val label: String, val caption: String) {
    PUBLIC("public", "전체 공개", "홈 · 차트에 올라가요"),
    UNLISTED("unlisted", "링크 공개", "링크를 받은 사람만 들을 수 있어요 (차트 제외)"),
    ;

    companion object {
        fun of(db: String?) = entries.firstOrNull { it.dbValue == db } ?: PUBLIC
    }
}

/**
 * 공유할 때 어디까지 보여줄지.
 * 서버에는 [ShareCut.apply]로 잘라낸 부분만 올라가고, 원본 전체는 내 폰에만 남는다.
 */
data class ShareSettings(
    val visibility: Visibility = Visibility.PUBLIC,
    /** 공개 시작 마디 (0부터) */
    val startBar: Int = 0,
    /** 공개할 마디 수 */
    val bars: Int,
    val includeLyrics: Boolean = true,
    val includeChords: Boolean = true,
    val allowRemix: Boolean = true,
    val allowSing: Boolean = true,
) {
    fun isPartial(fullBars: Int) = startBar > 0 || bars < fullBars

    /** 곡 길이에 맞게 범위를 바로잡는다 */
    fun coerceTo(full: Composition): ShareSettings {
        val total = full.bars
        val start = startBar.coerceIn(0, total - 1)
        return copy(startBar = start, bars = bars.coerceIn(1, total - start))
    }

    companion object {
        fun full(c: Composition) = ShareSettings(bars = c.bars)

        /** 음이 가장 많이 몰린 구간을 하이라이트로 추천 (같으면 앞쪽) */
        fun highlight(c: Composition, length: Int = 4): ShareSettings {
            val total = c.bars
            if (total <= length) return full(c)
            val bpb = c.beatsPerBar
            val best = (0..total - length).maxBy { start ->
                val from = start * bpb.toDouble()
                val to = (start + length) * bpb.toDouble()
                // 음 개수 + 높은 음(후렴일 가능성)에 약간 가산
                c.notes.filter { it.startBeat >= from - 1e-9 && it.startBeat < to }.sumOf { 1.0 + (it.midi - 60).coerceAtLeast(0) * 0.02 } - start * 1e-6
            }
            return ShareSettings(startBar = best, bars = length)
        }
    }
}

object ShareCut {
    /** 공개 범위만 남긴 곡. 음표·코드는 범위 시작이 0박이 되도록 당긴다 */
    fun apply(full: Composition, raw: ShareSettings): Composition {
        val s = raw.coerceTo(full)
        val bpb = full.beatsPerBar
        val from = s.startBar * bpb.toDouble()
        val to = (s.startBar + s.bars) * bpb.toDouble()
        val sorted = full.notes.sortedBy { it.startBeat }
        val picked = sorted.withIndex().filter { (_, n) -> n.startBeat >= from - 1e-9 && n.startBeat < to - 1e-9 }
        val notes = picked.map { (_, n) -> n.copy(startBeat = n.startBeat - from, beats = minOf(n.beats, to - n.startBeat)) }

        val chords = if (!s.includeChords) emptyList() else {
            val fitted = full.withFittedChords().chords
            val firstSlot = (from / full.chordBeats).toInt()
            val slots = (s.bars * bpb) / full.chordBeats
            fitted.drop(firstSlot).take(slots)
        }

        val lyrics = if (!s.includeLyrics) "" else {
            val syl = LyricsFitter.split(full.lyrics)
            join(picked.mapNotNull { (i, _) -> syl.getOrNull(i) })
        }
        return full.copy(notes = notes, chords = chords, lyrics = lyrics)
    }

    /** 음절 목록을 다시 가사 글로 (LyricsFitter.split 의 반대) */
    internal fun join(syl: List<LyricsFitter.Syl>): String = buildString {
        syl.forEachIndexed { i, x ->
            append(x.text)
            if (i == syl.lastIndex) return@forEachIndexed
            when {
                x.lineBreakAfter -> append('\n')
                x.joinNext -> if (x.text.last() !in '가'..'힣' && syl[i + 1].text.first() !in '가'..'힣') append('-')
                else -> append(' ')
            }
        }
    }
}
