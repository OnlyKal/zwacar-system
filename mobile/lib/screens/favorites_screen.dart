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
  Set<int> _lastIds = {};

  Future<void> _load() async {
    setState(() => error = null);
    try {
      final r = await Api.instance.favorites();
      if (mounted) setState(() => items = r);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    // Recharge lorsque la liste des favoris change (ajout/retrait depuis une autre page).
    if (state.isLoggedIn &&
        (items == null ||
            _lastIds.length != state.favoriteIds.length ||
            !_lastIds.containsAll(state.favoriteIds))) {
      _lastIds = {...state.favoriteIds};
      WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    }
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
          : items == null
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.gold),
            )
          : items!.isEmpty
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
                itemCount: items!.length,
                separatorBuilder: (_, __) => const SizedBox(height: 16),
                itemBuilder: (_, i) => VehicleCard(v: items![i]),
              ),
            ),
    );
  }
}
