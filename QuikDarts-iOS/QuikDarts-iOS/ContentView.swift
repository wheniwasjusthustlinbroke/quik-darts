//
//  ContentView.swift
//  QuikDarts
//
//  Main navigation and state management
//

import SwiftUI

enum GameScreen {
    case menu
    case playing
    case matchmaking
    case practiceSelection
    case achievements
}

struct ContentView: View {
    @StateObject private var gameState = GameStateManager()
    @State private var currentScreen: GameScreen = .menu

    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                colors: [
                    Color(red: 0.1, green: 0.1, blue: 0.18),
                    Color(red: 0.09, green: 0.13, blue: 0.24),
                    Color(red: 0.06, green: 0.06, blue: 0.14)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            // Screen routing
            Group {
                switch currentScreen {
                case .menu:
                    MenuView(
                        onStartGame: { startLocalGame() },
                        onPlayOnline: { currentScreen = .matchmaking },
                        onPracticeMode: { currentScreen = .practiceSelection },
                        onAchievements: { currentScreen = .achievements }
                    )

                case .playing:
                    GameView(gameState: gameState, onExit: { currentScreen = .menu })

                case .matchmaking:
                    MatchmakingView(
                        gameState: gameState,
                        onMatchFound: { currentScreen = .playing },
                        onCancel: { currentScreen = .menu }
                    )

                case .practiceSelection:
                    PracticeSelectionView(
                        onSelectSkill: { skill in
                            gameState.startPracticeMode(skillLevel: skill)
                            currentScreen = .playing
                        },
                        onCancel: { currentScreen = .menu }
                    )

                case .achievements:
                    AchievementsView(onBack: { currentScreen = .menu })
                }
            }
        }
    }

    private func startLocalGame() {
        gameState.startLocalGame()
        currentScreen = .playing
    }
}

#Preview {
    ContentView()
}
