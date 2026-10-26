package com.tuneup.data

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
    /** 첫 실행 안내를 봤는지 */
    val onboarded: Boolean = false,
    /** 편집 화면 사용 힌트를 닫았는지 */
    val editorHintSeen: Boolean = false,
    /** 마이크 권한을 한 번이라도 요청했는지 (영구 거부 판별용) */
    val micAsked: Boolean = false,
    /** 최근 검색어 (최신순, 최대 8개) */
    val recentSearches: List<String> = emptyList(),
) {
    fun withSearch(q: String) = copy(recentSearches = (listOf(q) + recentSearches.filter { it != q }).take(8))
}

class SettingsStore(context: Context) {
    private val prefs = context.getSharedPreferences("settings", Context.MODE_PRIVATE)
    private val _state = MutableStateFlow(
        AppSettings(
            latencyMs = prefs.getInt("latencyMs", 150),
            latencyCalibrated = prefs.getBoolean("latencyCalibrated", false),
            guideVolume = prefs.getFloat("guideVolume", 0.5f),
            myName = prefs.getString("myName", "나") ?: "나",
            onboarded = prefs.getBoolean("onboarded", false),
            editorHintSeen = prefs.getBoolean("editorHintSeen", false),
            micAsked = prefs.getBoolean("micAsked", false),
            recentSearches = prefs.getString("recentSearches", "").orEmpty().split('\n').filter { it.isNotBlank() },
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
            .putBoolean("onboarded", s.onboarded)
            .putBoolean("editorHintSeen", s.editorHintSeen)
            .putBoolean("micAsked", s.micAsked)
            .putString("recentSearches", s.recentSearches.joinToString("\n"))
            .apply()
    }
}
