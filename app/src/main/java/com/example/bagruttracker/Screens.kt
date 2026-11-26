@file:OptIn(ExperimentalMaterial3Api::class)

package com.example.bagruttracker

import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import java.io.File

private val cardShape = RoundedCornerShape(18.dp)

/** key under which a hand-entered solution link of an exam is stored (same table as the question links) */
private fun solKey(exam: Exam) = "sol:${exam.id}"

private fun solutionFor(exam: Exam, links: Map<String, String>): String? =
    links[solKey(exam)]?.takeIf { it.isNotBlank() } ?: exam.solutionUrl

private fun solutionSearchUrl(exam: Exam) = "https://www.google.com/search?q=" +
    Uri.encode("פתרון מלא מחוון שאלון 571 ${exam.title} בגרות מתמטיקה 5 יחידות")

private fun cropBitmap(b: Bitmap, a: AnsRef): Bitmap {
    val y0 = (b.height * a.top / 1000).coerceIn(0, b.height - 1)
    val y1 = (b.height * a.bottom / 1000).coerceIn(y0 + 1, b.height)
    return Bitmap.createBitmap(b, 0, y0, b.width, y1 - y0)
}

@Composable
private fun appCardColors(container: Color? = null) =
    CardDefaults.cardColors(containerColor = container ?: MaterialTheme.colorScheme.surface)

// ------------------------------------------------------------------ HOME
@Composable
fun HomeScreen(
    vm: MainVM,
    tab: Int, onTab: (Int) -> Unit,
    listState: LazyListState,
    onOpenExam: (Exam) -> Unit,
    onOpenType: (String, String) -> Unit,   // (question key, source)
    onQuestion: (Exam, String) -> Unit
) {
    val cs = MaterialTheme.colorScheme
    val p by vm.progress.collectAsState()
    var showSettings by remember { mutableStateOf(false) }
    var remainingFor by remember { mutableStateOf<Exam?>(null) }
    val source = SOURCES[tab]
    val exams = CATALOG.filter { it.source == source }
    val (doneAll, totalAll) = counts(CATALOG, p)
    val pctAll = percent(CATALOG, p)

    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        // ---- big header
        item {
            Box(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp))
                    .background(Brush.linearGradient(listOf(Color(0xFF4F46E5), Color(0xFF7C3AED))))
                    .padding(20.dp)
            ) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "מעקב בגרויות 571", color = Color.White,
                            style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f)
                        )
                        IconButton(onClick = { showSettings = true }) {
                            Icon(Icons.Default.Settings, contentDescription = "הגדרות", tint = Color.White)
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        ProgressRing(pctAll, 104.dp, 11.dp, Color.White, Color.White.copy(alpha = 0.25f)) {
                            Text("$pctAll%", color = Color.White, style = MaterialTheme.typography.titleLarge)
                        }
                        Spacer(Modifier.width(18.dp))
                        Column {
                            Text("התקדמות כללית", color = Color.White.copy(alpha = 0.85f))
                            Text("$doneAll / $totalAll", color = Color.White, style = MaterialTheme.typography.headlineSmall)
                            Text("שאלות · נותרו ${totalAll - doneAll}", color = Color.White.copy(alpha = 0.85f))
                        }
                    }
                }
            }
        }

        // ---- source selector
        item {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
                    .background(cs.surfaceVariant).padding(4.dp)
            ) {
                SOURCES.forEachIndexed { i, s ->
                    val sel = tab == i
                    Column(
                        Modifier.weight(1f).clip(RoundedCornerShape(12.dp))
                            .background(if (sel) cs.surface else Color.Transparent)
                            .clickable { onTab(i) }
                            .padding(vertical = 8.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            s, color = if (sel) cs.primary else cs.onSurfaceVariant,
                            fontWeight = if (sel) FontWeight.Bold else FontWeight.Medium
                        )
                        Text(
                            "${percent(CATALOG.filter { it.source == s }, p)}%",
                            style = MaterialTheme.typography.labelSmall, color = cs.onSurfaceVariant
                        )
                    }
                }
            }
        }

        // ---- question types
        item {
            Column(Modifier.padding(top = 6.dp)) {
                Text("סוגי שאלות · $source", style = MaterialTheme.typography.titleMedium)
                Text(
                    "לחץ על סוג שאלה כדי לראות את ההשלמות שלך בו",
                    style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant
                )
            }
        }
        val keys = ALL_KEYS.filter { k -> exams.any { k in it.keys } }
        items(keys, key = { "type_$it" }) { k ->
            val (d, t) = counts(exams, p, k)
            val pct = percent(exams, p, k)
            val color = TYPE_COLORS[k] ?: cs.primary
            Card(
                Modifier.fillMaxWidth().clickable { onOpenType(k, source) },
                shape = cardShape, colors = appCardColors(),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {
                Column(Modifier.padding(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(12.dp).clip(CircleShape).background(color))
                        Spacer(Modifier.width(10.dp))
                        Text(QUESTION_NAMES[k] ?: k, Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                        Text("$pct%", color = color, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.height(8.dp))
                    PBar(pct / 100f, color)
                    Text(
                        "$d מתוך $t הושלמו",
                        style = MaterialTheme.typography.labelSmall, color = cs.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
            }
        }

        // ---- exams
        item {
            Column(Modifier.padding(top = 10.dp)) {
                Text("המבחנים", style = MaterialTheme.typography.titleMedium)
                Text(
                    "לחץ על האחוז כדי לראות מה נותר במבחן",
                    style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant
                )
            }
        }
        items(exams, key = { it.id }) { exam ->
            val (d, t) = counts(listOf(exam), p)
            val pct = percent(listOf(exam), p)
            val complete = d == t
            Card(
                Modifier.fillMaxWidth().clickable { onOpenExam(exam) },
                shape = cardShape, colors = appCardColors(),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {
                Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(exam.title, style = MaterialTheme.typography.titleSmall)
                        Spacer(Modifier.height(8.dp))
                        PBar(pct / 100f, if (complete) cs.secondary else cs.primary)
                        Text(
                            "$d מתוך $t שאלות",
                            style = MaterialTheme.typography.labelSmall, color = cs.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    // clickable percent -> remaining questions of this exam
                    Column(
                        Modifier.clip(RoundedCornerShape(14.dp))
                            .background(if (complete) cs.secondaryContainer else cs.primaryContainer)
                            .clickable(enabled = !complete) { remainingFor = exam }
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            if (complete) "✓" else "$pct%", fontWeight = FontWeight.Bold,
                            color = if (complete) cs.onSecondaryContainer else cs.onPrimaryContainer
                        )
                        if (!complete) {
                            Text(
                                "נותרו ${t - d}", style = MaterialTheme.typography.labelSmall,
                                color = cs.onPrimaryContainer
                            )
                        }
                    }
                }
            }
        }
    }

    remainingFor?.let { ex ->
        RemainingSheet(
            ex, p,
            onPick = { k -> remainingFor = null; onQuestion(ex, k) },
            onClose = { remainingFor = null }
        )
    }
    if (showSettings) SettingsDialog(vm) { showSettings = false }
}

/** Bottom sheet: the questions of one exam that are not done yet. */
@Composable
fun RemainingSheet(
    exam: Exam, p: Map<Pair<String, String>, Progress>,
    onPick: (String) -> Unit, onClose: () -> Unit
) {
    val cs = MaterialTheme.colorScheme
    val left = remainingKeys(exam, p)
    ModalBottomSheet(onDismissRequest = onClose) {
        Column(
            Modifier.padding(horizontal = 16.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                if (left.isEmpty()) "כל השאלות הושלמו 🎉" else "נותרו ${left.size} שאלות",
                style = MaterialTheme.typography.titleMedium
            )
            Text(exam.title, style = MaterialTheme.typography.bodyMedium, color = cs.onSurfaceVariant)
            left.forEach { k ->
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                        .background(cs.surfaceVariant).clickable { onPick(k) }
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(Modifier.size(10.dp).clip(CircleShape).background(TYPE_COLORS[k] ?: cs.primary))
                    Spacer(Modifier.width(10.dp))
                    Text(QUESTION_NAMES[k] ?: k, Modifier.weight(1f))
                    Text("פתח", color = cs.primary, style = MaterialTheme.typography.labelLarge)
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@Composable
fun SettingsDialog(vm: MainVM, onClose: () -> Unit) {
    var url by remember { mutableStateOf(vm.goolUrl) }
    var offset by remember { mutableStateOf(vm.pageOffset.toString()) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            vm.saveSettings(url, offset.toIntOrNull() ?: 4)
            vm.importPdf(uri)
            onClose()
        }
    }
    AlertDialog(
        onDismissRequest = onClose,
        title = { Text("קובץ השאלות (PDF)") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(url, { url = it }, minLines = 2,
                    label = { Text("קישור ל-PDF של שאלון 571") })
                OutlinedTextField(offset, { offset = it.filter(Char::isDigit) }, singleLine = true,
                    label = { Text("דפים לפני עמוד מס' 1 (כריכה + מבוא + תוכן = 4)") })
                TextButton(onClick = { vm.saveSettings(url, offset.toIntOrNull() ?: 4); vm.redownload(); onClose() }) {
                    Text("שמור והורד מחדש")
                }
                TextButton(onClick = { picker.launch(arrayOf("application/pdf")) }) {
                    Text("בחר קובץ PDF מהמכשיר")
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { vm.saveSettings(url, offset.toIntOrNull() ?: 4); onClose() }) { Text("שמור") }
        },
        dismissButton = { TextButton(onClick = onClose) { Text("ביטול") } }
    )
}

// ------------------------------------------------------------------ QUESTION TYPE (all exams, one question)
@Composable
fun TypeScreen(
    qKey: String, source: String, vm: MainVM,
    onBack: () -> Unit, onQuestion: (Exam, String) -> Unit
) {
    val cs = MaterialTheme.colorScheme
    val p by vm.progress.collectAsState()
    val exams = remember(qKey, source) { CATALOG.filter { it.source == source && qKey in it.keys } }
    var filter by remember { mutableIntStateOf(0) }   // 0 = all, 1 = remaining, 2 = done
    val (d, t) = counts(exams, p, qKey)
    val pct = percent(exams, p, qKey)
    val color = TYPE_COLORS[qKey] ?: cs.primary
    val shown = exams.filter { e ->
        val done = p[e.id to qKey]?.done == true
        when (filter) { 1 -> !done; 2 -> done; else -> true }
    }

    Column(Modifier.fillMaxSize()) {
        TopBar(QUESTION_NAMES[qKey] ?: qKey, source, onBack)
        LazyColumn(
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // summary: the percent is clickable -> shows what is left
            item {
                Card(
                    Modifier.fillMaxWidth(), shape = RoundedCornerShape(24.dp), colors = appCardColors(),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                ) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.clip(CircleShape).clickable { filter = 1 }) {
                            ProgressRing(pct, 88.dp, 10.dp, color, cs.surfaceVariant) {
                                Text("$pct%", style = MaterialTheme.typography.titleMedium)
                            }
                        }
                        Spacer(Modifier.width(16.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text("$d מתוך $t מבחנים הושלמו", style = MaterialTheme.typography.titleSmall)
                            Text(
                                if (t - d == 0) "סיימת את כולם 🎉" else "לחץ על האחוז כדי לראות את ${t - d} שנותרו",
                                style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant
                            )
                        }
                    }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Pill("הכל ($t)", filter == 0, { filter = 0 })
                    Pill("נותרו (${t - d})", filter == 1, { filter = 1 })
                    Pill("הושלמו ($d)", filter == 2, { filter = 2 })
                }
            }
            if (shown.isEmpty()) {
                item {
                    Text(
                        if (filter == 1) "אין שאלות שנותרו 🎉" else "עדיין אין כאן שאלות",
                        modifier = Modifier.fillMaxWidth().padding(24.dp), textAlign = TextAlign.Center,
                        color = cs.onSurfaceVariant
                    )
                }
            }
            items(shown, key = { it.id }) { e ->
                val pr = p[e.id to qKey]
                val done = pr?.done == true
                Card(
                    Modifier.fillMaxWidth().clickable { onQuestion(e, qKey) },
                    shape = cardShape,
                    colors = appCardColors(if (done) cs.secondaryContainer else null),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                ) {
                    Row(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                e.title, style = MaterialTheme.typography.titleSmall,
                                color = if (done) cs.onSecondaryContainer else cs.onSurface
                            )
                            val extra = buildList {
                                if (pr?.imagePath != null) add("יש תמונה")
                                if (!pr?.note.isNullOrBlank()) add("יש הערה")
                            }
                            if (extra.isNotEmpty()) {
                                Text(
                                    extra.joinToString(" · "), style = MaterialTheme.typography.bodySmall,
                                    color = cs.onSurfaceVariant
                                )
                            }
                        }
                        DoneButton(done) { vm.toggle(e.id, qKey) }
                    }
                }
            }
        }
    }
}

// ------------------------------------------------------------------ EXAM
@Composable
fun ExamScreen(exam: Exam, vm: MainVM, onBack: () -> Unit, onQuestion: (Exam, String) -> Unit) {
    val cs = MaterialTheme.colorScheme
    val p by vm.progress.collectAsState()
    val links by vm.links.collectAsState()
    val uriHandler = LocalUriHandler.current
    var editLink by remember { mutableStateOf(false) }
    var onlyLeft by remember { mutableStateOf(false) }

    val link = links[exam.id]?.takeIf { it.isNotBlank() } ?: exam.defaultUrl
    val solution = solutionFor(exam, links)
    val searchUrl = "https://www.google.com/search?q=" +
        Uri.encode("שאלון ${exam.title} מתמטיקה 5 יחידות 571")
    val (d, t) = counts(listOf(exam), p)
    val pct = percent(listOf(exam), p)
    val keys = if (onlyLeft) remainingKeys(exam, p) else exam.keys

    Column(Modifier.fillMaxSize()) {
        TopBar(exam.title, exam.source, onBack)
        LazyColumn(
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            item {
                Card(
                    Modifier.fillMaxWidth(), shape = RoundedCornerShape(24.dp), colors = appCardColors(),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                ) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            ProgressRing(pct, 72.dp, 8.dp, if (d == t) cs.secondary else cs.primary, cs.surfaceVariant) {
                                Text("$pct%", style = MaterialTheme.typography.titleSmall)
                            }
                            Spacer(Modifier.width(16.dp))
                            Column {
                                Text("$d מתוך $t שאלות", style = MaterialTheme.typography.titleSmall)
                                Text(
                                    if (d == t) "המבחן הושלם 🎉" else "נותרו ${t - d}",
                                    style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant
                                )
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(
                                onClick = { uriHandler.openUri(link ?: searchUrl) },
                                modifier = Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 8.dp)
                            ) { Text(if (link != null) "פתח שאלון" else "חפש שאלון", maxLines = 1) }
                            OutlinedButton(
                                onClick = { uriHandler.openUri(solution ?: solutionSearchUrl(exam)) },
                                modifier = Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 8.dp)
                            ) { Text(if (solution != null) "מחוון מלא" else "חפש מחוון", maxLines = 1) }
                            OutlinedButton(
                                onClick = { editLink = true },
                                modifier = Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 8.dp)
                            ) { Text("קישורים", maxLines = 1) }
                        }
                    }
                }
            }
            item {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Pill("הכל (${exam.keys.size})", !onlyLeft, { onlyLeft = false })
                        Pill("נותרו (${t - d})", onlyLeft, { onlyLeft = true })
                    }
                    if (exam.pdf != null) {
                        Text(
                            "לחץ על שאלה כדי לראות אותה",
                            style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant
                        )
                    }
                }
            }
            if (keys.isEmpty()) {
                item {
                    Text(
                        "כל השאלות במבחן הזה הושלמו 🎉",
                        modifier = Modifier.fillMaxWidth().padding(24.dp), textAlign = TextAlign.Center,
                        color = cs.onSurfaceVariant
                    )
                }
            }
            items(keys, key = { it }) { key ->
                val pr = p[exam.id to key]
                val done = pr?.done == true
                Card(
                    Modifier.fillMaxWidth().clickable { onQuestion(exam, key) },
                    shape = cardShape,
                    colors = appCardColors(if (done) cs.secondaryContainer else null),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                ) {
                    Row(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier.width(5.dp).height(36.dp).clip(RoundedCornerShape(50))
                                .background(TYPE_COLORS[key] ?: cs.primary)
                        )
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                QUESTION_NAMES[key] ?: key, style = MaterialTheme.typography.titleSmall,
                                color = if (done) cs.onSecondaryContainer else cs.onSurface
                            )
                            val extra = buildList {
                                if (pr?.imagePath != null) add("יש תמונה")
                                if (!pr?.note.isNullOrBlank()) add("יש הערה")
                            }
                            if (extra.isNotEmpty()) {
                                Text(
                                    extra.joinToString(" · "), style = MaterialTheme.typography.bodySmall,
                                    color = cs.onSurfaceVariant
                                )
                            }
                        }
                        DoneButton(done) { vm.toggle(exam.id, key) }
                    }
                }
            }
        }
    }

    if (editLink) {
        var text by remember { mutableStateOf(links[exam.id] ?: exam.defaultUrl ?: "") }
        var solText by remember { mutableStateOf(links[solKey(exam)] ?: exam.solutionUrl ?: "") }
        AlertDialog(
            onDismissRequest = { editLink = false },
            title = { Text("קישורים למבחן") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(text, { text = it }, singleLine = true,
                        label = { Text("קישור לשאלון (PDF / אתר)") })
                    OutlinedTextField(solText, { solText = it }, singleLine = true,
                        label = { Text("קישור למחוון / פתרון מלא") })
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    vm.setLink(exam.id, text); vm.setLink(solKey(exam), solText); editLink = false
                }) { Text("שמור") }
            },
            dismissButton = { TextButton(onClick = { editLink = false }) { Text("ביטול") } }
        )
    }
}

// ------------------------------------------------------------------ OPEN A QUESTION (from anywhere in the app)
@Composable
fun QuestionHost(exam: Exam, key: String, vm: MainVM, onClose: () -> Unit) {
    val ref = exam.pdf
    var current by remember(exam.id, key) { mutableStateOf(key) }
    var details by remember(exam.id, key) { mutableStateOf(ref == null) }
    if (!details && ref != null) {
        QuestionViewer(
            exam, ref, current, vm,
            onChangeKey = { current = it },
            onDetails = { details = true },
            onClose = onClose
        )
    } else {
        QuestionSheet(exam, current, vm) { if (ref != null) details = false else onClose() }
    }
}

// ------------------------------------------------------------------ QUESTION VIEWER (PDF page) + final answers
@Composable
fun QuestionViewer(
    exam: Exam, ref: PdfRef, qKey: String, vm: MainVM,
    onChangeKey: (String) -> Unit, onDetails: () -> Unit, onClose: () -> Unit
) {
    val cs = MaterialTheme.colorScheme
    val uriHandler = LocalUriHandler.current
    val p by vm.progress.collectAsState()
    val shifts by vm.shifts.collectAsState()
    val links by vm.links.collectAsState()
    val cur = p[exam.id to qKey]
    val done = cur?.done == true
    val shift = if (ref.url == null) vm.pageOffset else 0   // printed page -> real PDF page
    val solution = solutionFor(exam, links)

    // final answers (only for the compilation)
    val ans = ref.answers[qKey]
    val ansLo = ref.answers.values.minOfOrNull { it.page }
    val ansHi = ref.answers.values.maxOfOrNull { it.page }
    val hasAnswers = ansLo != null && ansHi != null
    var showAns by remember { mutableStateOf(false) }
    var cropAns by remember { mutableStateOf(true) }
    var aPage by remember(qKey) { mutableIntStateOf(ans?.page ?: ansLo ?: 1) }

    var page by remember(qKey) { mutableIntStateOf(pageFor(exam, ref, qKey, p, shifts)) }
    var docState by remember { mutableStateOf<Result<PdfDoc>?>(null) }
    var bitmap by remember { mutableStateOf<Bitmap?>(null) }
    var missing by remember { mutableStateOf(false) }
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    var attempt by remember { mutableIntStateOf(0) }
    var jump by remember { mutableStateOf(false) }
    val chips = rememberLazyListState()

    LaunchedEffect(attempt) { docState = null; docState = vm.openDoc(ref) }

    val doc = docState?.getOrNull()
    val total = doc?.pageCount
    // when the layout is only a guess, allow the whole file so you can always reach the right page
    val lo = if (ref.estimated) 1 else ref.first
    val hi = if (ref.estimated) (total?.minus(shift) ?: Int.MAX_VALUE)
             else minOf(ref.last ?: Int.MAX_VALUE, (total ?: Int.MAX_VALUE) - shift)
    val shown = if (showAns) aPage else page
    val curLo = if (showAns) (ansLo ?: 1) else lo
    val curHi = if (showAns) (ansHi ?: 1) else hi
    val noAnswerForThis = showAns && ans == null

    LaunchedEffect(shown, doc, showAns, cropAns, qKey) {
        if (doc == null) return@LaunchedEffect
        missing = false
        bitmap = null
        val b = doc.render(shown - 1 + shift, 1500)
        bitmap = if (b != null && showAns && cropAns && ans != null && aPage == ans.page) cropBitmap(b, ans) else b
        missing = b == null
        scale = 1f; offset = Offset.Zero
    }
    LaunchedEffect(qKey) {
        val i = exam.keys.indexOf(qKey)
        if (i >= 0) chips.animateScrollToItem(i)
    }

    val samePage = exam.keys.filter { it != qKey && pageFor(exam, ref, it, p, shifts) == page }
    val savedHere = cur?.pdfPage == page

    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), color = cs.background) {
            Column(Modifier.fillMaxSize()) {
                // title
                Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onClose) { Icon(Icons.Default.Close, contentDescription = "סגור") }
                    Column(Modifier.weight(1f)) {
                        Text(exam.title, style = MaterialTheme.typography.titleSmall)
                        Text(
                            (QUESTION_NAMES[qKey] ?: qKey) + if (showAns) " · תשובה סופית" else "",
                            style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant
                        )
                    }
                    if (hasAnswers) {
                        Pill(
                            if (showAns) "חזרה לשאלה" else "הצג תשובה", showAns,
                            { showAns = !showAns }, Modifier.padding(end = 8.dp)
                        )
                    }
                }
                // jump between the questions of this exam without leaving the viewer
                LazyRow(
                    state = chips,
                    contentPadding = PaddingValues(horizontal = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(exam.keys) { k ->
                        val d = p[exam.id to k]?.done == true
                        Pill((if (d) "✓ " else "") + (SHORT_NAMES[k] ?: k), k == qKey, { onChangeKey(k) })
                    }
                }
                Spacer(Modifier.height(8.dp))

                // page
                Box(Modifier.weight(1f).fillMaxWidth().clipToBounds(), contentAlignment = Alignment.Center) {
                    val bmp = bitmap
                    when {
                        docState?.isFailure == true -> Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.padding(24.dp)
                        ) {
                            Text("לא הצלחתי לטעון את ה-PDF.\nבדוק חיבור לאינטרנט, או בחר קובץ מהמכשיר בהגדרות.", textAlign = TextAlign.Center)
                            Spacer(Modifier.height(8.dp))
                            Button(onClick = { attempt++ }) { Text("נסה שוב") }
                        }
                        noAnswerForThis -> Text(
                            "אין תשובה סופית לשאלה הזו בקובץ.\nאפשר לדפדף בעמודי התשובות, או לפתוח מחוון.",
                            color = cs.onSurfaceVariant, textAlign = TextAlign.Center,
                            modifier = Modifier.padding(24.dp)
                        )
                        missing -> Text("העמוד הזה לא קיים בקובץ", color = cs.onSurfaceVariant)
                        bmp == null -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            CircularProgressIndicator()
                            if (doc == null) {
                                Spacer(Modifier.height(8.dp))
                                Text("טוען… (בפעם הראשונה הקובץ יורד למכשיר)")
                            }
                        }
                        else -> Image(
                            bitmap = bmp.asImageBitmap(),
                            contentDescription = "עמוד $shown",
                            contentScale = ContentScale.Fit,
                            modifier = Modifier
                                .fillMaxSize()
                                .pointerInput(Unit) {
                                    detectTransformGestures { _, pan, zoom, _ ->
                                        scale = (scale * zoom).coerceIn(1f, 5f)
                                        offset += pan
                                    }
                                }
                                .graphicsLayer(
                                    scaleX = scale, scaleY = scale,
                                    translationX = offset.x, translationY = offset.y
                                )
                        )
                    }
                }

                // hints
                if (!showAns && samePage.isNotEmpty()) {
                    Text(
                        "בעמוד הזה גם: " + samePage.joinToString(", ") { SHORT_NAMES[it] ?: it },
                        style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp)
                    )
                }
                if (!showAns && ref.estimated && cur?.pdfPage == null) {
                    Text(
                        "העמוד משוער. אם זו לא השאלה - דפדף ולחץ \"שמור עמוד\" (שאר שאלות המבחן יתוקנו לפי זה).",
                        style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp)
                    )
                }
                if (showAns && qKey in SHORT) {
                    Text(
                        "תשובות שאלה 1 (סעיפים א-ד) מופיעות יחד.",
                        style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp)
                    )
                }

                // page controls
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedButton(
                        onClick = { if (showAns) aPage-- else page-- },
                        enabled = shown > curLo
                    ) { Text("הקודם") }
                    Box(
                        Modifier.clip(RoundedCornerShape(10.dp)).clickable { jump = true }
                            .padding(horizontal = 8.dp, vertical = 6.dp)
                    ) { Text("עמוד $shown", fontWeight = FontWeight.SemiBold) }
                    OutlinedButton(
                        onClick = { if (showAns) aPage++ else page++ },
                        enabled = shown < curHi
                    ) { Text("הבא") }
                    Spacer(Modifier.weight(1f))
                    if (showAns) {
                        TextButton(onClick = { cropAns = !cropAns }, enabled = ans != null) {
                            Text(if (cropAns) "כל העמוד" else "רק התשובה")
                        }
                    } else {
                        TextButton(onClick = { vm.savePage(exam.id, qKey, page, ref) }, enabled = !savedHere) {
                            Text(if (savedHere) "✓ נשמר" else "שמור עמוד")
                        }
                    }
                }
                Row(
                    Modifier.fillMaxWidth().padding(start = 8.dp, end = 8.dp, bottom = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = { vm.toggle(exam.id, qKey) }, modifier = Modifier.weight(1f),
                        colors = if (done) ButtonDefaults.buttonColors(containerColor = cs.secondary, contentColor = cs.onSecondary)
                                 else ButtonDefaults.buttonColors()
                    ) {
                        Text(if (done) "✓ הושלם (לחץ לביטול)" else "סיימתי את השאלה")
                    }
                    if (showAns) {
                        OutlinedButton(onClick = { uriHandler.openUri(solution ?: solutionSearchUrl(exam)) }) {
                            Text(if (solution != null) "מחוון מלא" else "חפש מחוון")
                        }
                    } else {
                        OutlinedButton(onClick = onDetails) { Text("הערות / תמונה") }
                    }
                }
            }
        }
    }

    if (jump) {
        var text by remember { mutableStateOf(shown.toString()) }
        val maxPage = if (total != null) total - shift else null
        fun go() {
            text.toIntOrNull()?.let { n ->
                if (showAns && ansLo != null && ansHi != null) aPage = n.coerceIn(ansLo, ansHi)
                else page = n.coerceIn(1, maxPage ?: Int.MAX_VALUE)
            }
            jump = false
        }
        AlertDialog(
            onDismissRequest = { jump = false },
            title = { Text("מעבר לעמוד") },
            text = {
                OutlinedTextField(
                    text, { text = it.filter(Char::isDigit) }, singleLine = true,
                    label = { Text(if (ref.url == null) "מספר העמוד המודפס" else "מספר עמוד") }
                )
            },
            confirmButton = { TextButton(onClick = { go() }) { Text("עבור") } },
            dismissButton = { TextButton(onClick = { jump = false }) { Text("ביטול") } }
        )
    }
}

// ------------------------------------------------------------------ DETAILS SHEET (notes + your own photo)
@Composable
fun QuestionSheet(exam: Exam, key: String, vm: MainVM, onClose: () -> Unit) {
    val p by vm.progress.collectAsState()
    val cur = p[exam.id to key] ?: Progress(exam.id, key)
    var note by remember(key) { mutableStateOf(cur.note) }
    var zoom by remember { mutableStateOf(false) }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) vm.attachImage(exam.id, key, uri)
    }

    ModalBottomSheet(onDismissRequest = { vm.saveNote(exam.id, key, note); onClose() }) {
        Column(
            Modifier.padding(16.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text("${exam.title} · ${QUESTION_NAMES[key]}", style = MaterialTheme.typography.titleMedium)

            cur.imagePath?.let { path ->
                AsyncImage(
                    model = File(path),
                    contentDescription = "תמונת השאלה",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxWidth().heightIn(max = 320.dp).clip(RoundedCornerShape(14.dp)).clickable { zoom = true }
                )
                Text("לחץ על התמונה להגדלה", style = MaterialTheme.typography.bodySmall)
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = {
                    picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                }) { Text(if (cur.imagePath == null) "הוסף תמונת שאלה" else "החלף תמונה") }
                if (cur.imagePath != null) {
                    TextButton(onClick = { vm.removeImage(exam.id, key) }) { Text("הסר") }
                }
            }

            OutlinedTextField(
                value = note, onValueChange = { note = it },
                label = { Text("הערות") }, modifier = Modifier.fillMaxWidth()
            )
            Button(
                onClick = { vm.toggle(exam.id, key) }, modifier = Modifier.fillMaxWidth(),
                colors = if (cur.done) ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.secondary,
                    contentColor = MaterialTheme.colorScheme.onSecondary
                ) else ButtonDefaults.buttonColors()
            ) {
                Text(if (cur.done) "✓ הושלם (לחץ לביטול)" else "סיימתי את השאלה")
            }
            Spacer(Modifier.height(24.dp))
        }
    }

    val path = cur.imagePath
    if (zoom && path != null) ZoomDialog(path) { zoom = false }
}

@Composable
fun ZoomDialog(path: String, onClose: () -> Unit) {
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            AsyncImage(
                model = File(path),
                contentDescription = null,
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxSize()
                    .pointerInput(Unit) {
                        detectTransformGestures { _, pan, zoom, _ ->
                            scale = (scale * zoom).coerceIn(1f, 6f)
                            offset += pan
                        }
                    }
                    .graphicsLayer(
                        scaleX = scale, scaleY = scale,
                        translationX = offset.x, translationY = offset.y
                    )
            )
            TextButton(onClick = onClose, modifier = Modifier.align(Alignment.TopStart).padding(8.dp)) {
                Text("סגור", color = Color.White)
            }
        }
    }
}
