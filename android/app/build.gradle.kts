plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.dsh.signature"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.dsh.signature"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
    }
    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    // 注意：不要对 ttf/json 设 noCompress——那会让 APK 变大（字体和笔顺 JSON 都能压缩）
}

dependencies {
    implementation("androidx.webkit:webkit:1.11.0")
}
