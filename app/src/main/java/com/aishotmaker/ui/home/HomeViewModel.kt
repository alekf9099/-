package com.aishotmaker.ui.home

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aishotmaker.data.repository.GenerationRepository
import com.aishotmaker.data.repository.Result
import com.aishotmaker.data.repository.UserRepository
import com.aishotmaker.domain.model.GenerationJob
import com.aishotmaker.domain.model.UserProfile
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val generationRepository: GenerationRepository
) : ViewModel() {

    private val _userProfile = MutableLiveData<UserProfile>()
    val userProfile: LiveData<UserProfile> = _userProfile

    private val _history = MutableLiveData<List<GenerationJob>>()
    val history: LiveData<List<GenerationJob>> = _history

    private val _isLoading = MutableLiveData(false)
    val isLoading: LiveData<Boolean> = _isLoading

    init {
        loadData()
    }

    fun loadData() {
        viewModelScope.launch {
            _isLoading.value = true
            launch {
                when (val result = userRepository.getUserProfile()) {
                    is Result.Success -> _userProfile.value = result.data
                    else -> Unit
                }
            }
            launch {
                when (val result = generationRepository.getHistory()) {
                    is Result.Success -> _history.value = result.data
                    else -> _history.value = emptyList()
                }
            }
            _isLoading.value = false
        }
    }
}
