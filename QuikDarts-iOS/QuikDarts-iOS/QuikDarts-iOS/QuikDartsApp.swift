//
//  QuikDartsApp.swift
//  QuikDarts
//
//  Native iOS Darts Game
//  Championship Edition
//

import SwiftUI
import FirebaseCore

@main
struct QuikDartsApp: App {

    init() {
        // Configure Firebase
        FirebaseApp.configure()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(.dark) // Force dark mode for game aesthetic
        }
    }
}
