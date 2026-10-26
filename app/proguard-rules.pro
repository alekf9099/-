# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-keepclassmembers class com.singturn.data.song.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
