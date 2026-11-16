// Local OCR and barcode evidence for exported posters, without visiting services.
import Foundation
import Vision
let args = CommandLine.arguments
guard args.count >= 3 else { fatalError("Usage: ocr.swift output.json exports-dir...") }
var evidence = [[String: Any]]()
for directory in args.dropFirst(2) {
    let folder = URL(fileURLWithPath: directory)
    let files = try FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil).filter { $0.pathExtension == "png" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
    for file in files {
        let text = VNRecognizeTextRequest()
        text.recognitionLevel = .accurate
        text.recognitionLanguages = ["zh-Hans", "en-US"]
        text.usesLanguageCorrection = false
        let barcodes = VNDetectBarcodesRequest()
        try VNImageRequestHandler(url: file).perform([text, barcodes])
        evidence.append(["image": directory + "/" + file.lastPathComponent, "lines": (text.results ?? []).compactMap { $0.topCandidates(1).first?.string }, "barcodeCount": barcodes.results?.count ?? 0])
    }
}
try JSONSerialization.data(withJSONObject: evidence, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: args[1]))
print("OCR and barcode review complete: \(evidence.count) images")
