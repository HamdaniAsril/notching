# Kecerahan — design (19 Nov)

Owner, 19 Nov: "control untuk mengatur brightness monitor external", then
"langsung aja, nanti aku review" (their way for new features). Every call
below is mine, written down for review.

## Intent

Change the brightness of every screen, the external monitor most of all,
from the notch, without reaching for the monitor's buttons.

## What the spike found (this Mac)

MacBook Air M4 (Mac16,12) with a Lenovo L24i-40 through a USB-C → HDMI
adapter (`Transport = {Upstream: DP, Downstream: HDMI}`). Over IOAVService
the monitor's EDID reads fine (I2C works), but every DDC write to 0x37 fails
with `0xe0114102`. The monitor's menu has no DDC/CI switch (only DCR, its
dynamic contrast). So DDC is out for this pair; another monitor or cable may
answer.

## Approaches (my call)

1. **DDC first, software dimming when DDC does not answer** (chosen). DDC
   changes the monitor's own backlight; when it is refused, the screen is
   dimmed by scaling its gamma table, which always works but can only make
   it darker than the monitor's own setting. Same split as MonitorControl.
2. Software dimming only. Simpler, but wastes a monitor that does take DDC.
3. A dark window over the screen. Works with Night Shift, but darkens
   screenshots and sits in every window list.

## How each screen is set

| Screen | How | 100 % | 0 % |
|---|---|---|---|
| Built-in | DisplayServices (already used by Cermin's lamp) | full | its lowest |
| External, DDC answers | VCP 0x10 over IOAVService | the monitor's max | 0 |
| External, no DDC | gamma table × factor | as set on the monitor | 10 % of it (never black) |

- DDC is tried once per monitor when the card first reads it (get VCP 0x10,
  up to 4 tries). An answer means DDC; none means software.
- Writes go through a worker that keeps only the latest level, at most one
  DDC write per 50 ms, so dragging the slider never queues up.
- Monitors are told apart by EDID vendor, product and serial, matched to
  CoreGraphics' display ids.
- A software level is remembered per monitor (`<app data>/brightness.json`)
  and put back at launch and after screens change, while the module is on.
  Switching the module off, uninstalling it or quitting Notching gives the
  monitors their own colours back. DDC and built-in levels are not stored:
  the screen keeps them itself.

## What shows

The module "Kecerahan" (en "Brightness"), opt-in, a card in the notch: one
row per screen with its name, a slider, the percentage, and "Software" next
to the name when it is dimmed in software.

## Non-goals (for now)

- The brightness keys (F1/F2) for the external monitor.
- Contrast, volume over DDC, input switching.
- Brightness that follows the built-in screen.

## Left to the builder

Card size and look, the slider's step, labels.
