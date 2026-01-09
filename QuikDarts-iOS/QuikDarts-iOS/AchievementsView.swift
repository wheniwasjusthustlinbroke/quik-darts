import SwiftUI

// Achievement model
struct Achievement: Identifiable {
    let id: String
    let name: String
    let description: String
    let icon: String
    let rarity: String
    let mode: String
    var isUnlocked: Bool = false
}

struct AchievementsView: View {
    @Binding var currentScreen: GameScreen

    // All 21 achievements matching the web version
    let achievements = [
        // First Steps
        Achievement(id: "first_game", name: "First Game", description: "Complete your first game", icon: "🎯", rarity: "common", mode: "offline"),
        Achievement(id: "first_win", name: "First Victory", description: "Win your first game", icon: "🏆", rarity: "common", mode: "offline"),

        // 180 Achievements
        Achievement(id: "first_180", name: "Maximum!", description: "Hit your first 180", icon: "💯", rarity: "uncommon", mode: "offline"),
        Achievement(id: "ten_180s", name: "180 Master", description: "Hit 10 total 180s", icon: "⭐", rarity: "rare", mode: "offline"),
        Achievement(id: "fifty_180s", name: "Ton Machine", description: "Hit 50 total 180s", icon: "🌟", rarity: "epic", mode: "offline"),

        // Nine Darter Achievements
        Achievement(id: "nine_darter_offline", name: "Perfect Game", description: "Achieve a nine-dart finish in offline mode", icon: "👑", rarity: "legendary", mode: "offline"),
        Achievement(id: "nine_darter_online", name: "Online Legend", description: "Achieve a nine-dart finish in online mode", icon: "💎", rarity: "mythic", mode: "online"),

        // Bulls Achievements
        Achievement(id: "first_bull", name: "Bullseye!", description: "Hit your first bullseye", icon: "🎯", rarity: "common", mode: "offline"),
        Achievement(id: "fifty_bulls", name: "Bull Master", description: "Hit 50 bullseyes", icon: "🐂", rarity: "rare", mode: "offline"),
        Achievement(id: "hundred_bulls", name: "Bull Legend", description: "Hit 100 bullseyes", icon: "🐃", rarity: "epic", mode: "offline"),

        // Winning Streaks
        Achievement(id: "five_wins", name: "Hot Streak", description: "Win 5 games", icon: "🔥", rarity: "uncommon", mode: "offline"),
        Achievement(id: "twenty_wins", name: "Dominator", description: "Win 20 games", icon: "💪", rarity: "rare", mode: "offline"),
        Achievement(id: "fifty_wins", name: "Champion", description: "Win 50 games", icon: "🥇", rarity: "epic", mode: "offline"),

        // Online Achievements
        Achievement(id: "first_online", name: "Going Online", description: "Play your first online match", icon: "🌍", rarity: "common", mode: "online"),
        Achievement(id: "first_online_win", name: "Online Victor", description: "Win your first online match", icon: "🏅", rarity: "uncommon", mode: "online"),
        Achievement(id: "ten_online_wins", name: "Online Warrior", description: "Win 10 online matches", icon: "⚔️", rarity: "rare", mode: "online"),
        Achievement(id: "fifty_online_wins", name: "Online Champion", description: "Win 50 online matches", icon: "👑", rarity: "epic", mode: "online"),

        // Checkout Achievements
        Achievement(id: "big_checkout", name: "Big Fish", description: "Hit a checkout of 100 or more", icon: "🐋", rarity: "uncommon", mode: "offline"),
        Achievement(id: "huge_checkout", name: "Monster Checkout", description: "Hit a checkout of 150 or more", icon: "🦈", rarity: "rare", mode: "offline"),

        // Skill Achievements
        Achievement(id: "fifty_triples", name: "Triple Threat", description: "Hit 50 triples", icon: "3️⃣", rarity: "uncommon", mode: "offline"),
        Achievement(id: "two_hundred_triples", name: "Triple Master", description: "Hit 200 triples", icon: "💫", rarity: "rare", mode: "offline")
    ]

    var unlockedCount: Int {
        achievements.filter { $0.isUnlocked }.count
    }

    var totalCount: Int {
        achievements.count
    }

    var body: some View {
        ZStack {
            // Background
            LinearGradient(
                colors: [Color(red: 0.1, green: 0.1, blue: 0.18), Color(red: 0.05, green: 0.05, blue: 0.12)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                // Header
                HStack {
                    Spacer()

                    Text("🏆 ACHIEVEMENTS")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundColor(Color(red: 1.0, green: 0.84, blue: 0.0))
                        .tracking(3)

                    Spacer()
                }
                .padding(.top, 60)
                .padding(.bottom, 20)

                // Back button
                HStack {
                    Button(action: {
                        currentScreen = .menu
                    }) {
                        Text("BACK")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 25)
                            .padding(.vertical, 12)
                            .background(Color(red: 0.77, green: 0.12, blue: 0.23))
                            .cornerRadius(8)
                    }
                    Spacer()
                }
                .padding(.horizontal, 25)
                .padding(.bottom, 20)

                // Progress bar
                VStack(alignment: .leading, spacing: 8) {
                    Text("Unlocked: \(unlockedCount) / \(totalCount)")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Color(red: 1.0, green: 0.84, blue: 0.0))

                    GeometryReader { geometry in
                        ZStack(alignment: .leading) {
                            Rectangle()
                                .fill(Color.white.opacity(0.1))
                                .frame(height: 8)
                                .cornerRadius(4)

                            Rectangle()
                                .fill(Color(red: 1.0, green: 0.84, blue: 0.0))
                                .frame(width: geometry.size.width * CGFloat(unlockedCount) / CGFloat(totalCount), height: 8)
                                .cornerRadius(4)
                        }
                    }
                    .frame(height: 8)
                }
                .padding(.horizontal, 25)
                .padding(.bottom, 20)

                // Achievements grid
                ScrollView {
                    LazyVGrid(columns: [
                        GridItem(.flexible(), spacing: 15),
                        GridItem(.flexible(), spacing: 15)
                    ], spacing: 15) {
                        ForEach(achievements) { achievement in
                            AchievementCard(achievement: achievement)
                        }
                    }
                    .padding(.horizontal, 25)
                    .padding(.bottom, 30)
                }
            }
        }
    }
}

// Achievement card component
struct AchievementCard: View {
    let achievement: Achievement

    // Color for rarity badge
    var rarityColor: Color {
        switch achievement.rarity {
        case "common":
            return Color(red: 0.6, green: 0.6, blue: 0.6)
        case "uncommon":
            return Color(red: 0.13, green: 0.70, blue: 0.29)
        case "rare":
            return Color(red: 0.25, green: 0.52, blue: 0.96)
        case "epic":
            return Color(red: 0.64, green: 0.21, blue: 0.93)
        case "legendary":
            return Color(red: 1.0, green: 0.84, blue: 0.0)
        case "mythic":
            return Color(red: 1.0, green: 0.27, blue: 0.0)
        default:
            return Color.gray
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Icon
            Text(achievement.icon)
                .font(.system(size: 36))
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.top, 15)

            // Name
            Text(achievement.name)
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.white)
                .lineLimit(1)
                .padding(.horizontal, 10)

            // Description
            Text(achievement.description)
                .font(.system(size: 11))
                .foregroundColor(Color(red: 0.7, green: 0.7, blue: 0.7))
                .lineLimit(2)
                .frame(height: 32)
                .padding(.horizontal, 10)

            // Badges
            HStack(spacing: 5) {
                // Rarity badge
                Text(achievement.rarity.uppercased())
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(rarityColor)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(rarityColor.opacity(0.2))
                    .cornerRadius(3)

                // Mode badge
                Text(achievement.mode.uppercased())
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(Color(red: 0.29, green: 0.56, blue: 0.89))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(Color(red: 0.29, green: 0.56, blue: 0.89).opacity(0.2))
                    .cornerRadius(3)
            }
            .padding(.horizontal, 10)

            Spacer()

            // Locked status
            HStack {
                Image(systemName: "lock.fill")
                    .font(.system(size: 10))
                    .foregroundColor(Color(red: 0.5, green: 0.5, blue: 0.5))

                Text("LOCKED")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(Color(red: 0.5, green: 0.5, blue: 0.5))
            }
            .padding(.horizontal, 10)
            .padding(.bottom, 10)
        }
        .frame(height: 200)
        .background(Color.white.opacity(0.05))
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.white.opacity(0.1), lineWidth: 1)
        )
        .opacity(achievement.isUnlocked ? 1.0 : 0.6)
    }
}

#Preview {
    AchievementsView(currentScreen: .constant(.achievements))
}
