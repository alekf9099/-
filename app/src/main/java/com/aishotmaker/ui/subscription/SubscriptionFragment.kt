package com.aishotmaker.ui.subscription

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.aishotmaker.R
import com.aishotmaker.databinding.FragmentSubscriptionBinding
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class SubscriptionFragment : Fragment() {

    private var _binding: FragmentSubscriptionBinding? = null
    private val binding get() = _binding!!

    private val viewModel: SubscriptionViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentSubscriptionBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupObservers()
        setupClickListeners()
    }

    private fun setupObservers() {
        viewModel.currentCredits.observe(viewLifecycleOwner) { credits ->
            binding.tvCurrentCredits.text = "현재 잔여: ${credits}장"
        }

        viewModel.subscriptionType.observe(viewLifecycleOwner) { type ->
            binding.tvSubscriptionStatus.text = when (type) {
                com.aishotmaker.domain.model.SubscriptionType.MONTHLY -> "월 구독 이용 중"
                else -> "무료 플랜"
            }
        }

        viewModel.isLoading.observe(viewLifecycleOwner) { loading ->
            binding.progressBar.visibility = if (loading) View.VISIBLE else View.GONE
        }
    }

    private fun setupClickListeners() {
        binding.btnBack.setOnClickListener { findNavController().navigateUp() }

        // 크레딧 패키지 구매
        binding.btnBuy30.setOnClickListener {
            viewModel.purchaseCredits("credits_30", requireActivity())
        }
        binding.btnBuy100.setOnClickListener {
            viewModel.purchaseCredits("credits_100", requireActivity())
        }
        binding.btnBuy300.setOnClickListener {
            viewModel.purchaseCredits("credits_300", requireActivity())
        }

        // 월 구독
        binding.btnSubscribeMonthly.setOnClickListener {
            viewModel.startMonthlySubscription(requireActivity())
        }

        // 로그아웃
        binding.tvLogout.setOnClickListener {
            viewModel.logout()
            findNavController().navigate(
                R.id.loginFragment,
                null,
                androidx.navigation.NavOptions.Builder()
                    .setPopUpTo(R.id.nav_graph, true)
                    .build()
            )
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
