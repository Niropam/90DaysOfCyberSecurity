plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.niropam.omnicalculator"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.niropam.omnicalculator"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
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

    // The web app is the single source of truth: copy it from ../calculator-app
    // into the APK's assets at build time so the two never drift apart.
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("webassets"))
}

val copyWebAssets by tasks.registering(Copy::class) {
    from(rootProject.layout.projectDirectory.file("../calculator-app/index.html"))
    into(layout.buildDirectory.dir("webassets"))
}
tasks.named("preBuild") {
    dependsOn(copyWebAssets)
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}
