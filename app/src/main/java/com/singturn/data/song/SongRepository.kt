package com.singturn.data.song

import android.content.Context
import com.singturn.data.db.ImportedSongDao
import com.singturn.data.db.ImportedSongEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class SongRepository(private val context: Context, private val importedDao: ImportedSongDao) {

    val builtin: List<Song> by lazy {
        SongParser.parseCatalog(context.assets.open("songs.json").bufferedReader().use { it.readText() })
    }

    val imported: Flow<List<Song>> = importedDao.all().map { list -> list.map(::toSong) }

    suspend fun find(id: String): Song? =
        builtin.firstOrNull { it.id == id }
            ?: id.removePrefix(IMPORTED_PREFIX).toLongOrNull()?.takeIf { id.startsWith(IMPORTED_PREFIX) }
                ?.let { importedDao.byId(it) }?.let(::toSong)

    suspend fun import(title: String, uri: String, lrc: String?) =
        importedDao.insert(ImportedSongEntity(title = title, uri = uri, lrc = lrc, createdAt = System.currentTimeMillis()))

    suspend fun deleteImported(song: Song) {
        song.id.removePrefix(IMPORTED_PREFIX).toLongOrNull()?.let { importedDao.delete(it) }
    }

    private fun toSong(e: ImportedSongEntity) = Song(
        id = "$IMPORTED_PREFIX${e.id}",
        title = e.title,
        credit = "내 MR 파일",
        license = "사용자 기기 파일 · 개인 연습용",
        source = SongSource.UserFile(e.uri),
        lines = e.lrc?.let { LrcParser.parse(it) }.orEmpty(),
    )

    companion object {
        const val IMPORTED_PREFIX = "user:"
    }
}
