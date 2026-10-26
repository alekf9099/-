package com.melodeal

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onRoot
import com.github.takahirom.roborazzi.captureRoboImage
import com.melodeal.data.db.ScoreEntity
import com.melodeal.scoring.Judgement
import com.melodeal.scoring.foldToOctaveOf
import com.melodeal.ui.AppViewModel
import com.melodeal.ui.home.HomeScreen
import com.melodeal.ui.party.PartyQueueScreen
import com.melodeal.ui.party.PartySetupScreen
import com.melodeal.ui.ranking.RankingScreen
import com.melodeal.ui.result.ResultScreen
import com.melodeal.ui.settings.SettingsScreen
import com.melodeal.ui.sing.Headset
import com.melodeal.ui.sing.Phase
import com.melodeal.ui.sing.SingActions
import com.melodeal.ui.sing.SingContent
import com.melodeal.ui.sing.SingUiState
import com.melodeal.ui.sing.TracePoint
import com.melodeal.ui.songs.SongListScreen
import com.melodeal.community.FeedSort
import com.melodeal.ui.community.ChatListScreen
import com.melodeal.ui.community.ChatRoomScreen
import com.melodeal.ui.community.FeedContent
import com.melodeal.ui.community.FeedScreen
import com.melodeal.ui.community.FeedUiState
import com.melodeal.ui.community.ProfileScreen
import com.melodeal.ui.community.TrackDetailScreen
import com.melodeal.data.song.Genre
import com.melodeal.studio.Composition
import com.melodeal.studio.MelodyNote
import com.melodeal.studio.MusicKey
import com.melodeal.studio.PitchFrame
import com.melodeal.ui.studio.EditorActions
import com.melodeal.ui.studio.EditorContent
import com.melodeal.ui.studio.EditorUiState
import com.melodeal.ui.studio.RecPhase
import com.melodeal.ui.studio.RecordContent
import com.melodeal.ui.studio.RecordUiState
import com.melodeal.ui.theme.Neon
import com.melodeal.ui.theme.MelodealTheme
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

    private val app get() = RuntimeEnvironment.getApplication() as MelodealApp

    /** waitForText: DB에서 비동기로 읽어오는 화면은 이 글자가 나타날 때까지 기다린 뒤 찍는다 */
    private fun shot(name: String, waitForText: String? = null, content: @Composable () -> Unit) {
        compose.setContent {
            MelodealTheme { Box(Modifier.fillMaxSize().background(Neon.Bg)) { content() } }
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

    /** 트윙클 멜로디로 만든 예시 곡 */
    private fun sampleComposition(): Composition {
        val twinkle = app.songs.builtin.first { it.id == "twinkle" }
        val spb = twinkle.secPerBeat
        return Composition(
            title = "밤하늘 산책", genre = Genre.BALLAD, bpm = 84, key = MusicKey(0, false),
            notes = twinkle.notes.take(14).map { MelodyNote(it.startSec / spb, it.durSec / spb, it.midi) },
            lyrics = "반짝이는 별빛 아래 우리\n함께 걷던 그 밤 길을",
        ).autoChords()
    }

    private fun seedCompositions(): Long = runBlocking {
        val base = sampleComposition()
        app.studio.create(base.copy(title = "퇴근길 멜로디", genre = Genre.POP, notes = base.notes.map { it.copy(midi = it.midi + 2) }))
        app.studio.create(base.copy(title = "주말 아침", genre = Genre.ACOUSTIC))
        app.studio.create(base)
    }

    @Test fun home_empty() = shot("01_home_empty") { HomeScreen({}, {}, {}, {}) }

    @Test fun home() {
        seedScores()
        seedCompositions()
        shot("02_home", waitForText = "밤하늘 산책") { HomeScreen({}, {}, {}, {}) }
    }

    @Test fun recordSetup() = shot("11_record_setup") { RecordContent(RecordUiState(genre = Genre.BALLAD, bpm = 84)) }

    @Test fun recording() {
        val notes = sampleComposition().notes
        val spb = 60.0 / 84
        val t = 5.2
        val trace = generateSequence(0.0) { it + 0.023 }.takeWhile { it < t }.map { time ->
            val n = notes.firstOrNull { time >= it.startBeat * spb + 0.04 && time < it.endBeat * spb - 0.07 }
            PitchFrame(time, n?.let { it.midi + 0.3 + 0.12 * sin(time * 12) })
        }.toList()
        shot("12_recording") { RecordContent(RecordUiState(phase = RecPhase.RECORDING, genre = Genre.BALLAD, bpm = 84, t = t, trace = trace, level = 0.6f)) }
    }

    @Test fun editor() {
        val c = sampleComposition()
        shot("13_editor") {
            EditorContent(EditorUiState(loaded = true, comp = c, selected = 4, canUndo = true), EditorActions())
        }
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

    private fun signedIn() = runBlocking { app.community.saveProfile("흥얼러", "출근길에 멜로디를 만들어요") }

    @Test fun feed() {
        signedIn()
        shot("14_feed", waitForText = "밤하늘 산책") { FeedScreen({}, {}) }
    }

    @Test fun feedWeekly() {
        signedIn()
        shot("15_feed_weekly", waitForText = "새벽 세 시") {
            FeedContent(FeedUiState(sort = FeedSort.WEEKLY, tracks = runBlocking { app.community.feed(FeedSort.WEEKLY) }, loading = false))
        }
    }

    @Test fun trackDetail() {
        signedIn()
        runBlocking { app.community.rate("t1", 4); app.community.setLiked("t1", true) }
        shot("16_track_detail", waitForText = "후렴 멜로디") { TrackDetailScreen("t1", {}, {}, {}, {}, {}) }
    }

    @Test fun otherProfile() {
        signedIn()
        shot("17_profile_other", waitForText = "여름 끝자락") { ProfileScreen("u1", onBack = {}, onOpenTrack = {}, onChat = {}) }
    }

    @Test fun chatRoom() {
        signedIn()
        val conv = runBlocking {
            val c = app.community.openConversation("u2", "t2")
            app.community.sendMessage(c, "환승역에서 너무 좋아요! 혹시 이 곡에 가사를 붙여봐도 될까요?")
            c
        }
        Thread.sleep(1600) // 체험 모드 자동 답장 대기
        shot("18_chat_room", waitForText = "자동 답장") { ChatRoomScreen(conv, {}, {}, {}) }
    }

    @Test fun chatList() {
        signedIn()
        runBlocking {
            val c = app.community.openConversation("u2", "t2")
            app.community.sendMessage(c, "가사 붙여봐도 될까요?")
            app.community.openConversation("u4", "t4")
        }
        Thread.sleep(1600)
        shot("19_chat_list", waitForText = "퇴근길피아노") { ChatListScreen {} }
    }

    @Test fun nicknameSetup() = shot("20_nickname_setup", waitForText = "환영해요") { FeedScreen({}, {}) }

    @Test fun settings() = shot("10_settings") { SettingsScreen({}) }
}
