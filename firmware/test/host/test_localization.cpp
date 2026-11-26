#include <cstdio>
#include <cstring>
#include <iostream>
#include <set>
#include <string>

#include "Localization.h"

namespace {

int failures = 0;

void check(bool condition, const std::string& message) {
  if (!condition) {
    std::cerr << "FAIL " << message << "\n";
    ++failures;
  }
}

// Every non-ASCII sequence the renderer knows how to compose. Keeping this list
// exhaustive turns an unsupported letter in a translation into a test failure
// instead of a silent '?' on the panel.
const std::set<std::string>& allowedSequences() {
  static const std::set<std::string> allowed = {
      "\xC3\x80", "\xC3\x81", "\xC3\x82", "\xC3\x84", "\xC3\x87", "\xC3\x88", "\xC3\x89",
      "\xC3\x8A", "\xC3\x8B", "\xC3\x8C", "\xC3\x8D", "\xC3\x8E", "\xC3\x8F", "\xC3\x91",
      "\xC3\x92", "\xC3\x93", "\xC3\x94", "\xC3\x95", "\xC3\x96", "\xC3\x99", "\xC3\x9A",
      "\xC3\x9B", "\xC3\x9C", "\xC3\x9D", "\xC3\x9F", "\xC3\xA0", "\xC3\xA1", "\xC3\xA2",
      "\xC3\xA3", "\xC3\xA4", "\xC3\xA7", "\xC3\xA8", "\xC3\xA9", "\xC3\xAA", "\xC3\xAB",
      "\xC3\xAC", "\xC3\xAD", "\xC3\xAE", "\xC3\xAF", "\xC3\xB1", "\xC3\xB2", "\xC3\xB3",
      "\xC3\xB4", "\xC3\xB5", "\xC3\xB6", "\xC3\xB9", "\xC3\xBA", "\xC3\xBB", "\xC3\xBC",
      "\xC3\xBD", "\xC3\xBF", "\xC3\x86", "\xC3\xA6", "\xC5\x92", "\xC5\x93",
  };
  return allowed;
}

void checkText(const std::string& value, const std::string& label) {
  check(!value.empty(), label + " is not empty");
  for (size_t i = 0; i < value.size();) {
    const unsigned char c = static_cast<unsigned char>(value[i]);
    if (c < 0x80) {
      check(c >= 0x20 && c <= 0x7e, label + " has a printable ASCII character");
      ++i;
      continue;
    }
    check(c == 0xc3 || c == 0xc5, label + " uses a supported UTF-8 lead byte");
    check(i + 1 < value.size(), label + " has a complete UTF-8 sequence");
    const std::string sequence = value.substr(i, 2);
    check(allowedSequences().count(sequence) == 1, label + " uses a supported accent");
    i += 2;
  }
}

}  // namespace

int main() {
  using namespace buddy;
  for (unsigned language = 0; language < kLanguageCount; ++language) {
    const Language lang = static_cast<Language>(language);
    for (unsigned id = 0; id < static_cast<unsigned>(TextId::Count); ++id) {
      const char* value = tr(lang, static_cast<TextId>(id));
      check(value != nullptr, "text table entry is not null");
      if (value == nullptr) continue;
      checkText(value, "text " + std::to_string(language) + "/" + std::to_string(id));
    }
    for (unsigned state = 0; state < static_cast<unsigned>(BuddyState::Count); ++state) {
      const char* value = stateLabel(lang, static_cast<BuddyState>(state));
      check(value != nullptr && value[0] != '\0', "state label is present");
    }
    for (unsigned tool = 0; tool < 9; ++tool) {
      const char* value = toolLabel(lang, tool);
      check(value != nullptr && value[0] != '\0', "tool label is present");
    }
    for (unsigned status = 0; status < 6; ++status) {
      const char* value = mcpStatusLabel(lang, static_cast<McpStatus>(status));
      check(value != nullptr && value[0] != '\0', "MCP status label is present");
    }
  }

  // Format strings keep exactly the placeholders their formatter supplies.
  for (unsigned language = 0; language < kLanguageCount; ++language) {
    const Language lang = static_cast<Language>(language);
    const TextId one = TextId::SessionsOne;
    const TextId many = TextId::SessionsMany;
    check(std::string(tr(lang, one)).find("%u") != std::string::npos, "singular session has %u");
    check(std::string(tr(lang, many)).find("%u") != std::string::npos, "plural session has %u");
    check(std::string(tr(lang, TextId::Attempt)).find("%u") != std::string::npos, "attempt has %u");
    const std::string totals = tr(lang, TextId::McpTotals);
    check(totals.find("%u") != std::string::npos &&
              totals.find("%u") != totals.rfind("%u"),
          "MCP totals has two placeholders");
    const std::string shown = tr(lang, TextId::McpShown);
    check(shown.find("%u") != std::string::npos &&
              shown.find("%u") != shown.rfind("%u"),
          "MCP shown has two placeholders");

    char buffer[40];
    formatSessionCount(buffer, sizeof(buffer), lang, 1);
    check(std::string(buffer).find("%u") == std::string::npos, "singular count formatted");
    formatSessionCount(buffer, sizeof(buffer), lang, 3);
    check(std::string(buffer).find("%u") == std::string::npos, "plural count formatted");
    formatAttempt(buffer, sizeof(buffer), lang, 2);
    check(std::string(buffer).find("%u") == std::string::npos, "attempt formatted");
    formatMcpTotals(buffer, sizeof(buffer), lang, 3, 12);
    check(std::string(buffer).find("%u") == std::string::npos, "MCP totals formatted");
    formatMcpShown(buffer, sizeof(buffer), lang, 8, 12);
    check(std::string(buffer).find("%u") == std::string::npos, "MCP shown formatted");
  }

  // The interaction count suffix follows the state, not a global counter.
  BuddyMetrics metrics;
  metrics.pendingPermissions = 3;
  metrics.pendingQuestions = 1;
  char text[40];
  check(std::string(stateText(text, Language::French, BuddyState::PermissionRequired, metrics)) ==
            "Permission (3)",
        "permission count appended");
  check(std::string(stateText(text, Language::French, BuddyState::UserInputRequired, metrics)) ==
            "Saisie requise (1)",
        "question count appended");
  metrics.pendingPermissions = 0;
  check(std::string(stateText(text, Language::English, BuddyState::Working, metrics)) == "Working",
        "activity label has no suffix");

  // Language mapping is bounded: a corrupted NVS byte falls back to English.
  check(languageFrom(0) == Language::English, "language 0");
  check(languageFrom(1) == Language::French, "language 1");
  check(languageFrom(2) == Language::German, "language 2");
  check(languageFrom(9) == Language::English, "invalid language falls back");

  // The French and German tables must actually use their accented letters.
  check(std::string(tr(Language::French, TextId::ToastReset)).find("\xC3\x89") != std::string::npos,
        "French acute accent present");
  check(std::string(tr(Language::French, TextId::TitleSystem)).find("\xC3\x88") != std::string::npos,
        "French grave accent present");
  check(std::string(tr(Language::German, TextId::ToolRunning)).find("\xC3\xA4") != std::string::npos,
        "German umlaut present");

  if (failures == 0) {
    std::cout << "firmware localization tests: PASS\n";
    return 0;
  }
  std::cerr << "firmware localization tests: FAIL (" << failures << ")\n";
  return 1;
}
