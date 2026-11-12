package com.dsh.signature

import android.content.ContentValues
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import android.provider.MediaStore
import android.util.Base64
import java.io.File
import java.io.FileInputStream

/**
 * 把逐帧 JPEG 编成 H.264 MP4。
 * 用 MediaCodec 的字节缓冲输入（YUV420），不依赖 EGL/GL，手机上更省事。
 */
class VideoEncoder(private val activity: MainActivity) {

    private var codec: MediaCodec? = null
    private var muxer: MediaMuxer? = null
    private var trackIndex = -1
    private var muxerStarted = false
    private var colorFormat = MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible
    private var width = 0
    private var height = 0
    private var fps = 30
    private var frameIndex = 0
    private var yuv: ByteArray = ByteArray(0)
    private var outputFile: File? = null

    fun begin(w: Int, h: Int, fpsIn: Int): String = try {
        width = w - (w % 2)
        height = h - (h % 2)
        fps = fpsIn.coerceIn(12, 60)
        frameIndex = 0
        muxerStarted = false
        trackIndex = -1

        val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height)
        format.setInteger(MediaFormat.KEY_BIT_RATE, (width * height * fps * 0.09).toInt().coerceIn(1_500_000, 12_000_000))
        format.setInteger(MediaFormat.KEY_FRAME_RATE, fps)
        format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)

        // 选一个可用的 YUV420 格式
        val codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
        val caps = codec.codecInfo.getCapabilitiesForType(MediaFormat.MIMETYPE_VIDEO_AVC)
        val supported = caps.colorFormats.toList()
        colorFormat = when {
            supported.contains(MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible) -> MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible
            supported.contains(MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Planar) -> MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Planar
            supported.contains(MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar) -> MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar
            else -> return "err:no-yuv420"
        }
        format.setInteger(MediaFormat.KEY_COLOR_FORMAT, colorFormat)
        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        codec.start()
        this.codec = codec

        val f = File(activity.cacheDir, "signature-${System.currentTimeMillis()}.mp4")
        muxer = MediaMuxer(f.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        outputFile = f
        yuv = ByteArray(width * height * 3 / 2)
        "ok"
    } catch (e: Exception) {
        release()
        "err:" + (e.message ?: "begin")
    }

    fun push(jpegDataUrl: String): String = try {
        val codec = codec ?: return "err:not-started"
        val idx = jpegDataUrl.indexOf("base64,")
        val bytes = Base64.decode(jpegDataUrl.substring(idx + 7), Base64.DEFAULT)
        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return "err:decode"
        val scaled = if (bmp.width != width || bmp.height != height) Bitmap.createScaledBitmap(bmp, width, height, true) else bmp
        toYuv(scaled)

        val inIndex = codec.dequeueInputBuffer(20_000)
        if (inIndex >= 0) {
            val pts = frameIndex * 1_000_000L / fps
            val image = try { codec.getInputImage(inIndex) } catch (e: Exception) { null }
            if (image != null) {
                toImage(image, scaled)
                codec.queueInputBuffer(inIndex, 0, imageSize(scaled), pts, 0)
            } else {
                val buf = codec.getInputBuffer(inIndex)!!
                buf.clear()
                buf.put(yuv)
                codec.queueInputBuffer(inIndex, 0, yuv.size, pts, 0)
            }
            frameIndex++
        }
        drain(false)
        "ok"
    } catch (e: Exception) {
        "err:" + (e.message ?: "push")
    }

    fun finish(): String = try {
        val codec = codec ?: return "err:not-started"
        val inIndex = codec.dequeueInputBuffer(20_000)
        if (inIndex >= 0) {
            codec.queueInputBuffer(inIndex, 0, 0, frameIndex * 1_000_000L / fps, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
        }
        drain(true)
        codec.stop(); codec.release(); this.codec = null
        muxer?.let { if (muxerStarted) it.stop(); it.release() }
        muxer = null
        val f = outputFile ?: return "err:no-file"
        val uri = publishToGallery(f)
        f.delete()
        "ok:" + uri
    } catch (e: Exception) {
        release()
        "err:" + (e.message ?: "finish")
    }

    fun cancel() {
        release()
        outputFile?.delete()
        outputFile = null
    }

    private fun release() {
        try { codec?.stop() } catch (e: Exception) {}
        try { codec?.release() } catch (e: Exception) {}
        codec = null
        try { if (muxerStarted) muxer?.stop() } catch (e: Exception) {}
        try { muxer?.release() } catch (e: Exception) {}
        muxer = null
        muxerStarted = false
    }

    private fun imageSize(bmp: Bitmap): Int = width * height * 3 / 2

    /** 用 MediaCodec 的 Image API 直接写 YUV 平面（自动适配 I420/NV12 的行/像素步长） */
    private fun toImage(image: android.media.Image, bmp: Bitmap) {
        val w = width; val h = height
        val argb = IntArray(w * h)
        bmp.getPixels(argb, 0, w, 0, 0, w, h)
        val yPlane = image.planes[0]
        val uPlane = image.planes[1]
        val vPlane = image.planes[2]
        val yBuf = yPlane.buffer
        val uBuf = uPlane.buffer
        val vBuf = vPlane.buffer
        val yRow = yPlane.rowStride
        val yPix = yPlane.pixelStride
        val uRow = uPlane.rowStride
        val uPix = uPlane.pixelStride
        val vRow = vPlane.rowStride
        val vPix = vPlane.pixelStride
        for (j in 0 until h) {
            for (i in 0 until w) {
                val c = argb[j * w + i]
                val r = (c shr 16) and 0xff
                val g = (c shr 8) and 0xff
                val b = c and 0xff
                val y = (((66 * r + 129 * g + 25 * b + 128) shr 8) + 16)
                yBuf.put(j * yRow + i * yPix, y.toByte())
                if (j % 2 == 0 && i % 2 == 0) {
                    val u = (((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128)
                    val v = (((112 * r - 94 * g - 18 * b + 128) shr 8) + 128)
                    val uvRow = j / 2
                    val uvCol = i / 2
                    uBuf.put(uvRow * uRow + uvCol * uPix, u.toByte())
                    vBuf.put(uvRow * vRow + uvCol * vPix, v.toByte())
                }
            }
        }
    }

    private fun drain(endOfStream: Boolean) {
        val codec = codec ?: return
        val info = MediaCodec.BufferInfo()
        var idle = 0
        while (true) {
            val outIndex = codec.dequeueOutputBuffer(info, if (endOfStream) 10_000 else 0)
            if (outIndex == MediaCodec.INFO_TRY_AGAIN_LATER) {
                if (!endOfStream) return
                idle++
                if (idle > 300) return      // 编码器迟迟不给 EOS 时兜底退出
                continue
            }
            idle = 0
            if (outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                if (!muxerStarted) {
                    trackIndex = muxer!!.addTrack(codec.outputFormat)
                    muxer!!.start()
                    muxerStarted = true
                }
            } else if (outIndex >= 0) {
                val buf = codec.getOutputBuffer(outIndex)!!
                if (info.size > 0 && muxerStarted) {
                    buf.position(info.offset)
                    buf.limit(info.offset + info.size)
                    muxer!!.writeSampleData(trackIndex, buf, info)
                }
                codec.releaseOutputBuffer(outIndex, false)
                if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
            }
        }
    }

    /** Bitmap → YUV420（按选到的格式写 I420 / NV12） */
    private fun toYuv(bmp: Bitmap) {
        val w = width; val h = height
        val argb = IntArray(w * h)
        bmp.getPixels(argb, 0, w, 0, 0, w, h)
        val frame = w * h
        val half = frame / 4
        val nv12 = colorFormat == MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420SemiPlanar
        var yPos = 0
        var uPos = frame
        var vPos = frame + half
        var uvPos = frame
        for (j in 0 until h) {
            for (i in 0 until w) {
                val c = argb[j * w + i]
                val r = (c shr 16) and 0xff
                val g = (c shr 8) and 0xff
                val b = c and 0xff
                yuv[yPos++] = (((66 * r + 129 * g + 25 * b + 128) shr 8) + 16).toByte()
                if (j % 2 == 0 && i % 2 == 0) {
                    val u = (((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128).toByte()
                    val v = (((112 * r - 94 * g - 18 * b + 128) shr 8) + 128).toByte()
                    if (nv12) {
                        yuv[uvPos++] = u
                        yuv[uvPos++] = v
                    } else {
                        yuv[uPos++] = u
                        yuv[vPos++] = v
                    }
                }
            }
        }
    }

    private fun publishToGallery(file: File): Uri? {
        val values = ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, "签名视频_${System.currentTimeMillis()}.mp4")
            put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
            put(MediaStore.Video.Media.DATE_ADDED, System.currentTimeMillis() / 1000)
        }
        val resolver = activity.contentResolver
        val uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values) ?: return null
        resolver.openOutputStream(uri)?.use { out ->
            FileInputStream(file).use { input -> input.copyTo(out, 64 * 1024) }
        }
        return uri
    }
}
