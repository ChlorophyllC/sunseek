// Deterministic QR code, generated and decoded locally with macOS frameworks.
import Foundation
import AppKit
import CoreImage
import Vision

let arguments = CommandLine.arguments
if arguments.count == 4 && arguments[1] == "--verify" {
    let request = VNDetectBarcodesRequest()
    try VNImageRequestHandler(url: URL(fileURLWithPath: arguments[2])).perform([request])
    guard request.results?.contains(where: { $0.payloadStringValue == arguments[3] }) == true else { fatalError("Exported poster QR verification failed") }
    print("Exported poster QR decoded successfully")
    exit(0)
}
guard arguments.count == 3 else { fatalError("Usage: qr.swift URL output.png") }
let value = arguments[1]
let filter = CIFilter(name: "CIQRCodeGenerator", parameters: ["inputMessage": Data(value.utf8), "inputCorrectionLevel": "M"])!
let image = filter.outputImage!.transformed(by: CGAffineTransform(scaleX: 8, y: 8))
let code = CIContext(options: [.useSoftwareRenderer: true]).createCGImage(image, from: image.extent)!
let border = 32, width = code.width + border * 2
let canvas = CGContext(data: nil, width: width, height: width, bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
canvas.setFillColor(CGColor(gray: 1, alpha: 1))
canvas.fill(CGRect(x: 0, y: 0, width: width, height: width))
canvas.interpolationQuality = .none
canvas.draw(code, in: CGRect(x: border, y: border, width: code.width, height: code.height))
let result = canvas.makeImage()!
let encoded = NSBitmapImageRep(cgImage: result).representation(using: .png, properties: [:])!
try encoded.write(to: URL(fileURLWithPath: arguments[2]))
let request = VNDetectBarcodesRequest()
try VNImageRequestHandler(cgImage: result).perform([request])
guard request.results?.contains(where: { $0.payloadStringValue == value }) == true else { fatalError("QR verification failed") }
print("QR decoded successfully: \(width) × \(width)")
