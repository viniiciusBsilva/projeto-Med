import 'package:flutter/material.dart';

import '../../core/api/patient_api.dart';
import 'tabs/agenda_tab.dart';
import 'tabs/mensagens_tab.dart';
import 'tabs/notificacoes_tab.dart';
import 'tabs/perfil_tab.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  static const _tabs = [
    AgendaTab(),
    MensagensTab(),
    NotificacoesTab(),
    PerfilTab(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _index, children: _tabs),
      bottomNavigationBar: StreamBuilder<List<Map<String, dynamic>>>(
        stream: PatientApi.instance.notificationsStream(),
        builder: (context, snapshot) {
          final unread = (snapshot.data ?? const [])
              .where((n) => n['read'] != true)
              .length;
          return NavigationBar(
            selectedIndex: _index,
            onDestinationSelected: (i) => setState(() => _index = i),
            destinations: [
              const NavigationDestination(
                  icon: Icon(Icons.calendar_month_outlined),
                  selectedIcon: Icon(Icons.calendar_month),
                  label: 'Agenda'),
              const NavigationDestination(
                  icon: Icon(Icons.chat_bubble_outline),
                  selectedIcon: Icon(Icons.chat_bubble),
                  label: 'Mensagens'),
              NavigationDestination(
                icon: Badge(
                  isLabelVisible: unread > 0,
                  label: Text('$unread'),
                  child: const Icon(Icons.notifications_outlined),
                ),
                selectedIcon: Badge(
                  isLabelVisible: unread > 0,
                  label: Text('$unread'),
                  child: const Icon(Icons.notifications),
                ),
                label: 'Notificações',
              ),
              const NavigationDestination(
                  icon: Icon(Icons.person_outline),
                  selectedIcon: Icon(Icons.person),
                  label: 'Perfil'),
            ],
          );
        },
      ),
    );
  }
}
