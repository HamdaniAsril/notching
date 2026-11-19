# Volume app — design (19 Nov)

Owner, 19 Nov: "mengatur volume per app", then the usual "langsung aja,
nanti aku review". Every call below is mine, written down for review.

## Intent

Turn one app down (a loud browser tab, a game, a call) without touching the
others or the Mac's own volume, from the notch.

## Approaches (my call)

1. **Core Audio process taps** (chosen; macOS 14.4+, this Mac runs 27.2).
   A tap takes one app's sound and mutes it at the source; an aggregate
   device of the tap and the current output plays it again at the chosen
   level. Apple's own API; needs "System Audio Recording" once.
2. A virtual audio driver (what SoundSource and Background Music do). Works
   on older macOS, but needs an installed driver and admin rights.
3. Sending each app a volume of its own (AppleScript for Music/Spotify).
   Only a handful of apps answer it.

## How it works

- Only an app turned below 100 % is tapped. At 100 % nothing of Notching sits
  in its sound path, so there is no added latency or risk for it.
- An app is its outermost `.app` bundle: Chrome's, Safari's or Electron's
  helper processes that make the sound count as the app that owns them, and
  one tap takes all of them (stereo mixdown, muted when tapped, private).
- The tap's sound is copied to the output at the level, channel by channel;
  an output with more channels repeats the tap's.
- Every second Notching looks at which processes play and at the default
  output; a new helper process or another output rebuilds that app's tap.
- Levels are remembered per app (`<app data>/app-volume.json`) and applied
  whenever it plays again. Switching the module off, uninstalling it or
  quitting Notching removes every tap: all apps sound as before.
- 0 % is silence (the tap keeps the app muted). No boost above 100 % for now.

## What shows

The module "Volume app" (en "App volume"), opt-in, a card in the notch
(440 × 284).

- On top, the Mac's own volume (owner, 19 Nov: "tambahkan pengaturan volume
  utama di bagian atas"): a speaker that mutes, the output's name, a slider
  and the percentage. It is the current output's main volume, as the menu bar
  shows it; it needs no permission and follows the volume keys. Raising it
  while muted unmutes, as the keys do. An output that sets its own volume
  (HDMI, some DACs) shows the level greyed out with "diatur di perangkat".
- Below, one row per app that is playing now or is turned down, with its
  icon, name, a slider and the percentage. Without the permission this part
  says how to give it.

## Non-goals (for now)

- Boost above 100 %, per-app output device, EQ.
- Apps that play through their own audio driver.

## Left to the builder

Card size and look, labels.
