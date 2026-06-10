package com.aishotmaker.data.api

import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.*

interface ApiService {

    @POST("auth/register")
    suspend fun register(
        @Body request: RegisterRequest
    ): Response<ApiResponse<TokenResponse>>

    @POST("auth/login")
    suspend fun login(
        @Body request: LoginRequest
    ): Response<ApiResponse<TokenResponse>>

    @POST("auth/google")
    suspend fun loginWithGoogle(
        @Body request: GoogleLoginRequest
    ): Response<ApiResponse<TokenResponse>>

    @GET("models")
    suspend fun getAiModels(): Response<ApiResponse<List<AiModelDto>>>

    @Multipart
    @POST("generate")
    suspend fun generateFittingShot(
        @Part image: MultipartBody.Part,
        @Part("model_id") modelId: RequestBody,
        @Part("remove_bg") removeBg: RequestBody
    ): Response<ApiResponse<GenerationJobDto>>

    @GET("generate/{jobId}/status")
    suspend fun getJobStatus(
        @Path("jobId") jobId: String
    ): Response<ApiResponse<GenerationJobDto>>

    @GET("user/profile")
    suspend fun getUserProfile(): Response<ApiResponse<UserProfileDto>>

    @POST("user/credits/purchase")
    suspend fun purchaseCreditPackage(
        @Body request: PurchaseRequest
    ): Response<ApiResponse<CreditBalanceDto>>

    @GET("history")
    suspend fun getGenerationHistory(
        @Query("page") page: Int = 0,
        @Query("size") size: Int = 20
    ): Response<ApiResponse<List<GenerationJobDto>>>
}

data class ApiResponse<T>(
    val success: Boolean,
    val data: T?,
    val message: String?,
    val errorCode: String?
)

data class AiModelDto(
    val id: String,
    val name: String,
    val thumbnailUrl: String,
    val ethnicity: String,
    val gender: String,
    val isPremium: Boolean
)

data class GenerationJobDto(
    val id: String,
    val status: String,
    val originalImageUrl: String,
    val removedBgImageUrl: String?,
    val resultImageUrl: String?,
    val selectedModelId: String,
    val createdAt: Long,
    val completedAt: Long?,
    val creditsUsed: Int?,
    val remainingCredits: Int?
)

data class UserProfileDto(
    val id: String,
    val email: String,
    val credits: Int,
    val subscriptionType: String,
    val subscriptionExpiresAt: Long?
)

data class CreditBalanceDto(
    val credits: Int,
    val addedCredits: Int
)

data class PurchaseRequest(
    val packageId: String,
    val purchaseToken: String
)

data class RegisterRequest(
    val email: String,
    val password: String
)

data class LoginRequest(
    val email: String,
    val password: String
)

data class GoogleLoginRequest(
    val idToken: String
)

data class TokenResponse(
    val accessToken: String,
    val tokenType: String
)
