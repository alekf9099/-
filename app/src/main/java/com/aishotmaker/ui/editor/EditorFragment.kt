package com.aishotmaker.ui.editor

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import androidx.navigation.fragment.navArgs
import androidx.recyclerview.widget.LinearLayoutManager
import coil.load
import com.aishotmaker.databinding.FragmentEditorBinding
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class EditorFragment : Fragment() {

    private var _binding: FragmentEditorBinding? = null
    private val binding get() = _binding!!

    private val viewModel: EditorViewModel by viewModels()
    private val args: EditorFragmentArgs by navArgs()
    private lateinit var modelAdapter: AiModelAdapter

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentEditorBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        viewModel.setImagePath(args.imagePath)
        setupModelRecyclerView()
        setupObservers()
        setupClickListeners()
    }

    private fun setupModelRecyclerView() {
        modelAdapter = AiModelAdapter { model ->
            viewModel.selectModel(model)
        }
        binding.rvModels.apply {
            layoutManager = LinearLayoutManager(
                requireContext(), LinearLayoutManager.HORIZONTAL, false
            )
            adapter = modelAdapter
        }
    }

    private fun setupObservers() {
        viewModel.capturedImage.observe(viewLifecycleOwner) { path ->
            binding.ivCapturedClothing.load(path) { crossfade(true) }
        }

        viewModel.removedBgImage.observe(viewLifecycleOwner) { bitmap ->
            bitmap?.let {
                binding.ivRemovedBg.setImageBitmap(it)
                binding.groupRemovedBg.visibility = View.VISIBLE
            }
        }

        viewModel.aiModels.observe(viewLifecycleOwner) { models ->
            modelAdapter.submitList(models)
        }

        viewModel.selectedModel.observe(viewLifecycleOwner) { model ->
            binding.btnGenerate.isEnabled = model != null
            binding.tvSelectedModel.text = model?.name ?: "모델을 선택해주세요"
        }

        viewModel.isRemovingBg.observe(viewLifecycleOwner) { removing ->
            binding.progressBgRemoval.visibility = if (removing) View.VISIBLE else View.GONE
            binding.tvBgRemovalStatus.text = if (removing) "배경 제거 중..." else "배경 제거 완료"
        }

        viewModel.credits.observe(viewLifecycleOwner) { credits ->
            binding.tvCreditsRemaining.text = "잔여 크레딧: ${credits}장"
            binding.btnGenerate.isEnabled = credits > 0 && viewModel.selectedModel.value != null
        }
    }

    private fun setupClickListeners() {
        binding.btnBack.setOnClickListener { findNavController().navigateUp() }

        binding.btnGenerate.setOnClickListener {
            val credits = viewModel.credits.value ?: 0
            if (credits <= 0) {
                showInsufficientCreditsDialog()
            } else {
                navigateToProcessing()
            }
        }

        binding.toggleBgPreview.setOnCheckedChangeListener { _, checked ->
            binding.ivCapturedClothing.visibility = if (checked) View.GONE else View.VISIBLE
            binding.ivRemovedBg.visibility = if (checked) View.VISIBLE else View.GONE
        }
    }

    private fun navigateToProcessing() {
        val modelId = viewModel.selectedModel.value?.id ?: return
        val imagePath = args.imagePath
        val action = EditorFragmentDirections.actionEditorToProcessing(imagePath, modelId)
        findNavController().navigate(action)
    }

    private fun showInsufficientCreditsDialog() {
        Toast.makeText(requireContext(), "크레딧이 부족합니다. 충전해주세요.", Toast.LENGTH_LONG).show()
        findNavController().navigate(com.aishotmaker.R.id.action_editor_to_subscription)
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
