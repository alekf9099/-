package com.tuneup.audio

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor

/**
 * 마이크 입력을 hop 단위로 읽어 window 크기의 프레임을 콜백으로 넘긴다.
 * 콜백은 전용 스레드에서 호출된다.
 */
class MicCapture(
    private val sampleRate: Int = Synth.SAMPLE_RATE,
    private val windowSize: Int = 2048,
    private val hopSize: Int = 1024,
    /** 노래할 때는 반주가 섞이지 않도록 켜고, 지연 보정 때는 클릭 소리를 들어야 하므로 끈다 */
    private val echoCancel: Boolean = true,
) {
    private var record: AudioRecord? = null
    private var thread: Thread? = null
    @Volatile private var running = false
    private val effects = mutableListOf<android.media.audiofx.AudioEffect>()

    @SuppressLint("MissingPermission") // 호출 전에 화면에서 권한을 확인한다
    fun start(onFrame: (FloatArray) -> Unit) {
        val minBuf = AudioRecord.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val rec = AudioRecord(
            // VOICE_RECOGNITION: 자동 음량 조절(AGC)이 꺼진 원음에 가까운 입력
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            maxOf(minBuf, hopSize * 4),
        )
        // 스피커로 나오는 반주가 마이크로 다시 들어오는 것을 줄인다 (지원 기기만)
        if (echoCancel) {
            if (AcousticEchoCanceler.isAvailable()) AcousticEchoCanceler.create(rec.audioSessionId)?.let { it.enabled = true; effects += it }
            if (NoiseSuppressor.isAvailable()) NoiseSuppressor.create(rec.audioSessionId)?.let { it.enabled = true; effects += it }
        }
        if (rec.state != AudioRecord.STATE_INITIALIZED) {
            rec.release()
            throw IllegalStateException("마이크를 열 수 없어요")
        }
        record = rec
        running = true
        rec.startRecording()
        thread = Thread({
            val hop = ShortArray(hopSize)
            val window = FloatArray(windowSize)
            while (running) {
                var read = 0
                while (read < hopSize && running) {
                    val n = rec.read(hop, read, hopSize - read)
                    if (n <= 0) break
                    read += n
                }
                if (read < hopSize) continue
                System.arraycopy(window, hopSize, window, 0, windowSize - hopSize)
                for (i in 0 until hopSize) window[windowSize - hopSize + i] = hop[i] / 32768f
                onFrame(window)
            }
        }, "mic-capture").apply { priority = Thread.MAX_PRIORITY; start() }
    }

    fun stop() {
        running = false
        thread?.join(500)
        effects.forEach { runCatching { it.release() } }
        effects.clear()
        record?.let { runCatching { it.stop() }; it.release() }
        record = null
    }
}
