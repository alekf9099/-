package com.aishotmaker.util

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

@Singleton
class BackgroundRemover @Inject constructor() {

    private val segmenter = SubjectSegmentation.getClient(
        SubjectSegmenterOptions.Builder()
            .enableForegroundBitmap()
            .build()
    )

    suspend fun removeBackground(imageFile: File): Bitmap? {
        val bitmap = BitmapFactory.decodeFile(imageFile.absolutePath) ?: return null
        val scaledBitmap = scaleBitmapIfNeeded(bitmap, maxDimension = 1024)
        val inputImage = InputImage.fromBitmap(scaledBitmap, 0)

        return suspendCancellableCoroutine { continuation ->
            segmenter.process(inputImage)
                .addOnSuccessListener { result ->
                    val foregroundBitmap = result.foregroundBitmap
                    continuation.resume(foregroundBitmap)
                }
                .addOnFailureListener {
                    continuation.resume(null)
                }
        }
    }

    private fun scaleBitmapIfNeeded(bitmap: Bitmap, maxDimension: Int): Bitmap {
        val width = bitmap.width
        val height = bitmap.height
        if (width <= maxDimension && height <= maxDimension) return bitmap

        val ratio = minOf(maxDimension.toFloat() / width, maxDimension.toFloat() / height)
        val newWidth = (width * ratio).toInt()
        val newHeight = (height * ratio).toInt()
        return Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true)
    }
}
