import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kReleaseMode;

/// Configuration de l'application.
///
/// L'URL de l'API peut être fournie à la compilation :
///   flutter run --dart-define=API_URL=https://api.zwacar.com/api
/// Par défaut : version publiée → https://www.zwacar.space/api ;
/// développement : émulateur Android → 10.0.2.2 (machine hôte), iOS / desktop → localhost.
class AppConfig {
  static const String _fromEnv = String.fromEnvironment('API_URL');

  static String get apiUrl {
    if (_fromEnv.isNotEmpty) return _fromEnv;
    if (kReleaseMode) return productionApiUrl;
    try {
      if (Platform.isAndroid) return 'http://10.0.2.2:4100/api';
    } catch (_) {}
    return 'http://localhost:4100/api';
  }

  static const productionApiUrl = 'https://www.zwacar.space/api';
  static const appName = 'ZwaCar';
}
