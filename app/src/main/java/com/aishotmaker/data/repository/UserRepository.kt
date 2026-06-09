package com.aishotmaker.data.repository

import com.aishotmaker.data.api.ApiService
import com.aishotmaker.data.api.PurchaseRequest
import com.aishotmaker.data.local.UserPreferences
import com.aishotmaker.domain.model.SubscriptionType
import com.aishotmaker.domain.model.UserProfile
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class UserRepository @Inject constructor(
    private val apiService: ApiService,
    private val userPreferences: UserPreferences
) {

    suspend fun getUserProfile(): Result<UserProfile> {
        return try {
            val response = apiService.getUserProfile()
            if (response.isSuccessful && response.body()?.success == true) {
                val dto = response.body()!!.data!!
                val profile = UserProfile(
                    id = dto.id,
                    email = dto.email,
                    credits = dto.credits,
                    subscriptionType = SubscriptionType.valueOf(dto.subscriptionType.uppercase()),
                    subscriptionExpiresAt = dto.subscriptionExpiresAt
                )
                userPreferences.saveCredits(profile.credits)
                Result.Success(profile)
            } else {
                Result.Error("프로필 조회 실패")
            }
        } catch (e: Exception) {
            Result.Error("네트워크 오류: ${e.message}")
        }
    }

    suspend fun purchaseCredits(packageId: String, purchaseToken: String): Result<Int> {
        return try {
            val response = apiService.purchaseCreditPackage(
                PurchaseRequest(packageId, purchaseToken)
            )
            if (response.isSuccessful && response.body()?.success == true) {
                val credits = response.body()!!.data!!.credits
                userPreferences.saveCredits(credits)
                Result.Success(credits)
            } else {
                Result.Error("크레딧 충전 실패")
            }
        } catch (e: Exception) {
            Result.Error("네트워크 오류: ${e.message}")
        }
    }

    fun getCachedCredits(): Int = userPreferences.getCredits()
    fun isFirstLaunch(): Boolean = userPreferences.isFirstLaunch()
    fun setFirstLaunchDone() = userPreferences.setFirstLaunchDone()
}
