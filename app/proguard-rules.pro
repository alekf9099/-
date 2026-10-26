# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-keepclassmembers class com.tuneup.data.song.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
