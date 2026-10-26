package com.singturn.studio

/**
 * 가사를 음표 하나에 한 음절씩 나눈다.
 * - 한글: 글자 하나 = 음절 하나 ("사랑해" → 사/랑/해)
 * - 영어: 단어 하나 = 음절 하나, 하이픈으로 나눌 수 있음 ("twin-kle" → twin/kle)
 * - 줄바꿈은 노래방 화면의 줄바꿈이 된다
 */
object LyricsFitter {
    data class Syl(val text: String, val joinNext: Boolean, val lineBreakAfter: Boolean)

    private fun isHangul(c: Char) = c in '가'..'힣'
    private val punctuation = setOf('.', ',', '!', '?', '~', '…', '\'', '"', '·')

    fun split(text: String): List<Syl> {
        val out = mutableListOf<Syl>()
        val lines = text.lines()
        for ((li, line) in lines.withIndex()) {
            val words = line.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
            for ((wi, word) in words.withIndex()) {
                val parts = mutableListOf<String>()
                val latin = StringBuilder()
                for (c in word) {
                    when {
                        isHangul(c) -> {
                            if (latin.isNotEmpty()) { parts += latin.toString(); latin.clear() }
                            parts += c.toString()
                        }
                        c == '-' -> if (latin.isNotEmpty()) { parts += latin.toString(); latin.clear() }
                        c in punctuation -> if (latin.isNotEmpty()) latin.append(c) else if (parts.isNotEmpty()) parts[parts.lastIndex] += c
                        else -> latin.append(c)
                    }
                }
                if (latin.isNotEmpty()) parts += latin.toString()
                parts.forEachIndexed { pi, p ->
                    val lastInWord = pi == parts.lastIndex
                    val lastInLine = lastInWord && wi == words.lastIndex
                    out += Syl(p, joinNext = !lastInWord, lineBreakAfter = lastInLine && li < lines.lastIndex)
                }
            }
        }
        return out
    }

    /** 음표 수와 가사 음절 수의 차이 (양수 = 가사가 남음, 음수 = 가사가 모자람) */
    fun mismatch(text: String, noteCount: Int) = split(text).size - noteCount
}
