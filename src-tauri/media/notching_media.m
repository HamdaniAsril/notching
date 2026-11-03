// Notching's Now Playing helper (Musik, design 3 Nov §2).
//
// Since macOS 15.4 a normal app gets an empty Now Playing from MediaRemote, but
// the system perl may still read it. The owner chose this route knowing a macOS
// update can close it (3 Nov, "kerjakan cara 3 saja"): np.pl loads this library
// into /usr/bin/perl and calls notching_media_run, which never returns.
//
// stdout: one JSON object per line, at start, on every change, and at least
// every HEARTBEAT seconds so the app can tell a hung helper from a quiet one.
// stdin: one word per line (toggle, play, pause, next, prev). EOF ends the
// process, so the helper never outlives the app.

#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>
#import <ImageIO/ImageIO.h>
#include <dlfcn.h>
#include <pthread.h>
#include <stdio.h>
#include <string.h>

#define EXPORT __attribute__((visibility("default")))

static const double POLL = 2.0;
static const double HEARTBEAT = 10.0;
static const size_t ART_PX = 128;

typedef void (*RegisterFn)(dispatch_queue_t);
typedef void (*GetInfoFn)(dispatch_queue_t, void (^)(CFDictionaryRef));
typedef void (*GetPlayingFn)(dispatch_queue_t, void (^)(Boolean));
typedef void (*GetClientFn)(dispatch_queue_t, void (^)(id));
typedef CFStringRef (*ClientIdFn)(id);
typedef Boolean (*SendFn)(int, CFDictionaryRef);

// Each one may be missing on some macOS: the helper then does without it.
static GetInfoFn get_info;
static GetPlayingFn get_playing;
static GetClientFn get_client;
static ClientIdFn client_parent_id;
static ClientIdFn client_id;
static SendFn send_command;

// Everything below runs on the main queue only.
static BOOL busy;
static BOOL again;
static NSString *last_line;
static CFAbsoluteTime last_emit;
static NSData *art_source;
static NSString *art_url;

static void *symbol(void *lib, const char *name) {
  return lib ? dlsym(lib, name) : NULL;
}

static NSString *notification(void *lib, const char *name) {
  CFStringRef *s = (CFStringRef *)symbol(lib, name);
  return s && *s ? (__bridge NSString *)*s : [NSString stringWithUTF8String:name];
}

static id text(id v) {
  return [v isKindOfClass:NSString.class] && [v length] ? v : NSNull.null;
}

static id number(id v) {
  if (![v isKindOfClass:NSNumber.class]) return NSNull.null;
  double d = [v doubleValue];
  return isfinite(d) ? @(d) : NSNull.null;
}

static long long now_ms(void) {
  return (long long)((CFAbsoluteTimeGetCurrent() + kCFAbsoluteTimeIntervalSince1970) * 1000.0);
}

// The artwork at most ART_PX on its long side: JPEG, or PNG when it has alpha.
static NSString *thumbnail(NSData *data) {
  CGImageSourceRef src = CGImageSourceCreateWithData((__bridge CFDataRef)data, NULL);
  if (!src) return nil;
  NSDictionary *opts = @{
    (id)kCGImageSourceCreateThumbnailFromImageAlways : @YES,
    (id)kCGImageSourceCreateThumbnailWithTransform : @YES,
    (id)kCGImageSourceThumbnailMaxPixelSize : @(ART_PX),
  };
  CGImageRef img = CGImageSourceCreateThumbnailAtIndex(src, 0, (__bridge CFDictionaryRef)opts);
  CFRelease(src);
  if (!img) return nil;
  CGImageAlphaInfo alpha = CGImageGetAlphaInfo(img);
  BOOL opaque = alpha == kCGImageAlphaNone || alpha == kCGImageAlphaNoneSkipFirst || alpha == kCGImageAlphaNoneSkipLast;
  NSMutableData *out = [NSMutableData data];
  CGImageDestinationRef dst = CGImageDestinationCreateWithData(
      (__bridge CFMutableDataRef)out, opaque ? CFSTR("public.jpeg") : CFSTR("public.png"), 1, NULL);
  BOOL ok = NO;
  if (dst) {
    NSDictionary *props = @{(id)kCGImageDestinationLossyCompressionQuality : @0.8};
    CGImageDestinationAddImage(dst, img, (__bridge CFDictionaryRef)props);
    ok = CGImageDestinationFinalize(dst);
    CFRelease(dst);
  }
  CGImageRelease(img);
  if (!ok) return nil;
  NSString *head = opaque ? @"data:image/jpeg;base64," : @"data:image/png;base64,";
  return [head stringByAppendingString:[out base64EncodedStringWithOptions:0]];
}

static id artwork(id data) {
  if (![data isKindOfClass:NSData.class] || ![data length]) return NSNull.null;
  if (![data isEqualToData:art_source]) {
    art_source = data;
    art_url = thumbnail(data);
  }
  return art_url ?: NSNull.null;
}

static void emit(NSDictionary *info, BOOL playing, NSString *app) {
  NSMutableDictionary *o = [NSMutableDictionary dictionary];
  if (info.count) {
    o[@"title"] = text(info[@"kMRMediaRemoteNowPlayingInfoTitle"]);
    o[@"artist"] = text(info[@"kMRMediaRemoteNowPlayingInfoArtist"]);
    o[@"album"] = text(info[@"kMRMediaRemoteNowPlayingInfoAlbum"]);
    o[@"duration"] = number(info[@"kMRMediaRemoteNowPlayingInfoDuration"]);
    o[@"elapsed"] = number(info[@"kMRMediaRemoteNowPlayingInfoElapsedTime"]);
    id r = number(info[@"kMRMediaRemoteNowPlayingInfoPlaybackRate"]);
    double rate = r == NSNull.null ? 0 : [r doubleValue];
    o[@"rate"] = @(playing ? (rate > 0 ? rate : 1.0) : 0.0);
    id when = info[@"kMRMediaRemoteNowPlayingInfoTimestamp"];
    o[@"at"] = [when isKindOfClass:NSDate.class]
                   ? @((long long)([when timeIntervalSince1970] * 1000.0))
                   : @(now_ms());
    o[@"app"] = app.length ? app : NSNull.null;
    o[@"art"] = artwork(info[@"kMRMediaRemoteNowPlayingInfoArtworkData"]);
  } else {
    for (NSString *k in @[ @"title", @"artist", @"album", @"duration", @"elapsed", @"app", @"art" ]) o[k] = NSNull.null;
    o[@"rate"] = @0;
    o[@"at"] = @(now_ms());
    art_source = nil;
    art_url = nil;
  }
  NSData *json = [NSJSONSerialization dataWithJSONObject:o options:NSJSONWritingWithoutEscapingSlashes error:nil];
  if (!json) return;
  NSString *line = [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding];
  CFAbsoluteTime t = CFAbsoluteTimeGetCurrent();
  if ([line isEqualToString:last_line] && t - last_emit < HEARTBEAT) return;
  last_line = line;
  last_emit = t;
  fwrite(json.bytes, 1, json.length, stdout);
  fputc('\n', stdout);
  fflush(stdout);
}

static void refresh(void);

static void finish(NSDictionary *info, BOOL playing, NSString *app) {
  emit(info, playing, app);
  busy = NO;
  if (again) {
    again = NO;
    refresh();
  }
}

static void with_app(NSDictionary *info, BOOL playing) {
  if (!get_client || !info.count) {
    finish(info, playing, nil);
    return;
  }
  get_client(dispatch_get_main_queue(), ^(id client) {
    CFStringRef bid = NULL;
    // A browser tab plays from a helper process: its parent is the browser.
    if (client && client_parent_id) bid = client_parent_id(client);
    if (client && !bid && client_id) bid = client_id(client);
    finish(info, playing, (__bridge NSString *)bid);
  });
}

static void with_playing(NSDictionary *info) {
  if (!get_playing) {
    id r = number(info[@"kMRMediaRemoteNowPlayingInfoPlaybackRate"]);
    with_app(info, r != NSNull.null && [r doubleValue] > 0);
    return;
  }
  get_playing(dispatch_get_main_queue(), ^(Boolean playing) {
    with_app(info, playing);
  });
}

// One read at a time; a change during a read asks for one more.
static void refresh(void) {
  if (busy) {
    again = YES;
    return;
  }
  busy = YES;
  if (!get_info) {
    finish(nil, NO, nil);
    return;
  }
  get_info(dispatch_get_main_queue(), ^(CFDictionaryRef d) {
    NSDictionary *info = d ? [(__bridge NSDictionary *)d copy] : nil;
    with_playing(info);
  });
}

static void refresh_after(double seconds) {
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(seconds * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    refresh();
  });
}

// MRMediaRemoteSendCommand's numbers.
static int command_number(const char *word) {
  if (!strcmp(word, "play")) return 0;
  if (!strcmp(word, "pause")) return 1;
  if (!strcmp(word, "toggle")) return 2;
  if (!strcmp(word, "next")) return 4;
  if (!strcmp(word, "prev")) return 5;
  return -1;
}

static void *read_commands(void *unused) {
  (void)unused;
  char buf[64];
  while (fgets(buf, sizeof buf, stdin)) {
    buf[strcspn(buf, "\r\n")] = 0;
    int command = command_number(buf);
    if (command < 0) continue;
    dispatch_async(dispatch_get_main_queue(), ^{
      if (send_command) send_command(command, NULL);
      refresh_after(0.3);
      refresh_after(1.0);
    });
  }
  // The app closed our stdin or went away.
  exit(0);
  return NULL;
}

EXPORT void notching_media_run(void *perl, void *cv) {
  (void)perl;
  (void)cv;
  void *lib = dlopen("/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote", RTLD_LAZY);
  RegisterFn reg = (RegisterFn)symbol(lib, "MRMediaRemoteRegisterForNowPlayingNotifications");
  get_info = (GetInfoFn)symbol(lib, "MRMediaRemoteGetNowPlayingInfo");
  get_playing = (GetPlayingFn)symbol(lib, "MRMediaRemoteGetNowPlayingApplicationIsPlaying");
  get_client = (GetClientFn)symbol(lib, "MRMediaRemoteGetNowPlayingClient");
  client_parent_id = (ClientIdFn)symbol(lib, "MRNowPlayingClientGetParentAppBundleIdentifier");
  client_id = (ClientIdFn)symbol(lib, "MRNowPlayingClientGetBundleIdentifier");
  send_command = (SendFn)symbol(lib, "MRMediaRemoteSendCommand");

  pthread_t reader;
  pthread_create(&reader, NULL, read_commands, NULL);
  pthread_detach(reader);

  if (reg) reg(dispatch_get_main_queue());
  NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
  for (NSString *name in @[
         notification(lib, "kMRMediaRemoteNowPlayingInfoDidChangeNotification"),
         notification(lib, "kMRMediaRemoteNowPlayingApplicationIsPlayingDidChangeNotification"),
         notification(lib, "kMRMediaRemoteNowPlayingApplicationDidChangeNotification"),
       ]) {
    [center addObserverForName:name object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *n) {
      (void)n;
      refresh();
    }];
  }

  // Notifications can be missed: a slow poll also keeps the heartbeat going.
  dispatch_source_t poll = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, dispatch_get_main_queue());
  dispatch_source_set_timer(poll, dispatch_time(DISPATCH_TIME_NOW, (int64_t)(POLL * NSEC_PER_SEC)),
                            (uint64_t)(POLL * NSEC_PER_SEC), (uint64_t)(0.2 * NSEC_PER_SEC));
  dispatch_source_set_event_handler(poll, ^{
    refresh();
  });
  dispatch_resume(poll);

  refresh();
  CFRunLoopRun();
}
