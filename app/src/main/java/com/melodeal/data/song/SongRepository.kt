package com.melodeal.data.song

import android.content.Context
import com.melodeal.data.db.CreationDao
import com.melodeal.data.db.CreationEntity
import com.melodeal.data.db.ImportedSongDao
import com.melodeal.data.db.ImportedSongEntity
import com.melodeal.studio.Composition
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class SongRepository(
    private val context: Context,
    private val importedDao: ImportedSongDao,
    private val creationDao: CreationDao,
) {

    val builtin: List<Song> by lazy {
        SongParser.parseCatalog(context.assets.open("songs.json").bufferedReader().use { it.readText() })
    }

    val imported: Flow<List<Song>> = importedDao.all().map { list -> list.map(::toSong) }

    /** 내가 만든 곡 (최근 수정 순) */
    val mine: Flow<List<Song>> = creationDao.all().map { list -> list.mapNotNull(::toSong) }

    /** 커뮤니티 곡처럼 로컬 DB에 없는 곡을 잠시 등록해 노래방 화면에서 부를 수 있게 한다 */
    private val transient = java.util.concurrent.ConcurrentHashMap<String, Song>()
    fun putTransient(song: Song) { transient[song.id] = song }

    suspend fun find(id: String): Song? = transient[id] ?: when {
        id.startsWith(IMPORTED_PREFIX) -> id.removePrefix(IMPORTED_PREFIX).toLongOrNull()?.let { importedDao.byId(it) }?.let(::toSong)
        id.startsWith(MINE_PREFIX) -> id.removePrefix(MINE_PREFIX).toLongOrNull()?.let { creationDao.byId(it) }?.let(::toSong)
        else -> builtin.firstOrNull { it.id == id }
    }

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

    private fun toSong(e: CreationEntity): Song? = runCatching {
        Composition.fromJson(e.json).toSong("$MINE_PREFIX${e.id}")
    }.getOrNull()

    companion object {
        const val IMPORTED_PREFIX = "user:"
        const val MINE_PREFIX = "mine:"
    }
}
