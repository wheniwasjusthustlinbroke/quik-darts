import SwiftUI

struct PracticeSelectionView: View {
    @Binding var currentScreen: GameScreen
    @ObservedObject var gameState: GameStateManager

    // Start practice session with selected skill level
    func startPractice(skillLevel: Int) {
        gameState.startPracticeGame(skillLevel: skillLevel)
        currentScreen = .playing
    }

    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                colors: [Color(red: 0.1, green: 0.1, blue: 0.18), Color(red: 0.09, green: 0.13, blue: 0.24), Color(red: 0.06, green: 0.06, blue: 0.14)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                // Header and back button container
                VStack(spacing: 20) {
                    // Icon
                    Text("🎯")
                        .font(.system(size: 64))

                    // Title
                    Text("PRACTICE MODE")
                        .font(.system(size: 32, weight: .bold))
                        .foregroundColor(Color(red: 0.61, green: 0.35, blue: 0.71))
                        .tracking(3)

                    // Subtitle
                    Text("Select your skill level")
                        .font(.system(size: 16))
                        .foregroundColor(Color(red: 0.91, green: 0.84, blue: 0.72))
                }
                .padding(.top, 80)
                .padding(.bottom, 40)

                // Skill level buttons
                VStack(spacing: 15) {
                    // Beginner button
                    Button(action: {
                        startPractice(skillLevel: 30)
                    }) {
                        HStack(spacing: 10) {
                            Text("🟢")
                                .font(.system(size: 24))
                            Text("BEGINNER")
                                .font(.system(size: 20, weight: .bold))
                                .foregroundColor(.white)
                                .tracking(2)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 20)
                        .background(
                            LinearGradient(
                                colors: [Color(red: 0.13, green: 0.54, blue: 0.13), Color(red: 0.20, green: 0.80, blue: 0.20)],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .cornerRadius(10)
                        .shadow(color: Color(red: 0.13, green: 0.54, blue: 0.13).opacity(0.4), radius: 15, x: 0, y: 4)
                    }

                    // Intermediate button
                    Button(action: {
                        startPractice(skillLevel: 60)
                    }) {
                        HStack(spacing: 10) {
                            Text("🟡")
                                .font(.system(size: 24))
                            Text("INTERMEDIATE")
                                .font(.system(size: 20, weight: .bold))
                                .foregroundColor(.white)
                                .tracking(2)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 20)
                        .background(
                            LinearGradient(
                                colors: [Color(red: 1.0, green: 0.65, blue: 0.0), Color(red: 1.0, green: 0.72, blue: 0.20)],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .cornerRadius(10)
                        .shadow(color: Color(red: 1.0, green: 0.65, blue: 0.0).opacity(0.4), radius: 15, x: 0, y: 4)
                    }

                    // Expert button
                    Button(action: {
                        startPractice(skillLevel: 90)
                    }) {
                        HStack(spacing: 10) {
                            Text("🔴")
                                .font(.system(size: 24))
                            Text("EXPERT")
                                .font(.system(size: 20, weight: .bold))
                                .foregroundColor(.white)
                                .tracking(2)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 20)
                        .background(
                            LinearGradient(
                                colors: [Color(red: 0.77, green: 0.12, blue: 0.23), Color(red: 0.91, green: 0.30, blue: 0.24)],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .cornerRadius(10)
                        .shadow(color: Color(red: 0.77, green: 0.12, blue: 0.23).opacity(0.4), radius: 15, x: 0, y: 4)
                    }
                }
                .padding(.horizontal, 40)

                Spacer()

                // Back button
                Button(action: {
                    currentScreen = .menu
                }) {
                    Text("BACK TO MENU")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                        .padding(.horizontal, 40)
                        .padding(.vertical, 15)
                        .background(Color.white.opacity(0.1))
                        .cornerRadius(10)
                }
                .padding(.bottom, 60)
            }
        }
    }
}

#Preview {
    PracticeSelectionView(
        currentScreen: .constant(.practiceSelection),
        gameState: GameStateManager()
    )
}
