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
class RegisterViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _isLoading = MutableLiveData(false)
    val isLoading: LiveData<Boolean> = _isLoading

    private val _registerResult = MutableLiveData<Result<Unit>?>()
    val registerResult: LiveData<Result<Unit>?> = _registerResult

    fun register(email: String, password: String, passwordConfirm: String) {
        if (email.isBlank() || password.isBlank()) {
            _registerResult.value = Result.Error("이메일과 비밀번호를 입력해주세요.")
            return
        }
        if (password.length < 8) {
            _registerResult.value = Result.Error("비밀번호는 8자 이상이어야 합니다.")
            return
        }
        if (password != passwordConfirm) {
            _registerResult.value = Result.Error("비밀번호가 일치하지 않습니다.")
            return
        }
        viewModelScope.launch {
            _isLoading.value = true
            _registerResult.value = authRepository.register(email, password)
            _isLoading.value = false
        }
    }

    fun consumeResult() {
        _registerResult.value = null
    }
}
