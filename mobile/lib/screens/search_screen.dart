import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models.dart';
import '../services/api.dart';
import '../services/app_state.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/filter_sheet.dart';
import '../widgets/vehicle_card.dart';

/// Recherche : saisie libre, filtres avancés, tri et pagination infinie.
class SearchScreen extends StatefulWidget {
  final SearchFilters? initial;
  final bool embedded;
  const SearchScreen({super.key, this.initial, this.embedded = false});
  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  late SearchFilters f = widget.initial?.copy() ?? SearchFilters();
  late final _q = TextEditingController(text: f.q);
  final _scroll = ScrollController();
  final List<Vehicle> _items = [];
  int _page = 0, _pages = 1, _total = 0;
  bool _loading = false;
  String? _error;
  Timer? _debounce;
  int _seq = 0;

  @override
  void initState() {
    super.initState();
    _reload();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 400) {
        _loadMore();
      }
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _scroll.dispose();
    _q.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    _items.clear();
    _page = 0;
    _pages = 1;
    await _loadMore(force: true);
  }

  Future<void> _loadMore({bool force = false}) async {
    if ((_loading && !force) || _page >= _pages) return;
    final seq = ++_seq;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final r = await Api.instance.vehicles(f, page: _page + 1);
      if (!mounted || seq != _seq) return;
      setState(() {
        _items.addAll(r.items);
        _page = r.page;
        _pages = r.pages;
        _total = r.total;
      });
    } catch (e) {
      if (mounted && seq == _seq) setState(() => _error = e.toString());
    } finally {
      if (mounted && seq == _seq) setState(() => _loading = false);
    }
  }

  void _onQuery(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      f.q = v;
      _reload();
    });
  }

  Future<void> _openFilters() async {
    final cfg = context.read<AppState>().config;
    if (cfg == null) return;
    final res = await showFilterSheet(context, cfg, f);
    if (res != null) {
      setState(() => f = res);
      _reload();
    }
  }

  void _sortMenu() async {
    final s = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(6)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.all(18),
              child: Text(
                'Trier par',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
              ),
            ),
            ...sortLabels.entries.map(
              (e) => ListTile(
                title: Text(
                  e.value,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                trailing: f.sort == e.key
                    ? const Icon(
                        Icons.check_circle_rounded,
                        color: AppColors.gold,
                      )
                    : null,
                onTap: () => Navigator.pop(context, e.key),
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (s != null && s != f.sort) {
      setState(() => f.sort = s);
      _reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    final cfg = context.watch<AppState>().config;
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: !widget.embedded,
        title: const Text('Rechercher'),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _q,
                    onChanged: _onQuery,
                    textInputAction: TextInputAction.search,
                    decoration: InputDecoration(
                      hintText: 'Marque, modèle, ville…',
                      prefixIcon: const Icon(Icons.search_rounded),
                      suffixIcon: _q.text.isEmpty
                          ? null
                          : IconButton(
                              icon: const Icon(Icons.close_rounded),
                              onPressed: () {
                                _q.clear();
                                _onQuery('');
                                setState(() {});
                              },
                            ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Badge(
                  isLabelVisible: f.activeCount > 0,
                  label: Text('${f.activeCount}'),
                  backgroundColor: AppColors.gold,
                  child: Material(
                    color: AppColors.ink,
                    borderRadius: BorderRadius.circular(6),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(6),
                      onTap: cfg == null ? null : _openFilters,
                      child: const SizedBox(
                        width: 52,
                        height: 52,
                        child: Icon(Icons.tune_rounded, color: Colors.white),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (cfg != null)
            SizedBox(
              height: 44,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  for (final c in cfg.categories)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: FilterChip(
                        label: Text(c.name),
                        selected: f.categoryIds.contains(c.id),
                        showCheckmark: false,
                        labelStyle: TextStyle(
                          color: f.categoryIds.contains(c.id)
                              ? Colors.white
                              : AppColors.ink,
                          fontWeight: FontWeight.w600,
                        ),
                        onSelected: (_) {
                          setState(
                            () => f.categoryIds.contains(c.id)
                                ? f.categoryIds.remove(c.id)
                                : f.categoryIds.add(c.id),
                          );
                          _reload();
                        },
                      ),
                    ),
                ],
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 6, 8, 4),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    _loading && _items.isEmpty
                        ? 'Recherche…'
                        : '$_total véhicule(s)',
                    style: const TextStyle(
                      color: AppColors.muted,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                TextButton.icon(
                  onPressed: _sortMenu,
                  icon: const Icon(
                    Icons.swap_vert_rounded,
                    size: 18,
                    color: AppColors.gold,
                  ),
                  label: Text(
                    sortLabels[f.sort]!,
                    style: const TextStyle(
                      color: AppColors.ink,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(child: _body()),
        ],
      ),
    );
  }

  Widget _body() {
    if (_error != null && _items.isEmpty) {
      return ErrorState(message: _error!, onRetry: _reload);
    }
    if (_loading && _items.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          Skeleton(height: 290),
          SizedBox(height: 16),
          Skeleton(height: 290),
        ],
      );
    }
    if (_items.isEmpty) {
      return EmptyState(
        icon: Icons.search_off_rounded,
        title: 'Aucun véhicule trouvé',
        text: 'Essayez d’élargir vos critères de recherche.',
        action: f.activeCount > 0
            ? OutlinedButton(
                onPressed: () {
                  setState(
                    () => f = SearchFilters()
                      ..q = f.q
                      ..sort = f.sort,
                  );
                  _reload();
                },
                child: const Text('Effacer les filtres'),
              )
            : null,
      );
    }
    return RefreshIndicator(
      color: AppColors.gold,
      onRefresh: _reload,
      child: ListView.separated(
        controller: _scroll,
        padding: const EdgeInsets.fromLTRB(16, 6, 16, 24),
        itemCount: _items.length + 1,
        separatorBuilder: (_, __) => const SizedBox(height: 16),
        itemBuilder: (_, i) {
          if (i == _items.length) {
            return Padding(
              padding: const EdgeInsets.all(12),
              child: Center(
                child: _loading
                    ? const CircularProgressIndicator(color: AppColors.gold)
                    : _page >= _pages
                    ? const Text(
                        'Fin des résultats',
                        style: TextStyle(color: AppColors.muted),
                      )
                    : const SizedBox.shrink(),
              ),
            );
          }
          return VehicleCard(v: _items[i]);
        },
      ),
    );
  }
}
