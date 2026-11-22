import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/api.dart';
import '../services/app_state.dart';
import '../theme.dart';
import '../widgets/logo.dart';
import '../widgets/common.dart';
import '../widgets/hud.dart';

/// Compte client : connexion, inscription, mot de passe oublié, profil.
/// L'utilisation de la plateforme reste gratuite et possible sans compte.
class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    if (!state.isLoggedIn) {
      // Écran de connexion sombre, identique au Web Admin.
      return const AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: Scaffold(backgroundColor: HudColors.bg, body: _AuthForms()),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Mon compte')),
      body: const _Profile(),
    );
  }
}

class _Profile extends StatelessWidget {
  const _Profile();

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final u = state.user!;
    final cfg = state.config;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: AppColors.ink,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Row(
            children: [
              Container(
                width: 60,
                height: 60,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: AppColors.gold,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  u.initials,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: 20,
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${u.firstName} ${u.lastName}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 18,
                      ),
                    ),
                    Text(
                      u.email,
                      style: const TextStyle(color: Color(0xFFC9C3B2)),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        _Tile(
          icon: Icons.person_outline_rounded,
          label: 'Modifier mon profil',
          onTap: () => _editProfile(context),
        ),
        _Tile(
          icon: Icons.favorite_border_rounded,
          label: '${state.favoriteIds.length} véhicule(s) en favoris',
        ),
        if (cfg?.supportEmail != null)
          _Tile(
            icon: Icons.support_agent_rounded,
            label: 'Contacter le support',
            onTap: () => launchUrl(Uri.parse('mailto:${cfg!.supportEmail}')),
          ),
        if (cfg?.supportPhone != null && cfg!.supportPhone!.isNotEmpty)
          _Tile(
            icon: Icons.call_outlined,
            label: cfg.supportPhone!,
            onTap: () => launchUrl(
              Uri.parse('tel:${cfg.supportPhone!.replaceAll(' ', '')}'),
            ),
          ),
        const SizedBox(height: 18),
        OutlinedButton.icon(
          onPressed: () => state.logout(),
          icon: const Icon(Icons.logout_rounded, color: AppColors.red),
          label: const Text(
            'Se déconnecter',
            style: TextStyle(color: AppColors.red),
          ),
        ),
      ],
    );
  }

  void _editProfile(BuildContext context) {
    final state = context.read<AppState>();
    final u = state.user!;
    final first = TextEditingController(text: u.firstName),
        last = TextEditingController(text: u.lastName),
        phone = TextEditingController(text: u.phone ?? '');
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(6)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          20,
          20,
          MediaQuery.of(ctx).viewInsets.bottom + 20,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Mon profil',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: first,
              decoration: const InputDecoration(labelText: 'Prénom'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: last,
              decoration: const InputDecoration(labelText: 'Nom'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: phone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Téléphone'),
            ),
            const SizedBox(height: 18),
            FilledButton(
              onPressed: () async {
                try {
                  await state.updateProfile({
                    'firstName': first.text.trim(),
                    'lastName': last.text.trim(),
                    'phone': phone.text.trim(),
                  });
                  if (ctx.mounted) Navigator.pop(ctx);
                  if (context.mounted) showSnack(context, 'Profil mis à jour');
                } catch (e) {
                  if (ctx.mounted) showSnack(ctx, e.toString(), error: true);
                }
              },
              child: const Text('Enregistrer'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  const _Tile({required this.icon, required this.label, this.onTap});
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 6),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(6),
    ),
    child: ListTile(
      leading: Icon(icon, color: AppColors.gold),
      title: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
      trailing: onTap != null ? const Icon(Icons.chevron_right_rounded) : null,
      onTap: onTap,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
    ),
  );
}

class _AuthForms extends StatefulWidget {
  const _AuthForms();
  @override
  State<_AuthForms> createState() => _AuthFormsState();
}

class _AuthFormsState extends State<_AuthForms> {
  String mode = 'login'; // login | register | forgot
  final _form = GlobalKey<FormState>();
  final email = TextEditingController(),
      password = TextEditingController(),
      first = TextEditingController(),
      last = TextEditingController(),
      phone = TextEditingController();
  bool loading = false, obscure = true;

  static final _emailRe = RegExp(r'^\S+@\S+\.\S+$');
  static final _pwdRe = RegExp(r'^(?=.*[A-Za-z])(?=.*\d).{8,}$');

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    final state = context.read<AppState>();
    setState(() => loading = true);
    try {
      if (mode == 'login') {
        await state.login(email.text.trim(), password.text);
        if (mounted) showSnack(context, 'Bienvenue ${state.user!.firstName} !');
      } else if (mode == 'register') {
        await state.register({
          'firstName': first.text.trim(),
          'lastName': last.text.trim(),
          'email': email.text.trim(),
          'phone': phone.text.trim(),
          'password': password.text,
        });
        if (mounted) {
          showSnack(
            context,
            'Compte créé ! Un email de confirmation vous a été envoyé.',
          );
        }
      } else {
        await Api.instance.forgotPassword(email.text.trim());
        if (mounted) {
          showSnack(
            context,
            'Si un compte existe, un lien de réinitialisation a été envoyé par email.',
          );
          setState(() => mode = 'login');
        }
      }
    } catch (e) {
      if (mounted) showSnack(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final allowRegister =
        context.watch<AppState>().config?.allowClientRegistration ?? true;
    final title = {
      'login': 'Connexion',
      'register': 'Créer un compte',
      'forgot': 'Mot de passe oublié',
    }[mode]!;
    final top = MediaQuery.of(context).padding.top;
    return Theme(
      data: _darkTheme(Theme.of(context)),
      child: Stack(
        children: [
          const Positioned.fill(child: HudGrid()),
          Form(
            key: _form,
            child: ListView(
              padding: EdgeInsets.fromLTRB(22, top + 18, 22, 28),
              children: [
                const _Brand(),
                const SizedBox(height: 22),
                if (mode == 'login') ...[
                  Row(
                    children: [
                      Container(
                        width: 7,
                        height: 7,
                        decoration: const BoxDecoration(
                          color: HudColors.gold,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Text(
                        'ESPACE CLIENT',
                        style: TextStyle(
                          color: HudColors.gold,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 2.4,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 18),
                  const Stack(
                    clipBehavior: Clip.none,
                    children: [
                      HudCar(),
                      Positioned(
                        left: 0,
                        top: 0,
                        child: HudChip(label: 'RECHERCHE', value: 'Gratuite'),
                      ),
                      Positioned(
                        right: 0,
                        top: 0,
                        child: HudChip(
                          label: 'CONTACT',
                          value: 'Direct',
                          accent: '24/7',
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                ],
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 250),
                  layoutBuilder: (current, previous) => Stack(
                    alignment: Alignment.centerLeft,
                    children: [...previous, ?current],
                  ),
                  child: Text(
                    title,
                    key: ValueKey(title),
                    style: const TextStyle(
                      fontSize: 30,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                      letterSpacing: -0.8,
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  {
                    'login': 'Retrouvez vos véhicules favoris.',
                    'register': 'Gratuit, en moins d’une minute.',
                    'forgot': 'Recevez un lien de réinitialisation par email.',
                  }[mode]!,
                  style: const TextStyle(color: HudColors.muted),
                ),
                const SizedBox(height: 24),
                if (mode == 'register') ...[
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: first,
                          decoration: const InputDecoration(
                            labelText: 'Prénom',
                          ),
                          validator: (v) =>
                              (v ?? '').trim().length < 2 ? 'Requis' : null,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: TextFormField(
                          controller: last,
                          decoration: const InputDecoration(labelText: 'Nom'),
                          validator: (v) =>
                              (v ?? '').trim().length < 2 ? 'Requis' : null,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: phone,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      labelText: 'Téléphone (facultatif)',
                      prefixIcon: Icon(Icons.phone_outlined),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                TextFormField(
                  controller: email,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  decoration: const InputDecoration(
                    labelText: 'Email',
                    prefixIcon: Icon(Icons.mail_outline_rounded),
                  ),
                  validator: (v) => _emailRe.hasMatch((v ?? '').trim())
                      ? null
                      : 'Email invalide',
                ),
                if (mode != 'forgot') ...[
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: password,
                    obscureText: obscure,
                    decoration: InputDecoration(
                      labelText: 'Mot de passe',
                      prefixIcon: const Icon(Icons.lock_outline_rounded),
                      suffixIcon: IconButton(
                        icon: Icon(
                          obscure
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                        ),
                        onPressed: () => setState(() => obscure = !obscure),
                      ),
                      helperText: mode == 'register'
                          ? '8 caractères minimum, avec une lettre et un chiffre'
                          : null,
                    ),
                    validator: (v) {
                      if ((v ?? '').isEmpty) return 'Requis';
                      if (mode == 'register' && !_pwdRe.hasMatch(v!)) {
                        return '8 caractères min., lettre et chiffre';
                      }
                      return null;
                    },
                  ),
                ],
                if (mode == 'login')
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: () => setState(() => mode = 'forgot'),
                      child: const Text(
                        'Mot de passe oublié ?',
                        style: TextStyle(
                          color: HudColors.gold,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                const SizedBox(height: 14),
                FilledButton(
                  onPressed: loading ? null : _submit,
                  child: loading
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2.4,
                            color: Colors.white,
                          ),
                        )
                      : Text(
                          {
                            'login': 'Se connecter',
                            'register': 'Créer mon compte',
                            'forgot': 'Envoyer le lien',
                          }[mode]!,
                        ),
                ),
                const SizedBox(height: 14),
                if (mode == 'login' && allowRegister)
                  TextButton(
                    onPressed: () => setState(() => mode = 'register'),
                    child: const Text(
                      'Pas encore de compte ? Inscrivez-vous gratuitement',
                      style: TextStyle(
                        color: HudColors.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  )
                else if (mode != 'login')
                  TextButton(
                    onPressed: () => setState(() => mode = 'login'),
                    child: const Text(
                      'J’ai déjà un compte',
                      style: TextStyle(
                        color: HudColors.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                const SizedBox(height: 18),
                const Text(
                  'La recherche et le contact des loueurs restent gratuits et sans compte.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: HudColors.muted,
                    fontSize: 12,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Thème sombre local : champs pleins sans bordure, anneau doré au focus.
  static ThemeData _darkTheme(ThemeData base) {
    OutlineInputBorder b([Color? c]) => OutlineInputBorder(
      borderRadius: BorderRadius.circular(6),
      borderSide: c == null
          ? BorderSide.none
          : BorderSide(color: c, width: 1.6),
    );
    return base.copyWith(
      textSelectionTheme: const TextSelectionThemeData(
        cursorColor: HudColors.gold,
        selectionColor: Color(0x55D2B65C),
        selectionHandleColor: HudColors.gold,
      ),
      inputDecorationTheme: base.inputDecorationTheme.copyWith(
        filled: true,
        fillColor: HudColors.field,
        labelStyle: const TextStyle(color: HudColors.muted),
        floatingLabelStyle: const TextStyle(color: HudColors.gold),
        hintStyle: const TextStyle(color: Color(0xFF5F5A4D)),
        helperStyle: const TextStyle(color: HudColors.muted),
        prefixIconColor: const Color(0xFF6F6A5C),
        suffixIconColor: const Color(0xFF8F8977),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 16,
        ),
        border: b(),
        enabledBorder: b(),
        focusedBorder: b(HudColors.gold),
        errorBorder: b(AppColors.red),
        focusedErrorBorder: b(AppColors.red),
      ),
      textTheme: base.textTheme.apply(
        bodyColor: Colors.white,
        displayColor: Colors.white,
      ),
    );
  }
}

class _Brand extends StatelessWidget {
  const _Brand();
  @override
  Widget build(BuildContext context) => Row(
    children: [
      const ZwaLogo(size: 38),
      const SizedBox(width: 10),
      const Text(
        'ZwaCar',
        style: TextStyle(
          color: Colors.white,
          fontSize: 19,
          fontWeight: FontWeight.w800,
        ),
      ),
    ],
  );
}
