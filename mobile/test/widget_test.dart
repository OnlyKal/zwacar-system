import 'package:flutter_test/flutter_test.dart';
import 'package:zwacar/models.dart';

void main() {
  test('Les filtres de recherche produisent les bons paramètres', () {
    final f = SearchFilters()
      ..q = ' Toyota '
      ..categoryIds = {1, 3}
      ..fuelTypes = {'diesel'}
      ..seats = 7
      ..availableOnly = true
      ..sort = 'price_asc';
    final q = f.toQuery();
    expect(q['q'], 'Toyota');
    expect(q['categoryId'], '1,3');
    expect(q['fuelType'], 'diesel');
    expect(q['seats'], '7');
    expect(q['availableOnly'], 'true');
    expect(q['sort'], 'price_asc');
    expect(f.activeCount, 4);
  });

  test('Le prix principal privilégie le tarif journalier', () {
    final v = Vehicle.fromJson({'id': 1, 'brand': 'Kia', 'model': 'Rio', 'priceWeekly': 300, 'priceDaily': 50, 'currency': 'USD'});
    expect(v.mainPrice!.value, 50);
    expect(v.mainPrice!.unit, 'jour');
  });
}
