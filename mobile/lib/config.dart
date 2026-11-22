/// Configuration de l'application.
///
/// L'URL de l'API peut être fournie à la compilation :
///   flutter run --dart-define=API_URL=http://10.0.2.2:4100/api
/// Par défaut : https://www.zwacar.space/api (y compris en mode debug).
class AppConfig {
  static const String _fromEnv = String.fromEnvironment('API_URL');

  static String get apiUrl =>
      _fromEnv.isNotEmpty ? _fromEnv : productionApiUrl;

  static const productionApiUrl = 'https://www.zwacar.space/api';
  static const appName = 'ZwaCar';
}
