#include "Dashboard.h"
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>

namespace buddy::ui {
namespace {
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

void session(Canvas& g,const StateManager& d,const MotionFrame& m) {
  const auto& a = d.metrics();
  const auto c = accent(d.state());
  for(int i=0;i<36;++i) {
    const bool moving = d.state()!=BuddyState::Offline && !m.quiet;
    arc(g,100,i%3 ? 2 : 5,5+i*10,2,moving && m.elapsedMs/160%36==unsigned(i) ? c : Border);
  }
  identity(g,d,63);
  char duration[24] = "--";
  const unsigned seconds = a.elapsedSeconds;
  if (a.elapsedKnown) {
    if(seconds >= 3600) snprintf(duration,sizeof(duration),"%u:%02u:%02u",seconds/3600,seconds/60%60,seconds%60);
    else snprintf(duration,sizeof(duration),"%02u:%02u",seconds/60,seconds%60);
  }
  text(g,duration,center,100,Type::Metric,White,176);
  text(g,label(d.state()),center,139,Type::Body,c);
  char count[28] = "-- sessions";
  if(a.sessionsKnown) snprintf(count,sizeof(count),"%u session%s",a.activeSessions,a.activeSessions==1?"":"s");
  text(g,count,center,164,Type::Small,Muted);
}

void tokens(Canvas& g,const TokenUsage& a) {
  char out[24];
  const uint64_t sum = uint64_t(a.input)+a.output;
  for(int i=0;i<28;++i) {
    const bool known = a.inputKnown && a.outputKnown && sum;
    const uint8_t ink = !known ? Border : ((2*i+1)*sum < uint64_t(a.input)*56 ? Blue : Lilac);
    arc(g,98,4,145+i*9,7,ink);
  }
  text(g,"TOTAL",center,62,Type::Small,Muted);
  number(a.total,a.totalKnown,out);
  text(g,out,center,96,Type::Metric,White,162);
  for(int i=0;i<2;++i) {
    const int x = 71+78*i;
    const auto c = i ? Lilac : Blue;
    text(g,i?"OUT":"IN",x,131,Type::Small,c);
    number(i?a.output:a.input,i?a.outputKnown:a.inputKnown,out);
    text(g,out,x,150,Type::Body,White,76);
  }
  strcpy(out,"CTX --");
  if(a.contextAvailable) snprintf(out,sizeof(out),"CTX %d%%",a.contextPercent);
  text(g,out,center,173,Type::Small,Muted);
}

void tools(Canvas& g,const ToolUsage& a) {
  const char* labels[] = {"Done","Failed","Running","Read","Edit","Shell","Search","MCP","Other"};
  const uint32_t counts[] = {a.success,a.failed,a.running,a.read,a.edit,a.shell,a.search,a.mcp,a.other};
  const uint32_t peak = std::max<uint32_t>(1,*std::max_element(counts+3,counts+9));
  char out[24];
  g.fillRoundRect(26,44,168,42,17,Surface);
  g.drawFastVLine(82,54,23,Border);
  g.drawFastVLine(137,54,23,Border);
  for(int i=0;i<9;++i) {
    const bool known = (a.known & (1<<i)) != 0;
    number(counts[i],known,out);
    if (i<3) {
      const int x=56+54*i;
      const Ink ink[] = {Mint,Coral,Blue};
      text(g,labels[i],x,54,Type::Small,ink[i],52);
      text(g,out,x,75,Type::Title,White,52);
    } else {
      const int y=96+16*(i-3);
      text(g,labels[i],64,y,Type::Small,Muted,52);
      g.fillRoundRect(93,y-2,40,4,2,Raised);
      if(known && counts[i]) g.fillRect(93,y-2,std::max(1,int(uint64_t(counts[i])*40/peak)),4,Violet);
      text(g,out,155,y,Type::Small,White,41);
    }
  }
}

void radar(Canvas& g,const McpSummary& a,const MotionFrame& m) {
  constexpr int cy=96, r=47;
  g.fillCircle(center,cy,r,Surface);
  for(int radius : {18,33,r}) g.drawCircle(center,cy,radius,Border);
  const float angle = (m.quiet?0:m.elapsedMs%4200)*0.001496f;
  g.drawLine(center,cy,center+r*cosf(angle),cy+r*sinf(angle),halo(Mint));
  constexpr Ink inks[] = {Muted,Mint,Amber,Slate,Coral,Orange};
  constexpr const char* labels[] = {"UNKNOWN","ONLINE","PENDING","DISABLED","FAILED","AUTH"};
  for(unsigned i=0;i<a.count;++i) {
    const auto status=a.entries[i].status;
    const int orbit=status==McpStatus::Connected ? 33 : r;
    const float theta=6.283185f*i/a.count-1.5708f;
    const int x=center+orbit*cosf(theta), y=cy+orbit*sinf(theta);
    g.fillCircle(x,y,4,Night);
    if(status==McpStatus::Connected) g.fillCircle(x,y,2,Mint);
    else g.fillRect(x-2,y-2,5,5,inks[unsigned(status)]);
  }
  char line[48]="-- online / -- off";
  if(a.known && a.total>=a.online)
    snprintf(line,sizeof(line),"%u online / %u off",a.online,a.total-a.online);
  else if(a.known) snprintf(line,sizeof(line),"%u online / %u total",a.online,a.total);
  text(g,line,center,157,Type::Body,White);
  if(a.count) {
    const auto& entry=a.entries[(m.quiet?0:m.elapsedMs/3200)%a.count];
    snprintf(line,sizeof(line),"%s  %s",entry.alias,labels[unsigned(entry.status)]);
    text(g,line,center,177,Type::Small,inks[unsigned(entry.status)]);
  }
}

void system(Canvas& g,const StateManager& d) {
  const auto& v=d.versions();
  const char* bridge[]={"--","Ready","Degraded"};
  const char* oc[]={"--","Online","Offline"};
  const char* names[]={"USB host","Bridge","OpenCode","Firmware","Bridge ver.","Protocol"};
  char protocol[8];
  snprintf(protocol,sizeof(protocol),"v%u",v.protocol);
  const char* values[]={d.usb()==LinkState::Connected?"Present":"No host",bridge[unsigned(d.bridge())],
    oc[unsigned(d.opencode())],v.firmware,v.bridgeKnown?v.bridge:"--",protocol};
  for(int i=0;i<6;++i) {
    const int y=53+21*i;
    text(g,names[i],75,y,Type::Small,Muted,77);
    text(g,values[i],147,y,Type::Small,i==1 && d.bridge()==BridgeState::Degraded?Amber:White,69);
    if(i==2) g.drawFastHLine(48,y+10,124,Border);
  }
  if(strcmp(d.diagnostic(),"--")) text(g,d.diagnostic(),center,178,Type::Small,Coral);
}
}

void drawScreen(Canvas& g, ScreenId screen, const StateManager& d, const BuddyFace& face,
                const MotionFrame& m, const char* toast, uint32_t pageAge) {
  g.fillScreen(Night);
  const auto state = d.state();
  const Ink c = accent(state);
  constexpr const char* titles[]={"OPENCODE BUDDY","SESSION","TOKENS","TOOLS","MCP RADAR","SYSTEM"};
  const auto& a=d.metrics();
  switch(screen) {
    case ScreenId::Buddy:
      face.draw(g,state,a,m);
      text(g,label(state),center,157,Type::Title,c);
      identity(g,d,178);
      break;
    case ScreenId::Session: session(g,d,m); break;
    case ScreenId::Tokens: tokens(g,a.tokens); break;
    case ScreenId::Tools: tools(g,a.tools); break;
    case ScreenId::Mcp: radar(g,a.mcp,m); break;
    case ScreenId::System: system(g,d); break;
    default: break;
  }
  // The title capsule masks the radial track behind its lettering.
  g.fillRoundRect(55,16,110,22,10,Night);
  const bool permission = state!=BuddyState::Offline && (a.pendingPermissions || state==BuddyState::PermissionRequired) &&
                          screen!=ScreenId::Buddy;
  const bool stale = state==BuddyState::Offline && a.sessionsKnown && d.bridge()!=BridgeState::Ready;
  const char* title = stale && screen!=ScreenId::Buddy ? "LAST SNAPSHOT" : titles[unsigned(screen)];
  text(g,permission ? "PERMISSION" : title,center,28,Type::Small,permission ? Amber : White);
  char footer[40]={};
  const bool mock=d.mockSource() || (screen==ScreenId::Mcp && a.mcp.mock) || BUDDY_MOCK_MODE;
  snprintf(footer,sizeof(footer),"%s%s",mock?"MOCK":"",m.quiet?(mock?" / QUIET":"QUIET"):"");
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
