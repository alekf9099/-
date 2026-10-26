package com.tuneup.studio

import kotlinx.serialization.Serializable

val NOTE_NAMES = listOf("C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B")

fun pitchClass(midi: Int) = midi.mod(12)

/** "C4", "A#3" 형식의 음 이름 (C4 = 60) */
fun noteName(midi: Int) = NOTE_NAMES[pitchClass(midi)] + (midi / 12 - 1)

@Serializable
enum class Quality(val suffix: String, val intervals: List<Int>) {
    MAJOR("", listOf(0, 4, 7)),
    MINOR("m", listOf(0, 3, 7)),
    DOM7("7", listOf(0, 4, 7, 10)),
}

@Serializable
data class ChordSymbol(val root: Int, val quality: Quality) {
    val name: String get() = NOTE_NAMES[root] + quality.suffix
    val tones: Set<Int> get() = quality.intervals.map { (root + it) % 12 }.toSet()
}

@Serializable
data class MusicKey(val tonic: Int, val minor: Boolean) {
    val scale: List<Int>
        get() = (if (minor) MINOR_STEPS else MAJOR_STEPS).map { (tonic + it) % 12 }

    val label: String get() = NOTE_NAMES[tonic] + if (minor) " 단조" else " 장조"

    /**
     * 자동 반주에 쓰는 다이어토닉 코드 6개.
     * 장조: I ii iii IV V vi / 단조: i III iv V VI VII (V는 화성단음계의 장3화음)
     */
    val diatonicChords: List<ChordSymbol>
        get() = if (minor) {
            listOf(0 to Quality.MINOR, 3 to Quality.MAJOR, 5 to Quality.MINOR, 7 to Quality.MAJOR, 8 to Quality.MAJOR, 10 to Quality.MAJOR)
        } else {
            listOf(0 to Quality.MAJOR, 2 to Quality.MINOR, 4 to Quality.MINOR, 5 to Quality.MAJOR, 7 to Quality.MAJOR, 9 to Quality.MINOR)
        }.map { (iv, q) -> ChordSymbol((tonic + iv) % 12, q) }

    /** 직접 고를 때 보여줄 코드: 다이어토닉 + V7 */
    val chordChoices: List<ChordSymbol>
        get() = diatonicChords + ChordSymbol((tonic + 7) % 12, Quality.DOM7)

    fun inScale(midi: Int) = pitchClass(midi) in scale

    companion object {
        private val MAJOR_STEPS = listOf(0, 2, 4, 5, 7, 9, 11)
        private val MINOR_STEPS = listOf(0, 2, 3, 5, 7, 8, 10)

        // Krumhansl–Kessler 조성 프로파일
        private val MAJOR_PROFILE = doubleArrayOf(6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88)
        private val MINOR_PROFILE = doubleArrayOf(6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17)

        /** 음높이별 길이 합(12칸)으로 가장 그럴듯한 조성을 찾는다. 장·단조가 비슷하면 장조를 고른다. */
        fun detect(histogram: DoubleArray): MusicKey {
            if (histogram.sum() == 0.0) return MusicKey(0, false)
            var best = MusicKey(0, false)
            var bestScore = Double.NEGATIVE_INFINITY
            for (minor in listOf(false, true)) {
                val profile = if (minor) MINOR_PROFILE else MAJOR_PROFILE
                for (tonic in 0 until 12) {
                    val rotated = DoubleArray(12) { profile[(it - tonic).mod(12)] }
                    val score = correlation(histogram, rotated) - if (minor) 0.03 else 0.0
                    if (score > bestScore) {
                        bestScore = score
                        best = MusicKey(tonic, minor)
                    }
                }
            }
            return best
        }

        private fun correlation(a: DoubleArray, b: DoubleArray): Double {
            val ma = a.average()
            val mb = b.average()
            var num = 0.0
            var da = 0.0
            var db = 0.0
            for (i in a.indices) {
                num += (a[i] - ma) * (b[i] - mb)
                da += (a[i] - ma) * (a[i] - ma)
                db += (b[i] - mb) * (b[i] - mb)
            }
            return if (da == 0.0 || db == 0.0) 0.0 else num / Math.sqrt(da * db)
        }
    }
}
