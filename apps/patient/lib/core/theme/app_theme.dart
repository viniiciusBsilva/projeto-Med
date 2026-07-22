import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'app_colors.dart';

/// Tema claro/escuro do app do paciente. Raio 12px (md) e Inter, como no design system.
class AppTheme {
  AppTheme._();

  static const _radius = 12.0;

  static ThemeData light() => _base(
        brightness: Brightness.light,
        background: AppColors.bgLight,
        surface: AppColors.surfaceLight,
        onSurface: AppColors.textStrongLight,
        outline: AppColors.borderLight,
      );

  static ThemeData dark() => _base(
        brightness: Brightness.dark,
        background: AppColors.bgDark,
        surface: AppColors.surfaceDark,
        onSurface: AppColors.textStrongDark,
        outline: AppColors.borderDark,
      );

  static ThemeData _base({
    required Brightness brightness,
    required Color background,
    required Color surface,
    required Color onSurface,
    required Color outline,
  }) {
    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.primary600,
      brightness: brightness,
    ).copyWith(
      primary: AppColors.primary600,
      surface: surface,
      outline: outline,
      error: AppColors.danger,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: background,
      textTheme: GoogleFonts.interTextTheme(
        brightness == Brightness.dark
            ? ThemeData.dark().textTheme
            : ThemeData.light().textTheme,
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16), // lg
          side: BorderSide(color: outline),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.primary600,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(_radius),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(_radius),
          borderSide: BorderSide(color: outline),
        ),
      ),
    );
  }
}
