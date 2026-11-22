import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import 'screens/account_screen.dart';
import 'screens/explore_screen.dart';
import 'screens/favorites_screen.dart';
import 'screens/search_screen.dart';
import 'services/app_state.dart';
import 'theme.dart';
import 'widgets/logo.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(statusBarColor: Colors.transparent),
  );
  runApp(
    ChangeNotifierProvider(
      create: (_) => AppState()..init(),
      child: const ZwaCarApp(),
    ),
  );
}

class ZwaCarApp extends StatelessWidget {
  const ZwaCarApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ZwaCar',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: const _Root(),
    );
  }
}

class _Root extends StatelessWidget {
  const _Root();
  @override
  Widget build(BuildContext context) {
    final ready = context.select<AppState, bool>((s) => s.ready);
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 500),
      child: ready ? const HomeShell() : const _Splash(),
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();
  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AppColors.ink,
    body: Center(
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0.7, end: 1),
        duration: const Duration(milliseconds: 900),
        curve: Curves.elasticOut,
        builder: (_, s, child) => Transform.scale(scale: s, child: child),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ZwaLogo(size: 76),
            const SizedBox(height: 18),
            const Text(
              'ZwaCar',
              style: TextStyle(
                color: Colors.white,
                fontSize: 26,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Location de véhicules',
              style: TextStyle(color: Color(0xFFBDB6A4)),
            ),
          ],
        ),
      ),
    ),
  );
}

/// Navigation principale : Explorer, Rechercher, Favoris, Compte.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int index = 0;

  @override
  Widget build(BuildContext context) {
    final pages = [
      HeroMode(enabled: index == 0, child: const ExploreScreen()),
      HeroMode(enabled: index == 1, child: const SearchScreen(embedded: true)),
      HeroMode(
        enabled: index == 2,
        child: FavoritesScreen(onLogin: () => setState(() => index = 3)),
      ),
      HeroMode(enabled: index == 3, child: const AccountScreen()),
    ];
    return Scaffold(
      body: IndexedStack(index: index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => setState(() => index = i),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.explore_outlined),
            selectedIcon: Icon(Icons.explore_rounded),
            label: 'Explorer',
          ),
          NavigationDestination(
            icon: Icon(Icons.search_rounded),
            label: 'Rechercher',
          ),
          NavigationDestination(
            icon: Icon(Icons.favorite_border_rounded),
            selectedIcon: Icon(Icons.favorite_rounded),
            label: 'Favoris',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline_rounded),
            selectedIcon: Icon(Icons.person_rounded),
            label: 'Compte',
          ),
        ],
      ),
    );
  }
}
