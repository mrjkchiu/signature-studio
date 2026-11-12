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
    // 资源已被 copy-assets.sh 预压缩，避免 APK 里再压一遍
    androidResources {
        noCompress += listOf("ttf", "otf", "json")
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.11.0")
}
