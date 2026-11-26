package com.example.bagruttracker

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.lifecycle.viewmodel.compose.viewModel

sealed interface Route {
    object Home : Route
    data class ExamR(val exam: Exam) : Route
    data class TypeR(val key: String, val source: String) : Route
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            BagrutTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    val vm: MainVM = viewModel()
                    var route by remember { mutableStateOf<Route>(Route.Home) }
                    var question by remember { mutableStateOf<Pair<Exam, String>?>(null) }
                    // kept here so the home screen keeps its tab + scroll position when you come back
                    var tab by rememberSaveable { mutableStateOf(0) }
                    val homeList = rememberLazyListState()

                    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                        when (val r = route) {
                            Route.Home -> HomeScreen(
                                vm, tab, { tab = it }, homeList,
                                onOpenExam = { route = Route.ExamR(it) },
                                onOpenType = { k, s -> route = Route.TypeR(k, s) },
                                onQuestion = { e, k -> question = e to k }
                            )
                            is Route.ExamR -> {
                                BackHandler { route = Route.Home }
                                ExamScreen(r.exam, vm, { route = Route.Home }) { e, k -> question = e to k }
                            }
                            is Route.TypeR -> {
                                BackHandler { route = Route.Home }
                                TypeScreen(r.key, r.source, vm, { route = Route.Home }) { e, k -> question = e to k }
                            }
                        }
                        question?.let { (e, k) -> QuestionHost(e, k, vm) { question = null } }
                    }
                }
            }
        }
    }
}
