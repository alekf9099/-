package com.aishotmaker.ui.result

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
import androidx.core.content.FileProvider
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aishotmaker.data.repository.GenerationRepository
import com.aishotmaker.data.repository.Result
import com.aishotmaker.domain.model.GenerationJob
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Locale
import javax.inject.Inject

@HiltViewModel
class ResultViewModel @Inject constructor(
    private val generationRepository: GenerationRepository
) : ViewModel() {

    private val _generationJob = MutableLiveData<GenerationJob>()
    val generationJob: LiveData<GenerationJob> = _generationJob

    private val _isSaving = MutableLiveData(false)
    val isSaving: LiveData<Boolean> = _isSaving

    fun loadResult(jobId: String) {
        viewModelScope.launch {
            when (val result = generationRepository.getHistory()) {
                is Result.Success -> {
                    val job = result.data.find { it.id == jobId }
                    job?.let { _generationJob.value = it }
                }
                else -> Unit
            }
        }
    }

    fun saveImage(context: Context) {
        val url = _generationJob.value?.resultImageUrl ?: return
        viewModelScope.launch {
            _isSaving.value = true
            try {
                val bitmap = withContext(Dispatchers.IO) {
                    BitmapFactory.decodeStream(URL(url).openStream())
                }
                val fileName = "AIShotMaker_${SimpleDateFormat("yyyyMMdd_HHmmss", Locale.KOREA).format(System.currentTimeMillis())}.jpg"
                val contentValues = android.content.ContentValues().apply {
                    put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
                    put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
                    put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/AIShotMaker")
                }
                val uri = context.contentResolver.insert(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues
                )
                uri?.let {
                    context.contentResolver.openOutputStream(it)?.use { stream ->
                        bitmap.compress(Bitmap.CompressFormat.JPEG, 95, stream)
                    }
                    Toast.makeText(context, "갤러리에 저장되었습니다.", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(context, "저장 실패: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                _isSaving.value = false
            }
        }
    }

    fun shareImage(context: Context) {
        val url = _generationJob.value?.resultImageUrl ?: return
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, url)
        }
        context.startActivity(Intent.createChooser(intent, "이미지 공유"))
    }
}
