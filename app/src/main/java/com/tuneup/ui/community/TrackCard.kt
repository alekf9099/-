package com.tuneup.ui.community

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Headphones
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tuneup.TuneUpApp
import com.tuneup.community.FeedSort
import com.tuneup.community.Track
import com.tuneup.data.song.Genre
import com.tuneup.ui.appViewModel
import com.tuneup.ui.components.EmptyState
import com.tuneup.ui.components.NeonCard
import com.tuneup.ui.components.stageGlow
import com.tuneup.ui.theme.Neon
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@Composable
fun TrackCard(t: Track, rank: Int? = null, onClick: () -> Unit, onProfile: () -> Unit, onPlayed: () -> Unit = {}) {
    val st by PreviewPlayer.state.collectAsState()
    NeonCard(onClick = onClick, modifier = Modifier.fillMaxWidth(), border = if (st.trackId == t.id) Neon.Pink.copy(alpha = 0.5f) else Neon.Outline) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (rank != null) {
                    Text("$rank", style = MaterialTheme.typography.headlineSmall, color = if (rank <= 3) Neon.Gold else Neon.TextLow, modifier = Modifier.width(30.dp))
                }
                PlayButton(t, onStarted = onPlayed)
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text(t.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Row(Modifier.clickable(onClick = onProfile), verticalAlignment = Alignment.CenterVertically) {
                        Text(t.ownerNickname, color = Neon.Cyan, style = MaterialTheme.typography.labelLarge, maxLines = 1)
                        Text(" · ${t.genre.label} · ${relativeTime(t.createdAt)}", color = Neon.TextMid, style = MaterialTheme.typography.labelMedium, maxLines = 1)
                    }
                }
            }
            MelodyShape(
                t.composition,
                Modifier.fillMaxWidth().padding(top = 10.dp).height(36.dp).clip(RoundedCornerShape(8.dp)),
                progress = if (st.trackId == t.id) st.progress else null,
            )
            if (t.description.isNotBlank()) {
                Text(t.description, color = Neon.TextMid, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 8.dp))
            }
            Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Stat(Icons.Filled.Favorite, "${t.likeCount}", if (t.likedByMe) Neon.Pink else Neon.TextLow)
                Stat(Icons.Filled.Star, if (t.ratingCount == 0) "-" else "%.1f".format(t.ratingAvg), Neon.Gold)
                Stat(Icons.AutoMirrored.Filled.Chat, "${t.commentCount}", Neon.TextLow)
                Stat(Icons.Filled.Headphones, "${t.playCount}", Neon.TextLow)
            }
        }
    }
}

@Composable
private fun Stat(icon: ImageVector, value: String, tint: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(15.dp))
        Spacer(Modifier.width(4.dp))
        Text(value, color = Neon.TextMid, style = MaterialTheme.typography.labelMedium)
    }
}
