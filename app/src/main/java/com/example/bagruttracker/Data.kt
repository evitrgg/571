package com.example.bagruttracker

import androidx.room.*
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlinx.coroutines.flow.Flow

@Entity(primaryKeys = ["examId", "qKey"])
data class Progress(
    val examId: String,
    val qKey: String,              // "1a","1b","1c","1d","2".."8"
    val done: Boolean = false,
    val note: String = "",
    val imagePath: String? = null, // your own photo of the question
    val pdfPage: Int? = null       // page you saved for this question in the PDF viewer
)

@Entity
data class ExamLink(@PrimaryKey val examId: String, val url: String)

/** Correction (in pages) for an exam whose page layout was only estimated. Learned from "שמור עמוד". */
@Entity
data class ExamShift(@PrimaryKey val examId: String, val delta: Int)

@Dao
interface TrackerDao {
    @Query("SELECT * FROM Progress") fun progress(): Flow<List<Progress>>
    @Query("SELECT * FROM ExamLink") fun links(): Flow<List<ExamLink>>
    @Query("SELECT * FROM ExamShift") fun shifts(): Flow<List<ExamShift>>

    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun ensure(p: Progress)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsertLink(l: ExamLink)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsertShift(s: ExamShift)

    @Query("UPDATE Progress SET done = 1 - done WHERE examId = :e AND qKey = :k")
    suspend fun flip(e: String, k: String)

    @Query("UPDATE Progress SET note = :n WHERE examId = :e AND qKey = :k")
    suspend fun setNote(e: String, k: String, n: String)

    @Query("UPDATE Progress SET imagePath = :path WHERE examId = :e AND qKey = :k")
    suspend fun setImage(e: String, k: String, path: String?)

    @Query("UPDATE Progress SET pdfPage = :page WHERE examId = :e AND qKey = :k")
    suspend fun setPdfPage(e: String, k: String, page: Int?)
}

@Database(entities = [Progress::class, ExamLink::class, ExamShift::class], version = 3, exportSchema = false)
abstract class AppDb : RoomDatabase() {
    abstract fun dao(): TrackerDao

    companion object {
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE Progress ADD COLUMN pdfPage INTEGER")
            }
        }
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS `ExamShift` (`examId` TEXT NOT NULL, `delta` INTEGER NOT NULL, PRIMARY KEY(`examId`))")
            }
        }
    }
}
