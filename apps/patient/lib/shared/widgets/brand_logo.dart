import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';

/// Lockup da marca: quadrado primário com ícone de pulso + "PostCare Pro".
class BrandLogo extends StatelessWidget {
  final double size;
  const BrandLogo({super.key, this.size = 40});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: AppColors.primary600,
            borderRadius: BorderRadius.circular(size * 0.28),
          ),
          child: Icon(Icons.monitor_heart_outlined, color: Colors.white, size: size * 0.55),
        ),
        SizedBox(width: size * 0.25),
        Text.rich(
          TextSpan(
            children: const [
              TextSpan(text: 'PostCare'),
              TextSpan(text: ' Pro', style: TextStyle(color: AppColors.primary600)),
            ],
            style: TextStyle(fontWeight: FontWeight.w700, fontSize: size * 0.5),
          ),
        ),
      ],
    );
  }
}
