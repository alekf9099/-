package com.melodeal.audio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlin.math.sqrt

/**
 * 스피커로 클릭을 내보내고 마이크로 다시 들어오는 시점을 재서 왕복 지연(ms)을 측정한다.
 * 노래 화면과 같은 재생·녹음 경로를 쓰므로 측정값을 그대로 채점 시간 보정에 쓸 수 있다.
 */
object LatencyCalibrator {
    private val clickTimes = listOf(0.6, 1.2, 1.8, 2.4, 3.0, 3.6, 4.2, 4.8)

    /** 측정 실패 시 null */
    suspend fun measure(): Int? = withContext(Dispatchers.Default) {
        val sr = Synth.SAMPLE_RATE
        val pcm = Synth.clickTrack(clickTimes, 5.6, sr)
        val shorts = ShortArray(pcm.size) { (pcm[it] * Short.MAX_VALUE).toInt().toShort() }
        val track = AudioTrack.Builder()
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).build())
            .setAudioFormat(
                AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(sr).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build(),
            )
            .setBufferSizeInBytes(shorts.size * 2)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build()
        track.write(shorts, 0, shorts.size)

        val onsets = mutableListOf<Double>()
        var noise = 0.0
        var lastOnset = -1.0
        val mic = MicCapture(sr, windowSize = 512, hopSize = 256, echoCancel = false)
        val started = runCatching {
            mic.start { w ->
                val now = track.playbackHeadPosition.toDouble() / sr
                var s = 0.0
                for (i in 256 until 512) s += w[i] * w[i]
                val rms = sqrt(s / 256)
                if (now < 0.4) {
                    noise = maxOf(noise, rms)
                } else if (rms > maxOf(noise * 4, 0.02) && now - lastOnset > 0.35) {
                    onsets += now
                    lastOnset = now
                }
            }
        }
        if (started.isFailure) {
            track.release()
            return@withContext null
        }
        delay(150)
        track.play()
        delay(5800)
        mic.stop()
        track.release()

        val delays = onsets.mapNotNull { o ->
            clickTimes.filter { it <= o }.maxOrNull()?.let { o - it }?.takeIf { it in 0.0..0.55 }
        }
        if (delays.size < 4) return@withContext null
        val median = delays.sorted()[delays.size / 2]
        (median * 1000).toInt()
    }
}
