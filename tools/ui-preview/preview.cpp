// Local mock fixture renderer. Integer arguments come from the preview controls.
// The fixture is always simulated data: profile 6 is a layout fixture that shows
// the LIVE footer wording but is labelled as a fixture in the review sheet.
#include "Dashboard.h"
#include <array>
#include <cstdio>
#include <cstdlib>
using namespace buddy;

int main(int argc,char** argv) {
  if(argc!=10) return 2;
  int args[9];
  for(int i=0;i<9;++i) args[i]=atoi(argv[i+1]);
  const auto [screen,status,profile,quiet,time,age,previous,pageAge,language] =
      std::array<int,9>{args[0],args[1],args[2],args[3],args[4],args[5],args[6],args[7],args[8]};
  if(screen<0 || screen>=6 || status<0 || status>=12 || previous<0 || previous>=12 ||
     profile<0 || profile>6 || language<0 || language>=kLanguageCount) return 2;
  StateManager d;
  d.begin(0);
  d.setState(BuddyState(status),0);
  auto& a=d.mutableMetrics();
  Versions v;
  snprintf(v.firmware,sizeof(v.firmware),"%s",kFirmwareVersion);
  v.protocol=1;
  const bool missing=profile==1;
  const bool extreme=profile==2;
  const bool degraded=profile==3;
  const bool mcpStress=profile==4;
  const bool interaction=profile==5;
  const bool liveLayout=profile==6;
  d.setMock(!liveLayout);
  if(!missing) {
    d.setModel(extreme?"WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW":
                interaction?"Claude Sonnet 4.5":"Atlas");
    d.setAgent(interaction?"plan":"build");
    d.setLink(LinkState::Connected,degraded?BridgeState::Degraded:BridgeState::Ready,
              degraded?OpenCodeState::Offline:OpenCodeState::Connected);
    v.bridgeKnown=true;
    snprintf(v.bridge,sizeof(v.bridge),"0.2.0");
    // The bridge clears the peer version when OpenCode goes away.
    v.opencodeKnown=!degraded;
    if(!degraded) snprintf(v.opencode,sizeof(v.opencode),"2.4.1");
    a.sessionsKnown=a.elapsedKnown=true;
    // An idle or offline session has no current execution: the real bridge
    // sends zero, never the session lifetime.
    a.elapsedSeconds=(status<=1)?0:(extreme?UINT32_MAX:(interaction?4897:154));
    a.activeSessions=extreme?65535:(interaction?3:2);
    a.pendingPermissions=interaction?3:0;
    a.pendingQuestions=interaction?1:0;
    a.retryAttempt=interaction?2:0;
    a.notifications=interaction?2:0;
    a.tokens.inputKnown=a.tokens.outputKnown=a.tokens.totalKnown=true;
    a.tokens.input=extreme?UINT32_MAX:(interaction?183400:13200);
    a.tokens.output=extreme?UINT32_MAX:(interaction?72400:5200);
    a.tokens.total=uint64_t(a.tokens.input)+a.tokens.output;
    // No verified context occupancy or capacity exists: CTX stays unknown.
    a.tools={511,extreme?UINT32_MAX:18u,1,extreme?uint8_t(255):uint8_t(1),12,3,2,4,6,1};
    a.mcp.known=true;
    if(extreme) { a.mcp.total=255; a.mcp.online=200; a.mcp.count=8; }
    else if(mcpStress) { a.mcp.total=12; a.mcp.online=5; a.mcp.count=8; }
    else { a.mcp.total=7; a.mcp.online=4; a.mcp.count=7; }
    for(unsigned i=0;i<a.mcp.count;++i) {
      snprintf(a.mcp.entries[i].alias,sizeof(a.mcp.entries[i].alias),"MCP-%u",i+1);
      // Two connected entries, then one of each non-connected class.
      a.mcp.entries[i].status=
          i<2?McpStatus::Connected:
          i==2?McpStatus::Pending:
          i==3?McpStatus::Disabled:
          i==4?McpStatus::Failed:
          i==5?McpStatus::NeedsAuth:McpStatus::Unknown;
    }
  }
  d.setVersions(v);
  AnimationEngine engine;
  engine.begin(0);
  engine.tick(0,BuddyState(previous),quiet);
  engine.tick(time-age,BuddyState(status),quiet);
  engine.tick(time,BuddyState(status),quiet);
  ui::Canvas g;
  if(!ui::initCanvas(g)) return 1;
  ui::drawScreen(g,ScreenId(screen),d,BuddyFace{},engine.frame(),"",pageAge,
                 languageFrom(uint8_t(language)));
  puts("P6\n240 240\n255");
  for(int y=0;y<240;++y) for(int x=0;x<240;++x) {
    uint32_t color=ui::colors[ui::Night];
    if(x>=10 && y>=10 && x<230 && y<230) {
      const auto pixel=g.readPixelRGB(x-10,y-10);
      color=(uint32_t(pixel.R8())<<16)|(pixel.G8()<<8)|pixel.B8();
    }
    if((x-120)*(x-120)+(y-120)*(y-120)>120*120) color=0;
    putchar(color>>16); putchar(color>>8); putchar(color);
  }
}
