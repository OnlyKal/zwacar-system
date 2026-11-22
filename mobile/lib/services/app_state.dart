import 'package:flutter/foundation.dart';

import '../models.dart';
import 'api.dart';

/// État global : configuration publique, utilisateur connecté et favoris.
class AppState extends ChangeNotifier {
  final api = Api.instance;
  PublicConfig? config;
  AppUser? user;
  Set<int> favoriteIds = {};
  int favoritesRevision = 0;
  bool ready = false;
  String? configError;

  bool get isLoggedIn => user != null;

  Future<void> init() async {
    await api.loadSession();
    await Future.wait([loadConfig(), _restoreUser()]);
    ready = true;
    notifyListeners();
  }

  Future<void> loadConfig() async {
    try {
      config = await api.config();
      configError = null;
    } catch (e) {
      configError = e.toString();
    }
    notifyListeners();
  }

  Future<void> _restoreUser() async {
    if (!api.hasSession) return;
    if (await api.refresh()) {
      try {
        user = await api.me();
        if (user!.role != 'client') {
          // Les comptes du back-office utilisent le Web Admin.
          await api.logout();
          user = null;
        } else {
          await loadFavorites();
        }
      } catch (_) {
        user = null;
      }
    }
  }

  Future<void> loadFavorites() async {
    if (user == null) return;
    try {
      favoriteIds = (await api.favorites()).map((v) => v.id).toSet();
      notifyListeners();
    } catch (_) {}
  }

  Future<void> login(String email, String password) async {
    final u = await api.login(email, password);
    if (u.role != 'client') {
      await api.logout();
      throw ApiException(
        403,
        'Ce compte est un compte professionnel : utilisez le Web Admin.',
      );
    }
    user = u;
    await loadFavorites();
    notifyListeners();
  }

  Future<void> register(Map<String, String> data) async {
    user = await api.register(data);
    favoriteIds = {};
    notifyListeners();
  }

  Future<void> updateProfile(Map<String, String> data) async {
    user = await api.updateProfile(data);
    notifyListeners();
  }

  Future<void> logout() async {
    await api.logout();
    user = null;
    favoriteIds = {};
    notifyListeners();
  }

  bool isFavorite(int id) => favoriteIds.contains(id);

  /// Bascule un favori (mise à jour optimiste, annulée en cas d'erreur).
  Future<void> toggleFavorite(int id) async {
    final was = favoriteIds.contains(id);
    was ? favoriteIds.remove(id) : favoriteIds.add(id);
    notifyListeners();
    try {
      was ? await api.removeFavorite(id) : await api.addFavorite(id);
      favoritesRevision++;
      notifyListeners();
    } catch (e) {
      was ? favoriteIds.add(id) : favoriteIds.remove(id);
      notifyListeners();
      rethrow;
    }
  }
}
