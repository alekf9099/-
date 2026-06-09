package com.aishotmaker.ui.home

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.aishotmaker.databinding.ItemHistoryBinding
import com.aishotmaker.domain.model.GenerationJob
import com.aishotmaker.domain.model.JobStatus

class HistoryAdapter(
    private val onClick: (GenerationJob) -> Unit
) : ListAdapter<GenerationJob, HistoryAdapter.ViewHolder>(DiffCallback) {

    inner class ViewHolder(
        private val binding: ItemHistoryBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(job: GenerationJob) {
            val imageUrl = job.resultImageUrl ?: job.originalImageUrl
            binding.ivResult.load(imageUrl) {
                crossfade(true)
                placeholder(com.aishotmaker.R.drawable.ic_image_placeholder)
            }
            binding.tvStatus.text = when (job.status) {
                JobStatus.COMPLETED -> "완성"
                JobStatus.PROCESSING -> "처리중"
                JobStatus.PENDING -> "대기중"
                JobStatus.FAILED -> "실패"
            }
            binding.root.setOnClickListener { onClick(job) }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemHistoryBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    companion object DiffCallback : DiffUtil.ItemCallback<GenerationJob>() {
        override fun areItemsTheSame(old: GenerationJob, new: GenerationJob) = old.id == new.id
        override fun areContentsTheSame(old: GenerationJob, new: GenerationJob) = old == new
    }
}
