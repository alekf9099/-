package com.aishotmaker.data.repository

import com.aishotmaker.data.api.ApiService
import com.aishotmaker.domain.model.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

sealed class Result<out T> {
    data class Success<T>(val data: T) : Result<T>()
    data class Error(val message: String, val code: String? = null) : Result<Nothing>()
    object Loading : Result<Nothing>()
}

@Singleton
class GenerationRepository @Inject constructor(
    private val apiService: ApiService
) {

    suspend fun getAiModels(): Result<List<AiModel>> {
        return try {
            val response = apiService.getAiModels()
            if (response.isSuccessful && response.body()?.success == true) {
                val models = response.body()?.data?.map { dto ->
                    AiModel(
                        id = dto.id,
                        name = dto.name,
                        thumbnailUrl = dto.thumbnailUrl,
                        ethnicity = Ethnicity.valueOf(dto.ethnicity.uppercase()),
                        gender = Gender.valueOf(dto.gender.uppercase()),
                        isPremium = dto.isPremium
                    )
                } ?: emptyList()
                Result.Success(models)
            } else {
                Result.Error(response.body()?.message ?: "모델 목록을 불러올 수 없습니다.")
            }
        } catch (e: Exception) {
            Result.Error("네트워크 오류: ${e.message}")
        }
    }

    fun generateFittingShot(
        imageFile: File,
        modelId: String,
        removeBg: Boolean = true
    ): Flow<Result<GenerationJob>> = flow {
        emit(Result.Loading)
        try {
            val imagePart = MultipartBody.Part.createFormData(
                "image",
                imageFile.name,
                imageFile.asRequestBody("image/jpeg".toMediaTypeOrNull())
            )
            val modelIdBody = modelId.toRequestBody("text/plain".toMediaTypeOrNull())
            val removeBgBody = removeBg.toString().toRequestBody("text/plain".toMediaTypeOrNull())

            val response = apiService.generateFittingShot(imagePart, modelIdBody, removeBgBody)
            if (response.isSuccessful && response.body()?.success == true) {
                val jobDto = response.body()!!.data!!
                val job = jobDto.toDomain()
                emit(Result.Success(job))

                // Poll until completed
                var currentJob = job
                while (currentJob.status == JobStatus.PENDING || currentJob.status == JobStatus.PROCESSING) {
                    delay(2000)
                    val statusResponse = apiService.getJobStatus(currentJob.id)
                    if (statusResponse.isSuccessful && statusResponse.body()?.data != null) {
                        currentJob = statusResponse.body()!!.data!!.toDomain()
                        emit(Result.Success(currentJob))
                    } else {
                        break
                    }
                }
            } else {
                emit(Result.Error(response.body()?.message ?: "생성 요청 실패"))
            }
        } catch (e: Exception) {
            emit(Result.Error("오류: ${e.message}"))
        }
    }

    suspend fun getHistory(page: Int = 0): Result<List<GenerationJob>> {
        return try {
            val response = apiService.getGenerationHistory(page)
            if (response.isSuccessful && response.body()?.success == true) {
                val jobs = response.body()?.data?.map { it.toDomain() } ?: emptyList()
                Result.Success(jobs)
            } else {
                Result.Error("히스토리를 불러올 수 없습니다.")
            }
        } catch (e: Exception) {
            Result.Error("네트워크 오류: ${e.message}")
        }
    }

    private fun com.aishotmaker.data.api.GenerationJobDto.toDomain() = GenerationJob(
        id = id,
        status = when (status.uppercase()) {
            "PENDING" -> JobStatus.PENDING
            "PROCESSING" -> JobStatus.PROCESSING
            "COMPLETED" -> JobStatus.COMPLETED
            else -> JobStatus.FAILED
        },
        originalImageUrl = originalImageUrl,
        removedBgImageUrl = removedBgImageUrl,
        resultImageUrl = resultImageUrl,
        selectedModelId = selectedModelId,
        createdAt = createdAt,
        completedAt = completedAt
    )
}
