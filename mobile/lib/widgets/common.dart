import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../theme.dart';

String formatPrice(double v, String currency) {
  final s = v == v.roundToDouble()
      ? v.toStringAsFixed(0)
      : v.toStringAsFixed(2);
  final withSpaces = s.replaceAllMapped(
    RegExp(r'(\d)(?=(\d{3})+(?!\d))'),
    (m) => '${m[1]} ',
  );
  return currency == 'USD' ? '\$$withSpaces' : '$withSpaces $currency';
}

/// Image réseau avec cache, placeholder animé et repli en cas d'erreur.
class NetImage extends StatelessWidget {
  final String? url;
  final BoxFit fit;
  const NetImage(this.url, {super.key, this.fit = BoxFit.cover});

  @override
  Widget build(BuildContext context) {
    if (url == null) return const _ImageFallback();
    return CachedNetworkImage(
      imageUrl: url!,
      fit: fit,
      fadeInDuration: const Duration(milliseconds: 250),
      placeholder: (_, __) => Container(color: const Color(0xFF2E2A21)),
      errorWidget: (_, __, ___) => const _ImageFallback(),
    );
  }
}

class _ImageFallback extends StatelessWidget {
  const _ImageFallback();
  @override
  Widget build(BuildContext context) => Container(
    decoration: const BoxDecoration(color: AppColors.ink2),
    child: const Center(
      child: Icon(
        Icons.directions_car_filled_rounded,
        color: Color(0xFF6F6A5C),
        size: 48,
      ),
    ),
  );
}

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? text;
  final Widget? action;
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.text,
    this.action,
  });

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: AppColors.goldSoft,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Icon(icon, color: AppColors.gold, size: 32),
          ),
          const SizedBox(height: 16),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: AppColors.ink,
            ),
          ),
          if (text != null) ...[
            const SizedBox(height: 6),
            Text(
              text!,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.muted),
            ),
          ],
          if (action != null) ...[const SizedBox(height: 18), action!],
        ],
      ),
    ),
  );
}

class ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const ErrorState({super.key, required this.message, required this.onRetry});
  @override
  Widget build(BuildContext context) => EmptyState(
    icon: Icons.wifi_off_rounded,
    title: 'Oups…',
    text: message,
    action: OutlinedButton.icon(
      onPressed: onRetry,
      icon: const Icon(Icons.refresh_rounded),
      label: const Text('Réessayer'),
    ),
  );
}

/// Bloc de chargement (squelette) animé.
class Skeleton extends StatefulWidget {
  final double height;
  final double radius;
  const Skeleton({super.key, required this.height, this.radius = 18});
  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton>
    with SingleTickerProviderStateMixin {
  late final _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat(reverse: true);
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
    opacity: Tween(begin: 0.45, end: 1.0).animate(_c),
    child: Container(
      height: widget.height,
      decoration: BoxDecoration(
        color: const Color(0xFFE9E4D7),
        borderRadius: BorderRadius.circular(widget.radius),
      ),
    ),
  );
}

void showSnack(BuildContext context, String message, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        backgroundColor: error ? AppColors.red : AppColors.ink,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      ),
    );
}

/// Icône associée à une catégorie (champ `icon` renseigné par le Super Administrateur).
IconData categoryIcon(String? icon) => switch (icon) {
  'city' => Icons.directions_car_rounded,
  'sedan' => Icons.local_taxi_rounded,
  'suv' => Icons.directions_car_filled_rounded,
  'offroad' => Icons.terrain_rounded,
  'pickup' => Icons.agriculture_rounded,
  'van' => Icons.airport_shuttle_rounded,
  'luxury' => Icons.diamond_rounded,
  'truck' => Icons.local_shipping_rounded,
  _ => Icons.directions_car_rounded,
};
