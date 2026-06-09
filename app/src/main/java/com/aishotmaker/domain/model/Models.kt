package com.aishotmaker.domain.model

data class UserProfile(
    val id: String,
    val email: String,
    val credits: Int,
    val subscriptionType: SubscriptionType,
    val subscriptionExpiresAt: Long?
)

enum class SubscriptionType {
    FREE, MONTHLY
}

data class AiModel(
    val id: String,
    val name: String,
    val thumbnailUrl: String,
    val ethnicity: Ethnicity,
    val gender: Gender,
    val isPremium: Boolean = false
)

enum class Ethnicity(val displayName: String) {
    ASIAN("동양인"),
    WESTERN("서양인"),
    DIVERSE("다양한")
}

enum class Gender(val displayName: String) {
    FEMALE("여성"),
    MALE("남성"),
    UNISEX("유니섹스")
}

data class GenerationJob(
    val id: String,
    val status: JobStatus,
    val originalImageUrl: String,
    val removedBgImageUrl: String?,
    val resultImageUrl: String?,
    val selectedModelId: String,
    val createdAt: Long,
    val completedAt: Long?
)

enum class JobStatus {
    PENDING, PROCESSING, COMPLETED, FAILED
}

data class CreditPackage(
    val id: String,
    val credits: Int,
    val price: Int,
    val label: String
)

data class GenerationResult(
    val jobId: String,
    val resultImageUrl: String,
    val creditsUsed: Int,
    val remainingCredits: Int
)
