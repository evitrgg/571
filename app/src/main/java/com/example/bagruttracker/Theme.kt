package com.example.bagruttracker

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

private val LightColors = lightColorScheme(
    primary = Color(0xFF4F46E5), onPrimary = Color.White,
    primaryContainer = Color(0xFFE0E7FF), onPrimaryContainer = Color(0xFF1E1B4B),
    secondary = Color(0xFF059669), onSecondary = Color.White,          // "done" green
    secondaryContainer = Color(0xFFD1FAE5), onSecondaryContainer = Color(0xFF064E3B),
    background = Color(0xFFF7F7FB), onBackground = Color(0xFF14142B),
    surface = Color.White, onSurface = Color(0xFF14142B),
    surfaceVariant = Color(0xFFECEBF5), onSurfaceVariant = Color(0xFF5B5B75),
    outline = Color(0xFFC3C2D6), outlineVariant = Color(0xFFE3E2EF)
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFA5B4FC), onPrimary = Color(0xFF1E1B4B),
    primaryContainer = Color(0xFF312E81), onPrimaryContainer = Color(0xFFE0E7FF),
    secondary = Color(0xFF34D399), onSecondary = Color(0xFF022C22),
    secondaryContainer = Color(0xFF064E3B), onSecondaryContainer = Color(0xFFD1FAE5),
    background = Color(0xFF0F0F17), onBackground = Color(0xFFEDEDF7),
    surface = Color(0xFF181824), onSurface = Color(0xFFEDEDF7),
    surfaceVariant = Color(0xFF262636), onSurfaceVariant = Color(0xFFB4B4CC),
    outline = Color(0xFF4B4B63), outlineVariant = Color(0xFF33334A)
)

private val BaseType = Typography()
private val AppTypography = Typography(
    headlineSmall = BaseType.headlineSmall.copy(fontWeight = FontWeight.Bold),
    titleLarge = BaseType.titleLarge.copy(fontWeight = FontWeight.Bold),
    titleMedium = BaseType.titleMedium.copy(fontWeight = FontWeight.SemiBold),
    titleSmall = BaseType.titleSmall.copy(fontWeight = FontWeight.SemiBold)
)

private val AppShapes = Shapes(
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(24.dp)
)

/** One accent colour per question type (used on the bars / dots). */
val TYPE_COLORS: Map<String, Color> = mapOf(
    "1a" to Color(0xFF14B8A6), "1b" to Color(0xFF06B6D4), "1c" to Color(0xFF0EA5E9), "1d" to Color(0xFF3B82F6),
    "2" to Color(0xFF6366F1), "3" to Color(0xFF8B5CF6), "4" to Color(0xFFD946EF), "5" to Color(0xFFEC4899),
    "6" to Color(0xFFF97316), "7" to Color(0xFFF59E0B), "8" to Color(0xFFEF4444)
)

@Composable
fun BagrutTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors,
        typography = AppTypography,
        shapes = AppShapes,
        content = content
    )
}
