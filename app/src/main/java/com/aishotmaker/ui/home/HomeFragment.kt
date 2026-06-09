package com.aishotmaker.ui.home

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.GridLayoutManager
import com.aishotmaker.R
import com.aishotmaker.databinding.FragmentHomeBinding
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class HomeFragment : Fragment() {

    private var _binding: FragmentHomeBinding? = null
    private val binding get() = _binding!!

    private val viewModel: HomeViewModel by viewModels()
    private lateinit var historyAdapter: HistoryAdapter

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentHomeBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupRecyclerView()
        setupObservers()
        setupClickListeners()
    }

    private fun setupRecyclerView() {
        historyAdapter = HistoryAdapter { job ->
            val action = HomeFragmentDirections.actionHomeToResult(job.id)
            findNavController().navigate(action)
        }
        binding.rvHistory.apply {
            layoutManager = GridLayoutManager(requireContext(), 2)
            adapter = historyAdapter
        }
    }

    private fun setupObservers() {
        viewModel.userProfile.observe(viewLifecycleOwner) { profile ->
            binding.tvCredits.text = "${profile.credits}장"
            binding.tvSubscriptionBadge.text = when (profile.subscriptionType) {
                com.aishotmaker.domain.model.SubscriptionType.MONTHLY -> "구독중"
                else -> "무료"
            }
        }

        viewModel.history.observe(viewLifecycleOwner) { jobs ->
            if (jobs.isEmpty()) {
                binding.layoutEmptyState.visibility = View.VISIBLE
                binding.rvHistory.visibility = View.GONE
            } else {
                binding.layoutEmptyState.visibility = View.GONE
                binding.rvHistory.visibility = View.VISIBLE
                historyAdapter.submitList(jobs)
            }
        }

        viewModel.isLoading.observe(viewLifecycleOwner) { loading ->
            binding.progressBar.visibility = if (loading) View.VISIBLE else View.GONE
        }
    }

    private fun setupClickListeners() {
        binding.fabCamera.setOnClickListener {
            findNavController().navigate(R.id.action_home_to_camera)
        }

        binding.btnAddCredits.setOnClickListener {
            findNavController().navigate(R.id.action_home_to_subscription)
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
