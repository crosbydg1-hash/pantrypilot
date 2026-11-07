// Turns a list of still images into an MP4 video for Instagram Reels and TikTok (1080x1920, 30 fps, no sound).
// usage: swift marketing/render_video.swift timeline.json out.mp4
// timeline.json: {"width":1080,"height":1920,"fps":30,"fade":0.25,
//   "scenes":[{"image":"/abs/path.png","seconds":2.0,"effect":"zoom"|"pop"|"slide"|"none"}]}
// Each scene fades into the next. "zoom" slowly pushes in, "pop" springs in at the start, "slide" rises up from below.
import AVFoundation
import CoreGraphics
import Foundation
import ImageIO

struct Scene: Decodable { let image: String; let seconds: Double; let effect: String? }
struct Timeline: Decodable { let width: Int; let height: Int; let fps: Int; let fade: Double; let scenes: [Scene] }

let args = CommandLine.arguments
guard args.count == 3 else { print("usage: render_video.swift timeline.json out.mp4"); exit(1) }
let tl = try JSONDecoder().decode(Timeline.self, from: Data(contentsOf: URL(fileURLWithPath: args[1])))
let outURL = URL(fileURLWithPath: args[2])
try? FileManager.default.removeItem(at: outURL)

func load(_ path: String) -> CGImage {
    guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
          let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { fatalError("can't read \(path)") }
    return img
}
let images = tl.scenes.map { load($0.image) }
let W = tl.width, H = tl.height, fps = tl.fps

let writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 10_000_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel]])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

// Scene start times: each scene overlaps the previous one by the fade length.
var starts: [Double] = []
var t = 0.0
for (i, s) in tl.scenes.enumerated() { starts.append(t); t += s.seconds - (i < tl.scenes.count - 1 ? tl.fade : 0) }
let total = t
let frames = Int((total * Double(fps)).rounded())

func ease(_ x: Double) -> Double { let c = min(max(x, 0), 1); return 1 - pow(1 - c, 3) }
func spring(_ x: Double) -> Double { let c = min(max(x, 0), 1); return 1 + 0.06 * sin(c * .pi) * (1 - c) - 0.06 * (1 - ease(c)) }

func draw(_ ctx: CGContext, _ i: Int, local: Double, alpha: Double) {
    let s = tl.scenes[i], img = images[i]
    var scale = 1.0, dy = 0.0
    switch s.effect ?? "none" {
    case "zoom": scale = 1.0 + 0.07 * (local / s.seconds)
    case "pop": scale = spring(local / 0.35)
    case "slide": dy = -Double(H) * 0.06 * (1 - ease(local / 0.45))
    default: break
    }
    ctx.saveGState()
    ctx.setAlpha(CGFloat(alpha))
    let w = Double(W) * scale, h = Double(H) * scale
    ctx.interpolationQuality = .high
    ctx.draw(img, in: CGRect(x: (Double(W) - w) / 2, y: (Double(H) - h) / 2 + dy, width: w, height: h))
    ctx.restoreGState()
}

for f in 0..<frames {
    while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.005) }
    let time = Double(f) / Double(fps)
    var pb: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
    guard let buf = pb else { fatalError("no pixel buffer") }
    CVPixelBufferLockBaseAddress(buf, [])
    let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: W, height: H, bitsPerComponent: 8,
                        bytesPerRow: CVPixelBufferGetBytesPerRow(buf), space: CGColorSpaceCreateDeviceRGB(),
                        bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
    ctx.setFillColor(CGColor(red: 0.945, green: 0.957, blue: 0.945, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
    for i in tl.scenes.indices {
        let local = time - starts[i]
        guard local >= 0, local < tl.scenes[i].seconds else { continue }
        // Fade in over the previous scene (the first scene starts fully shown).
        let alpha = i == 0 ? 1.0 : min(local / tl.fade, 1.0)
        draw(ctx, i, local: local, alpha: alpha)
    }
    CVPixelBufferUnlockBaseAddress(buf, [])
    adaptor.append(buf, withPresentationTime: CMTime(value: CMTimeValue(f), timescale: CMTimeScale(fps)))
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
if writer.status != .completed { print("failed:", writer.error ?? "unknown"); exit(1) }
print(String(format: "made %@ (%.1f s, %d frames)", outURL.lastPathComponent, total, frames))
