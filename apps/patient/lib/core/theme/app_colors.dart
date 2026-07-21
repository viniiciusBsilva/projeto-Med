import 'package:flutter/material.dart';

/// Tokens de cor do PostCare Pro — espelham docs/DESIGN_SYSTEM.md (§2).
/// Mantenha os hexes em sincronia com as CSS vars do painel (apps/panel/app/globals.css).
class AppColors {
  AppColors._();

  // Primário (azul)
  static const primary50 = Color(0xFFEFF6FF);
  static const primary100 = Color(0xFFDBEAFE);
  static const primary500 = Color(0xFF3B82F6);
  static const primary600 = Color(0xFF2563EB); // base
  static const primary700 = Color(0xFF1D4ED8);

  // Semânticos
  static const success = Color(0xFF16A34A);
  static const successSoft = Color(0xFFDCFCE7);
  static const warning = Color(0xFFF59E0B);
  static const warningSoft = Color(0xFFFEF3C7);
  static const danger = Color(0xFFDC2626);
  static const dangerSoft = Color(0xFFFEE2E2);

  // Neutros — light
  static const bgLight = Color(0xFFF8FAFC);
  static const surfaceLight = Color(0xFFFFFFFF);
  static const surface2Light = Color(0xFFF1F5F9);
  static const borderLight = Color(0xFFE2E8F0);
  static const textStrongLight = Color(0xFF0F172A);
  static const textLight = Color(0xFF475569);
  static const textMuted = Color(0xFF94A3B8);

  // Neutros — dark
  static const bgDark = Color(0xFF0B1120);
  static const surfaceDark = Color(0xFF1E293B);
  static const surface2Dark = Color(0xFF0F172A);
  static const borderDark = Color(0xFF334155);
  static const textStrongDark = Color(0xFFF1F5F9);
  static const textDark = Color(0xFFCBD5E1);
}
