package com.melodeal

import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Equalizer
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.outlined.Equalizer
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.Alignment
import androidx.compose.runtime.mutableStateOf
import com.melodeal.community.Track
import com.melodeal.ui.activity.ActivityScreen
import com.melodeal.ui.chart.ChartScreen
import com.melodeal.ui.create.CreateSheet
import com.melodeal.ui.discover.DiscoverScreen
import com.melodeal.ui.my.MyScreen
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.currentBackStackEntryAsState
import com.melodeal.ui.community.ChatRoomScreen
import com.melodeal.ui.community.ProfileScreen
import com.melodeal.ui.community.TrackDetailScreen
import kotlinx.coroutines.delay
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.melodeal.ui.AppViewModel
import com.melodeal.ui.onboarding.OnboardingScreen
import com.melodeal.ui.party.PartyQueueScreen
import com.melodeal.ui.party.PartySetupScreen
import com.melodeal.ui.ranking.RankingScreen
import com.melodeal.ui.result.ResultScreen
import com.melodeal.ui.settings.SettingsScreen
import com.melodeal.ui.sing.SingScreen
import com.melodeal.ui.songs.SongListScreen
import com.melodeal.ui.studio.EditorScreen
import com.melodeal.ui.studio.RecordScreen
import com.melodeal.ui.theme.Neon
import com.melodeal.ui.theme.MelodealTheme

class MainActivity : ComponentActivity() {
    private val appVm: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MelodealTheme {
                Box(Modifier.fillMaxSize().background(Neon.Bg).safeDrawingPadding()) {
                    AppNav(appVm)
                }
            }
        }
    }
}

object Routes {
    const val HOME = "home"
    const val ONBOARDING = "onboarding"
    const val PARTY_SETUP = "party/setup"
    const val PARTY_QUEUE = "party/queue"
    const val RANKING = "ranking"
    const val SETTINGS = "settings"
    const val RECORD = "studio/record"
    const val CHART = "chart"
    const val ACTIVITY = "activity"
    const val MY = "my"
    fun track(id: String) = "track/$id"
    fun profile(id: String) = "profile/$id"
    fun chat(id: String) = "chat/$id"
    val tabs = setOf(HOME, CHART, ACTIVITY, MY)
    fun editor(id: Long) = "studio/edit/$id"

    /** reservePlayer >= 0 이면 해당 참가자 예약용으로 곡을 고른다 */
    fun songs(reservePlayer: Int = -1) = "songs?player=$reservePlayer"
    fun sing(songId: String, player: String, reservation: Long = -1) =
        "sing/${Uri.encode(songId)}?player=${Uri.encode(player)}&res=$reservation"
    fun result(scoreId: Long, party: Boolean) = "result/$scoreId?party=$party"
}

@Composable
private fun AppNav(appVm: AppViewModel) {
    val nav = rememberNavController()
    val settings = (androidx.compose.ui.platform.LocalContext.current.applicationContext as MelodealApp).settings
    val singerName = { settings.state.value.myName.ifBlank { "나" } }
    val app = androidx.compose.ui.platform.LocalContext.current.applicationContext as MelodealApp
    val community = app.community
    val me by community.me.collectAsState()
    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route
    var unread by remember { mutableIntStateOf(0) }
    var refreshBadge by remember { mutableIntStateOf(0) }
    var creating by remember { mutableStateOf(false) }
    // 활동 탭 배지 = 안 읽은 알림 + 안 읽은 메시지 (로그인돼 있을 때만, 20초마다 + 새 알림이 오면 바로)
    LaunchedEffect(me, refreshBadge) {
        while (me != null) {
            unread = runCatching {
                community.notifications().count { !it.read } + community.conversations().sumOf { it.unread }
            }.getOrDefault(unread)
            delay(20_000)
        }
    }
    LaunchedEffect(me) { if (me != null) community.notificationEvents().collect { unread++ } }
    fun sing(t: Track) {
        val id = "community:${t.id}"
        app.songs.putTransient(t.composition.toSong(id, t.ownerNickname))
        nav.navigate(Routes.sing(id, singerName()))
    }
    fun party() = nav.navigate(if (appVm.party.value.players.isEmpty()) Routes.PARTY_SETUP else Routes.PARTY_QUEUE)
    fun openTab(tab: String) = nav.navigate(tab) {
        popUpTo(Routes.HOME) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
    Column(Modifier.fillMaxSize()) {
    val start = remember { if (settings.state.value.onboarded) Routes.HOME else Routes.ONBOARDING }
    NavHost(nav, startDestination = start, modifier = Modifier.weight(1f)) {
        composable(Routes.ONBOARDING) {
            OnboardingScreen(onFinish = {
                settings.update { it.copy(onboarded = true) }
                nav.navigate(Routes.HOME) { popUpTo(Routes.ONBOARDING) { inclusive = true } }
            })
        }
        composable(Routes.HOME) {
            DiscoverScreen(onOpenTrack = { nav.navigate(Routes.track(it)) }, onOpenProfile = { nav.navigate(Routes.profile(it)) }, onSing = ::sing)
        }
        composable(Routes.CHART) { ChartScreen(onOpenTrack = { nav.navigate(Routes.track(it)) }) }
        composable(Routes.ACTIVITY) {
            ActivityScreen(
                onOpenTrack = { nav.navigate(Routes.track(it)) },
                onOpenProfile = { nav.navigate(Routes.profile(it)) },
                onOpenChat = { nav.navigate(Routes.chat(it)) },
                onSeen = { refreshBadge++ },
            )
        }
        composable(Routes.MY) {
            MyScreen(
                onOpenSong = { nav.navigate(Routes.editor(it)) },
                onOpenTrack = { nav.navigate(Routes.track(it)) },
                onCreate = { creating = true },
                onSing = { nav.navigate(Routes.songs()) },
                onParty = ::party,
                onRanking = { nav.navigate(Routes.RANKING) },
                onSettings = { nav.navigate(Routes.SETTINGS) },
            )
        }
        composable("track/{id}") { entry ->
            TrackDetailScreen(
                trackId = entry.arguments!!.getString("id")!!,
                onBack = { nav.popBackStack() },
                onOpenProfile = { nav.navigate(Routes.profile(it)) },
                onChat = { nav.navigate(Routes.chat(it)) },
                onSing = { songId -> nav.navigate(Routes.sing(songId, singerName())) },
                onRemixed = { id -> nav.navigate(Routes.editor(id)) },
            )
        }
        composable("profile/{id}") { entry ->
            val id = entry.arguments!!.getString("id")!!
            ProfileScreen(
                userId = id, onBack = { nav.popBackStack() },
                onOpenTrack = { nav.navigate(Routes.track(it)) },
                onChat = { nav.navigate(Routes.chat(it)) },
            )
        }
        composable("chat/{id}") { entry ->
            ChatRoomScreen(
                conversationId = entry.arguments!!.getString("id")!!,
                onBack = { nav.popBackStack() },
                onOpenProfile = { nav.navigate(Routes.profile(it)) },
                onOpenTrack = { nav.navigate(Routes.track(it)) },
            )
        }
        composable(Routes.RECORD) {
            RecordScreen(onBack = { nav.popBackStack() }, onCreated = { id ->
                nav.navigate(Routes.editor(id)) { popUpTo(Routes.RECORD) { inclusive = true } }
            })
        }
        composable("studio/edit/{id}", arguments = listOf(navArgument("id") { type = NavType.LongType })) { entry ->
            EditorScreen(
                id = entry.arguments!!.getLong("id"),
                onBack = { nav.popBackStack() },
                onSing = { songId -> nav.navigate(Routes.sing(songId, singerName())) },
                onPublished = { trackId -> nav.navigate(Routes.track(trackId)) },
            )
        }
        composable(Routes.PARTY_SETUP) {
            PartySetupScreen(appVm, onBack = { nav.popBackStack() }, onStart = {
                nav.navigate(Routes.PARTY_QUEUE) { popUpTo(Routes.HOME) }
            })
        }
        composable(Routes.PARTY_QUEUE) {
            PartyQueueScreen(
                appVm,
                onBack = { nav.popBackStack(Routes.HOME, inclusive = false) },
                onEditPlayers = { nav.navigate(Routes.PARTY_SETUP) },
                onReserve = { playerId -> nav.navigate(Routes.songs(playerId)) },
                onSing = { r -> nav.navigate(Routes.sing(r.songId, appVm.party.value.player(r.playerId).name, r.id)) },
            )
        }
        composable(
            "songs?player={player}",
            arguments = listOf(navArgument("player") { type = NavType.IntType; defaultValue = -1 }),
        ) { entry ->
            val playerId = entry.arguments!!.getInt("player")
            val party by appVm.party.collectAsState()
            SongListScreen(
                reserveFor = party.players.firstOrNull { it.id == playerId },
                onBack = { nav.popBackStack() },
                onPick = { song, myName ->
                    if (playerId >= 0) {
                        appVm.reserve(playerId, song.id, song.title)
                        nav.popBackStack()
                    } else {
                        nav.navigate(Routes.sing(song.id, myName))
                    }
                },
            )
        }
        composable(
            "sing/{songId}?player={player}&res={res}",
            arguments = listOf(
                navArgument("songId") { type = NavType.StringType },
                navArgument("player") { type = NavType.StringType; defaultValue = "나" },
                navArgument("res") { type = NavType.LongType; defaultValue = -1L },
            ),
        ) { entry ->
            val args = entry.arguments!!
            val reservation = args.getLong("res")
            SingScreen(
                songId = args.getString("songId")!!,
                playerName = args.getString("player")!!,
                onClose = { nav.popBackStack() },
                onFinished = { scoreId, total ->
                    val party = reservation >= 0
                    if (party) appVm.complete(reservation, total)
                    nav.navigate(Routes.result(scoreId, party)) {
                        popUpTo(entry.destination.id) { inclusive = true }
                    }
                },
            )
        }
        composable(
            "result/{scoreId}?party={party}",
            arguments = listOf(
                navArgument("scoreId") { type = NavType.LongType },
                navArgument("party") { type = NavType.BoolType; defaultValue = false },
            ),
        ) { entry ->
            val args = entry.arguments!!
            ResultScreen(
                scoreId = args.getLong("scoreId"),
                party = args.getBoolean("party"),
                onNextTurn = { nav.popBackStack(Routes.PARTY_QUEUE, inclusive = false) },
                onRetry = { songId, player ->
                    nav.navigate(Routes.sing(songId, player)) { popUpTo(Routes.HOME) }
                },
                onHome = { nav.popBackStack(Routes.HOME, inclusive = false) },
                onRanking = { nav.navigate(Routes.RANKING) },
            )
        }
        composable(Routes.RANKING) { RankingScreen(onBack = { nav.popBackStack() }) }
        composable(Routes.SETTINGS) { SettingsScreen(onBack = { nav.popBackStack() }) }
    }
    if (route in Routes.tabs) BottomTabs(route, unread, ::openTab, onCreate = { creating = true })
    }
    if (creating) {
        CreateSheet(
            onDismiss = { creating = false },
            onRecord = { creating = false; nav.navigate(Routes.RECORD) },
            onOpenSong = { creating = false; nav.navigate(Routes.editor(it)) },
            onSing = { creating = false; nav.navigate(Routes.songs()) },
            onParty = { creating = false; party() },
        )
    }
}

private data class Tab(val route: String, val label: String, val on: androidx.compose.ui.graphics.vector.ImageVector, val off: androidx.compose.ui.graphics.vector.ImageVector)

/** 홈 · 차트 · ＋만들기 · 활동 · MY */
@Composable
private fun BottomTabs(route: String?, unread: Int, onTab: (String) -> Unit, onCreate: () -> Unit) {
    val left = listOf(Tab(Routes.HOME, "홈", Icons.Filled.Home, Icons.Outlined.Home), Tab(Routes.CHART, "차트", Icons.Filled.Equalizer, Icons.Outlined.Equalizer))
    val right = listOf(Tab(Routes.ACTIVITY, "활동", Icons.Filled.Notifications, Icons.Outlined.Notifications), Tab(Routes.MY, "MY", Icons.Filled.Person, Icons.Outlined.Person))
    val colors = NavigationBarItemDefaults.colors(
        selectedIconColor = Neon.TextHigh, selectedTextColor = Neon.TextHigh,
        indicatorColor = Neon.Pink.copy(alpha = 0.16f), unselectedIconColor = Neon.TextLow, unselectedTextColor = Neon.TextLow,
    )
    NavigationBar(containerColor = Neon.Surface, tonalElevation = 0.dp) {
        @Composable
        fun item(t: Tab) = NavigationBarItem(
            selected = route == t.route,
            onClick = { onTab(t.route) },
            icon = {
                BadgedBox(badge = { if (t.route == Routes.ACTIVITY && unread > 0) Badge(containerColor = Neon.Pink) { Text(if (unread > 99) "99+" else "$unread") } }) {
                    Icon(if (route == t.route) t.on else t.off, contentDescription = t.label)
                }
            },
            label = { Text(t.label) },
            colors = colors,
        )
        left.forEach { item(it) }
        NavigationBarItem(
            selected = false,
            onClick = onCreate,
            icon = {
                Box(Modifier.size(width = 52.dp, height = 36.dp).clip(CircleShape).background(Neon.Hero), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Add, contentDescription = "만들기", tint = Color.White)
                }
            },
            label = { Text("만들기") },
            colors = NavigationBarItemDefaults.colors(indicatorColor = Color.Transparent, unselectedTextColor = Neon.TextMid),
        )
        right.forEach { item(it) }
    }
}
