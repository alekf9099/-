package com.melodeal

import android.app.Application
import com.melodeal.community.CommunityRepository
import com.melodeal.community.DemoCommunity
import com.melodeal.community.SupabaseCommunity
import androidx.annotation.VisibleForTesting
import com.russhwolf.settings.SharedPreferencesSettings
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.SettingsCodeVerifierCache
import io.github.jan.supabase.auth.SettingsSessionManager
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import com.melodeal.data.SettingsStore
import com.melodeal.data.db.AppDatabase
import com.melodeal.data.song.SongRepository
import com.melodeal.studio.StudioRepository

/** 간단한 수동 DI 컨테이너 */
class MelodealApp : Application() {
    val db by lazy { AppDatabase.create(this) }
    val songs by lazy { SongRepository(this, db.importedSongs(), db.creations()) }
    val settings by lazy { SettingsStore(this) }
    val studio by lazy { StudioRepository(db.creations()) }

    private var _community: CommunityRepository? = null

    /** local.properties 에 Supabase 주소·키가 있으면 실서버, 없으면 체험 모드 */
    val community: CommunityRepository
        get() = _community ?: createCommunity().also { _community = it }

    /** 테스트에서 서버 대신 체험 모드 등을 끼워 넣을 때 */
    @VisibleForTesting
    fun useCommunity(repo: CommunityRepository) { _community = repo }

    private fun createCommunity(): CommunityRepository {
        if (BuildConfig.SUPABASE_URL.isBlank() || BuildConfig.SUPABASE_ANON_KEY.isBlank()) return DemoCommunity()
        // 로그인 세션은 앱 전용 SharedPreferences에 저장 (자동 초기화에 의존하지 않도록 직접 지정)
        val authStore = SharedPreferencesSettings(getSharedPreferences("supabase_auth", MODE_PRIVATE))
        return SupabaseCommunity(
            createSupabaseClient(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON_KEY) {
                install(Auth) {
                    sessionManager = SettingsSessionManager(authStore)
                    codeVerifierCache = SettingsCodeVerifierCache(authStore)
                }
                install(Postgrest)
                install(Realtime)
            },
        )
    }
}
