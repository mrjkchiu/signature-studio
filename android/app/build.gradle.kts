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
    // 固定 debug 签名：CI 默认每次生成随机 debug keystore，导致覆盖安装失败（必须卸载）
    // 这里用仓库内固定 keystore（PKCS12），从此可以原地升级
    signingConfigs {
        getByName("debug") {
            storeFile = file("debug-fixed.keystore")
            storeType = "PKCS12"
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
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
