import Foundation
import Vision

let root = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let images = try FileManager.default.contentsOfDirectory(at: root.appendingPathComponent("exports"), includingPropertiesForKeys: nil).filter { $0.pathExtension == "png" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
let excluded = ["\u{754c}\u{9762}", "\u{6f14}\u{793a}", "\u{5de5}\u{5177}", "\u{7f51}\u{9875}"]
var results: [[String: Any]] = []
var total = 0
for image in images {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    request.usesLanguageCorrection = false
    try VNImageRequestHandler(url: image).perform([request])
    let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
    let text = lines.joined(separator: "\n")
    let hits = excluded.filter { text.contains($0) }
    total += hits.count
    results.append(["file": image.lastPathComponent, "recognizedLines": lines, "excludedTermsFound": hits])
}
let report: [String: Any] = ["images": results, "excludedTermsFound": total, "note": "OCR is supplemental; source text and visible regions also reviewed."]
let data = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
try data.write(to: root.appendingPathComponent("ocr-review.json"))
guard images.count == 6 && total == 0 else { fatalError("Review exported text before use") }
print("Reviewed six exports with local OCR; no excluded terms found")
