//
//  QuikDartsApp.swift
//  QuikDarts
//
//  Native iOS Darts Game
//  Championship Edition
//

import SwiftUI
// TODO: Add Firebase when implementing online multiplayer
// import FirebaseCore

@main
struct QuikDartsApp: App {

    init() {
        // TODO: Configure Firebase when implementing online multiplayer
        // FirebaseApp.configure()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(.dark) // Force dark mode for game aesthetic
        }
    }
}
