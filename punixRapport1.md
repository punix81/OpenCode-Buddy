# Rapport de phase 2 — Protocole USB, bridge et simulateur

**Projet** : OpenCode Buddy
**Dépôt** : `OpenCode-Buddy`, branche `main`
**Date** : 24 novembre 2026
**Commit de référence** : `ae78a78` (arbre de travail propre)
**Opérations distantes** : aucune (publication gérée par le Product Owner)

Classification utilisée : **VÉRIFIÉ** (constaté dans cette session), **NON VÉRIFIÉ** (non mesuré),
**HYPOTHÈSE** (non démontré), **BLOQUANT** (empêche la clôture).

---

## 1. Résumé

La Phase 2 livre le protocole NDJSON v1 ratifié, un parseur firmware borné avec application atomique,
un bridge TypeScript, un adaptateur mock et un simulateur d'appareil. Spécification, schéma, exemples
et vecteurs de test sont cohérents : la validation de schéma, le validateur TypeScript et le parseur
C++ passent sur les mêmes données.

L'ensemble a ensuite été exécuté sur **trois cartes ESP32-C3 réelles**. Cette session a révélé **sept
défauts** qu'aucun test unitaire ne pouvait attraper ; tous sont corrigés et re-vérifiés. La liaison
est **VÉRIFIÉE**. Deux mesures restent ouvertes : un soak d'une heure et le relevé heap/FPS.

**Verdict : logiciel PASS · lien matériel VÉRIFIÉ · mesures OUVERTES.**

---

## 2. Statut des tâches

| Tâche | Statut |
| --- | --- |
| P2-01 Ratification du protocole | **Fait** — D-01…D-10 (revue) + D-11…D-19 (matériel) |
| P2-02 Parseur firmware | **Fait** — build, tests hôte, comportement sur carte |
| P2-03 Bridge TypeScript | **Fait** — typecheck, 36 tests, handshakes réels |
| P2-04 Robustesse USB | **Fait et vérifié sur carte** |
| P2-05 Simulateur | **Fait** — test de fumée de bout en bout |
| P2-06 Tests automatisés | **Fait** — 36 tests bridge, suite hôte C++, validation schéma/vecteurs |
| Lien matériel | **VÉRIFIÉ** — 3 cartes, 5 scénarios, 0 erreur |
| Soak 1 heure | **OUVERT** — échec à 11 min (D-15), correctif vérifié sur runs courts seulement |
| Heap / FPS sur carte | **OUVERT** — nécessite un build diagnostic |

---

## 3. Tâches réalisées

1. Ratification du protocole v1 : trame, enveloppe, dix types de messages, propriété des champs,
   séquences, ACK, doublons, trous, négociation de version, bornes, valeurs indisponibles,
   transitions, ordre après resync.
2. Application des décisions de revue (D-01…D-10) puis des découvertes matérielles (D-11…D-19).
3. Mise à jour du schéma JSON, des exemples et des vecteurs partagés entre les deux langages.
4. `ProtocolParser` en C++ : parsing borné, validation type/champ, application atomique, séquences,
   ACK, resync, codes d'erreur, encodeurs.
5. `SerialManager` non bloquant, trame bornée à 2048 octets saut de ligne compris, récupération après
   débordement.
6. Écriture USB bornée et comptée ; file RX portée à 1024 octets ; la boucle principale ne bloque
   jamais sur l'USB.
7. Bridge complet : validateur, codec, transports, découverte Espressif, registre par session, reducer
   déterministe, métriques, confidentialité, normaliseur, adaptateur mock, simulateur, handshake,
   heartbeats, snapshot scindé, reconnexion avec backoff.
8. CLI `mock`, `diagnose`, `simulate`, avec option `--log-level`.
9. Tests automatisés des deux côtés et script de validation du protocole.
10. Flash et validation sur trois cartes, dont deux inconnues flashées avec l'image complète
    (bootloader, partitions, `boot_app0`, application), vérifiée région par région.
11. Rotation d'affichage 90° pour le boîtier PLA, validée visuellement par le Product Owner.
12. Documentation : rapport de phase, preuves, handover, dépannage, audit matériel, roadmap,
    changelog.

---

## 4. Fichiers touchés

**79 fichiers, +7 820 / −436 lignes** depuis le début de la phase.

Créés (principaux) :

- `protocol/ratification-v1.md`
- `protocol/test-vectors/{messages,sequence,boundaries}.json`
- `bridge/` : `package.json`, `package-lock.json`, `tsconfig.json`, `config.example.json`,
  `README.md`, `src/` (protocole, transports, découverte, état, métriques, confidentialité,
  normalisation, adaptateurs, simulateur, CLI), `test/` (36 tests), `scripts/validate-protocol.ts`
- `firmware/src/ProtocolParser.{h,cpp}`
- `firmware/test/host/{run.sh,test_protocol.cpp}`
- `docs/phase-2-report.md`, `docs/handover-phase2.md`
- `docs/evidence/phase-2-build-summary.txt`
- `docs/evidence/phase-2-test-summary.md`
- `docs/evidence/phase-2-hardware-validation.md`

Modifiés (principaux) : `protocol/protocol-v1.md` et son schéma, les exemples,
`firmware/src/{main,SerialManager,ScreenManager,StateManager,DisplayManager}`,
`firmware/include/{Config,BuddyState}.h`, `firmware/platformio.ini`, `README.md`, `CHANGELOG.md`,
`AGENTS.md`, `docs/{roadmap,phase-2-plan,troubleshooting,hardware-audit}.md`.

---

## 5. Décisions structurantes

### Protocole

- Le device possède le lien USB et sa version firmware ; le bridge possède son lien, OpenCode, les
  versions et les métriques. `connection.usb` et `versions.fw` sont rejetés s'ils viennent du bridge.
- Une ligne fait au maximum **2048 octets, saut de ligne compris**.
- Champ obligatoire absent → `E_PARSE` ; valeur présente hors bornes → `E_BOUNDS` (bornée et
  signalée) ; énumération inconnue → rejet, état précédent intact.
- Séquences par émetteur et par session ; doublons ré-acquittés, obsolètes ignorés, trous → `resync`
  puis snapshot complet.

### Matériel (décisions issues de la validation)

- Le device ré-annonce `hello` toutes les 3 s tant qu'aucune session bridge n'existe : ouvrir le port
  ne réinitialise pas la carte (D-11).
- Aucun accès aux lignes modem ; une erreur de port est une perte de lien traitée par backoff (D-14).
- Écriture USB bornée et comptée, jamais bloquante (D-15).
- File RX de 1024 octets (D-18) ; 4096 a rendu une carte muette en réception, cause NON VÉRIFIÉE.
- Snapshot scindé en deux groupes au handshake (D-19).
- Rotation pilotée par `kDisplayRotation` (valeur 1 = 90°).

---

## 6. Commandes exécutées (extraits)

```sh
# Build firmware
PLATFORMIO_SETTING_ENABLE_TELEMETRY=false .venv/bin/pio run -d firmware -c firmware/platformio.local.ini

# Tests hôte du parseur C++
firmware/test/host/run.sh

# Bridge
cd bridge && npm run typecheck && npm test && npm run validate:protocol
npm run simulate -- --scenario full-session --duration 9000

# Flash, vérification, démarrage
esptool --chip esp32c3 --port /dev/ttyACM0 --no-stub --after no-reset write-flash 0x10000 firmware.bin
esptool --chip esp32c3 --port /dev/ttyACM0 --no-stub --after watchdog-reset \
  verify-flash 0x10000 firmware.bin

# Validation sur carte
npm run diagnose -- --port /dev/ttyACM0 --duration 12000 --log-level debug
npm run mock -- --scenario full-session --duration 20000 --port /dev/ttyACM0
```

---

## 7. Résultats de build

| Métrique | Phase 1 | Phase 2 | Delta |
| --- | --- | --- | --- |
| Flash | 354 982 B | **372 250 B (28,4 %)** | +17 268 B |
| RAM statique | 16 364 B | **20 420 B (6,2 %)** | +4 056 B |
| Image | 385 984 B | **406 576 B** | +20 592 B |
| Avertissements sources Buddy | 0 | **0** | — |

SHA-256 de l'image : `76e854213f22a16332b65a43d6e5b63f2a63de9515950c3b39037be61c0f470c`

Correspondance source ↔ image flashée : **VÉRIFIÉE** (le binaire du build est celui écrit puis
vérifié par esptool).

Décomposition du delta de RAM statique : tampon de ligne porté de 512 à 2047 octets utiles
(+1 536 B), parseur, tables de codec et statiques ArduinoJson (+2 520 B). Le canvas de 48 400 octets
reste une allocation dynamique.

---

## 8. Résultats de tests

| Suite | Commande | Résultat |
| --- | --- | --- |
| Typecheck TypeScript | `npm run typecheck` | **PASS**, 0 diagnostic |
| Tests TypeScript | `npm test` | **36/36** |
| Validation protocole | `npm run validate:protocol` | **PASS** — 11 valides, 13 invalides, 11 exemples |
| Tests hôte C++ | `firmware/test/host/run.sh` | **PASS** |
| Simulateur | `npm run simulate` | **PASS** |
| Lien matériel | `diagnose` / `mock` | **PASS** — 0 erreur, 0 resync après correctifs |

Couvert : messages valides/invalides, champs obligatoires, types, version, ligne trop longue, JSON
invalide, doublons/obsolètes/trous, resync, ACK, préservation d'état après entrée invalide, totaux de
tokens, source mock, bornage de configuration, priorité inter-sessions, TTL des états terminaux,
déduplication d'outils, maxima de tokens, projection de confidentialité, rédaction des logs,
handshake, déduplication de `hello`, snapshot différé, interactions, timeout de heartbeat, rejet de
version incompatible.

**Non couvert :** USB sous Windows/macOS, soak d'une heure, heap/FPS, rendu des six écrans à travers
le boîtier, comportement sous charge OpenCode réelle (Phase 3).

---

## 9. Validation matérielle

Trois cartes ESP32-C3 (rev v0.4, 4 Mo). Les deux remplacements ont reçu l'**image complète**,
vérifiée région par région. Les adresses MAC sont relevées localement et volontairement absentes du
dépôt.

| Run | Durée | Résultat |
| --- | --- | --- |
| Diagnostic après flash | 8–15 s | handshake, 22–37 ACK, 0 erreur |
| 5 scénarios (unité B) | 10–12 s chacun | 0 erreur, 12–18 ACK |
| 5 scénarios (unité C) | 10 s chacun | 0 erreur, 12–18 ACK |
| Aperçu avec rotation | 180 s | 1 `E_PARSE` au handshake, puis propre (avant D-19) |
| Run après D-19 | 20 s | **0 erreur, 0 resync, 54 ACK** |
| Soak unité A | 11 min | **échec** : reset watchdog (D-15) |
| Soak unité B | ~5 min | 0 erreur ; interrompu par le changement de carte |
| Diagnostic sur la carte reconnectée | 8 s | **VÉRIFIÉ** : `ready`, états à 1 Hz, 0 erreur |

Observation humaine : orientation 90° confirmée correcte ; ESP32, écran et bouton fonctionnels.

Détail complet : `docs/evidence/phase-2-hardware-validation.md`.

---

## 10. Sécurité

| # | Constat | État |
| --- | --- | --- |
| S-17 | Validation par défaut-refus au niveau `data` | VÉRIFIÉ |
| S-18 | Normaliseur : seuls les champs explicites entrent dans le modèle | VÉRIFIÉ (test) |
| S-19 | Filtre de confidentialité reconstruit l'objet sortant champ par champ | VÉRIFIÉ (test) |
| S-20 | Logs : URL, e-mails et chemins masqués ; compteurs non confondus avec des chemins | VÉRIFIÉ (test) |
| S-21 | Socket limité au loopback | VÉRIFIÉ par le code |
| S-22 | Données simulées étiquetées `source=mock` et affichées `MOCK` | VÉRIFIÉ sur carte |
| S-23 | Aucun SDK fournisseur, aucune télémétrie, aucune exécution distante | VÉRIFIÉ |

Aucun prompt, réponse, code, chemin, argument d'outil ou commande n'est transmis ni journalisé. Les
adresses MAC des cartes de test ne sont pas dans le dépôt.

---

## 11. Limites et risques

1. **Soak d'une heure non terminé** : le correctif de D-15 n'est validé que sur des runs courts.
   NON VÉRIFIÉ.
2. **Heap, fragmentation et FPS non mesurés** sur carte. NON VÉRIFIÉ.
3. **`setRxBufferSize(4096)`** a rendu une unité muette en réception ; cause inconnue. 1024 est la
   valeur livrée et ne doit pas être relevée sans re-test du lien.
4. **Windows et macOS non testés.**
5. **Pas de rafraîchissement partiel spatial** : le disque complet est poussé à chaque frame animée.
6. **Diagnostics compilés hors release** : les mesures exigent une image séparée, incompatible avec le
   bridge.
7. **Écrans et gestes à travers le boîtier** partiellement vérifiés.

---

## 12. Travail restant

1. Soak d'une heure sur l'image finale
   (`npm run mock -- --scenario full-session --duration 3600000`), relevé des resets, erreurs et ACK.
2. Build diagnostic (`BUDDY_DIAGNOSTICS=1`) : heap minimal, high-water, FPS, temps de rendu ; puis
   restauration de l'image de release.
3. Vérification des six écrans et des quatre gestes à travers le boîtier.
4. Clôture formelle de la phase, puis Phase 3 (plugin OpenCode).

---

## 13. Références Git

```text
ae78a78 docs: record the Phase 2 hardware validation results
52b5b4f fix(bridge): split the handshake burst to fit the device RX queue
9d0b908 feat(firmware): rotate the panel 90 degrees for the printed enclosure
b8515b4 fix(firmware): enlarge the USB CDC RX queue to survive rendering
c8ebd01 fix(firmware): never block the loop on a full USB TX buffer
a1fdf15 fix: correct defects found by the Phase 2 hardware validation
021ea38 docs: record Phase 2 implementation status, evidence and handover
3306f02 feat(bridge): add TypeScript bridge, mock adapter and simulator
26c7019 feat(firmware): parse NDJSON v1 with atomic state application
8e7769a feat(protocol): ratify NDJSON v1 with schema, examples and vectors
```

Commits locaux uniquement. Aucune issue, pull request ou release distante.

---

## 14. Recommandation

**Accepter la Phase 2 sous réserve des deux mesures.** Le logiciel et le lien sont vérifiés ; ce qui
manque est de la mesure, pas de la correction.

Ordre proposé : soak d'une heure → build diagnostic (heap/FPS) → restauration de l'image de release →
clôture → Phase 3. Le soak peut démarrer immédiatement ; il immobilise le port série pendant une
heure.
