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
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Person
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
import com.melodeal.ui.community.ChatListScreen
import com.melodeal.ui.community.ChatRoomScreen
import com.melodeal.ui.community.FeedScreen
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
import com.melodeal.ui.home.HomeScreen
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
    const val FEED = "feed"
    const val CHATS = "chats"
    const val ME = "me"
    fun track(id: String) = "track/$id"
    fun profile(id: String) = "profile/$id"
    fun chat(id: String) = "chat/$id"
    val tabs = setOf(HOME, FEED, CHATS, ME)
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
    val community = (androidx.compose.ui.platform.LocalContext.current.applicationContext as MelodealApp).community
    val me by community.me.collectAsState()
    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route
    var unread by remember { mutableIntStateOf(0) }
    // 안 읽은 메시지 배지 (로그인돼 있을 때만, 20초마다)
    LaunchedEffect(me) {
        while (me != null) {
            unread = runCatching { community.conversations().sumOf { it.unread } }.getOrDefault(unread)
            delay(20_000)
        }
    }
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
            HomeScreen(
                onParty = { nav.navigate(if (appVm.party.value.players.isEmpty()) Routes.PARTY_SETUP else Routes.PARTY_QUEUE) },
                onSolo = { nav.navigate(Routes.songs()) },
                onRanking = { nav.navigate(Routes.RANKING) },
                onSettings = { nav.navigate(Routes.SETTINGS) },
                onCreate = { nav.navigate(Routes.RECORD) },
                onOpenSong = { nav.navigate(Routes.editor(it)) },
            )
        }
        composable(Routes.FEED) {
            FeedScreen(onOpenTrack = { nav.navigate(Routes.track(it)) }, onOpenProfile = { nav.navigate(Routes.profile(it)) })
        }
        composable(Routes.CHATS) { ChatListScreen(onOpen = { nav.navigate(Routes.chat(it)) }) }
        composable(Routes.ME) {
            ProfileScreen(
                userId = null, onBack = null,
                onOpenTrack = { nav.navigate(Routes.track(it)) },
                onChat = { nav.navigate(Routes.chat(it)) },
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
    if (route in Routes.tabs) BottomTabs(route, unread, ::openTab)
    }
}

@Composable
private fun BottomTabs(route: String?, unread: Int, onTab: (String) -> Unit) {
    NavigationBar(containerColor = Neon.Surface, tonalElevation = 0.dp) {
        listOf(
            Triple(Routes.HOME, "만들기", Icons.Filled.GraphicEq),
            Triple(Routes.FEED, "둘러보기", Icons.Filled.Explore),
            Triple(Routes.CHATS, "메시지", Icons.AutoMirrored.Filled.Chat),
            Triple(Routes.ME, "내 정보", Icons.Filled.Person),
        ).forEach { (r, label, icon) ->
            NavigationBarItem(
                selected = route == r,
                onClick = { onTab(r) },
                icon = {
                    BadgedBox(badge = { if (r == Routes.CHATS && unread > 0) Badge(containerColor = Neon.Pink) { Text("$unread") } }) {
                        Icon(icon, contentDescription = label)
                    }
                },
                label = { Text(label) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = Neon.Pink, selectedTextColor = Neon.TextHigh,
                    indicatorColor = Neon.Pink.copy(alpha = 0.14f), unselectedIconColor = Neon.TextLow, unselectedTextColor = Neon.TextLow,
                ),
            )
        }
    }
}
