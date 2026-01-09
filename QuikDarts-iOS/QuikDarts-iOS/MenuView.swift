import SwiftUI

// Country model for nationality selection
struct Country: Identifiable {
    var id: String { name }
    let name: String
    let flag: String
}

struct MenuView: View {
    @Binding var currentScreen: GameScreen
    @ObservedObject var gameState: GameStateManager

    @State private var gameMode: Int = 501
    @State private var legsPerSet: Int = 3 // 1, 3, 5, or 7
    @State private var setsToWin: Int = 1 // 1, 3, 5, or 7
    @State private var numberOfPlayers: Int = 2 // 1, 2, 3, or 4
    @State private var skillLevel: String = "intermediate" // beginner, intermediate, expert
    @State private var soundEnabled: Bool = false
    @State private var player1Name: String = "Player 1"
    @State private var player2Name: String = "Player 2"
    @State private var player3Name: String = "Player 3"
    @State private var player4Name: String = "Player 4"
    @State private var player1Flag: String = "🏴󠁧󠁢󠁥󠁮󠁧󠁿"
    @State private var player2Flag: String = "🇺🇸"
    @State private var player3Flag: String = "🇬🇧"
    @State private var player4Flag: String = "🇦🇺"
    // Player 1 can never be AI, so no player1IsAI state needed
    @State private var player2IsAI: Bool = false
    @State private var player3IsAI: Bool = false
    @State private var player4IsAI: Bool = false
    @State private var player2AIDifficulty: String = "medium"
    @State private var player3AIDifficulty: String = "medium"
    @State private var player4AIDifficulty: String = "medium"

    let gameModes = [301, 501]
    let legsOptions = [1, 3, 5, 7]
    let setsOptions = [1, 3, 5, 7]
    let playerOptions = [1, 2, 3, 4]
    let skillLevels = [
        ("beginner", "🟢"),
        ("intermediate", "🟡"),
        ("expert", "🔴")
    ]
    let countries = [
        Country(name: "Afghanistan", flag: "🇦🇫"),
        Country(name: "Albania", flag: "🇦🇱"),
        Country(name: "Algeria", flag: "🇩🇿"),
        Country(name: "Argentina", flag: "🇦🇷"),
        Country(name: "Armenia", flag: "🇦🇲"),
        Country(name: "Australia", flag: "🇦🇺"),
        Country(name: "Austria", flag: "🇦🇹"),
        Country(name: "Azerbaijan", flag: "🇦🇿"),
        Country(name: "Bahrain", flag: "🇧🇭"),
        Country(name: "Bangladesh", flag: "🇧🇩"),
        Country(name: "Belarus", flag: "🇧🇾"),
        Country(name: "Belgium", flag: "🇧🇪"),
        Country(name: "Bolivia", flag: "🇧🇴"),
        Country(name: "Bosnia", flag: "🇧🇦"),
        Country(name: "Brazil", flag: "🇧🇷"),
        Country(name: "Bulgaria", flag: "🇧🇬"),
        Country(name: "Cambodia", flag: "🇰🇭"),
        Country(name: "Canada", flag: "🇨🇦"),
        Country(name: "Chile", flag: "🇨🇱"),
        Country(name: "China", flag: "🇨🇳"),
        Country(name: "Colombia", flag: "🇨🇴"),
        Country(name: "Costa Rica", flag: "🇨🇷"),
        Country(name: "Croatia", flag: "🇭🇷"),
        Country(name: "Cuba", flag: "🇨🇺"),
        Country(name: "Cyprus", flag: "🇨🇾"),
        Country(name: "Czech Republic", flag: "🇨🇿"),
        Country(name: "Denmark", flag: "🇩🇰"),
        Country(name: "Ecuador", flag: "🇪🇨"),
        Country(name: "Egypt", flag: "🇪🇬"),
        Country(name: "England", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿"),
        Country(name: "Estonia", flag: "🇪🇪"),
        Country(name: "Ethiopia", flag: "🇪🇹"),
        Country(name: "Finland", flag: "🇫🇮"),
        Country(name: "France", flag: "🇫🇷"),
        Country(name: "Georgia", flag: "🇬🇪"),
        Country(name: "Germany", flag: "🇩🇪"),
        Country(name: "Ghana", flag: "🇬🇭"),
        Country(name: "Greece", flag: "🇬🇷"),
        Country(name: "Hong Kong", flag: "🇭🇰"),
        Country(name: "Hungary", flag: "🇭🇺"),
        Country(name: "Iceland", flag: "🇮🇸"),
        Country(name: "India", flag: "🇮🇳"),
        Country(name: "Indonesia", flag: "🇮🇩"),
        Country(name: "Iran", flag: "🇮🇷"),
        Country(name: "Iraq", flag: "🇮🇶"),
        Country(name: "Ireland", flag: "🇮🇪"),
        Country(name: "Israel", flag: "🇮🇱"),
        Country(name: "Italy", flag: "🇮🇹"),
        Country(name: "Jamaica", flag: "🇯🇲"),
        Country(name: "Japan", flag: "🇯🇵"),
        Country(name: "Jordan", flag: "🇯🇴"),
        Country(name: "Kazakhstan", flag: "🇰🇿"),
        Country(name: "Kenya", flag: "🇰🇪"),
        Country(name: "Kuwait", flag: "🇰🇼"),
        Country(name: "Latvia", flag: "🇱🇻"),
        Country(name: "Lebanon", flag: "🇱🇧"),
        Country(name: "Libya", flag: "🇱🇾"),
        Country(name: "Lithuania", flag: "🇱🇹"),
        Country(name: "Luxembourg", flag: "🇱🇺"),
        Country(name: "Malaysia", flag: "🇲🇾"),
        Country(name: "Malta", flag: "🇲🇹"),
        Country(name: "Mexico", flag: "🇲🇽"),
        Country(name: "Morocco", flag: "🇲🇦"),
        Country(name: "Nepal", flag: "🇳🇵"),
        Country(name: "Netherlands", flag: "🇳🇱"),
        Country(name: "New Zealand", flag: "🇳🇿"),
        Country(name: "Nigeria", flag: "🇳🇬"),
        Country(name: "North Korea", flag: "🇰🇵"),
        Country(name: "Northern Ireland", flag: "🇬🇧"),
        Country(name: "Norway", flag: "🇳🇴"),
        Country(name: "Pakistan", flag: "🇵🇰"),
        Country(name: "Palestine", flag: "🇵🇸"),
        Country(name: "Panama", flag: "🇵🇦"),
        Country(name: "Peru", flag: "🇵🇪"),
        Country(name: "Philippines", flag: "🇵🇭"),
        Country(name: "Poland", flag: "🇵🇱"),
        Country(name: "Portugal", flag: "🇵🇹"),
        Country(name: "Qatar", flag: "🇶🇦"),
        Country(name: "Romania", flag: "🇷🇴"),
        Country(name: "Russia", flag: "🇷🇺"),
        Country(name: "Saudi Arabia", flag: "🇸🇦"),
        Country(name: "Scotland", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿"),
        Country(name: "Senegal", flag: "🇸🇳"),
        Country(name: "Serbia", flag: "🇷🇸"),
        Country(name: "Singapore", flag: "🇸🇬"),
        Country(name: "Slovakia", flag: "🇸🇰"),
        Country(name: "Slovenia", flag: "🇸🇮"),
        Country(name: "South Africa", flag: "🇿🇦"),
        Country(name: "South Korea", flag: "🇰🇷"),
        Country(name: "Spain", flag: "🇪🇸"),
        Country(name: "Sri Lanka", flag: "🇱🇰"),
        Country(name: "Sweden", flag: "🇸🇪"),
        Country(name: "Switzerland", flag: "🇨🇭"),
        Country(name: "Syria", flag: "🇸🇾"),
        Country(name: "Taiwan", flag: "🇹🇼"),
        Country(name: "Thailand", flag: "🇹🇭"),
        Country(name: "Tunisia", flag: "🇹🇳"),
        Country(name: "Turkey", flag: "🇹🇷"),
        Country(name: "UAE", flag: "🇦🇪"),
        Country(name: "Uganda", flag: "🇺🇬"),
        Country(name: "Ukraine", flag: "🇺🇦"),
        Country(name: "United Kingdom", flag: "🇬🇧"),
        Country(name: "Uruguay", flag: "🇺🇾"),
        Country(name: "USA", flag: "🇺🇸"),
        Country(name: "Uzbekistan", flag: "🇺🇿"),
        Country(name: "Venezuela", flag: "🇻🇪"),
        Country(name: "Vietnam", flag: "🇻🇳"),
        Country(name: "Wales", flag: "🏴󠁧󠁢󠁷󠁬󠁳󠁿"),
        Country(name: "Yemen", flag: "🇾🇪"),
        Country(name: "Zimbabwe", flag: "🇿🇼")
    ]
    let aiDifficulties = ["easy", "medium", "hard", "impossible"]

    // Convert legs per set to legs to win (e.g., best of 3 = first to 2)
    var legsToWin: Int {
        return (legsPerSet + 1) / 2
    }

    // Get color for skill level
    func getSkillColor(for level: String) -> Color {
        switch level {
        case "beginner":
            return Color(red: 0.13, green: 0.54, blue: 0.13) // Green
        case "expert":
            return Color(red: 0.77, green: 0.12, blue: 0.23) // Red
        default: // intermediate
            return Color(red: 1.0, green: 0.65, blue: 0.0) // Orange
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
                            setsToWin: setsToWin,
                            numberOfPlayers: numberOfPlayers,
                            skillLevel: skillLevel,
                            soundEnabled: soundEnabled,
                            player1Name: player1Name,
                            player2Name: player2Name,
                            player1Flag: player1Flag,
                            player2Flag: player2Flag,
                            player1IsAI: false, // Player 1 is always human
                            player2IsAI: player2IsAI,
                            player1AIDifficulty: "medium", // Unused since Player 1 is never AI
                            player2AIDifficulty: player2AIDifficulty
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
                                            .font(.system(size: 18, weight: .bold))
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
                                            .font(.system(size: 18, weight: .bold))
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
                                            .font(.system(size: 18, weight: .bold))
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
                                        VStack(spacing: 6) {
                                            Text(level.1)
                                                .font(.system(size: 24))
                                            Text(level.0.uppercased())
                                                .font(.system(size: 10, weight: .bold))
                                                .lineLimit(1)
                                                .minimumScaleFactor(0.6)
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
                        if numberOfPlayers >= 1 {
                            PlayerConfigView(
                                playerNumber: 1,
                                name: $player1Name,
                                flag: $player1Flag,
                                countries: countries,
                                isAI: .constant(false), // Player 1 is always human
                                aiDifficulty: .constant("medium"), // Unused
                                aiDifficulties: aiDifficulties,
                                numberOfPlayers: numberOfPlayers
                            )
                        }

                        // Player 2 Configuration
                        if numberOfPlayers >= 2 {
                            PlayerConfigView(
                                playerNumber: 2,
                                name: $player2Name,
                                flag: $player2Flag,
                                countries: countries,
                                isAI: $player2IsAI,
                                aiDifficulty: $player2AIDifficulty,
                                aiDifficulties: aiDifficulties,
                                numberOfPlayers: numberOfPlayers
                            )
                        }

                        // Player 3 Configuration
                        if numberOfPlayers >= 3 {
                            PlayerConfigView(
                                playerNumber: 3,
                                name: $player3Name,
                                flag: $player3Flag,
                                countries: countries,
                                isAI: $player3IsAI,
                                aiDifficulty: $player3AIDifficulty,
                                aiDifficulties: aiDifficulties,
                                numberOfPlayers: numberOfPlayers
                            )
                        }

                        // Player 4 Configuration
                        if numberOfPlayers >= 4 {
                            PlayerConfigView(
                                playerNumber: 4,
                                name: $player4Name,
                                flag: $player4Flag,
                                countries: countries,
                                isAI: $player4IsAI,
                                aiDifficulty: $player4AIDifficulty,
                                aiDifficulties: aiDifficulties,
                                numberOfPlayers: numberOfPlayers
                            )
                        }
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
    let countries: [Country]
    @Binding var isAI: Bool
    @Binding var aiDifficulty: String
    let aiDifficulties: [String]
    let numberOfPlayers: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("PLAYER \(playerNumber)")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(red: 1.0, green: 0.84, blue: 0.0))
                .tracking(2)

            // Name input
            TextField("Player \(playerNumber)", text: Binding(
                get: { name },
                set: {
                    // Limit to 20 characters and remove dangerous characters
                    let sanitized = String($0.prefix(20)).replacingOccurrences(of: "<", with: "").replacingOccurrences(of: ">", with: "")
                    name = sanitized
                }
            ))
                .font(.system(size: 18, weight: .medium))
                .foregroundColor(Color(red: 0.91, green: 0.84, blue: 0.72))
                .padding()
                .background(Color.white.opacity(0.1))
                .cornerRadius(10)
                .autocapitalization(.words)
                .disableAutocorrection(true)

            // Nationality dropdown
            VStack(alignment: .leading, spacing: 8) {
                Text("NATIONALITY")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(Color(red: 0.53, green: 0.53, blue: 0.53))
                    .tracking(1)

                Picker("", selection: $flag) {
                    ForEach(countries) { country in
                        HStack {
                            Text("\(country.flag) \(country.name)")
                                .tag(country.flag)
                        }
                    }
                }
                .pickerStyle(.menu)
                .tint(Color(red: 0.91, green: 0.84, blue: 0.72))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .background(Color.white.opacity(0.1))
                .cornerRadius(10)
            }

            // AI Opponent Toggle (only shown for Player 2+ when numberOfPlayers > 1)
            if playerNumber > 1 && numberOfPlayers > 1 {
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
}

#Preview {
    MenuView(
        currentScreen: .constant(.menu),
        gameState: GameStateManager()
    )
}
