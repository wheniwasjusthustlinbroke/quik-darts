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
        Group {
            switch currentScreen {
            case .menu:
                MenuView(
                    currentScreen: $currentScreen,
                    gameState: gameState
                )

            case .playing:
                GameView(
                    currentScreen: $currentScreen,
                    gameState: gameState
                )

            case .matchmaking:
                PlaceholderView(
                    title: "🌍 MATCHMAKING",
                    message: "Coming Soon",
                    onBack: { currentScreen = .menu }
                )

            case .practiceSelection:
                PracticeSelectionView(
                    currentScreen: $currentScreen,
                    gameState: gameState
                )

            case .achievements:
                PlaceholderView(
                    title: "🏆 ACHIEVEMENTS",
                    message: "Coming Soon",
                    onBack: { currentScreen = .menu }
                )
            }
        }
    }
}

// Placeholder view for screens not yet implemented
struct PlaceholderView: View {
    let title: String
    let message: String
    let onBack: () -> Void

    var body: some View {
        ZStack {
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
                Text(title)
                    .font(.system(size: 42, weight: .bold))
                    .foregroundColor(Color(red: 1.0, green: 0.84, blue: 0.0))

                Text(message)
                    .font(.system(size: 24, weight: .medium))
                    .foregroundColor(Color(red: 0.91, green: 0.84, blue: 0.72))

                Button(action: onBack) {
                    Text("BACK TO MENU")
                        .font(.system(size: 20, weight: .bold))
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
            }
        }
    }
}

#Preview {
    ContentView()
}
