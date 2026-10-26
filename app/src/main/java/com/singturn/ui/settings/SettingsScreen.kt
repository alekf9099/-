package com.singturn.ui.settings

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Gavel
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.singturn.audio.LatencyCalibrator
import com.singturn.ui.app
import com.singturn.ui.components.GradientButton
import com.singturn.ui.components.NeonCard
import com.singturn.ui.components.SectionTitle
import com.singturn.ui.components.SingTopBar
import com.singturn.ui.theme.Neon
import kotlinx.coroutines.launch

/** TODO: 출시 전 실제 권리침해 신고 접수 주소로 교체 */
private const val RIGHTS_EMAIL = "rights@example.com"

@Composable
fun SettingsScreen(onBack: () -> Unit) {
    val store = app().settings
    val s by store.state.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var measuring by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    val runCalibration = {
        measuring = true
        message = null
        scope.launch {
            val ms = LatencyCalibrator.measure()
            measuring = false
            if (ms == null) {
                message = "클릭 소리를 잘 못 들었어요. 이어폰을 빼고 조용한 곳에서 볼륨을 키운 뒤 다시 해 주세요."
            } else {
                store.update { it.copy(latencyMs = ms, latencyCalibrated = true) }
                message = "측정 완료: ${ms}ms"
            }
        }
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { if (it) runCalibration() }

    Column(Modifier.fillMaxSize()) {
        SingTopBar("설정", onBack)
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SectionTitle("내 이름 (혼자 부르기 랭킹에 표시)")
            OutlinedTextField(
                value = s.myName,
                onValueChange = { v -> store.update { it.copy(myName = v.take(10)) } },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            SectionTitle("박자 지연 보정")
            NeonCard(modifier = Modifier.fillMaxWidth()) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.GraphicEq, contentDescription = null, tint = Neon.Cyan)
                        Text(
                            "현재 ${s.latencyMs}ms" + if (s.latencyCalibrated) " (측정됨)" else " (기본값)",
                            style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                    Text(
                        "스피커에서 나온 소리가 다시 마이크로 들어오기까지의 시간이에요. 폰 스피커로 클릭 소리 8번을 들려주고 자동으로 재요.",
                        color = Neon.TextMid, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = 8.dp),
                    )
                    if (measuring) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(Modifier.size(20.dp), color = Neon.Cyan, strokeWidth = 2.dp)
                            Text("  측정 중… 조용히 해 주세요", color = Neon.Cyan)
                        }
                    } else {
                        GradientButton("자동 측정 (약 6초)", Neon.Cool, modifier = Modifier.fillMaxWidth()) {
                            if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) runCalibration()
                            else permission.launch(Manifest.permission.RECORD_AUDIO)
                        }
                    }
                    message?.let { Text(it, color = Neon.Gold, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 8.dp)) }
                    Spacer(Modifier.height(8.dp))
                    Text("직접 조절 (블루투스 이어폰은 보통 200~350ms)", color = Neon.TextLow, style = MaterialTheme.typography.labelMedium)
                    Slider(
                        value = s.latencyMs.toFloat(),
                        onValueChange = { v -> store.update { it.copy(latencyMs = v.toInt(), latencyCalibrated = true) } },
                        valueRange = 0f..500f,
                    )
                }
            }

            SectionTitle("저작권 안내")
            NeonCard(modifier = Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("• 내장곡은 저작권 보호기간이 끝난 퍼블릭 도메인 곡이에요.", style = MaterialTheme.typography.bodyMedium)
                    Text("• 반주는 녹음된 음원이 아니라, 앱이 악보 데이터로 직접 합성해요.", style = MaterialTheme.typography.bodyMedium)
                    Text("• '내 MR'은 내 기기의 파일을 재생만 하며 업로드·공유되지 않아요. 이용 권한이 있는 파일만 사용해 주세요.", style = MaterialTheme.typography.bodyMedium)
                    Text("• 마이크 소리는 실시간 채점에만 쓰이고 녹음·저장되지 않아요.", style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(4.dp))
                    OutlinedButton(onClick = {
                        val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:$RIGHTS_EMAIL"))
                            .putExtra(Intent.EXTRA_SUBJECT, "[싱턴 노래방] 권리침해 신고")
                        runCatching { context.startActivity(intent) }
                    }, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Filled.Gavel, contentDescription = null)
                        Text("  권리침해 신고하기")
                    }
                }
            }
            Text(
                "버전 2.0.0 · 글꼴 Pretendard (SIL Open Font License 1.1)",
                color = Neon.TextLow, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(vertical = 16.dp),
            )
        }
    }
}
