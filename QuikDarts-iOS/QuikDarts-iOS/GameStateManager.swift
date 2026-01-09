import SwiftUI
import Combine

class GameStateManager: ObservableObject {
    // Game configuration
    @Published var gameMode: Int = 501
    @Published var player1Name: String = "Player 1"
    @Published var player2Name: String = "Player 2"
    @Published var player1Flag: String = "🏴"
    @Published var player2Flag: String = "🌍"

    // Game state
    @Published var player1Score: Int = 501
    @Published var player2Score: Int = 501
    @Published var currentPlayer: Int = 0 // 0 = player1, 1 = player2
    @Published var dartsThrown: Int = 0
    @Published var currentTurnScore: Int = 0
    @Published var throwHistory: [[String]] = [[], []] // History for each player
    @Published var dartPositions: [DartPosition] = []

    // Match state
    @Published var legScores: [Int] = [0, 0] // Legs won by each player
    @Published var setScores: [Int] = [0, 0] // Sets won by each player
    @Published var winner: Int? = nil

    // Power charging (for throwing)
    @Published var isPowerCharging: Bool = false
    @Published var power: Double = 0.0

    // Online multiplayer
    @Published var isOnlineMode: Bool = false
    @Published var gameRoomId: String? = nil
    @Published var opponentName: String? = nil
    @Published var opponentFlag: String? = nil

    // Practice mode
    @Published var practiceMode: String? = nil // "180", "bull", "random"
    @Published var practiceStats: PracticeStats = PracticeStats()

    // Dartboard segments
    let segments = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]

    // Constants
    let outerBull: Double = 16
    let innerBull: Double = 8

    func setupGame(mode: Int, player1Name: String, player2Name: String, player1Flag: String, player2Flag: String) {
        self.gameMode = mode
        self.player1Name = player1Name
        self.player2Name = player2Name
        self.player1Flag = player1Flag
        self.player2Flag = player2Flag

        // Reset game state
        player1Score = mode
        player2Score = mode
        currentPlayer = 0
        dartsThrown = 0
        currentTurnScore = 0
        throwHistory = [[], []]
        dartPositions = []
        legScores = [0, 0]
        setScores = [0, 0]
        winner = nil
        isOnlineMode = false
    }

    func throwDart(at point: CGPoint, in size: CGSize) {
        // Calculate center of dartboard
        let center = CGPoint(x: size.width / 2, y: size.height / 2)

        // Calculate distance from center
        let dx = point.x - center.x
        let dy = point.y - center.y
        let distance = sqrt(dx * dx + dy * dy)

        // Dartboard dimensions (normalized to 170mm standard)
        let boardRadius = min(size.width, size.height) / 2
        let scale = boardRadius / 170.0

        // Ring boundaries (in mm, then scaled)
        let innerBullRadius = innerBull * scale
        let outerBullRadius = outerBull * scale
        let tripleInner = 99 * scale
        let tripleOuter = 107 * scale
        let doubleInner = 162 * scale
        let doubleOuter = 170 * scale

        var score = 0
        var multiplier = 1
        var description = "MISS"

        // Check if dart hit the board
        if distance <= boardRadius {
            // Calculate angle (0° = 3 o'clock, increases counterclockwise)
            var angle = atan2(dy, dx) * 180 / .pi
            if angle < 0 { angle += 360 }

            // Adjust angle to start from top (12 o'clock)
            angle = (angle + 90)
            if angle >= 360 { angle -= 360 }

            // Bulls
            if distance <= innerBullRadius {
                score = 50
                description = "DOUBLE BULL"
            } else if distance <= outerBullRadius {
                score = 25
                description = "SINGLE BULL"
            } else if distance <= doubleOuter {
                // Calculate which segment (20 segments, each 18°)
                let segmentIndex = Int((angle + 9) / 18) % 20
                let segmentValue = segments[segmentIndex]

                // Determine ring
                if distance >= doubleInner && distance <= doubleOuter {
                    score = segmentValue * 2
                    multiplier = 2
                    description = "DOUBLE \(segmentValue)"
                } else if distance >= tripleInner && distance <= tripleOuter {
                    score = segmentValue * 3
                    multiplier = 3
                    description = "TRIPLE \(segmentValue)"
                } else {
                    score = segmentValue
                    description = "\(segmentValue)"
                }
            }
        }

        // Add dart position for visualization
        dartPositions.append(DartPosition(point: point, score: score))

        // Update game state
        processDartThrow(score: score, description: description, multiplier: multiplier)
    }

    private func processDartThrow(score: Int, description: String, multiplier: Int) {
        dartsThrown += 1
        currentTurnScore += score

        // Add to throw history
        throwHistory[currentPlayer].append(description)

        // Check for bust or win
        let currentScore = currentPlayer == 0 ? player1Score : player2Score
        let newScore = currentScore - currentTurnScore

        // End of turn (3 darts thrown)
        if dartsThrown >= 3 {
            if newScore == 0 && multiplier == 2 {
                // Valid checkout (must end on double)
                finishLeg(winner: currentPlayer)
            } else if newScore < 0 || (newScore == 0 && multiplier != 2) || newScore == 1 {
                // Bust: score goes below 0, hits exactly 0 without double, or leaves 1
                bustTurn()
            } else {
                // Valid turn, update score
                if currentPlayer == 0 {
                    player1Score = newScore
                } else {
                    player2Score = newScore
                }
                nextPlayer()
            }
        } else if newScore == 0 && multiplier == 2 {
            // Early checkout (less than 3 darts)
            finishLeg(winner: currentPlayer)
        } else if newScore < 0 || newScore == 1 {
            // Immediate bust on first or second dart
            bustTurn()
        } else {
            // Continue turn, update running score
            if currentPlayer == 0 {
                player1Score = newScore
            } else {
                player2Score = newScore
            }
        }
    }

    private func bustTurn() {
        // Bust - score remains unchanged, just switch players
        if currentPlayer == 0 {
            player1Score = player1Score + currentTurnScore // Restore original score
        } else {
            player2Score = player2Score + currentTurnScore
        }
        nextPlayer()
    }

    private func nextPlayer() {
        currentPlayer = currentPlayer == 0 ? 1 : 0
        dartsThrown = 0
        currentTurnScore = 0
        dartPositions = []
    }

    private func finishLeg(winner: Int) {
        legScores[winner] += 1

        // Check if match is won (best of 5 legs = first to 3)
        if legScores[winner] >= 3 {
            self.winner = winner
        } else {
            // Reset for next leg
            player1Score = gameMode
            player2Score = gameMode
            currentPlayer = 0
            dartsThrown = 0
            currentTurnScore = 0
            throwHistory = [[], []]
            dartPositions = []
        }
    }

    func resetGame() {
        player1Score = gameMode
        player2Score = gameMode
        currentPlayer = 0
        dartsThrown = 0
        currentTurnScore = 0
        throwHistory = [[], []]
        dartPositions = []
        legScores = [0, 0]
        setScores = [0, 0]
        winner = nil
        dartPositions = []
    }

    // Calculate suggested checkouts
    func getCheckoutSuggestion(for score: Int) -> String? {
        if score > 170 { return nil }

        let checkouts: [Int: String] = [
            170: "T20 → T20 → Bull",
            167: "T20 → T19 → Bull",
            164: "T20 → T18 → Bull",
            161: "T20 → T17 → Bull",
            160: "T20 → T20 → D20",
            158: "T20 → T20 → D19",
            157: "T20 → T19 → D20",
            156: "T20 → T20 → D18",
            155: "T20 → T19 → D19",
            154: "T20 → T18 → D20",
            153: "T20 → T19 → D18",
            152: "T20 → T20 → D16",
            151: "T20 → T17 → D20",
            150: "T20 → T18 → D18",
            // Add more checkouts as needed
            50: "D25 (Bull)",
            40: "D20",
            32: "D16"
        ]

        return checkouts[score]
    }
}

// Helper struct for dart positions
struct DartPosition: Identifiable {
    let id = UUID()
    let point: CGPoint
    let score: Int
}

// Practice mode stats
struct PracticeStats {
    var dartsThrown: Int = 0
    var totalScore: Int = 0
    var bulls: Int = 0
    var ton80s: Int = 0
    var triples: Int = 0
}
