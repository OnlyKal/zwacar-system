import 'package:flutter/material.dart';

import '../theme.dart';

/// Logo ZwaCar : un « Z » dont la barre supérieure est un véhicule.
/// Même tracé que le Web Admin et les PDF (grille 64 × 64), couleurs unies.
class ZwaLogo extends StatelessWidget {
  final double size;
  const ZwaLogo({super.key, this.size = 38});

  @override
  Widget build(BuildContext context) => SizedBox.square(
    dimension: size,
    child: CustomPaint(painter: _LogoPainter()),
  );
}

class _LogoPainter extends CustomPainter {
  static const _ink = Color(0xFF16140F);

  static final Path _car = Path()
    ..fillType = PathFillType.evenOdd
    // Carrosserie
    ..moveTo(10, 25)
    ..lineTo(11.2, 20.4)
    ..quadraticBezierTo(12, 18.4, 14.6, 18.1)
    ..lineTo(22.4, 17.2)
    ..lineTo(28.4, 12.4)
    ..quadraticBezierTo(29.8, 11.3, 31.9, 11.3)
    ..lineTo(40.6, 11.3)
    ..quadraticBezierTo(42.8, 11.3, 44.4, 12.8)
    ..lineTo(49.2, 17.4)
    ..lineTo(51.6, 18)
    ..quadraticBezierTo(54, 18.7, 54, 21.2)
    ..lineTo(54, 25)
    ..close()
    // Vitre arrière
    ..moveTo(30.4, 14)
    ..lineTo(35.6, 14)
    ..lineTo(35.6, 17.4)
    ..lineTo(26.3, 17.4)
    ..lineTo(29.2, 14.6)
    ..quadraticBezierTo(29.7, 14, 30.4, 14)
    ..close()
    // Pare-brise
    ..moveTo(37.6, 14)
    ..lineTo(41, 14)
    ..quadraticBezierTo(42.1, 14, 42.9, 14.8)
    ..lineTo(45.6, 17.4)
    ..lineTo(37.6, 17.4)
    ..close();

  static final Path _z = Path()
    ..moveTo(43, 25)
    ..lineTo(54, 25)
    ..lineTo(25, 45.2)
    ..lineTo(54, 45.2)
    ..lineTo(54, 53)
    ..lineTo(10, 53)
    ..lineTo(10, 45.2)
    ..lineTo(39, 25)
    ..close();

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 64);
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        const Rect.fromLTWH(0, 0, 64, 64),
        const Radius.circular(6),
      ),
      Paint()..color = AppColors.gold,
    );
    final white = Paint()..color = Colors.white;
    canvas.drawPath(_car, white);
    canvas.drawPath(_z, white);
    for (final c in const [Offset(18.5, 25.6), Offset(45.5, 25.6)]) {
      canvas.drawCircle(c, 4.7, Paint()..color = _ink);
      canvas.drawCircle(c, 1.7, white);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
