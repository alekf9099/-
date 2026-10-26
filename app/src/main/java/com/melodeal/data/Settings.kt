package com.melodeal.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class AppSettings(
    /** 스피커→귀→목소리→마이크 왕복 지연. 채점 시간 보정에 사용 */
    val latencyMs: Int = 150,
    val latencyCalibrated: Boolean = false,
    val guideVolume: Float = 0.5f,
    val myName: String = "나",
)

class SettingsStore(context: Context) {
    private val prefs = context.getSharedPreferences("settings", Context.MODE_PRIVATE)
    private val _state = MutableStateFlow(
        AppSettings(
            latencyMs = prefs.getInt("latencyMs", 150),
            latencyCalibrated = prefs.getBoolean("latencyCalibrated", false),
            guideVolume = prefs.getFloat("guideVolume", 0.5f),
            myName = prefs.getString("myName", "나") ?: "나",
        ),
    )
    val state: StateFlow<AppSettings> = _state.asStateFlow()

    fun update(transform: (AppSettings) -> AppSettings) {
        val s = transform(_state.value)
        _state.value = s
        prefs.edit()
            .putInt("latencyMs", s.latencyMs)
            .putBoolean("latencyCalibrated", s.latencyCalibrated)
            .putFloat("guideVolume", s.guideVolume)
            .putString("myName", s.myName)
            .apply()
    }
}
