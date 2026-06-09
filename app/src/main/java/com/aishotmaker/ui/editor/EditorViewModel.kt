package com.aishotmaker.ui.editor

import android.graphics.Bitmap
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aishotmaker.data.repository.GenerationRepository
import com.aishotmaker.data.repository.Result
import com.aishotmaker.data.repository.UserRepository
import com.aishotmaker.domain.model.AiModel
import com.aishotmaker.util.BackgroundRemover
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

@HiltViewModel
class EditorViewModel @Inject constructor(
    private val generationRepository: GenerationRepository,
    private val userRepository: UserRepository,
    private val backgroundRemover: BackgroundRemover
) : ViewModel() {

    private val _capturedImage = MutableLiveData<String>()
    val capturedImage: LiveData<String> = _capturedImage

    private val _removedBgImage = MutableLiveData<Bitmap?>()
    val removedBgImage: LiveData<Bitmap?> = _removedBgImage

    private val _aiModels = MutableLiveData<List<AiModel>>()
    val aiModels: LiveData<List<AiModel>> = _aiModels

    private val _selectedModel = MutableLiveData<AiModel?>()
    val selectedModel: LiveData<AiModel?> = _selectedModel

    private val _isRemovingBg = MutableLiveData(false)
    val isRemovingBg: LiveData<Boolean> = _isRemovingBg

    private val _credits = MutableLiveData(userRepository.getCachedCredits())
    val credits: LiveData<Int> = _credits

    init {
        loadAiModels()
    }

    fun setImagePath(path: String) {
        _capturedImage.value = path
        removeBackground(path)
    }

    private fun removeBackground(imagePath: String) {
        viewModelScope.launch {
            _isRemovingBg.value = true
            val result = backgroundRemover.removeBackground(File(imagePath))
            _removedBgImage.value = result
            _isRemovingBg.value = false
        }
    }

    private fun loadAiModels() {
        viewModelScope.launch {
            when (val result = generationRepository.getAiModels()) {
                is Result.Success -> _aiModels.value = result.data
                else -> Unit
            }
        }
    }

    fun selectModel(model: AiModel) {
        _selectedModel.value = model
    }
}
