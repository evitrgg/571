package com.example.bagruttracker

import android.app.Application
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.room.Room
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.io.File

class MainVM(app: Application) : AndroidViewModel(app) {
    private val dao = Room.databaseBuilder(app, AppDb::class.java, "bagrut.db")
        .addMigrations(AppDb.MIGRATION_1_2, AppDb.MIGRATION_2_3)
        .build().dao()
    private val settings = Settings(app)
    private val docs = mutableMapOf<String, PdfDoc>()

    var goolUrl by mutableStateOf(settings.goolUrl)
        private set
    var pageOffset by mutableIntStateOf(settings.pageOffset)
        private set

    val progress: StateFlow<Map<Pair<String, String>, Progress>> =
        dao.progress().map { l -> l.associateBy { it.examId to it.qKey } }
            .stateIn(viewModelScope, SharingStarted.Eagerly, emptyMap())

    val links: StateFlow<Map<String, String>> =
        dao.links().map { l -> l.associate { it.examId to it.url } }
            .stateIn(viewModelScope, SharingStarted.Eagerly, emptyMap())

    val shifts: StateFlow<Map<String, Int>> =
        dao.shifts().map { l -> l.associate { it.examId to it.delta } }
            .stateIn(viewModelScope, SharingStarted.Eagerly, emptyMap())

    // ---------- progress ----------
    fun toggle(e: String, k: String) = viewModelScope.launch {
        dao.ensure(Progress(e, k)); dao.flip(e, k)
    }

    fun saveNote(e: String, k: String, note: String) = viewModelScope.launch {
        dao.ensure(Progress(e, k)); dao.setNote(e, k, note)
    }

    fun setLink(e: String, url: String) = viewModelScope.launch {
        dao.upsertLink(ExamLink(e, url.trim()))
    }

    /**
     * Remembers the page for this question. If the exam's layout was only estimated, the difference
     * between the estimate and the page you chose is also applied to the other questions of that exam.
     */
    fun savePage(e: String, k: String, page: Int, ref: PdfRef) = viewModelScope.launch {
        dao.ensure(Progress(e, k)); dao.setPdfPage(e, k, page)
        val base = ref.pages[k]
        if (ref.estimated && ref.url == null && base != null) {
            dao.upsertShift(ExamShift(e, page - base))
        }
    }

    // ---------- your own question photos ----------
    fun attachImage(e: String, k: String, uri: Uri) = viewModelScope.launch(Dispatchers.IO) {
        val ctx = getApplication<Application>()
        val old = progress.value[e to k]?.imagePath
        val out = File(ctx.filesDir, "q_${e}_${k}_${System.currentTimeMillis()}.jpg")
        ctx.contentResolver.openInputStream(uri)?.use { input ->
            out.outputStream().use { input.copyTo(it) }
        } ?: return@launch
        dao.ensure(Progress(e, k)); dao.setImage(e, k, out.absolutePath)
        old?.let { File(it).delete() }
    }

    fun removeImage(e: String, k: String) = viewModelScope.launch(Dispatchers.IO) {
        progress.value[e to k]?.imagePath?.let { File(it).delete() }
        dao.setImage(e, k, null)
    }

    // ---------- PDF ----------
    fun resolveUrl(ref: PdfRef): String = ref.url ?: goolUrl

    suspend fun openDoc(ref: PdfRef): Result<PdfDoc> = runCatching {
        val url = resolveUrl(ref)
        docs[url] ?: PdfDoc(PdfFiles.ensure(getApplication(), url)).also { docs[url] = it }
    }

    fun saveSettings(url: String, offset: Int) {
        settings.goolUrl = url.trim().ifEmpty { GOOL_URL }
        settings.pageOffset = offset
        goolUrl = settings.goolUrl
        pageOffset = offset
    }

    fun redownload() {
        docs.values.forEach { it.close() }
        docs.clear()
        PdfFiles.fileFor(getApplication(), goolUrl).delete()
    }

    /** use a PDF from the phone instead of downloading */
    fun importPdf(uri: Uri) = viewModelScope.launch(Dispatchers.IO) {
        val ctx = getApplication<Application>()
        docs.remove(goolUrl)?.close()
        val f = PdfFiles.fileFor(ctx, goolUrl)
        ctx.contentResolver.openInputStream(uri)?.use { input ->
            f.outputStream().use { input.copyTo(it) }
        }
    }

    override fun onCleared() {
        docs.values.forEach { it.close() }
        super.onCleared()
    }
}
