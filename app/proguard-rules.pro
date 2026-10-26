# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-keepclassmembers class com.melodeal.data.song.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
