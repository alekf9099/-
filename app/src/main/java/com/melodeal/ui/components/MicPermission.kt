package com.melodeal.ui.components

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.melodeal.ui.app
import com.melodeal.ui.theme.Neon

/**
 * 마이크가 필요한 동작 앞에 붙이는 관문.
 * 권한이 없으면 왜 필요한지 먼저 설명하고, 사용자가 동의하면 시스템 권한 창을 띄운다.
 * 다시 묻지 않음으로 거부된 경우엔 앱 설정으로 안내한다.
 *
 * @param purpose 무엇을 하려는지 ("흥얼거림을 악보로 바꾸려면" 등)
 * @return 마이크가 필요한 동작을 실행할 때 부르는 함수
 */
@Composable
fun rememberMicPermission(purpose: String, onGranted: () -> Unit): () -> Unit {
    val context = LocalContext.current
    val settings = app().settings
    var showRationale by remember { mutableStateOf(false) }
    var showSettings by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            onGranted()
        } else {
            val activity = context as? Activity
            val canAskAgain = activity != null && ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.RECORD_AUDIO)
            if (!canAskAgain) showSettings = true
        }
    }

    if (showRationale) {
        AlertDialog(
            onDismissRequest = { showRationale = false },
            icon = {
                Box(Modifier.size(56.dp).clip(CircleShape).background(Neon.Hero), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Mic, contentDescription = null, tint = androidx.compose.ui.graphics.Color.White)
                }
            },
            title = { Text("마이크를 사용할게요") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("$purpose 마이크로 내 목소리의 음높이를 들어야 해요.", style = MaterialTheme.typography.bodyMedium)
                    Reason(Icons.Filled.GraphicEq, "폰 안에서 실시간으로만 분석해요")
                    Reason(Icons.Filled.Lock, "녹음 파일로 저장하거나 서버로 보내지 않아요")
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    showRationale = false
                    settings.update { it.copy(micAsked = true) }
                    launcher.launch(Manifest.permission.RECORD_AUDIO)
                }) { Text("허용하기") }
            },
            dismissButton = { TextButton(onClick = { showRationale = false }) { Text("나중에") } },
        )
    }
    if (showSettings) {
        AlertDialog(
            onDismissRequest = { showSettings = false },
            title = { Text("설정에서 마이크를 허용해 주세요") },
            text = { Text("마이크 권한이 꺼져 있어요. [설정 열기] → 권한 → 마이크 → '앱 사용 중에만 허용'을 선택해 주세요.") },
            confirmButton = {
                TextButton(onClick = {
                    showSettings = false
                    context.startActivity(
                        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    )
                }) { Text("설정 열기") }
            },
            dismissButton = { TextButton(onClick = { showSettings = false }) { Text("닫기") } },
        )
    }

    return {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            onGranted()
        } else {
            val activity = context as? Activity
            val permanentlyDenied = settings.state.value.micAsked && activity != null &&
                !ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.RECORD_AUDIO)
            if (permanentlyDenied) showSettings = true else showRationale = true
        }
    }
}

@Composable
private fun Reason(icon: ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = Neon.Cyan, modifier = Modifier.size(18.dp))
        Text(text, color = Neon.TextMid, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(start = 8.dp))
    }
}
