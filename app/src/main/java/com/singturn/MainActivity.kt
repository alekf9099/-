package com.singturn

import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
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
import com.singturn.ui.AppViewModel
import com.singturn.ui.home.HomeScreen
import com.singturn.ui.party.PartyQueueScreen
import com.singturn.ui.party.PartySetupScreen
import com.singturn.ui.ranking.RankingScreen
import com.singturn.ui.result.ResultScreen
import com.singturn.ui.settings.SettingsScreen
import com.singturn.ui.sing.SingScreen
import com.singturn.ui.songs.SongListScreen
import com.singturn.ui.studio.EditorScreen
import com.singturn.ui.studio.RecordScreen
import com.singturn.ui.theme.Neon
import com.singturn.ui.theme.SingTurnTheme

class MainActivity : ComponentActivity() {
    private val appVm: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            SingTurnTheme {
                Box(Modifier.fillMaxSize().background(Neon.Bg).safeDrawingPadding()) {
                    AppNav(appVm)
                }
            }
        }
    }
}

object Routes {
    const val HOME = "home"
    const val PARTY_SETUP = "party/setup"
    const val PARTY_QUEUE = "party/queue"
    const val RANKING = "ranking"
    const val SETTINGS = "settings"
    const val RECORD = "studio/record"
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
    val settings = (androidx.compose.ui.platform.LocalContext.current.applicationContext as SingTurnApp).settings
    val singerName = { settings.state.value.myName.ifBlank { "나" } }
    NavHost(nav, startDestination = Routes.HOME) {
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
}
