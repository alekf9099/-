package com.aishotmaker.ui.result

import android.content.ContentValues
import android.os.Bundle
import android.provider.MediaStore
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import androidx.navigation.fragment.navArgs
import coil.load
import com.aishotmaker.databinding.FragmentResultBinding
import dagger.hilt.android.AndroidEntryPoint
import java.net.URL

@AndroidEntryPoint
class ResultFragment : Fragment() {

    private var _binding: FragmentResultBinding? = null
    private val binding get() = _binding!!

    private val viewModel: ResultViewModel by viewModels()
    private val args: ResultFragmentArgs by navArgs()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentResultBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        viewModel.loadResult(args.jobId)
        setupObservers()
        setupClickListeners()
    }

    private fun setupObservers() {
        viewModel.generationJob.observe(viewLifecycleOwner) { job ->
            job.resultImageUrl?.let { url ->
                binding.ivResult.load(url) { crossfade(true) }
            }
        }

        viewModel.isSaving.observe(viewLifecycleOwner) { saving ->
            binding.btnSave.isEnabled = !saving
            binding.btnSave.text = if (saving) "저장 중..." else "저장하기"
        }
    }

    private fun setupClickListeners() {
        binding.btnSave.setOnClickListener { viewModel.saveImage(requireContext()) }

        binding.btnShare.setOnClickListener {
            viewModel.shareImage(requireContext())
        }

        binding.btnNewShot.setOnClickListener {
            findNavController().navigate(com.aishotmaker.R.id.action_result_to_camera)
        }

        binding.btnHome.setOnClickListener {
            findNavController().navigate(com.aishotmaker.R.id.action_result_to_home)
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
