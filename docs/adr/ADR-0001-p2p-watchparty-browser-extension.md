---
id: ADR-0001
title: P2P-Watchparty als Browser-Extension mit Sync- und Stream-Modus
status: proposed
date: 2026-10-25
deciders: [Mathias Kuhlmey]
---

# ADR-0001: P2P-Watchparty als Browser-Extension mit Sync- und Stream-Modus

## Kontext

watchStream soll gemeinsames Schauen von Streams (Netflix, YouTube und weitere) ermöglichen,
ähnlich wie Hyperbeam, aber mit drei harten Unterschieden:

1. Auslieferung zuerst als **Browser-Extension**, keine Web-App.
2. **Direktverbindung** zwischen den Teilnehmern, kein eigener Medienserver.
3. Ein **Host** steuert, die Zuschauer folgen, möglichst **ohne Qualitätsverlust**.

Hyperbeam betreibt einen virtuellen Browser in der Cloud und streamt dessen Bild. Das steht im
Widerspruch zu Punkt 2 und wird daher nicht übernommen.

### Anforderungen (aus dem Shaping, 2026-10-25)

| Thema | Entscheidung |
|---|---|
| Zuschauer pro Sitzung | 2–3 (plus Host) |
| DRM-Dienste (Netflix, Disney+, Prime, Max) | Pflicht |
| Nicht-DRM-Inhalte, die nur der Host öffnen kann | Pflicht |
| Einladung | Kopierter Code, manueller Handshake akzeptiert |
| Steuerung | Nur der Host |
| Browser | Chrome, Brave, Firefox |

### Technische Randbedingungen

- **DRM:** Widevine-geschützte Inhalte werden bei Tab- oder Bildschirmaufnahme schwarz. Das ist
  eine bewusste Schutzmaßnahme der Plattformen und wird nicht umgangen.
- **Neukodierung:** Jede Aufnahme mit WebRTC wird neu kodiert. Verlustfrei ist nur die Wiedergabe
  des Originals beim Zuschauer selbst.
- **NAT:** Direktverbindungen brauchen STUN zur Adressermittlung. Bei symmetrischem NAT oder CGNAT
  (grob 10–20 % der Fälle) gelingt keine Direktverbindung ohne TURN-Relay.
- **Signaling:** WebRTC braucht einen einmaligen Austausch von Offer/Answer. Ohne Server muss das
  über einen Kanal laufen, den die Nutzer selbst bereitstellen (Messenger).
- **Firefox:** Kein `chrome.tabCapture`. `getDisplayMedia` liefert dort kein Tab-Audio.
- **Brave:** Restriktive Standardrichtlinie für WebRTC-IP-Handling, kann lokale Kandidaten
  einschränken.
- **Extension-URLs:** Extension-Seiten haben pro Browser bzw. pro Installation unterschiedliche
  Adressen (Firefox: zufällige UUID pro Installation). Ein klickbarer Einladungslink ohne Webserver
  ist daher nicht browserübergreifend möglich.

## Entscheidung

### 1. Zwei Betriebsmodi, automatisch gewählt

| | Sync-Modus | Stream-Modus |
|---|---|---|
| Prinzip | Jeder spielt den Inhalt selbst ab, nur der Wiedergabezustand wird synchronisiert | Host nimmt den Tab auf und sendet Video/Audio per WebRTC |
| Einsatz | DRM-Dienste, außerdem alles, was jeder Zuschauer selbst öffnen kann (z. B. YouTube) | Nicht-DRM-Inhalte, die nur der Host öffnen kann |
| Qualität | Original, kein Verlust | Neu kodiert, Ziel nahezu transparent |
| Voraussetzung | Jeder Zuschauer hat eigenen Zugang zum Inhalt | Nur der Host braucht Zugang |
| Last | Vernachlässigbar (Steuernachrichten) | Host-Upload × Zuschauerzahl, ein Encode pro Zuschauer |

Die Extension erkennt DRM über das `<video>`-Element (`video.mediaKeys !== null`). Bei DRM wird nur
der Sync-Modus angeboten, sonst kann der Host wählen. Der Sync-Modus ist der Standard.

### 2. Topologie: Mesh, Host im Zentrum

Stern-Topologie mit dem Host als Mittelpunkt. Jeder Zuschauer hat genau eine `RTCPeerConnection`
zum Host. Bei 2–3 Zuschauern ist kein Relay zwischen Zuschauern nötig.

### 3. Transport

- **Data Channel** (zuverlässig, geordnet) für Sync-Nachrichten, Chat und Sitzungsverwaltung.
- **Medien-Tracks** nur im Stream-Modus.
- **STUN:** öffentlicher STUN-Server als Standard, konfigurierbar. Dort fließen keine Medien.
- **TURN:** nicht im Standard. Ein selbst konfigurierbarer TURN-Server ist als optionaler Fallback
  vorgesehen.
- Verschlüsselung durch WebRTC (DTLS/SRTP), Ende-zu-Ende zwischen Host und Zuschauer.

### 4. Signaling: manueller Handshake per Code

1. Host erzeugt einen **Einladungscode** (komprimiertes SDP-Offer mit gesammelten ICE-Kandidaten,
   Base64url) und schickt ihn über einen beliebigen Messenger.
2. Zuschauer fügt ihn im Extension-Popup ein und erhält einen **Antwortcode**, den er zurückschickt.
3. Host fügt den Antwortcode ein, die Verbindung steht.

Pro Zuschauer ein Code-Paar. Das Signaling wird hinter einer Schnittstelle gekapselt, damit später
ein optionaler, medienfreier Signaling-Dienst ergänzt werden kann, ohne den Rest zu ändern.

### 5. Sync-Protokoll (Host autoritativ)

- Der Host sendet bei jeder Zustandsänderung und zusätzlich periodisch (z. B. jede Sekunde):
  Position, Play/Pause, Wiedergaberate, Host-Zeitstempel, Inhaltskennung.
- Zuschauer schätzen den Uhrenversatz per Ping/Pong und rechnen die Zielposition hoch.
- Drift-Korrektur: kleine Abweichung (Richtwert < 1 s) über leicht angepasste Wiedergaberate,
  große Abweichung über Seek.
- Zuschauer senden keine Steuerbefehle. Lokale Eingaben beim Zuschauer werden auf den Host-Zustand
  zurückgesetzt.
- Weicht die Inhaltskennung ab (anderer Titel, andere Fassung), zeigt der Zuschauer eine Warnung.

### 6. Player-Adapter

- **Generischer Adapter:** findet das relevante `<video>`-Element und nutzt `play`, `pause`,
  `seeked`, `ratechange`, `waiting`.
- **Sonderadapter** für Dienste, deren Player direkte Manipulation nicht verträgt:
  - Netflix: Steuerung über die Player-API im Seitenkontext, nicht über `currentTime`.
  - YouTube: Werbung erkennen und Sync währenddessen pausieren.
  - Später: Disney+, Prime Video, Max.

### 7. Stream-Modus

- Aufnahme: Chrome/Brave über `chrome.tabCapture` (Video + Tab-Audio). Firefox über
  `getDisplayMedia`, nur Video. Der Host wird darauf hingewiesen.
- Qualität: `RTCRtpSender.setParameters` mit hohem `maxBitrate` (Richtwert 8–15 Mbit/s für 1080p),
  `contentHint = "motion"`, `degradationPreference = "maintain-resolution"`, bevorzugt
  hardwarebeschleunigte Codecs (H.264, AV1 wo verfügbar).
- Der Host-Tab wird lokal weiter abgespielt, Zuschauer sehen ihn mit ca. 200–500 ms Latenz.

### 8. Plattform und Build

- TypeScript, ein Code-Stamm, Build für Chrome, Brave und Firefox mit WXT.
- Manifest V3. Chrome/Brave: WebRTC und Aufnahme in einem Offscreen-Document, weil der Service
  Worker keine `RTCPeerConnection` halten kann. Firefox: Event-Page mit DOM-Zugriff.

## Konsequenzen

### Positiv

- Kein Betrieb eigener Medienserver, keine laufenden Infrastrukturkosten, keine Inhalte auf
  fremden Systemen.
- Im Sync-Modus Originalqualität und praktisch keine Bandbreitenlast.
- DRM-Dienste funktionieren legal, ohne Schutzmaßnahmen zu umgehen.

### Negativ und Einschränkungen

- Bei DRM-Diensten braucht **jeder Zuschauer einen eigenen Zugang**. Inhalte an Personen ohne
  Abo weiterzugeben ist ausgeschlossen.
- Stream-Modus ist **nie verlustfrei** und durch den Host-Upload begrenzt
  (Richtwert 3 × 8 Mbit/s = 24 Mbit/s).
- **Firefox-Hosts** haben im Stream-Modus keinen Ton.
- Ohne TURN scheitert ein Teil der Verbindungen (CGNAT, strikte Firewalls).
- Manueller Handshake: zwei Kopiervorgänge pro Zuschauer und Sitzung.
- Ein öffentlicher STUN-Server erfährt die öffentlichen IP-Adressen der Teilnehmer.
- Sonderadapter brechen, wenn Dienste ihre Player ändern. Das ist laufende Wartung.
- Unterschiedliche Regionen oder Fassungen desselben Titels können den Sync stören.

## Verworfene Alternativen

- **Cloud-Browser wie Hyperbeam:** widerspricht der Anforderung "keine externen Server".
- **Nur Stream-Modus:** DRM-Dienste wären nicht nutzbar.
- **Nur Sync-Modus:** Inhalte, die nur der Host öffnen kann, wären nicht teilbar.
- **DRM-Aufnahme umgehen:** rechtlich unzulässig (Umgehung technischer Schutzmaßnahmen) und
  verletzt die Nutzungsbedingungen der Dienste.
- **Klickbarer Einladungslink:** braucht eine gehostete Webseite oder einen Signaling-Dienst.
  Zurückgestellt, über die Signaling-Schnittstelle nachrüstbar.
- **Zuschauer leiten Streams weiter (Relay-Ketten):** bei 2–3 Zuschauern unnötige Komplexität.

## Meilensteine

1. **M1:** Verbindungsaufbau per Code, Data-Channel-Chat, getestet in Chrome, Brave und Firefox,
   inklusive NAT-Szenarien. Klärt die größten Risiken zuerst.
2. **M2:** Sync-Modus mit generischem Adapter, YouTube als erster echter Fall.
3. **M3:** Netflix-Adapter.
4. **M4:** Stream-Modus (Chrome/Brave als Host, alle drei Browser als Zuschauer).
5. **M5:** Weitere Adapter, optionaler TURN- und Signaling-Dienst, Feinschliff.

## Offene Punkte

- Konkreter öffentlicher STUN-Server und Hinweis dazu in der Datenschutzerklärung.
- Maximale Codelänge in Messengern prüfen (SDP-Größe nach Kompression).
- Verhalten von Brave mit Standard-Shields in M1 messen.
- Name "WatchStream": Eine Websuche (2026-10-25) fand weder eine gleichnamige Extension noch eine
  Marke; sie war aber nicht erschöpfend. Vor dem Einreichen direkt im Chrome Web Store und auf AMO
  sowie in TMview und beim USPTO suchen. Der Name wird nicht geschützt. Keine fremden Marken in
  Name oder Icon, unterstützte Dienste nur sachlich in der Beschreibung nennen.
