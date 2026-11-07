//! Notching's own glass (design 7 Nov §5): Core Image draws a panel's glass
//! from the still picture of the screen behind it: blurred, the edge reaching
//! out for what is just outside it with a little rainbow, and a shine.

use std::ffi::c_int;
use std::sync::{Arc, LazyLock};
use std::time::Instant;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::Message;
use objc2_core_foundation::{CGAffineTransform, CGPoint, CGRect, CGSize};
use objc2_core_graphics::CGImage;
use objc2_core_image::{kCIContextWorkingColorSpace, kCIFormatRGBA8, CIColorKernel, CIContext, CIImage, CIKernel, CIVector};
use objc2_foundation::{NSArray, NSData, NSDictionary, NSNull, NSNumber, NSString};

use crate::geometry::Rect;
use crate::glass_capture::Snapshot;
use crate::glass_rules::{crop, look, GlassLook, STAGE_SHADE};
use crate::peek_rules::GlassShape;

/// What the peek layer draws over the screen while a window is peeked at: the
/// shade, and that window's picture (PNG) in its place, CG points.
#[derive(Clone)]
pub struct Overlay {
    pub frame: Rect,
    pub picture: Option<Arc<Vec<u8>>>,
}

/// The look for this run: the owner's numbers, or NOTCHING_GLASS_LOOK over them.
pub fn current_look() -> &'static GlassLook {
    static LOOK: LazyLock<GlassLook> = LazyLock::new(|| look(std::env::var("NOTCHING_GLASS_LOOK").ok().as_deref()));
    &LOOK
}

// The prototype's GLASS (docs/superpowers/specs/2026-11-07-kaca-sendiri-mockups/prototipe.html)
// in Core Image's pixels, where y grows upward: the light from the top-left is (-0.55, +0.85).
const GLASS: &str = r#"
float edge(vec2 p, vec4 r, float rad)
{
    vec2 c = r.xy + r.zw * 0.5;
    vec2 h = r.zw * 0.5 - vec2(rad);
    vec2 q = abs(p - c) - h;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
}

kernel vec4 glass(sampler sharp, sampler blurred, vec4 rect, float radius, float rim, float bend,
                  float rainbow, float crisp, float shine, float sat, float e, float aa)
{
    vec2 p = destCoord();
    float d = edge(p, rect, radius);
    float a = clamp(0.5 - d * aa, 0.0, 1.0);
    vec2 n = normalize(vec2(edge(p + vec2(e, 0.0), rect, radius) - edge(p - vec2(e, 0.0), rect, radius),
                            edge(p + vec2(0.0, e), rect, radius) - edge(p - vec2(0.0, e), rect, radius)) + vec2(0.00001));
    float u = clamp(-d / rim, 0.0, 1.0);
    float m = bend * (1.0 - sqrt(1.0 - (1.0 - u) * (1.0 - u)));
    vec2 off = n * m;
    vec2 pr = p + off * (1.0 + rainbow);
    vec2 pg = p + off;
    vec2 pb = p + off * (1.0 - rainbow);
    vec3 cs = vec3(sample(sharp, samplerTransform(sharp, pr)).r,
                   sample(sharp, samplerTransform(sharp, pg)).g,
                   sample(sharp, samplerTransform(sharp, pb)).b);
    vec3 cb = vec3(sample(blurred, samplerTransform(blurred, pr)).r,
                   sample(blurred, samplerTransform(blurred, pg)).g,
                   sample(blurred, samplerTransform(blurred, pb)).b);
    vec3 col = mix(cs, cb, mix(1.0, smoothstep(0.0, 0.85, u), crisp));
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(l), col, sat);
    float lit = max(dot(n, normalize(vec2(-0.55, 0.85))), 0.0) + 0.55 * max(dot(n, normalize(vec2(0.55, -0.85))), 0.0);
    col = mix(col, vec3(1.0), clamp(shine * pow(1.0 - u, 3.0) * lit * 0.55, 0.0, 1.0));
    return vec4(col * a, a);
}
"#;

// The peek layer's shade over the whole screen.
const SHADE: &str = "kernel vec4 shade(__sample s, float k) { return vec4(s.rgb * k, s.a); }";

// The peeked window's picture with the layer's rounded corners.
const ROUNDED: &str = r#"
kernel vec4 rounded(__sample s, vec4 r, float rad)
{
    vec2 c = r.xy + r.zw * 0.5;
    vec2 h = r.zw * 0.5 - vec2(rad);
    vec2 q = abs(destCoord() - c) - h;
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
    return s * clamp(0.5 - d, 0.0, 1.0);
}
"#;

struct Kernels {
    context: Retained<CIContext>,
    glass: Retained<CIKernel>,
    shade: Retained<CIColorKernel>,
    rounded: Retained<CIColorKernel>,
}

static KERNELS: LazyLock<Option<Kernels>> = LazyLock::new(|| {
    let started = Instant::now();
    // SAFETY: Core Image calls with kernel sources made above.
    #[allow(deprecated)]
    let kernels = unsafe {
        // No colour matching: the kernels work on the screen's own values, as
        // the prototype and the peek layer's shade do, not in linear light.
        let plain = NSDictionary::from_retained_objects(&[kCIContextWorkingColorSpace], &[obj(NSNull::null())]);
        Some(Kernels {
            context: CIContext::contextWithOptions(Some(&plain)),
            glass: CIKernel::kernelWithString(&NSString::from_str(GLASS))?,
            shade: CIColorKernel::kernelWithString(&NSString::from_str(SHADE))?,
            rounded: CIColorKernel::kernelWithString(&NSString::from_str(ROUNDED))?,
        })
    };
    match &kernels {
        Some(_) => eprintln!("notching: glass kernels ready in {} ms", started.elapsed().as_millis()),
        None => eprintln!("notching: the glass kernels did not compile; the card keeps macOS's glass"),
    }
    kernels
});

/// Compiles the kernels once, so the first card does not wait for it.
pub fn warm_up() {
    let _ = KERNELS.as_ref();
}

fn obj<T: Message>(o: Retained<T>) -> Retained<AnyObject> {
    // SAFETY: every Objective-C object is an AnyObject.
    unsafe { Retained::cast_unchecked(o) }
}

fn num(v: f64) -> Retained<AnyObject> {
    obj(NSNumber::new_f64(v))
}

fn vector(r: CGRect) -> Retained<AnyObject> {
    // SAFETY: a plain CIVector of four numbers.
    obj(unsafe { CIVector::vectorWithX_Y_Z_W(r.origin.x, r.origin.y, r.size.width, r.size.height) })
}

/// The glass for `panel` (CG points) from `snap`, as big as the panel in the
/// picture's pixels and in its colours; clear outside the panel's shape.
pub fn render(snap: &Snapshot, panel: Rect, shape: GlassShape, look: &GlassLook, overlay: Option<&Overlay>) -> Option<Retained<CGImage>> {
    let started = Instant::now();
    let k = KERNELS.as_ref()?;
    let (s, sc) = (snap.scale, snap.screen);
    // CG points from the main screen's top-left → the picture's pixels, y upward.
    let to_ci = |r: Rect| CGRect::new(CGPoint::new((r.x - sc.x) * s, (sc.h - (r.y - sc.y) - r.h) * s), CGSize::new(r.w * s, r.h * s));
    // SAFETY: Core Image calls on images and kernels made here; the ROI block
    // lives until the image is rendered below.
    unsafe {
        let mut image = CIImage::imageWithCGImage(&snap.image);
        if let Some(o) = overlay {
            image = shaded(k, &image, o, to_ci(o.frame), s)?;
        }
        let sharp = image.imageByCroppingToRect(to_ci(crop(panel, sc, look))).imageByClampingToExtent();
        let blurred = if look.blur > 0.0 { sharp.imageByApplyingGaussianBlurWithSigma(look.blur * s) } else { sharp.clone() };
        let out_rect = to_ci(panel);
        // Hanging from the notch: the top edge lies past the screen's, so it neither bends nor shines.
        let mut shape_rect = out_rect;
        if shape.flat_top {
            shape_rect.size.height += (shape.radius + look.bend) * s;
        }
        let reach = (look.bend * (1.0 + look.rainbow * 0.5) + 2.0) * s;
        let roi = RcBlock::new(move |_index: c_int, r: CGRect| {
            CGRect::new(CGPoint::new(r.origin.x - reach, r.origin.y - reach), CGSize::new(r.size.width + 2.0 * reach, r.size.height + 2.0 * reach))
        });
        let args = NSArray::from_retained_slice(&[
            obj(sharp),
            obj(blurred),
            vector(shape_rect),
            num(shape.radius * s),
            num(look.rim.max(0.001) * s),
            num(look.bend * s),
            num(look.rainbow * 0.5),
            num(look.crisp),
            num(look.shine),
            num(look.saturation),
            num(0.5 * s),
            num(2.0 / s),
        ]);
        let out = k.glass.applyWithExtent_roiCallback_arguments(out_rect, RcBlock::as_ptr(&roi).cast(), &args)?;
        let space = CGImage::color_space(Some(&snap.image));
        let glass = k.context.createCGImage_fromRect_format_colorSpace(&out, out_rect, kCIFormatRGBA8, space.as_deref())?;
        eprintln!("notching: glass drawn in {} ms", started.elapsed().as_millis());
        Some(glass)
    }
}

// The screen as the peek layer shows it: shaded, with the peeked window's picture at `frame` (Core Image pixels).
fn shaded(k: &Kernels, image: &CIImage, o: &Overlay, frame: CGRect, scale: f64) -> Option<Retained<CIImage>> {
    // SAFETY: Core Image calls on images and kernels made here.
    unsafe {
        let dark = k.shade.applyWithExtent_arguments(image.extent(), &NSArray::from_retained_slice(&[obj(image.retain()), num(1.0 - STAGE_SHADE)]))?;
        let Some(window) = o.picture.as_ref().and_then(|png| CIImage::imageWithData(&NSData::with_bytes(png))) else { return Some(dark) };
        let e = window.extent();
        if e.size.width <= 0.0 || e.size.height <= 0.0 {
            return Some(dark);
        }
        let (sx, sy) = (frame.size.width / e.size.width, frame.size.height / e.size.height);
        let placed = window.imageByApplyingTransform(CGAffineTransform {
            a: sx,
            b: 0.0,
            c: 0.0,
            d: sy,
            tx: frame.origin.x - e.origin.x * sx,
            ty: frame.origin.y - e.origin.y * sy,
        });
        let rounded = k.rounded.applyWithExtent_arguments(frame, &NSArray::from_retained_slice(&[obj(placed), vector(frame), num(11.0 * scale)]))?;
        Some(rounded.imageByCompositingOverImage(&dark))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use objc2_core_foundation::CFRetained;
    use std::ffi::c_void;
    use std::ptr::NonNull;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct R {
        x: f64,
        y: f64,
        w: f64,
        h: f64,
    }

    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        static kCGColorSpaceSRGB: *const c_void;
        fn CGColorSpaceCreateWithName(name: *const c_void) -> *mut c_void;
        fn CGColorSpaceRelease(space: *mut c_void);
        fn CGBitmapContextCreate(data: *mut c_void, w: usize, h: usize, bits: usize, row: usize, space: *mut c_void, info: u32) -> *mut c_void;
        fn CGContextSetRGBFillColor(c: *mut c_void, r: f64, g: f64, b: f64, a: f64);
        fn CGContextFillRect(c: *mut c_void, rect: R);
        fn CGContextDrawImage(c: *mut c_void, rect: R, image: *const CGImage);
        fn CGBitmapContextCreateImage(c: *mut c_void) -> *mut CGImage;
        fn CGBitmapContextGetData(c: *mut c_void) -> *mut u8;
        fn CGBitmapContextGetBytesPerRow(c: *mut c_void) -> usize;
        fn CGContextRelease(c: *mut c_void);
        fn CGImageGetWidth(image: *const CGImage) -> usize;
        fn CGImageGetHeight(image: *const CGImage) -> usize;
    }

    // kCGImageAlphaPremultipliedLast: bytes in memory are R, G, B, A.
    const RGBA: u32 = 1;
    const RED: [f64; 3] = [1.0, 0.0, 0.0];
    const GREEN: [f64; 3] = [0.0, 1.0, 0.0];
    const BLUE: [f64; 3] = [0.0, 0.0, 1.0];
    const SCREEN: Rect = Rect { x: 0.0, y: 0.0, w: 400.0, h: 300.0 };
    const ROUND: GlassShape = GlassShape { radius: 20.0, flat_top: false };

    fn context(w: usize, h: usize) -> *mut c_void {
        // SAFETY: a fresh sRGB bitmap context; the space is released once here.
        unsafe {
            let space = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
            let c = CGBitmapContextCreate(std::ptr::null_mut(), w, h, 8, 0, space, RGBA);
            CGColorSpaceRelease(space);
            assert!(!c.is_null());
            c
        }
    }

    // A screen picture as ScreenCaptureKit gives one: `fills` in CG points from
    // the screen's top-left, drawn in order.
    fn picture(scale: f64, fills: &[(Rect, [f64; 3])]) -> Snapshot {
        let (w, h) = ((SCREEN.w * scale) as usize, (SCREEN.h * scale) as usize);
        let c = context(w, h);
        // SAFETY: drawing into the context made above, released once.
        let image = unsafe {
            for (r, [red, green, blue]) in fills {
                CGContextSetRGBFillColor(c, *red, *green, *blue, 1.0);
                let y = SCREEN.h - (r.y - SCREEN.y) - r.h;
                CGContextFillRect(c, R { x: (r.x - SCREEN.x) * scale, y: y * scale, w: r.w * scale, h: r.h * scale });
            }
            let image = CGBitmapContextCreateImage(c);
            CGContextRelease(c);
            CFRetained::from_raw(NonNull::new(image).unwrap())
        };
        Snapshot { screen: SCREEN, scale, image }
    }

    // An image's pixels, rows from the top: (width, height, RGBA bytes).
    fn pixels(image: &CGImage) -> (usize, usize, Vec<u8>) {
        // SAFETY: the image is drawn into a context of its own size, read, and released.
        unsafe {
            let (w, h) = (CGImageGetWidth(image), CGImageGetHeight(image));
            let c = context(w, h);
            CGContextDrawImage(c, R { x: 0.0, y: 0.0, w: w as f64, h: h as f64 }, image);
            let row = CGBitmapContextGetBytesPerRow(c);
            let data = std::slice::from_raw_parts(CGBitmapContextGetData(c), row * h);
            let mut out = Vec::with_capacity(w * h * 4);
            for y in 0..h {
                out.extend_from_slice(&data[y * row..y * row + w * 4]);
            }
            CGContextRelease(c);
            (w, h, out)
        }
    }

    fn at(p: &(usize, usize, Vec<u8>), x: usize, y: usize) -> [u8; 4] {
        let i = (y * p.0 + x) * 4;
        [p.2[i], p.2[i + 1], p.2[i + 2], p.2[i + 3]]
    }

    fn plain() -> GlassLook {
        GlassLook { tint: 0.4, blur: 0.0, bend: 0.0, rim: 26.0, crisp: 1.0, rainbow: 0.0, shine: 0.0, saturation: 1.0 }
    }

    fn sharp_default() -> GlassLook {
        GlassLook { blur: 0.0, shine: 0.0, ..GlassLook::default() }
    }

    fn bands(scale: f64) -> Snapshot {
        picture(
            scale,
            &[
                (Rect { x: 0.0, y: 0.0, w: 400.0, h: 80.0 }, RED),
                (Rect { x: 0.0, y: 80.0, w: 400.0, h: 90.0 }, BLUE),
                (Rect { x: 0.0, y: 170.0, w: 400.0, h: 130.0 }, GREEN),
            ],
        )
    }

    // Off the screen's middle on purpose: a picture read upside down puts other colours here.
    const PANEL: Rect = Rect { x: 100.0, y: 80.0, w: 200.0, h: 90.0 };

    #[test]
    fn plain_glass_is_the_picture() {
        for scale in [1.0, 2.0] {
            let snap = picture(
                scale,
                &[
                    (Rect { x: 0.0, y: 0.0, w: 180.0, h: 150.0 }, RED),
                    (Rect { x: 180.0, y: 0.0, w: 220.0, h: 150.0 }, GREEN),
                    (Rect { x: 0.0, y: 150.0, w: 180.0, h: 150.0 }, BLUE),
                    (Rect { x: 180.0, y: 150.0, w: 220.0, h: 150.0 }, [0.8, 0.6, 0.2]),
                ],
            );
            // The middle (200, 120) is green; read upside down it would be gold.
            let panel = Rect { x: 100.0, y: 60.0, w: 200.0, h: 120.0 };
            let glass = render(&snap, panel, ROUND, &plain(), None).expect("drawn");
            let out = pixels(&glass);
            let src = pixels(&snap.image);
            let (cx, cy) = (200.0, 120.0);
            let got = at(&out, ((cx - panel.x) * scale) as usize, ((cy - panel.y) * scale) as usize);
            let want = at(&src, (cx * scale) as usize, (cy * scale) as usize);
            for k in 0..4 {
                assert!((got[k] as i32 - want[k] as i32).abs() <= 2, "scale {scale}: {got:?} vs {want:?}");
            }
        }
    }

    #[test]
    fn the_top_edge_bends_in_what_is_above() {
        for scale in [1.0, 2.0] {
            let glass = render(&bands(scale), PANEL, ROUND, &sharp_default(), None).expect("drawn");
            let out = pixels(&glass);
            let inside = (0.5 * scale) as usize;
            let top = at(&out, out.0 / 2, inside);
            assert!(top[0] > top[2], "scale {scale}: the top edge shows red from above, got {top:?}");
            let bottom = at(&out, out.0 / 2, out.1 - 1 - inside);
            assert!(bottom[1] > bottom[2], "scale {scale}: the bottom edge shows green from below, got {bottom:?}");
        }
    }

    #[test]
    fn a_flat_top_does_not_bend() {
        let flat = GlassShape { radius: 30.0, flat_top: true };
        for scale in [1.0, 2.0] {
            let glass = render(&bands(scale), PANEL, flat, &sharp_default(), None).expect("drawn");
            let out = pixels(&glass);
            let top = at(&out, out.0 / 2, (0.5 * scale) as usize);
            assert!(top[2] > top[0], "scale {scale}: a flat top stays blue, got {top:?}");
        }
    }

    #[test]
    fn the_shine_sits_on_the_top_edge() {
        for scale in [1.0, 2.0] {
            let grey = picture(scale, &[(SCREEN, [0.4, 0.4, 0.4])]);
            let look = GlassLook { shine: 1.0, ..plain() };
            let glass = render(&grey, PANEL, ROUND, &look, None).expect("drawn");
            let out = pixels(&glass);
            let inside = (1.0 * scale) as usize;
            let top = at(&out, out.0 / 2, inside);
            let bottom = at(&out, out.0 / 2, out.1 - 1 - inside);
            assert!(top[0] > bottom[0] + 10, "scale {scale}: light from the top-left, got top {top:?} bottom {bottom:?}");
        }
    }

    #[test]
    fn the_peek_shade_darkens_the_glass() {
        for scale in [1.0, 2.0] {
            let grey = picture(scale, &[(SCREEN, [0.8, 0.8, 0.8])]);
            let away = Overlay { frame: Rect { x: 320.0, y: 220.0, w: 60.0, h: 60.0 }, picture: None };
            let lit = pixels(&render(&grey, PANEL, ROUND, &plain(), None).expect("drawn"));
            let dim = pixels(&render(&grey, PANEL, ROUND, &plain(), Some(&away)).expect("drawn"));
            let (a, b) = (at(&lit, lit.0 / 2, lit.1 / 2), at(&dim, dim.0 / 2, dim.1 / 2));
            assert!((b[0] as f64) < a[0] as f64 * 0.8, "scale {scale}: shaded {b:?} vs plain {a:?}");
        }
    }

    // The layer's rgba(0, 0, 0, .55) is blended on the screen's own values, as
    // the prototype computes: the glass works on them too, not in linear light.
    #[test]
    fn the_peek_shade_matches_the_layer_around_the_card() {
        for scale in [1.0, 2.0] {
            let grey = picture(scale, &[(SCREEN, [0.8, 0.8, 0.8])]);
            let away = Overlay { frame: Rect { x: 320.0, y: 220.0, w: 60.0, h: 60.0 }, picture: None };
            let dim = pixels(&render(&grey, PANEL, ROUND, &plain(), Some(&away)).expect("drawn"));
            let got = at(&dim, dim.0 / 2, dim.1 / 2)[0] as f64;
            let want = 204.0 * (1.0 - STAGE_SHADE);
            assert!((got - want).abs() <= 3.0, "scale {scale}: shaded grey {got}, the layer gives {want}");
        }
    }

    #[test]
    fn a_panel_at_the_screen_edge_still_draws() {
        for scale in [1.0, 2.0] {
            let panel = Rect { x: 0.0, y: 80.0, w: 150.0, h: 90.0 };
            let glass = render(&bands(scale), panel, ROUND, &GlassLook::default(), None).expect("drawn");
            let out = pixels(&glass);
            assert_eq!((out.0, out.1), ((150.0 * scale) as usize, (90.0 * scale) as usize));
        }
    }
}
