import SwiftUI

struct DartboardView: View {
    let size: CGSize

    // Static constants to avoid recreating on every view render
    // Dartboard segments in clockwise order starting from top
    private static let segments = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]

    // Colors - matched exactly to web version
    private static let blackColor = Color(red: 0.039, green: 0.039, blue: 0.039) // #0a0a0a
    private static let creamColor = Color(red: 0.96, green: 0.94, blue: 0.91) // #f5f0e8
    private static let redColor = Color(red: 0.722, green: 0.137, blue: 0.165) // #b8232a - web deep red
    private static let greenColor = Color(red: 0.051, green: 0.420, blue: 0.180) // #0d6b2e - web deep green
    private static let goldColor = Color(red: 0.722, green: 0.533, blue: 0.043) // #b8860b - gold frame
    private static let navyDarkColor = Color(red: 0.102, green: 0.102, blue: 0.180) // #1a1a2e - dark navy
    private static let chromeColor = Color(red: 0.75, green: 0.75, blue: 0.75) // Silver/chrome

    var body: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let radius = min(size.width, size.height) / 2
            // Scale to match web proportions - leave room for number ring, chrome ring, and gold frame
            let scale = radius / 200.0

            // Ring radii (in mm, scaled) - matched exactly to web version
            let innerBullRadius = 8.0 * scale
            let outerBullRadius = 16.0 * scale
            let tripleInner = 95.0 * scale
            let tripleOuter = 107.0 * scale
            let doubleInner = 160.0 * scale
            let doubleOuter = 172.0 * scale
            let chromeOuter = 180.0 * scale  // Chrome ring outer edge
            let chromeInner = 174.0 * scale  // Chrome ring inner edge
            let numberRadius = 190.0 * scale  // Where numbers are drawn

            // Draw outer board background with gold frame (matching web version)
            // Gold frame ring (outermost)
            context.fill(
                Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)),
                with: .color(Self.goldColor)
            )

            // Navy background inside gold frame (number ring area)
            let navyRadius = radius - 4.0 * scale
            context.fill(
                Path(ellipseIn: CGRect(x: center.x - navyRadius, y: center.y - navyRadius, width: navyRadius * 2, height: navyRadius * 2)),
                with: .color(Self.navyDarkColor)
            )

            // Chrome/metallic ring around dartboard (matching web version)
            context.fill(
                Path(ellipseIn: CGRect(x: center.x - chromeOuter, y: center.y - chromeOuter, width: chromeOuter * 2, height: chromeOuter * 2)),
                with: .color(Self.chromeColor)
            )

            // Dark inner edge of chrome ring
            context.fill(
                Path(ellipseIn: CGRect(x: center.x - chromeInner, y: center.y - chromeInner, width: chromeInner * 2, height: chromeInner * 2)),
                with: .color(Color(red: 0.1, green: 0.1, blue: 0.1)) // #1a1a1a
            )

            // Draw 20 segments
            for (index, segmentValue) in Self.segments.enumerated() {
                let angle = Double(index) * 18.0 - 9.0 // Each segment is 18°, offset by -9° to center on top
                let nextAngle = angle + 18.0

                // Double ring
                drawSegment(
                    context: context,
                    center: center,
                    innerRadius: doubleInner,
                    outerRadius: doubleOuter,
                    startAngle: angle,
                    endAngle: nextAngle,
                    color: index % 2 == 0 ? Self.redColor : Self.greenColor
                )

                // Outer single (between double and triple)
                drawSegment(
                    context: context,
                    center: center,
                    innerRadius: tripleOuter,
                    outerRadius: doubleInner,
                    startAngle: angle,
                    endAngle: nextAngle,
                    color: index % 2 == 0 ? Self.blackColor : Self.creamColor
                )

                // Triple ring
                drawSegment(
                    context: context,
                    center: center,
                    innerRadius: tripleInner,
                    outerRadius: tripleOuter,
                    startAngle: angle,
                    endAngle: nextAngle,
                    color: index % 2 == 0 ? Self.redColor : Self.greenColor
                )

                // Inner single (between triple and bull)
                drawSegment(
                    context: context,
                    center: center,
                    innerRadius: outerBullRadius,
                    outerRadius: tripleInner,
                    startAngle: angle,
                    endAngle: nextAngle,
                    color: index % 2 == 0 ? Self.blackColor : Self.creamColor
                )

                // Draw number in the navy number ring area
                let numberAngle = angle + 9.0 // Center of segment
                let radians = (numberAngle - 90.0) * .pi / 180.0
                let numberX = center.x + cos(radians) * numberRadius
                let numberY = center.y + sin(radians) * numberRadius

                let text = Text("\(segmentValue)")
                    .font(.system(size: radius * 0.10, weight: .bold))
                    .foregroundColor(Self.creamColor)

                context.draw(text, at: CGPoint(x: numberX, y: numberY))
            }

            // Draw outer bull (single bull - 25 points)
            context.fill(
                Path(ellipseIn: CGRect(
                    x: center.x - outerBullRadius,
                    y: center.y - outerBullRadius,
                    width: outerBullRadius * 2,
                    height: outerBullRadius * 2
                )),
                with: .color(Self.greenColor)
            )

            // Draw inner bull (double bull/bullseye - 50 points)
            context.fill(
                Path(ellipseIn: CGRect(
                    x: center.x - innerBullRadius,
                    y: center.y - innerBullRadius,
                    width: innerBullRadius * 2,
                    height: innerBullRadius * 2
                )),
                with: .color(Self.redColor)
            )

            // Draw spider (wire dividers) - thin white lines (only within scoring area)
            for index in 0..<20 {
                let angle = Double(index) * 18.0
                let radians = (90.0 - angle) * .pi / 180.0
                let startPoint = CGPoint(
                    x: center.x + cos(radians) * outerBullRadius,
                    y: center.y + sin(radians) * outerBullRadius
                )
                let endPoint = CGPoint(
                    x: center.x + cos(radians) * doubleOuter,
                    y: center.y + sin(radians) * doubleOuter
                )

                var path = Path()
                path.move(to: startPoint)
                path.addLine(to: endPoint)

                context.stroke(
                    path,
                    with: .color(Color(red: 0.8, green: 0.8, blue: 0.8)),
                    lineWidth: 1.5
                )
            }

            // Draw ring dividers
            for ringRadius in [outerBullRadius, tripleInner, tripleOuter, doubleInner, doubleOuter] {
                context.stroke(
                    Path(ellipseIn: CGRect(
                        x: center.x - ringRadius,
                        y: center.y - ringRadius,
                        width: ringRadius * 2,
                        height: ringRadius * 2
                    )),
                    with: .color(Color(red: 0.8, green: 0.8, blue: 0.8)),
                    lineWidth: 1.5
                )
            }
        }
        .frame(width: size.width, height: size.height)
    }

    private func drawSegment(
        context: GraphicsContext,
        center: CGPoint,
        innerRadius: Double,
        outerRadius: Double,
        startAngle: Double,
        endAngle: Double,
        color: Color
    ) {
        let startRadians = (90.0 - startAngle) * .pi / 180.0
        let endRadians = (90.0 - endAngle) * .pi / 180.0

        var path = Path()

        // Start at inner radius
        path.move(to: CGPoint(
            x: center.x + cos(startRadians) * innerRadius,
            y: center.y + sin(startRadians) * innerRadius
        ))

        // Line to outer radius
        path.addLine(to: CGPoint(
            x: center.x + cos(startRadians) * outerRadius,
            y: center.y + sin(startRadians) * outerRadius
        ))

        // Arc along outer radius
        path.addArc(
            center: center,
            radius: outerRadius,
            startAngle: Angle(degrees: 90.0 - startAngle),
            endAngle: Angle(degrees: 90.0 - endAngle),
            clockwise: true
        )

        // Line back to inner radius
        path.addLine(to: CGPoint(
            x: center.x + cos(endRadians) * innerRadius,
            y: center.y + sin(endRadians) * innerRadius
        ))

        // Arc along inner radius (back to start)
        path.addArc(
            center: center,
            radius: innerRadius,
            startAngle: Angle(degrees: 90.0 - endAngle),
            endAngle: Angle(degrees: 90.0 - startAngle),
            clockwise: false
        )

        path.closeSubpath()

        context.fill(path, with: .color(color))
    }
}

#Preview {
    DartboardView(size: CGSize(width: 350, height: 350))
        .frame(width: 350, height: 350)
        .background(Color(red: 0.1, green: 0.1, blue: 0.18))
}
