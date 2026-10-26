package com.singturn.studio

/**
 * 멜로디에 어울리는 코드를 코드 칸(마디 또는 반 마디)마다 하나씩 고른다.
 * 마디 안 멜로디 음이 코드 구성음에 많이 들어갈수록, 자주 쓰는 코드 진행일수록 점수가 높고
 * 비터비(Viterbi) 알고리즘으로 곡 전체 점수가 가장 높은 진행을 찾는다.
 */
object Harmonizer {

    // 다이어토닉 코드 인덱스(0..5) 사이의 자연스러운 진행
    private val goodMovesMajor = setOf(0 to 3, 0 to 4, 0 to 5, 1 to 4, 3 to 4, 3 to 0, 4 to 0, 4 to 5, 5 to 3, 5 to 1, 2 to 5, 3 to 1)
    private val goodMovesMinor = setOf(0 to 2, 0 to 4, 0 to 5, 2 to 3, 3 to 0, 4 to 5, 5 to 0, 4 to 2, 1 to 4, 2 to 0, 5 to 1)

    fun harmonize(notes: List<MelodyNote>, key: MusicKey, slotBeats: Int, slots: Int): List<ChordSymbol> {
        if (slots <= 0) return emptyList()
        val bars = slots
        val options = key.diatonicChords
        val goodMoves = if (key.minor) goodMovesMinor else goodMovesMajor
        val emission = Array(bars) { bar -> DoubleArray(options.size) { c -> fit(notes, bar, slotBeats, options[c], key) } }

        fun prior(bar: Int, c: Int): Double = when {
            bars == 1 -> if (c == 0) 1.5 else 0.0
            bar == 0 -> if (c == 0) 1.0 else 0.0
            bar == bars - 1 -> if (c == 0) 1.5 else 0.0
            bar == bars - 2 -> when (c) { 4 -> 0.7; 3 -> 0.3; else -> 0.0 }
            else -> 0.0
        }
        fun transition(a: Int, b: Int): Double = when {
            (a to b) in goodMoves -> 0.6
            a == b -> 0.1
            else -> 0.0
        }

        val score = Array(bars) { DoubleArray(options.size) }
        val back = Array(bars) { IntArray(options.size) }
        for (c in options.indices) score[0][c] = emission[0][c] + prior(0, c)
        for (bar in 1 until bars) {
            for (c in options.indices) {
                var best = Double.NEGATIVE_INFINITY
                var arg = 0
                for (p in options.indices) {
                    val v = score[bar - 1][p] + transition(p, c)
                    if (v > best) { best = v; arg = p }
                }
                score[bar][c] = best + emission[bar][c] + prior(bar, c)
                back[bar][c] = arg
            }
        }
        val path = IntArray(bars)
        path[bars - 1] = options.indices.maxBy { score[bars - 1][it] }
        for (bar in bars - 1 downTo 1) path[bar - 1] = back[bar][path[bar]]
        return path.map { options[it] }
    }

    /** 코드 칸 안 멜로디가 코드와 얼마나 맞는지 (박 길이 가중, 칸 첫 박에서 시작한 음은 1.5배) */
    private fun fit(notes: List<MelodyNote>, slot: Int, slotBeats: Int, chord: ChordSymbol, key: MusicKey): Double {
        val from = slot * slotBeats.toDouble()
        val to = from + slotBeats
        var s = 0.0
        for (n in notes) {
            val overlap = minOf(n.endBeat, to) - maxOf(n.startBeat, from)
            if (overlap <= 0) continue
            val strong = if (n.startBeat == from) 1.5 else 1.0
            val pc = pitchClass(n.midi)
            s += overlap * strong * when {
                pc == chord.root -> 1.2
                pc in chord.tones -> 1.0
                pc in key.scale -> -0.3
                else -> 0.0
            }
        }
        return s
    }
}
