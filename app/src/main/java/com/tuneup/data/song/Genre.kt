package com.tuneup.data.song

import kotlinx.serialization.Serializable

/** 반주 스타일. 같은 멜로디·코드라도 장르에 따라 악기 구성과 리듬 패턴이 달라진다. */
@Serializable
enum class Genre(val label: String, val description: String, val defaultBpm: Int) {
    BALLAD("발라드", "잔잔한 피아노 아르페지오", 72),
    POP("팝", "피아노 코드와 경쾌한 드럼", 100),
    DANCE("댄스", "쿵쿵 울리는 4비트와 신스", 124),
    ACOUSTIC("어쿠스틱", "통기타 스트럼과 카혼", 90),
}
