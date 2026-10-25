# WatchStream

Gemeinsam Streams schauen – direkt von Browser zu Browser, ohne eigenen Medienserver.

WatchStream ist eine Browser-Extension für Chrome, Brave und Firefox. Ein Host lädt bis zu drei
Zuschauer ein, und alle schauen synchron dasselbe: Netflix, YouTube oder andere Videos im Browser.

> **Status:** Konzeptphase. Es gibt noch keinen lauffähigen Code. Die Architektur ist in
> [ADR-0001](docs/adr/ADR-0001-p2p-watchparty-browser-extension.md) beschrieben.

## Wie es funktioniert

WatchStream hat zwei Modi und wählt automatisch den passenden:

| Modus | Wofür | Qualität | Voraussetzung |
|---|---|---|---|
| **Sync** (Standard) | Netflix, Disney+, Prime Video, YouTube und alles, was jeder selbst öffnen kann | Original | Jeder Zuschauer hat eigenen Zugang zum Inhalt |
| **Stream** | Inhalte ohne DRM, die nur der Host öffnen kann | Neu kodiert, nahezu verlustfrei | Nur der Host braucht Zugang |

- **Direktverbindung:** Die Teilnehmer verbinden sich per WebRTC direkt mit dem Host. Video, Ton
  und Steuerdaten laufen Ende-zu-Ende verschlüsselt und über keinen WatchStream-Server.
- **Einladung per Code:** Der Host schickt einen Einladungscode über einen beliebigen Messenger,
  der Zuschauer schickt einen Antwortcode zurück.
- **Host steuert:** Play, Pause und Spulen macht nur der Host, die Zuschauer folgen automatisch.

## Einschränkungen

- Bei Diensten mit Kopierschutz (Netflix, Disney+ usw.) braucht jeder Zuschauer ein eigenes Abo.
  WatchStream umgeht keinen Kopierschutz.
- Im Stream-Modus begrenzt der Upload des Hosts die Qualität. Gedacht ist er für 2–3 Zuschauer.
- Firefox kann als Host im Stream-Modus keinen Ton aufnehmen.
- Hinter manchen Routern (z. B. Carrier-Grade-NAT) kommt ohne zusätzlichen Relay-Server (TURN)
  keine Direktverbindung zustande.
- Für die Adressermittlung wird ein öffentlicher STUN-Server genutzt. Er sieht die öffentlichen
  IP-Adressen der Teilnehmer, aber keine Inhalte.

## Geplante Technik

- TypeScript, [WXT](https://wxt.dev) als Cross-Browser-Framework
- Manifest V3
- WebRTC (Data Channel für Sync und Chat, Medien-Tracks für den Stream-Modus)

## Roadmap

- [ ] **M1:** Verbindungsaufbau per Code, Chat, getestet in Chrome, Brave und Firefox
- [ ] **M2:** Sync-Modus mit generischem Video-Adapter, YouTube
- [ ] **M3:** Netflix-Adapter
- [ ] **M4:** Stream-Modus
- [ ] **M5:** Weitere Dienste, optionaler TURN- und Signaling-Dienst

## Dokumentation

- [Architekturentscheidungen (ADRs)](docs/adr/)

## Hinweis

WatchStream steht in keiner Verbindung zu Netflix, YouTube, Disney+, Amazon oder anderen
genannten Diensten. Alle Marken gehören ihren jeweiligen Inhabern.

## Lizenz

[MIT](LICENSE) © 2026 Mathias Kuhlmey
