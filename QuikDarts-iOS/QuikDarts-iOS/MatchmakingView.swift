import SwiftUI

struct MatchmakingView: View {
    @Binding var currentScreen: GameScreen
    @ObservedObject var gameState: GameStateManager
    @State private var isSearching: Bool = true
    @State private var opponentFound: Bool = false
    @State private var opponentName: String = ""
    @State private var opponentFlag: String = "🌍"
    @State private var rotationAngle: Double = 0

    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                colors: [Color(red: 0.1, green: 0.1, blue: 0.18), Color(red: 0.09, green: 0.13, blue: 0.24), Color(red: 0.06, green: 0.06, blue: 0.14)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                // Main content card
                VStack(spacing: 30) {
                    if isSearching && !opponentFound {
                        // SEARCHING STATE
                        // Spinning globe
                        Text("🌍")
                            .font(.system(size: 64))
                            .rotationEffect(.degrees(rotationAngle))
                            .onAppear {
                                withAnimation(.linear(duration: 2).repeatForever(autoreverses: false)) {
                                    rotationAngle = 360
                                }
                            }

                        // Title
                        Text("FINDING OPPONENT...")
                            .font(.system(size: 32, weight: .bold))
                            .foregroundColor(Color(red: 1.0, green: 0.84, blue: 0.0))
                            .tracking(3)

                        // Subtitle
                        Text("Searching for players worldwide")
                            .font(.system(size: 16))
                            .foregroundColor(Color(red: 0.91, green: 0.84, blue: 0.72))

                        // Pulsing dots
                        HStack(spacing: 10) {
                            ForEach(0..<3) { index in
                                Circle()
                                    .fill(Color(red: 0.29, green: 0.56, blue: 0.89))
                                    .frame(width: 12, height: 12)
                                    .scaleEffect(1.0)
                                    .animation(
                                        Animation.easeInOut(duration: 1.5)
                                            .repeatForever(autoreverses: true)
                                            .delay(Double(index) * 0.2),
                                        value: rotationAngle
                                    )
                                    .opacity(0.5)
                                    .animation(
                                        Animation.easeInOut(duration: 1.5)
                                            .repeatForever(autoreverses: true)
                                            .delay(Double(index) * 0.2),
                                        value: rotationAngle
                                    )
                            }
                        }
                        .padding(.vertical, 10)

                        // Cancel button
                        Button(action: {
                            cancelMatchmaking()
                        }) {
                            Text("CANCEL")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(Color(red: 0.91, green: 0.84, blue: 0.72))
                                .tracking(2)
                                .padding(.horizontal, 40)
                                .padding(.vertical, 15)
                                .background(Color.white.opacity(0.1))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10)
                                        .stroke(Color(red: 1.0, green: 0.84, blue: 0.0).opacity(0.3), lineWidth: 1)
                                )
                                .cornerRadius(10)
                        }

                    } else if opponentFound {
                        // OPPONENT FOUND STATE
                        // Checkmark
                        Text("✓")
                            .font(.system(size: 64))
                            .foregroundColor(Color(red: 0.20, green: 0.80, blue: 0.20))

                        // Title
                        Text("OPPONENT FOUND!")
                            .font(.system(size: 32, weight: .bold))
                            .foregroundColor(Color(red: 0.20, green: 0.80, blue: 0.20))
                            .tracking(3)

                        // Opponent info card
                        VStack(spacing: 10) {
                            Text(opponentFlag)
                                .font(.system(size: 40))

                            Text(opponentName)
                                .font(.system(size: 24, weight: .bold))
                                .foregroundColor(Color(red: 1.0, green: 0.84, blue: 0.0))
                        }
                        .padding(20)
                        .frame(maxWidth: .infinity)
                        .background(Color.white.opacity(0.05))
                        .cornerRadius(10)

                        // Starting game message
                        Text("Starting game...")
                            .font(.system(size: 16))
                            .foregroundColor(Color(red: 0.91, green: 0.84, blue: 0.72))
                    }
                }
                .padding(60)
                .frame(maxWidth: 500)
                .background(Color.white.opacity(0.05))
                .cornerRadius(20)
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(Color(red: 1.0, green: 0.84, blue: 0.0).opacity(0.2), lineWidth: 1)
                )
                .shadow(color: Color.black.opacity(0.3), radius: 20, x: 0, y: 10)

                Spacer()
            }
            .padding(.horizontal, 40)
        }
        .onAppear {
            // Simulate matchmaking process
            simulateMatchmaking()
        }
    }

    // Simulate matchmaking for demo purposes
    // In production, this would connect to Firebase/backend
    func simulateMatchmaking() {
        // After 3 seconds, "find" an opponent
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
            findOpponent()
        }
    }

    func findOpponent() {
        // Simulate finding a random opponent
        let sampleNames = ["DragonSlayer", "DartMaster", "BullseyeKing", "TripleT20", "Checkout170"]
        let sampleFlags = ["🇬🇧", "🇺🇸", "🇳🇱", "🇩🇪", "🇦🇺", "🇯🇵", "🇨🇦", "🇫🇷"]

        opponentName = sampleNames.randomElement() ?? "Opponent"
        opponentFlag = sampleFlags.randomElement() ?? "🌍"
        opponentFound = true

        // Start game after 1.5 seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            startOnlineGame()
        }
    }

    func startOnlineGame() {
        // In production, this would set up the online game with Firebase
        // For now, show alert that online mode is not fully implemented
        currentScreen = .menu
    }

    func cancelMatchmaking() {
        currentScreen = .menu
    }
}

#Preview {
    MatchmakingView(
        currentScreen: .constant(.matchmaking),
        gameState: GameStateManager()
    )
}
