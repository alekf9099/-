package com.aishotmaker.ui.auth

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aishotmaker.data.repository.AuthRepository
import com.aishotmaker.data.repository.Result
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _isLoading = MutableLiveData(false)
    val isLoading: LiveData<Boolean> = _isLoading

    private val _loginResult = MutableLiveData<Result<Unit>?>()
    val loginResult: LiveData<Result<Unit>?> = _loginResult

    fun login(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            _loginResult.value = Result.Error("이메일과 비밀번호를 입력해주세요.")
            return
        }
        viewModelScope.launch {
            _isLoading.value = true
            _loginResult.value = authRepository.login(email, password)
            _isLoading.value = false
        }
    }

    fun loginWithGoogle(idToken: String) {
        viewModelScope.launch {
            _isLoading.value = true
            _loginResult.value = authRepository.loginWithGoogle(idToken)
            _isLoading.value = false
        }
    }

    fun onGoogleLoginFailed(message: String) {
        _loginResult.value = Result.Error(message)
    }

    fun consumeResult() {
        _loginResult.value = null
    }
}
