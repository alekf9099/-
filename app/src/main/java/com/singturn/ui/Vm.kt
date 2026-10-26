package com.singturn.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.singturn.SingTurnApp

@Composable
fun app(): SingTurnApp = LocalContext.current.applicationContext as SingTurnApp

/** 수동 DI용 ViewModel 생성 헬퍼 */
@Composable
inline fun <reified VM : ViewModel> appViewModel(key: String? = null, crossinline create: (SingTurnApp) -> VM): VM {
    val app = app()
    return viewModel(key = key, factory = viewModelFactory { initializer { create(app) } })
}
