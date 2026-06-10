package com.aishotmaker.ui.editor

import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import androidx.navigation.fragment.navArgs
import androidx.recyclerview.widget.LinearLayoutManager
import coil.load
import com.aishotmaker.databinding.FragmentEditorBinding
import dagger.hilt.android.AndroidEntryPoint
import java.io.File

@AndroidEntryPoint
class EditorFragment : Fragment() {

    private var _binding: FragmentEditorBinding? = null
    private val binding get() = _binding!!

    private val viewModel: EditorViewModel by viewModels()
    private val args: EditorFragmentArgs by navArgs()
    private lateinit var modelAdapter: AiModelAdapter

    private val pickUserPhoto = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let { copyUserPhotoToCache(it) }
    }

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
            binding.tvSelectedModel.text = model?.name ?: "모델을 선택해주세요"
        }

        viewModel.isRemovingBg.observe(viewLifecycleOwner) { removing ->
            binding.progressBgRemoval.visibility = if (removing) View.VISIBLE else View.GONE
            binding.tvBgRemovalStatus.text = if (removing) "배경 제거 중..." else "배경 제거 완료"
        }

        viewModel.credits.observe(viewLifecycleOwner) { credits ->
            binding.tvCreditsRemaining.text = "잔여 크레딧: ${credits}장"
        }

        viewModel.fittingMode.observe(viewLifecycleOwner) { mode ->
            val isAiModel = mode == FittingMode.AI_MODEL
            binding.tvModelSectionTitle.visibility = if (isAiModel) View.VISIBLE else View.GONE
            binding.rvModels.visibility = if (isAiModel) View.VISIBLE else View.GONE
            binding.tvSelectedModel.visibility = if (isAiModel) View.VISIBLE else View.GONE
            binding.groupUserPhoto.visibility = if (isAiModel) View.GONE else View.VISIBLE

            val checkedId = if (isAiModel) binding.btnModeAiModel.id else binding.btnModeUserPhoto.id
            if (binding.toggleFittingMode.checkedButtonId != checkedId) {
                binding.toggleFittingMode.check(checkedId)
            }
        }

        viewModel.userPhotoPath.observe(viewLifecycleOwner) { path ->
            if (path != null) {
                binding.ivUserPhoto.load(path) { crossfade(true) }
                binding.btnPickUserPhoto.text = "다른 사진 선택"
            } else {
                binding.btnPickUserPhoto.text = "전신 사진 선택"
            }
        }

        viewModel.canGenerate.observe(viewLifecycleOwner) { canGenerate ->
            binding.btnGenerate.isEnabled = canGenerate
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

        binding.toggleFittingMode.addOnButtonCheckedListener { _, checkedId, isChecked ->
            if (!isChecked) return@addOnButtonCheckedListener
            val mode = if (checkedId == binding.btnModeAiModel.id) FittingMode.AI_MODEL else FittingMode.USER_PHOTO
            viewModel.selectFittingMode(mode)
        }

        binding.btnPickUserPhoto.setOnClickListener {
            pickUserPhoto.launch("image/*")
        }
    }

    private fun copyUserPhotoToCache(uri: Uri) {
        val outputFile = File(requireContext().cacheDir, "user_photo_${System.currentTimeMillis()}.jpg")
        requireContext().contentResolver.openInputStream(uri)?.use { input ->
            outputFile.outputStream().use { output -> input.copyTo(output) }
        }
        viewModel.setUserPhoto(outputFile.absolutePath)
    }

    private fun navigateToProcessing() {
        val imagePath = args.imagePath
        val action = when (viewModel.fittingMode.value) {
            FittingMode.USER_PHOTO -> {
                val userPhotoPath = viewModel.userPhotoPath.value ?: return
                EditorFragmentDirections.actionEditorToProcessing(imagePath, null, userPhotoPath)
            }
            else -> {
                val modelId = viewModel.selectedModel.value?.id ?: return
                EditorFragmentDirections.actionEditorToProcessing(imagePath, modelId, null)
            }
        }
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
