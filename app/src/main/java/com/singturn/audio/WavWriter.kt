package com.singturn.audio

import java.io.File
import java.io.OutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** 16비트 모노 PCM WAV 파일 쓰기 (내보내기용) */
object WavWriter {
    fun write(file: File, samples: FloatArray, sampleRate: Int) = file.outputStream().buffered().use { write(it, samples, sampleRate) }

    fun write(out: OutputStream, samples: FloatArray, sampleRate: Int) {
        val dataBytes = samples.size * 2
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN).apply {
            put("RIFF".toByteArray()); putInt(36 + dataBytes); put("WAVE".toByteArray())
            put("fmt ".toByteArray()); putInt(16); putShort(1); putShort(1)
            putInt(sampleRate); putInt(sampleRate * 2); putShort(2); putShort(16)
            put("data".toByteArray()); putInt(dataBytes)
        }
        out.write(header.array())
        val buf = ByteBuffer.allocate(8192).order(ByteOrder.LITTLE_ENDIAN)
        for (v in samples) {
            if (buf.remaining() < 2) { out.write(buf.array(), 0, buf.position()); buf.clear() }
            buf.putShort((v.coerceIn(-1f, 1f) * Short.MAX_VALUE).toInt().toShort())
        }
        out.write(buf.array(), 0, buf.position())
    }

    /** 반주(+ 선택적으로 멜로디)를 하나로 합친 샘플 */
    fun mix(song: RenderedSong, melodyVolume: Float): FloatArray =
        FloatArray(song.backing.size) { song.backing[it] + melodyVolume * song.guide[it] }
}
