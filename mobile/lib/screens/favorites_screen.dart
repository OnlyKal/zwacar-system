import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models.dart';
import '../services/api.dart';
import '../services/app_state.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/vehicle_card.dart';

class FavoritesScreen extends StatefulWidget {
  final VoidCallback onLogin;
  const FavoritesScreen({super.key, required this.onLogin});
  @override
  State<FavoritesScreen> createState() => _FavoritesScreenState();
}

class _FavoritesScreenState extends State<FavoritesScreen> {
  List<Vehicle>? items;
  String? error;
  int? _requestedRevision;
  int? _requestedUserId;
  int? _loadedUserId;

  Future<void> _load() async {
    final state = context.read<AppState>();
    final revision = state.favoritesRevision;
    final userId = state.user?.id;
    _requestedRevision = revision;
    _requestedUserId = userId;
    setState(() => error = null);
    try {
      final r = await Api.instance.favorites();
      if (mounted &&
          context.read<AppState>().favoritesRevision == revision &&
          context.read<AppState>().user?.id == userId) {
        setState(() {
          items = r;
          _loadedUserId = userId;
        });
      }
    } catch (e) {
      if (mounted &&
          context.read<AppState>().favoritesRevision == revision &&
          context.read<AppState>().user?.id == userId) {
        setState(() => error = e.toString());
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final userId = state.user?.id;
    if (!state.isLoggedIn) {
      _requestedRevision = null;
      _requestedUserId = null;
    }
    // Recharge lorsque la liste des favoris change (ajout/retrait depuis une autre page).
    if (state.isLoggedIn &&
        userId != null &&
        (items == null ||
            _requestedRevision != state.favoritesRevision ||
            _requestedUserId != userId)) {
      _requestedRevision = state.favoritesRevision;
      _requestedUserId = userId;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _load();
      });
    }
    final visibleItems = _loadedUserId == state.user?.id
        ? items?.where((vehicle) => state.isFavorite(vehicle.id)).toList()
        : null;
    return Scaffold(
      appBar: AppBar(title: const Text('Mes favoris')),
      body: !state.isLoggedIn
          ? EmptyState(
              icon: Icons.favorite_border_rounded,
              title: 'Gardez vos coups de cœur',
              text:
                  'Connectez-vous pour enregistrer les véhicules qui vous intéressent.',
              action: FilledButton(
                onPressed: widget.onLogin,
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 20),
                  child: Text('Se connecter'),
                ),
              ),
            )
          : error != null
          ? ErrorState(message: error!, onRetry: _load)
          : visibleItems == null
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.gold),
            )
          : visibleItems.isEmpty
          ? const EmptyState(
              icon: Icons.favorite_border_rounded,
              title: 'Aucun favori',
              text: 'Touchez le cœur d’un véhicule pour l’ajouter ici.',
            )
          : RefreshIndicator(
              color: AppColors.gold,
              onRefresh: _load,
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 6, 16, 24),
                itemCount: visibleItems.length,
                separatorBuilder: (_, __) => const SizedBox(height: 16),
                itemBuilder: (_, i) => VehicleCard(v: visibleItems[i]),
              ),
            ),
    );
  }
}
