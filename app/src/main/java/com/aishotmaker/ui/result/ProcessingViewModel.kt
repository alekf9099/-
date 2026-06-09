package com.aishotmaker.ui.result

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aishotmaker.data.repository.GenerationRepository
import com.aishotmaker.data.repository.Result
import com.aishotmaker.domain.model.JobStatus
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

@HiltViewModel
class ProcessingViewModel @Inject constructor(
    private val generationRepository: GenerationRepository
) : ViewModel() {

    private val _processingState = MutableLiveData<ProcessingState>()
    val processingState: LiveData<ProcessingState> = _processingState

    private val _progress = MutableLiveData(0)
    val progress: LiveData<Int> = _progress

    fun startGeneration(imagePath: String, modelId: String) {
        viewModelScope.launch {
            _processingState.value = ProcessingState.Loading
            _progress.value = 10

            val imageFile = File(imagePath)
            if (!imageFile.exists()) {
                _processingState.value = ProcessingState.Failed("이미지 파일을 찾을 수 없습니다.")
                return@launch
            }

            generationRepository.generateFittingShot(imageFile, modelId).collect { result ->
                when (result) {
                    is Result.Loading -> {
                        _processingState.value = ProcessingState.Processing("서버에 전송 중...")
                        _progress.value = 25
                    }
                    is Result.Success -> {
                        val job = result.data
                        when (job.status) {
                            JobStatus.PENDING -> {
                                _processingState.value = ProcessingState.Processing("처리 대기 중...")
                                _progress.value = 40
                            }
                            JobStatus.PROCESSING -> {
                                _processingState.value = ProcessingState.Processing("AI 모델이 옷을 입히는 중...")
                                _progress.value = 70
                            }
                            JobStatus.COMPLETED -> {
                                _progress.value = 100
                                _processingState.value = ProcessingState.Completed(job.id)
                            }
                            JobStatus.FAILED -> {
                                _processingState.value = ProcessingState.Failed("생성에 실패했습니다.")
                            }
                        }
                    }
                    is Result.Error -> {
                        _processingState.value = ProcessingState.Failed(result.message)
                    }
                }
            }
        }
    }
}
