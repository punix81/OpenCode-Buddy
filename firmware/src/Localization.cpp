#include "Localization.h"

#include <cstdio>
#include <cstring>

namespace buddy {
namespace {

const char* const kStrings[kLanguageCount][static_cast<unsigned>(TextId::Count)] = {
    {
        "OPENCODE BUDDY",
        "SESSION",
        "TOKENS",
        "TOOLS",
        "MCP RADAR",
        "SYSTEM",
        "LAST SNAPSHOT",
        "PERMISSION",
        "SESSION TOTAL",
        "IN",
        "OUT",
        "CTX",
        "Done",
        "Failed",
        "Active",
        "Read",
        "Edit",
        "Shell",
        "Search",
        "MCP",
        "Other",
        "UNKNOWN",
        "ONLINE",
        "PENDING",
        "DISABLED",
        "FAILED",
        "AUTH",
        "USB host",
        "Bridge",
        "OpenCode",
        "OpenCode v.",
        "Firmware",
        "Bridge ver.",
        "Protocol",
        "Ready",
        "Degraded",
        "Online",
        "Offline",
        "Present",
        "No host",
        "LIVE",
        "MOCK",
        "OFFLINE",
        "STALE",
        "QUIET",
        "LOUD",
        "RESET",
        "DIAG",
        "%u session",
        "%u sessions",
        "Attempt %u",
        "%u online / %u total",
        "%u/%u shown",
    },
    {
        "OPENCODE BUDDY",
        "SESSION",
        "JETONS",
        "OUTILS",
        "RADAR MCP",
        "SYSTÈME",
        "DERNIER ÉTAT",
        "PERMISSION",
        "TOTAL SESSION",
        "ENTRÉE",
        "SORTIE",
        "CTX",
        "OK",
        "Échec",
        "Actif",
        "Lecture",
        "Édition",
        "Shell",
        "Rech.",
        "MCP",
        "Autre",
        "INCONNU",
        "EN LIGNE",
        "EN ATTENTE",
        "DÉSACTIVÉ",
        "ÉCHEC",
        "AUTH",
        "Hôte USB",
        "Bridge",
        "OpenCode",
        "Version OC",
        "Firmware",
        "Ver. bridge",
        "Protocole",
        "Prêt",
        "Dégradé",
        "En ligne",
        "Hors ligne",
        "Présent",
        "Sans hôte",
        "DIRECT",
        "MOCK",
        "HORS LIGNE",
        "FIGÉ",
        "SILENCE",
        "SON",
        "RÉINIT.",
        "DIAG",
        "%u session",
        "%u sessions",
        "Essai %u",
        "%u en ligne / %u total",
        "%u/%u affichés",
    },
    {
        "OPENCODE BUDDY",
        "SITZUNG",
        "TOKEN",
        "WERKZEUGE",
        "MCP-RADAR",
        "SYSTEM",
        "LETZTER STAND",
        "BERECHTIGUNG",
        "SESSION GESAMT",
        "EIN",
        "AUS",
        "CTX",
        "Fertig",
        "Fehler",
        "Läuft",
        "Lesen",
        "Bearb.",
        "Shell",
        "Suche",
        "MCP",
        "Andere",
        "UNBEKANNT",
        "ONLINE",
        "WARTET",
        "INAKTIV",
        "FEHLER",
        "AUTH",
        "USB-Host",
        "Bridge",
        "OpenCode",
        "OpenCode-V.",
        "Firmware",
        "Bridge-Ver.",
        "Protokoll",
        "Bereit",
        "Gestört",
        "Online",
        "Offline",
        "Vorhanden",
        "Kein Host",
        "LIVE",
        "MOCK",
        "OFFLINE",
        "VERALTET",
        "STUMM",
        "LAUT",
        "RESET",
        "DIAG",
        "%u Sitzung",
        "%u Sitzungen",
        "Versuch %u",
        "%u online / %u gesamt",
        "%u/%u gezeigt",
    },
};

const char* const kStates[kLanguageCount][static_cast<unsigned>(BuddyState::Count)] = {
    {"Offline", "Idle", "Thinking", "Generating", "Working", "Permission", "Input needed",
     "Success", "Error", "Compacting", "Retrying", "Interrupted"},
    {"Hors ligne", "Inactif", "Réflexion", "Génération", "Travail", "Permission",
     "Saisie requise", "Succès", "Erreur", "Compactage", "Nouvel essai", "Interrompu"},
    {"Offline", "Bereit", "Denken", "Erzeugen", "Arbeiten", "Berechtigung", "Eingabe nötig",
     "Erfolg", "Fehler", "Verdichten", "Wiederholen", "Unterbrochen"},
};

const TextId kToolIds[] = {TextId::ToolDone,  TextId::ToolFailed, TextId::ToolRunning,
                           TextId::ToolRead,  TextId::ToolEdit,   TextId::ToolShell,
                           TextId::ToolSearch, TextId::ToolMcp,   TextId::ToolOther};

const TextId kMcpIds[] = {TextId::McpUnknown, TextId::McpOnline, TextId::McpPending,
                          TextId::McpDisabled, TextId::McpFailed, TextId::McpAuth};

unsigned languageIndex(Language language) {
  const unsigned index = static_cast<unsigned>(language);
  return index < kLanguageCount ? index : 0;
}

}  // namespace

Language languageFrom(uint8_t value) {
  return value < kLanguageCount ? static_cast<Language>(value) : Language::English;
}

const char* tr(Language language, TextId id) {
  const unsigned index = static_cast<unsigned>(id);
  if (index >= static_cast<unsigned>(TextId::Count)) {
    return "--";
  }
  return kStrings[languageIndex(language)][index];
}

const char* stateLabel(Language language, BuddyState state) {
  const unsigned index = static_cast<unsigned>(state);
  if (index >= static_cast<unsigned>(BuddyState::Count)) {
    return tr(language, TextId::SourceOffline);
  }
  return kStates[languageIndex(language)][index];
}

const char* stateText(char (&out)[40], Language language, BuddyState state,
                      const BuddyMetrics& metrics) {
  const char* base = stateLabel(language, state);
  unsigned pending = 0;
  if (state == BuddyState::PermissionRequired) {
    pending = metrics.pendingPermissions;
  } else if (state == BuddyState::UserInputRequired) {
    pending = metrics.pendingQuestions;
  }
  if (pending > 0) {
    snprintf(out, sizeof(out), "%s (%u)", base, pending);
    return out;
  }
  snprintf(out, sizeof(out), "%s", base);
  return out;
}

const char* toolLabel(Language language, unsigned index) {
  if (index >= sizeof(kToolIds) / sizeof(kToolIds[0])) {
    return "--";
  }
  return tr(language, kToolIds[index]);
}

const char* mcpStatusLabel(Language language, McpStatus status) {
  const unsigned index = static_cast<unsigned>(status);
  if (index >= sizeof(kMcpIds) / sizeof(kMcpIds[0])) {
    return tr(language, TextId::McpUnknown);
  }
  return tr(language, kMcpIds[index]);
}

void formatSessionCount(char* out, size_t capacity, Language language, unsigned count) {
  snprintf(out, capacity, tr(language, count == 1 ? TextId::SessionsOne : TextId::SessionsMany),
           count);
}

void formatAttempt(char* out, size_t capacity, Language language, unsigned attempt) {
  snprintf(out, capacity, tr(language, TextId::Attempt), attempt);
}

void formatMcpTotals(char* out, size_t capacity, Language language, unsigned online,
                     unsigned total) {
  snprintf(out, capacity, tr(language, TextId::McpTotals), online, total);
}

void formatMcpShown(char* out, size_t capacity, Language language, unsigned shown,
                    unsigned total) {
  snprintf(out, capacity, tr(language, TextId::McpShown), shown, total);
}

}  // namespace buddy
