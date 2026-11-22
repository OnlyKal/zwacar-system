import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';
import '../models.dart';

class ApiException implements Exception {
  final int status;
  final String message;
  ApiException(this.status, this.message);
  @override
  String toString() => message;
}

/// Client HTTP de l'API ZwaCar (endpoints publics + compte client).
/// Le refresh token est stocké localement et utilisé pour renouveler l'access token.
class Api {
  Api._();
  static final Api instance = Api._();

  final _client = http.Client();
  String? _accessToken;
  String? _refreshToken;
  Future<bool>? _refreshing;
  static const _rtKey = 'zw_refresh_token';

  Future<void> loadSession() async {
    final prefs = await SharedPreferences.getInstance();
    _refreshToken = prefs.getString(_rtKey);
  }

  bool get hasSession => _refreshToken != null;

  Future<void> _saveSession(Map<String, dynamic> data) async {
    _accessToken = data['accessToken'];
    _refreshToken = data['refreshToken'];
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_rtKey, _refreshToken!);
  }

  Future<void> clearSession() async {
    _accessToken = null;
    _refreshToken = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_rtKey);
  }

  Uri _uri(String path, [Map<String, String>? query]) => Uri.parse(
    '${AppConfig.apiUrl}$path',
  ).replace(queryParameters: (query?.isEmpty ?? true) ? null : query);

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    if (_accessToken != null) 'Authorization': 'Bearer $_accessToken',
  };

  Future<dynamic> _send(
    String method,
    String path, {
    Map<String, String>? query,
    Object? body,
    bool retry = true,
  }) async {
    http.Response res;
    try {
      final req = http.Request(method, _uri(path, query))
        ..headers.addAll(_headers);
      if (body != null) req.body = jsonEncode(body);
      res = await http.Response.fromStream(
        await _client.send(req).timeout(const Duration(seconds: 25)),
      );
    } on TimeoutException {
      throw ApiException(0, 'Délai dépassé. Vérifiez votre connexion.');
    } catch (_) {
      throw ApiException(
        0,
        'Impossible de joindre le serveur. Vérifiez votre connexion internet.',
      );
    }

    if (res.statusCode == 401 &&
        retry &&
        _refreshToken != null &&
        !path.startsWith('/auth/')) {
      if (await refresh()) {
        return _send(method, path, query: query, body: body, retry: false);
      }
    }
    final decoded = res.body.isNotEmpty
        ? jsonDecode(utf8.decode(res.bodyBytes))
        : null;
    if (res.statusCode >= 400) {
      final err = decoded is Map ? decoded['error'] : null;
      var msg =
          (err is Map ? err['message'] : null) ?? 'Erreur ${res.statusCode}';
      final details = err is Map ? err['details'] as List? : null;
      if (details != null && details.isNotEmpty) {
        msg = details.map((d) => d['message']).join('\n');
      }
      throw ApiException(res.statusCode, msg);
    }
    return decoded;
  }

  /// Renouvelle l'access token (une seule requête à la fois).
  Future<bool> refresh() {
    _refreshing ??= () async {
      try {
        final data = await _send(
          'POST',
          '/auth/refresh',
          body: {'refreshToken': _refreshToken},
          retry: false,
        );
        await _saveSession(data);
        return true;
      } catch (_) {
        await clearSession();
        return false;
      } finally {
        Future.microtask(() => _refreshing = null);
      }
    }();
    return _refreshing!;
  }

  /* ---------------- Public ---------------- */
  Future<PublicConfig> config() async =>
      PublicConfig.fromJson((await _send('GET', '/public/config'))['data']);

  Future<Paged<Vehicle>> vehicles(
    SearchFilters f, {
    int page = 1,
    int limit = 12,
  }) async {
    final j = await _send(
      'GET',
      '/public/vehicles',
      query: {...f.toQuery(), 'page': '$page', 'limit': '$limit'},
    );
    final m = j['meta'];
    return Paged(
      (j['data'] as List).map((e) => Vehicle.fromJson(e)).toList(),
      m['page'],
      m['pages'],
      m['total'],
    );
  }

  Future<Vehicle> vehicle(int id) async =>
      Vehicle.fromJson((await _send('GET', '/public/vehicles/$id'))['data']);

  /// Estimation du coût de location (durée + option chauffeur).
  Future<Quote> quote(int vehicleId, int days, bool withDriver) async =>
      Quote.fromJson(
        (await _send(
          'GET',
          '/public/vehicles/$vehicleId/quote',
          query: {'days': '$days', 'withDriver': '$withDriver'},
        ))['data'],
      );

  /// Enregistre la prise de contact (avec la demande du client) et renvoie
  /// le lien à ouvrir (wa.me, tel:, mailto:).
  Future<String> contact(
    int vehicleId,
    String channel, {
    int? days,
    bool? withDriver,
  }) async => (await _send(
    'POST',
    '/public/vehicles/$vehicleId/contact',
    body: {'channel': channel, 'days': ?days, 'withDriver': ?withDriver},
  ))['data']['url'];

  /* ---------------- Favoris ---------------- */
  Future<List<Vehicle>> favorites() async =>
      ((await _send('GET', '/public/favorites'))['data'] as List)
          .map((e) => Vehicle.fromJson(e))
          .toList();
  Future<void> addFavorite(int id) => _send('POST', '/public/favorites/$id');
  Future<void> removeFavorite(int id) =>
      _send('DELETE', '/public/favorites/$id');

  /* ---------------- Compte ---------------- */
  Future<AppUser> login(String email, String password) async {
    final data = await _send(
      'POST',
      '/auth/login',
      body: {'email': email, 'password': password, 'scope': 'client'},
    );
    await _saveSession(data);
    return AppUser.fromJson(data['user']);
  }

  Future<AppUser> register(Map<String, String> body) async {
    final data = await _send('POST', '/auth/register', body: body);
    await _saveSession(data);
    return AppUser.fromJson(data['user']);
  }

  Future<AppUser> me() async =>
      AppUser.fromJson((await _send('GET', '/auth/me'))['user']);

  Future<void> forgotPassword(String email) =>
      _send('POST', '/auth/forgot-password', body: {'email': email});

  Future<AppUser> updateProfile(Map<String, String> body) async =>
      AppUser.fromJson((await _send('PATCH', '/auth/me', body: body))['user']);

  Future<void> logout() async {
    try {
      await _send(
        'POST',
        '/auth/logout',
        body: {'refreshToken': _refreshToken},
        retry: false,
      );
    } catch (_) {}
    await clearSession();
  }
}
