package com.tuneup.studio

import com.tuneup.data.db.CreationDao
import com.tuneup.data.db.CreationEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

data class SavedComposition(
    val id: Long,
    val composition: Composition,
    val updatedAt: Long,
    val publishedTrackId: String? = null,
    val remixOf: String? = null,
)

class StudioRepository(private val dao: CreationDao) {
    val all: Flow<List<SavedComposition>> = dao.all().map { list ->
        list.mapNotNull { e -> runCatching { SavedComposition(e.id, Composition.fromJson(e.json), e.updatedAt, e.publishedTrackId, e.remixOf) }.getOrNull() }
    }

    suspend fun get(id: Long): Composition? = dao.byId(id)?.let { runCatching { Composition.fromJson(it.json) }.getOrNull() }

    suspend fun create(c: Composition, remixOf: String? = null): Long {
        val now = System.currentTimeMillis()
        return dao.insert(CreationEntity(title = c.title, json = c.toJson(), createdAt = now, updatedAt = now, remixOf = remixOf))
    }

    suspend fun save(id: Long, c: Composition) = dao.update(id, c.title, c.toJson(), System.currentTimeMillis())

    suspend fun saved(id: Long): SavedComposition? = dao.byId(id)?.let { e ->
        runCatching { SavedComposition(e.id, Composition.fromJson(e.json), e.updatedAt, e.publishedTrackId, e.remixOf) }.getOrNull()
    }

    /** 공유한 곡의 원본 (이 폰에서 만든 곡일 때만) */
    suspend fun byTrack(trackId: String): SavedComposition? = dao.byTrack(trackId)?.let { e ->
        runCatching { SavedComposition(e.id, Composition.fromJson(e.json), e.updatedAt, e.publishedTrackId, e.remixOf) }.getOrNull()
    }

    suspend fun markPublished(id: Long, trackId: String?) = dao.setPublished(id, trackId)

    suspend fun delete(id: Long) = dao.delete(id)

    suspend fun nextTitle() = "나의 노래 ${dao.count() + 1}"
}
