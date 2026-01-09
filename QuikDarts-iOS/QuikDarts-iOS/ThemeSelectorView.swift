import SwiftUI

struct ThemeSelectorView: View {
    @Binding var currentScreen: GameScreen
    @ObservedObject var themeManager: ThemeManager = ThemeManager.shared
    @State private var neonPulsePhase: Double = 0

    // Timer for neon pulse animation
    let timer = Timer.publish(every: 0.05, on: .main, in: .common).autoconnect()

    // Convenience init for preview
    init(currentScreen: Binding<GameScreen> = .constant(.themeSelector)) {
        self._currentScreen = currentScreen
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
                VStack(spacing: 25) {
                    // Header
                    HStack {
                        Text("🎨 CUSTOMIZE BOARD")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [Color(red: 1.0, green: 0.84, blue: 0.0), Color(red: 1.0, green: 0.93, blue: 0.29)],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .shadow(color: Color(red: 1.0, green: 0.84, blue: 0.0).opacity(0.5), radius: 10)

                        Spacer()

                        Button(action: { currentScreen = .menu }) {
                            Text("BACK")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(Color(red: 0.91, green: 0.84, blue: 0.72))
                                .padding(.horizontal, 20)
                                .padding(.vertical, 10)
                                .background(Color(red: 0.77, green: 0.12, blue: 0.23).opacity(0.3))
                                .cornerRadius(10)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.top, 20)

                    // Current Theme Preview
                    VStack(spacing: 15) {
                        Text("CURRENT THEME")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(Color(red: 1.0, green: 0.84, blue: 0.0))
                            .tracking(2)

                        Text("\(themeManager.currentTheme.icon) \(themeManager.currentTheme.name)")
                            .font(.system(size: 24, weight: .bold))
                            .foregroundColor(.white)

                        Text(themeManager.currentTheme.description)
                            .font(.system(size: 14))
                            .foregroundColor(.gray)

                        // Large preview
                        MiniDartboardPreview(
                            themeId: themeManager.selectedThemeId,
                            neonColor: themeManager.selectedNeonColor,
                            size: 180
                        )
                        .scaleEffect(1.2)
                        .padding(.vertical, 20)
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
                    .padding(.horizontal)

                    // Theme Selection
                    VStack(alignment: .leading, spacing: 15) {
                        Text("SELECT THEME")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(Color(red: 1.0, green: 0.84, blue: 0.0))
                            .tracking(2)
                            .padding(.horizontal)

                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 15) {
                            ForEach(DartboardTheme.allThemes) { theme in
                                ThemeCard(
                                    theme: theme,
                                    isSelected: themeManager.selectedThemeId == theme.id,
                                    neonColor: themeManager.selectedNeonColor
                                ) {
                                    themeManager.selectTheme(theme.id)
                                }
                            }
                        }
                        .padding(.horizontal)
                    }

                    // Neon Color Options (only for Neon Glow theme)
                    if themeManager.selectedThemeId == .neonGlow {
                        VStack(alignment: .leading, spacing: 15) {
                            Text("NEON COLOR")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(Color(red: 1.0, green: 0.84, blue: 0.0))
                                .tracking(2)

                            HStack(spacing: 12) {
                                ForEach(NeonColorOption.allCases) { option in
                                    NeonColorButton(
                                        option: option,
                                        isSelected: themeManager.selectedNeonColor == option
                                    ) {
                                        themeManager.selectNeonColor(option)
                                    }
                                }
                            }
                        }
                        .padding(20)
                        .background(
                            RoundedRectangle(cornerRadius: 15)
                                .fill(Color.white.opacity(0.05))
                        )
                        .padding(.horizontal)
                    }

                    // Info
                    Text("Your theme preference is saved automatically and synced across sessions.")
                        .font(.system(size: 14))
                        .foregroundColor(.gray)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 30)
                        .padding(.bottom, 30)
                }
            }
        }
        .preferredColorScheme(.dark)
        .onReceive(timer) { _ in
            if themeManager.currentTheme.effects.pulseAnimation {
                neonPulsePhase += 0.05
                if neonPulsePhase >= 2 * .pi {
                    neonPulsePhase = 0
                }
            }
        }
    }
}

// MARK: - Theme Card Component
struct ThemeCard: View {
    let theme: DartboardTheme
    let isSelected: Bool
    var neonColor: NeonColorOption?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 12) {
                // Mini preview
                MiniDartboardPreview(
                    themeId: theme.id,
                    neonColor: theme.id == .neonGlow ? neonColor : nil,
                    size: 100
                )

                // Theme icon
                Text(theme.icon)
                    .font(.system(size: 28))

                // Theme name
                Text(theme.name)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(isSelected ? Color(red: 1.0, green: 0.84, blue: 0.0) : .white)

                // Description
                Text(theme.description)
                    .font(.system(size: 11))
                    .foregroundColor(.gray)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)

                // Selected indicator
                if isSelected {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark")
                            .font(.system(size: 10, weight: .bold))
                        Text("SELECTED")
                            .font(.system(size: 10, weight: .bold))
                    }
                    .foregroundColor(Color(red: 0.2, green: 0.8, blue: 0.2))
                }
            }
            .padding(15)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 15)
                    .fill(isSelected ? Color(red: 1.0, green: 0.84, blue: 0.0).opacity(0.15) : Color.white.opacity(0.05))
                    .overlay(
                        RoundedRectangle(cornerRadius: 15)
                            .stroke(isSelected ? Color(red: 1.0, green: 0.84, blue: 0.0) : Color.white.opacity(0.1), lineWidth: 2)
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Neon Color Button Component
struct NeonColorButton: View {
    let option: NeonColorOption
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(option.displayName)
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(isSelected ? .black : option.color)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(isSelected ? option.color : Color.white.opacity(0.1))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(option.color, lineWidth: 2)
                        )
                )
                .shadow(color: isSelected ? option.color.opacity(0.5) : .clear, radius: 10)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

#Preview {
    ThemeSelectorView()
}
