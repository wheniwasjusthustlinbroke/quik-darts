import SwiftUI

struct GameView: View {
    @Binding var currentScreen: GameScreen
    @ObservedObject var gameState: GameStateManager

    @State private var isPowerCharging = false
    @State private var power: Double = 0.0
    @State private var powerTimer: Timer?
    @GestureState private var isPressed = false

    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                gradient: Gradient(colors: [
                    Color(red: 0.1, green: 0.1, blue: 0.18),
                    Color(red: 0.09, green: 0.13, blue: 0.24),
                    Color(red: 0.06, green: 0.06, blue: 0.14)
                ]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                // Top bar with scores
                HStack {
                    // Back button
                    Button(action: {
                        currentScreen = .menu
                    }) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(Color(red: 0.91, green: 0.84, blue: 0.72))
                            .padding()
                    }

                    Spacer()

                    // Player scores
                    HStack(spacing: 20) {
                        PlayerScoreView(
                            name: gameState.player1Name,
                            flag: gameState.player1Flag,
                            score: gameState.player1Score,
                            legs: gameState.legScores[0],
                            legsToWin: gameState.legsToWin,
                            isActive: gameState.currentPlayer == 0
                        )

                        Text("VS")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(Color(red: 1.0, green: 0.84, blue: 0.0))

                        PlayerScoreView(
                            name: gameState.player2Name,
                            flag: gameState.player2Flag,
                            score: gameState.player2Score,
                            legs: gameState.legScores[1],
                            legsToWin: gameState.legsToWin,
                            isActive: gameState.currentPlayer == 1
                        )
                    }

                    Spacer()

                    // Placeholder for symmetry
                    Color.clear
                        .frame(width: 56, height: 56)
                }
                .padding(.horizontal)
                .padding(.top, 10)

                // Current turn info
                VStack(spacing: 5) {
                    Text("Darts: \(gameState.dartsThrown)/3")
                        .font(.custom("Oswald", size: 16))
                        .foregroundColor(Color(red: 0.91, green: 0.84, blue: 0.72))

                    if gameState.currentTurnScore > 0 {
                        Text("Turn: \(gameState.currentTurnScore)")
                            .font(.custom("Oswald", size: 20))
                            .fontWeight(.bold)
                            .foregroundColor(Color(red: 1.0, green: 0.84, blue: 0.0))
                    }

                    // Checkout suggestion
                    let currentScore = gameState.currentPlayer == 0 ? gameState.player1Score : gameState.player2Score
                    if let checkout = gameState.getCheckoutSuggestion(for: currentScore) {
                        Text("Checkout: \(checkout)")
                            .font(.custom("Oswald", size: 14))
                            .foregroundColor(Color(red: 0.4, green: 0.8, blue: 0.4))
                    }
                }
                .padding(.vertical, 10)

                Spacer()

                // Dartboard
                GeometryReader { geometry in
                    let size = min(geometry.size.width, geometry.size.height) * 0.85
                    let boardSize = CGSize(width: size, height: size)

                    VStack {
                        Spacer()

                        ZStack {
                            // Dartboard
                            DartboardView(size: boardSize)
                                .frame(width: boardSize.width, height: boardSize.height)

                            // Dart positions
                            ForEach(gameState.dartPositions) { dart in
                                Circle()
                                    .fill(Color.red)
                                    .frame(width: 8, height: 8)
                                    .position(dart.point)
                            }

                            // Power bar overlay (when charging)
                            if isPowerCharging {
                                VStack {
                                    Spacer()
                                    PowerBarView(power: power)
                                        .frame(height: 40)
                                        .padding(.bottom, 30)
                                }
                            }
                        }
                        .frame(width: boardSize.width, height: boardSize.height)
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .updating($isPressed) { _, state, _ in
                                    state = true
                                }
                                .onChanged { _ in
                                    if !isPowerCharging {
                                        startPowerCharging()
                                    }
                                }
                                .onEnded { value in
                                    throwDart(at: value.location, in: boardSize)
                                }
                        )
                        .onChange(of: isPressed) { pressed in
                            if !pressed && isPowerCharging {
                                stopPowerCharging()
                            }
                        }

                        Spacer()
                    }
                    .frame(width: geometry.size.width, height: geometry.size.height)
                }

                Spacer()

                // Throw history
                if !gameState.throwHistory[gameState.currentPlayer].isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(Array(gameState.throwHistory[gameState.currentPlayer].enumerated()), id: \.offset) { index, throwDesc in
                                Text(throwDesc)
                                    .font(.custom("Oswald", size: 14))
                                    .foregroundColor(Color(red: 0.91, green: 0.84, blue: 0.72))
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 6)
                                    .background(Color.white.opacity(0.1))
                                    .cornerRadius(8)
                            }
                        }
                        .padding(.horizontal)
                    }
                    .frame(height: 40)
                    .padding(.bottom, 10)
                }
            }

            // Winner overlay
            if let winner = gameState.winner {
                WinnerOverlay(
                    winnerName: winner == 0 ? gameState.player1Name : gameState.player2Name,
                    winnerFlag: winner == 0 ? gameState.player1Flag : gameState.player2Flag,
                    onRematch: {
                        gameState.resetGame()
                    },
                    onMenu: {
                        currentScreen = .menu
                    }
                )
            }
        }
    }

    private func startPowerCharging() {
        isPowerCharging = true
        power = 0.0

        // Haptic feedback
        let impact = UIImpactFeedbackGenerator(style: .light)
        impact.impactOccurred()

        // Start power charging animation
        powerTimer = Timer.scheduledTimer(withTimeInterval: 0.016, repeats: true) { _ in
            power += 0.02
            if power >= 1.0 {
                power = 0.0 // Loop back
            }

            // Haptic feedback at intervals
            if power.truncatingRemainder(dividingBy: 0.2) < 0.02 {
                let impact = UIImpactFeedbackGenerator(style: .light)
                impact.impactOccurred()
            }
        }
    }

    private func stopPowerCharging() {
        powerTimer?.invalidate()
        powerTimer = nil
        isPowerCharging = false

        // Heavy haptic feedback on release
        let impact = UIImpactFeedbackGenerator(style: .heavy)
        impact.impactOccurred()
    }

    private func throwDart(at point: CGPoint, in size: CGSize) {
        stopPowerCharging()

        // Apply power-based accuracy variance
        let variance = (1.0 - power) * 20.0 // Max 20 points variance at minimum power
        let randomX = Double.random(in: -variance...variance)
        let randomY = Double.random(in: -variance...variance)

        let adjustedPoint = CGPoint(
            x: point.x + randomX,
            y: point.y + randomY
        )

        gameState.throwDart(at: adjustedPoint, in: size)

        // Success haptic feedback
        let notification = UINotificationFeedbackGenerator()
        notification.notificationOccurred(.success)
    }
}

// Player score component
struct PlayerScoreView: View {
    let name: String
    let flag: String
    let score: Int
    let legs: Int
    let legsToWin: Int
    let isActive: Bool

    var body: some View {
        VStack(spacing: 5) {
            Text(flag)
                .font(.system(size: 28))

            Text(name)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(red: 0.91, green: 0.84, blue: 0.72))
                .lineLimit(1)

            Text("\(score)")
                .font(.system(size: 32, weight: .bold))
                .foregroundColor(isActive ? Color(red: 1.0, green: 0.84, blue: 0.0) : .white)

            HStack(spacing: 3) {
                ForEach(0..<7) { index in
                    if index < legsToWin {
                        Circle()
                            .fill(index < legs ? Color(red: 1.0, green: 0.84, blue: 0.0) : Color.gray.opacity(0.3))
                            .frame(width: 8, height: 8)
                    }
                }
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 15)
                .fill(Color.white.opacity(isActive ? 0.15 : 0.05))
                .overlay(
                    RoundedRectangle(cornerRadius: 15)
                        .stroke(isActive ? Color(red: 1.0, green: 0.84, blue: 0.0) : Color.clear, lineWidth: 2)
                )
        )
    }
}

// Power bar component
struct PowerBarView: View {
    let power: Double

    var body: some View {
        VStack(spacing: 5) {
            Text("POWER: \(Int(power * 100))%")
                .font(.custom("Oswald", size: 14))
                .fontWeight(.bold)
                .foregroundColor(.white)

            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    // Background
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color.black.opacity(0.5))

                    // Power fill
                    RoundedRectangle(cornerRadius: 10)
                        .fill(
                            LinearGradient(
                                colors: [
                                    Color(red: 0.77, green: 0.12, blue: 0.23),
                                    Color(red: 0.91, green: 0.30, blue: 0.24),
                                    Color(red: 1.0, green: 0.84, blue: 0.0)
                                ],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: geometry.size.width * power)
                }
            }
            .frame(height: 20)
        }
        .padding(.horizontal, 40)
    }
}

// Winner overlay
struct WinnerOverlay: View {
    let winnerName: String
    let winnerFlag: String
    let onRematch: () -> Void
    let onMenu: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.8)
                .ignoresSafeArea()

            VStack(spacing: 30) {
                Text(winnerFlag)
                    .font(.system(size: 80))

                Text("\(winnerName) WINS!")
                    .font(.custom("Oswald", size: 48, relativeTo: .largeTitle))
                    .fontWeight(.bold)
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color(red: 1.0, green: 0.84, blue: 0.0), Color(red: 1.0, green: 0.93, blue: 0.29)],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .shadow(color: Color(red: 1.0, green: 0.84, blue: 0.0).opacity(0.5), radius: 20)

                HStack(spacing: 20) {
                    Button(action: onRematch) {
                        Text("REMATCH")
                            .font(.custom("Oswald", size: 20, relativeTo: .title3))
                            .fontWeight(.bold)
                            .foregroundColor(.white)
                            .padding(.horizontal, 40)
                            .padding(.vertical, 15)
                            .background(
                                LinearGradient(
                                    colors: [Color(red: 0.77, green: 0.12, blue: 0.23), Color(red: 0.91, green: 0.30, blue: 0.24)],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .cornerRadius(15)
                    }

                    Button(action: onMenu) {
                        Text("MENU")
                            .font(.custom("Oswald", size: 20, relativeTo: .title3))
                            .fontWeight(.bold)
                            .foregroundColor(.white)
                            .padding(.horizontal, 40)
                            .padding(.vertical, 15)
                            .background(Color.white.opacity(0.2))
                            .cornerRadius(15)
                    }
                }
            }
            .padding(40)
            .background(
                RoundedRectangle(cornerRadius: 30)
                    .fill(Color(red: 0.1, green: 0.1, blue: 0.18))
                    .overlay(
                        RoundedRectangle(cornerRadius: 30)
                            .stroke(Color(red: 1.0, green: 0.84, blue: 0.0), lineWidth: 2)
                    )
            )
        }
    }
}

#Preview {
    GameView(
        currentScreen: .constant(.playing),
        gameState: GameStateManager()
    )
}
