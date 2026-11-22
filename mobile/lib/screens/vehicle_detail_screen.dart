import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';

import '../models.dart';
import '../services/api.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/vehicle_card.dart';

class VehicleDetailScreen extends StatefulWidget {
  final int vehicleId;
  final Vehicle? preview;
  const VehicleDetailScreen({super.key, required this.vehicleId, this.preview});
  @override
  State<VehicleDetailScreen> createState() => _VehicleDetailScreenState();
}

class _VehicleDetailScreenState extends State<VehicleDetailScreen> {
  Vehicle? v;
  String? error;
  int photo = 0;
  String? contacting;

  // Estimation de location : durée choisie et option chauffeur.
  int days = 1;
  bool withDriver = false;
  Quote? quote;
  bool quoting = false;
  String? quoteError;
  int _quoteSeq = 0;

  @override
  void initState() {
    super.initState();
    v = widget.preview;
    if (v != null) withDriver = v!.driverIncluded;
    _load();
  }

  Future<void> _load() async {
    try {
      final full = await Api.instance.vehicle(widget.vehicleId);
      if (!mounted) return;
      setState(() {
        v = full;
        if (full.driverIncluded) withDriver = true;
        if (!full.offersDriver) withDriver = false;
      });
      _refreshQuote();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  /// Recalcule l'estimation côté serveur (seule la dernière requête est prise en compte).
  Future<void> _refreshQuote() async {
    final seq = ++_quoteSeq;
    setState(() {
      quoting = true;
      quoteError = null;
    });
    try {
      final q = await Api.instance.quote(widget.vehicleId, days, withDriver);
      if (mounted && seq == _quoteSeq) setState(() => quote = q);
    } catch (e) {
      if (mounted && seq == _quoteSeq) {
        setState(() => quoteError = e.toString());
      }
    } finally {
      if (mounted && seq == _quoteSeq) setState(() => quoting = false);
    }
  }

  void _setDays(int d) {
    if (d < 1 || d > 365 || d == days) return;
    setState(() => days = d);
    _refreshQuote();
  }

  void _setDriver(bool value) {
    if (v == null || !v!.driverOptional) return;
    setState(() => withDriver = value);
    _refreshQuote();
  }

  /// Enregistre le contact côté serveur puis ouvre WhatsApp / le téléphone / la messagerie.
  Future<void> _contact(String channel) async {
    setState(() => contacting = channel);
    try {
      final url = await Api.instance.contact(
        widget.vehicleId,
        channel,
        days: days,
        withDriver: withDriver,
      );
      final uri = Uri.parse(url);
      final ok = await launchUrl(
        uri,
        mode: channel == 'whatsapp'
            ? LaunchMode.externalApplication
            : LaunchMode.platformDefault,
      );
      if (!ok && mounted) {
        showSnack(
          context,
          channel == 'whatsapp'
              ? 'WhatsApp n’est pas installé sur cet appareil'
              : 'Impossible d’ouvrir l’application',
          error: true,
        );
      }
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => contacting = null);
    }
  }

  void _openGallery(int index) {
    Navigator.of(context).push(
      PageRouteBuilder(
        opaque: false,
        pageBuilder: (_, __, ___) =>
            _FullscreenGallery(photos: v!.photos, initial: index),
        transitionsBuilder: (_, a, __, c) =>
            FadeTransition(opacity: a, child: c),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (v == null) {
      return Scaffold(
        appBar: AppBar(),
        body: error != null
            ? ErrorState(message: error!, onRetry: _load)
            : const Center(
                child: CircularProgressIndicator(color: AppColors.gold),
              ),
      );
    }
    final veh = v!;
    final full = veh.description != null; // données complètes chargées
    final photos = veh.photos.isNotEmpty ? veh.photos : null;

    return Scaffold(
      backgroundColor: Colors.white,
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 330,
            pinned: true,
            backgroundColor: AppColors.ink,
            foregroundColor: Colors.white,
            leading: Padding(
              padding: const EdgeInsets.all(8),
              child: CircleAvatar(
                backgroundColor: Colors.black38,
                child: BackButton(
                  color: Colors.white,
                  onPressed: () => Navigator.pop(context),
                ),
              ),
            ),
            actions: [
              Padding(
                padding: const EdgeInsets.only(right: 12),
                child: FavoriteButton(vehicleId: veh.id, dark: true),
              ),
            ],
            flexibleSpace: FlexibleSpaceBar(
              background: Stack(
                fit: StackFit.expand,
                children: [
                  if (photos == null)
                    Hero(
                      tag: 'vehicle-${veh.id}',
                      child: NetImage(veh.coverUrl ?? veh.coverThumbUrl),
                    )
                  else
                    PageView.builder(
                      itemCount: photos.length,
                      onPageChanged: (i) => setState(() => photo = i),
                      itemBuilder: (_, i) => GestureDetector(
                        onTap: () => _openGallery(i),
                        child: i == 0
                            ? Hero(
                                tag: 'vehicle-${veh.id}',
                                child: NetImage(photos[i].url),
                              )
                            : NetImage(photos[i].url),
                      ),
                    ),
                  if (photos != null && photos.length > 1)
                    Positioned(
                      bottom: 16,
                      left: 0,
                      right: 0,
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: List.generate(
                          photos.length,
                          (i) => AnimatedContainer(
                            duration: const Duration(milliseconds: 250),
                            margin: const EdgeInsets.symmetric(horizontal: 3),
                            width: i == photo ? 22 : 7,
                            height: 7,
                            decoration: BoxDecoration(
                              color: i == photo
                                  ? AppColors.goldLight
                                  : Colors.white70,
                              borderRadius: BorderRadius.circular(6),
                            ),
                          ),
                        ),
                      ),
                    ),
                  if (photos != null)
                    Positioned(
                      bottom: 12,
                      right: 14,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.black54,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          '${photo + 1}/${photos.length}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (veh.category != null)
                              Text(
                                veh.category!.name.toUpperCase(),
                                style: const TextStyle(
                                  color: AppColors.gold,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 11.5,
                                  letterSpacing: 1.2,
                                ),
                              ),
                            const SizedBox(height: 4),
                            Text(
                              '${veh.title}${veh.year != null ? ' ${veh.year}' : ''}',
                              style: const TextStyle(
                                fontSize: 24,
                                fontWeight: FontWeight.w800,
                                color: AppColors.ink,
                                letterSpacing: -0.5,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Row(
                              children: [
                                const Icon(
                                  Icons.place_outlined,
                                  size: 16,
                                  color: AppColors.muted,
                                ),
                                const SizedBox(width: 3),
                                Expanded(
                                  child: Text(
                                    [
                                      veh.address,
                                      veh.city,
                                    ].whereType<String>().join(', '),
                                    style: const TextStyle(
                                      color: AppColors.muted,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      if (veh.availability != null)
                        _AvailabilityPill(veh.availability!),
                    ],
                  ),
                  const SizedBox(height: 20),
                  _Prices(veh),
                  const SizedBox(height: 16),
                  _RentalEstimator(
                    vehicle: veh,
                    days: days,
                    withDriver: withDriver,
                    quote: quote,
                    loading: quoting,
                    error: quoteError,
                    onDays: _setDays,
                    onDriver: _setDriver,
                    onRetry: _refreshQuote,
                  ),
                  const SizedBox(height: 24),
                  const _H('Caractéristiques'),
                  GridView.count(
                    crossAxisCount: 3,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: 10,
                    crossAxisSpacing: 10,
                    childAspectRatio: 1.05,
                    children: [
                      _SpecTile(
                        Icons.event_seat_outlined,
                        'Places',
                        veh.seats?.toString(),
                      ),
                      _SpecTile(
                        Icons.settings_outlined,
                        'Boîte',
                        transmissionLabels[veh.transmission],
                      ),
                      _SpecTile(
                        Icons.local_gas_station_outlined,
                        'Carburant',
                        fuelLabels[veh.fuelType],
                      ),
                      _SpecTile(
                        Icons.sensor_door_outlined,
                        'Portes',
                        veh.doors?.toString(),
                      ),
                      _SpecTile(Icons.palette_outlined, 'Couleur', veh.color),
                      _SpecTile(
                        Icons.speed_rounded,
                        'Kilométrage',
                        veh.mileage != null
                            ? '${(veh.mileage! / 1000).toStringAsFixed(0)}k km'
                            : null,
                      ),
                    ],
                  ),
                  if (veh.features.isNotEmpty) ...[
                    const SizedBox(height: 24),
                    const _H('Équipements'),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: veh.features
                          .map(
                            (f) => Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 8,
                              ),
                              decoration: BoxDecoration(
                                color: AppColors.field,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(
                                    Icons.check_circle_rounded,
                                    size: 16,
                                    color: AppColors.gold,
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    f.name,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 13,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          )
                          .toList(),
                    ),
                  ],
                  if (veh.videoUrl != null) ...[
                    const SizedBox(height: 24),
                    const _H('Vidéo de présentation'),
                    _VideoBox(url: veh.videoUrl!),
                  ],
                  if (full) ...[
                    const SizedBox(height: 24),
                    const _H('Description'),
                    Text(
                      veh.description ?? '',
                      style: const TextStyle(
                        height: 1.55,
                        color: AppColors.text,
                      ),
                    ),
                  ],
                  if (veh.company != null) ...[
                    const SizedBox(height: 24),
                    const _H('Proposé par'),
                    _CompanyTile(veh.company!),
                  ],
                  if (veh.similar.isNotEmpty) ...[
                    const SizedBox(height: 26),
                    const _H('Véhicules similaires'),
                  ],
                ],
              ),
            ),
          ),
          if (veh.similar.isNotEmpty)
            SliverToBoxAdapter(
              child: SizedBox(
                height: 190,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  itemCount: veh.similar.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 12),
                  itemBuilder: (_, i) =>
                      VehicleMiniCard(v: veh.similar[i], width: 230),
                ),
              ),
            ),
          const SliverToBoxAdapter(child: SizedBox(height: 120)),
        ],
      ),
      bottomNavigationBar: _ContactBar(
        company: veh.company,
        busy: contacting,
        onContact: _contact,
      ),
    );
  }
}

class _H extends StatelessWidget {
  final String text;
  const _H(this.text);
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Text(
      text,
      style: const TextStyle(
        fontSize: 17,
        fontWeight: FontWeight.w800,
        color: AppColors.ink,
        letterSpacing: -0.2,
      ),
    ),
  );
}

class _AvailabilityPill extends StatelessWidget {
  final String value;
  const _AvailabilityPill(this.value);
  @override
  Widget build(BuildContext context) {
    final ok = value == 'available';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: ok ? const Color(0xFFE7F5EF) : const Color(0xFFFFF4E0),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        availabilityLabels[value] ?? value,
        style: TextStyle(
          color: ok ? AppColors.green : const Color(0xFFB26A00),
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    );
  }
}

class _Prices extends StatelessWidget {
  final Vehicle v;
  const _Prices(this.v);
  @override
  Widget build(BuildContext context) {
    final items = [
      ('Jour', v.priceDaily),
      ('Semaine', v.priceWeekly),
      ('Mois', v.priceMonthly),
    ];
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16),
      decoration: BoxDecoration(
        color: AppColors.ink,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            Expanded(
              child: Column(
                children: [
                  Text(
                    'Par ${items[i].$1.toLowerCase()}',
                    style: const TextStyle(
                      color: Color(0xFFBDB6A4),
                      fontSize: 12,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    items[i].$2 != null
                        ? formatPrice(items[i].$2!, v.currency)
                        : '—',
                    style: const TextStyle(
                      color: AppColors.goldLight,
                      fontWeight: FontWeight.w800,
                      fontSize: 18,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _SpecTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final String? value;
  const _SpecTile(this.icon, this.label, this.value);
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: AppColors.bg,
      borderRadius: BorderRadius.circular(6),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Icon(icon, color: AppColors.gold, size: 22),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: const TextStyle(color: AppColors.muted, fontSize: 11.5),
            ),
            Text(
              value ?? '—',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontWeight: FontWeight.w800,
                color: AppColors.ink,
              ),
            ),
          ],
        ),
      ],
    ),
  );
}

class _CompanyTile extends StatelessWidget {
  final Company c;
  const _CompanyTile(this.c);
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: AppColors.field,
      borderRadius: BorderRadius.circular(6),
    ),
    child: Row(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: SizedBox(
            width: 52,
            height: 52,
            child: c.logoUrl != null
                ? NetImage(c.logoUrl, fit: BoxFit.contain)
                : Container(
                    color: AppColors.goldSoft,
                    alignment: Alignment.center,
                    child: Text(
                      c.name[0],
                      style: const TextStyle(
                        color: AppColors.gold,
                        fontWeight: FontWeight.w900,
                        fontSize: 22,
                      ),
                    ),
                  ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                c.name,
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 15,
                  color: AppColors.ink,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                [c.city, c.phone].whereType<String>().join(' · '),
                style: const TextStyle(color: AppColors.muted, fontSize: 12.5),
              ),
            ],
          ),
        ),
        const Icon(Icons.verified_rounded, color: AppColors.gold),
      ],
    ),
  );
}

/// Barre de contact fixe : WhatsApp, appel direct, email.
class _ContactBar extends StatelessWidget {
  final Company? company;
  final String? busy;
  final void Function(String) onContact;
  const _ContactBar({
    required this.company,
    required this.busy,
    required this.onContact,
  });

  @override
  Widget build(BuildContext context) {
    Widget btn(
      String channel,
      IconData icon,
      String label,
      Color bg,
      Color fg,
      bool enabled,
    ) => Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Material(
          color: enabled ? bg : AppColors.line,
          borderRadius: BorderRadius.circular(6),
          child: InkWell(
            borderRadius: BorderRadius.circular(6),
            onTap: enabled && busy == null ? () => onContact(channel) : null,
            child: SizedBox(
              height: 56,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  busy == channel
                      ? SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: fg,
                          ),
                        )
                      : Icon(
                          icon,
                          color: enabled ? fg : AppColors.muted,
                          size: 21,
                        ),
                  const SizedBox(height: 3),
                  Text(
                    label,
                    style: TextStyle(
                      color: enabled ? fg : AppColors.muted,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(
            color: Color(0x1416140F),
            blurRadius: 20,
            offset: Offset(0, -4),
          ),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            btn(
              'whatsapp',
              Icons.chat_rounded,
              'WhatsApp',
              AppColors.whatsapp,
              Colors.white,
              (company?.whatsapp ?? company?.phone) != null,
            ),
            btn(
              'phone',
              Icons.call_rounded,
              'Appeler',
              AppColors.gold,
              Colors.white,
              company?.phone != null,
            ),
            btn(
              'email',
              Icons.mail_rounded,
              'Email',
              AppColors.ink,
              Colors.white,
              company?.email != null,
            ),
          ],
        ),
      ),
    );
  }
}

class _VideoBox extends StatefulWidget {
  final String url;
  const _VideoBox({required this.url});
  @override
  State<_VideoBox> createState() => _VideoBoxState();
}

class _VideoBoxState extends State<_VideoBox> {
  late final VideoPlayerController _c = VideoPlayerController.networkUrl(
    Uri.parse(widget.url),
  );
  bool _ready = false, _failed = false;

  @override
  void initState() {
    super.initState();
    _c
        .initialize()
        .then((_) {
          if (mounted) setState(() => _ready = true);
        })
        .catchError((_) {
          if (mounted) setState(() => _failed = true);
        });
    _c.addListener(() {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(6),
      child: Container(
        color: Colors.black,
        child: AspectRatio(
          aspectRatio: _ready ? _c.value.aspectRatio : 16 / 9,
          child: _failed
              ? const Center(
                  child: Text(
                    'Vidéo indisponible',
                    style: TextStyle(color: Colors.white70),
                  ),
                )
              : !_ready
              ? const Center(
                  child: CircularProgressIndicator(color: AppColors.goldLight),
                )
              : GestureDetector(
                  onTap: () => _c.value.isPlaying ? _c.pause() : _c.play(),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      VideoPlayer(_c),
                      AnimatedOpacity(
                        opacity: _c.value.isPlaying ? 0 : 1,
                        duration: const Duration(milliseconds: 200),
                        child: const CircleAvatar(
                          radius: 30,
                          backgroundColor: Colors.black54,
                          child: Icon(
                            Icons.play_arrow_rounded,
                            color: Colors.white,
                            size: 36,
                          ),
                        ),
                      ),
                      Positioned(
                        left: 0,
                        right: 0,
                        bottom: 0,
                        child: VideoProgressIndicator(
                          _c,
                          allowScrubbing: true,
                          colors: const VideoProgressColors(
                            playedColor: AppColors.gold,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
        ),
      ),
    );
  }
}

class _FullscreenGallery extends StatefulWidget {
  final List<Photo> photos;
  final int initial;
  const _FullscreenGallery({required this.photos, required this.initial});
  @override
  State<_FullscreenGallery> createState() => _FullscreenGalleryState();
}

class _FullscreenGalleryState extends State<_FullscreenGallery> {
  late int i = widget.initial;
  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Colors.black,
    appBar: AppBar(
      backgroundColor: Colors.black,
      foregroundColor: Colors.white,
      title: Text(
        '${i + 1} / ${widget.photos.length}',
        style: const TextStyle(color: Colors.white, fontSize: 16),
      ),
    ),
    body: PageView.builder(
      controller: PageController(initialPage: widget.initial),
      itemCount: widget.photos.length,
      onPageChanged: (p) => setState(() => i = p),
      itemBuilder: (_, p) => InteractiveViewer(
        maxScale: 4,
        child: Center(
          child: NetImage(widget.photos[p].url, fit: BoxFit.contain),
        ),
      ),
    ),
  );
}

/// Estimation du coût : durée + option chauffeur (montants calculés par l'API).
class _RentalEstimator extends StatelessWidget {
  final Vehicle vehicle;
  final int days;
  final bool withDriver;
  final Quote? quote;
  final bool loading;
  final String? error;
  final ValueChanged<int> onDays;
  final ValueChanged<bool> onDriver;
  final VoidCallback onRetry;

  const _RentalEstimator({
    required this.vehicle,
    required this.days,
    required this.withDriver,
    required this.quote,
    required this.loading,
    required this.error,
    required this.onDays,
    required this.onDriver,
    required this.onRetry,
  });

  static const _presets = [1, 3, 7, 14, 30];

  @override
  Widget build(BuildContext context) {
    final cur = vehicle.currency;
    final q = quote;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.bg,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Estimer ma location',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: AppColors.ink,
            ),
          ),
          const SizedBox(height: 12),
          // Durée
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Durée',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
              _StepButton(
                icon: Icons.remove_rounded,
                onTap: days > 1 ? () => onDays(days - 1) : null,
              ),
              SizedBox(
                width: 84,
                child: Text(
                  '$days jour${days > 1 ? 's' : ''}',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    color: AppColors.ink,
                  ),
                ),
              ),
              _StepButton(
                icon: Icons.add_rounded,
                onTap: days < 365 ? () => onDays(days + 1) : null,
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            children: _presets
                .map(
                  (d) => ChoiceChip(
                    label: Text(
                      d == 7
                          ? '1 sem.'
                          : d == 14
                          ? '2 sem.'
                          : d == 30
                          ? '1 mois'
                          : '$d j',
                    ),
                    selected: days == d,
                    showCheckmark: false,
                    visualDensity: VisualDensity.compact,
                    onSelected: (_) => onDays(d),
                    labelStyle: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      color: days == d ? Colors.white : AppColors.ink,
                    ),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 22),
          // Chauffeur
          Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: AppColors.goldSoft,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Icon(
                  Icons.person_pin_rounded,
                  color: AppColors.gold,
                  size: 22,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Avec chauffeur',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      switch (vehicle.driverMode) {
                        'optional' =>
                          vehicle.driverPriceDaily == null ||
                                  vehicle.driverPriceDaily == 0
                              ? 'Sans supplément'
                              : '+ ${formatPrice(vehicle.driverPriceDaily!, cur)} / jour',
                        'included' => 'Chauffeur inclus dans le tarif',
                        _ => 'Non proposé pour ce véhicule',
                      },
                      style: const TextStyle(
                        color: AppColors.muted,
                        fontSize: 12.5,
                      ),
                    ),
                  ],
                ),
              ),
              Switch(
                value: withDriver,
                activeThumbColor: AppColors.gold,
                onChanged: vehicle.driverOptional ? onDriver : null,
              ),
            ],
          ),
          const SizedBox(height: 22),
          // Résultat
          if (error != null && q == null)
            Row(
              children: [
                Expanded(
                  child: Text(
                    error!,
                    style: const TextStyle(color: AppColors.red, fontSize: 13),
                  ),
                ),
                TextButton(onPressed: onRetry, child: const Text('Réessayer')),
              ],
            )
          else ...[
            _Line(
              'Véhicule',
              q == null ? '…' : formatPrice(q.vehicleCost, cur),
            ),
            if (withDriver && vehicle.driverOptional)
              _Line(
                'Chauffeur',
                q == null ? '…' : formatPrice(q.driverCost, cur),
              ),
            if (vehicle.driverIncluded) const _Line('Chauffeur', 'Inclus'),
            const SizedBox(height: 6),
            AnimatedOpacity(
              duration: const Duration(milliseconds: 150),
              opacity: loading ? 0.45 : 1,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  const Expanded(
                    child: Text(
                      'Total estimé',
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        color: AppColors.ink,
                      ),
                    ),
                  ),
                  Text(
                    q == null ? '…' : formatPrice(q.total, cur),
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: AppColors.gold,
                      letterSpacing: -0.4,
                    ),
                  ),
                ],
              ),
            ),
            if (q != null && q.days > 1)
              Align(
                alignment: Alignment.centerRight,
                child: Text(
                  'soit ${formatPrice(q.perDay, cur)} / jour',
                  style: const TextStyle(color: AppColors.muted, fontSize: 12),
                ),
              ),
          ],
          const SizedBox(height: 8),
          const Text(
            'Estimation indicative, à confirmer avec le loueur. Votre choix lui est transmis lorsque vous le contactez.',
            style: TextStyle(
              color: AppColors.muted,
              fontSize: 11.5,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _Line extends StatelessWidget {
  final String label, value;
  const _Line(this.label, this.value);
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(
      children: [
        Expanded(
          child: Text(label, style: const TextStyle(color: AppColors.muted)),
        ),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
      ],
    ),
  );
}

class _StepButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;
  const _StepButton({required this.icon, this.onTap});
  @override
  Widget build(BuildContext context) => Material(
    color: onTap == null ? AppColors.bg : AppColors.goldSoft,
    borderRadius: BorderRadius.circular(6),
    child: InkWell(
      borderRadius: BorderRadius.circular(6),
      onTap: onTap,
      child: SizedBox(
        width: 36,
        height: 36,
        child: Icon(
          icon,
          size: 20,
          color: onTap == null ? AppColors.muted : AppColors.gold,
        ),
      ),
    ),
  );
}
