// Local mock fixture renderer. Integer arguments come from the preview controls.
#include "Dashboard.h"
#include <array>
#include <cstdio>
#include <cstdlib>
using namespace buddy;

int main(int argc,char** argv) {
  if(argc!=9) return 2;
  int args[8];
  for(int i=0;i<8;++i) args[i]=atoi(argv[i+1]);
  const auto [screen,status,profile,quiet,time,age,previous,pageAge] =
      std::array<int,8>{args[0],args[1],args[2],args[3],args[4],args[5],args[6],args[7]};
  if(screen<0 || screen>=6 || status<0 || status>=12 || previous<0 || previous>=12) return 2;
  StateManager d;
  d.begin(0);
  d.setMock(true);
  d.setState(BuddyState(status),0);
  auto& a=d.mutableMetrics();
  Versions v;
  snprintf(v.firmware,sizeof(v.firmware),"%s",kFirmwareVersion);
  if(profile!=1 && status!=0) {
    const bool extreme=profile==2;
    d.setModel(extreme?"WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW":"Atlas");
    d.setAgent("build");
    d.setLink(LinkState::Connected,profile==3?BridgeState::Degraded:BridgeState::Ready,
              profile==3?OpenCodeState::Offline:OpenCodeState::Connected);
    v.bridgeKnown=true;
    snprintf(v.bridge,sizeof(v.bridge),"0.2.0");
    a.sessionsKnown=a.elapsedKnown=true;
    a.elapsedSeconds=extreme?UINT32_MAX:154;
    a.activeSessions=extreme?65535:2;
    a.tokens.inputKnown=a.tokens.outputKnown=a.tokens.totalKnown=true;
    a.tokens.input=extreme?UINT32_MAX:13200;
    a.tokens.output=extreme?UINT32_MAX:5200;
    a.tokens.total=uint64_t(a.tokens.input)+a.tokens.output;
    a.tokens.contextAvailable=profile!=3;
    a.tokens.contextPercent=37;
    a.tools={511,extreme?UINT32_MAX:18u,2,1,12,3,2,4,6,1};
    a.mcp.known=true;
    a.mcp.total=extreme?255:6; a.mcp.online=extreme?200:3;
    a.mcp.count=6;
    for(unsigned i=0;i<a.mcp.count;++i) {
      snprintf(a.mcp.entries[i].alias,sizeof(a.mcp.entries[i].alias),"MCP-%u",i+1);
      a.mcp.entries[i].status=i<3?McpStatus::Connected:McpStatus(i);
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
  ui::drawScreen(g,ScreenId(screen),d,BuddyFace{},engine.frame(),"",pageAge);
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
