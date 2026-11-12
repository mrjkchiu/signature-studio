package com.dsh.signature

import android.Manifest
import android.app.Activity
import android.content.ContentValues
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.util.Base64
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.webkit.WebViewAssetLoader

/**
 * WebView 包壳：
 * - WebViewAssetLoader 把 assets/www 挂到 https://appassets.androidplatform.net，
 *   页面里的 fetch()/FontFace 才能工作，且不需要 INTERNET 权限；
 * - AndroidApp.saveImage() 让页面把 PNG 交给原生写入相册
 *   （WebView 里 <a download> 不会触发任何下载，这就是"保存没反应"的原因）。
 */
class MainActivity : Activity() {

    private lateinit var web: WebView

    private val assetLoader by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Android 9 及以下写相册需要运行时权限；10+ 用 MediaStore 不需要
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
            checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE), 1)
        }

        web = WebView(this)
        web.setBackgroundColor(0xFF121214.toInt())
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = false
            builtInZoomControls = false
            displayZoomControls = false
        }
        web.addJavascriptInterface(Bridge(), "AndroidApp")
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)
        }
        web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html")
        setContentView(web)
    }

    /** 供网页调用：把 dataURL 的 PNG 存进相册 */
    inner class Bridge {
        @JavascriptInterface
        fun saveImage(dataUrl: String, fileName: String): String {
            return try {
                val idx = dataUrl.indexOf("base64,")
                if (idx < 0) return "invalid-data"
                val bytes = Base64.decode(dataUrl.substring(idx + 7), Base64.DEFAULT)
                val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    ?: return "decode-failed"

                val values = ContentValues().apply {
                    put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
                    put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                    put(MediaStore.Images.Media.DATE_ADDED, System.currentTimeMillis() / 1000)
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/签名工坊")
                        put(MediaStore.Images.Media.IS_PENDING, 1)
                    }
                }
                val resolver = contentResolver
                val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
                    ?: return "insert-failed"
                resolver.openOutputStream(uri)?.use { out ->
                    bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                } ?: return "open-failed"
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    values.clear()
                    values.put(MediaStore.Images.Media.IS_PENDING, 0)
                    resolver.update(uri, values, null, null)
                }
                toastOnUi("已保存到相册")
                "ok"
            } catch (e: Exception) {
                toastOnUi("保存失败：" + (e.message ?: "未知错误"))
                "err:" + (e.message ?: "unknown")
            }
        }
    }

    private fun toastOnUi(msg: String) {
        runOnUiThread { Toast.makeText(this, msg, Toast.LENGTH_SHORT).show() }
    }

    @Deprecated("WebView 内部返回键")
    override fun onBackPressed() {
        if (this::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed()
    }
}
