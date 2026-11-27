#include "Dashboard.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>

#include "Localization.h"
#include "TickTables.h"

namespace buddy::ui {
namespace {
// Draws one precomputed tick: the spans are the exact fillArc pixels, so the
// render is pixel-identical while avoiding the full-radius scan per tick.
void tickSpans(Canvas& g, const TickSpan* spans, const TickGroup& group, uint8_t ink) {
  for (uint8_t i = 0; i < group.count; ++i) {
    const TickSpan& span = spans[group.first + i];
    g.drawFastHLine(span.x0, span.y, span.x1 - span.x0 + 1, ink);
  }
}

void identity(Canvas& g, const StateManager& d, int y) {
  char names[72];
  snprintf(names,sizeof(names),"%s / %s",d.model(),d.agent());
  g.setFont(&lgfx::fonts::Font2);
  if (g.textWidth(names) <= 132) {
    text(g,names,center,y,Type::Small,Muted);
  } else {
    // Reserve a measured column for each identifier so a long model cannot hide the agent.
    text(g,d.model(),center-34,y,Type::Small,Muted,74);
    text(g,"/",center+9,y,Type::Small,Border,8);
    text(g,d.agent(),center+42,y,Type::Small,Muted,55);
  }
}

void session(Canvas& g,const StateManager& d,const MotionFrame& m,Language language) {
  const auto& a = d.metrics();
  const auto c = accent(d.state());
  const bool moving = d.state()!=BuddyState::Offline && !m.quiet;
  for(int i=0;i<36;++i) {
    const bool active = moving && m.elapsedMs/160%36==unsigned(i);
    tickSpans(g, kSessionSpans, kSessionGroups[i], active ? c : Border);
  }
  identity(g,d,63);
  char duration[24] = "--";
  const unsigned seconds = a.elapsedSeconds;
  if (a.elapsedKnown) {
    if(seconds >= 3600) snprintf(duration,sizeof(duration),"%u:%02u:%02u",seconds/3600,seconds/60%60,seconds%60);
    else snprintf(duration,sizeof(duration),"%02u:%02u",seconds/60,seconds%60);
  }
  text(g,duration,center,100,Type::Metric,White,176);
  char state[40];
  text(g,stateText(state,language,d.state(),a),center,139,Type::Body,c);
  char count[28] = "--";
  if(a.sessionsKnown) formatSessionCount(count,sizeof(count),language,a.activeSessions);
  text(g,count,center,164,Type::Small,Muted);
}

void tokens(Canvas& g,const TokenUsage& a,Language language) {
  char out[24];
  const uint64_t sum = uint64_t(a.input)+a.output;
  const bool known = a.inputKnown && a.outputKnown && sum;
  for(int i=0;i<28;++i) {
    const uint8_t ink = !known ? Border : ((2*i+1)*sum < uint64_t(a.input)*56 ? Blue : Lilac);
    tickSpans(g, kTokensSpans, kTokensGroups[i], ink);
  }
  // The total is the cumulative consumption of the focus session. It is never
  // the current context occupancy: that value has no verified source yet.
  text(g,tr(language,TextId::SessionTotal),center,62,Type::Small,Muted);
  number(a.total,a.totalKnown,out);
  text(g,out,center,96,Type::Metric,White,162);
  for(int i=0;i<2;++i) {
    const int x = 71+78*i;
    const auto c = i ? Lilac : Blue;
    text(g,tr(language,i?TextId::TokenOut:TextId::TokenIn),x,131,Type::Small,c,76);
    number(i?a.output:a.input,i?a.outputKnown:a.inputKnown,out);
    text(g,out,x,150,Type::Body,White,76);
  }
  snprintf(out,sizeof(out),"%s --",tr(language,TextId::CtxLabel));
  if(a.contextAvailable) {
    snprintf(out,sizeof(out),"%s %d%%",tr(language,TextId::CtxLabel),a.contextPercent);
  }
  text(g,out,center,173,Type::Small,Muted);
}

void tools(Canvas& g,const ToolUsage& a,Language language) {
  const uint32_t counts[] = {a.success,a.failed,a.running,a.read,a.edit,a.shell,a.search,a.mcp,a.other};
  const uint32_t peak = std::max<uint32_t>(1,*std::max_element(counts+3,counts+9));
  char out[24];
  g.fillRoundRect(26,44,168,42,17,Surface);
  g.drawFastVLine(82,54,23,Border);
  g.drawFastVLine(137,54,23,Border);
  for(int i=0;i<9;++i) {
    const bool known = (a.known & (1<<i)) != 0;
    number(counts[i],known,out);
    const char* name = toolLabel(language,i);
    if (i<3) {
      const int x=56+54*i;
      const Ink ink[] = {Mint,Coral,Blue};
      text(g,name,x,54,Type::Small,ink[i],52);
      text(g,out,x,75,Type::Title,White,52);
    } else {
      const int y=96+16*(i-3);
      text(g,name,64,y,Type::Small,Muted,52);
      g.fillRoundRect(93,y-2,40,4,2,Raised);
      if(known && counts[i]) g.fillRect(93,y-2,std::max(1,int(uint64_t(counts[i])*40/peak)),4,Violet);
      text(g,out,155,y,Type::Small,White,41);
    }
  }
}

void radar(Canvas& g,const McpSummary& a,const MotionFrame& m,Language language) {
  constexpr int cy=96, r=47;
  g.fillCircle(center,cy,r,Surface);
  for(int radius : {18,33,r}) g.drawCircle(center,cy,radius,Border);
  const float angle = (m.quiet?0:m.elapsedMs%4200)*0.001496f;
  g.drawLine(center,cy,center+r*cosf(angle),cy+r*sinf(angle),halo(Mint));
  constexpr Ink inks[] = {Muted,Mint,Amber,Slate,Coral,Orange};
  for(unsigned i=0;i<a.count;++i) {
    const auto status=a.entries[i].status;
    const int orbit=status==McpStatus::Connected ? 33 : r;
    const float theta=6.283185f*i/a.count-1.5708f;
    const int x=center+orbit*cosf(theta), y=cy+orbit*sinf(theta);
    g.fillCircle(x,y,4,Night);
    if(status==McpStatus::Connected) g.fillCircle(x,y,2,Mint);
    else g.fillRect(x-2,y-2,5,5,inks[unsigned(status)]);
  }
  char line[48];
  if(a.known) {
    formatMcpTotals(line,sizeof(line),language,a.online,a.total);
  } else {
    snprintf(line,sizeof(line),"--");
  }
  text(g,line,center,152,Type::Body,White);
  const bool subset = a.known && a.total > a.count;
  if(subset) {
    formatMcpShown(line,sizeof(line),language,a.count,a.total);
    text(g,line,center,168,Type::Small,Muted);
  }
  if(a.count) {
    const auto& entry=a.entries[(m.quiet?0:m.elapsedMs/3200)%a.count];
    snprintf(line,sizeof(line),"%s  %s",entry.alias,mcpStatusLabel(language,entry.status));
    text(g,line,center,subset?181:177,Type::Small,inks[unsigned(entry.status)]);
  }
}

void system(Canvas& g,const StateManager& d,Language language) {
  const auto& v=d.versions();
  const char* unknown="--";
  char protocol[8];
  snprintf(protocol,sizeof(protocol),"v%u",v.protocol);
  const char* values[]={
    d.usb()==LinkState::Connected?tr(language,TextId::ValuePresent):tr(language,TextId::ValueNoHost),
    d.bridge()==BridgeState::Ready?tr(language,TextId::ValueReady):
      d.bridge()==BridgeState::Degraded?tr(language,TextId::ValueDegraded):unknown,
    d.opencode()==OpenCodeState::Connected?tr(language,TextId::ValueOnline):
      d.opencode()==OpenCodeState::Offline?tr(language,TextId::ValueOffline):unknown,
    v.opencodeKnown?v.opencode:unknown,
    v.firmware,
    v.bridgeKnown?v.bridge:unknown,
    protocol};
  const TextId names[]={TextId::UsbHost,TextId::BridgeLabel,TextId::OpenCodeLabel,
    TextId::OpenCodeVersionLabel,TextId::FirmwareLabel,TextId::BridgeVersionLabel,
    TextId::ProtocolLabel};
  for(int i=0;i<7;++i) {
    const int y=50+19*i;
    text(g,tr(language,names[i]),70,y,Type::Small,Muted,84);
    text(g,values[i],152,y,Type::Small,i==1 && d.bridge()==BridgeState::Degraded?Amber:White,76);
    if(i==2) g.drawFastHLine(44,y+10,132,Border);
  }
  if(strcmp(d.diagnostic(),"--")) {
    char diagnostic[24];
    snprintf(diagnostic,sizeof(diagnostic),"%s %s",tr(language,TextId::DiagnosticLabel),d.diagnostic());
    text(g,diagnostic,center,181,Type::Small,Coral);
  }
}

}

void drawScreen(Canvas& g, ScreenId screen, const StateManager& d, const BuddyFace& face,
                const MotionFrame& m, const char* toast, uint32_t pageAge, Language language) {
  g.fillScreen(Night);
  const auto state = d.state();
  const Ink c = accent(state);
  const TextId titles[]={TextId::TitleBuddy,TextId::TitleSession,TextId::TitleTokens,
                         TextId::TitleTools,TextId::TitleMcp,TextId::TitleSystem};
  const auto& a=d.metrics();
  switch(screen) {
    case ScreenId::Buddy:
      face.draw(g,state,a,m,language);
      {
        char stateLine[40];
        text(g,stateText(stateLine,language,state,a),center,157,Type::Title,c);
      }
      identity(g,d,178);
      break;
    case ScreenId::Session: session(g,d,m,language); break;
    case ScreenId::Tokens: tokens(g,a.tokens,language); break;
    case ScreenId::Tools: tools(g,a.tools,language); break;
    case ScreenId::Mcp: radar(g,a.mcp,m,language); break;
    case ScreenId::System: system(g,d,language); break;
    default: break;
  }
  // The title capsule masks the radial track behind its lettering.
  g.fillRoundRect(55,16,110,22,10,Night);
  const bool alert = state==BuddyState::PermissionRequired || state==BuddyState::UserInputRequired;
  const bool stale = state==BuddyState::Offline && a.sessionsKnown && d.bridge()!=BridgeState::Ready;
  char alertLine[40];
  const char* title = stale && screen!=ScreenId::Buddy ? tr(language,TextId::LastSnapshot)
                                                       : tr(language,titles[unsigned(screen)]);
  if(alert && screen!=ScreenId::Buddy) title=stateText(alertLine,language,state,a);
  text(g,title,center,28,Type::Small,alert?c:White);
  char footer[48]={};
  const bool mock=d.mockSource() || (screen==ScreenId::Mcp && a.mcp.mock) || BUDDY_MOCK_MODE;
  const bool offline=d.usb()!=LinkState::Connected || state==BuddyState::Offline;
  const bool linkStale=!offline && (d.bridge()!=BridgeState::Ready ||
                                    d.opencode()!=OpenCodeState::Connected);
  const char* source=mock?tr(language,TextId::SourceMock):
    offline?tr(language,TextId::SourceOffline):
    linkStale?tr(language,TextId::SourceStale):tr(language,TextId::SourceLive);
  snprintf(footer,sizeof(footer),"%s",source);
  if(m.quiet) {
    const size_t used=strlen(footer);
    snprintf(footer+used,sizeof(footer)-used," / %s",tr(language,TextId::ToastQuiet));
  }
  if (a.notifications) {
    const size_t used = strlen(footer);
    snprintf(footer+used,sizeof(footer)-used,"  +%u",a.notifications);
  }
  text(g,footer,center,194,Type::Small,Muted);
  for(int i=0;i<6;++i) {
    const bool selected=i==int(screen);
    const int w=selected ? 8+(!m.quiet && pageAge<250?(250-pageAge)/50:0) : 3;
    g.fillRoundRect(82+i*11-w/2,205,w,3,1,selected?c:Border);
  }
  if(toast && *toast) {
    g.fillRoundRect(68,91,84,30,14,Raised);
    text(g,toast,center,106,Type::Body,White,80);
  }
}
}
