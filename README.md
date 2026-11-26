# BagrutTracker (מעקב בגרויות 571)

Kotlin + Jetpack Compose + Room + Coil. PDF pages are rendered with Android's built-in PdfRenderer.

Open in Android Studio: File > Open > select this BagrutTracker folder, wait for Gradle sync, press Run.

- Home: total %, % per source, % per question type, list of exams. Light + dark theme (follows the phone).
- Tap a **question type** on the home screen -> every exam in that source for that question, with
  all / remaining / done filters. Tap the big percent to jump straight to what is left.
- Tap the **percent badge on an exam card** -> sheet with the questions still left in that exam; tap one to open it.
- Exam screen: tap a question -> the question page opens (from the PDF) with a "סיימתי" button.
  Inside the viewer you can jump between the exam's questions (chips on top) and type a page number (tap "עמוד N").
- Exams 2021-2026 come from the big 571 PDF (downloaded once to the phone). Settings -> change the link,
  the page offset, or pick a PDF from the phone.
- Wrong page? Flip to the right page and press "שמור עמוד" - it is remembered for that question, and for exams
  whose layout is only an estimate the same correction is applied to the other questions of that exam.
- Exams without a PDF (Archimedes, Marian, older exams): attach your own photo in "הערות / תמונה".

Page map: every question of the 2021-2026 exams (all 18 exams in the compilation, version 102026) was mapped from the
PDF itself. Printed page = PDF page - 4, so "page offset" in settings must stay 4.

Answers & solutions:
- In the question viewer press "הצג תשובה" -> the final answers ("תשובות סופיות") of that question from the same PDF
  (cropped to that question; "כל העמוד" shows the whole page). 1א-1ד share the question-1 block.
  Kept inside the app, works offline once the PDF is on the phone. (קיץ 2026 מועד ב': the file has no answers for 7-8.)
- "מחוון מלא" opens a full solution if one is known for that exam (currently קיץ 2022 מועד א' - Geva, חורף 2026 - Ankori);
  otherwise "חפש מחוון" runs a web search. Paste your own link per exam under "קישורים".

No Android Studio? Build the APK online: upload this folder's contents to a GitHub repository.
The workflow in .github/workflows/build.yml builds app-debug.apk (Actions tab -> latest run -> Artifacts).
