package com.singturn

import android.app.Application
import com.singturn.data.SettingsStore
import com.singturn.data.db.AppDatabase
import com.singturn.data.song.SongRepository
import com.singturn.studio.StudioRepository

/** 간단한 수동 DI 컨테이너 */
class SingTurnApp : Application() {
    val db by lazy { AppDatabase.create(this) }
    val songs by lazy { SongRepository(this, db.importedSongs(), db.creations()) }
    val settings by lazy { SettingsStore(this) }
    val studio by lazy { StudioRepository(db.creations()) }
}
