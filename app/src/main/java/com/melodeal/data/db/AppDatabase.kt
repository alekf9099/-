package com.melodeal.data.db

import android.content.Context
import androidx.room.AutoMigration
import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "scores")
data class ScoreEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val songId: String,
    val songTitle: String,
    val playerName: String,
    val total: Int,
    val pitch: Int,
    val rhythm: Int,
    val stability: Int,
    /** false = 기준 멜로디 없는 참고용 점수 (랭킹에서 제외) */
    val ranked: Boolean,
    val keyShift: Int,
    val createdAt: Long,
    val perfect: Int = 0,
    val great: Int = 0,
    val good: Int = 0,
    val miss: Int = 0,
    val maxCombo: Int = 0,
)

@Entity(tableName = "imported_songs")
data class ImportedSongEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val uri: String,
    val lrc: String?,
    val createdAt: Long,
)

/** 사용자가 만든 곡. 곡 내용(멜로디·코드·가사)은 Composition JSON으로 저장 */
@Entity(tableName = "creations")
data class CreationEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val json: String,
    val createdAt: Long,
    val updatedAt: Long,
    /** 멜로딜에 공유한 곡 id (공유 안 했으면 null) */
    @ColumnInfo(defaultValue = "NULL") val publishedTrackId: String? = null,
)

data class PlayerStat(val playerName: String, val plays: Int, val avgScore: Double, val bestScore: Int)

@Dao
interface ScoreDao {
    @Insert
    suspend fun insert(score: ScoreEntity): Long

    /** 곡별 랭킹: 플레이어마다 최고 점수 1개 */
    @Query(
        """SELECT * FROM scores s WHERE ranked = 1 AND songId = :songId AND total = (
               SELECT MAX(total) FROM scores WHERE songId = s.songId AND playerName = s.playerName AND ranked = 1)
           GROUP BY playerName ORDER BY total DESC, createdAt ASC LIMIT :limit""",
    )
    fun topForSong(songId: String, limit: Int = 50): Flow<List<ScoreEntity>>

    @Query("SELECT * FROM scores WHERE ranked = 1 AND createdAt >= :since ORDER BY total DESC, createdAt ASC LIMIT :limit")
    fun topSince(since: Long, limit: Int = 50): Flow<List<ScoreEntity>>

    @Query(
        """SELECT playerName, COUNT(*) AS plays, AVG(total) AS avgScore, MAX(total) AS bestScore
           FROM scores WHERE ranked = 1 GROUP BY playerName ORDER BY avgScore DESC""",
    )
    fun playerStats(): Flow<List<PlayerStat>>

    @Query("SELECT * FROM scores WHERE id = :id")
    suspend fun byId(id: Long): ScoreEntity?

    @Query("SELECT MAX(total) FROM scores WHERE ranked = 1 AND songId = :songId AND playerName = :player AND id != :excludeId")
    suspend fun previousBest(songId: String, player: String, excludeId: Long): Int?

    @Query("SELECT COUNT(*) + 1 FROM (SELECT playerName, MAX(total) AS best FROM scores WHERE ranked = 1 AND songId = :songId GROUP BY playerName) WHERE best > :score")
    suspend fun rankFor(songId: String, score: Int): Int
}

@Dao
interface ImportedSongDao {
    @Insert
    suspend fun insert(song: ImportedSongEntity): Long

    @Query("SELECT * FROM imported_songs ORDER BY createdAt DESC")
    fun all(): Flow<List<ImportedSongEntity>>

    @Query("SELECT * FROM imported_songs WHERE id = :id")
    suspend fun byId(id: Long): ImportedSongEntity?

    @Query("DELETE FROM imported_songs WHERE id = :id")
    suspend fun delete(id: Long)
}

@Dao
interface CreationDao {
    @Insert
    suspend fun insert(c: CreationEntity): Long

    @Query("UPDATE creations SET title = :title, json = :json, updatedAt = :updatedAt WHERE id = :id")
    suspend fun update(id: Long, title: String, json: String, updatedAt: Long)

    @Query("UPDATE creations SET publishedTrackId = :trackId WHERE id = :id")
    suspend fun setPublished(id: Long, trackId: String?)

    @Query("SELECT * FROM creations WHERE publishedTrackId = :trackId LIMIT 1")
    suspend fun byTrack(trackId: String): CreationEntity?

    @Query("SELECT * FROM creations ORDER BY updatedAt DESC")
    fun all(): Flow<List<CreationEntity>>

    @Query("SELECT * FROM creations WHERE id = :id")
    suspend fun byId(id: Long): CreationEntity?

    @Query("SELECT COUNT(*) FROM creations")
    suspend fun count(): Int

    @Query("DELETE FROM creations WHERE id = :id")
    suspend fun delete(id: Long)
}

@Database(
    entities = [ScoreEntity::class, ImportedSongEntity::class, CreationEntity::class],
    version = 3,
    exportSchema = true,
    autoMigrations = [AutoMigration(from = 1, to = 2), AutoMigration(from = 2, to = 3)],
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun scores(): ScoreDao
    abstract fun importedSongs(): ImportedSongDao
    abstract fun creations(): CreationDao

    companion object {
        fun create(context: Context) =
            Room.databaseBuilder(context, AppDatabase::class.java, "melodeal.db").build()
    }
}
