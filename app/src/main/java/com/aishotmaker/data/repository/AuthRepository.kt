package com.aishotmaker.data.repository

import com.aishotmaker.data.api.ApiService
import com.aishotmaker.data.api.GoogleLoginRequest
import com.aishotmaker.data.api.LoginRequest
import com.aishotmaker.data.api.RegisterRequest
import com.aishotmaker.data.local.UserPreferences
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val apiService: ApiService,
    private val userPreferences: UserPreferences
) {

    fun isLoggedIn(): Boolean = userPreferences.getToken() != null

    suspend fun register(email: String, password: String): Result<Unit> {
        return try {
            val response = apiService.register(RegisterRequest(email, password))
            val body = response.body()
            if (response.isSuccessful && body?.success == true && body.data != null) {
                userPreferences.saveToken(body.data.accessToken)
                Result.Success(Unit)
            } else {
                Result.Error(body?.message ?: "회원가입에 실패했습니다.")
            }
        } catch (e: Exception) {
            Result.Error("네트워크 오류: ${e.message}")
        }
    }

    suspend fun login(email: String, password: String): Result<Unit> {
        return try {
            val response = apiService.login(LoginRequest(email, password))
            val body = response.body()
            if (response.isSuccessful && body?.success == true && body.data != null) {
                userPreferences.saveToken(body.data.accessToken)
                Result.Success(Unit)
            } else {
                Result.Error(body?.message ?: "이메일 또는 비밀번호가 올바르지 않습니다.")
            }
        } catch (e: Exception) {
            Result.Error("네트워크 오류: ${e.message}")
        }
    }

    suspend fun loginWithGoogle(idToken: String): Result<Unit> {
        return try {
            val response = apiService.loginWithGoogle(GoogleLoginRequest(idToken))
            val body = response.body()
            if (response.isSuccessful && body?.success == true && body.data != null) {
                userPreferences.saveToken(body.data.accessToken)
                Result.Success(Unit)
            } else {
                Result.Error(body?.message ?: "Google 로그인에 실패했습니다.")
            }
        } catch (e: Exception) {
            Result.Error("네트워크 오류: ${e.message}")
        }
    }

    fun logout() {
        userPreferences.clearToken()
    }
}
