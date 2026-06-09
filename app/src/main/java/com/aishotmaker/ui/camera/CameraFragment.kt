package com.aishotmaker.ui.camera

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.aishotmaker.databinding.FragmentCameraBinding
import dagger.hilt.android.AndroidEntryPoint
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

@AndroidEntryPoint
class CameraFragment : Fragment() {

    private var _binding: FragmentCameraBinding? = null
    private val binding get() = _binding!!

    private val viewModel: CameraViewModel by viewModels()
    private lateinit var cameraExecutor: ExecutorService
    private var imageCapture: ImageCapture? = null
    private var camera: Camera? = null

    private val requestPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) startCamera() else showPermissionDenied()
    }

    private val pickImage = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let { navigateToEditor(it.toString()) }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentCameraBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        cameraExecutor = Executors.newSingleThreadExecutor()
        setupClickListeners()
        checkCameraPermission()
    }

    private fun checkCameraPermission() {
        if (ContextCompat.checkSelfPermission(
                requireContext(), Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED
        ) {
            startCamera()
        } else {
            requestPermission.launch(Manifest.permission.CAMERA)
        }
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(requireContext())
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()

            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(binding.viewFinder.surfaceProvider)
            }

            imageCapture = ImageCapture.Builder()
                .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
                .setJpegQuality(95)
                .build()

            val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

            try {
                cameraProvider.unbindAll()
                camera = cameraProvider.bindToLifecycle(
                    viewLifecycleOwner, cameraSelector, preview, imageCapture
                )
                setupZoomAndFocus()
            } catch (e: Exception) {
                Toast.makeText(requireContext(), "카메라 실행 오류", Toast.LENGTH_SHORT).show()
            }
        }, ContextCompat.getMainExecutor(requireContext()))
    }

    private fun setupZoomAndFocus() {
        binding.viewFinder.setOnTouchListener { _, event ->
            val meteringPoint = binding.viewFinder.meteringPointFactory
                .createPoint(event.x, event.y)
            val action = FocusMeteringAction.Builder(meteringPoint).build()
            camera?.cameraControl?.startFocusAndMetering(action)
            showFocusIndicator(event.x, event.y)
            true
        }
    }

    private fun showFocusIndicator(x: Float, y: Float) {
        binding.ivFocusIndicator.apply {
            translationX = x - width / 2f
            translationY = y - height / 2f
            visibility = View.VISIBLE
            animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(200)
                .withEndAction {
                    animate().alpha(0f).setStartDelay(800).setDuration(300)
                        .withEndAction { visibility = View.GONE }
                }
        }
    }

    private fun capturePhoto() {
        val imageCapture = imageCapture ?: return
        binding.btnCapture.isEnabled = false

        val outputFile = File(
            requireContext().cacheDir,
            "IMG_${SimpleDateFormat("yyyyMMdd_HHmmss", Locale.KOREA).format(System.currentTimeMillis())}.jpg"
        )

        val outputOptions = ImageCapture.OutputFileOptions.Builder(outputFile).build()
        imageCapture.takePicture(
            outputOptions,
            ContextCompat.getMainExecutor(requireContext()),
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                    binding.btnCapture.isEnabled = true
                    navigateToEditor(outputFile.absolutePath)
                }

                override fun onError(exc: ImageCaptureException) {
                    binding.btnCapture.isEnabled = true
                    Toast.makeText(requireContext(), "촬영 오류: ${exc.message}", Toast.LENGTH_SHORT).show()
                }
            }
        )
    }

    private fun toggleFlash() {
        val flashMode = imageCapture?.flashMode ?: return
        val newMode = when (flashMode) {
            ImageCapture.FLASH_MODE_OFF -> ImageCapture.FLASH_MODE_ON
            ImageCapture.FLASH_MODE_ON -> ImageCapture.FLASH_MODE_AUTO
            else -> ImageCapture.FLASH_MODE_OFF
        }
        imageCapture?.flashMode = newMode
        binding.btnFlash.setImageResource(
            when (newMode) {
                ImageCapture.FLASH_MODE_ON -> com.aishotmaker.R.drawable.ic_flash_on
                ImageCapture.FLASH_MODE_AUTO -> com.aishotmaker.R.drawable.ic_flash_auto
                else -> com.aishotmaker.R.drawable.ic_flash_off
            }
        )
    }

    private fun setupClickListeners() {
        binding.btnCapture.setOnClickListener { capturePhoto() }
        binding.btnFlash.setOnClickListener { toggleFlash() }
        binding.btnGallery.setOnClickListener { pickImage.launch("image/*") }
        binding.btnBack.setOnClickListener { findNavController().navigateUp() }
    }

    private fun navigateToEditor(imagePath: String) {
        val action = CameraFragmentDirections.actionCameraToEditor(imagePath)
        findNavController().navigate(action)
    }

    private fun showPermissionDenied() {
        Toast.makeText(requireContext(), "카메라 권한이 필요합니다.", Toast.LENGTH_LONG).show()
        findNavController().navigateUp()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        cameraExecutor.shutdown()
        _binding = null
    }
}
