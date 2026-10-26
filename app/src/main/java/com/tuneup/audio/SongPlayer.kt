package com.tuneup.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.media.MediaPlayer
import android.net.Uri

/** 노래 화면이 쓰는 재생기 공통 인터페이스. positionSec는 본 곡 시작 기준(카운트인 중엔 음수). */
interface SongPlayer {
    val positionSec: Double
    val isFinished: Boolean
    var guideVolume: Float
    fun start()
    fun pause()
    fun resume()
    fun release()
}

/** 합성 반주 재생기. 스트리밍 모드로 작은 덩어리씩 쓰면서 가이드 멜로디 볼륨을 실시간 반영한다. */
class SynthPlayer(private val song: RenderedSong) : SongPlayer {
    private val sr = song.sampleRate
    private val chunk = 2048
    private val track = AudioTrack.Builder()
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build(),
        )
        .setAudioFormat(
            AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(sr)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build(),
        )
        .setBufferSizeInBytes(maxOf(AudioTrack.getMinBufferSize(sr, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT), chunk * 4))
        .setTransferMode(AudioTrack.MODE_STREAM)
        .setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY)
        .build()

    @Volatile private var running = false
    @Volatile override var guideVolume: Float = 0.6f
    private var writer: Thread? = null

    override val positionSec: Double
        get() = track.playbackHeadPosition.toDouble() / sr - song.songStartSec

    override val isFinished: Boolean
        get() = track.playbackHeadPosition >= song.backing.size - sr / 10

    override fun start() {
        running = true
        track.play()
        writer = Thread({
            val buf = ShortArray(chunk)
            var pos = 0
            while (running && pos < song.backing.size) {
                val n = minOf(chunk, song.backing.size - pos)
                val gv = guideVolume
                for (i in 0 until n) {
                    val v = (song.backing[pos + i] + gv * song.guide[pos + i]).coerceIn(-1f, 1f)
                    buf[i] = (v * Short.MAX_VALUE).toInt().toShort()
                }
                track.write(buf, 0, n, AudioTrack.WRITE_BLOCKING)
                pos += n
            }
        }, "synth-writer").apply { priority = Thread.MAX_PRIORITY; start() }
    }

    override fun pause() = track.pause()
    override fun resume() = track.play()

    override fun release() {
        running = false
        runCatching { track.pause(); track.flush() }
        writer?.join(500)
        track.release()
    }
}

/** 사용자가 불러온 MR 파일 재생기 (앱은 재생만 하고 파일을 배포하지 않는다). */
class FilePlayer(context: Context, uri: Uri) : SongPlayer {
    private val mp = MediaPlayer().apply {
        setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build(),
        )
        setDataSource(context, uri)
        prepare()
    }
    @Volatile private var completed = false

    init {
        mp.setOnCompletionListener { completed = true }
    }

    val durationSec: Double get() = mp.duration / 1000.0
    override val positionSec: Double get() = runCatching { mp.currentPosition / 1000.0 }.getOrDefault(0.0)
    override val isFinished: Boolean get() = completed
    override var guideVolume: Float = 0f

    override fun start() = mp.start()
    override fun pause() = mp.pause()
    override fun resume() = mp.start()
    override fun release() = runCatching { mp.stop(); mp.release() }.let { }
}
