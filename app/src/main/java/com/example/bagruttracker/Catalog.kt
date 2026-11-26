package com.example.bagruttracker

/**
 * pages: question -> page number.
 *  - gool compilation (url == null): the PRINTED page number at the bottom of the page
 *    (the app adds the "page offset" from settings, default 4 = cover + intro + 2 contents pages).
 *  - any other PDF: the real page number in that file.
 * first/last: range the viewer allows (last hides the final-answers pages).
 * estimated: layout guessed, not read from the file - fix with "שמור עמוד".
 */
data class PdfRef(
    val url: String?,
    val pages: Map<String, Int>,
    val first: Int,
    val last: Int?,
    val estimated: Boolean = false,
    val answers: Map<String, AnsRef> = emptyMap()
)

/** Where the "final answers" of one question are: printed page + vertical range of the page (per-mille, 0..1000). */
data class AnsRef(val page: Int, val top: Int, val bottom: Int)

data class Exam(
    val id: String,
    val title: String,
    val source: String,
    val keys: List<String>,
    val defaultUrl: String? = null,
    val pdf: PdfRef? = null,
    val solutionUrl: String? = null      // full solution / marking guide (מחוון), if one was found
)

const val SRC_BAGRUT = "בגרויות"
const val SRC_ARCH = "ארכימדס"
const val SRC_MARIAN = "מריאן"
val SOURCES = listOf(SRC_BAGRUT, SRC_ARCH, SRC_MARIAN)

val SHORT = listOf("1a", "1b", "1c", "1d")
val LONG = (2..8).map { it.toString() }
val ALL_KEYS = SHORT + LONG

val QUESTION_NAMES = mapOf(
    "1a" to "1א · שאלה קצרה", "1b" to "1ב · שאלה קצרה",
    "1c" to "1ג · שאלה קצרה", "1d" to "1ד · שאלה קצרה",
    "2" to "2 · סדרות", "3" to "3 · הסתברות", "4" to "4 · גאומטריה",
    "5" to "5 · טריגו במישור", "6" to "6 · חקירה", "7" to "7 · חקירה",
    "8" to "8 · בעיית קיצון"
)

val SHORT_NAMES = mapOf(
    "1a" to "1א", "1b" to "1ב", "1c" to "1ג", "1d" to "1ד",
    "2" to "2", "3" to "3", "4" to "4", "5" to "5", "6" to "6", "7" to "7", "8" to "8"
)

private const val MEYDA = "https://meyda.education.gov.il/sheeloney_bagrut"

// Same order as your sheet (row 1 = index 0)
private val bagrutTitles = listOf(
    "חורף תשפ\"ז 2027", "ב תשפ\"ו 2026", "קיץ תשפ\"ו 2026", "חורף תשפ\"ו 2026",
    "ב תשפ\"ה 2025", "קיץ תשפ\"ה 2025", "חורף תשפ\"ה 2025",
    "ב' תשפ\"ד 2024", "קיץ תשפ\"ד 2024", "חורף תשפ\"ד 2024",
    "ב' תשפ\"ג 2023", "קיץ תשפ\"ג 2023", "חורף תשפ\"ג 2023",
    "ב' תשפ\"ב 2022", "קיץ תשפ\"ב 2022", "חורף נבצרים תשפ\"ב 2022", "חורף תשפ\"ב 2022",
    "קיץ מיוחד תשפ\"א 2021", "ב' תשפ\"א 2021", "חורף מאוחר תשפ\"א 2021",
    "חורף נבצרים תשפ\"א 2021", "חורף תשפ\"א 2021",
    "ב' תש\"ף 2020", "קיץ תש\"ף 2020", "חורף תש\"ף 2020",
    "ב' תשע\"ט 2019", "קיץ תשע\"ט 2019", "חורף תשע\"ט 2019",
    "ב' תשע\"ח 2018", "קיץ תשע\"ח 2018", "חורף תשע\"ח 2018",
    "ב' תשע\"ז 2017", "קיץ תשע\"ז 2017", "חורף תשע\"ז 2017",
    "ב' תשע\"ו 2016", "קיץ תשע\"ו 2016", "חורף תשע\"ו 2016"
)

// ---- helpers to describe where each question is inside the gool compilation ----
// 11 numbers = printed pages of: 1a 1b 1c 1d 2 3 4 5 6 7 8
// (printed page = PDF page - 4: cover + intro + 2 contents pages). Every page below was read from the PDF
// (version 102026), not guessed.
private fun goolKnown(first: Int, last: Int, vararg p: Int) =
    PdfRef(null, ALL_KEYS.zip(p.toList()).toMap(), first, last)

private fun ministry(url: String) =
    PdfRef(url, ALL_KEYS.associateWith { 1 }, 1, null, estimated = true)

// index in bagrutTitles -> location in "שאלון 571 - בגרויות משנים קודמות" (2021-2026)
private val goolPdf: Map<Int, PdfRef> = mapOf(
    20 to goolKnown(1, 4, 1, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4),   // חורף 2021 נבצרים (7 שאלות בלבד)
    18 to goolKnown(14, 20, 14, 14, 15, 15, 16, 16, 17, 17, 18, 19, 20),   // קיץ 2021 מועד ב'
    17 to goolKnown(6, 11, 6, 6, 7, 7, 8, 8, 9, 9, 10, 11, 11),   // קיץ 2021 מועד א'
    16 to goolKnown(22, 27, 22, 22, 23, 23, 24, 24, 25, 25, 26, 27, 27),   // חורף 2022 מועד א'
    15 to goolKnown(29, 34, 29, 29, 29, 30, 30, 31, 32, 32, 33, 34, 34),   // חורף 2022 מועד ב'
    14 to goolKnown(36, 41, 36, 36, 37, 37, 38, 38, 39, 39, 40, 41, 41),   // קיץ 2022 מועד א'
    13 to goolKnown(43, 48, 43, 43, 43, 44, 45, 46, 46, 47, 47, 48, 48),   // קיץ 2022 מועד ב'
    12 to goolKnown(50, 55, 50, 50, 51, 51, 52, 52, 53, 53, 54, 55, 55),   // חורף 2023
    11 to goolKnown(57, 62, 57, 57, 58, 58, 59, 59, 60, 60, 61, 62, 62),   // קיץ 2023 מועד א'
    10 to goolKnown(71, 76, 71, 71, 72, 72, 73, 73, 74, 74, 75, 75, 76),   // קיץ 2023 מועד ב'
    9 to goolKnown(78, 84, 78, 78, 79, 80, 80, 81, 82, 82, 83, 84, 84),   // חורף 2024
    8 to goolKnown(86, 92, 86, 86, 87, 87, 88, 88, 89, 89, 90, 91, 92),   // קיץ 2024 מועד א'
    7 to goolKnown(94, 100, 94, 94, 95, 95, 96, 96, 97, 97, 98, 99, 100),   // קיץ 2024 מועד ב'
    6 to goolKnown(102, 108, 102, 102, 103, 103, 104, 105, 105, 106, 107, 108, 108),   // חורף 2025
    5 to goolKnown(110, 117, 110, 110, 111, 112, 113, 114, 114, 115, 116, 117, 117),   // קיץ 2025 מועד א'
    4 to goolKnown(119, 124, 119, 119, 120, 120, 121, 121, 122, 122, 123, 124, 124),   // קיץ 2025 מועד ב'
    3 to goolKnown(126, 131, 126, 126, 127, 127, 128, 128, 129, 129, 130, 131, 131),   // חורף 2026
    2 to goolKnown(134, 139, 134, 134, 135, 135, 136, 136, 137, 137, 138, 139, 139),   // קיץ 2026 מועד א'
    1 to goolKnown(141, 146, 141, 141, 142, 142, 143, 143, 144, 144, 145, 146, 146)   // קיץ 2026 מועד ב'
)

// Final answers ("תשובות סופיות") inside the compilation: for 1a 1b 1c 1d 2..8 (1a-1d share the question-1 block).
// Read from the PDF; null = that exam has no answer for it in the file.
private val goolAnswers: Map<Int, List<AnsRef?>> = mapOf(
    20 to listOf(AnsRef(5,122,184), AnsRef(5,122,184), AnsRef(5,122,184), AnsRef(5,122,184), AnsRef(5,177,226), AnsRef(5,219,289), AnsRef(5,281,378), AnsRef(5,371,415), AnsRef(5,408,567), AnsRef(5,560,950), null),
    18 to listOf(AnsRef(21,122,191), AnsRef(21,122,191), AnsRef(21,122,191), AnsRef(21,122,191), AnsRef(21,184,274), AnsRef(21,267,297), AnsRef(21,290,348), AnsRef(21,341,444), AnsRef(21,437,693), AnsRef(21,686,855), AnsRef(21,848,950)),
    17 to listOf(AnsRef(12,122,223), AnsRef(12,122,223), AnsRef(12,122,223), AnsRef(12,122,223), AnsRef(12,216,303), AnsRef(12,295,346), AnsRef(12,339,379), AnsRef(12,372,445), AnsRef(12,438,950), AnsRef(13,91,550), AnsRef(13,543,950)),
    16 to listOf(AnsRef(28,122,213), AnsRef(28,122,213), AnsRef(28,122,213), AnsRef(28,122,213), AnsRef(28,206,282), AnsRef(28,275,327), AnsRef(28,320,369), AnsRef(28,362,445), AnsRef(28,438,627), AnsRef(28,620,853), AnsRef(28,846,950)),
    15 to listOf(AnsRef(35,122,176), AnsRef(35,122,176), AnsRef(35,122,176), AnsRef(35,122,176), AnsRef(35,169,208), AnsRef(35,201,249), AnsRef(35,242,283), AnsRef(35,276,307), AnsRef(35,300,489), AnsRef(35,482,802), AnsRef(35,795,950)),
    14 to listOf(AnsRef(42,122,215), AnsRef(42,122,215), AnsRef(42,122,215), AnsRef(42,122,215), AnsRef(42,208,256), AnsRef(42,249,331), AnsRef(42,324,408), AnsRef(42,401,446), AnsRef(42,439,559), AnsRef(42,551,825), AnsRef(42,818,950)),
    13 to listOf(AnsRef(49,122,176), AnsRef(49,122,176), AnsRef(49,122,176), AnsRef(49,122,176), AnsRef(49,169,250), AnsRef(49,243,324), AnsRef(49,317,388), AnsRef(49,381,450), AnsRef(49,443,588), AnsRef(49,581,850), AnsRef(49,843,950)),
    12 to listOf(AnsRef(56,130,227), AnsRef(56,130,227), AnsRef(56,130,227), AnsRef(56,130,227), AnsRef(56,219,267), AnsRef(56,260,307), AnsRef(56,299,338), AnsRef(56,331,372), AnsRef(56,364,546), AnsRef(56,539,776), AnsRef(56,769,950)),
    11 to listOf(AnsRef(63,122,213), AnsRef(63,122,213), AnsRef(63,122,213), AnsRef(63,122,213), AnsRef(63,206,259), AnsRef(63,252,300), AnsRef(63,293,342), AnsRef(63,335,405), AnsRef(63,398,668), AnsRef(63,661,877), AnsRef(63,870,950)),
    10 to listOf(AnsRef(76,474,680), AnsRef(76,474,680), AnsRef(76,474,680), AnsRef(76,474,680), AnsRef(76,673,712), AnsRef(76,704,753), AnsRef(76,746,809), AnsRef(76,802,950), AnsRef(77,88,262), AnsRef(77,255,455), AnsRef(77,448,950)),
    9 to listOf(AnsRef(85,122,226), AnsRef(85,122,226), AnsRef(85,122,226), AnsRef(85,122,226), AnsRef(85,218,280), AnsRef(85,273,313), AnsRef(85,306,336), AnsRef(85,329,411), AnsRef(85,403,621), AnsRef(85,613,861), AnsRef(85,854,950)),
    8 to listOf(AnsRef(92,417,523), AnsRef(92,417,523), AnsRef(92,417,523), AnsRef(92,417,523), AnsRef(92,516,597), AnsRef(92,590,682), AnsRef(92,675,723), AnsRef(92,716,811), AnsRef(92,804,950), AnsRef(93,343,571), AnsRef(93,564,950)),
    7 to listOf(AnsRef(100,607,791), AnsRef(100,607,791), AnsRef(100,607,791), AnsRef(100,607,791), AnsRef(100,783,824), AnsRef(100,817,870), AnsRef(100,863,950), AnsRef(101,87,160), AnsRef(101,153,220), AnsRef(101,212,486), AnsRef(101,479,950)),
    6 to listOf(AnsRef(109,122,380), AnsRef(109,122,380), AnsRef(109,122,380), AnsRef(109,122,380), AnsRef(109,373,462), AnsRef(109,455,503), AnsRef(109,496,546), AnsRef(109,538,583), AnsRef(109,576,669), AnsRef(109,662,821), AnsRef(109,814,950)),
    5 to listOf(AnsRef(118,122,276), AnsRef(118,122,276), AnsRef(118,122,276), AnsRef(118,122,276), AnsRef(118,269,317), AnsRef(118,310,351), AnsRef(118,343,382), AnsRef(118,375,415), AnsRef(118,408,554), AnsRef(118,547,736), AnsRef(118,728,950)),
    4 to listOf(AnsRef(125,122,280), AnsRef(125,122,280), AnsRef(125,122,280), AnsRef(125,122,280), AnsRef(125,273,321), AnsRef(125,314,362), AnsRef(125,355,407), AnsRef(125,399,443), AnsRef(125,436,584), AnsRef(125,577,712), AnsRef(125,705,950)),
    3 to listOf(AnsRef(132,122,273), AnsRef(132,122,273), AnsRef(132,122,273), AnsRef(132,122,273), AnsRef(132,266,341), AnsRef(132,334,374), AnsRef(132,367,429), AnsRef(132,422,471), AnsRef(132,464,950), AnsRef(133,87,406), AnsRef(133,398,950)),
    2 to listOf(AnsRef(140,122,230), AnsRef(140,122,230), AnsRef(140,122,230), AnsRef(140,122,230), AnsRef(140,223,277), AnsRef(140,270,319), AnsRef(140,312,353), AnsRef(140,346,387), AnsRef(140,379,500), AnsRef(140,493,615), AnsRef(140,608,950)),
    1 to listOf(AnsRef(147,122,263), AnsRef(147,122,263), AnsRef(147,122,263), AnsRef(147,122,263), AnsRef(147,256,337), AnsRef(147,330,377), AnsRef(147,370,407), AnsRef(147,400,750), AnsRef(147,743,950), null, null)
)

private fun PdfRef.withAnswers(l: List<AnsRef?>?): PdfRef =
    if (l == null) this
    else copy(answers = ALL_KEYS.zip(l).mapNotNull { (k, a) -> a?.let { k to it } }.toMap())

// Full solutions (מחוונים) that were found and checked. Others: use "ערוך קישורים" in the exam screen.
private val solutionUrls = mapOf(
    14 to "https://files.geva.co.il/geva_website/uploads/2022/05/35571-%D7%A4%D7%AA%D7%A8%D7%95%D7%9F-%D7%9E%D7%95%D7%A2%D7%93-%D7%90.pdf",   // קיץ 2022 מועד א' (Geva)
    3 to "https://ankori.co.il/wp-content/uploads/2026/01/2026w_math_5pts_35571_a.pdf"                           // חורף 2026 (Ankori)
)

// Official Ministry PDFs that are not inside the compilation (confirmed to exist)
private val ministryUrls = mapOf(
    21 to "$MEYDA/2021/1/HEB/35581.pdf",
    23 to "$MEYDA/2020/6/HEB/35581.pdf",
    24 to "$MEYDA/2020/1/HEB/35581.pdf",
    25 to "$MEYDA/2019/8/HEB/35581.pdf",
    27 to "$MEYDA/2019/1/HEB/35581.pdf",
    29 to "$MEYDA/2018/6/HEB/35581.pdf"
)

// "open in browser" links (editable per exam inside the app)
private val webUrls = mapOf(
    3 to "$MEYDA/2026/1/HEB/35571.PDF",
    12 to "$MEYDA/2023/1/HEB/35571.PDF",
    14 to "$MEYDA/2022/6/HEB/35571.PDF"
)

val CATALOG: List<Exam> =
    bagrutTitles.mapIndexed { i, t ->
        Exam(
            id = "bagrut_$i", title = t, source = SRC_BAGRUT,
            keys = when {
                i == 20 -> SHORT + LONG.filter { it != "8" }   // only 7 questions in that exam
                i < 25 -> SHORT + LONG
                else -> LONG
            },
            defaultUrl = webUrls[i] ?: ministryUrls[i],
            pdf = goolPdf[i]?.withAnswers(goolAnswers[i]) ?: ministryUrls[i]?.let { ministry(it) },
            solutionUrl = solutionUrls[i]
        )
    } +
    (1..24).map { Exam("arch_$it", "מבחן $it", SRC_ARCH, SHORT + LONG) } +
    (1..40).map { Exam("marian_$it", "מבחן $it", SRC_MARIAN, LONG) }

// ---- stats ----
fun counts(
    exams: List<Exam>,
    p: Map<Pair<String, String>, Progress>,
    only: String? = null
): Pair<Int, Int> {
    val cells = exams.flatMap { e -> e.keys.filter { only == null || it == only }.map { e.id to it } }
    return cells.count { p[it]?.done == true } to cells.size
}

fun percent(exams: List<Exam>, p: Map<Pair<String, String>, Progress>, only: String? = null): Int {
    val (done, total) = counts(exams, p, only)
    return if (total == 0) 0 else done * 100 / total
}

/** questions of this exam that are not finished yet */
fun remainingKeys(exam: Exam, p: Map<Pair<String, String>, Progress>): List<String> =
    exam.keys.filter { p[exam.id to it]?.done != true }

/**
 * The page (printed page for the compilation, real page for other PDFs) a question opens on:
 *  1. the page you saved with "שמור עמוד" for this question, else
 *  2. the catalog page, moved by the correction learned from your other saves in the same (estimated) exam.
 */
fun pageFor(
    exam: Exam, ref: PdfRef, key: String,
    p: Map<Pair<String, String>, Progress>, shifts: Map<String, Int>
): Int {
    p[exam.id to key]?.pdfPage?.let { return it }
    val base = ref.pages[key] ?: ref.first
    val delta = if (ref.estimated && ref.url == null) shifts[exam.id] ?: 0 else 0
    return maxOf(1, base + delta)
}
