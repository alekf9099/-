package com.melodeal

import android.app.Application
import com.melodeal.community.CommunityRepository
import com.melodeal.community.DemoCommunity
import com.melodeal.community.SupabaseCommunity
import io.github.jan.supabase.auth.Auth
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

    /** local.properties 에 Supabase 주소·키가 있으면 실서버, 없으면 체험 모드 */
    val community: CommunityRepository by lazy {
        if (BuildConfig.SUPABASE_URL.isBlank() || BuildConfig.SUPABASE_ANON_KEY.isBlank()) {
            DemoCommunity()
        } else {
            SupabaseCommunity(
                createSupabaseClient(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON_KEY) {
                    install(Auth)
                    install(Postgrest)
                    install(Realtime)
                },
            )
        }
    }
}
