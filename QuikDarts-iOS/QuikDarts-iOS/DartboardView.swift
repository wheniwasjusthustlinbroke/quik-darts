import SwiftUI

struct DartboardView: View {
    let size: CGSize

    // Dartboard segments in clockwise order starting from top
    let segments = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]

    // Colors
    let blackColor = Color(red: 0.1, green: 0.1, blue: 0.1)
    let whiteColor = Color(red: 0.95, green: 0.95, blue: 0.95)
    let redColor = Color(red: 0.85, green: 0.1, blue: 0.1)
    let greenColor = Color(red: 0.15, green: 0.6, blue: 0.2)
    let creamColor = Color(red: 0.95, green: 0.93, blue: 0.85)

    var body: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let radius = min(size.width, size.height) / 2
            let scale = radius / 170.0

            // Ring radii (in mm, scaled)
            let innerBullRadius = 8.0 * scale
            let outerBullRadius = 16.0 * scale
            let tripleInner = 99.0 * scale
            let tripleOuter = 107.0 * scale
            let doubleInner = 162.0 * scale
            let doubleOuter = 170.0 * scale

            // Draw outer board background
            context.fill(
                Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)),
                with: .color(blackColor)
            )

            // Draw 20 segments
            for (index, segmentValue) in segments.enumerated() {
                let angle = Double(index) * 18.0 - 9.0 // Each segment is 18°, offset by -9° to center on top
                let nextAngle = angle + 18.0

                // Outer single (double ring to edge)
                drawSegment(
                    context: context,
                    center: center,
                    innerRadius: doubleOuter,
                    outerRadius: radius,
                    startAngle: angle,
                    endAngle: nextAngle,
                    color: index % 2 == 0 ? blackColor : whiteColor
                )

                // Double ring
                drawSegment(
                    context: context,
                    center: center,
                    innerRadius: doubleInner,
                    outerRadius: doubleOuter,
                    startAngle: angle,
                    endAngle: nextAngle,
                    color: index % 2 == 0 ? redColor : greenColor
                )

                // Outer single (between double and triple)
                drawSegment(
                    context: context,
                    center: center,
                    innerRadius: tripleOuter,
                    outerRadius: doubleInner,
                    startAngle: angle,
                    endAngle: nextAngle,
                    color: index % 2 == 0 ? blackColor : creamColor
                )

                // Triple ring
                drawSegment(
                    context: context,
                    center: center,
                    innerRadius: tripleInner,
                    outerRadius: tripleOuter,
                    startAngle: angle,
                    endAngle: nextAngle,
                    color: index % 2 == 0 ? redColor : greenColor
                )

                // Inner single (between triple and bull)
                drawSegment(
                    context: context,
                    center: center,
                    innerRadius: outerBullRadius,
                    outerRadius: tripleInner,
                    startAngle: angle,
                    endAngle: nextAngle,
                    color: index % 2 == 0 ? blackColor : creamColor
                )

                // Draw number
                let numberAngle = angle + 9.0 // Center of segment
                let numberRadius = (doubleOuter + radius) / 2
                let radians = (numberAngle - 90.0) * .pi / 180.0
                let numberX = center.x + cos(radians) * numberRadius
                let numberY = center.y + sin(radians) * numberRadius

                let text = Text("\(segmentValue)")
                    .font(.system(size: radius * 0.12, weight: .bold))
                    .foregroundColor(.white)

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
                with: .color(greenColor)
            )

            // Draw inner bull (double bull/bullseye - 50 points)
            context.fill(
                Path(ellipseIn: CGRect(
                    x: center.x - innerBullRadius,
                    y: center.y - innerBullRadius,
                    width: innerBullRadius * 2,
                    height: innerBullRadius * 2
                )),
                with: .color(redColor)
            )

            // Draw spider (wire dividers) - thin white lines
            for index in 0..<20 {
                let angle = Double(index) * 18.0
                let radians = (90.0 - angle) * .pi / 180.0
                let startPoint = CGPoint(
                    x: center.x + cos(radians) * outerBullRadius,
                    y: center.y + sin(radians) * outerBullRadius
                )
                let endPoint = CGPoint(
                    x: center.x + cos(radians) * radius,
                    y: center.y + sin(radians) * radius
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
