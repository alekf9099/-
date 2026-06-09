package com.aishotmaker.ui.splash

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.aishotmaker.R
import com.aishotmaker.databinding.FragmentSplashBinding
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@AndroidEntryPoint
class SplashFragment : Fragment() {

    private var _binding: FragmentSplashBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentSplashBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        animateLogo()
        lifecycleScope.launch {
            delay(2200)
            findNavController().navigate(R.id.action_splash_to_home)
        }
    }

    private fun animateLogo() {
        // 로고 영역 초기 상태: 투명 + 약간 아래
        val content = binding.root.getChildAt(1) as View  // LinearLayout (로고+텍스트)
        content.alpha = 0f
        content.translationY = 40f

        // 0.3초 딜레이 후 페이드인 + 슬라이드업
        content.animate()
            .alpha(1f)
            .translationY(0f)
            .setStartDelay(300)
            .setDuration(700)
            .setInterpolator(DecelerateInterpolator(2f))
            .start()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
