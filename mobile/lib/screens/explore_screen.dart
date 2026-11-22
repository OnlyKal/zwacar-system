import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../models.dart';
import '../services/api.dart';
import '../services/app_state.dart';
import '../theme.dart';
import '../widgets/logo.dart';
import '../widgets/common.dart';
import '../widgets/vehicle_card.dart';
import 'search_screen.dart';

/// Accueil : recherche rapide, catégories, véhicules populaires et récents.
class ExploreScreen extends StatefulWidget {
  const ExploreScreen({super.key});
  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> {
  List<Vehicle>? popular, recent;
  String? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => error = null);
    try {
      final r = await Future.wait([
        Api.instance.vehicles(SearchFilters()..sort = 'popular', limit: 8),
        Api.instance.vehicles(SearchFilters()..sort = 'recent', limit: 6),
      ]);
      if (!mounted) return;
      setState(() {
        popular = r[0].items;
        recent = r[1].items;
      });
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  void _search(SearchFilters f) => Navigator.of(
    context,
  ).push(MaterialPageRoute(builder: (_) => SearchScreen(initial: f)));

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final cfg = state.config;
    // Icônes de la barre d'état en clair sur l'en-tête sombre.
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        body: RefreshIndicator(
          color: AppColors.gold,
          onRefresh: () async {
            await Future.wait([_load(), state.loadConfig()]);
          },
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: _Header(
                  userName: state.user?.firstName,
                  onSearch: _search,
                ),
              ),
              if (cfg != null && cfg.categories.isNotEmpty) ...[
                const SliverToBoxAdapter(child: _SectionTitle('Catégories')),
                SliverToBoxAdapter(
                  child: SizedBox(
                    height: 104,
                    child: ListView.builder(
                      padding: EdgeInsets.zero,
                      scrollDirection: Axis.horizontal,
                      itemCount: cfg.categories.length,
                      itemBuilder: (_, i) {
                        final c = cfg.categories[i];
                        return GestureDetector(
                          onTap: () =>
                              _search(SearchFilters()..categoryIds = {c.id}),
                          child: Container(
                            width: 96,
                            padding: const EdgeInsets.all(10),
                            // Tuiles jointives : alternance de fonds au lieu de bordures.
                            color: i.isEven ? Colors.white : AppColors.field,
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Container(
                                  width: 42,
                                  height: 42,
                                  decoration: BoxDecoration(
                                    color: AppColors.goldSoft,
                                    borderRadius: BorderRadius.circular(
                                      AppRadius.md,
                                    ),
                                  ),
                                  child: Icon(
                                    categoryIcon(c.icon),
                                    color: AppColors.gold,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  c.name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                Text(
                                  '${c.count}',
                                  style: const TextStyle(
                                    fontSize: 11,
                                    color: AppColors.muted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ),
              ],
              if (error != null)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: ErrorState(message: error!, onRetry: _load),
                )
              else ...[
                _SectionTitle(
                  'Les plus populaires',
                  action: 'Voir tout',
                  onAction: () => _search(SearchFilters()..sort = 'popular'),
                ).sliver,
                SliverToBoxAdapter(
                  child: SizedBox(
                    height: 210,
                    child: popular == null
                        ? ListView(
                            scrollDirection: Axis.horizontal,
                            padding: EdgeInsets.zero,
                            children: const [
                              SizedBox(
                                width: 250,
                                child: Skeleton(height: 210, radius: 0),
                              ),
                              SizedBox(
                                width: 250,
                                child: Skeleton(height: 210, radius: 0),
                              ),
                            ],
                          )
                        : popular!.isEmpty
                        ? const Center(
                            child: Text(
                              'Aucun véhicule disponible pour le moment',
                              style: TextStyle(color: AppColors.muted),
                            ),
                          )
                        : ListView.builder(
                            padding: EdgeInsets.zero,
                            scrollDirection: Axis.horizontal,
                            itemCount: popular!.length,
                            itemBuilder: (_, i) =>
                                VehicleMiniCard(v: popular![i], radius: 0),
                          ),
                  ),
                ),
                _SectionTitle(
                  'Récemment ajoutés',
                  action: 'Voir tout',
                  onAction: () => _search(SearchFilters()),
                ).sliver,
                if (recent == null)
                  const SliverToBoxAdapter(
                    child: Skeleton(height: 300, radius: 0),
                  )
                else
                  SliverPadding(
                    padding: EdgeInsets.zero,
                    sliver: SliverList.builder(
                      itemCount: recent!.length,
                      itemBuilder: (_, i) => TweenAnimationBuilder<double>(
                        tween: Tween(begin: 0, end: 1),
                        duration: Duration(milliseconds: 350 + i * 80),
                        curve: Curves.easeOutCubic,
                        builder: (_, t, child) => Opacity(
                          opacity: t,
                          child: Transform.translate(
                            offset: Offset(0, 24 * (1 - t)),
                            child: child,
                          ),
                        ),
                        child: VehicleCard(v: recent![i], flush: true),
                      ),
                    ),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final String? userName;
  final void Function(SearchFilters) onSearch;
  const _Header({this.userName, required this.onSearch});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppColors.ink,
      padding: EdgeInsets.fromLTRB(
        20,
        MediaQuery.of(context).padding.top + 18,
        20,
        26,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const ZwaLogo(size: 38),
              const SizedBox(width: 10),
              const Text(
                'ZwaCar',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 22),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                userName != null ? 'Bonjour $userName' : 'Bonjour',
                style: const TextStyle(
                  color: Color(0xFFC9C3B2),
                  fontSize: 14,
                ),
              ),
              const SizedBox(width: 6),
              const Icon(
                Icons.waving_hand_rounded,
                color: AppColors.goldLight,
                size: 17,
              ),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'Trouvez le véhicule idéal\npour votre trajet',
            style: TextStyle(
              color: Colors.white,
              fontSize: 26,
              fontWeight: FontWeight.w800,
              height: 1.15,
              letterSpacing: -0.6,
            ),
          ),
          const SizedBox(height: 20),
          GestureDetector(
            onTap: () => onSearch(SearchFilters()),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Row(
                children: [
                  Icon(Icons.search_rounded, color: AppColors.muted),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Marque, modèle, ville…',
                      style: TextStyle(color: AppColors.muted),
                    ),
                  ),
                  Icon(Icons.tune_rounded, color: AppColors.gold),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String title;
  final String? action;
  final VoidCallback? onAction;
  const _SectionTitle(this.title, {this.action, this.onAction});

  Widget get sliver => SliverToBoxAdapter(child: this);

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 24, 12, 12),
    child: Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: AppColors.ink,
              letterSpacing: -0.3,
            ),
          ),
        ),
        if (action != null)
          TextButton(
            onPressed: onAction,
            child: Text(
              action!,
              style: const TextStyle(
                color: AppColors.gold,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
      ],
    ),
  );
}
