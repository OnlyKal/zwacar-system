import 'package:flutter/material.dart';

import '../models.dart';
import '../theme.dart';

/// Panneau de filtres avancés. Renvoie les nouveaux filtres ou null si annulé.
Future<SearchFilters?> showFilterSheet(
  BuildContext context,
  PublicConfig cfg,
  SearchFilters current,
) {
  return showModalBottomSheet<SearchFilters>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(6)),
    ),
    builder: (_) => _FilterSheet(cfg: cfg, initial: current.copy()),
  );
}

class _FilterSheet extends StatefulWidget {
  final PublicConfig cfg;
  final SearchFilters initial;
  const _FilterSheet({required this.cfg, required this.initial});
  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late SearchFilters f = widget.initial;
  late RangeValues range = RangeValues(
    (f.minPrice ?? 0).clamp(0, _max).toDouble(),
    (f.maxPrice ?? _max).clamp(0, _max).toDouble(),
  );

  double get _max =>
      widget.cfg.maxPrice <= 0 ? 500 : (widget.cfg.maxPrice / 10).ceil() * 10.0;

  Widget _title(String t) => Padding(
    padding: const EdgeInsets.only(top: 22, bottom: 10),
    child: Text(
      t,
      style: const TextStyle(
        fontWeight: FontWeight.w800,
        fontSize: 15,
        color: AppColors.ink,
      ),
    ),
  );

  Widget _choice(String label, bool selected, VoidCallback onTap) => ChoiceChip(
    label: Text(label),
    selected: selected,
    onSelected: (_) => onTap(),
    showCheckmark: false,
    labelStyle: TextStyle(
      color: selected ? Colors.white : AppColors.ink,
      fontWeight: FontWeight.w600,
    ),
  );

  @override
  Widget build(BuildContext context) {
    final cfg = widget.cfg;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.88,
      maxChildSize: 0.95,
      builder: (_, scroll) => Column(
        children: [
          const SizedBox(height: 10),
          Container(
            width: 44,
            height: 5,
            decoration: BoxDecoration(
              color: AppColors.line,
              borderRadius: BorderRadius.circular(5),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 8, 0),
            child: Row(
              children: [
                const Expanded(
                  child: Text(
                    'Filtres',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: AppColors.ink,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: () => setState(() {
                    f = SearchFilters()
                      ..q = f.q
                      ..sort = f.sort;
                    range = RangeValues(0, _max);
                  }),
                  child: const Text(
                    'Réinitialiser',
                    style: TextStyle(
                      color: AppColors.gold,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              controller: scroll,
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              children: [
                _title('Trier par'),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: sortLabels.entries
                      .map(
                        (e) => _choice(
                          e.value,
                          f.sort == e.key,
                          () => setState(() => f.sort = e.key),
                        ),
                      )
                      .toList(),
                ),
                _title('Catégorie'),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: cfg.categories
                      .map(
                        (c) => _choice(
                          '${c.name} (${c.count})',
                          f.categoryIds.contains(c.id),
                          () => setState(
                            () => f.categoryIds.contains(c.id)
                                ? f.categoryIds.remove(c.id)
                                : f.categoryIds.add(c.id),
                          ),
                        ),
                      )
                      .toList(),
                ),
                _title('Prix par jour'),
                Text(
                  '${range.start.round()} – ${range.end.round()}${range.end >= _max ? '+' : ''} ${cfg.currency}',
                  style: const TextStyle(
                    color: AppColors.muted,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                RangeSlider(
                  values: range,
                  min: 0,
                  max: _max,
                  divisions: (_max / 5).round().clamp(1, 200),
                  activeColor: AppColors.gold,
                  inactiveColor: AppColors.goldSoft,
                  onChanged: (r) => setState(() => range = r),
                ),
                _title('Marque'),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: cfg.brands
                      .map(
                        (b) => _choice(
                          b.name,
                          f.brand == b.name,
                          () => setState(
                            () => f.brand = f.brand == b.name ? null : b.name,
                          ),
                        ),
                      )
                      .toList(),
                ),
                _title('Localisation'),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: cfg.cities
                      .map(
                        (c) => _choice(
                          c.name,
                          f.city == c.name,
                          () => setState(
                            () => f.city = f.city == c.name ? null : c.name,
                          ),
                        ),
                      )
                      .toList(),
                ),
                _title('Transmission'),
                Wrap(
                  spacing: 8,
                  children: transmissionLabels.entries
                      .map(
                        (e) => _choice(
                          e.value,
                          f.transmission == e.key,
                          () => setState(
                            () => f.transmission = f.transmission == e.key
                                ? null
                                : e.key,
                          ),
                        ),
                      )
                      .toList(),
                ),
                _title('Carburant'),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: fuelLabels.entries
                      .where((e) => e.key != 'other')
                      .map(
                        (e) => _choice(
                          e.value,
                          f.fuelTypes.contains(e.key),
                          () => setState(
                            () => f.fuelTypes.contains(e.key)
                                ? f.fuelTypes.remove(e.key)
                                : f.fuelTypes.add(e.key),
                          ),
                        ),
                      )
                      .toList(),
                ),
                _title('Nombre de places minimum'),
                Wrap(
                  spacing: 8,
                  children: [2, 4, 5, 7, 9]
                      .map(
                        (n) => _choice(
                          '$n+',
                          f.seats == n,
                          () =>
                              setState(() => f.seats = f.seats == n ? null : n),
                        ),
                      )
                      .toList(),
                ),
                _title('Équipements'),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: cfg.features
                      .map(
                        (x) => _choice(
                          x.name,
                          f.featureIds.contains(x.id),
                          () => setState(
                            () => f.featureIds.contains(x.id)
                                ? f.featureIds.remove(x.id)
                                : f.featureIds.add(x.id),
                          ),
                        ),
                      )
                      .toList(),
                ),
                _title('Chauffeur'),
                Wrap(
                  spacing: 8,
                  children: [
                    _choice(
                      'Indifférent',
                      f.driver == null,
                      () => setState(() => f.driver = null),
                    ),
                    _choice(
                      'Avec chauffeur',
                      f.driver == 'with',
                      () => setState(() => f.driver = 'with'),
                    ),
                    _choice(
                      'Sans chauffeur',
                      f.driver == 'without',
                      () => setState(() => f.driver = 'without'),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  activeThumbColor: AppColors.gold,
                  title: const Text(
                    'Disponibles immédiatement',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  value: f.availableOnly,
                  onChanged: (v) => setState(() => f.availableOnly = v),
                ),
              ],
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () {
                    f.minPrice = range.start > 0 ? range.start : null;
                    f.maxPrice = range.end < _max ? range.end : null;
                    Navigator.pop(context, f);
                  },
                  child: const Text('Afficher les résultats'),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
