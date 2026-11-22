/// Modèles de données de l'API publique.
library;

double? _d(dynamic v) => v == null ? null : (v as num).toDouble();

class Photo {
  final int id;
  final String url;
  final String thumbUrl;
  Photo({required this.id, required this.url, required this.thumbUrl});
  factory Photo.fromJson(Map<String, dynamic> j) =>
      Photo(id: j['id'], url: j['url'], thumbUrl: j['thumbUrl'] ?? j['url']);
}

class Company {
  final int id;
  final String name;
  final String? logoUrl, phone, whatsapp, email, city, address;
  Company({
    required this.id,
    required this.name,
    this.logoUrl,
    this.phone,
    this.whatsapp,
    this.email,
    this.city,
    this.address,
  });
  factory Company.fromJson(Map<String, dynamic> j) => Company(
    id: j['id'],
    name: j['name'],
    logoUrl: j['logoUrl'],
    phone: j['phone'],
    whatsapp: j['whatsapp'],
    email: j['email'],
    city: j['city'],
    address: j['address'],
  );
}

class Feature {
  final int id;
  final String name;
  final String? icon;
  Feature({required this.id, required this.name, this.icon});
  factory Feature.fromJson(Map<String, dynamic> j) =>
      Feature(id: j['id'], name: j['name'], icon: j['icon']);
}

class Category {
  final int id;
  final String name;
  final String? icon;
  final int count;
  Category({required this.id, required this.name, this.icon, this.count = 0});
  factory Category.fromJson(Map<String, dynamic> j) => Category(
    id: j['id'],
    name: j['name'],
    icon: j['icon'],
    count: j['count'] ?? 0,
  );
}

class Vehicle {
  final int id;
  final String brand, model, title, currency;
  final int? year, seats, doors, mileage;
  final String? fuelType,
      transmission,
      color,
      city,
      address,
      description,
      rentalConditions,
      availability,
      coverUrl,
      coverThumbUrl,
      videoUrl;
  final double? priceDaily, priceWeekly, priceMonthly;

  /// none = sans chauffeur, optional = chauffeur en option, included = chauffeur inclus.
  final String driverMode;
  final double? driverPriceDaily, driverPriceWeekly, driverPriceMonthly;
  final Category? category;
  final List<Feature> features;
  final List<Photo> photos;
  final Company? company;
  final int viewsCount, contactsCount;
  bool isFavorite;
  final List<Vehicle> similar;

  Vehicle({
    required this.id,
    required this.brand,
    required this.model,
    required this.title,
    required this.currency,
    this.year,
    this.seats,
    this.doors,
    this.mileage,
    this.fuelType,
    this.transmission,
    this.color,
    this.city,
    this.address,
    this.description,
    this.rentalConditions,
    this.availability,
    this.coverUrl,
    this.coverThumbUrl,
    this.videoUrl,
    this.priceDaily,
    this.priceWeekly,
    this.priceMonthly,
    this.driverMode = 'none',
    this.driverPriceDaily,
    this.driverPriceWeekly,
    this.driverPriceMonthly,
    this.category,
    this.features = const [],
    this.photos = const [],
    this.company,
    this.viewsCount = 0,
    this.contactsCount = 0,
    this.isFavorite = false,
    this.similar = const [],
  });

  factory Vehicle.fromJson(Map<String, dynamic> j) => Vehicle(
    id: j['id'],
    brand: j['brand'],
    model: j['model'],
    title: j['title'] ?? '${j['brand']} ${j['model']}',
    currency: j['currency'] ?? 'USD',
    year: j['year'],
    seats: j['seats'],
    doors: j['doors'],
    mileage: j['mileage'],
    fuelType: j['fuelType'],
    transmission: j['transmission'],
    color: j['color'],
    city: j['city'],
    address: j['address'],
    description: j['description'],
    rentalConditions: j['rentalConditions'],
    availability: j['availability'],
    coverUrl: j['coverUrl'],
    coverThumbUrl: j['coverThumbUrl'],
    videoUrl: j['video']?['url'],
    priceDaily: _d(j['priceDaily']),
    priceWeekly: _d(j['priceWeekly']),
    priceMonthly: _d(j['priceMonthly']),
    driverMode:
        j['driverMode'] ?? (j['withDriver'] == true ? 'included' : 'none'),
    driverPriceDaily: _d(j['driverPriceDaily']),
    driverPriceWeekly: _d(j['driverPriceWeekly']),
    driverPriceMonthly: _d(j['driverPriceMonthly']),
    category: j['category'] != null ? Category.fromJson(j['category']) : null,
    features: (j['features'] as List? ?? [])
        .map((e) => Feature.fromJson(e))
        .toList(),
    photos: (j['photos'] as List? ?? []).map((e) => Photo.fromJson(e)).toList(),
    company: j['company'] != null ? Company.fromJson(j['company']) : null,
    viewsCount: j['viewsCount'] ?? 0,
    contactsCount: j['contactsCount'] ?? 0,
    isFavorite: j['isFavorite'] == true,
    similar: (j['similar'] as List? ?? [])
        .map((e) => Vehicle.fromJson(e))
        .toList(),
  );

  /// Prix le plus représentatif à afficher sur une carte.
  ({double value, String unit})? get mainPrice {
    if (priceDaily != null) return (value: priceDaily!, unit: 'jour');
    if (priceWeekly != null) return (value: priceWeekly!, unit: 'semaine');
    if (priceMonthly != null) return (value: priceMonthly!, unit: 'mois');
    return null;
  }
}

class Paged<T> {
  final List<T> items;
  final int page, pages, total;
  Paged(this.items, this.page, this.pages, this.total);
}

class PublicConfig {
  final String platformName, currency;
  final String? supportEmail, supportPhone;
  final bool allowClientRegistration;
  final List<Category> categories;
  final List<Feature> features;
  final List<({String name, int count})> brands, cities;
  final double minPrice, maxPrice;
  final int maxSeats;

  PublicConfig({
    required this.platformName,
    required this.currency,
    this.supportEmail,
    this.supportPhone,
    required this.allowClientRegistration,
    required this.categories,
    required this.features,
    required this.brands,
    required this.cities,
    required this.minPrice,
    required this.maxPrice,
    required this.maxSeats,
  });

  factory PublicConfig.fromJson(Map<String, dynamic> j) {
    List<({String name, int count})> named(List? l) => (l ?? [])
        .map(
          (e) =>
              (name: e['name'] as String, count: (e['count'] as num).toInt()),
        )
        .toList();
    return PublicConfig(
      platformName: j['platformName'] ?? 'ZwaCar',
      currency: j['currency'] ?? 'USD',
      supportEmail: j['supportEmail'],
      supportPhone: j['supportPhone'],
      allowClientRegistration: j['allowClientRegistration'] != false,
      categories: (j['categories'] as List? ?? [])
          .map((e) => Category.fromJson(e))
          .toList(),
      features: (j['features'] as List? ?? [])
          .map((e) => Feature.fromJson(e))
          .toList(),
      brands: named(j['brands']),
      cities: named(j['cities']),
      minPrice: _d(j['priceRange']?['min']) ?? 0,
      maxPrice: _d(j['priceRange']?['max']) ?? 0,
      maxSeats: j['maxSeats'] ?? 9,
    );
  }
}

class AppUser {
  final int id;
  final String firstName, lastName, email, role;
  final String? phone;
  AppUser({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.email,
    required this.role,
    this.phone,
  });
  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
    id: j['id'],
    firstName: j['firstName'],
    lastName: j['lastName'],
    email: j['email'],
    role: j['role'],
    phone: j['phone'],
  );
  String get initials =>
      '${firstName.isNotEmpty ? firstName[0] : ''}${lastName.isNotEmpty ? lastName[0] : ''}'
          .toUpperCase();
}

/// Critères de recherche (filtres + tri).
class SearchFilters {
  String q = '';
  Set<int> categoryIds = {};
  String? brand, city, transmission;
  Set<String> fuelTypes = {};
  double? minPrice, maxPrice;
  int? seats;

  /// 'with' = avec chauffeur, 'without' = sans chauffeur, null = indifférent.
  String? driver;
  bool availableOnly = false;
  Set<int> featureIds = {};
  String sort = 'recent';

  SearchFilters();

  SearchFilters copy() => SearchFilters()
    ..q = q
    ..categoryIds = {...categoryIds}
    ..brand = brand
    ..city = city
    ..transmission = transmission
    ..fuelTypes = {...fuelTypes}
    ..minPrice = minPrice
    ..maxPrice = maxPrice
    ..seats = seats
    ..driver = driver
    ..availableOnly = availableOnly
    ..featureIds = {...featureIds}
    ..sort = sort;

  int get activeCount =>
      (categoryIds.isNotEmpty ? 1 : 0) +
      (brand != null ? 1 : 0) +
      (city != null ? 1 : 0) +
      (transmission != null ? 1 : 0) +
      (fuelTypes.isNotEmpty ? 1 : 0) +
      (minPrice != null || maxPrice != null ? 1 : 0) +
      (seats != null ? 1 : 0) +
      (driver != null ? 1 : 0) +
      (availableOnly ? 1 : 0) +
      (featureIds.isNotEmpty ? 1 : 0);

  Map<String, String> toQuery() => {
    if (q.trim().isNotEmpty) 'q': q.trim(),
    if (categoryIds.isNotEmpty) 'categoryId': categoryIds.join(','),
    if (brand != null) 'brand': brand!,
    if (city != null) 'city': city!,
    if (transmission != null) 'transmission': transmission!,
    if (fuelTypes.isNotEmpty) 'fuelType': fuelTypes.join(','),
    if (minPrice != null) 'minPrice': minPrice!.round().toString(),
    if (maxPrice != null) 'maxPrice': maxPrice!.round().toString(),
    if (seats != null) 'seats': '$seats',
    if (driver != null) 'driver': driver!,
    if (availableOnly) 'availableOnly': 'true',
    if (featureIds.isNotEmpty) 'featureIds': featureIds.join(','),
    'sort': sort,
  };
}

const fuelLabels = {
  'petrol': 'Essence',
  'diesel': 'Diesel',
  'hybrid': 'Hybride',
  'electric': 'Électrique',
  'lpg': 'GPL',
  'other': 'Autre',
};
const transmissionLabels = {'manual': 'Manuelle', 'automatic': 'Automatique'};
const availabilityLabels = {
  'available': 'Disponible',
  'rented': 'En location',
  'maintenance': 'En maintenance',
};
const sortLabels = {
  'recent': 'Plus récents',
  'price_asc': 'Prix croissant',
  'price_desc': 'Prix décroissant',
  'popular': 'Popularité',
};

extension VehicleDriver on Vehicle {
  bool get driverOptional => driverMode == 'optional';
  bool get driverIncluded => driverMode == 'included';
  bool get offersDriver => driverMode != 'none';

  String get driverLabel => switch (driverMode) {
    'optional' => 'Chauffeur en option',
    'included' => 'Avec chauffeur',
    _ => 'Sans chauffeur',
  };
}

/// Estimation de location calculée par l'API.
class Quote {
  final int days;
  final bool withDriver, driverIncluded;
  final double vehicleCost, driverCost, total, perDay;
  final String currency;

  Quote({
    required this.days,
    required this.withDriver,
    required this.driverIncluded,
    required this.vehicleCost,
    required this.driverCost,
    required this.total,
    required this.perDay,
    required this.currency,
  });

  factory Quote.fromJson(Map<String, dynamic> j) => Quote(
    days: j['days'],
    withDriver: j['withDriver'] == true,
    driverIncluded: j['driverIncluded'] == true,
    vehicleCost: _d(j['vehicleCost']) ?? 0,
    driverCost: _d(j['driverCost']) ?? 0,
    total: _d(j['total']) ?? 0,
    perDay: _d(j['perDay']) ?? 0,
    currency: j['currency'] ?? 'USD',
  );
}
