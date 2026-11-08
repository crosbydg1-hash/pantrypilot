// Puts a sound track onto a silent video without re-encoding the picture.
// usage: swift marketing/mux.swift video.mp4 audio.m4a out.mp4
import AVFoundation

let a = CommandLine.arguments
guard a.count == 4 else { print("usage: mux.swift video.mp4 audio.m4a out.mp4"); exit(1) }
let video = AVURLAsset(url: URL(fileURLWithPath: a[1]))
let audio = AVURLAsset(url: URL(fileURLWithPath: a[2]))
let out = URL(fileURLWithPath: a[3])
try? FileManager.default.removeItem(at: out)

let sem = DispatchSemaphore(value: 0)
Task {
    do {
        let comp = AVMutableComposition()
        let vTrack = try await video.loadTracks(withMediaType: .video)[0]
        let aTrack = try await audio.loadTracks(withMediaType: .audio)[0]
        let dur = try await video.load(.duration)
        let aDur = try await audio.load(.duration)
        let cv = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
        try cv.insertTimeRange(CMTimeRange(start: .zero, duration: dur), of: vTrack, at: .zero)
        let ca = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
        try ca.insertTimeRange(CMTimeRange(start: .zero, duration: CMTimeMinimum(dur, aDur)), of: aTrack, at: .zero)
        let ex = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetPassthrough)!
        try await ex.export(to: out, as: .mp4)
        print("made", out.lastPathComponent)
    } catch { print("failed:", error); exit(1) }
    sem.signal()
}
sem.wait()
