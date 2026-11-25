#include "BuddyFace.h"
#include <algorithm>
#include <cmath>

namespace buddy {
using namespace ui;
namespace {
struct Pose { int height, tilt, gazeX, gazeY; };
constexpr Pose poses[] = {
  {7,0,0,0},{42,0,0,1},{50,-3,-5,-4},{36,-2,4,0},{27,0,1,2},{57,0,0,-2},
  {43,-9,4,-3},{20,0,0,0},{35,4,-2,4},{22,0,0,0},{33,3,6,-1},{21,0,0,0}
};
void lens(Canvas& g, int x, int y, int h, int dx, int dy, Ink color, BuddyState s) {
  constexpr int w = 61;
  const int r = std::min(h/2,22);
  const int top = y-h/2;
  g.fillRoundRect(x-w/2-3,top-3,w+6,h+7,r+3,halo(color));
  g.fillRoundRect(x-w/2,top,w,h,r,color);
  if (s == BuddyState::Success) {
    g.fillCircle(x,y+24,26,Surface);
    return;
  }
  if (h < 12) return;
  g.fillRoundRect(x-26,top+2,52,std::max(4,h-9),std::min(18,r),light(color));
  const int ph = std::min(32,h-8);
  const int py = std::clamp(y+dy-ph/2,top+3,top+h-ph-2);
  const int px = x+dx;
  g.fillRoundRect(px-15,py,30,ph,std::min(12,ph/2),Night);
  if (ph >= 10) {
    g.fillRoundRect(px-10,py+3,9,5,2,White);
    g.fillCircle(px+8,py+ph-4,2,color);
  }
}
void sparkle(Canvas& g,int x,int y,int r,uint8_t c) {
  g.fillTriangle(x,y-r,x+2,y,x,y+r,c);
  g.fillTriangle(x,y-r,x-2,y,x,y+r,c);
  g.drawFastHLine(x-r,y,2*r+1,c);
}
}

void BuddyFace::draw(Canvas& g,BuddyState s,const BuddyMetrics& metrics,const MotionFrame& m) const {
  const Ink c = accent(s);
  const auto p = poses[static_cast<int>(s)];
  const auto old = poses[static_cast<int>(m.previous)];
  const uint32_t t = m.quiet ? 0 : m.elapsedMs;
  const int wave = static_cast<int>(8*sinf((t%4800)*0.001309f));
  const int breath = wave/4;
  const int travel = std::abs(static_cast<int>(t%3600)-1800)/50-18;
  for (int base : {0,180}) {
    arc(g,102,2,base+329,62,Border);
    const int offset = (s == BuddyState::Compacting || s == BuddyState::Retrying ||
                        s == BuddyState::Thinking) ? travel : 0;
    arc(g,102,s == BuddyState::PermissionRequired ? 3+std::abs(breath) : 3,
        base+offset+346,28,c);
  }
  // A recessed continuous visor binds the two independent optical modules.
  g.fillRoundRect(23,50+breath,174,91,40,Raised);
  g.fillRoundRect(24,52+breath,172,88,39,Surface);
  const int phase = m.quiet ? 256 : std::min<uint32_t>(m.age,240)*256/240;
  const int eased = phase*phase*(768-2*phase)/65536;
  for (int side : {-1,1}) {
    const int height = old.height + (p.height-old.height)*eased/256;
    const int h = std::max(6,height-(height-6)*m.lid/255);
    const int x = center+side*38;
    const int y = 92+breath+side*(old.tilt+(p.tilt-old.tilt)*eased/256);
    lens(g,x,y,h,p.gazeX+wave/3,p.gazeY,c,s);
    if (s == BuddyState::Error || s == BuddyState::Working) {
      const int slope = s == BuddyState::Error ? side : -side;
      g.fillTriangle(x-30,y-h/2-3,x+30,y-h/2-3,x+slope*30,y-h/2+9,Surface);
    }
  }

  const int mouth = 126+breath;
  switch (s) {
    case BuddyState::Idle: case BuddyState::Success:
      g.fillArc(center,mouth-8,14,11,32,148,c); break;
    case BuddyState::Error:
      g.fillArc(center,mouth+9,14,11,215,325,c); break;
    case BuddyState::PermissionRequired:
      g.fillCircle(center,mouth,5,c); g.fillCircle(center,mouth,2,Surface); break;
    case BuddyState::Thinking:
      for(int i=0;i<3;++i) g.fillCircle(99+11*i,mouth,2+(t/360%3==unsigned(i)),c);
      break;
    case BuddyState::Generating:
      for(int i=0;i<7;++i) {
        const int h=3+std::abs(static_cast<int>((t/90+i*3)%14)-7);
        g.fillRoundRect(93+5*i,mouth-h/2,3,h,1,c);
      }
      break;
    case BuddyState::Interrupted:
      for(int x : {105,113}) g.fillRoundRect(x,mouth-5,3,10,1,c);
      break;
    case BuddyState::Working: case BuddyState::Compacting:
      for(int i=0;i<3;++i) g.fillRoundRect(98+9*i,mouth,7,3,1,i==int(t/350%3)?c:halo(c));
      break;
    case BuddyState::Retrying: if (metrics.retryAttempt) break; [[fallthrough]];
    default: g.fillRoundRect(103,mouth,14,3,1,c);
  }
  if (s == BuddyState::Retrying && metrics.retryAttempt) {
    char attempt[24];
    snprintf(attempt,sizeof(attempt),"Attempt %u",metrics.retryAttempt);
    text(g,attempt,center,126,Type::Small,c,100);
  }
  if (s == BuddyState::Success && m.age < 1700 && !m.quiet) {
    sparkle(g,46,65-m.age/220,5,c); sparkle(g,172,68-m.age/180,4,White);
  }
}
}
