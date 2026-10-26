package com.melodeal.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.melodeal.MelodealApp

@Composable
fun app(): MelodealApp = LocalContext.current.applicationContext as MelodealApp

/** 수동 DI용 ViewModel 생성 헬퍼 */
@Composable
inline fun <reified VM : ViewModel> appViewModel(key: String? = null, crossinline create: (MelodealApp) -> VM): VM {
    val app = app()
    return viewModel(key = key, factory = viewModelFactory { initializer { create(app) } })
}
