package com.aishotmaker.ui.editor

import android.graphics.Bitmap
import androidx.lifecycle.LiveData
import androidx.lifecycle.MediatorLiveData
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

    private val _fittingMode = MutableLiveData(FittingMode.AI_MODEL)
    val fittingMode: LiveData<FittingMode> = _fittingMode

    private val _userPhotoPath = MutableLiveData<String?>(null)
    val userPhotoPath: LiveData<String?> = _userPhotoPath

    private val _canGenerate = MediatorLiveData<Boolean>().apply {
        fun update() {
            val ready = when (_fittingMode.value) {
                FittingMode.AI_MODEL -> _selectedModel.value != null
                FittingMode.USER_PHOTO -> _userPhotoPath.value != null
                else -> false
            }
            value = ready && (_credits.value ?: 0) > 0
        }
        addSource(_fittingMode) { update() }
        addSource(_selectedModel) { update() }
        addSource(_userPhotoPath) { update() }
        addSource(_credits) { update() }
    }
    val canGenerate: LiveData<Boolean> = _canGenerate

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

    fun selectFittingMode(mode: FittingMode) {
        _fittingMode.value = mode
    }

    fun setUserPhoto(path: String) {
        _userPhotoPath.value = path
    }
}

enum class FittingMode {
    AI_MODEL, USER_PHOTO
}
