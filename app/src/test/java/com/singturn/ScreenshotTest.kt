package com.singturn

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onRoot
import com.github.takahirom.roborazzi.captureRoboImage
import com.singturn.data.db.ScoreEntity
import com.singturn.scoring.Judgement
import com.singturn.scoring.foldToOctaveOf
import com.singturn.ui.AppViewModel
import com.singturn.ui.home.HomeScreen
import com.singturn.ui.party.PartyQueueScreen
import com.singturn.ui.party.PartySetupScreen
import com.singturn.ui.ranking.RankingScreen
import com.singturn.ui.result.ResultScreen
import com.singturn.ui.settings.SettingsScreen
import com.singturn.ui.sing.Headset
import com.singturn.ui.sing.Phase
import com.singturn.ui.sing.SingActions
import com.singturn.ui.sing.SingContent
import com.singturn.ui.sing.SingUiState
import com.singturn.ui.sing.TracePoint
import com.singturn.ui.songs.SongListScreen
import com.singturn.ui.theme.Neon
import com.singturn.ui.theme.SingTurnTheme
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import kotlin.math.sin

/**
 * 실제 화면을 Robolectric으로 그려 PNG로 저장한다. (디자인 확인용)
 * 실행: ./gradlew recordRoborazziDebug → docs/screenshots/
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], qualifiers = "w400dp-h860dp-xxhdpi")
class ScreenshotTest {
    @get:Rule
    val compose = createComposeRule()

    private val app get() = RuntimeEnvironment.getApplication() as SingTurnApp

    /** waitForText: DB에서 비동기로 읽어오는 화면은 이 글자가 나타날 때까지 기다린 뒤 찍는다 */
    private fun shot(name: String, waitForText: String? = null, content: @Composable () -> Unit) {
        compose.setContent {
            SingTurnTheme { Box(Modifier.fillMaxSize().background(Neon.Bg)) { content() } }
        }
        if (waitForText != null) {
            compose.waitUntil(10_000) {
                compose.onAllNodesWithText(waitForText, substring = true).fetchSemanticsNodes().isNotEmpty()
            }
        }
        compose.waitForIdle()
        compose.onRoot().captureRoboImage("../docs/screenshots/$name.png")
    }

    private fun seedScores(): Long = runBlocking {
        val dao = app.db.scores()
        val now = System.currentTimeMillis()
        val rows = listOf("지민" to 96, "서준" to 91, "하윤" to 87, "도윤" to 82, "나" to 78, "수아" to 71)
        var last = 0L
        rows.forEachIndexed { i, (name, total) ->
            last = dao.insert(
                ScoreEntity(
                    songId = "birthday-ko", songTitle = "생일 축하합니다", playerName = name,
                    total = total, pitch = total + 2 - i, rhythm = total - 3, stability = total - 8,
                    ranked = true, keyShift = if (i % 2 == 0) 0 else -3, createdAt = now - i * 60_000L,
                    perfect = 30 - i * 3, great = 8 + i, good = 3 + i, miss = i, maxCombo = 24 - i * 2,
                ),
            )
        }
        last
    }

    private fun partyVm() = AppViewModel().apply {
        addPlayer("지민"); addPlayer("서준"); addPlayer("하윤"); addPlayer("도윤")
        reserve(1, "twinkle", "Twinkle Twinkle Little Star")
        reserve(2, "birthday-ko", "생일 축하합니다")
        reserve(3, "jingle-bells", "Jingle Bells (후렴)")
        reserve(4, "london-bridge", "London Bridge Is Falling Down")
        reserve(1, "row-boat", "Row, Row, Row Your Boat")
        upNext.value?.let { complete(it.id, 92) }
        upNext.value?.let { complete(it.id, 78) }
        upNext.value?.let { complete(it.id, 85) }
    }

    @Test fun home_empty() = shot("01_home_empty") { HomeScreen({}, {}, {}, {}) }

    @Test fun home() {
        seedScores()
        shot("02_home", waitForText = "96") { HomeScreen({}, {}, {}, {}) }
    }

    @Test fun partySetup() {
        val vm = partyVm()
        shot("03_party_setup") { PartySetupScreen(vm, {}, {}) }
    }

    @Test fun partyQueue() {
        val vm = partyVm()
        shot("04_party_queue") { PartyQueueScreen(vm, {}, {}, {}, {}) }
    }

    @Test fun songs() = shot("05_songs") { SongListScreen(null, {}, { _, _ -> }) }

    @Test fun singReady() {
        val song = app.songs.builtin.first { it.id == "twinkle" }
        shot("06_sing_ready") {
            SingContent(SingUiState(phase = Phase.READY, song = song, durationSec = song.durationSec), "지민", Headset.NONE, SingActions())
        }
    }

    @Test fun singPlaying() {
        val song = app.songs.builtin.first { it.id == "twinkle" }
        val t = 6.6
        // 실제로 부른 것처럼 약간 흔들리는 궤적 (중간에 한 번 음을 놓침)
        val trace = generateSequence(t - 2.4) { it + 0.023 }.takeWhile { it < t }.mapNotNull { time ->
            val n = song.notes.firstOrNull { time >= it.startSec + 0.05 && time < it.endSec - 0.04 } ?: return@mapNotNull null
            val off = if (time in 5.0..5.5) 1.6 else 0.08 * sin(time * 9)
            val sung = n.midi + off
            TracePoint(time, foldToOctaveOf(sung, n.midi.toDouble()), off < 0.75)
        }.toList()
        shot("07_sing_playing") {
            SingContent(
                SingUiState(
                    phase = Phase.PLAYING, song = song, t = t, durationSec = song.durationSec,
                    liveScore = 88, combo = 7, judgement = Judgement.PERFECT, judgementSeq = 1, trace = trace,
                ),
                "지민", Headset.WIRED, SingActions(),
            )
        }
    }

    @Test fun result() {
        val id = runBlocking {
            app.db.scores().insert(
                ScoreEntity(
                    songId = "twinkle", songTitle = "Twinkle Twinkle Little Star", playerName = "지민",
                    total = 92, pitch = 94, rhythm = 90, stability = 88, ranked = true, keyShift = 0,
                    createdAt = System.currentTimeMillis(), perfect = 31, great = 8, good = 2, miss = 1, maxCombo = 26,
                ),
            )
        }
        shot("08_result", waitForText = "다음 차례로") { ResultScreen(id, party = true, {}, { _, _ -> }, {}, {}) }
    }

    @Test fun ranking() {
        seedScores()
        shot("09_ranking", waitForText = "수아") { RankingScreen({}) }
    }

    @Test fun settings() = shot("10_settings") { SettingsScreen({}) }
}
