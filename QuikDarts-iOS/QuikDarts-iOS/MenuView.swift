import SwiftUI

struct MenuView: View {
    @Binding var currentScreen: GameScreen
    @ObservedObject var gameState: GameStateManager

    @State private var gameMode: Int = 501
    @State private var player1Name: String = "Player 1"
    @State private var player2Name: String = "Player 2"
    @State private var player1Flag: String = "🏴"
    @State private var player2Flag: String = "🌍"

    let gameModes = [301, 501, 701]
    let flagOptions = ["🏴", "🇬🇧", "🇺🇸", "🇮🇪", "🇳🇱", "🇩🇪", "🇧🇪", "🇦🇺", "🇯🇵", "🌍"]

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

            VStack(spacing: 30) {
                // Title
                VStack(spacing: 10) {
                    Text("🎯")
                        .font(.system(size: 80))
                    Text("QUIK DARTS")
                        .font(.custom("Oswald-Bold", size: 52))
                        .fontWeight(.heavy)
                        .foregroundStyle(
                            LinearGradient(
                                colors: [Color(red: 1.0, green: 0.84, blue: 0.0), Color(red: 1.0, green: 0.93, blue: 0.29)],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .shadow(color: Color(red: 1.0, green: 0.84, blue: 0.0).opacity(0.5), radius: 20)
                }
                .padding(.top, 40)

                // Menu buttons container
                VStack(spacing: 15) {
                    // Start Game Button
                    MenuButton(
                        title: "🎯 START GAME",
                        gradient: [Color(red: 0.77, green: 0.12, blue: 0.23), Color(red: 0.91, green: 0.30, blue: 0.24)],
                        shadowColor: Color(red: 0.77, green: 0.12, blue: 0.23)
                    ) {
                        gameState.setupGame(
                            mode: gameMode,
                            player1Name: player1Name,
                            player2Name: player2Name,
                            player1Flag: player1Flag,
                            player2Flag: player2Flag
                        )
                        currentScreen = .playing
                    }

                    // Play Online Button
                    MenuButton(
                        title: "🌍 PLAY ONLINE",
                        gradient: [Color(red: 0.29, green: 0.56, blue: 0.89), Color(red: 0.21, green: 0.48, blue: 0.74)],
                        shadowColor: Color(red: 0.29, green: 0.56, blue: 0.89)
                    ) {
                        currentScreen = .matchmaking
                    }

                    // Practice Mode Button
                    MenuButton(
                        title: "🎯 PRACTICE MODE",
                        gradient: [Color(red: 0.61, green: 0.35, blue: 0.71), Color(red: 0.56, green: 0.27, blue: 0.68)],
                        shadowColor: Color(red: 0.61, green: 0.35, blue: 0.71)
                    ) {
                        currentScreen = .practiceSelection
                    }

                    // Achievements Button
                    MenuButton(
                        title: "🏆 ACHIEVEMENTS",
                        gradient: [Color(red: 0.95, green: 0.61, blue: 0.07), Color(red: 0.90, green: 0.49, blue: 0.13)],
                        shadowColor: Color(red: 0.95, green: 0.61, blue: 0.07)
                    ) {
                        currentScreen = .achievements
                    }

                    // Game Configuration
                    VStack(spacing: 20) {
                        // Game Mode Picker
                        VStack(alignment: .leading, spacing: 10) {
                            Text("GAME MODE")
                                .font(.custom("Oswald", size: 14))
                                .foregroundColor(Color(red: 1.0, green: 0.84, blue: 0.0))
                                .tracking(2)

                            HStack(spacing: 10) {
                                ForEach(gameModes, id: \.self) { mode in
                                    Button(action: {
                                        gameMode = mode
                                    }) {
                                        Text("\(mode)")
                                            .font(.custom("Oswald", size: 18))
                                            .fontWeight(.bold)
                                            .foregroundColor(gameMode == mode ? .white : Color(red: 0.91, green: 0.84, blue: 0.72).opacity(0.6))
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 12)
                                            .background(
                                                gameMode == mode ?
                                                LinearGradient(
                                                    colors: [Color(red: 0.77, green: 0.12, blue: 0.23), Color(red: 0.91, green: 0.30, blue: 0.24)],
                                                    startPoint: .leading,
                                                    endPoint: .trailing
                                                ) :
                                                LinearGradient(
                                                    colors: [Color.white.opacity(0.1), Color.white.opacity(0.1)],
                                                    startPoint: .leading,
                                                    endPoint: .trailing
                                                )
                                            )
                                            .cornerRadius(10)
                                    }
                                }
                            }
                        }

                        // Player 1 Configuration
                        PlayerConfigView(
                            playerNumber: 1,
                            name: $player1Name,
                            flag: $player1Flag,
                            flagOptions: flagOptions
                        )

                        // Player 2 Configuration
                        PlayerConfigView(
                            playerNumber: 2,
                            name: $player2Name,
                            flag: $player2Flag,
                            flagOptions: flagOptions
                        )
                    }
                    .padding(25)
                    .background(
                        RoundedRectangle(cornerRadius: 20)
                            .fill(Color.white.opacity(0.05))
                            .overlay(
                                RoundedRectangle(cornerRadius: 20)
                                    .stroke(Color(red: 1.0, green: 0.84, blue: 0.0).opacity(0.2), lineWidth: 1)
                            )
                    )
                    .background(.ultraThinMaterial.opacity(0.3))
                    .cornerRadius(20)
                }
                .padding(.horizontal, 30)

                Spacer()
            }
        }
    }
}

// Custom button component
struct MenuButton: View {
    let title: String
    let gradient: [Color]
    let shadowColor: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.custom("Oswald", size: 24))
                .fontWeight(.bold)
                .foregroundColor(.white)
                .tracking(4)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
                .background(
                    LinearGradient(
                        colors: gradient,
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .cornerRadius(15)
                .shadow(color: shadowColor.opacity(0.4), radius: 15)
        }
    }
}

// Player configuration component
struct PlayerConfigView: View {
    let playerNumber: Int
    @Binding var name: String
    @Binding var flag: String
    let flagOptions: [String]

    @State private var showFlagPicker = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("PLAYER \(playerNumber)")
                .font(.custom("Oswald", size: 14))
                .foregroundColor(Color(red: 1.0, green: 0.84, blue: 0.0))
                .tracking(2)

            HStack(spacing: 15) {
                // Flag picker button
                Button(action: {
                    showFlagPicker.toggle()
                }) {
                    Text(flag)
                        .font(.system(size: 32))
                        .frame(width: 60, height: 50)
                        .background(Color.white.opacity(0.1))
                        .cornerRadius(10)
                }
                .actionSheet(isPresented: $showFlagPicker) {
                    ActionSheet(
                        title: Text("Select Flag"),
                        buttons: flagOptions.map { selectedFlag in
                            .default(Text(selectedFlag)) {
                                flag = selectedFlag
                            }
                        } + [.cancel()]
                    )
                }

                // Name input
                TextField("Player \(playerNumber)", text: $name)
                    .font(.custom("Oswald", size: 18))
                    .foregroundColor(Color(red: 0.91, green: 0.84, blue: 0.72))
                    .padding()
                    .background(Color.white.opacity(0.1))
                    .cornerRadius(10)
                    .autocapitalization(.words)
                    .disableAutocorrection(true)
            }
        }
    }
}

#Preview {
    MenuView(
        currentScreen: .constant(.menu),
        gameState: GameStateManager()
    )
}
