import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models.dart';
import '../screens/vehicle_detail_screen.dart';
import '../services/app_state.dart';
import '../theme.dart';
import 'common.dart';

void openVehicle(BuildContext context, Vehicle v) {
  Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => VehicleDetailScreen(vehicleId: v.id, preview: v),
    ),
  );
}

/// Bouton favori (redirige vers la connexion si nécessaire).
class FavoriteButton extends StatelessWidget {
  final int vehicleId;
  final bool dark;
  const FavoriteButton({super.key, required this.vehicleId, this.dark = false});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final fav = state.isFavorite(vehicleId);
    return Material(
      color: dark ? Colors.black38 : Colors.white,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: () async {
          if (!state.isLoggedIn) {
            showSnack(
              context,
              'Connectez-vous depuis l’onglet Compte pour enregistrer vos favoris',
            );
            return;
          }
          try {
            await state.toggleFavorite(vehicleId);
          } catch (e) {
            if (context.mounted) showSnack(context, e.toString(), error: true);
          }
        },
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 250),
            transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
            child: Icon(
              fav ? Icons.favorite_rounded : Icons.favorite_border_rounded,
              key: ValueKey(fav),
              size: 20,
              color: fav
                  ? AppColors.red
                  : (dark ? Colors.white : AppColors.ink),
            ),
          ),
        ),
      ),
    );
  }
}

class _Spec extends StatelessWidget {
  final IconData icon;
  final String label;
  const _Spec(this.icon, this.label);
  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 15, color: AppColors.gold),
      const SizedBox(width: 4),
      Text(
        label,
        style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500),
      ),
    ],
  );
}

/// Carte véhicule pleine largeur (listes).
/// [flush] : bord à bord, sans arrondi ni ombre (accueil).
class VehicleCard extends StatelessWidget {
  final Vehicle v;
  final bool flush;
  const VehicleCard({super.key, required this.v, this.flush = false});

  @override
  Widget build(BuildContext context) {
    final price = v.mainPrice;
    return GestureDetector(
      onTap: () => openVehicle(context, v),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(flush ? 0 : AppRadius.md),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AspectRatio(
              aspectRatio: 16 / 10,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Hero(
                    tag: 'vehicle-${v.id}',
                    child: NetImage(v.coverThumbUrl ?? v.coverUrl),
                  ),
                  Positioned(
                    top: 12,
                    right: 12,
                    child: FavoriteButton(vehicleId: v.id),
                  ),
                  if (v.category != null)
                    Positioned(
                      top: 12,
                      left: 12,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 5,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.92),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          v.category!.name,
                          style: const TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                  if (v.availability != null && v.availability != 'available')
                    Positioned(
                      bottom: 12,
                      left: 12,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 5,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.ink.withValues(alpha: 0.8),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          availabilityLabels[v.availability] ?? '',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 11.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                  if (price != null)
                    Positioned(
                      bottom: 12,
                      right: 12,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 7,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.gold,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: RichText(
                          text: TextSpan(
                            children: [
                              TextSpan(
                                text: formatPrice(price.value, v.currency),
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 15,
                                ),
                              ),
                              TextSpan(
                                text: ' /${price.unit}',
                                style: const TextStyle(
                                  color: Color(0xFFF4EFDF),
                                  fontSize: 11.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${v.title}${v.year != null ? ' ${v.year}' : ''}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 16.5,
                            fontWeight: FontWeight.w800,
                            color: AppColors.ink,
                            letterSpacing: -0.3,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(
                        Icons.place_outlined,
                        size: 15,
                        color: AppColors.muted,
                      ),
                      const SizedBox(width: 3),
                      Expanded(
                        child: Text(
                          [
                            v.city,
                            v.company?.name,
                          ].whereType<String>().join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppColors.muted,
                            fontSize: 12.5,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 14,
                    runSpacing: 6,
                    children: [
                      if (v.seats != null)
                        _Spec(Icons.event_seat_outlined, '${v.seats} places'),
                      if (v.transmission != null)
                        _Spec(
                          Icons.settings_outlined,
                          transmissionLabels[v.transmission] ?? '',
                        ),
                      if (v.fuelType != null)
                        _Spec(
                          Icons.local_gas_station_outlined,
                          fuelLabels[v.fuelType] ?? '',
                        ),
                      if (v.offersDriver)
                        _Spec(Icons.person_outline_rounded, v.driverLabel),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Carte compacte (carrousels horizontaux).
class VehicleMiniCard extends StatelessWidget {
  final Vehicle v;
  final double width;
  final double radius;
  const VehicleMiniCard({
    super.key,
    required this.v,
    this.width = 250,
    this.radius = AppRadius.md,
  });

  @override
  Widget build(BuildContext context) {
    final price = v.mainPrice;
    return GestureDetector(
      onTap: () => openVehicle(context, v),
      child: SizedBox(
        width: width,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(radius),
          child: Stack(
            fit: StackFit.expand,
            children: [
              // Pas de Hero ici : un même véhicule peut apparaître dans plusieurs carrousels.
              NetImage(v.coverThumbUrl ?? v.coverUrl),
              Positioned(
                top: 10,
                right: 10,
                child: FavoriteButton(vehicleId: v.id, dark: true),
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: Container(
                  color: const Color(0xC716140F),
                  padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        v.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              v.city ?? '',
                              style: const TextStyle(
                                color: Color(0xFFD9D4C5),
                                fontSize: 12,
                              ),
                            ),
                          ),
                          if (price != null)
                            Text(
                              '${formatPrice(price.value, v.currency)}/${price.unit == 'jour' ? 'j' : price.unit}',
                              style: const TextStyle(
                                color: AppColors.goldLight,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
