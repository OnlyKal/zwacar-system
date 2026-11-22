import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Couleurs de l'écran de connexion (identiques au Web Admin).
class HudColors {
  static const bg = Color(0xFF0B0A08);
  static const field = Color(0xFF1B1913);
  static const gold = Color(0xFFD2B65C);
  static const text = Color(0xFFECE7D8);
  static const muted = Color(0xFF8F8977);
  static const line = Color(0xFF1D1B15);
  static const dot = Color(0xFF2C281E);
  static const dim = Color(0xFF3A352A);
}

/// Grille de fond qui défile lentement (traits unis, aucun dégradé).
class HudGrid extends StatefulWidget {
  const HudGrid({super.key});
  @override
  State<HudGrid> createState() => _HudGridState();
}

class _HudGridState extends State<HudGrid> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 18),
  )..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => RepaintBoundary(
    child: CustomPaint(painter: _GridPainter(_c), size: Size.infinite),
  );
}

class _GridPainter extends CustomPainter {
  final Animation<double> t;
  _GridPainter(this.t) : super(repaint: t);
  static const cell = 40.0;

  @override
  void paint(Canvas canvas, Size size) {
    final off = t.value * cell;
    final line = Paint()
      ..color = HudColors.line
      ..strokeWidth = 1;
    final dot = Paint()..color = HudColors.dot;
    for (double x = -off; x < size.width + cell; x += cell) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), line);
    }
    for (double y = -off; y < size.height + cell; y += cell) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), line);
      for (double x = -off; x < size.width + cell; x += cell) {
        canvas.drawCircle(Offset(x, y), 1.2, dot);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _GridPainter old) => false;
}

/// Véhicule en tracé filaire : dessin progressif, roues animées, balayage.
class HudCar extends StatefulWidget {
  const HudCar({super.key});
  @override
  State<HudCar> createState() => _HudCarState();
}

class _HudCarState extends State<HudCar> with TickerProviderStateMixin {
  late final _draw = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2400),
  )..forward();
  late final _loop = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 3600),
  )..repeat();

  @override
  void dispose() {
    _draw.dispose();
    _loop.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AspectRatio(
    aspectRatio: 760 / 300,
    child: RepaintBoundary(
      child: CustomPaint(
        painter: _CarPainter(
          CurvedAnimation(parent: _draw, curve: Curves.easeOutCubic),
          _loop,
        ),
      ),
    ),
  );
}

class _CarPainter extends CustomPainter {
  final Animation<double> draw, loop;
  _CarPainter(this.draw, this.loop)
    : super(repaint: Listenable.merge([draw, loop]));

  static Path _body() => Path()
    ..moveTo(40, 210)
    ..lineTo(52, 170)
    ..quadraticBezierTo(60, 150, 100, 146)
    ..lineTo(240, 138)
    ..lineTo(320, 82)
    ..quadraticBezierTo(340, 68, 380, 66)
    ..lineTo(500, 66)
    ..quadraticBezierTo(540, 66, 570, 92)
    ..lineTo(640, 140)
    ..lineTo(700, 150)
    ..quadraticBezierTo(722, 156, 724, 186)
    ..lineTo(724, 210)
    ..lineTo(650, 210)
    ..arcToPoint(
      const Offset(550, 210),
      radius: const Radius.circular(6),
      clockwise: false,
    )
    ..lineTo(230, 210)
    ..arcToPoint(
      const Offset(130, 210),
      radius: const Radius.circular(6),
      clockwise: false,
    )
    ..close();

  static Path _windows() => Path()
    ..moveTo(335, 92)
    ..quadraticBezierTo(348, 82, 380, 82)
    ..lineTo(440, 82)
    ..lineTo(440, 136)
    ..lineTo(270, 136)
    ..close()
    ..moveTo(456, 82)
    ..lineTo(500, 82)
    ..quadraticBezierTo(530, 82, 552, 102)
    ..lineTo(586, 136)
    ..lineTo(456, 136)
    ..close();

  static final _bodyPath = _body();
  static final _winPath = _windows();

  /// Portion [0..t] d'un tracé.
  static Path _partial(Path p, double t) {
    final out = Path();
    for (final m in p.computeMetrics()) {
      out.addPath(m.extractPath(0, m.length * t.clamp(0, 1)), Offset.zero);
    }
    return out;
  }

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width / 760;
    canvas.save();
    canvas.scale(s);
    final d = draw.value;
    Paint stroke(Color c, double w) => Paint()
      ..color = c
      ..style = PaintingStyle.stroke
      ..strokeWidth = w
      ..strokeJoin = StrokeJoin.round;

    // Cote supérieure
    canvas.drawPath(
      _partial(
        Path()
          ..moveTo(40, 34)
          ..lineTo(724, 34),
        d,
      ),
      stroke(HudColors.dim, 1.5),
    );
    // Carrosserie, vitres, ligne de caisse
    canvas.drawPath(_partial(_bodyPath, d), stroke(HudColors.gold, 2.4));
    canvas.drawPath(
      _partial(_winPath, ((d - 0.2) / 0.8).clamp(0, 1)),
      stroke(HudColors.gold.withValues(alpha: 0.55), 1.6),
    );
    canvas.drawPath(
      _partial(
        Path()
          ..moveTo(60, 182)
          ..lineTo(716, 182),
        ((d - 0.35) / 0.65).clamp(0, 1),
      ),
      stroke(HudColors.gold.withValues(alpha: 0.3), 1.4),
    );

    // Roues
    final spin = loop.value * 2 * math.pi;
    for (final cx in [180.0, 600.0]) {
      final c = Offset(cx, 212);
      canvas.drawArc(
        Rect.fromCircle(center: c, radius: 40),
        -math.pi / 2,
        2 * math.pi * d,
        false,
        stroke(HudColors.gold, 2),
      );
      const n = 12;
      for (var k = 0; k < n; k++) {
        canvas.drawArc(
          Rect.fromCircle(center: c, radius: 27),
          spin + k * 2 * math.pi / n,
          0.28,
          false,
          stroke(HudColors.gold.withValues(alpha: 0.7), 2),
        );
      }
      canvas.drawCircle(c, 6, Paint()..color = HudColors.gold);
    }

    // Sol pointillé
    for (double x = 0; x < 760; x += 14) {
      canvas.drawLine(
        Offset(x, 262),
        Offset(x + 4, 262),
        stroke(HudColors.dot, 1.5),
      );
    }

    // Points d'analyse
    for (final p in const [
      Offset(320, 82),
      Offset(640, 140),
      Offset(100, 146),
    ]) {
      canvas.drawCircle(p, 4, Paint()..color = HudColors.bg);
      canvas.drawCircle(p, 4, stroke(HudColors.gold, 2));
    }

    // Balayage (aller-retour)
    if (d >= 1) {
      final x =
          20 + (math.sin(loop.value * 2 * math.pi - math.pi / 2) + 1) / 2 * 720;
      canvas.drawLine(
        Offset(x, 48),
        Offset(x, 262),
        stroke(HudColors.gold.withValues(alpha: 0.75), 1.5),
      );
      canvas.drawRect(
        Rect.fromLTWH(x - 3, 48, 6, 6),
        Paint()..color = HudColors.gold,
      );
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _CarPainter old) => false;
}

/// Étiquette de données façon « HUD ».
class HudChip extends StatelessWidget {
  final String label;
  final String value;
  final String? accent;
  const HudChip({
    super.key,
    required this.label,
    required this.value,
    this.accent,
  });

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
    decoration: BoxDecoration(
      color: const Color(0xE61B1913),
      borderRadius: BorderRadius.circular(4),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: HudColors.muted,
            fontSize: 9.5,
            letterSpacing: 0.6,
          ),
        ),
        Text.rich(
          TextSpan(
            text: value,
            children: [
              if (accent != null)
                TextSpan(
                  text: ' $accent',
                  style: const TextStyle(color: HudColors.gold),
                ),
            ],
          ),
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w800,
            fontSize: 14,
          ),
        ),
      ],
    ),
  );
}
