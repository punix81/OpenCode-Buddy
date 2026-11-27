# Build the pinned graphics library's Linux sprite backend, without opening a display.
ROOT := ../..
FW := $(ROOT)/firmware
LG := $(FW)/.pio/libdeps/supermini/LovyanGFX/src/lgfx
BUILD := .build
CPPFLAGS := -DBUDDY_MOCK_MODE=0 -DLGFX_LINUX_FB -I$(LG)/.. -I$(FW)/include -I$(FW)/src
CXXFLAGS := -std=c++17 -O2 -ffunction-sections -fdata-sections -MMD -MP
CFLAGS := -O1 -ffunction-sections -fdata-sections
LIBCPP := $(wildcard $(LG)/v1/*.cpp $(LG)/v1/misc/*.cpp) $(LG)/v1/panel/Panel_Device.cpp $(LG)/v1/platforms/framebuffer/common.cpp
LIBC := $(wildcard $(LG)/utility/*.c $(LG)/v1/lv_font/*.c)
SOURCES := $(LIBCPP) $(LIBC) $(addprefix $(FW)/src/,BuddyFace.cpp Dashboard.cpp Theme.cpp Format.cpp Localization.cpp AnimationEngine.cpp StateManager.cpp) preview.cpp
VPATH := $(sort $(dir $(SOURCES)))
OBJ := $(addprefix $(BUILD)/,$(addsuffix .o,$(basename $(notdir $(SOURCES)))))
TICK_LIB := $(addprefix $(BUILD)/,$(addsuffix .o,$(basename $(notdir $(LIBCPP) $(LIBC)))))
$(BUILD)/preview: $(OBJ)
	$(CXX) -Wl,--gc-sections $^ -o $@
$(BUILD)/%.o: %.cpp | $(BUILD)
	$(CXX) $(CPPFLAGS) $(CXXFLAGS) -c $< -o $@
$(BUILD)/%.o: %.c | $(BUILD)
	$(CC) $(CPPFLAGS) $(CFLAGS) -c $< -o $@
$(BUILD):
	mkdir -p $@
-include $(wildcard $(BUILD)/*.d)

# Exact tick-span table generator (see gen_ticks.cpp). It writes a header in the
# firmware tree; run it only when the tick geometry or the pinned library changes.
ticks: $(BUILD)/gen_ticks
	$(BUILD)/gen_ticks > $(FW)/src/TickTables.h

$(BUILD)/gen_ticks: $(BUILD)/gen_ticks.o $(BUILD)/Theme.o $(BUILD)/Format.o $(TICK_LIB)
	$(CXX) -Wl,--gc-sections $^ -o $@

# Non-regression check for the generated tick tables. It fails when the pinned
# fillArc would now produce different spans than the committed header.
check-ticks: $(BUILD)/gen_ticks
	$(BUILD)/gen_ticks | cmp -s - $(FW)/src/TickTables.h || { \
		echo "TickTables.h is stale: run 'make ticks' and review the diff" >&2; exit 1; }
