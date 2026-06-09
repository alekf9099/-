package com.aishotmaker.ui.result

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import androidx.navigation.fragment.navArgs
import com.aishotmaker.databinding.FragmentProcessingBinding
import com.aishotmaker.domain.model.JobStatus
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class ProcessingFragment : Fragment() {

    private var _binding: FragmentProcessingBinding? = null
    private val binding get() = _binding!!

    private val viewModel: ProcessingViewModel by viewModels()
    private val args: ProcessingFragmentArgs by navArgs()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentProcessingBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupObservers()
        viewModel.startGeneration(args.imagePath, args.modelId)
    }

    private fun setupObservers() {
        viewModel.processingState.observe(viewLifecycleOwner) { state ->
            when (state) {
                is ProcessingState.Loading -> showLoading("AI가 이미지를 분석하고 있어요...")
                is ProcessingState.Processing -> showLoading(state.message)
                is ProcessingState.Completed -> navigateToResult(state.jobId)
                is ProcessingState.Failed -> showError(state.message)
            }
        }

        viewModel.progress.observe(viewLifecycleOwner) { progress ->
            binding.progressBar.progress = progress
            binding.tvProgress.text = "$progress%"
        }
    }

    private fun showLoading(message: String) {
        binding.tvStatus.text = message
        binding.layoutError.visibility = View.GONE
        binding.lottieAnimation.playAnimation()
    }

    private fun showError(message: String) {
        binding.lottieAnimation.pauseAnimation()
        binding.layoutError.visibility = View.VISIBLE
        binding.tvError.text = message
        binding.btnRetry.setOnClickListener {
            viewModel.startGeneration(args.imagePath, args.modelId)
        }
        binding.btnCancel.setOnClickListener {
            findNavController().navigateUp()
        }
    }

    private fun navigateToResult(jobId: String) {
        val action = ProcessingFragmentDirections.actionProcessingToResult(jobId)
        findNavController().navigate(action)
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

sealed class ProcessingState {
    object Loading : ProcessingState()
    data class Processing(val message: String) : ProcessingState()
    data class Completed(val jobId: String) : ProcessingState()
    data class Failed(val message: String) : ProcessingState()
}
