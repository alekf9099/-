package com.singturn.ui.party

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.RadioButtonChecked
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.singturn.party.OrderMode
import com.singturn.ui.AppViewModel
import com.singturn.ui.components.GradientButton
import com.singturn.ui.components.NeonCard
import com.singturn.ui.components.PlayerAvatar
import com.singturn.ui.components.SectionTitle
import com.singturn.ui.components.SingTopBar
import com.singturn.ui.theme.Neon

private const val MAX_PLAYERS = 12

@Composable
fun PartySetupScreen(vm: AppViewModel, onBack: () -> Unit, onStart: () -> Unit) {
    val party by vm.party.collectAsState()
    var name by rememberSaveable { mutableStateOf("") }
    val canAdd = name.isNotBlank() && party.players.size < MAX_PLAYERS && party.players.none { it.name == name.trim() }
    val add = { if (canAdd) { vm.addPlayer(name); name = "" } }

    Column(Modifier.fillMaxSize()) {
        SingTopBar("파티 준비", onBack)
        LazyColumn(Modifier.weight(1f).padding(horizontal = 20.dp)) {
            item {
                SectionTitle("참가자 (${party.players.size}/$MAX_PLAYERS)")
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it.take(10) },
                        placeholder = { Text("이름 입력") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { add() }),
                        modifier = Modifier.weight(1f),
                    )
                    Spacer(Modifier.width(8.dp))
                    FilledIconButton(onClick = add, enabled = canAdd) { Icon(Icons.Filled.Add, contentDescription = "참가자 추가") }
                }
                Spacer(Modifier.height(12.dp))
            }
            items(party.players, key = { it.id }) { p ->
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    PlayerAvatar(p.name, Neon.PlayerColors[p.colorIndex])
                    Text(p.name, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f).padding(horizontal = 12.dp))
                    IconButton(onClick = { vm.removePlayer(p.id) }) { Icon(Icons.Filled.Close, contentDescription = "${p.name} 삭제", tint = Neon.TextLow) }
                }
            }
            item {
                Spacer(Modifier.height(16.dp))
                SectionTitle("부르는 순서")
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OrderMode.entries.forEach { mode ->
                        val selected = party.mode == mode
                        NeonCard(
                            onClick = { vm.setMode(mode) },
                            border = if (selected) Neon.Pink else Neon.Outline,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    if (selected) Icons.Filled.RadioButtonChecked else Icons.Filled.RadioButtonUnchecked,
                                    contentDescription = null,
                                    tint = if (selected) Neon.Pink else Neon.TextLow,
                                )
                                Column(Modifier.padding(start = 12.dp)) {
                                    Text(mode.label, style = MaterialTheme.typography.titleMedium)
                                    Text(mode.description, color = Neon.TextMid, style = MaterialTheme.typography.bodyMedium)
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
            }
        }
        GradientButton(
            text = if (party.players.size < 2) "2명 이상 추가해 주세요" else "파티 시작",
            brush = Neon.Hero,
            icon = Icons.Filled.PlayArrow,
            enabled = party.players.size >= 2,
            onClick = onStart,
            modifier = Modifier.fillMaxWidth().padding(20.dp),
        )
    }
}
