import SwiftUI

struct MenuView: View {
    @Binding var currentScreen: GameScreen
    @ObservedObject var gameState: GameStateManager

    @State private var gameMode: Int = 501
    @State private var legsPerSet: Int = 3 // 1, 3, 5, or 7
    @State private var setsToWin: Int = 1 // 1, 3, 5, or 7
    @State private var numberOfPlayers: Int = 2 // 1, 2, 3, or 4
    @State private var skillLevel: String = "intermediate" // easy, intermediate, hard
    @State private var soundEnabled: Bool = false
    @State private var player1Name: String = "Player 1"
    @State private var player2Name: String = "Player 2"
    @State private var player1Flag: String = "🏴"
    @State private var player2Flag: String = "🌍"
    @State private var player1IsAI: Bool = false
    @State private var player2IsAI: Bool = false
    @State private var player1AIDifficulty: String = "medium"
    @State private var player2AIDifficulty: String = "medium"

    let gameModes = [301, 501]
    let legsOptions = [1, 3, 5, 7]
    let setsOptions = [1, 3, 5, 7]
    let playerOptions = [1, 2, 3, 4]
    let skillLevels = [
        ("easy", "🟢"),
        ("intermediate", "🟡"),
        ("hard", "🔴")
    ]
    let flagOptions = ["🏴", "🇬🇧", "🇺🇸", "🇮🇪", "🇳🇱", "🇩🇪", "🇧🇪", "🇦🇺", "🇯🇵", "🌍"]
    let aiDifficulties = ["easy", "medium", "hard", "impossible"]

    // Convert legs per set to legs to win (e.g., best of 3 = first to 2)
    var legsToWin: Int {
        return (legsPerSet + 1) / 2
    }

    // Get color for skill level
    func getSkillColor(for level: String) -> Color {
        switch level {
        case "easy":
            return Color(red: 0.4, green: 0.8, blue: 0.4)
        case "hard":
            return Color(red: 0.85, green: 0.1, blue: 0.1)
        default: // intermediate
            return Color(red: 0.95, green: 0.61, blue: 0.07)
        }
    }

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

            ScrollView {
                VStack(spacing: 30) {
                    // Title
                    VStack(spacing: 10) {
                    Text("🎯")
                        .font(.system(size: 80))
                    Text("QUIK DARTS")
                        .font(.system(size: 52, weight: .bold))
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
                            legsToWin: legsToWin,
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
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(Color(red: 1.0, green: 0.84, blue: 0.0))
                                .tracking(2)

                            HStack(spacing: 10) {
                                ForEach(gameModes, id: \.self) { mode in
                                    Button(action: {
                                        gameMode = mode
                                    }) {
                                        Text("\(mode)")
                                            .font(.system(size: 18, weight: .bold))
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

                        // Legs Per Set Picker
                        VStack(alignment: .leading, spacing: 10) {
                            Text("LEGS PER SET")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(Color(red: 1.0, green: 0.84, blue: 0.0))
                                .tracking(2)

                            HStack(spacing: 10) {
                                ForEach(legsOptions, id: \.self) { legs in
                                    Button(action: {
                                        legsPerSet = legs
                                    }) {
                                        Text("\(legs)")
                                            .font(.system(size: 18, weight: .medium))
                                            .fontWeight(.bold)
                                            .foregroundColor(legsPerSet == legs ? Color(red: 0.1, green: 0.1, blue: 0.18) : Color(red: 0.91, green: 0.84, blue: 0.72).opacity(0.6))
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 12)
                                            .background(
                                                legsPerSet == legs ?
                                                Color(red: 1.0, green: 0.84, blue: 0.0) :
                                                Color.white.opacity(0.1)
                                            )
                                            .cornerRadius(10)
                                    }
                                }
                            }
                        }

                        // Sets To Win Picker
                        VStack(alignment: .leading, spacing: 10) {
                            Text("SETS TO WIN")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(Color(red: 1.0, green: 0.84, blue: 0.0))
                                .tracking(2)

                            HStack(spacing: 10) {
                                ForEach(setsOptions, id: \.self) { sets in
                                    Button(action: {
                                        setsToWin = sets
                                    }) {
                                        Text("\(sets)")
                                            .font(.system(size: 18, weight: .medium))
                                            .fontWeight(.bold)
                                            .foregroundColor(setsToWin == sets ? Color(red: 0.1, green: 0.1, blue: 0.18) : Color(red: 0.91, green: 0.84, blue: 0.72).opacity(0.6))
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 12)
                                            .background(
                                                setsToWin == sets ?
                                                Color(red: 1.0, green: 0.84, blue: 0.0) :
                                                Color.white.opacity(0.1)
                                            )
                                            .cornerRadius(10)
                                    }
                                }
                            }
                        }

                        // Number of Players Picker
                        VStack(alignment: .leading, spacing: 10) {
                            Text("NUMBER OF PLAYERS")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(Color(red: 1.0, green: 0.84, blue: 0.0))
                                .tracking(2)

                            HStack(spacing: 10) {
                                ForEach(playerOptions, id: \.self) { players in
                                    Button(action: {
                                        numberOfPlayers = players
                                    }) {
                                        Text("\(players)")
                                            .font(.system(size: 18, weight: .medium))
                                            .fontWeight(.bold)
                                            .foregroundColor(numberOfPlayers == players ? Color(red: 0.1, green: 0.1, blue: 0.18) : Color(red: 0.91, green: 0.84, blue: 0.72).opacity(0.6))
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 12)
                                            .background(
                                                numberOfPlayers == players ?
                                                Color(red: 1.0, green: 0.84, blue: 0.0) :
                                                Color.white.opacity(0.1)
                                            )
                                            .cornerRadius(10)
                                    }
                                }
                            }
                        }

                        // Skill Level Picker
                        VStack(alignment: .leading, spacing: 10) {
                            Text("SKILL LEVEL")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(Color(red: 1.0, green: 0.84, blue: 0.0))
                                .tracking(2)

                            HStack(spacing: 10) {
                                ForEach(skillLevels, id: \.0) { level in
                                    Button(action: {
                                        skillLevel = level.0
                                    }) {
                                        HStack(spacing: 8) {
                                            Text(level.1)
                                                .font(.system(size: 20))
                                            Text(level.0.uppercased())
                                                .font(.system(size: 14, weight: .medium))
                                                .fontWeight(.bold)
                                        }
                                        .foregroundColor(skillLevel == level.0 ? .white : Color(red: 0.91, green: 0.84, blue: 0.72).opacity(0.6))
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 12)
                                        .background(
                                            skillLevel == level.0 ?
                                            getSkillColor(for: level.0) :
                                            Color.white.opacity(0.1)
                                        )
                                        .cornerRadius(10)
                                    }
                                }
                            }
                        }

                        // Sound Effects Toggle
                        HStack {
                            Text("SOUND EFFECTS")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(Color(red: 1.0, green: 0.84, blue: 0.0))
                                .tracking(2)

                            Spacer()

                            Toggle("", isOn: $soundEnabled)
                                .labelsHidden()
                                .tint(Color(red: 1.0, green: 0.84, blue: 0.0))
                        }
                        .padding(.vertical, 8)

                        // Player 1 Configuration
                        PlayerConfigView(
                            playerNumber: 1,
                            name: $player1Name,
                            flag: $player1Flag,
                            flagOptions: flagOptions,
                            isAI: $player1IsAI,
                            aiDifficulty: $player1AIDifficulty,
                            aiDifficulties: aiDifficulties
                        )

                        // Player 2 Configuration
                        PlayerConfigView(
                            playerNumber: 2,
                            name: $player2Name,
                            flag: $player2Flag,
                            flagOptions: flagOptions,
                            isAI: $player2IsAI,
                            aiDifficulty: $player2AIDifficulty,
                            aiDifficulties: aiDifficulties
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
                .padding(.bottom, 30)
                }
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
                .font(.system(size: 24, weight: .bold))
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
    @Binding var isAI: Bool
    @Binding var aiDifficulty: String
    let aiDifficulties: [String]

    @State private var showFlagPicker = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("PLAYER \(playerNumber)")
                .font(.system(size: 14, weight: .medium))
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
                    .font(.system(size: 18, weight: .medium))
                    .foregroundColor(Color(red: 0.91, green: 0.84, blue: 0.72))
                    .padding()
                    .background(Color.white.opacity(0.1))
                    .cornerRadius(10)
                    .autocapitalization(.words)
                    .disableAutocorrection(true)
            }

            // AI Opponent Toggle
            HStack {
                Text("AI OPPONENT")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Color(red: 0.53, green: 0.53, blue: 0.53))
                    .tracking(1)

                Spacer()

                Button(action: {
                    isAI.toggle()
                    if isAI && aiDifficulty.isEmpty {
                        aiDifficulty = "medium"
                    }
                }) {
                    Text(isAI ? "ON" : "OFF")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 8)
                        .background(isAI ? Color(red: 0.15, green: 0.6, blue: 0.2) : Color.white.opacity(0.1))
                        .cornerRadius(8)
                }
            }
            .padding(.top, 5)

            // AI Difficulty Selector (only shown when AI is ON)
            if isAI {
                VStack(alignment: .leading, spacing: 8) {
                    Text("DIFFICULTY")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Color(red: 0.53, green: 0.53, blue: 0.53))
                        .tracking(1)

                    HStack(spacing: 6) {
                        ForEach(aiDifficulties, id: \.self) { difficulty in
                            Button(action: {
                                aiDifficulty = difficulty
                            }) {
                                Text(difficulty.uppercased())
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundColor(aiDifficulty == difficulty ? Color(red: 0.1, green: 0.1, blue: 0.18) : Color(red: 0.91, green: 0.84, blue: 0.72).opacity(0.6))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 10)
                                    .background(
                                        aiDifficulty == difficulty ?
                                        Color(red: 1.0, green: 0.84, blue: 0.0) :
                                        Color.white.opacity(0.1)
                                    )
                                    .cornerRadius(8)
                            }
                        }
                    }
                }
                .padding(.top, 5)
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
