import SwiftUI

struct DartboardView: View {
    let size: CGSize
    @ObservedObject var themeManager: ThemeManager = ThemeManager.shared

    // Optional: Allow external neon pulse phase for animation sync
    var neonPulsePhase: Double = 0

    // Static constants to avoid recreating on every view render
    // Dartboard segments in clockwise order starting from top
    private static let segments = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]

    var body: some View {
        let theme = themeManager.currentTheme
        let colors = themeManager.currentColors
        let effects = theme.effects

        // Calculate glow intensity for neon pulse animation
        let glowIntensity = effects.pulseAnimation ? 0.6 + 0.4 * sin(neonPulsePhase) : 1.0

        Canvas { context, canvasSize in
            let center = CGPoint(x: canvasSize.width / 2, y: canvasSize.height / 2)
            let radius = min(canvasSize.width, canvasSize.height) / 2
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

            // Draw outer board background with frame
            // Frame ring (outermost)
            context.fill(
                Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)),
                with: .color(colors.frameColor)
            )

            // Navy/Number ring background inside frame
            let navyRadius = radius - 4.0 * scale
            context.fill(
                Path(ellipseIn: CGRect(x: center.x - navyRadius, y: center.y - navyRadius, width: navyRadius * 2, height: navyRadius * 2)),
                with: .color(colors.numberRing)
            )

            // Chrome/metallic ring around dartboard
            context.fill(
                Path(ellipseIn: CGRect(x: center.x - chromeOuter, y: center.y - chromeOuter, width: chromeOuter * 2, height: chromeOuter * 2)),
                with: .color(colors.chromeRing)
            )

            // Dark inner edge of chrome ring
            context.fill(
                Path(ellipseIn: CGRect(x: center.x - chromeInner, y: center.y - chromeInner, width: chromeInner * 2, height: chromeInner * 2)),
                with: .color(colors.boardBackground)
            )

            // Draw 20 segments
            for (index, segmentValue) in Self.segments.enumerated() {
                let angle = Double(index) * 18.0 - 9.0 // Each segment is 18 degrees, offset by -9 degrees to center on top
                let nextAngle = angle + 18.0

                // Get segment colors based on theme
                let segmentColor = index % 2 == 0 ? colors.segmentPrimary : colors.segmentSecondary
                let ringColor = index % 2 == 0 ? colors.doubleTripleEven : colors.doubleTripleOdd

                // Double ring
                drawSegment(
                    context: context,
                    center: center,
                    innerRadius: doubleInner,
                    outerRadius: doubleOuter,
                    startAngle: angle,
                    endAngle: nextAngle,
                    color: ringColor,
                    wireColor: colors.wireColor,
                    wireWidth: effects.wireWidth
                )

                // Outer single (between double and triple)
                drawSegment(
                    context: context,
                    center: center,
                    innerRadius: tripleOuter,
                    outerRadius: doubleInner,
                    startAngle: angle,
                    endAngle: nextAngle,
                    color: segmentColor,
                    wireColor: colors.wireColor,
                    wireWidth: effects.wireWidth
                )

                // Triple ring
                drawSegment(
                    context: context,
                    center: center,
                    innerRadius: tripleInner,
                    outerRadius: tripleOuter,
                    startAngle: angle,
                    endAngle: nextAngle,
                    color: ringColor,
                    wireColor: colors.wireColor,
                    wireWidth: effects.wireWidth
                )

                // Inner single (between triple and bull)
                drawSegment(
                    context: context,
                    center: center,
                    innerRadius: outerBullRadius,
                    outerRadius: tripleInner,
                    startAngle: angle,
                    endAngle: nextAngle,
                    color: segmentColor,
                    wireColor: colors.wireColor,
                    wireWidth: effects.wireWidth
                )

                // Draw number in the navy number ring area
                let numberAngle = angle + 9.0 // Center of segment
                let radians = (numberAngle - 90.0) * .pi / 180.0
                let numberX = center.x + cos(radians) * numberRadius
                let numberY = center.y + sin(radians) * numberRadius

                let text = Text("\(segmentValue)")
                    .font(.system(size: radius * 0.10, weight: .bold))
                    .foregroundColor(colors.numberText)

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
                with: .color(colors.outerBull)
            )

            // Draw outer bull wire
            context.stroke(
                Path(ellipseIn: CGRect(
                    x: center.x - outerBullRadius,
                    y: center.y - outerBullRadius,
                    width: outerBullRadius * 2,
                    height: outerBullRadius * 2
                )),
                with: .color(colors.wireColor),
                lineWidth: effects.wireWidth
            )

            // Draw inner bull (double bull/bullseye - 50 points)
            context.fill(
                Path(ellipseIn: CGRect(
                    x: center.x - innerBullRadius,
                    y: center.y - innerBullRadius,
                    width: innerBullRadius * 2,
                    height: innerBullRadius * 2
                )),
                with: .color(colors.innerBull)
            )

            // Draw inner bull wire
            context.stroke(
                Path(ellipseIn: CGRect(
                    x: center.x - innerBullRadius,
                    y: center.y - innerBullRadius,
                    width: innerBullRadius * 2,
                    height: innerBullRadius * 2
                )),
                with: .color(colors.wireColor),
                lineWidth: effects.wireWidth
            )

            // Draw spider (wire dividers) - thin lines (only within scoring area)
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
                    with: .color(colors.wireColor),
                    lineWidth: effects.wireWidth
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
                    with: .color(colors.wireColor),
                    lineWidth: effects.wireWidth
                )
            }

            // Draw neon glow effects for neon theme
            if effects.glowEffect, let neonPrimary = colors.neonPrimary {
                // Draw glowing wire overlay
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
                        with: .color(neonPrimary.opacity(glowIntensity * 0.8)),
                        lineWidth: effects.wireWidth * 2
                    )
                }

                // Glowing ring outlines
                for ringRadius in [outerBullRadius, tripleInner, tripleOuter, doubleInner, doubleOuter] {
                    context.stroke(
                        Path(ellipseIn: CGRect(
                            x: center.x - ringRadius,
                            y: center.y - ringRadius,
                            width: ringRadius * 2,
                            height: ringRadius * 2
                        )),
                        with: .color(neonPrimary.opacity(glowIntensity * 0.8)),
                        lineWidth: effects.wireWidth * 1.5
                    )
                }
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
        color: Color,
        wireColor: Color,
        wireWidth: CGFloat
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
        context.stroke(path, with: .color(wireColor), lineWidth: wireWidth)
    }
}

// MARK: - Mini Dartboard Preview (for theme selector)
struct MiniDartboardPreview: View {
    let themeId: DartboardThemeId
    var neonColor: NeonColorOption?
    var size: CGFloat = 120

    var body: some View {
        let theme = DartboardTheme.getTheme(by: themeId)
        let colors = theme.getColors(neonColor: neonColor)
        let effects = theme.effects

        Canvas { context, canvasSize in
            let center = CGPoint(x: canvasSize.width / 2, y: canvasSize.height / 2)
            let radius = min(canvasSize.width, canvasSize.height) / 2

            // Frame
            context.fill(
                Path(ellipseIn: CGRect(x: 0, y: 0, width: canvasSize.width, height: canvasSize.height)),
                with: .color(colors.frameColor)
            )

            // Number ring
            context.fill(
                Path(ellipseIn: CGRect(x: center.x - radius * 0.9, y: center.y - radius * 0.9, width: radius * 1.8, height: radius * 1.8)),
                with: .color(colors.numberRing)
            )

            // Chrome ring
            context.fill(
                Path(ellipseIn: CGRect(x: center.x - radius * 0.75, y: center.y - radius * 0.75, width: radius * 1.5, height: radius * 1.5)),
                with: .color(colors.chromeRing)
            )

            // Board background
            context.fill(
                Path(ellipseIn: CGRect(x: center.x - radius * 0.7, y: center.y - radius * 0.7, width: radius * 1.4, height: radius * 1.4)),
                with: .color(colors.boardBackground)
            )

            // Simplified segments (8 segments for preview)
            for i in 0..<8 {
                let angle = Double(i) * 45.0
                let nextAngle = angle + 45.0
                let startRadians = (90.0 - angle) * .pi / 180.0
                let endRadians = (90.0 - nextAngle) * .pi / 180.0

                let innerR = radius * 0.15
                let outerR = radius * 0.65

                let segmentColor = i % 2 == 0 ? colors.segmentPrimary : colors.segmentSecondary
                let ringColor = i % 2 == 0 ? colors.doubleTripleEven : colors.doubleTripleOdd

                // Draw segment
                var path = Path()
                path.move(to: CGPoint(x: center.x + cos(startRadians) * innerR, y: center.y + sin(startRadians) * innerR))
                path.addLine(to: CGPoint(x: center.x + cos(startRadians) * outerR, y: center.y + sin(startRadians) * outerR))
                path.addArc(center: center, radius: outerR, startAngle: Angle(degrees: 90.0 - angle), endAngle: Angle(degrees: 90.0 - nextAngle), clockwise: true)
                path.addLine(to: CGPoint(x: center.x + cos(endRadians) * innerR, y: center.y + sin(endRadians) * innerR))
                path.addArc(center: center, radius: innerR, startAngle: Angle(degrees: 90.0 - nextAngle), endAngle: Angle(degrees: 90.0 - angle), clockwise: false)
                path.closeSubpath()

                context.fill(path, with: .color(segmentColor))
                context.stroke(path, with: .color(colors.wireColor), lineWidth: effects.wireWidth * 0.5)

                // Draw double ring hint
                let doubleInnerR = outerR * 0.88
                var doublePath = Path()
                doublePath.addArc(center: center, radius: doubleInnerR, startAngle: Angle(degrees: 90.0 - angle), endAngle: Angle(degrees: 90.0 - nextAngle), clockwise: true)
                doublePath.addArc(center: center, radius: outerR, startAngle: Angle(degrees: 90.0 - nextAngle), endAngle: Angle(degrees: 90.0 - angle), clockwise: false)
                doublePath.closeSubpath()
                context.fill(doublePath, with: .color(ringColor))
            }

            // Outer bull
            context.fill(
                Path(ellipseIn: CGRect(x: center.x - radius * 0.15, y: center.y - radius * 0.15, width: radius * 0.3, height: radius * 0.3)),
                with: .color(colors.outerBull)
            )
            context.stroke(
                Path(ellipseIn: CGRect(x: center.x - radius * 0.15, y: center.y - radius * 0.15, width: radius * 0.3, height: radius * 0.3)),
                with: .color(colors.wireColor),
                lineWidth: effects.wireWidth * 0.5
            )

            // Inner bull
            context.fill(
                Path(ellipseIn: CGRect(x: center.x - radius * 0.08, y: center.y - radius * 0.08, width: radius * 0.16, height: radius * 0.16)),
                with: .color(colors.innerBull)
            )
            context.stroke(
                Path(ellipseIn: CGRect(x: center.x - radius * 0.08, y: center.y - radius * 0.08, width: radius * 0.16, height: radius * 0.16)),
                with: .color(colors.wireColor),
                lineWidth: effects.wireWidth * 0.5
            )

            // Neon glow rings for neon theme
            if effects.glowEffect, let neonPrimary = colors.neonPrimary {
                context.stroke(
                    Path(ellipseIn: CGRect(x: center.x - radius * 0.65, y: center.y - radius * 0.65, width: radius * 1.3, height: radius * 1.3)),
                    with: .color(neonPrimary.opacity(0.6)),
                    lineWidth: 1
                )
                context.stroke(
                    Path(ellipseIn: CGRect(x: center.x - radius * 0.15, y: center.y - radius * 0.15, width: radius * 0.3, height: radius * 0.3)),
                    with: .color(neonPrimary.opacity(0.6)),
                    lineWidth: 1
                )
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .shadow(
            color: themeId == .neonGlow ? (neonColor?.glowColor ?? .cyan.opacity(0.6)) : .black.opacity(0.3),
            radius: themeId == .neonGlow ? 10 : 5
        )
    }
}

#Preview {
    VStack(spacing: 20) {
        DartboardView(size: CGSize(width: 350, height: 350))
            .frame(width: 350, height: 350)

        HStack(spacing: 15) {
            ForEach(DartboardThemeId.allCases) { themeId in
                MiniDartboardPreview(themeId: themeId)
            }
        }
    }
    .background(Color(red: 0.1, green: 0.1, blue: 0.18))
}
