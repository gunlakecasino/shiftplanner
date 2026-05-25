// DeploymentPDFExporter.swift — Renders DeploymentBookView to a PDF file.
//
// Uses SwiftUI's ImageRenderer (iOS 16+) with a CGContext PDF backend to
// produce a vector PDF — text stays crisp at any print scale.
//
// Usage:
//   let url = try await DeploymentPDFExporter.export(state: state)
//   // url is a file in the app's temp directory, valid until next export.

import SwiftUI
import PDFKit

@MainActor
enum DeploymentPDFExporter {

    /// Renders the deployment book to a PDF file and returns its URL.
    /// The file is written to the app's temp directory.
    static func export(state: ShiftPlannerState) throws -> URL {
        let view = DeploymentBookView(state: state)
        let pageSize = CGSize(width:  DeploymentBookView.pageWidth,
                              height: DeploymentBookView.pageHeight)

        // Build the output URL
        let filename = "GLCR_DeploymentBook_\(state.selectedDate.supabaseDateString).pdf"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)

        // Use ImageRenderer to render the SwiftUI view into a PDF context
        let renderer = ImageRenderer(content: view)
        renderer.proposedSize = ProposedViewSize(width: pageSize.width,
                                                 height: pageSize.height)

        renderer.render { size, draw in
            var mediaBox = CGRect(origin: .zero, size: size)
            guard let ctx = CGContext(url as CFURL, mediaBox: &mediaBox, nil) else { return }
            ctx.beginPDFPage(nil)
            draw(ctx)
            ctx.endPDFPage()
            ctx.closePDF()
        }

        // Verify the file was written
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw ExportError.renderFailed
        }
        return url
    }

    enum ExportError: Error, LocalizedError {
        case renderFailed
        var errorDescription: String? { "PDF render failed — CGContext could not be created." }
    }
}
