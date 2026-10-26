package com.melodeal.studio

import kotlin.random.Random

/**
 * 음악 이론 규칙으로 새 멜로디를 만든다 (체험 모드 예시 곡, 영감 기능용).
 * - 2마디 리듬 패턴을 골라 반복·변형 (A A' B A'' 구조)
 * - 대부분 순차 진행, 가끔 3도·4도 도약
 * - 프레이즈 끝은 으뜸음(마지막) 또는 딸림음(중간)으로 마무리
 */
object MelodyGenerator {
    private val rhythms = listOf(
        listOf(1.0, 1.0, 1.0, 1.0, 2.0, 2.0),
        listOf(1.5, 0.5, 1.0, 1.0, 1.0, 1.0, 2.0),
        listOf(0.5, 0.5, 1.0, 1.0, 1.0, 0.5, 0.5, 1.0, 2.0),
        listOf(1.0, 0.5, 0.5, 1.0, 1.0, 3.0, 1.0),
        listOf(2.0, 1.0, 1.0, 1.5, 0.5, 2.0),
    )

    fun generate(key: MusicKey, seed: Long, bars: Int = 8, center: Int = 67): List<MelodyNote> {
        val rnd = Random(seed)
        val scale = (center - 12..center + 12).filter { key.inScale(it) }
        fun nearestIndex(m: Int) = scale.indices.minBy { kotlin.math.abs(scale[it] - m) }
        val tonicIdx = scale.indices.filter { pitchClass(scale[it]) == key.tonic }.minBy { kotlin.math.abs(scale[it] - center) }
        val dominantPc = (key.tonic + 7) % 12

        val phraseRhythm = rhythms[rnd.nextInt(rhythms.size)]
        val altRhythm = rhythms[rnd.nextInt(rhythms.size)]
        val notes = mutableListOf<MelodyNote>()
        var idx = nearestIndex(scale[tonicIdx] + listOf(0, 4, 7)[rnd.nextInt(3)])
        var beat = 0.0
        val phrases = bars / 2
        for (p in 0 until phrases) {
            val rhythm = if (p == 2) altRhythm else phraseRhythm
            for ((i, len) in rhythm.withIndex()) {
                val last = i == rhythm.lastIndex
                if (last) {
                    // 프레이즈 끝: 마지막은 으뜸음, 중간은 딸림음 쪽으로
                    val targetPc = if (p == phrases - 1) key.tonic else if (p % 2 == 0) dominantPc else key.tonic
                    idx = scale.indices.filter { pitchClass(scale[it]) == targetPc }.minBy { kotlin.math.abs(it - idx) }
                } else {
                    val step = when (rnd.nextInt(10)) {
                        in 0..5 -> if (rnd.nextBoolean()) 1 else -1
                        6, 7 -> 0
                        8 -> if (rnd.nextBoolean()) 2 else -2
                        else -> if (rnd.nextBoolean()) 3 else -3
                    }
                    // 중심에서 너무 멀어지면 되돌아오게
                    val pull = if (idx > tonicIdx + 5) -1 else if (idx < tonicIdx - 4) 1 else 0
                    idx = (idx + step + pull).coerceIn(0, scale.lastIndex)
                }
                notes += MelodyNote(beat, len, scale[idx])
                beat += len
            }
        }
        return notes
    }
}
