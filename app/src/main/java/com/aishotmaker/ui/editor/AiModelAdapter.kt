package com.aishotmaker.ui.editor

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.aishotmaker.databinding.ItemAiModelBinding
import com.aishotmaker.domain.model.AiModel

class AiModelAdapter(
    private val onSelect: (AiModel) -> Unit
) : ListAdapter<AiModel, AiModelAdapter.ViewHolder>(DiffCallback) {

    private var selectedId: String? = null

    inner class ViewHolder(
        private val binding: ItemAiModelBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(model: AiModel) {
            binding.ivModelThumbnail.load(model.thumbnailUrl) { crossfade(true) }
            binding.tvModelName.text = model.name
            binding.tvEthnicity.text = model.ethnicity.displayName
            binding.ivSelected.visibility = if (model.id == selectedId) {
                android.view.View.VISIBLE
            } else {
                android.view.View.GONE
            }
            binding.tvPremiumBadge.visibility = if (model.isPremium) {
                android.view.View.VISIBLE
            } else {
                android.view.View.GONE
            }
            binding.root.setOnClickListener {
                val previous = selectedId
                selectedId = model.id
                notifyItemChanged(currentList.indexOfFirst { it.id == previous })
                notifyItemChanged(adapterPosition)
                onSelect(model)
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemAiModelBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    companion object DiffCallback : DiffUtil.ItemCallback<AiModel>() {
        override fun areItemsTheSame(old: AiModel, new: AiModel) = old.id == new.id
        override fun areContentsTheSame(old: AiModel, new: AiModel) = old == new
    }
}
