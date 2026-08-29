plugins { id("com.android.application") }

android {
  namespace = "dev.missioncontrol.companion"
  compileSdk = 35
  defaultConfig {
    applicationId = "dev.missioncontrol.companion"
    minSdk = 33
    targetSdk = 35
    versionCode = 1
    versionName = "0.1.0"
  }
  buildTypes { release { isMinifyEnabled = true; proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro") } }
}
