package com.example.bagruttracker

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** The PDF you gave me: "שאלון 571 - בגרויות משנים קודמות" (exams 2021-2026). Editable in the app's settings. */
const val GOOL_URL =
    "https://bagrut.gool.co.il/books/%D7%A9%D7%90%D7%9C%D7%95%D7%9F%20571%20-%20%D7%91%D7%92%D7%A8%D7%95%D7%99%D7%95%D7%AA%20%D7%9E%D7%A9%D7%A0%D7%99%D7%9D%20%D7%A7%D7%95%D7%93%D7%9E%D7%95%D7%AA.pdf?ver=0"

class Settings(ctx: Context) {
    private val p = ctx.getSharedPreferences("settings", Context.MODE_PRIVATE)
    var goolUrl: String
        get() = p.getString("goolUrl", GOOL_URL) ?: GOOL_URL
        set(v) { p.edit().putString("goolUrl", v).apply() }
    /** number of PDF pages before the printed page "1" (cover + intro + 2 contents pages = 4) */
    var pageOffset: Int
        get() = p.getInt("pageOffset4", 4)   // new key: the old default (3) was one page off
        set(v) { p.edit().putInt("pageOffset4", v).apply() }
}

object PdfFiles {
    fun fileFor(ctx: Context, url: String) =
        File(ctx.filesDir, "pdf_${url.hashCode().toUInt().toString(16)}.pdf")

    /** Downloads once and keeps the file on the phone. */
    suspend fun ensure(ctx: Context, url: String): File = withContext(Dispatchers.IO) {
        val f = fileFor(ctx, url)
        if (f.exists() && f.length() > 0) return@withContext f
        val tmp = File(f.path + ".part")
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 15_000
        conn.readTimeout = 60_000
        conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Android) BagrutTracker")
        try {
            if (conn.responseCode !in 200..299) error("HTTP ${conn.responseCode}")
            conn.inputStream.use { input -> tmp.outputStream().use { input.copyTo(it) } }
        } finally {
            conn.disconnect()
        }
        if (tmp.length() == 0L) error("empty file")
        tmp.renameTo(f)
        f
    }
}

class PdfDoc(file: File) {
    private val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    private val renderer = PdfRenderer(pfd)
    private val lock = Mutex() // PdfRenderer allows one open page at a time

    val pageCount: Int get() = renderer.pageCount

    suspend fun render(index: Int, widthPx: Int): Bitmap? = lock.withLock {
        withContext(Dispatchers.Default) {
            if (index < 0 || index >= renderer.pageCount) return@withContext null
            val page = renderer.openPage(index)
            try {
                val h = (widthPx.toFloat() * page.height / page.width).toInt()
                val bmp = Bitmap.createBitmap(widthPx, h, Bitmap.Config.ARGB_8888)
                bmp.eraseColor(Color.WHITE)
                page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                bmp
            } finally {
                page.close()
            }
        }
    }

    fun close() {
        renderer.close()
        pfd.close()
    }
}
