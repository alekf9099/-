package com.aishotmaker.ui.common

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.util.AttributeSet
import android.view.View
import android.view.animation.LinearInterpolator

class ClothingMarqueeView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    private val row1Items = listOf("👗", "👔", "👕", "🧥", "👘", "🩱", "🥻", "👗", "🧤", "👒", "👔", "👕")
    private val row2Items = listOf("🧣", "👖", "🥿", "👟", "👗", "🧢", "🩲", "🧥", "👘", "🥾", "👕", "🩱")

    private val itemSize = 80f

    private val paintRow1 = Paint().apply {
        textSize = 52f
        isAntiAlias = true
        alpha = 90  // 35% opacity — 뒤에서 은은하게
    }
    private val paintRow2 = Paint().apply {
        textSize = 44f
        isAntiAlias = true
        alpha = 65  // 25% opacity — 더 뒤쪽 느낌
    }

    private var row1Offset = 0f
    private var row2Offset = 0f

    private var animator1: ValueAnimator? = null
    private var animator2: ValueAnimator? = null

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        startAnimations()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        animator1?.cancel()
        animator2?.cancel()
    }

    private fun startAnimations() {
        val cycleWidth = row1Items.size * itemSize

        // Row 1: 느린 속도 (8초)
        animator1 = ValueAnimator.ofFloat(0f, -cycleWidth).apply {
            duration = 8000L
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.RESTART
            interpolator = LinearInterpolator()
            addUpdateListener {
                row1Offset = it.animatedValue as Float
                invalidate()
            }
            start()
        }

        // Row 2: 빠른 속도 (5초) — 시차 효과
        animator2 = ValueAnimator.ofFloat(-itemSize * 2.5f, -(cycleWidth + itemSize * 2.5f)).apply {
            duration = 5000L
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.RESTART
            interpolator = LinearInterpolator()
            addUpdateListener {
                row2Offset = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val h = height.toFloat()

        drawRow(canvas, row1Items, row1Offset, paintRow1, h * 0.36f)
        drawRow(canvas, row2Items, row2Offset, paintRow2, h * 0.68f)
    }

    private fun drawRow(
        canvas: Canvas,
        items: List<String>,
        offset: Float,
        paint: Paint,
        y: Float
    ) {
        val cycleWidth = items.size * itemSize
        // 모듈러 연산으로 음수 offset 정규화
        val normalizedOffset = ((offset % cycleWidth) - cycleWidth) % cycleWidth

        // 화면을 채우기 위해 충분한 수의 아이템 그리기
        val startIdx = ((-normalizedOffset) / itemSize).toInt()
        val visibleCount = (width / itemSize).toInt() + 3

        for (i in startIdx until startIdx + visibleCount) {
            val x = normalizedOffset + i * itemSize
            if (x > -itemSize && x < width + itemSize) {
                val idx = ((i % items.size) + items.size) % items.size
                canvas.drawText(items[idx], x, y, paint)
            }
        }
    }
}
